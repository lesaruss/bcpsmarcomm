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
export const fetchCache = 'force-no-store'

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
  req: NextRequest,
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
    .select('content, title, updated_at')
    .eq('brand', 'bcps')
    .eq('surface', 'brief')
    .eq('slug', slug)
    .single()

  if (error || !data) return new NextResponse('Not found', { status: 404 })

  // Health-check branch (2026-08-17, BCPS-BRIEF-RAW-STALE-CACHE incident):
  // proves in one request whether a "stale content" report is a real caching
  // problem or the render pointing at a different Supabase project/row than
  // whoever edited the content thinks they edited. Never returns the brief
  // body, so it is safe to leave in place as a standing diagnostic.
  if (req.nextUrl.searchParams.get('debug') === '1') {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseHost = (() => {
      try { return new URL(supabaseUrl).hostname } catch { return 'unset' }
    })()
    return NextResponse.json(
      {
        slug,
        title: data.title,
        updated_at: data.updated_at,
        content_length: data.content.length,
        content_sha256_prefix: (await sha256HexPrefix(data.content, 12)),
        supabase_host: supabaseHost,
        served_at: new Date().toISOString(),
        deployment_sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  return new NextResponse(data.content, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}

async function sha256HexPrefix(input: string, len: number): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, len)
}
