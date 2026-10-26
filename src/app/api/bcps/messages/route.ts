import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createAnonClientWithToken } from '@/lib/supabase-admin'
import { randomBytes } from 'crypto'
import { sendEmail } from '@/lib/resend'
import { INBOX_NOTIFY_EMAILS, conversationUrl, escapeHtml } from '@/lib/site-inbox'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createServiceClient(URL, SERVICE)

// Site inbox (wcm_pilot_feedback), per Sean 2026-07-29. Started as a
// bare-bones admin inbox for reports from the SiteFeedback widget; since
// V, 2026-10-26, each message is a conversation on the Messages page
// (?page=messages), where staff and the sender talk inside the platform.
// Replies after the opening message live in bcps_message_posts.
//
// Two kinds of viewer, decided server-side on every call:
//  - staff (acl_member_roles, brand=bcps, role admin/superadmin, same gate
//    as run-audit/admin-decision): every conversation; close, reopen, mark
//    unread, request access, start a conversation with a member.
//  - the sender (any signed-in account): only conversations tied to their
//    own user_id; they can reply and start a new one.
type Viewer = { email: string; userId: string; staff: boolean }

async function requireViewer(req: NextRequest): Promise<{ ok: true; viewer: Viewer } | { ok: false; status: number }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const asUser = createAnonClientWithToken(URL, ANON, token)
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  const staff = role === 'admin' || role === 'superadmin'
  return { ok: true, viewer: { email: user.email || '', userId: user.id, staff } }
}

const LIST_FIELDS = 'id, created_at, email, page, message, status, read_at, admin_reply, admin_reply_audio_url, replied_at, notify_error, user_id, closed_at, closed_by, member_read_at, last_activity_at'

// Unread means something different per side: staff haven't opened it since
// the sender last wrote (read_at cleared), or the sender hasn't opened it
// since staff last replied (replied_at after member_read_at).
function unreadFor(viewer: Viewer, m: { read_at: string | null; replied_at: string | null; member_read_at: string | null; closed_at: string | null }) {
  if (viewer.staff) return !m.read_at && !m.closed_at
  return !!m.replied_at && (!m.member_read_at || m.replied_at > m.member_read_at)
}

async function namesFor(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return new Map<string, string>()
  const { data } = await svc.from('wcm_cert_users').select('user_id, full_name').in('user_id', ids)
  return new Map((data ?? []).filter(r => r.full_name).map(r => [r.user_id as string, r.full_name as string]))
}

// GET: the viewer's conversations, newest activity first, plus an unread
// count for the topbar bell. With ?id=, one conversation and its replies.
// user_id is included (but never rendered directly) so staff only get
// Request Access on messages tied to a real account.
export async function GET(req: NextRequest) {
  const auth = await requireViewer(req)
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status })
  const viewer = auth.viewer

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const { data: msg } = await svc.from('wcm_pilot_feedback').select(LIST_FIELDS).eq('id', id).maybeSingle()
    if (!msg || (!viewer.staff && msg.user_id !== viewer.userId)) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }
    const { data: posts } = await svc.from('bcps_message_posts')
      .select('id, created_at, author_user_id, author_email, from_staff, body, audio_url, email_error')
      .eq('message_id', id).order('created_at', { ascending: true })
    const names = await namesFor([msg.user_id, ...(posts ?? []).map(p => p.author_user_id)])
    return NextResponse.json({
      is_staff: viewer.staff,
      message: { ...msg, sender_name: msg.user_id ? names.get(msg.user_id) ?? null : null, unread: unreadFor(viewer, msg) },
      posts: (posts ?? []).map(p => ({ ...p, author_name: p.author_user_id ? names.get(p.author_user_id) ?? null : null })),
    })
  }

  let q = svc.from('wcm_pilot_feedback').select(LIST_FIELDS)
    .order('last_activity_at', { ascending: false, nullsFirst: false })
    .limit(200)
  if (!viewer.staff) q = q.eq('user_id', viewer.userId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const names = await namesFor((data ?? []).map(m => m.user_id))
  const messages = (data ?? []).map(m => ({
    ...m,
    sender_name: m.user_id ? names.get(m.user_id) ?? null : null,
    unread: unreadFor(viewer, m),
  }))
  const unread_count = messages.filter(m => m.unread).length
  return NextResponse.json({ messages, unread_count, is_staff: viewer.staff })
}

// POST actions:
//   read            staff: mark read. sender: clears their unread badge.
//   unread, close, reopen   staff only. Close is "handled, no reply needed"
//                   (V, 2026-10-26); the sender writing again reopens it.
//   reply           staff or the sender. A staff reply is saved in the
//                   conversation AND emailed to the sender (reply-to Sean),
//                   with a link back into Messages. A sender reply is saved
//                   in the conversation and emailed to the inbox staff.
//   new             start a conversation. Anyone signed in can write to
//                   staff; staff can write to a member by their email.
//   request_access  staff, see below.
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
  const authResult = await requireViewer(req)
  if (!authResult.ok) return NextResponse.json({ error: 'Forbidden' }, { status: authResult.status })
  const viewer = authResult.viewer

  const body = await req.json().catch(() => ({}))
  const { id, action } = body as { id?: string; action?: 'read' | 'unread' | 'close' | 'reopen' | 'reply' | 'new' | 'request_access' }
  if (!action) return NextResponse.json({ error: 'action is required' }, { status: 400 })

  if (action === 'new') return startConversation(viewer, body)

  if (!id) return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
  const { data: msg } = await svc.from('wcm_pilot_feedback').select('*').eq('id', id).maybeSingle()
  const isOwner = !!msg && !!msg.user_id && msg.user_id === viewer.userId
  if (!msg || (!viewer.staff && !isOwner)) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
  const staffOnly = action === 'unread' || action === 'close' || action === 'reopen' || action === 'request_access'
  if (staffOnly && !viewer.staff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (action === 'read') {
    const now = new Date().toISOString()
    const update = viewer.staff
      ? { read_at: msg.read_at ?? now, status: msg.status === 'new' ? 'read' : msg.status }
      : { member_read_at: now }
    const { error } = await svc.from('wcm_pilot_feedback').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'unread') {
    const { error } = await svc.from('wcm_pilot_feedback')
      .update({ read_at: null, closed_at: null, closed_by: null, status: msg.replied_at ? 'replied' : 'new' })
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'close' || action === 'reopen') {
    const now = new Date().toISOString()
    const update = action === 'close'
      ? { closed_at: now, closed_by: viewer.email, read_at: msg.read_at ?? now, status: 'closed' }
      : { closed_at: null, closed_by: null, status: msg.replied_at ? 'replied' : 'read' }
    const { error } = await svc.from('wcm_pilot_feedback').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'reply') {
    const replyText = (body?.reply_text || '').trim()
    const audioBase64 = (body?.audio_base64 || '').trim() as string
    if (!replyText && !audioBase64) return NextResponse.json({ error: 'reply_text or a voice note is required' }, { status: 400 })

    const now = new Date().toISOString()
    let replyError: string | null = null
    let audioUrl: string | null = null

    // Voice-note reply (dictation already lands as plain text via the
    // browser's own speech-to-text, so this path is only for an actual
    // recorded clip). Reuses the existing public voice-messages bucket
    // rather than standing up a new one - per Sean 2026-07-29, admins are
    // trusted professionals so there's no dictate/record gate here at all.
    if (audioBase64) {
      try {
        const match = audioBase64.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
        if (match) {
          const mime = match[1]
          const buffer = Buffer.from(match[2], 'base64')
          const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'audio'
          const path = `bcps-reply-${id}-${Date.now()}.${ext}`
          const { error: uploadErr } = await svc.storage.from('voice-messages').upload(path, buffer, {
            contentType: mime, upsert: true,
          })
          if (!uploadErr) {
            const { data: pub } = svc.storage.from('voice-messages').getPublicUrl(path)
            audioUrl = pub?.publicUrl ?? null
          }
        }
      } catch {
        // Non-fatal - reply still saves/sends with whatever text was typed.
      }
    }

    const safeReply = replyText ? escapeHtml(replyText) : ''
    const audioLine = audioUrl ? `<p><a href="${audioUrl}">Listen to voice reply</a></p>` : ''
    const threadLine = `<p><a href="${conversationUrl(id)}">Open this conversation in Messages</a></p>`
    const quote = `<p style="color:#888;font-size:12px">In reply to: ${escapeHtml(msg.message.slice(0, 200))}</p>`

    if (viewer.staff && !isOwner) {
      if (msg.email) {
        const result = await sendEmail({
          to: msg.email,
          subject: 'Re: your bcpsmarcomm.com message',
          replyTo: 'sean.russell@browardschools.com',
          html: `${safeReply ? `<p style="white-space:pre-wrap">${safeReply}</p>` : ''}${audioLine}${msg.user_id ? threadLine : ''}${quote}`,
        })
        if (!result.ok) replyError = result.error || 'Unknown send error'
      } else {
        replyError = 'No email on file for this message - reply saved but not sent.'
      }

      await svc.from('bcps_message_posts').insert({
        message_id: id, created_at: now, author_user_id: viewer.userId, author_email: viewer.email,
        from_staff: true, body: replyText || null, audio_url: audioUrl, email_error: replyError,
      })
      const { error } = await svc.from('wcm_pilot_feedback').update({
        admin_reply: replyText || null,
        admin_reply_audio_url: audioUrl,
        replied_at: now,
        replied_by: viewer.email,
        read_at: msg.read_at ?? now,
        last_activity_at: now,
        status: msg.closed_at ? 'closed' : 'replied',
        reply_error: replyError,
      }).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      return NextResponse.json({ ok: true, emailed: !replyError, warning: replyError ?? undefined })
    }

    // The sender writing back: back to the top of the staff inbox, unread,
    // and reopened if it had been closed.
    const result = await sendEmail({
      to: INBOX_NOTIFY_EMAILS,
      subject: `New reply on bcpsmarcomm.com from ${viewer.email || 'a member'}`,
      replyTo: viewer.email || undefined,
      html: `${safeReply ? `<p style="white-space:pre-wrap">${safeReply}</p>` : ''}${audioLine}${threadLine}${quote}`,
    })
    replyError = result.ok ? null : (result.error || 'Unknown send error')
    await svc.from('bcps_message_posts').insert({
      message_id: id, created_at: now, author_user_id: viewer.userId, author_email: viewer.email,
      from_staff: false, body: replyText || null, audio_url: audioUrl, email_error: replyError,
    })
    const { error } = await svc.from('wcm_pilot_feedback').update({
      read_at: null, closed_at: null, closed_by: null, status: 'new',
      member_read_at: now, last_activity_at: now,
    }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, emailed: result.ok })
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
      requested_by: viewer.userId,
      requested_by_email: viewer.email,
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
        <p>${viewer.email} has requested temporary, read-only access to your bcpsmarcomm.com account to help
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

// A new conversation. Anyone signed in writes to the staff inbox (same as a
// SiteFeedback report, page "Messages"). Staff can instead start one with a
// member by email; it lands in that member's Messages, and they get an email.
async function startConversation(viewer: Viewer, body: any) {
  const text = String(body?.message || '').trim()
  if (!text) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 })
  const now = new Date().toISOString()
  const safe = escapeHtml(text)

  const to = String(body?.to_email || '').trim().toLowerCase()
  if (viewer.staff && to) {
    const { data: person } = await svc.from('wcm_cert_users').select('user_id, email').ilike('email', to).maybeSingle()
    if (!person?.user_id) return NextResponse.json({ error: `No bcpsmarcomm.com account found for ${to}.` }, { status: 404 })
    const { data: row, error } = await svc.from('wcm_pilot_feedback').insert({
      user_id: person.user_id, email: person.email || to, page: 'Messages', created_at: now,
      message: text, status: 'replied', read_at: now, last_activity_at: now,
      // The opening message is from staff, so it counts as their reply for
      // the member's unread badge.
      admin_reply: text, replied_at: now, replied_by: viewer.email,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const result = await sendEmail({
      to: person.email || to,
      subject: 'New message on bcpsmarcomm.com',
      replyTo: 'sean.russell@browardschools.com',
      html: `<p style="white-space:pre-wrap">${safe}</p><p><a href="${conversationUrl(row.id)}">Open this conversation in Messages</a></p>`,
    })
    await svc.from('wcm_pilot_feedback').update({ reply_error: result.ok ? null : result.error }).eq('id', row.id)
    return NextResponse.json({ ok: true, id: row.id, emailed: result.ok, staff_started: true })
  }

  const { data: row, error } = await svc.from('wcm_pilot_feedback').insert({
    user_id: viewer.userId, email: viewer.email || null, page: 'Messages',
    message: text, member_read_at: now, last_activity_at: now,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const result = await sendEmail({
    to: INBOX_NOTIFY_EMAILS,
    subject: `New message on bcpsmarcomm.com from ${viewer.email || 'a member'}`,
    replyTo: viewer.email || undefined,
    html: `<p><strong>From:</strong> ${escapeHtml(viewer.email || 'not identified')}</p><p style="white-space:pre-wrap">${safe}</p><p><a href="${conversationUrl(row.id)}">Open in Messages</a></p>`,
  })
  await svc.from('wcm_pilot_feedback').update({ notified_at: now, notify_error: result.ok ? null : result.error }).eq('id', row.id)
  return NextResponse.json({ ok: true, id: row.id, emailed: result.ok })
}
