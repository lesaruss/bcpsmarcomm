import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR, ownerFolder } from '@/lib/proudPointsApi'
import { PHOTO_ALLOWED_MIME, PHOTO_MAX_BYTES } from '@/lib/proudPoints'

// Step 1 of attaching a background photo: a one-time signed URL so the browser
// sends the file straight to the private bcps-client bucket (Vercel refuses a
// function body over 4.5 MB; same reason as /api/banner/upload-url). The path
// is scoped to the caller; /api/proud-points/photo only checks paths under it.

export async function POST(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const { file_name, mime_type, size } = (await req.json().catch(() => ({}))) as { file_name?: string; mime_type?: string; size?: number }
  if (!file_name || !mime_type) return NextResponse.json({ error: 'file_name and mime_type are required' }, { status: 400 })
  if (!PHOTO_ALLOWED_MIME[mime_type]) return NextResponse.json({ error: 'Photo must be PNG or JPG.' }, { status: 400 })
  if (typeof size === 'number' && size > PHOTO_MAX_BYTES) {
    return NextResponse.json({ error: `Photo too large (max ${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MB).` }, { status: 400 })
  }

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${ownerFolder(me.email)}${Date.now()}-${safeName}`
  const { data, error } = await svc.storage.from('bcps-client').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the upload.' }, { status: 500 })
  return NextResponse.json({ path: data.path, token: data.token })
}
