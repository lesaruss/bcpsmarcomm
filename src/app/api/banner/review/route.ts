import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
import { signBannerFile } from '@/lib/bannerFiles'
import { sendEmail } from '@/lib/resend'

// WCM Banner Submission App - Internal Dashboard (District Web Team review
// queue). Admin AND Manager (bcps_banner_admins) can both see everything and
// approve/reject - the Admin/Manager distinction only governs who can manage
// the admin list itself (see /api/banner/admins). Rejection requires a
// reason, which stays attached to the record (visible to the WCM in their
// own dashboard widget via /api/banner/mine) and now also fires an automated
// templated email to the WCM the moment it's checked off - per Sean,
// 2026-09-02: "once the team checks off that the item was rejected, there is
// a templated message that is sent to the WCM... email." A failed send never
// blocks the rejection itself from saving; the error is logged onto the row.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

// Fixed rejection-reason categories, per the Vanessa Deslandes walkthrough
// (2026-09-08). Kept in sync with BannerWidget.tsx's REJECT_REASON_CATEGORIES.
// The widget only ever sends one of the three fixed labels verbatim, or
// "Other: <comment>" - validated here too so the category list is a real
// server-side rule, not just a client-side convenience.
const FIXED_REJECT_REASONS = [
  'Wrong photo dimensions or orientation',
  'Image quality too low',
  'Embedded text or logos',
  'Faces blurred, erased, or covered',
]

// Wording per Vanessa Deslandes, 2026-10-02: these emails come from the
// school-facing tool, not the District, so they say "School", never "BCPS".
// Greeting "Hi Web Content Manager," and the District Web Team sign-off on
// both WCM emails (Vanessa Deslandes, 2026-10-02).
const FOOTER = 'This is an automated message from the School WCM Banner Submission Form.'

// Vanessa Deslandes's wording, updated 2026-10-05 (adds the no-blurred-faces
// rule after a pilot WCM erased a face). Verbatim; the guidelines link is the
// district's published Identity Homepage Banner page.
const GUIDELINES_URL =
  'https://www.browardschools.com/wcm-community/schools/standards-guidelines/website-guidelines/homepage/identity-homepage-banner'
const GUIDELINES_LINK = `<a href="${GUIDELINES_URL}">Identity Banner Guidelines</a>`
const GUIDELINES_MESSAGE = `
  <p>As outlined in the ${GUIDELINES_LINK}, please review the following requirements before submitting new photos or videos:</p>
  <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6">
    <li><strong>High quality:</strong> Submit clear, high-resolution photos and videos.</li>
    <li><strong>Landscape orientation:</strong> Images should be horizontal/landscape to display correctly.</li>
    <li><strong>Faces:</strong> Do not submit photos where student or staff faces are blocked by the right-side navigation.</li>
    <li><strong>No embedded text:</strong> Photos and videos must be free of text, lettering, graphics, or other overlays.</li>
    <li><strong>Do not blur faces:</strong> Do not blur, cover, or otherwise edit student or staff faces. If a face should not appear in the image, please select a different photo.</li>
  </ul>
  <p>Please review the ${GUIDELINES_LINK} before submitting new images.</p>`

// Served from public/banner-guidelines.jpg; Resend fetches it at send time.
const GUIDELINES_ATTACHMENT = {
  filename: 'identity-banner-guidelines.jpg',
  path: 'https://bcpsmarcomm.com/banner-guidelines.jpg',
  content_id: 'banner-guidelines',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isValidRejectionReason(reason: string): boolean {
  if (FIXED_REJECT_REASONS.includes(reason)) return true
  const otherMatch = reason.match(/^Other:\s*([\s\S]+)$/)
  return !!otherMatch && otherMatch[1].trim().length > 0
}

async function requireBannerReviewer(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false as const, status: 401 }
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: row } = await svc.from('bcps_banner_admins')
    .select('role').eq('user_id', user.id).maybeSingle()
  if (!row) return { ok: false as const, status: 403 }
  return { ok: true as const, user, role: row.role as 'admin' | 'manager' }
}

// GET: every submission (uploads + removals) across all WCMs, newest first.
// Includes a signed URL for upload files so the reviewer can actually look
// at the image/video (bcps-client is a private bucket).
export async function GET(req: NextRequest) {
  const auth = await requireBannerReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const { data, error } = await svc.from('bcps_banner_submissions')
    .select('*')
    .order('submitted_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const withUrls = await Promise.all((data ?? []).map(async (row) => {
    if (row.type === 'upload' && row.file_path) {
      return { ...row, ...(await signBannerFile(svc, row)) }
    }
    return { ...row, signed_url: null, download_url: null }
  }))

  return NextResponse.json({ submissions: withUrls, my_role: auth.role })
}

// POST: approve or reject one submission, or mark an approved upload as
// posted to the school site (Sean + Vanessa Deslandes, 2026-09-29).
// body: { id, action: 'approve' | 'reject' | 'mark_posted' | 'unmark_posted', rejection_reason? }
export async function POST(req: NextRequest) {
  const auth = await requireBannerReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { id, action, rejection_reason } = body as { id?: string; action?: 'approve' | 'reject' | 'mark_posted' | 'unmark_posted'; rejection_reason?: string }
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  // Posted tracking: only an approved upload can be marked as on the site.
  // Undo clears it back to ready-to-post. Never touches review status.
  if (action === 'mark_posted' || action === 'unmark_posted') {
    const { data: row } = await svc.from('bcps_banner_submissions').select('id, type, status').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    if (row.type !== 'upload' || row.status !== 'approved') {
      return NextResponse.json({ error: 'Only approved uploads can be marked as posted.' }, { status: 400 })
    }
    const posting = action === 'mark_posted'
    const { error } = await svc.from('bcps_banner_submissions').update({
      posted_at: posting ? new Date().toISOString() : null,
      posted_by: posting ? auth.user.id : null,
      posted_by_email: posting ? auth.user.email : null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  if (action === 'reject') {
    if (!rejection_reason?.trim()) {
      return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
    }
    if (!isValidRejectionReason(rejection_reason.trim())) {
      return NextResponse.json({ error: 'Rejection reason must be one of the fixed categories, or "Other" with a comment.' }, { status: 400 })
    }
  }

  const { data: submission } = await svc.from('bcps_banner_submissions').select('*').eq('id', id).maybeSingle()
  if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

  const now = new Date().toISOString()
  const update: Record<string, unknown> = {
    status: action === 'approve' ? 'approved' : 'rejected',
    reviewed_by: auth.user.id,
    reviewed_by_email: auth.user.email,
    reviewed_at: now,
    updated_at: now,
  }

  let emailed = false
  let emailWarning: string | undefined

  if (action === 'reject') {
    const trimmedReason = rejection_reason!.trim()
    update.rejection_reason = trimmedReason

    if (submission.wcm_email) {
      const label = submission.type === 'upload'
        ? (submission.banner_title || submission.file_name || 'your banner submission')
        : (submission.removal_description || 'your removal request')
      const safeReason = escapeHtml(trimmedReason)
      // Uploads get Vanessa Deslandes's standard guidelines paragraph and the
      // guidelines sheet embedded in the body (2026-10-02) - a cid: inline
      // image, not a link, so the WCM sees the examples without clicking out.
      const isUpload = submission.type === 'upload'
      const result = await sendEmail({
        to: submission.wcm_email,
        subject: `School Banner Submission: "${label}" was not approved`,
        replyTo: 'sean.russell@browardschools.com',
        kind: 'banner-rejected',
        context: { submission_id: id },
        attachments: isUpload ? [GUIDELINES_ATTACHMENT] : undefined,
        html: `
          <p>Hi Web Content Manager,</p>
          <p>Your ${isUpload ? 'banner submission' : 'removal request'} <strong>"${escapeHtml(label)}"</strong>
          was reviewed by the District Web Team and was <strong>not approved</strong>.</p>
          <p style="background:#f7f7f7;border-left:3px solid #c0392b;padding:12px 16px;color:#333">${safeReason}</p>
          ${isUpload ? GUIDELINES_MESSAGE : ''}
          <p>You're welcome to correct the issue and submit again through the Banner tool on your bcpsmarcomm.com dashboard.</p>
          ${isUpload ? `<p><img src="cid:${GUIDELINES_ATTACHMENT.content_id}" alt="Identity Banner Guidelines: horizontal images only, leave space on the right for the navigation, and keep images clean and text-free." width="600" style="max-width:100%;height:auto;border:1px solid #ddd" /></p>` : ''}
          <p>Best regards,<br />District Web Team</p>
          <p style="color:#888;font-size:12px">${FOOTER}</p>
        `,
      })
      emailed = result.ok
      if (!result.ok) emailWarning = result.error
      update.rejection_email_sent_at = result.ok ? now : null
      update.rejection_email_error = result.ok ? null : (result.error || 'Unknown send error')
    } else {
      emailWarning = 'No email on file for this WCM - rejection saved but not emailed.'
      update.rejection_email_error = emailWarning
    }
  } else if (submission.type === 'upload') {
    // Approval email to the WCM (Vanessa Deslandes, 2026-10-02). Uploads
    // only; an approved removal request has nothing to post.
    if (submission.wcm_email) {
      const label = submission.banner_title || submission.file_name || 'your banner submission'
      const media = submission.file_type === 'video' ? 'video' : 'photo'
      const result = await sendEmail({
        to: submission.wcm_email,
        subject: `School Banner Submission: "${label}" was approved`,
        replyTo: 'sean.russell@browardschools.com',
        kind: 'banner-approved',
        context: { submission_id: id },
        html: `
          <p>Hi Web Content Manager,</p>
          <p>Great work! Your ${media} <strong>"${escapeHtml(label)}"</strong> has been approved by the District Web Team
          and will be posted to your website within 24 to 48 hours.</p>
          <p>Best regards,<br />District Web Team</p>
          <p style="color:#888;font-size:12px">${FOOTER}</p>
        `,
      })
      emailed = result.ok
      if (!result.ok) emailWarning = result.error
      update.approval_email_sent_at = result.ok ? now : null
      update.approval_email_error = result.ok ? null : (result.error || 'Unknown send error')
    } else {
      emailWarning = 'No email on file for this WCM - approval saved but not emailed.'
      update.approval_email_error = emailWarning
    }
  }

  const { error } = await svc.from('bcps_banner_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, emailed, warning: emailWarning })
}
