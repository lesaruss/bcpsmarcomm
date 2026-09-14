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
// Gated 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED). This route was
// deliberately public and the original author flagged the tradeoff in this very
// comment: it exposes a named staff member's work email and personnel number
// for any department an anonymous visitor cares to select, and noted that "if
// that's not acceptable, this route should move behind the existing
// browardschools.com login used elsewhere in this app." That is now exactly
// what happened - its only caller, /wcm-roster-signup, requires a district
// session as of this change, so the reason to leave this one open is gone.
// Same gate as the form it feeds: requireDistrictUser (src/lib/bcps-auth.ts).
export async function GET(req: NextRequest) {
  const auth = await requireDistrictUser(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
