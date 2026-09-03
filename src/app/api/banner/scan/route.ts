import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { analyzeBannerImage } from '@/lib/bannerVision'

// Client-side pre-flight for the automated Photo Content Requirements check
// (see lib/bannerVision.ts for the why/what). Called from BannerWidget the
// instant a WCM picks an image, so they see Pass/needs-attention before they
// even reach the submit button. /api/banner/submit re-runs the same check
// server-side before accepting - this route is for fast feedback only and is
// never itself trusted as the final gate.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

async function verifyCaller(token: string) {
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { file_base64, mime_type } = body as { file_base64?: string; mime_type?: string }
  if (!file_base64 || !mime_type) {
    return NextResponse.json({ error: 'file_base64 and mime_type are required' }, { status: 400 })
  }
  if (mime_type.startsWith('video')) {
    return NextResponse.json({ no_overlays_pass: true, nav_clearance_pass: true, reasons: [], skipped: true })
  }

  const match = file_base64.match(/^data:([a-zA-Z0-9/.+-]+);base64,(.+)$/)
  const raw = match ? match[2] : file_base64
  const result = await analyzeBannerImage({ base64: raw, mediaType: mime_type })
  return NextResponse.json(result)
}
