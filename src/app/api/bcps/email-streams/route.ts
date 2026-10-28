import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'
import { STREAMS, streamByKey, weekStart, nextWeekStart, frequencies } from '@/lib/email-streams'
import { easternDate } from '@/lib/playbook-people'
import { logChange } from '@/lib/doc-change-log'

// Recurring emails on the Campaigns tab (Campaigns Phase 2, V 2026-10-28).
// The superadmin sees each recurring email with who would get it this week
// and next, opens anyone's exact email, sends a test to themself, and
// approves an email for a week. Nothing sends for a week until it is approved
// (by Friday 5 PM for the week that follows). See lib/email-streams.
//
//   GET                                   -> { today, weeks: [this, next], streams }
//   GET ?preview=<stream>&email=<person>  -> { subject, html }
//   POST { action: 'approve' | 'withdraw', stream, week_start } -> { ok }
//   POST { action: 'test', stream, email? } -> { ok, to }   sends one person's email to you
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const today = easternDate()

  const previewKey = req.nextUrl.searchParams.get('preview')
  if (previewKey) {
    const stream = streamByKey(previewKey)
    if (!stream?.ready || !stream.audience) return NextResponse.json({ error: 'That email is not built yet.' }, { status: 404 })
    const people = await stream.audience(svc, today)
    const want = String(req.nextUrl.searchParams.get('email') || '').toLowerCase()
    const p = people.find((x) => x.email === want) ?? people[0]
    if (!p) return NextResponse.json({ error: 'Nobody would get this email today.' }, { status: 404 })
    const freq = (await frequencies(svc, stream, [p.email])).get(p.email)!
    return NextResponse.json({ email: p.email, name: p.name, frequency: freq, subject: p.subject, html: p.html(freq) })
  }

  const weeks = [weekStart(today), nextWeekStart(today)]
  const { data: approvals } = await svc.from('bcps_email_approvals').select('stream, week_start, status, approved_by, approved_at').in('week_start', weeks)
  const { data: sends } = await svc.from('bcps_email_stream_sends').select('stream, week_start, status').in('week_start', weeks)
  const streams = await Promise.all(STREAMS.map(async (s) => {
    const people = s.ready && s.audience ? await s.audience(svc, today) : []
    const freqs = await frequencies(svc, s, people.map((p) => p.email))
    return {
      key: s.key, name: s.name, description: s.description, ready: s.ready, default_frequency: s.defaultFrequency,
      people: people.map((p) => ({ email: p.email, name: p.name, subject: p.subject, frequency: freqs.get(p.email) })),
      weeks: weeks.map((w) => {
        const a = (approvals ?? []).find((x) => x.stream === s.key && x.week_start === w)
        const sent = (sends ?? []).filter((x) => x.stream === s.key && x.week_start === w)
        return { week_start: w, approved: a?.status === 'approved', approved_by: a?.status === 'approved' ? a.approved_by : null, approved_at: a?.status === 'approved' ? a.approved_at : null,
          sent: sent.filter((x) => x.status === 'sent').length, failed: sent.filter((x) => x.status === 'failed').length }
      }),
    }
  }))
  return NextResponse.json({ today, weeks, streams })
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const stream = streamByKey(String(body.stream || ''))
  if (!stream?.ready || !stream.audience) return NextResponse.json({ error: 'That email is not built yet.' }, { status: 404 })
  const today = easternDate()

  if (body.action === 'approve' || body.action === 'withdraw') {
    const week = String(body.week_start || '')
    if (!DATE.test(week) || week !== weekStart(week)) return NextResponse.json({ error: 'Pick the week.' }, { status: 400 })
    if (week < weekStart(today)) return NextResponse.json({ error: 'That week is over.' }, { status: 400 })
    const count = body.action === 'approve' ? (await stream.audience(svc, today)).length : null
    const { error } = await svc.from('bcps_email_approvals').upsert({
      stream: stream.key, week_start: week, status: body.action === 'approve' ? 'approved' : 'withdrawn',
      approved_by: auth.user.email, approved_at: new Date().toISOString(), audience_count: count,
    }, { onConflict: 'stream,week_start' })
    if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
    await logChange(svc, { slug: `email:${stream.key}`, action: 'email_approval', actor: auth.user.email, approvedBy: auth.user.email,
      source: { stream: stream.key, week_start: week, audience: count }, summary: `${stream.name}: ${body.action === 'approve' ? 'approved' : 'approval withdrawn'} for the week of ${week}.` })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'test') {
    const people = await stream.audience(svc, today)
    const want = String(body.email || '').toLowerCase()
    const p = people.find((x) => x.email === want) ?? people[0]
    if (!p) return NextResponse.json({ error: 'Nobody would get this email today, so there is nothing to test.' }, { status: 404 })
    const freq = (await frequencies(svc, stream, [p.email])).get(p.email)!
    const sent = await sendEmail({ to: auth.user.email, subject: `[Test for ${p.name || p.email}] ${p.subject}`, html: p.html(freq), kind: `bcps-stream-test:${stream.key}`, context: { for: p.email } })
    return sent.ok ? NextResponse.json({ ok: true, to: auth.user.email, for: p.email }) : NextResponse.json({ error: sent.error || 'The test did not send.' }, { status: 502 })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
