// src/app/api/bcps/brief-raw/[slug]/route.ts
// Serves a brief's stored HTML as a real document (scripts execute), for
// briefs that carry interactive content. The /briefs/[slug] page renders
// static briefs inline via dangerouslySetInnerHTML - which never executes
// <script> tags - and iframes this endpoint when the brief is interactive.
// Access rules are identical to /briefs/[slug]: public unless
// bcps_brief_recipients has rows for the slug, in which case the session
// email must match a recipient.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const db = serviceClient()
  if (!db) return new NextResponse('Not found', { status: 404 })

  const { data: recipients } = await db
    .from('bcps_brief_recipients')
    .select('attendee_email')
    .eq('brief_slug', slug)

  if (recipients && recipients.length > 0) {
    const sessionEmail = await getSessionEmail()
    const allowed = recipients.map((r: { attendee_email: string }) => r.attendee_email.toLowerCase())
    if (!sessionEmail || !allowed.includes(sessionEmail.toLowerCase())) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const { data, error } = await db
    .from('mock_pages')
    .select('content')
    .eq('brand', 'bcps')
    .eq('surface', 'brief')
    .eq('slug', slug)
    .single()

  if (error || !data) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(data.content, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
    },
  })
}
