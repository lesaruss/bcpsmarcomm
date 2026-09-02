import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend'

// WCM Banner Submission App - Request Removal.
// WCM selects one of their OWN prior submissions and asks the District Web
// Team to take it down, giving a target removal date and a description
// identifying the file. Routes into the same review queue as uploads
// (bcps_banner_submissions, type='removal').
//
// Submission-received notification, per Sean, 2026-09-02: "Can I send
// Vanessa an email notification that it's been submitted or whoever she
// designates?" - same as the upload route: notifies every current row in
// bcps_banner_admins, best effort, never blocks the request itself, outcome
// logged onto the row.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

async function verifyCaller(token: string) {
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

async function notifyRemovalReceived(row: {
  id: string
  removal_description: string | null
  wcm_email: string | null
}) {
  const { data: admins } = await svc.from('bcps_banner_admins').select('email')
  const recipients = (admins ?? []).map(a => a.email).filter((e): e is string => !!e)
  if (recipients.length === 0) return

  const label = row.removal_description || 'a prior banner submission'
  const result = await sendEmail({
    to: recipients,
    subject: `New BCPS banner removal request: "${label}"`,
    html: `
      <p>Hi,</p>
      <p>${row.wcm_email ? `<strong>${row.wcm_email}</strong>` : 'A WCM'} just requested removal of a banner:
      <strong>"${label}"</strong>.</p>
      <p><a href="https://bcpsmarcomm.com/?page=banner-submissions">Review it in the Banner Submissions queue</a>.</p>
      <p style="color:#888;font-size:12px">This is an automated message from the BCPS WCM Banner Submission App. You're
      receiving it because you're listed as an Admin or Manager for this tool - manage that list from the Manage Admins
      tab on the Banner Submissions page.</p>
    `,
  })

  await svc.from('bcps_banner_submissions').update({
    notify_email_sent_at: result.ok ? new Date().toISOString() : null,
    notify_email_error: result.ok ? null : (result.error || 'Unknown send error'),
  }).eq('id', row.id)
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const user = await verifyCaller(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { target_submission_id, requested_removal_date, removal_description } = body as {
    target_submission_id?: string; requested_removal_date?: string; removal_description?: string
  }

  if (!target_submission_id) return NextResponse.json({ error: 'target_submission_id is required' }, { status: 400 })
  if (!removal_description?.trim()) return NextResponse.json({ error: 'A description identifying the file is required' }, { status: 400 })

  // Must be one of the caller's own prior uploads.
  const { data: target } = await svc.from('bcps_banner_submissions')
    .select('id, wcm_user_id, type')
    .eq('id', target_submission_id)
    .maybeSingle()
  if (!target || target.wcm_user_id !== user.id || target.type !== 'upload') {
    return NextResponse.json({ error: 'That submission was not found on your account.' }, { status: 404 })
  }

  const { data: row, error } = await svc.from('bcps_banner_submissions').insert({
    wcm_user_id: user.id,
    wcm_email: user.email,
    type: 'removal',
    status: 'pending',
    target_submission_id,
    requested_removal_date: requested_removal_date || null,
    removal_description: removal_description.trim(),
  }).select('id, removal_description, wcm_email').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifyRemovalReceived(row).catch(() => {})

  return NextResponse.json({ ok: true, id: row.id })
}
