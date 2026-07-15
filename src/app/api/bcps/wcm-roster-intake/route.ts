import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Shared secret for the Power Automate flow that forwards Microsoft Forms
// responses here. Not user-facing; rotate by updating both this constant
// and the flow's HTTP action header if it's ever compromised.
const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

// Intake endpoint for the "Department Web Content Managers Roster 2026/27"
// Microsoft Form. A Power Automate flow ("When a new response is submitted")
// posts each response here. One submission = one WCM for one department;
// directors are asked to submit the form once per WCM they assign.
// Nothing here touches the live roster or department records directly -
// it only lands a pending row in bcps_wcm_roster_submissions. An admin
// approves it from the Department WCMS Portal -> WCM Roster tab, which is
// what actually updates bcps_wcm_roster / bcps_departments.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      access_key,
      department_name,
      director_name,
      wcm_name,
      wcm_personnel_number,
      wcm_email,
    } = body as Record<string, string>

    if (access_key !== ACCESS_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!department_name || !director_name || !wcm_name) {
      return NextResponse.json(
        { error: 'department_name, director_name, and wcm_name are required' },
        { status: 400 }
      )
    }

    // Match against the canonical roster list (case-insensitive) to carry
    // the location number forward automatically. If a director's form
    // response doesn't match (shouldn't happen since the form dropdown is
    // sourced from this same list), we still record the submission with a
    // null location_number so nothing is silently dropped.
    const { data: rosterRow } = await supabase
      .from('bcps_wcm_roster')
      .select('id, location_number')
      .ilike('department_name', department_name.trim())
      .maybeSingle()

    const { data: inserted, error } = await supabase
      .from('bcps_wcm_roster_submissions')
      .insert({
        department_name: department_name.trim(),
        location_number: rosterRow?.location_number ?? null,
        director_name: director_name.trim(),
        wcm_name: wcm_name.trim(),
        wcm_personnel_number: wcm_personnel_number?.trim() || null,
        wcm_email: wcm_email?.trim() || null,
        status: 'pending',
        raw_payload: body,
      })
      .select('id')
      .single()

    if (error) throw error

    // Surface it on the stream so it's not missed.
    await supabase.from('stream_events').insert({
      timestamp: new Date().toISOString(),
      owner: 'sar',
      station: 'SAR-station',
      task_id: null,
      summary: `[BCPS WCM Roster] New submission for "${department_name.trim()}" - WCM ${wcm_name.trim()} awaiting review.`,
      status: 'pending',
      context_link: 'https://bcpsmarcomm.com/bcps?page=wcm',
    })

    return NextResponse.json({ success: true, id: inserted?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
