import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR } from '@/lib/proudPointsApi'

// The caller's own Proud Points submissions (drafts included), newest first.
// Feeds My Submissions on the Proud Points page and the combined Your
// Submissions page.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })

  const { data, error } = await svc.from('bcps_proud_point_submissions')
    .select('id, kind, status, school_name, school_location_nbr, points, replace_slot, replaced_text, rejection_reason, submitted_at, reviewed_at, posted_at, created_at, updated_at, is_test')
    .eq('wcm_email', me.email).is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submissions: data ?? [] })
}
