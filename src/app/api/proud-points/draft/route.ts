import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR, schoolByLoc } from '@/lib/proudPointsApi'
import { POINT_COUNT, cleanPoint, validatePoint, isTestBuild, type ProudPoint } from '@/lib/proudPoints'

// Saves a school's first set of six as a draft until all six are complete
// (Vanessa, 2026-10-08). One open draft per person per school. PUT saves,
// DELETE ?loc= discards. Only the first-six flow has drafts; replacing one
// point is a single short form.

export async function PUT(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const { loc, points } = (await req.json().catch(() => ({}))) as { loc?: string; points?: Partial<ProudPoint>[] }
  const school = await schoolByLoc(loc)
  if (!school) return NextResponse.json({ error: 'Pick your school first.' }, { status: 400 })
  if (!Array.isArray(points) || points.length > POINT_COUNT) return NextResponse.json({ error: 'Invalid points.' }, { status: 400 })

  const cleaned = points.map((p, i) => cleanPoint(p, i + 1))
  for (const p of cleaned) {
    const err = validatePoint(p, { complete: false })
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    if (p.photo_path) {
      const { data: photo } = await svc.from('bcps_proud_point_photos').select('ok, owner_email').eq('path', p.photo_path).maybeSingle()
      if (!photo || photo.owner_email !== me.email || !photo.ok) return NextResponse.json({ error: `Photo for point ${p.slot} was not accepted. Choose it again.` }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const { data: existing } = await svc.from('bcps_proud_point_submissions').select('id')
    .eq('wcm_email', me.email).eq('school_location_nbr', school.loc_no).eq('status', 'draft').maybeSingle()
  if (existing) {
    const { error } = await svc.from('bcps_proud_point_submissions').update({ points: cleaned, updated_at: now }).eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id, saved_at: now })
  }
  const { data, error } = await svc.from('bcps_proud_point_submissions').insert({
    wcm_user_id: me.userId, wcm_email: me.email, school_location_nbr: school.loc_no, school_name: school.school_name,
    kind: 'initial', status: 'draft', points: cleaned, is_test: isTestBuild(),
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id, saved_at: now })
}

export async function DELETE(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })
  const loc = req.nextUrl.searchParams.get('loc')
  if (!loc) return NextResponse.json({ error: 'loc is required' }, { status: 400 })
  const { error } = await svc.from('bcps_proud_point_submissions').delete()
    .eq('wcm_email', me.email).eq('school_location_nbr', loc).eq('status', 'draft')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
