import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Bare-bones inbox for site reports (per Sean, 2026-07-29): lives on the
// main Dashboard, not a separate page. Reuses wcm_pilot_feedback as the
// message store rather than standing up a new table - it already has
// the sender identity, the message body, and (as of this change) read/
// reply state. Admin-only: this is Sean's inbox for reports submitted
// through the site-wide SiteFeedback widget, same access gate pattern as
// run-audit/admin-decision (acl_member_roles, brand=bcps, role in
// admin/superadmin).
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true; email: string; userId: string } | { ok: false; status: number }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403 }
  return { ok: true, email: user.email || '', userId: user.id }
}

// GET: list messages newest-first, plus an unread count for the topbar bell.
// Unread = no read_at yet, regardless of status. user_id is included (but
// never rendered directly) so the dashboard can decide whether Request
// Access is even offered - only messages tied to a real account can be
// diagnosed this way.
export async function GET(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const { data, error } = await svc
    .from('wcm_pilot_feedback')
    .select('id, created_at, email, page, message, status, read_at, admin_reply, replied_at, notify_error, user_id')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unread_count = (data ?? []).filter(m => !m.read_at).length
  return NextResponse.json({ messages: data ?? [], unread_count })
}

// POST: mark a message read, send a reply (which also marks it read), or
// request diagnostic access to the reporter's account.
//
// request_access (added 2026-07-29, per Sean): only ever fired from a
// specific ticket, not a standing "grant access" button on every member's
// profile - matches the stated need ("I'd only ever need to go into their
// page if they're having an issue"). Requires the message to be tied to a
// real signed-in account (msg.user_id); anonymous/pre-account reports have
// nothing to diagnose. Creates a support_access_grants row and emails the
// reporter a plain-language approval link - they must sign in as
// themselves to approve, which is what proves it's really them and not
// someone who intercepted the email.
export async function POST(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: 'read' | 'reply' | 'request_access' }
  if (!id || !action) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })

  const { data: msg } = await svc.from('wcm_pilot_feedback').select('*').eq('id', id).maybeSingle()
  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  if (action === 'read') {
    const { error } = await svc.from('wcm_pilot_feedback')
      .update({ read_at: msg.read_at ?? new Date().toISOString(), status: msg.status === 'new' ? 'read' : msg.status })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reply') {
    const replyText = (body?.reply_text || '').trim()
    if (!replyText) return NextResponse.json({ error: 'reply_text is required' }, { status: 400 })

    const now = new Date().toISOString()
    let replyError: string | null = null

    if (msg.email) {
      const safeReply = replyText.replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const result = await sendEmail({
        to: msg.email,
        subject: 'Re: your bcpsmarcomm.com report',
        replyTo: 'sean.russell@browardschools.com',
        html: `<p style="white-space:pre-wrap">${safeReply}</p><p style="color:#888;font-size:12px">In reply to: ${msg.message.slice(0, 200)}</p>`,
      })
      if (!result.ok) replyError = result.error || 'Unknown send error'
    } else {
      replyError = 'No email on file for this report - reply saved but not sent.'
    }

    const { error } = await svc.from('wcm_pilot_feedback').update({
      admin_reply: replyText,
      replied_at: now,
      replied_by: auth.email,
      read_at: msg.read_at ?? now,
      status: 'replied',
      reply_error: replyError,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true, emailed: !replyError, warning: replyError ?? undefined })
  }

  if (action === 'request_access') {
    if (!msg.user_id) {
      return NextResponse.json({ error: 'No account on this report to request access to.' }, { status: 400 })
    }
    if (!msg.email) {
      return NextResponse.json({ error: 'No email on file for this account.' }, { status: 400 })
    }

    // One open request per target at a time - if there's already a
    // requested/approved grant for this person, reuse it instead of
    // spamming a second email.
    const { data: existing } = await svc.from('support_access_grants')
      .select('id, status, request_token')
      .eq('brand', BRAND).eq('target_user_id', msg.user_id)
      .in('status', ['requested', 'approved'])
      .order('requested_at', { ascending: false })
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ ok: true, already: true, status: existing.status })
    }

    const token = randomBytes(24).toString('hex')
    const reason = msg.message.slice(0, 300)

    const { error: insertError } = await svc.from('support_access_grants').insert({
      brand: BRAND,
      target_user_id: msg.user_id,
      requested_by: auth.userId,
      requested_by_email: auth.email,
      source_message_id: msg.id,
      reason,
      request_token: token,
      status: 'requested',
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    const safeReason = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const emailResult = await sendEmail({
      to: msg.email,
      subject: 'BCPS Marcomm: access request to help with your report',
      replyTo: 'sean.russell@browardschools.com',
      html: `
        <p>${auth.email} has requested temporary, read-only access to your bcpsmarcomm.com account to help
        with what you reported:</p>
        <p style="white-space:pre-wrap;color:#555">"${safeReason}"</p>
        <p>Nothing changes until you approve it, and you can revoke access at any time. Sign in and approve or deny here:</p>
        <p><a href="https://bcpsmarcomm.com/bcps/access-request/${token}">https://bcpsmarcomm.com/bcps/access-request/${token}</a></p>
      `,
    })

    return NextResponse.json({ ok: true, emailed: emailResult.ok, warning: emailResult.ok ? undefined : emailResult.error })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
