import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { createServiceClient } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend'
import { SITE } from '@/lib/bcps-portal-account'
import { approvalNoticeEmail } from '@/lib/email-stream-copy'
import { STREAMS, weekStart, nextWeekStart, dueOn, frequencies } from '@/lib/email-streams'
import { easternDate } from '@/lib/playbook-people'
import { longDate } from '@/lib/playbook-update'
import { logChange } from '@/lib/doc-change-log'

// The schedule behind recurring emails (Campaigns Phase 2, V 2026-10-28),
// called by pg_cron with x-audit-key (the same key the audit-question digest
// uses):
//   { mode: 'notify' }  Friday morning: emails the superadmins that next
//                       week's emails are ready to approve by 5 PM.
//   { mode: 'send' }    Weekday mornings at 8 AM Eastern: for each recurring
//                       email approved for this week, sends it to everyone
//                       whose chosen frequency falls today. A person is never
//                       sent the same email twice in a day. Nothing sends for
//                       a week that is not approved.
//   { mode: 'send', dry_run: true } -> who would get what today, nothing sent.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const keyClient = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await keyClient.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

const easternHour = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }))

async function superadminEmails(): Promise<string[]> {
  const { data: roles } = await svc.from('acl_member_roles').select('user_id').eq('brand', 'bcps').eq('role', 'superadmin')
  const out: string[] = []
  for (const r of roles ?? []) {
    const { data } = await svc.auth.admin.getUserById(r.user_id as string)
    if (data.user?.email) out.push(data.user.email)
  }
  return out
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const today = easternDate()

  if (body.mode === 'notify') {
    const week = nextWeekStart(today)
    const { data: approved } = await svc.from('bcps_email_approvals').select('stream').eq('week_start', week).eq('status', 'approved')
    const waiting = []
    for (const s of STREAMS.filter((x) => x.ready && x.audience && !(approved ?? []).some((a) => a.stream === x.key))) {
      waiting.push({ name: s.name, count: (await s.audience!(svc, today)).length })
    }
    if (!waiting.length) return NextResponse.json({ ok: true, sent: false, reason: 'everything for next week is approved' })
    const to = await superadminEmails()
    if (!to.length) return NextResponse.json({ ok: false, error: 'no superadmin to notify' }, { status: 500 })
    const sent = await sendEmail({ to, subject: `Approve next week's emails by 5 PM: ${waiting.map((w) => w.name).join(', ')}`,
      html: approvalNoticeEmail(longDate(week), waiting, `${SITE}/?page=superadmin&tab=campaigns`), kind: 'bcps-stream-approval-notice', context: { week, waiting } })
    return NextResponse.json({ ok: sent.ok, week, waiting, to: to.length, error: sent.error })
  }

  if (body.mode === 'send') {
    const dry = !!body.dry_run
    const hour = easternHour()
    // pg_cron fires at two UTC times so 8 AM Eastern is covered across daylight saving.
    if (!dry && !body.force && hour !== 8) return NextResponse.json({ ok: true, sent: 0, reason: `not 8 AM Eastern (it is ${hour}:00)` })
    const week = weekStart(today)
    const { data: approved } = await svc.from('bcps_email_approvals').select('stream').eq('week_start', week).eq('status', 'approved')
    const report = []
    for (const s of STREAMS.filter((x) => x.ready && x.audience)) {
      if (!(approved ?? []).some((a) => a.stream === s.key)) { report.push({ stream: s.key, approved: false, sent: 0 }); continue }
      const people = await s.audience!(svc, today)
      const freqs = await frequencies(svc, s, people.map((p) => p.email))
      const { data: done } = await svc.from('bcps_email_stream_sends').select('email').eq('stream', s.key).eq('send_date', today)
      const already = new Set((done ?? []).map((d) => d.email as string))
      const due = people.filter((p) => dueOn(freqs.get(p.email)!, today) && !already.has(p.email))
      if (dry) { report.push({ stream: s.key, approved: true, would_send: due.map((p) => `${p.name || p.email}: ${p.subject}`) }); continue }
      let sent = 0, failed = 0
      for (const p of due) {
        const r = await sendEmail({ to: p.email, subject: p.subject, html: p.html(freqs.get(p.email)!), kind: `bcps-stream:${s.key}`, context: { week, date: today } })
        await svc.from('bcps_email_stream_sends').insert({ stream: s.key, week_start: week, send_date: today, email: p.email, status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error ?? null })
        if (r.ok) sent++
        else failed++
      }
      if (sent || failed) await logChange(svc, { slug: `email:${s.key}`, action: 'email_sent', actor: 'schedule', autoApplied: true, source: { week, date: today, sent, failed }, summary: `${s.name}: ${sent} sent, ${failed} failed on ${today}.` })
      report.push({ stream: s.key, approved: true, sent, failed })
    }
    return NextResponse.json({ ok: true, today, week, report })
  }

  return NextResponse.json({ error: 'Unknown mode.' }, { status: 400 })
}
