import { NextRequest, NextResponse } from 'next/server'
import { svc, caller, schoolByLoc } from '@/lib/proudPointsApi'
import { sendEmail } from '@/lib/resend'
import { isReviewer, isValidRejectionReason, escapeHtml, signPhoto, schoolState, type ProudPoint } from '@/lib/proudPoints'

// District Web Team review queue for Proud Points: the same reviewers and the
// same approve / reject / mark-posted flow as banners (/api/banner/review).
// Mark posted is the step that tells the WCM it is live: the web team posts in
// Finalsite, clicks Mark posted, and the WCM gets the email (Sean, 2026-10-08).
//
// GET: every submitted row (drafts excluded) with signed photo links.
// POST: { id, action: approve | reject | mark_posted | unmark_posted, rejection_reason? }
//    or { action: 'set_school', loc, has_six: true | false | null }  (override)

const FOOTER = 'This is an automated message from the School Proud Points Submission Form.'
const REPLY_TO = 'sean.russell@browardschools.com'

function slug(s: string | null | undefined) {
  return (s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 50)
}

async function requireReviewer(req: NextRequest) {
  const user = await caller(req)
  if (!user) return { ok: false as const, status: 401 }
  const role = await isReviewer(svc, user)
  if (!role) return { ok: false as const, status: 403 }
  return { ok: true as const, user, role }
}

export async function GET(req: NextRequest) {
  const auth = await requireReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const { data, error } = await svc.from('bcps_proud_point_submissions')
    .select('*').neq('status', 'draft').is('archived_at', null)
    .order('submitted_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paths = (data ?? []).flatMap(r => (r.points as ProudPoint[]).map(p => p.photo_path)).filter((p): p is string => !!p)
  const { data: photos } = paths.length
    ? await svc.from('bcps_proud_point_photos').select('path, width, height, content_scan').in('path', paths)
    : { data: [] as { path: string; width: number; height: number; content_scan: { text_detected?: boolean; text_reason?: string } | null }[] }
  const photoInfo = new Map((photos ?? []).map(p => [p.path, p]))

  const rows = await Promise.all((data ?? []).map(async r => ({
    ...r,
    points: await Promise.all((r.points as ProudPoint[]).map(async p => {
      const info = p.photo_path ? photoInfo.get(p.photo_path) : undefined
      const ext = (p.photo_name?.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
      const signed = await signPhoto(svc, p.photo_path, `${slug(r.school_name)}_proud-point-${p.slot}_${slug(p.heading)}.${ext}`)
      return {
        ...p, photo_url: signed.url, download_url: signed.download_url,
        width: info?.width ?? null, height: info?.height ?? null,
        text_detected: !!info?.content_scan?.text_detected,
      }
    })),
  })))

  const { data: overrides } = await svc.from('bcps_proud_point_schools').select('loc_no, has_six, set_by_email, updated_at')
  return NextResponse.json({ submissions: rows, overrides: overrides ?? [], my_role: auth.role })
}

export async function POST(req: NextRequest) {
  const auth = await requireReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = (await req.json().catch(() => ({}))) as {
    id?: string; action?: string; rejection_reason?: string; loc?: string; has_six?: boolean | null
  }

  // Override for a school the old sheet gets wrong. null clears it.
  if (body.action === 'set_school') {
    const school = await schoolByLoc(body.loc)
    if (!school) return NextResponse.json({ error: 'Unknown school' }, { status: 400 })
    if (body.has_six === null || body.has_six === undefined) {
      await svc.from('bcps_proud_point_schools').delete().eq('loc_no', school.loc_no)
    } else {
      const { error } = await svc.from('bcps_proud_point_schools').upsert({
        loc_no: school.loc_no, has_six: !!body.has_six, set_by_email: auth.user.email, updated_at: new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const state = await schoolState(svc, school.loc_no)
    return NextResponse.json({ ok: true, has_six: state.has_six, override: state.override })
  }

  const { id, action } = body
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  const { data: sub } = await svc.from('bcps_proud_point_submissions').select('*').eq('id', id).maybeSingle()
  if (!sub || sub.status === 'draft') return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  const label = sub.kind === 'initial' ? 'Proud Points' : 'replacement Proud Point'
  const school = sub.school_name || 'your school'
  const to = sub.wcm_email as string | null

  if (action === 'mark_posted' || action === 'unmark_posted') {
    if (sub.status !== 'approved') return NextResponse.json({ error: 'Only approved submissions can be marked as posted.' }, { status: 400 })
    const posting = action === 'mark_posted'
    const update: Record<string, unknown> = {
      posted_at: posting ? now : null, posted_by: posting ? auth.user.id : null,
      posted_by_email: posting ? auth.user.email : null, updated_at: now,
    }
    let emailed = false
    let warning: string | undefined
    // The "it's live" email, once per posting (an undo and re-post does not
    // email the WCM twice).
    if (posting && !sub.posted_email_sent_at) {
      if (to) {
        const result = await sendEmail({
          to, replyTo: REPLY_TO, kind: 'proud-points-posted', context: { submission_id: id },
          subject: `School Proud Points: your ${label} ${sub.kind === 'initial' ? 'are' : 'is'} live on ${school}'s homepage`,
          html: `
            <p>Hi Web Content Manager,</p>
            <p>Your ${label} for <strong>${escapeHtml(school)}</strong> ${sub.kind === 'initial' ? 'are' : 'is'} now live on your school homepage.
            Take a look and let us know if anything needs a change.</p>
            <p>Best regards,<br />District Web Team</p>
            <p style="color:#888;font-size:12px">${FOOTER}</p>`,
        })
        emailed = result.ok
        if (!result.ok) warning = result.error
        update.posted_email_sent_at = result.ok ? now : null
        update.posted_email_error = result.ok ? null : (result.error || 'Unknown send error')
      } else {
        warning = 'No email on file for this WCM. Marked posted but not emailed.'
        update.posted_email_error = warning
      }
    }
    const { error } = await svc.from('bcps_proud_point_submissions').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, emailed, warning })
  }

  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (sub.status !== 'pending') return NextResponse.json({ error: 'This submission was already reviewed.' }, { status: 409 })
  const reason = (body.rejection_reason || '').trim()
  if (action === 'reject' && !isValidRejectionReason(reason)) {
    return NextResponse.json({ error: 'Choose a reason, or "Other" with a comment.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: auth.user.id, reviewed_by_email: auth.user.email, reviewed_at: now, updated_at: now,
  }
  let emailed = false
  let warning: string | undefined
  if (to) {
    const result = action === 'reject'
      ? await sendEmail({
          to, replyTo: REPLY_TO, kind: 'proud-points-rejected', context: { submission_id: id },
          subject: `School Proud Points: your ${label} need${sub.kind === 'initial' ? '' : 's'} changes`,
          html: `
            <p>Hi Web Content Manager,</p>
            <p>The District Web Team reviewed your ${label} for <strong>${escapeHtml(school)}</strong> and could not post ${sub.kind === 'initial' ? 'them' : 'it'} yet.</p>
            <p style="background:#f7f7f7;border-left:3px solid #c0392b;padding:12px 16px;color:#333">${escapeHtml(reason)}</p>
            <p>Open the Proud Points form (on the WCM Community page, or at <a href="https://bcpsmarcomm.com/embed/proud-points">bcpsmarcomm.com/embed/proud-points</a>), choose <strong>Edit and resend</strong> under My Submissions, make the change, and send it again.</p>
            <p>Best regards,<br />District Web Team</p>
            <p style="color:#888;font-size:12px">${FOOTER}</p>`,
        })
      : await sendEmail({
          to, replyTo: REPLY_TO, kind: 'proud-points-approved', context: { submission_id: id },
          subject: `School Proud Points: your ${label} ${sub.kind === 'initial' ? 'were' : 'was'} approved`,
          html: `
            <p>Hi Web Content Manager,</p>
            <p>Great work! Your ${label} for <strong>${escapeHtml(school)}</strong> ${sub.kind === 'initial' ? 'were' : 'was'} approved by the District Web Team.
            We will email you again as soon as ${sub.kind === 'initial' ? 'they are' : 'it is'} live on your homepage.</p>
            <p>Best regards,<br />District Web Team</p>
            <p style="color:#888;font-size:12px">${FOOTER}</p>`,
        })
    emailed = result.ok
    if (!result.ok) warning = result.error
    const col = action === 'reject' ? 'rejection' : 'approval'
    update[`${col}_email_sent_at`] = result.ok ? now : null
    update[`${col}_email_error`] = result.ok ? null : (result.error || 'Unknown send error')
  } else {
    warning = 'No email on file for this WCM. Saved but not emailed.'
  }
  if (action === 'reject') update.rejection_reason = reason

  const { error } = await svc.from('bcps_proud_point_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, emailed, warning })
}
