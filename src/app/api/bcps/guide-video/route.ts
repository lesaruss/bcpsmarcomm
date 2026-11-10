// GET /api/bcps/guide-video?slug= (Sean, 2026-11-10): the Start here video at
// the top of a guide's Overview. Each guide's video is made in the Depot as the
// project "guide-<slug>": Sean voices the lines, Logan cleans the audio and
// builds the video from the guide's own screens. Until the project has a
// finished video, this answers { video: null } and the guide shows nothing.
// The same readers as the guide: a restricted guide needs its sign-in or its
// 24-hour password pass; any other guide, a signed-in district account.

import { NextRequest, NextResponse } from 'next/server'
import { requireDistrictUser, requireDocumentAccess } from '@/lib/bcps-auth'
import { serviceClient } from '@/lib/bcps-doc-access'
import { hasValidPass } from '@/lib/bcps-doc-password'
import { GUIDES } from '@/lib/guides'
import { RESTRICTED_GUIDES } from '@/lib/guides/restricted'

export const dynamic = 'force-dynamic'

const none = () => NextResponse.json({ video: null }, { headers: { 'Cache-Control': 'no-store' } })

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('slug') || '').trim().toLowerCase()
  const db = serviceClient()
  if (!db || !/^[a-z0-9-]+$/.test(slug)) return none()

  if (RESTRICTED_GUIDES[slug]) {
    const auth = await requireDocumentAccess(req, slug)
    if (!auth.ok && !(await hasValidPass(db, slug)).valid) return NextResponse.json({ error: auth.error }, { status: auth.status })
  } else if (GUIDES[slug]) {
    const auth = await requireDistrictUser(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  } else return none()

  const { data: p } = await db.from('bcps_depot_projects').select('id, final_path, poster_path, updated_at').eq('slug', `guide-${slug}`).maybeSingle()
  if (!p?.final_path) return none()
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  const { data: tiles } = await db.from('bcps_depot_tiles').select('script').eq('project_id', p.id).order('position')
  const v = encodeURIComponent(String(p.updated_at ?? ''))
  return NextResponse.json({
    video: {
      src: `${base}${p.final_path}?v=${v}`,
      poster: p.poster_path ? `${base}${p.poster_path}?v=${v}` : null,
      transcript: (tiles ?? []).map((t) => String(t.script || '').trim()).filter(Boolean),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}
