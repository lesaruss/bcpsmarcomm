import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { esc, brandedEmail, resolveOrInviteAccount, enrollBcpsMember, wcmConfirmationEmail, directorConfirmationEmail, SITE } from '@/lib/bcps-portal-account'
import { requireBcpsAdmin, requireBcpsPageAccess, isDistrictEmail, normalizeDistrictEmail } from '@/lib/bcps-auth'

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
// How much a recorded director_email can be trusted. Higher wins.
//
// A write only lands when it is at least as strong as what is already on the
// department, so an Active Directory address is never quietly replaced by
// something typed on the public form, while a form response freely replaces an
// address whose provenance was never recorded.
const DIRECTOR_EMAIL_SOURCE_RANK: Record<string, number> = {
  unknown: 1,
  self_declared: 2,
  session_verified: 3,
  active_directory: 4,
}

async function notifyDirector(opts: {
  directorEmail: string
  directorName: string
  departmentName: string
  departmentSlug: string | null
  wcmName: string | null
  wcmNotified: boolean
  rosterMemberId?: string | null
  submissionId?: string | null
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
      context: {
        department: opts.departmentName,
        wcm_name: opts.wcmName,
        roster_member_id: opts.rosterMemberId ?? null,
        submission_id: opts.submissionId ?? null,
      },
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
  rosterMemberId?: string | null
  submissionId?: string | null
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
      context: {
        department: opts.departmentName,
        is_new_account: isNewAccount,
        roster_member_id: opts.rosterMemberId ?? null,
        submission_id: opts.submissionId ?? null,
      },
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

// Delivery status per WCM, read from the outbound email log
// (bcps_outbound_emails, written before every send attempt). Each approval
// sends up to two emails - the director's and the WCM's - and a member is
// only "confirmed" when every email it should have sent was accepted.
//
// Deliberately more than two states. "Confirmed or failed" cannot express a
// row where NO email was ever attempted (a submission with no address, or a
// member an admin added by hand), and showing those as either one would be
// a lie in a column meant to be trusted at a glance.
type DeliveryStatus = {
  state: 'confirmed' | 'failed' | 'pending' | 'not_sent'
  at: string | null
  detail: { to: string; subject: string; status: string; error: string | null; at: string | null }[]
}

async function deliveryByMember(memberIds: string[]): Promise<Map<string, DeliveryStatus>> {
  const out = new Map<string, DeliveryStatus>()
  if (memberIds.length === 0) return out

  const { data: rows } = await supabase.from('bcps_outbound_emails')
    .select('to_addresses, subject, status, last_error, sent_at, last_attempt_at, created_at, context')
    .in('context->>roster_member_id', memberIds)
    .order('created_at', { ascending: true })

  for (const r of rows ?? []) {
    const memberId = (r.context as Record<string, unknown> | null)?.roster_member_id as string | undefined
    if (!memberId) continue
    const entry = out.get(memberId) ?? { state: 'confirmed' as DeliveryStatus['state'], at: null, detail: [] }
    entry.detail.push({
      to: (r.to_addresses ?? []).join(', '),
      subject: r.subject,
      status: r.status,
      error: r.last_error ?? null,
      at: r.sent_at ?? r.last_attempt_at ?? r.created_at ?? null,
    })
    // Worst state wins: one failure makes the whole approval failed.
    if (r.status === 'failed') entry.state = 'failed'
    else if (r.status !== 'sent' && entry.state !== 'failed') entry.state = 'pending'
    if (r.status === 'sent' && r.sent_at && (!entry.at || r.sent_at > entry.at)) entry.at = r.sent_at
    if (r.status === 'failed') entry.at = r.last_attempt_at ?? entry.at
    out.set(memberId, entry)
  }
  return out
}

// Every department this roster references, keyed by bcps_departments.id, for
// the BCC-list director_email column - the roster itself only stores
// director_name, the confirmed address lives on bcps_departments (also read
// by the now-retired standalone "Roster" BCC tool, whose select-and-copy
// feature moved into this page - Sean, 2026-09-18).
async function directorEmailsByDepartment(deptIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  const ids = Array.from(new Set(deptIds))
  if (ids.length === 0) return out
  const { data } = await supabase.from('bcps_departments').select('id, director_email').in('id', ids)
  for (const d of data ?? []) out.set(d.id, d.director_email ?? null)
  return out
}

// GET: full roster (departments, alphabetical) with each department's
// current director + assigned WCM(s), plus any submissions still awaiting
// review. Backs the "WCM Roster" tab in the Department WCMS Portal.
export async function GET(req: NextRequest) {
  // (Superseded 2026-09-23, see below.) Open to every district user, not just admins (Sean, 2026-09-18): the
  // roster is a directory anyone should be able to browse and pull a BCC
  // list from. Approving/editing/deleting stays admin-only - the PATCH/
  // PUT/DELETE handlers below are unchanged and still require
  // requireBcpsAdmin. A non-admin viewer gets the roster and director/WCM
  // emails for the BCC tool, but no pending-submission queue and no
  // personnel numbers - those are the staff record the admin queue is, not
  // the directory this view is.
  //
  // 2026-09-23, per Sean (Hot Lab 2026-09-22): the roster is a District Web
  // Team tool again, not a directory for every district user. The
  // non-admin branch now gates on the wcm-roster page grant
  // (requireBcpsPageAccess), the same acl rows that decide whether the page
  // shows in the sidebar, so WCMs lose the page and its data together.
  // Today that grant is the District Web Team group; widening it later is a
  // data change, not a code change.
  const admin = await requireBcpsAdmin(req)
  if (!admin.ok) {
    const viewer = await requireBcpsPageAccess(req, 'wcm-roster')
    if (!viewer.ok) return NextResponse.json({ error: viewer.error }, { status: viewer.status })

    const [{ data: roster }, { data: members }] = await Promise.all([
      supabase.from('bcps_wcm_roster')
        .select('id, department_name, location_number, matched_department_id, director_name, updated_at')
        .order('department_name', { ascending: true }),
      supabase.from('bcps_wcm_roster_members')
        .select('id, roster_id, wcm_name, wcm_email, approved_at, added_at')
        .order('added_at', { ascending: true }),
    ])
    const directorEmails = await directorEmailsByDepartment((roster ?? []).map(r => r.matched_department_id).filter(Boolean))
    const byRoster = new Map<string, unknown[]>()
    for (const m of members ?? []) {
      const list = byRoster.get(m.roster_id) ?? []
      list.push({ id: m.id, wcm_name: m.wcm_name, approved_at: m.approved_at, wcm_email: m.wcm_email, wcm_personnel_number: null })
      byRoster.set(m.roster_id, list)
    }
    const res = NextResponse.json({
      read_only: true,
      roster: (roster ?? []).map(r => ({
        ...r,
        director_email: r.matched_department_id ? directorEmails.get(r.matched_department_id) ?? null : null,
        wcms: byRoster.get(r.id) ?? [],
      })),
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

  const [delivery, directorEmails] = await Promise.all([
    deliveryByMember((members ?? []).map(m => m.id)),
    directorEmailsByDepartment((roster ?? []).map(r => r.matched_department_id).filter(Boolean)),
  ])

  const membersByRoster = new Map<string, unknown[]>()
  for (const m of members ?? []) {
    const list = membersByRoster.get(m.roster_id) ?? []
    // A member with no approval date was added by hand, so no email was ever
    // owed for it - that is 'not_sent', not a failure.
    const d = delivery.get(m.id) ?? {
      state: m.approved_at ? 'not_sent' : 'not_sent', at: null, detail: [],
    }
    list.push({ ...m, delivery: d })
    membersByRoster.set(m.roster_id, list)
  }

  const rosterWithMembers = (roster ?? []).map(r => ({
    ...r,
    director_email: r.matched_department_id ? directorEmails.get(r.matched_department_id) ?? null : null,
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
// approve + action=confirm -> same as na: director_name only, no member change.
//                             The director reviewed the WCM(s) on file and they
//                             stand; wcm_name holds those names for display only.
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

    const submissionAction: 'add' | 'remove' | 'na' | 'confirm' = submission.action ?? 'add'

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

    // Carried into each notification's context so the roster can show, per
    // WCM, whether their approval emails actually went out.
    // Repaired at the point of use as well as at intake, because the backlog
    // predates the intake check: four pending rows carried a mistyped district
    // domain that a mail provider accepts and then bounces. Normalizing here
    // means the roster row, the notification and the skip check all agree on
    // one address, and a typo cannot reach a member row.
    const wcmEmail = normalizeDistrictEmail(submission.wcm_email)

    let memberId: string | null = null

    if (submissionAction === 'remove' && submission.target_member_id) {
      await supabase.from('bcps_wcm_roster_members').delete().eq('id', submission.target_member_id)
    } else if (submissionAction === 'add') {
      // approved_at is the date this director submission was approved, shown
      // beside the WCM on the roster (Sean, 2026-09-15). A row added by hand
      // by an admin has no submission behind it and stays null - the UI
      // labels those "Added manually" rather than showing a blank date.
      const { data: insertedMember } = await supabase.from('bcps_wcm_roster_members').insert({
        roster_id: rosterRow.id,
        wcm_name: submission.wcm_name,
        wcm_personnel_number: submission.wcm_personnel_number,
        wcm_email: wcmEmail,
        approved_at: now,
        approved_from_submission_id: submission.id,
      }).select('id').single()
      memberId = insertedMember?.id ?? null
    }
    // action === 'na' | 'confirm': roster director already updated above, no member row change.

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
    // Fail closed on absence. The intake route writes this flag explicitly on
    // every submission, true or false, so a row WITHOUT it is a legacy row from
    // the old shared-key endpoint where submitter_email was unchecked free text
    // from the request body. Defaulting those to verified trusted exactly the
    // backlog the guard above says cannot be trusted: on 2026-09-15 all 73
    // pending rows predate the flag, so every one of them would have written a
    // hand-typed address into bcps_departments.director_email as an identity of
    // record. Absent now means unproven, which still emails the submitter and
    // still applies the roster change, and only withholds the of-record write.
    const submitterSessionVerified = rawPayload.submitter_email_session_verified === true

    let departmentSlug: string | null = null
    let departmentDisplayName = submission.department_name
    let directorEmailRecordedAs: string | null = null
    if (rosterRow.matched_department_id && submissionAction !== 'remove') {
      const deptUpdate: Record<string, string> = {
        director_name: submission.director_name,
      }
      // A confirm's wcm_name is a display list of everyone confirmed, not one
      // WCM of record, so it must not overwrite the department's wcm_name.
      if (submissionAction !== 'confirm') deptUpdate.wcm_name = submission.wcm_name
      // Sean, 2026-09-15: a district address given on the roster form IS
      // recorded as the working director of record. There is no authoritative
      // district source yet, an Active Directory export is not available, and
      // an absent email helps nobody. What keeps this provisional rather than
      // permanent by accident is director_email_source: every write records
      // where the address came from, so an AD export can later overwrite
      // exactly the self-declared ones and leave proven ones untouched.
      if (submitterUsable) {
        const incomingSource = submitterSessionVerified ? 'session_verified' : 'self_declared'
        const { data: currentDept } = await supabase
          .from('bcps_departments')
          .select('director_email_source')
          .eq('id', rosterRow.matched_department_id)
          .maybeSingle()
        const currentRank = DIRECTOR_EMAIL_SOURCE_RANK[currentDept?.director_email_source ?? ''] ?? 0
        if (DIRECTOR_EMAIL_SOURCE_RANK[incomingSource] >= currentRank) {
          deptUpdate.director_email = submitterEmail!
          deptUpdate.director_email_source = incomingSource
          directorEmailRecordedAs = incomingSource
        }
      }
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
    // Why an email was NOT attempted, so the console can say so out loud.
    // Without this, a submission missing an address approves in silence and
    // looks identical to one where both emails went out - which is exactly
    // the wrong signal when someone is working through a queue of them.
    let wcmSkipped: string | null = null
    let directorSkipped: string | null = null
    if (submissionAction === 'add' && !wcmEmail) {
      wcmSkipped = `No WCM email address on this submission, so ${submission.wcm_name || 'the WCM'} was not emailed and no account was created.`
    }
    if (!submitterEmail) {
      directorSkipped = 'No submitter address on this submission, so the director was not emailed.'
    }

    let wcmNotice: Awaited<ReturnType<typeof notifyWcm>> | null = null
    if (submissionAction === 'add' && wcmEmail) {
      wcmNotice = await notifyWcm({
        wcmEmail,
        wcmName: submission.wcm_name || 'there',
        departmentName: departmentDisplayName,
        departmentSlug,
        rosterMemberId: memberId,
        submissionId: submission.id,
      })
    }

    let directorNotice: Awaited<ReturnType<typeof notifyDirector>> | null = null
    if (submitterUsable) {
      directorNotice = await notifyDirector({
        directorEmail: submitterEmail!,
        directorName: submission.director_name || 'there',
        departmentName: departmentDisplayName,
        departmentSlug,
        // A confirm names the WCM(s) the director just re-confirmed, so the
        // email says who is on record rather than "no dedicated WCM".
        wcmName: submissionAction === 'add' || submissionAction === 'confirm' ? (submission.wcm_name || null) : null,
        wcmNotified: !!wcmNotice?.email_sent,
        rosterMemberId: memberId,
        submissionId: submission.id,
      })
    }

    return NextResponse.json({
      success: true,
      action: 'approved',
      director_notice: directorNotice,
      wcm_notice: wcmNotice,
      director_skipped: directorSkipped,
      wcm_skipped: wcmSkipped,
      // True only when every email this approval SHOULD have sent was
      // accepted by the mail provider. The console shows a plain
      // confirmation on this rather than leaving silence to mean success.
      emails_ok:
        !directorSkipped && !wcmSkipped &&
        (!directorNotice || directorNotice.email_sent) &&
        (!wcmNotice || wcmNotice.email_sent),
      // Set when the roster change was applied but the submitter's address was
      // not district-issued, so no director_email was recorded and no account
      // was created. Surfaced in the queue UI so it is a visible outcome.
      submitter_rejected: submitterRejected
        ? `Roster updated, but "${submitterEmail}" is not a @browardschools.com address, so it was not recorded as the director email.`
        : null,
      // Informational, never a failure. The address WAS recorded, flagged as
      // self-declared so an Active Directory export can replace exactly these
      // later. The console shows this inline rather than as a dialog: working
      // a queue of seventy, a modal on every approval trains you to dismiss it
      // unread, which is how a real failure gets missed.
      director_email_provisional: directorEmailRecordedAs === 'self_declared'
        ? `Recorded "${submitterEmail}" as the director email, flagged self-declared until a district source confirms it.`
        : null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT: admin edits a confirmed roster member's name, personnel number, or
// email directly - the manual-correction path Sean asked for after finding
// duplicate registrations and a truncated name ("Lorena") in the live data,
// so fixing it doesn't require a direct database edit next time.
export async function PUT(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { id, wcm_name, wcm_personnel_number, wcm_email } = await req.json() as {
      id?: string; wcm_name?: string; wcm_personnel_number?: string | null; wcm_email?: string | null
    }
    if (!id || !wcm_name?.trim()) {
      return NextResponse.json({ error: 'id and wcm_name are required' }, { status: 400 })
    }

    const { error } = await supabase.from('bcps_wcm_roster_members').update({
      wcm_name: wcm_name.trim(),
      wcm_personnel_number: wcm_personnel_number?.trim() || null,
      wcm_email: wcm_email?.trim() ? normalizeDistrictEmail(wcm_email.trim()) : null,
    }).eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// DELETE: admin removes either a pending submission outright (distinct from
// Reject, which keeps the row marked rejected) or a confirmed roster member,
// per Sean 2026-09-18 - manual cleanup of duplicate/incorrect roster data
// used to mean editing the database directly.
export async function DELETE(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const { type, id } = await req.json() as { type?: 'submission' | 'member'; id?: string }
    if (!id || (type !== 'submission' && type !== 'member')) {
      return NextResponse.json({ error: 'type ("submission" or "member") and id are required' }, { status: 400 })
    }

    const table = type === 'submission' ? 'bcps_wcm_roster_submissions' : 'bcps_wcm_roster_members'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
