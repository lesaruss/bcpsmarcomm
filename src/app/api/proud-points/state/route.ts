import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR, schoolByLoc } from '@/lib/proudPointsApi'
import { schoolState, mySchoolLocs, signPhoto, type ProudPoint } from '@/lib/proudPoints'

// Everything the form needs for one school: whether it already has six (which
// decides "send all six" vs "replace one"), what it shows today, what it sent
// on the old form, the caller's open draft, and any submission still waiting
// for review. GET ?loc=<loc_no>; without loc, returns the caller's own schools
// so the form can preselect one.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const loc = req.nextUrl.searchParams.get('loc')
  if (!loc) return NextResponse.json({ my_schools: await mySchoolLocs(svc, me.email) })

  const school = await schoolByLoc(loc)
  if (!school) return NextResponse.json({ error: 'Unknown school' }, { status: 404 })

  const [state, { data: draft }, { data: waiting }] = await Promise.all([
    schoolState(svc, loc),
    svc.from('bcps_proud_point_submissions').select('id, kind, points, updated_at')
      .eq('wcm_email', me.email).eq('school_location_nbr', loc).eq('status', 'draft').maybeSingle(),
    svc.from('bcps_proud_point_submissions').select('id, kind, submitted_at, wcm_email, replace_slot')
      .eq('school_location_nbr', loc).eq('status', 'pending').is('archived_at', null)
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Signed links so the current photos and the draft's photos show in the
  // preview without exposing the private bucket.
  const current = await Promise.all(state.current.map(async c => ({ ...c, photo_url: (await signPhoto(svc, c.photo_path)).url })))
  const draftPoints = draft
    ? await Promise.all((draft.points as ProudPoint[]).map(async p => ({ ...p, photo_url: (await signPhoto(svc, p.photo_path)).url })))
    : null

  return NextResponse.json({
    school: { loc_no: school.loc_no, name: school.school_name, level: school.school_level },
    mode: state.has_six ? 'replace' : 'initial',
    has_six: state.has_six,
    override: state.override,
    current,
    current_source: state.current_source,
    legacy_points: state.legacy_points,
    legacy_count: state.legacy_count,
    draft: draft ? { id: draft.id, kind: draft.kind, points: draftPoints, updated_at: draft.updated_at } : null,
    waiting: waiting ? { id: waiting.id, kind: waiting.kind, submitted_at: waiting.submitted_at, mine: (waiting.wcm_email || '').toLowerCase() === me.email } : null,
  })
}
