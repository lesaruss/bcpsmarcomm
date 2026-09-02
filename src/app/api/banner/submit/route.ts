import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// WCM Banner Submission App - New Upload.
// Mirrors the src/app/api/cert/upload/route.ts pattern: caller verified via
// their own bearer token, file stored in the private bcps-client bucket
// under a path scoped to the caller's own user id, service-role client does
// the actual write. Scoped strictly to WCMs (any signed-in bcpsmarcomm.com
// user may submit - there is no separate WCM role gate today, matching how
// the rest of the WCM dashboard works; Sean confirmed only WCMs use this
// tool in practice).
//
// Spec, confirmed by Sean + Vanessa Deslandes 2026-08-24/2026-09-02:
// - image target 2880x1600, 2000x800 floor; video MP4 only, max 30s, 1080p
//   recommended (not 4K) - dimensions/duration are checked client-side by the
//   widget (it has the actual pixel data), this route re-checks byte size and
//   MIME/extension only.
// - up to 3 submissions per request (the widget calls this route up to 3x)
// - each submission requires banner_title, alt_text; banner_caption optional
// - checklist_ack: the 4 required acknowledgement checkboxes, verbatim from
//   the source mockup, must all be true or the submission is rejected here
//   too (defense in depth - the widget already blocks submit client-side).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

const MAX_BYTES = 60 * 1024 * 1024 // generous ceiling for a <=30s 1080p mp4
const ALLOWED_MIME: Record<string, { ext: string; kind: 'image' | 'video' }> = {
  'image/png': { ext: 'png', kind: 'image' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'video/mp4': { ext: 'mp4', kind: 'video' },
}

const REQUIRED_ACK_KEYS = ['media_release', 'no_overlays', 'nav_visibility', 'final_ack'] as const

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
  const {
    file_base64, file_name, mime_type,
    banner_title, banner_caption, alt_text,
    checklist_ack,
  } = body as {
    file_base64?: string; file_name?: string; mime_type?: string
    banner_title?: string; banner_caption?: string; alt_text?: string
    checklist_ack?: Record<string, boolean>
  }

  if (!file_base64 || !file_name || !mime_type) {
    return NextResponse.json({ error: 'file_base64, file_name, and mime_type are required' }, { status: 400 })
  }
  if (!banner_title?.trim()) return NextResponse.json({ error: 'Banner title is required' }, { status: 400 })
  if (!alt_text?.trim()) return NextResponse.json({ error: 'Alternative text is required' }, { status: 400 })

  const missingAck = REQUIRED_ACK_KEYS.filter(k => checklist_ack?.[k] !== true)
  if (missingAck.length > 0) {
    return NextResponse.json({ error: 'All requirement checkboxes must be acknowledged before submitting.', missing: missingAck }, { status: 400 })
  }

  const spec = ALLOWED_MIME[mime_type]
  if (!spec) return NextResponse.json({ error: 'File must be PNG, JPG, or MP4.' }, { status: 400 })

  const match = file_base64.match(/^data:([a-zA-Z0-9/.+-]+);base64,(.+)$/)
  const raw = match ? match[2] : file_base64
  const buffer = Buffer.from(raw, 'base64')
  if (buffer.length > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${Math.round(MAX_BYTES / 1024 / 1024)}MB).` }, { status: 400 })
  }

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `banner-submissions/${user.id}/${Date.now()}-${safeName}`

  const { error: uploadErr } = await svc.storage.from('bcps-client').upload(path, buffer, {
    contentType: mime_type,
    upsert: false,
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: row, error: insertErr } = await svc.from('bcps_banner_submissions').insert({
    wcm_user_id: user.id,
    wcm_email: user.email,
    type: 'upload',
    status: 'pending',
    file_path: path,
    file_name: safeName,
    file_type: spec.kind,
    banner_title: banner_title.trim(),
    banner_caption: banner_caption?.trim() || null,
    alt_text: alt_text.trim(),
    checklist_ack: { ...checklist_ack, acked_at: new Date().toISOString() },
  }).select('id').single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: row.id })
}
