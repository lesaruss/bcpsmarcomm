import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { trackerHtml, fetchStaticTracker } from '@/lib/web-team-tracker'

// Web Team Assignments with rows added by meeting transcript uploads merged in
// (2026-10-21). Same audience as the static file it wraps, which is public, so
// this needs no sign-in either. If the database read fails the plain file is
// served rather than an error page.
export const dynamic = 'force-dynamic'

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  let html: string
  try {
    html = await trackerHtml(svc, origin)
  } catch (e) {
    console.error('web-team-assignments-html: merge failed', e)
    try { html = await fetchStaticTracker(origin) } catch { return NextResponse.redirect(new URL('/bcps-web-team-assignments.html', origin)) }
  }
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
}
