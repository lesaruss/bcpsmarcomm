import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Recipients for every new report, per Sean 2026-07-29: immediate email on
// every submission for now (no digest yet - revisit if volume grows).
const NOTIFY_EMAILS = ['sean.russell@browardschools.com', 'felicia.hicks@browardschools.com']

// Stores site-wide "report an issue" submissions (bugs, confusion,
// suggestions) from the SiteFeedback widget, replacing Teams/email per
// the July 16 Hot Lab request. Originally WCM-pilot/cert-only; the
// widget now mounts on every bcpsmarcomm.com page (per V, 2026-07-29),
// so this route is the general intake for the whole site. Table name
// (wcm_pilot_feedback) kept as-is to avoid a migration; it now holds
// general site reports, not just WCM pilot ones.
//
// Identity precedence: normally we trust the signed-in session's email
// over anything the client sends. If the client flags not_me (the
// widget's "This isn't me" toggle), that means the signed-in account is
// wrong for this report, so a manually entered contact_email takes
// priority instead.
//
// Every successful save also fires an immediate email to Sean and
// Felicia (2026-07-29) so a report never sits invisibly in Supabase -
// the outcome of that send (ok/error) is written back onto the row in
// notified_at/notify_error so delivery is verifiable from the DB alone,
// without needing access to the Resend dashboard.
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const message = (body?.message || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const notMe = !!body?.not_me
  const contactEmail = body?.contact_email ? String(body.contact_email).trim() : null

  let userId: string | null = null
  let userEmail: string | null = null
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (token) {
    try {
      const asUser = createClient(URL, ANON, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      })
      const { data: { user } } = await asUser.auth.getUser()
      if (user) {
        userId = user.id
        userEmail = user.email ?? null
      }
    } catch {
      /* treat as anonymous feedback */
    }
  }

  const emailToStore = notMe
    ? (contactEmail || userEmail)
    : (userEmail || contactEmail)

  const page = body?.page || null

  try {
    const { data: inserted, error } = await svc.from('wcm_pilot_feedback').insert({
      user_id: notMe ? null : userId,
      email: emailToStore,
      page,
      message,
    }).select('id').single()
    if (error) throw error

    const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const emailResult = await sendEmail({
      to: NOTIFY_EMAILS,
      subject: `New report on bcpsmarcomm.com${page ? ` (${page})` : ''}`,
      replyTo: emailToStore || undefined,
      html: `
        <p><strong>Page:</strong> ${page || 'unknown'}</p>
        <p><strong>From:</strong> ${emailToStore || 'not identified'}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">${safeMessage}</p>
        <p><a href="https://bcpsmarcomm.com/bcps?page=dashboard">Open in dashboard</a></p>
      `,
    })

    await svc.from('wcm_pilot_feedback').update({
      notified_at: new Date().toISOString(),
      notify_error: emailResult.ok ? null : emailResult.error,
    }).eq('id', inserted.id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Could not save feedback.' }, { status: 500 })
  }
}
