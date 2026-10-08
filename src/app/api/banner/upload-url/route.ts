import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
import { BANNER_ALLOWED_MIME, BANNER_MAX_BYTES, bannerUploadPrefix } from '@/lib/bannerFiles'

// Step 1 of a New Upload: hands the WCM a one-time signed URL so the browser
// sends the file straight to the private bcps-client bucket. Before this, the
// file rode inside the /api/banner/submit JSON body as base64, and Vercel caps
// a function request body at 4.5 MB - so any file over ~3.3 MB (every real
// MP4, plus many phone photos) was refused at the edge before our code ran.
// Vanessa Deslandes, 2026-10-08: a WCM's 20-second video was "denied" even
// though the spec allows up to 30 seconds. The path is scoped to the caller's
// own user id; /api/banner/submit only accepts paths under that prefix.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

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
  const { file_name, mime_type, size } = body as { file_name?: string; mime_type?: string; size?: number }
  if (!file_name || !mime_type) return NextResponse.json({ error: 'file_name and mime_type are required' }, { status: 400 })
  if (!BANNER_ALLOWED_MIME[mime_type]) return NextResponse.json({ error: 'File must be PNG, JPG, or MP4.' }, { status: 400 })
  if (typeof size === 'number' && size > BANNER_MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${Math.round(BANNER_MAX_BYTES / 1024 / 1024)}MB).` }, { status: 400 })
  }

  const safeName = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${bannerUploadPrefix(user.id)}${Date.now()}-${safeName}`
  const { data, error } = await svc.storage.from('bcps-client').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the upload.' }, { status: 500 })

  return NextResponse.json({ path: data.path, token: data.token })
}
