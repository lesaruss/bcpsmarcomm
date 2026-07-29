import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Bare-bones inbox for site reports (per Sean, 2026-07-29): lives on the
// main Dashboard, not a separate page. Reuses wcm_pilot_feedback as the
// message store rather than standing up a new table - it already has
// the sender identity, the message body, and (as of this change) read/
// reply state. Admin-only: this is Sean's inbox for reports submitted
// through the site-wide SiteFeedback widget, same access gate pattern as
// run-audit/admin-decision (acl_member_roles, brand=bcps, role in
// admin/superadmin).
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
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
  return { ok: true, email: user.email || '' }
}

// GET: list messages newest-first, plus an unread count for the topbar bell.
// Unread = no read_at yet, regardless of status.
export async function GET(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const { data, error } = await svc
    .from('wcm_pilot_feedback')
    .select('id, created_at, email, page, message, status, read_at, admin_reply, replied_at, notify_error')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unread_count = (data ?? []).filter(m => !m.read_at).length
  return NextResponse.json({ messages: data ?? [], unread_count })
}

// POST: mark a message read, or send a reply (which also marks it read).
// Replies email the reporter directly if we have an address on file;
// reply-to is Sean's real BCPS inbox so a reply-to-the-reply lands
// somewhere a person actually reads, not the notifications@ sender.
export async function POST(req: NextRequest) {
  const auth = await requireBcpsAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: 'read' | 'reply' }
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

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
