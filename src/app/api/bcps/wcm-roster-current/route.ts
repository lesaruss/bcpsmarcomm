import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Per-department prefill for the WCM Roster signup form: who we currently have
// on file, so a director corrects the list instead of retyping it.
//
// Gated 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED) because it exposes a
// named staff member's work email and personnel number for any department an
// anonymous visitor cares to select.
//
// 2026-09-15: /wcm-roster-signup is public again, so this route has to answer
// an anonymous caller or the director sees nothing on file and retypes their
// roster from scratch - the exact problem the prefill exists to prevent. The
// answer is to keep the gate on the SENSITIVE FIELDS rather than on the route:
// a signed-in district user gets the full record as before, and an anonymous
// caller gets only what a director needs to confirm or correct the list -
// director name and WCM names, with the member ids that drive "remove". Work
// emails and personnel numbers are never sent to an unauthenticated caller.
export async function GET(req: NextRequest) {
  const auth = await requireDistrictUser(req)
  const authed = auth.ok

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

  const res = NextResponse.json({
    director_name: roster?.director_name ?? null,
    wcms: (members ?? []).map(m => authed ? m : {
      id: m.id,
      wcm_name: m.wcm_name,
      wcm_email: null,
      wcm_personnel_number: null,
      added_at: m.added_at,
    }),
    // The form uses this to tell the director why contact details are hidden.
    redacted: !authed,
  })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
