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

const ADMIN_EMAIL = 'contact@lesaruss.com'

// Fires when the submitter checked "I'm not the director on file." Best-effort:
// a missing/unset RESEND_API_KEY should never block the submission itself, so
// this always no-ops quietly rather than throwing.
async function notifyIdentityMismatch(opts: {
  departmentName: string
  onFileDirector: string
  claimedDirector: string
  submitterName: string
  submitterRole: string
  submitterEmail: string
  chiefName: string | null
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const chiefNote = opts.chiefName && opts.submitterRole.toLowerCase().includes('chief')
    ? `<p style="margin:0 0 12px;font-size:13px;color:#166534;background:#F0FDF4;padding:10px 12px;border-radius:6px;">
         Heads up: this department's Chief on file is <strong>${opts.chiefName}</strong>, and the submitter's stated role mentions "Chief" -
         may just be the Chief stepping in for a vacant/unclear director seat.
       </p>`
    : ''
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'WCM Roster <noreply@bcpsmarcomm.com>',
        to: ADMIN_EMAIL,
        subject: `Flag for review: non-director submission - ${opts.departmentName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;">
            <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">
              Someone other than the director on file submitted a WCM Roster update for
              <strong>${opts.departmentName}</strong>.
            </p>
            ${chiefNote}
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;width:160px;">Director on file</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${opts.onFileDirector || 'None on file'}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Name typed in form</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${opts.claimedDirector}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Submitted by</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${opts.submitterName} - ${opts.submitterRole}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Their email</td>
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${opts.submitterEmail}</td>
              </tr>
            </table>
            <a href="https://bcpsmarcomm.com/bcps?page=wcm"
               style="display:inline-block;background:#003087;color:#fff;padding:10px 20px;text-decoration:none;font-size:13px;font-weight:700;border-radius:4px;">
              Review in WCM Hub
            </a>
            <p style="margin:20px 0 0;font-size:11px;color:#9ca3af;">
              Broward County Public Schools - District Web Team
            </p>
          </div>
        `,
      }),
    })
  } catch {
    // Notification failure should not block the submission.
  }
}

// Intake endpoint for WCM roster changes. Originally built for the
// "Department Web Content Managers Roster 2026/27" Microsoft Form via
// Power Automate (one submission = one new WCM). Extended to also carry
// 'remove' (an existing WCM is no longer correct - target_member_id points
// at the bcps_wcm_roster_members row in question) and 'na' (department is
// telling us they don't need a dedicated WCM this cycle) from the native
// signup page's prefill/suggest-update flow. Also carries submitter_email
// (who filled this out) and, when the submitter says they're not the
// director on file, identity_flag + submitter_name/submitter_role so the
// District Web Team can confirm before approving.
// Nothing here touches the live roster or department records directly -
// it only lands a pending row in bcps_wcm_roster_submissions. An admin
// approves/rejects from the WCM Roster review queue (wcm-roster-queue),
// which is what actually updates bcps_wcm_roster / bcps_wcm_roster_members
// (and, on approval, bcps_departments.director_email from submitter_email).
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
      submitter_email,
      identity_flag,
      submitter_name,
      submitter_role,
    } = body as Record<string, string | boolean | undefined>

    if (access_key !== ACCESS_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const submissionAction = action === 'remove' || action === 'na' ? action : 'add'
    const isFlagged = identity_flag === true

    if (!department_name || !director_name) {
      return NextResponse.json(
        { error: 'department_name and director_name are required' },
        { status: 400 }
      )
    }
    if (!submitter_email) {
      return NextResponse.json({ error: 'submitter_email is required' }, { status: 400 })
    }
    if (submissionAction === 'add' && !wcm_name) {
      return NextResponse.json({ error: 'wcm_name is required to add a WCM' }, { status: 400 })
    }
    if (submissionAction === 'remove' && !target_member_id) {
      return NextResponse.json({ error: 'target_member_id is required to remove a WCM' }, { status: 400 })
    }
    if (isFlagged && (!submitter_name || !submitter_role)) {
      return NextResponse.json(
        { error: 'submitter_name and submitter_role are required when identity_flag is set' },
        { status: 400 }
      )
    }

    // Match against the canonical roster list (case-insensitive) to carry
    // the location number forward automatically, and to look up the
    // department's Chief (for the mismatch email) via matched_department_id.
    // If a director's response doesn't match (manual/unlisted department
    // entry), we still record the submission with a null location_number so
    // nothing is silently dropped.
    let locationNumber: string | null = null
    let onFileDirectorName: string | null = null
    let chiefName: string | null = null
    const rosterQuery = supabase
      .from('bcps_wcm_roster')
      .select('location_number, director_name, matched_department_id')
    const { data: rosterRow } = roster_id
      ? await rosterQuery.eq('id', roster_id as string).maybeSingle()
      : await rosterQuery.ilike('department_name', (department_name as string).trim()).maybeSingle()

    locationNumber = rosterRow?.location_number ?? null
    onFileDirectorName = rosterRow?.director_name ?? null
    if (rosterRow?.matched_department_id) {
      const { data: dept } = await supabase
        .from('bcps_departments').select('chief_name').eq('id', rosterRow.matched_department_id).maybeSingle()
      chiefName = dept?.chief_name ?? null
    }

    const { data: inserted, error } = await supabase
      .from('bcps_wcm_roster_submissions')
      .insert({
        department_name: (department_name as string).trim(),
        location_number: locationNumber,
        director_name: (director_name as string).trim(),
        wcm_name: submissionAction === 'na' ? 'N/A' : ((wcm_name as string)?.trim() || null),
        wcm_personnel_number: (wcm_personnel_number as string)?.trim() || null,
        wcm_email: (wcm_email as string)?.trim() || null,
        status: 'pending',
        action: submissionAction,
        target_member_id: submissionAction === 'remove' ? target_member_id : null,
        submitter_email: (submitter_email as string).trim(),
        identity_flag: isFlagged,
        submitter_name: isFlagged ? (submitter_name as string).trim() : null,
        submitter_role: isFlagged ? (submitter_role as string).trim() : null,
        raw_payload: body,
      })
      .select('id')
      .single()

    if (error) throw error

    const actionLabel =
      submissionAction === 'remove' ? `remove ${wcm_name || 'a WCM'}` :
      submissionAction === 'na' ? 'mark as no dedicated WCM this year' :
      `add WCM ${(wcm_name as string)?.trim()}`

    // Surface it on the stream so it's not missed.
    await supabase.from('stream_events').insert({
      timestamp: new Date().toISOString(),
      owner: 'sar',
      station: 'SAR-station',
      task_id: null,
      summary: isFlagged
        ? `[BCPS WCM Roster] FLAGGED - "${department_name}": submitted by ${submitter_name} (${submitter_role}), not the director on file (${onFileDirectorName || 'none on file'}). Wants to ${actionLabel}.`
        : `[BCPS WCM Roster] "${(department_name as string).trim()}" wants to ${actionLabel} - awaiting review.`,
      status: 'pending',
      context_link: 'https://bcpsmarcomm.com/bcps?page=wcm',
    })

    if (isFlagged) {
      await notifyIdentityMismatch({
        departmentName: (department_name as string).trim(),
        onFileDirector: onFileDirectorName || '',
        claimedDirector: (director_name as string).trim(),
        submitterName: (submitter_name as string).trim(),
        submitterRole: (submitter_role as string).trim(),
        submitterEmail: (submitter_email as string).trim(),
        chiefName,
      })
    }

    return NextResponse.json({ success: true, id: inserted?.id })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
