import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { esc, brandedEmail, resolveOrInviteAccount, enrollBcpsMember, wcmConfirmationEmail, SITE } from '@/lib/bcps-portal-account'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

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
  wcmNotified: boolean
}): Promise<{ account_ok: boolean; email_sent: boolean; error?: string }> {
  try {
    const resolved = await resolveOrInviteAccount(opts.directorEmail, opts.directorName)
    if (!resolved.ok) return { account_ok: false, email_sent: false, error: resolved.error }
    const { userId } = resolved.account

    const enrolled = await enrollBcpsMember({
      userId,
      email: opts.directorEmail,
      fullName: opts.directorName,
      departmentName: opts.departmentName,
      departmentSlug: opts.departmentSlug,
      addToWcmGroup: false,
    })
    if (!enrolled.ok) return { account_ok: false, email_sent: false, error: enrolled.error }

    const html = brandedEmail({
      heading: `You're confirmed for 2026-27`,
      body: `
        <p>Hi ${esc(opts.directorName)},</p>
        <p>Your Web Content Manager Roster submission for <strong>${esc(opts.departmentName)}</strong>
        has been reviewed and approved. You're all set for the 2026-27 school year.</p>
        ${opts.wcmNotified ? `
        <p>Your Web Content Manager has already received their own email with everything they need to get
        started, so there's nothing you need to pass along.</p>` : ''}
        <p>Watch for the next <strong>Communique</strong>: that's when we'll walk you through your own
        BCPS Web Team Portal access, including a tour of what's available for your department.</p>
        <p>Need to add or remove a Web Content Manager before then, or something else changed? Use the same
        <a href="${SITE}/wcm-roster-signup">roster form</a> any time, no need to start over.</p>
      `,
    })

    const emailResult = await sendEmail({
      to: opts.directorEmail,
      subject: `You're confirmed: BCPS Web Content Manager Roster for ${opts.departmentName}`,
      replyTo: 'sean.russell@browardschools.com',
      html,
    })
    return { account_ok: true, email_sent: emailResult.ok, error: emailResult.ok ? undefined : emailResult.error ?? undefined }
  } catch (e: unknown) {
    return { account_ok: false, email_sent: false, error: e instanceof Error ? e.message : 'Unknown error' }
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
    })
    return { account_ok: true, email_sent: emailResult.ok, error: emailResult.ok ? undefined : emailResult.error ?? undefined }
  } catch (e: unknown) {
    return { account_ok: false, email_sent: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

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
    // department is one of the ones already tracked there. Approving is
    // the District Web Team's manual confirmation that this submission is
    // legitimate, so a submitter_email on the submission becomes the
    // director_email of record too - this is how that field gets populated
    // over time without needing an upfront authoritative source.
    let departmentSlug: string | null = null
    let departmentDisplayName = submission.department_name
    if (rosterRow.matched_department_id && submissionAction !== 'remove') {
      const deptUpdate: Record<string, string> = {
        wcm_name: submission.wcm_name,
        director_name: submission.director_name,
      }
      if (submission.submitter_email) deptUpdate.director_email = submission.submitter_email
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
      status: 'approved', reviewed_at: now, reviewed_by: reviewer ?? 'admin',
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
    if (submission.submitter_email) {
      directorNotice = await notifyDirector({
        directorEmail: submission.submitter_email,
        directorName: submission.director_name || 'there',
        departmentName: departmentDisplayName,
        departmentSlug,
        wcmNotified: !!wcmNotice?.email_sent,
      })
    }

    return NextResponse.json({
      success: true,
      action: 'approved',
      director_notice: directorNotice,
      wcm_notice: wcmNotice,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
