import { NextRequest } from 'next/server'
import { recordEmailEvent } from '@/lib/bcps-email-tracking'

// The open pixel for tracked emails (src/lib/bcps-email-tracking.ts). Always
// returns the image, whatever the token, so a bad token reveals nothing.
export const dynamic = 'force-dynamic'
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params
  try { await recordEmailEvent(token, 'open', req.headers.get('user-agent')) } catch { /* never fail the image */ }
  return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } })
}
