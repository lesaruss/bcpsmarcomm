import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Public, no access key, scoped to ONE department per request (not a bulk
// dump of the roster). Backs the "here's who we have on file" prefill on
// the WCM Roster signup form. This intentionally exposes WCM name/email/
// personnel number for the single selected department to an unauthenticated
// visitor - a step up from the old departments-list endpoint, which was
// deliberately scrubbed of personal data. Flagged to Sean rather than done
// silently: the tradeoff is convenience (directors instantly see who's on
// file so they can correct rather than re-type from scratch) vs. staff PII
// being visible to anyone who can guess/select a department without logging
// in. If that's not acceptable, this route should move behind the existing
// browardschools.com login used elsewhere in this app.
export async function GET(req: NextRequest) {
  const rosterId = req.nextUrl.searchParams.get('roster_id')
  if (!rosterId) return NextResponse.json({ error: 'roster_id required' }, { status: 400 })

  const [{ data: roster, error: rosterErr }, { data: members, error: memberErr }] = await Promise.all([
    supabase.from('bcps_wcm_roster')
      .select('id, department_name, location_number, director_name')
      .eq('id', rosterId)
      .maybeSingle(),
    supabase.from('bcps_wcm_roster_members')
      .select('id, wcm_name, wcm_email, wcm_personnel_number, added_at')
      .eq('roster_id', rosterId)
      .order('added_at', { ascending: true }),
  ])

  if (rosterErr || memberErr) {
    return NextResponse.json({ error: (rosterErr || memberErr)?.message }, { status: 500 })
  }

  return NextResponse.json({
    director_name: roster?.director_name ?? null,
    wcms: members ?? [],
  })
}
