// src/app/briefs/[slug]/page.tsx
// BCPS briefs route. Public by default.
// If bcps_brief_recipients has rows for this slug, requires authenticated session with matching email.
// Admin bypass (2026-08-28, Logan): wcm_cert_users.is_admin=true always passes, regardless of
// whether that admin's email is on the slug's recipient list. This is the behavior the bcps-brief
// skill has documented as Hard Rule 2 since it was written; the route code never implemented it,
// which bounced an admin (Sean, contact@lesaruss.com) to /login on a brief he was never added to
// as a named recipient. See error_registry BCPS-BRIEF-ADMIN-BYPASS-MISSING.

import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props {
  params: Promise<{ slug: string }>
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function getSessionEmail(): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null

    const cookieStore = await cookies()
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    })
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  } catch {
    return null
  }
}

async function isAdminEmail(email: string | null): Promise<boolean> {
  if (!email) return false
  const db = serviceClient()
  if (!db) return false
  try {
    const { data } = await db
      .from('wcm_cert_users')
      .select('is_admin')
      .ilike('email', email)
      .eq('is_admin', true)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return { title: `${slug} | BCPS Brief` }
}

export default async function BcpsPublicBriefPage({ params }: Props) {
  const { slug } = await params
  await headers()

  const db = serviceClient()
  if (!db) notFound()

  // Check if this brief has restricted recipients
  const { data: recipients } = await db
    .from('bcps_brief_recipients')
    .select('attendee_email')
    .eq('brief_slug', slug)

  const isRestricted = recipients && recipients.length > 0

  if (isRestricted) {
    const sessionEmail = await getSessionEmail()
    const allowed = recipients.map((r: { attendee_email: string }) => r.attendee_email.toLowerCase())
    const onList = !!sessionEmail && allowed.includes(sessionEmail.toLowerCase())
    if (!onList && !(await isAdminEmail(sessionEmail))) {
      redirect(`/login?next=/briefs/${slug}`)
    }
  }

  const { data, error } = await db
    .from('mock_pages')
    .select('title, content, updated_at')
    .eq('brand', 'bcps')
    .eq('surface', 'brief')
    .eq('slug', slug)
    .single()

  if (error || !data) notFound()

  // Interactive briefs (inline <script>) can't render via dangerouslySetInnerHTML -
  // React never executes injected script tags, so the page would load but its
  // data/logic would silently never run (seen 2026-08-13 on the OOC Web Team
  // Assignments brief). Serve those as a real document through brief-raw instead.
  if (data.content.includes('<script')) {
    return (
      <iframe
        src={`/api/bcps/brief-raw/${slug}`}
        title={data.title ?? slug}
        style={{ display: 'block', border: 'none', width: '100%', height: '100vh' }}
      />
    )
  }

  return (
    <div
      style={{ minHeight: '100vh', background: '#fff' }}
      suppressHydrationWarning
    >
      <div dangerouslySetInnerHTML={{ __html: data.content }} />
    </div>
  )
}
