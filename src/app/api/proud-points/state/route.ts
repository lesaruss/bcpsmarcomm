import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR, schoolByLoc } from '@/lib/proudPointsApi'
import { schoolState, mySchoolLocs, signPhoto } from '@/lib/proudPoints'

// Everything the form needs for one school: whether it already has six (which
// decides "send all six" vs "replace one"), what it shows today, what it sent
// on the old form, the caller's open draft, and any submission still waiting
// for review. GET ?loc=<loc_no>; without loc, returns the caller's own schools
// so the form can preselect one.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const loc = req.nextUrl.searchParams.get('loc')
  if (!loc) return NextResponse.json({ my_schools: (me.email ? await mySchoolLocs(svc, me.email) : []) })

  const school = await schoolByLoc(loc)
  if (!school) return NextResponse.json({ error: 'Unknown school' }, { status: 404 })

  const [state, { data: draft }, { data: waiting }] = await Promise.all([
    schoolState(svc, loc),
    svc.from('bcps_proud_point_submissions').select('id, kind, points, photo_path, photo_name, photo_alt, updated_at')
      .eq('owner_key', me.owner).eq('school_location_nbr', loc).eq('status', 'draft').maybeSingle(),
    svc.from('bcps_proud_point_submissions').select('id, kind, submitted_at, owner_key, replace_slot')
      .eq('school_location_nbr', loc).eq('status', 'pending').is('archived_at', null)
      .order('submitted_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // Signed links so the school's current background photo and the draft's
  // photo show in the preview without exposing the private bucket.
  const [currentPhoto, draftPhoto] = await Promise.all([signPhoto(svc, state.current_photo_path), signPhoto(svc, draft?.photo_path)])

  return NextResponse.json({
    school: { loc_no: school.loc_no, name: school.school_name, level: school.school_level },
    mode: state.has_six ? 'replace' : 'initial',
    has_six: state.has_six,
    override: state.override,
    on_audit_list: state.on_audit_list,
    current: state.current,
    current_photo_url: currentPhoto.url,
    current_source: state.current_source,
    legacy_points: state.legacy_points,
    legacy_count: state.legacy_count,
    draft: draft ? {
      id: draft.id, kind: draft.kind, points: draft.points, updated_at: draft.updated_at,
      photo: draft.photo_path ? { path: draft.photo_path, name: draft.photo_name, alt: draft.photo_alt || '', url: draftPhoto.url } : null,
    } : null,
    waiting: waiting ? { id: waiting.id, kind: waiting.kind, submitted_at: waiting.submitted_at, mine: waiting.owner_key === me.owner } : null,
  })
}
