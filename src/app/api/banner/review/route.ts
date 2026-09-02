import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
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
      const { data: signed } = await svc.storage.from('bcps-client').createSignedUrl(row.file_path, 60 * 30)
      return { ...row, signed_url: signed?.signedUrl ?? null }
    }
    return { ...row, signed_url: null }
  }))

  return NextResponse.json({ submissions: withUrls, my_role: auth.role })
}

// POST: approve or reject one submission.
// body: { id, action: 'approve' | 'reject', rejection_reason? }
export async function POST(req: NextRequest) {
  const auth = await requireBannerReviewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { id, action, rejection_reason } = body as { id?: string; action?: 'approve' | 'reject'; rejection_reason?: string }
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  if (action === 'reject' && !rejection_reason?.trim()) {
    return NextResponse.json({ error: 'A rejection reason is required.' }, { status: 400 })
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
    update.rejection_reason = rejection_reason!.trim()

    if (submission.wcm_email) {
      const label = submission.type === 'upload'
        ? (submission.banner_title || submission.file_name || 'your banner submission')
        : (submission.removal_description || 'your removal request')
      const safeReason = update.rejection_reason.toString().replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const result = await sendEmail({
        to: submission.wcm_email,
        subject: `BCPS Banner Submission: "${label}" was not approved`,
        replyTo: 'sean.russell@browardschools.com',
        html: `
          <p>Hi,</p>
          <p>Your ${submission.type === 'upload' ? 'banner submission' : 'removal request'} <strong>"${label}"</strong>
          was reviewed by the District Web Team and was <strong>not approved</strong>.</p>
          <p style="background:#f7f7f7;border-left:3px solid #c0392b;padding:12px 16px;color:#333">${safeReason}</p>
          <p>You're welcome to correct the issue and submit again through the Banner tool on your bcpsmarcomm.com dashboard.</p>
          <p style="color:#888;font-size:12px">This is an automated message from the BCPS WCM Banner Submission App.</p>
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
  }

  const { error } = await svc.from('bcps_banner_submissions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, emailed, warning: emailWarning })
}
