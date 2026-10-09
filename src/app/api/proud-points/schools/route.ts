import { NextRequest, NextResponse } from 'next/server'
import { svc, requireProudPointsAccess, ACCESS_ERROR } from '@/lib/proudPointsApi'

// The school picker for Proud Points. Same list as /api/banner/schools, but
// behind the Proud Points check so it also answers embed users, who have no
// bcpsmarcomm.com session.

export async function GET(req: NextRequest) {
  const { ident: me, status } = await requireProudPointsAccess(req)
  if (!me) return NextResponse.json({ error: ACCESS_ERROR[status] }, { status })
  const { data, error } = await svc.from('bcps_school_directory')
    .select('loc_no, school_name').eq('is_archived', false).order('school_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schools: data ?? [] })
}
