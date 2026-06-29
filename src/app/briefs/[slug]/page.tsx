// src/app/briefs/[slug]/page.tsx
// BCPS briefs route. Public by default.
// If bcps_brief_recipients has rows for this slug, requires authenticated session with matching email.

import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { headers, cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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
    if (!sessionEmail || !allowed.includes(sessionEmail.toLowerCase())) {
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

  return (
    <div
      style={{ minHeight: '100vh', background: '#fff' }}
      suppressHydrationWarning
    >
      <div dangerouslySetInnerHTML={{ __html: data.content }} />
    </div>
  )
}
