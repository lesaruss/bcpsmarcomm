import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser, isDistrictEmail, normalizeDistrictEmail, DISTRICT_DOMAIN } from '@/lib/bcps-auth'
import { verifyDirector } from '@/lib/bcps-director-match'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

const ADMIN_EMAIL = 'contact@lesaruss.com'

// Fires when the signed-in submitter could not be verified as the director on
// file. Best-effort: a missing/unset RESEND_API_KEY should never block the
// submission itself, so this always no-ops quietly rather than throwing.
async function notifyIdentityMismatch(opts: {
  departmentName: string
  onFileDirector: string
  claimedDirector: string
  submitterName: string
  submitterRole: string
  submitterEmail: string
  chiefName: string | null
  reason: string
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
        subject: `Flag for review: unverified submitter - ${opts.departmentName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:560px;padding:24px;">
            <p style="margin:0 0 12px;font-size:15px;color:#1a1a1a;">
              A WCM Roster update for <strong>${opts.departmentName}</strong> was submitted by a signed-in
              district user who could not be verified as the director on file.
            </p>
            <p style="margin:0 0 12px;font-size:13px;color:#92400E;background:#FFFBEB;padding:10px 12px;border-radius:6px;">
              ${opts.reason}
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
                <td style="padding:8px 12px;font-size:13px;color:#1a1a1a;">${opts.submitterName || 'Not given'} - ${opts.submitterRole || 'Role not given'}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;background:#f3f4f6;font-size:13px;font-weight:700;color:#374151;">Signed in as</td>
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

// Intake endpoint for WCM roster changes, submitted from the native BCPS
// Marcom form at bcpsmarcomm.com/wcm-roster-signup. One submission carries
// 'add' (a new WCM), 'remove' (target_member_id points at the
// bcps_wcm_roster_members row that is no longer correct), 'na' (the
// department has no dedicated WCM this cycle) or 'confirm' (the WCM(s) on
// file are still correct; wcm_name carries the names confirmed, for the
// reviewer - added 2026-09-23, before which a director with nothing to change
// could not submit at all).
//
// AUTH, rewritten 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED):
// this route used to accept a shared static ACCESS_KEY (value withheld)
// in the request body. That key shipped in the client bundle and sat in a PUBLIC
// GitHub repo, so in practice this endpoint was unauthenticated: anyone could
// post a roster change naming any department, any director and any email.
// An earlier comment here described the caller as a Microsoft Forms/Power
// Automate flow - that was wrong and is corrected: verified 2026-09-14 against
// all 81 rows of bcps_wcm_roster_submissions.raw_payload, every submission
// carries this native form's field shape, and the MS Forms approach was
// replaced back on 2026-07-15 (8a660f6, 48697f1). There is no external caller
// to keep a shared key for, so the key is gone rather than rotated.
//
// The door is now requireDistrictUser (src/lib/bcps-auth.ts) - the same check
// that guards enrollment in wcm-pilot-register, per
// canon-gate-new-surfaces-on-the-same-check.
//
// Two things follow from having a real session, and both matter more than the
// gate itself:
//   1. submitter_email is taken FROM THE SESSION, never from the request body.
//      This is the field that becomes bcps_departments.director_email on
//      approval and the address an account is provisioned for, so it must not
//      be attacker-supplied.
//   2. identity_flag is now decided server-side by verifyDirector() instead of
//      being a checkbox the submitter ticked. The submitter cannot clear their
//      own flag.
export async function POST(req: NextRequest) {
  try {
    // The form is public again (Sean, 2026-09-15) so a director can respond
    // without an account. A session is used when there is one - that address
    // is proven, and only a proven address may later become director_email of
    // record. Signed out, the submitter declares a district address in the
    // form: enough to route and flag the request, never enough to establish
    // an identity on its own.
    const auth = await requireDistrictUser(req)
    const body = await req.json()
    // Normalized before the district gate below, so a director who fat-fingers
    // their own domain is let through and corrected rather than bounced back at
    // the form. Only the SELF-DECLARED address is normalized. A session address
    // is already proven and is never rewritten.
    const declaredEmail = normalizeDistrictEmail((body as Record<string, unknown>).submitter_email as string | undefined)

    const sessionEmail = auth.ok ? auth.user.email : declaredEmail
    const emailVerified = auth.ok
    if (!sessionEmail || !isDistrictEmail(sessionEmail)) {
      return NextResponse.json(
        { error: `Enter your ${DISTRICT_DOMAIN} email address so we know who this response is from.` },
        { status: 400 }
      )
    }

    const {
      department_name,
      director_name,
      wcm_name,
      wcm_personnel_number,
      wcm_email,
      action,
      target_member_id,
      roster_id,
      submitter_name,
      submitter_role,
    } = body as Record<string, string | boolean | undefined>

    const submissionAction =
      action === 'remove' || action === 'na' || action === 'confirm' ? action : 'add'

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
    // the location number forward automatically, and to look up the
    // department's Chief (for the mismatch email) via matched_department_id.
    // If a director's response doesn't match (manual/unlisted department
    // entry), we still record the submission with a null location_number so
    // nothing is silently dropped.
    let locationNumber: string | null = null
    let onFileDirectorName: string | null = null
    let onFileDirectorEmail: string | null = null
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
        .from('bcps_departments')
        .select('chief_name, director_name, director_email')
        .eq('id', rosterRow.matched_department_id)
        .maybeSingle()
      chiefName = dept?.chief_name ?? null
      onFileDirectorEmail = dept?.director_email ?? null
      if (!onFileDirectorName) onFileDirectorName = dept?.director_name ?? null
    }

    // Server-side identity verification (replaces the self-declared checkbox).
    const verdict = emailVerified
      ? verifyDirector({
      sessionEmail,
      onFileDirector: onFileDirectorName,
      claimedDirector: (director_name as string).trim(),
      onFileDirectorEmail,
    })
      : { verified: false, reason: 'Submitted through the public form without signing in - address is self-declared.' }
    const isFlagged = !verdict.verified

    const { data: inserted, error } = await supabase
      .from('bcps_wcm_roster_submissions')
      .insert({
        department_name: (department_name as string).trim(),
        location_number: locationNumber,
        director_name: (director_name as string).trim(),
        wcm_name: submissionAction === 'na' ? 'N/A' : ((wcm_name as string)?.trim() || null),
        wcm_personnel_number: (wcm_personnel_number as string)?.trim() || null,
        wcm_email: normalizeDistrictEmail(wcm_email as string | undefined),
        status: 'pending',
        action: submissionAction,
        target_member_id: submissionAction === 'remove' ? target_member_id : null,
        submitter_email: sessionEmail,
        identity_flag: isFlagged,
        submitter_name: (submitter_name as string)?.trim() || null,
        submitter_role: (submitter_role as string)?.trim() || null,
        raw_payload: {
          ...body,
          // Recorded so a later audit can tell what the server decided and why,
          // rather than having to re-derive it. The client cannot set these.
          verified_submitter_email: sessionEmail,
          // false = self-declared through the public form, not proven by a
          // session. Approval refuses to write a self-declared address into
          // bcps_departments.director_email.
          submitter_email_session_verified: emailVerified,
          identity_verified: verdict.verified,
          identity_reason: verdict.reason,
        },
      })
      .select('id')
      .single()

    if (error) throw error

    const actionLabel =
      submissionAction === 'remove' ? `remove ${wcm_name || 'a WCM'}` :
      submissionAction === 'na' ? 'mark as no dedicated WCM this year' :
      submissionAction === 'confirm' ? `confirm the WCM(s) on file as-is (${(wcm_name as string)?.trim() || 'names not given'})` :
      `add WCM ${(wcm_name as string)?.trim()}`

    // Surface it on the stream so it's not missed.
    await supabase.from('stream_events').insert({
      timestamp: new Date().toISOString(),
      owner: 'sar',
      station: 'SAR-station',
      task_id: null,
      summary: isFlagged
        ? `[BCPS WCM Roster] FLAGGED - "${(department_name as string).trim()}": submitted by ${sessionEmail}, not verified as the director on file (${onFileDirectorName || 'none on file'}). Wants to ${actionLabel}.`
        : `[BCPS WCM Roster] "${(department_name as string).trim()}" wants to ${actionLabel} - awaiting review.`,
      status: 'pending',
      context_link: 'https://bcpsmarcomm.com/bcps?page=wcm',
    })

    if (isFlagged) {
      await notifyIdentityMismatch({
        departmentName: (department_name as string).trim(),
        onFileDirector: onFileDirectorName || '',
        claimedDirector: (director_name as string).trim(),
        submitterName: (submitter_name as string)?.trim() || '',
        submitterRole: (submitter_role as string)?.trim() || '',
        submitterEmail: sessionEmail,
        chiefName,
        reason: verdict.reason,
      })
    }

    return NextResponse.json({ success: true, id: inserted?.id, identity_verified: verdict.verified })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
