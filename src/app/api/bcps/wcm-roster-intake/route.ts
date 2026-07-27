import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Shared secret for the Power Automate flow that forwards Microsoft Forms
// responses here, and for the native WCM Roster signup page. Not a real
// auth boundary (it ships in the client bundle) - it just keeps this from
// being a wide-open POST endpoint. Rotate by updating both this constant
// and the Power Automate flow's HTTP action header if it's ever compromised.
const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

// Intake endpoint for WCM roster changes. Originally built for the
// "Department Web Content Managers Roster 2026/27" Microsoft Form via
// Power Automate (one submission = one new WCM). Extended to also carry
// 'remove' (an existing WCM is no longer correct - target_member_id points
// at the bcps_wcm_roster_members row in question) and 'na' (department is
// telling us they don't need a dedicated WCM this cycle) from the native
// signup page's prefill/suggest-update flow.
// Nothing here touches the live roster or department records directly -
// it only lands a pending row in bcps_wcm_roster_submissions. An admin
// approves/rejects from the WCM Roster review queue (wcm-roster-queue),
// which is what actually updates bcps_wcm_roster / bcps_wcm_roster_members.
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
      action,
      target_member_id,
      roster_id,
    } = body as Record<string, string>

    if (access_key !== ACCESS_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const submissionAction = action === 'remove' || action === 'na' ? action : 'add'

    if (!department_name || !director_name) {
      return NextResponse.json(
        { error: 'department_name and director_name are required' },
        { status: 400 }
      )
    }
    if (submissionAction === 'add' && !wcm_name) {
      return NextResponse.json({ error: 'wcm_name is required to add a WCM' }, { status: 400 })
    }
    if (submissionAction === 'remove' && !target_member_id) {
      return NextResponse.json({ error: 'target_member_id is required to remove a WCM' }, { status: 400 })
    }

    // Match against the canonical roster list (case-insensitive) to carry
    // the location number forward automatically. If a director's response
    // doesn't match (manual/unlisted department entry), we still record the
    // submission with a null location_number so nothing is silently dropped.
    let locationNumber: string | null = null
    if (roster_id) {
      const { data: rosterRow } = await supabase
        .from('bcps_wcm_roster').select('location_number').eq('id', roster_id).maybeSingle()
      locationNumber = rosterRow?.location_number ?? null
    } else {
      const { data: rosterRow } = await supabase
        .from('bcps_wcm_roster').select('location_number')
        .ilike('department_name', department_name.trim()).maybeSingle()
      locationNumber = rosterRow?.location_number ?? null
    }

    const { data: inserted, error } = await supabase
      .from('bcps_wcm_roster_submissions')
      .insert({
        department_name: department_name.trim(),
        location_number: locationNumber,
        director_name: director_name.trim(),
        wcm_name: submissionAction === 'na' ? 'N/A' : (wcm_name?.trim() || null),
        wcm_personnel_number: wcm_personnel_number?.trim() || null,
        wcm_email: wcm_email?.trim() || null,
        status: 'pending',
        action: submissionAction,
        target_member_id: submissionAction === 'remove' ? target_member_id : null,
        raw_payload: body,
      })
      .select('id')
      .single()

    if (error) throw error

    const actionLabel =
      submissionAction === 'remove' ? `remove ${wcm_name || 'a WCM'}` :
      submissionAction === 'na' ? 'mark as no dedicated WCM this year' :
      `add WCM ${wcm_name?.trim()}`

    // Surface it on the stream so it's not missed.
    await supabase.from('stream_events').insert({
      timestamp: new Date().toISOString(),
      owner: 'sar',
      station: 'SAR-station',
      task_id: null,
      summary: `[BCPS WCM Roster] "${department_name.trim()}" wants to ${actionLabel} - awaiting review.`,
      status: 'pending',
      context_link: 'https://bcpsmarcomm.com/bcps?page=wcm',
    })

    return NextResponse.json({ success: true, id: inserted?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
