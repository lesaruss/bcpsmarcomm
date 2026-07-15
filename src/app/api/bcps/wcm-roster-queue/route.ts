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

// GET: full roster (143 departments, alphabetical) with each department's
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
// approve -> upserts the roster row's director_name, appends a WCM member row,
//            and (if this department is also tracked in the website-audit tool)
//            mirrors the name onto bcps_departments so that tool's WCM Contact
//            panel stays in sync.
// reject  -> marks the submission rejected with reviewer notes, no roster change.
export async function PATCH(req: NextRequest) {
  if (!checkKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id, action, reviewer, notes } = await req.json() as {
      id: string
      action: 'approve' | 'reject'
      reviewer?: string
      notes?: string
    }
    if (!id || !action) {
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

    if (action === 'reject') {
      await supabase.from('bcps_wcm_roster_submissions').update({
        status: 'rejected', reviewed_at: now, reviewed_by: reviewer ?? 'admin', review_notes: notes ?? null,
      }).eq('id', id)
      return NextResponse.json({ success: true, action: 'rejected' })
    }

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

    await supabase.from('bcps_wcm_roster_members').insert({
      roster_id: rosterRow.id,
      wcm_name: submission.wcm_name,
      wcm_personnel_number: submission.wcm_personnel_number,
      wcm_email: submission.wcm_email,
    })

    // Mirror onto the website-audit tool's department record, if this
    // department is one of the 64 already tracked there.
    if (rosterRow.matched_department_id) {
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
