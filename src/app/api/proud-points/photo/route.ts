import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { svc, requireProudPointsAccess, ACCESS_ERROR, ownerFolder, clientIp, rateLimited, LIMITS } from '@/lib/proudPointsApi'
import { analyzeBannerImage } from '@/lib/bannerVision'
import {
  PHOTO_ALLOWED_MIME, PHOTO_MAX_BYTES, PHOTO_MIN_HEIGHT, PHOTO_MIN_WIDTH,
} from '@/lib/proudPoints'

// Step 2 of attaching a background photo: the server checks the uploaded file
// itself, so the rule cannot be skipped from the browser (the banner app only
// checks pixel size client-side). Pixel size from sharp, plus the banner
// content scan (lib/bannerVision.ts). The verdict is stored in
// bcps_proud_point_photos; submit only accepts a photo with a passing row.
//
// Text found in the photo does not block it either: OCR cannot tell a sign in the
// scene from an overlay, so the photo is flagged for the District Web Team,
// as banners are. A failed pixel check or a scan that ran and found an overlay
// refuses the photo and deletes it.

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const { file_path, mime_type } = (await req.json().catch(() => ({}))) as { file_path?: string; mime_type?: string }
  if (!file_path || !file_path.startsWith(ownerFolder(me.owner)) || file_path.includes('..')) {
    return NextResponse.json({ error: 'Invalid file path.' }, { status: 400 })
  }
  if (!mime_type || !PHOTO_ALLOWED_MIME[mime_type]) return NextResponse.json({ error: 'Photo must be PNG or JPG.' }, { status: 400 })
  const ip = clientIp(req)
  if (me.via === 'guest' && await rateLimited('bcps_proud_point_photos', ip, LIMITS.photos)) {
    return NextResponse.json({ error: 'Too many photos from this connection in the last hour. Please try again later.' }, { status: 429 })
  }

  const bucket = svc.storage.from('bcps-client')
  const { data: blob, error } = await bucket.download(file_path)
  if (error || !blob) return NextResponse.json({ error: 'The photo did not finish uploading. Please try again.' }, { status: 400 })

  const refuse = async (reason: string, extra: Record<string, unknown> = {}) => {
    await bucket.remove([file_path]).catch(() => {})
    await svc.from('bcps_proud_point_photos').upsert({
      path: file_path, wcm_user_id: me.userId, owner_email: me.owner, client_ip: ip, mime_type, bytes: blob.size, ok: false, refused_reason: reason, ...extra,
    })
    return NextResponse.json({ ok: false, error: reason, ...extra }, { status: 400 })
  }

  if (blob.size > PHOTO_MAX_BYTES) return refuse(`Photo too large (max ${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MB).`)

  const buf = Buffer.from(await blob.arrayBuffer())
  let width = 0
  let height = 0
  try {
    // autoOrient: a phone photo taken upright reports its stored (sideways)
    // size otherwise.
    const meta = await sharp(buf).metadata()
    const swap = (meta.orientation ?? 1) >= 5
    width = (swap ? meta.height : meta.width) ?? 0
    height = (swap ? meta.width : meta.height) ?? 0
  } catch {
    return refuse('This file could not be read as an image.')
  }
  if (width < PHOTO_MIN_WIDTH || height < PHOTO_MIN_HEIGHT) {
    return refuse(`Photo is ${width} x ${height}. It needs to be at least ${PHOTO_MIN_WIDTH} x ${PHOTO_MIN_HEIGHT} pixels.`, { width, height })
  }
  if (height > width) return refuse('Use a horizontal (landscape) photo.', { width, height })

  let scan = await analyzeBannerImage({ base64: buf.toString('base64'), mediaType: mime_type })
  if (scan.error) {
    // Same fail-open rule as banners: a scanner outage is not a violation.
    scan = { no_overlays_pass: true, nav_clearance_pass: true, reasons: [], skipped: true, error: scan.error }
  } else if (!scan.no_overlays_pass) {
    return refuse('This photo has a border, frame, or graphic added to it. Use a clean photo; your data point, heading and caption go on top of it.', { width, height, content_scan: scan })
  }

  const { error: upErr } = await svc.from('bcps_proud_point_photos').upsert({
    path: file_path, wcm_user_id: me.userId, owner_email: me.owner, client_ip: ip, mime_type, bytes: blob.size, width, height, content_scan: scan, ok: true, refused_reason: null,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, width, height, text_detected: !!scan.text_detected })
}
