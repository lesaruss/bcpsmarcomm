import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { esc, brandedEmail, resolveOrInviteAccount, enrollBcpsMember, wcmConfirmationEmail, directorConfirmationEmail, SITE } from '@/lib/bcps-portal-account'
import { requireBcpsAdmin, requireDistrictUser, isDistrictEmail } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Director account + confirmation email, sent on every approval regardless
// of action (add/remove/na) - approving is the confirmation that this
// director's designation for 2026-27 is locked in, independent of whether
// this particular submission also changed a WCM.
//
// 2026-09-12 (Sean, revised same day as the first version of this route):
// create the account now, but do NOT invite the director in yet - no
// action_link, no CTA button in this email at all. Directors get their own
// tour and portal access with the October Communique, once the console
// experience itself is ready; this email only confirms the roster decision
// and, when applicable, that their WCM already has what they need to log
// in. Account creation still happens now (not deferred to the Communique)
// so nothing has to be re-run later - resolveOrInviteAccount + enrollment
// silently provisions the account, its action_link is just never sent.
async function notifyDirector(opts: {
  directorEmail: string
  directorName: string
  departmentName: string
  departmentSlug: string | null
  wcmName: string | null
  wcmNotified: boolean
}): Promise<{ account_ok: boolean; email_sent: boolean; error?: string }> {
  try {
    const html = directorConfirmationEmail({
      directorName: opts.directorName,
      departmentName: opts.departmentName,
      wcmName: opts.wcmName,
      wcmNotified: opts.wcmNotified,
    })

    const emailResult = await sendEmail({
      to: opts.directorEmail,
      subject: `Confirmed: BCPS Web Content Manager Roster for ${opts.departmentName}`,
      replyTo: 'sean.russell@browardschools.com',
      html,
      kind: 'wcm-roster-approval-director',
      context: { department: opts.departmentName, wcm_name: opts.wcmName },
    })
    // account_ok is reported true because no account is attempted: director
    // portal accounts are ON HOLD (Sean, 2026-09-15 - "I'm not ready to give
    // directors accounts yet, we've got to do some cleaning up first"). This
    // replaces the 2026-09-12 behaviour of silently provisioning the account
    // now and withholding only the invite link. The confirmation email and
    // the playbook link need no account, so approval is unaffected.
    return { account_ok: true, email_sent: emailResult.ok, error: emailResult.ok ? undefined : emailResult.error ?? undefined }
  } catch (e: unknown) {
    return { account_ok: true, email_sent: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// WCM account + email, sent only when this approval actually designates a
// WCM (action === 'add'). Mirrors wcm-invite's manual "Send Portal Invite"
// button exactly, just fired automatically at the moment of approval
// instead of waiting for someone to click it separately on the department
// page.
async function notifyWcm(opts: {
  wcmEmail: string
  wcmName: string
  departmentName: string
  departmentSlug: string | null
}): Promise<{ account_ok: boolean; email_sent: boolean; error?: string }> {
  try {
    const resolved = await resolveOrInviteAccount(opts.wcmEmail, opts.wcmName)
    if (!resolved.ok) return { account_ok: false, email_sent: false, error: resolved.error }
    const { userId, isNewAccount, actionLink } = resolved.account

    const enrolled = await enrollBcpsMember({
      userId,
      email: opts.wcmEmail,
      fullName: opts.wcmName,
      departmentName: opts.departmentName,
      departmentSlug: opts.departmentSlug,
      addToWcmGroup: true,
    })
    if (!enrolled.ok) return { account_ok: false, email_sent: false, error: enrolled.error }

    const html = wcmConfirmationEmail({
      wcmName: opts.wcmName,
      departmentName: opts.departmentName,
      isNewAccount,
      failsafeHref: isNewAccount ? actionLink! : `${SITE}/login`,
    })

    const emailResult = await sendEmail({
      to: opts.wcmEmail,
      subject: isNewAccount
        ? `You're invited: BCPS Web Content Manager for ${opts.departmentName}`
        : `You're confirmed: BCPS Web Content Manager for ${opts.departmentName}`,
      replyTo: 'sean.russell@browardschools.com',
      html,
      kind: 'wcm-roster-approval-wcm',
      context: { department: opts.departmentName, is_new_account: isNewAccount },
    })
    return { account_ok: true, email_sent: emailResult.ok, error: emailResult.ok ? undefined : emailResult.error ?? undefined }
  } catch (e: unknown) {
    return { account_ok: false, email_sent: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// AUTH, rewritten 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED).
// Both handlers used to accept a shared static ACCESS_KEY passed as a URL
// query parameter (?access_key=...). That key shipped in the client bundle
// and sat in a PUBLIC GitHub repo, so this route was effectively open:
// GET dumped the whole roster including every WCM's name, work email and
// personnel number, and PATCH let anyone approve any pending submission -
// which writes bcps_departments.director_email and, since 7723385/8e421bd,
// provisions and enrols a real portal account for that address.
//
// Both are now requireBcpsAdmin (src/lib/bcps-auth.ts) - the same check that
// already guards admin-set-department, admin-reset-password, admin-decision
// and run-audit, per canon-gate-new-surfaces-on-the-same-check. The only UI
// caller (WCMPage's roster queue) is behind the admin console already.

// GET: full roster (departments, alphabetical) with each department's
// current director + assigned WCM(s), plus any submissions still awaiting
// review. Backs the "WCM Roster" tab in the Department WCMS Portal.
export async function GET(req: NextRequest) {
  // Web Content Managers get a READ-ONLY view of the roster and its outcomes
  // (Sean, 2026-09-15: "they should only be able to see the roster and the
  // results of that"). Approving stays admin-only - the PATCH below is
  // unchanged. A non-admin district user gets the roster with the approval
  // dates and no pending-submission queue; personnel numbers and WCM email
  // addresses are withheld, since the read-only view is a directory, not the
  // staff record the admin queue is.
  const admin = await requireBcpsAdmin(req)
  if (!admin.ok) {
    const viewer = await requireDistrictUser(req)
    if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.status })

    const [{ data: roster }, { data: members }] = await Promise.all([
      supabase.from('bcps_wcm_roster')
        .select('id, department_name, location_number, director_name, updated_at')
        .order('department_name', { ascending: true }),
      supabase.from('bcps_wcm_roster_members')
        .select('id, roster_id, wcm_name, approved_at, added_at')
        .order('added_at', { ascending: true }),
    ])
    const byRoster = new Map<string, unknown[]>()
    for (const m of members ?? []) {
      const list = byRoster.get(m.roster_id) ?? []
      list.push({ id: m.id, wcm_name: m.wcm_name, approved_at: m.approved_at, wcm_email: null, wcm_personnel_number: null })
      byRoster.set(m.roster_id, list)
    }
    const res = NextResponse.json({
      read_only: true,
      roster: (roster ?? []).map(r => ({ ...r, wcms: byRoster.get(r.id) ?? [] })),
      submissions: [],
    })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }
  const auth = admin

  const [{ data: roster, error: rosterErr }, { data: members, error: memberErr }, { data: submissions, error: subErr }] =
    await Promise.all([
      supabase.from('bcps_wcm_roster')
        .select('id, department_name, location_number, matched_department_id, director_name, updated_at')
        .order('department_name', { ascending: true }),
      supabase.from('bcps_wcm_roster_members')
        .select('id, roster_id, wcm_name, wcm_personnel_number, wcm_email, added_at, approved_at')
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
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
        status: 'rejected', reviewed_at: now, reviewed_by: auth.user.email || reviewer || 'admin', review_notes: notes ?? null,
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
      // approved_at is the date this director submission was approved, shown
      // beside the WCM on the roster (Sean, 2026-09-15). A row added by hand
      // by an admin has no submission behind it and stays null - the UI
      // labels those "Added manually" rather than showing a blank date.
      await supabase.from('bcps_wcm_roster_members').insert({
        roster_id: rosterRow.id,
        wcm_name: submission.wcm_name,
        wcm_personnel_number: submission.wcm_personnel_number,
        wcm_email: submission.wcm_email,
        approved_at: now,
        approved_from_submission_id: submission.id,
      })
    }
    // action === 'na': roster director already updated above, no member row change.

    // Mirror onto the website-audit tool's department record, if this
    // department is one of the ones already tracked there. Approving is
    // the District Web Team's manual confirmation that this submission is
    // legitimate, so a submitter_email on the submission becomes the
    // director_email of record too - this is how that field gets populated
    // over time without needing an upfront authoritative source.
    // Legacy-row guard, added 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED).
    // Every row submitted before this date came in through the old shared-key
    // endpoint, where submitter_email was free text from the request body and
    // was never checked against anything - one live pending row carries a
    // @comcast.com address. Approving such a row would write that address into
    // bcps_departments.director_email AND provision + enrol a real BCPS portal
    // account for it. New submissions are safe (submitter_email is taken from
    // the session), but the backlog is not, so the district-domain rule is
    // enforced here at the point of use rather than trusted from the row.
    // A non-district submitter no longer blocks the roster decision itself -
    // it just cannot become an identity of record.
    const submitterEmail: string | null = submission.submitter_email ?? null
    const submitterUsable = !!submitterEmail && isDistrictEmail(submitterEmail)
    const submitterRejected = !!submitterEmail && !submitterUsable
    // The roster form is public again (2026-09-15), so a submitter address can
    // be self-declared rather than proven by a session. A district address is
    // still good enough to EMAIL - that is just replying to whoever wrote in -
    // but never good enough to become bcps_departments.director_email, which
    // is an identity of record. Only a session-verified address writes that.
    const rawPayload = (submission.raw_payload ?? {}) as Record<string, unknown>
    const submitterSessionVerified = rawPayload.submitter_email_session_verified !== false

    let departmentSlug: string | null = null
    let departmentDisplayName = submission.department_name
    if (rosterRow.matched_department_id && submissionAction !== 'remove') {
      const deptUpdate: Record<string, string> = {
        wcm_name: submission.wcm_name,
        director_name: submission.director_name,
      }
      if (submitterUsable && submitterSessionVerified) deptUpdate.director_email = submitterEmail!
      const { data: updatedDept } = await supabase
        .from('bcps_departments')
        .update(deptUpdate)
        .eq('id', rosterRow.matched_department_id)
        .select('slug, name')
        .maybeSingle()
      departmentSlug = updatedDept?.slug ?? null
      departmentDisplayName = updatedDept?.name ?? departmentDisplayName
    }

    await supabase.from('bcps_wcm_roster_submissions').update({
      status: 'approved', reviewed_at: now, reviewed_by: auth.user.email || reviewer || 'admin',
    }).eq('id', id)

    // Get the real person - director, and the WCM if this approval
    // designates one - into a working account and notify them directly.
    // Best-effort: reported back in the response, never blocks the
    // approval that already happened above. WCM resolved first so the
    // director's email can truthfully say whether the WCM was actually
    // notified, rather than assuming success.
    let wcmNotice: Awaited<ReturnType<typeof notifyWcm>> | null = null
    if (submissionAction === 'add' && submission.wcm_email) {
      wcmNotice = await notifyWcm({
        wcmEmail: submission.wcm_email,
        wcmName: submission.wcm_name || 'there',
        departmentName: departmentDisplayName,
        departmentSlug,
      })
    }

    let directorNotice: Awaited<ReturnType<typeof notifyDirector>> | null = null
    if (submitterUsable) {
      directorNotice = await notifyDirector({
        directorEmail: submitterEmail!,
        directorName: submission.director_name || 'there',
        departmentName: departmentDisplayName,
        departmentSlug,
        wcmName: submissionAction === 'add' ? (submission.wcm_name || null) : null,
        wcmNotified: !!wcmNotice?.email_sent,
      })
    }

    return NextResponse.json({
      success: true,
      action: 'approved',
      director_notice: directorNotice,
      wcm_notice: wcmNotice,
      // Set when the roster change was applied but the submitter's address was
      // not district-issued, so no director_email was recorded and no account
      // was created. Surfaced in the queue UI so it is a visible outcome.
      submitter_rejected: submitterRejected
        ? `Roster updated, but "${submitterEmail}" is not a @browardschools.com address, so it was not recorded as the director email.`
        : null,
      // Set when the submission came through the public form without a
      // session: the confirmation email still goes out, but the address was
      // not recorded as the director of record.
      submitter_unverified: submitterUsable && !submitterSessionVerified
        ? `Confirmation sent to "${submitterEmail}", but it was self-declared on the public form and was not recorded as the director email of record.`
        : null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
