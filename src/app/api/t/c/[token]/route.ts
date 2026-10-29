import { NextRequest, NextResponse } from 'next/server'
import { recordEmailEvent } from '@/lib/bcps-email-tracking'
import { SITE } from '@/lib/bcps-portal-account'

// The tracked link for tracked emails (src/lib/bcps-email-tracking.ts): counts
// the click, then sends the reader on. ?to= is a path on bcpsmarcomm.com only,
// so this can never redirect off the site.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  const to = req.nextUrl.searchParams.get('to') || '/'
  const path = to.startsWith('/') && !to.startsWith('//') && !to.includes('\\') ? to : '/'
  try { await recordEmailEvent(token, 'click', req.headers.get('user-agent')) } catch { /* never block the redirect */ }
  return NextResponse.redirect(`${SITE}${path}`, 302)
}
