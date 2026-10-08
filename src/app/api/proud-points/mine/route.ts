import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess } from '@/lib/proudPointsApi'

// The caller's own Proud Points submissions (drafts included), newest first.
// Feeds My Submissions on the Proud Points page and the combined Your
// Submissions page.

export async function GET(req: NextRequest) {
  const { user, status } = await requireProudPointsAccess(req)
  if (!user) return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Proud Points is for school WCMs and the District Web Team.' }, { status })

  const { data, error } = await svc.from('bcps_proud_point_submissions')
    .select('id, kind, status, school_name, school_location_nbr, points, replace_slot, replaced_text, rejection_reason, submitted_at, reviewed_at, posted_at, created_at, updated_at, is_test')
    .eq('wcm_user_id', user.id).is('archived_at', null)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ submissions: data ?? [] })
}
