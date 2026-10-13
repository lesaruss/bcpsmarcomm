import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR } from '@/lib/proudPointsApi'
import { signPhoto } from '@/lib/proudPoints'

// The caller's own Proud Points submissions (drafts included), newest first.
// Feeds My Submissions on the Proud Points page and the combined Your
// Submissions page. photo_url is signed so Edit and resend can show the
// background photo again.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const { data, error } = await svc.from('bcps_proud_point_submissions')
    .select('id, kind, status, school_name, school_location_nbr, points, photo_path, photo_name, photo_alt, replace_slot, replaced_text, rejection_reason, submitted_at, reviewed_at, posted_at, created_at, updated_at, is_test')
    .eq('owner_key', me.owner).is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = await Promise.all((data ?? []).map(async r => ({ ...r, photo_url: (await signPhoto(svc, r.photo_path)).url })))
  return NextResponse.json({ submissions: rows })
}
