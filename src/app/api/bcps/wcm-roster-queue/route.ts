import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

function checkKey(req: NextRequest): boolean {
  const key = req.nextUrl.searchParams.get('access_key')
  return key === ACCESS_KEY
}

// GET: full roster (departments, alphabetical) with each department's
// current director + assigned WCM(s), plus any submissions still awaiting
// review. Backs the "WCM Roster" tab in the Department WCMS Portal.
export async function GET(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: roster, error: rosterErr }, { data: members, error: memberErr }, { data: submissions, error: subErr }] =
    await Promise.all([
      supabase.from('bcps_wcm_roster')
        .select('id, department_name, location_number, matched_department_id, director_name, updated_at')
        .order('department_name', { ascending: true }),
      supabase.from('bcps_wcm_roster_members')
        .select('id, roster_id, wcm_name, wcm_personnel_number, wcm_email, added_at')
        .order('added_at', { ascending: true }),
      supabase.from('bcps_wcm_roster_submissions')
        .select('*')
        .order('submitted_at', { ascending: false }),
    ])

  if (rosterErr || memberErr || subErr) {
    return NextResponse.json({ error: (rosterErr || memberErr || subErr)?.message }, { status: 500 })
  }

  const membersByRoster = new Map<string, typeof members>()
  for (const m of members ?? []) {
    const list = membersByRoster.get(m.roster_id) ?? []
    list.push(m)
    membersByRoster.set(m.roster_id, list)
  }

  const rosterWithMembers = (roster ?? []).map(r => ({
    ...r,
    wcms: membersByRoster.get(r.id) ?? [],
  }))

  return NextResponse.json({
    roster: rosterWithMembers,
    submissions: submissions ?? [],
  })
}

// PATCH: admin decision on a pending submission.
// approve + action=add    -> upserts the roster row's director_name, appends a WCM
//                             member row, mirrors the name onto bcps_departments
//                             if this department is also tracked in the audit tool.
// approve + action=remove -> deletes the target_member_id row from
//                             bcps_wcm_roster_members. No new row added.
// approve + action=na     -> updates director_name only, no member change (the
//                             department is confirming it has no dedicated WCM).
// reject                  -> marks the submission rejected with reviewer notes,
//                             no roster/member change either way.
export async function PATCH(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, action: decision, reviewer, notes } = await req.json() as {
      id: string
      action: 'approve' | 'reject'
      reviewer?: string
      notes?: string
    }
    if (!id || !decision) {
      return NextResponse.json({ error: 'id and action required' }, { status: 400 })
    }

    const { data: submission } = await supabase
      .from('bcps_wcm_roster_submissions')
      .select('*')
      .eq('id', id)
      .single()

    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    if (submission.status !== 'pending') {
      return NextResponse.json({ error: 'Submission already reviewed' }, { status: 409 })
    }

    const now = new Date().toISOString()

    if (decision === 'reject') {
      await supabase.from('bcps_wcm_roster_submissions').update({
        status: 'rejected', reviewed_at: now, reviewed_by: reviewer ?? 'admin', review_notes: notes ?? null,
      }).eq('id', id)
      return NextResponse.json({ success: true, action: 'rejected' })
    }

    const submissionAction: 'add' | 'remove' | 'na' = submission.action ?? 'add'

    // Approve: find (or create) the roster row for this department.
    let { data: rosterRow } = await supabase
      .from('bcps_wcm_roster')
      .select('id, matched_department_id')
      .ilike('department_name', submission.department_name)
      .maybeSingle()

    if (!rosterRow) {
      const { data: created, error: createErr } = await supabase
        .from('bcps_wcm_roster')
        .insert({
          department_name: submission.department_name,
          location_number: submission.location_number ?? 'UNASSIGNED',
          director_name: submission.director_name,
        })
        .select('id, matched_department_id')
        .single()
      if (createErr) throw createErr
      rosterRow = created
    } else {
      await supabase.from('bcps_wcm_roster').update({
        director_name: submission.director_name, updated_at: now,
      }).eq('id', rosterRow.id)
    }

    if (submissionAction === 'remove' && submission.target_member_id) {
      await supabase.from('bcps_wcm_roster_members').delete().eq('id', submission.target_member_id)
    } else if (submissionAction === 'add') {
      await supabase.from('bcps_wcm_roster_members').insert({
        roster_id: rosterRow.id,
        wcm_name: submission.wcm_name,
        wcm_personnel_number: submission.wcm_personnel_number,
        wcm_email: submission.wcm_email,
      })
    }
    // action === 'na': roster director already updated above, no member row change.

    // Mirror onto the website-audit tool's department record, if this
    // department is one of the ones already tracked there.
    if (rosterRow.matched_department_id && submissionAction !== 'remove') {
      await supabase.from('bcps_departments').update({
        wcm_name: submission.wcm_name,
        director_name: submission.director_name,
      }).eq('id', rosterRow.matched_department_id)
    }

    await supabase.from('bcps_wcm_roster_submissions').update({
      status: 'approved', reviewed_at: now, reviewed_by: reviewer ?? 'admin',
    }).eq('id', id)

    return NextResponse.json({ success: true, action: 'approved' })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
