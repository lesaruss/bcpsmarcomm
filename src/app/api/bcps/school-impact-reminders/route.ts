import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { sendEmail } from '@/lib/resend'
import {
  SIA_TABLE, SIA_INBOX, SIA_REMIND_WITHIN, SIA_TRACKER_URL, businessDaysBetween, todayEastern, esc, longDate,
} from '@/lib/school-impact'

export const dynamic = 'force-dynamic'

// Due-soon reminder for the Public School Impact Application tracker. Called
// on weekdays by pg_cron (bcps-school-impact-reminders, migration
// 20261102_bcps_school_impact_applications.sql) with x-audit-key, the same
// key check as /api/bcps/audit-worker. One email to the shared inbox lists
// every accepted application within SIA_REMIND_WITHIN business days of its
// due date, or past it, that has not been reminded yet; each one is reminded
// once (changing its due date in the tracker re-arms it).

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const today = todayEastern()
  const { data, error } = await supabase.from(SIA_TABLE)
    .select('id, reference, project_name, applicant_name, due_date')
    .eq('status', 'accepted').is('reminder_sent_at', null).not('due_date', 'is', null)
    .order('due_date')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const due = (data ?? []).map(a => ({ ...a, left: businessDaysBetween(today, a.due_date as string) }))
    .filter(a => a.left <= SIA_REMIND_WITHIN)
  if (!due.length) return NextResponse.json({ ok: true, reminded: 0 })

  const rows = due.map(a => `<tr>
<td style="padding:4px 12px 4px 0"><strong>${esc(a.reference)}</strong></td>
<td style="padding:4px 12px 4px 0">${esc(a.project_name)}</td>
<td style="padding:4px 12px 4px 0">${esc(longDate(a.due_date))}</td>
<td style="padding:4px 0;color:${a.left < 0 ? '#b91c1c' : '#1a1a1a'}">${a.left < 0 ? `${-a.left} business day${a.left === -1 ? '' : 's'} overdue` : a.left === 0 ? 'Due today' : `${a.left} business day${a.left === 1 ? '' : 's'} left`}</td>
</tr>`).join('')
  const r = await sendEmail({
    to: SIA_INBOX,
    subject: `${due.length} Public School Impact Application${due.length === 1 ? '' : 's'} due soon`,
    kind: 'school-impact-due-soon', context: { ids: due.map(a => a.id) },
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
<p>These applications are within ${SIA_REMIND_WITHIN} business days of their 30-business-day due date and the SCAD letter has not been marked sent:</p>
<table style="border-collapse:collapse">${rows}</table>
<p style="margin:16px 0 0"><a href="${SIA_TRACKER_URL}">Open the tracker</a> (Widgets, Public School Impact Application, Edit). Mark each one Letter sent once the SCAD letter goes out.</p>
</div>`,
  })
  if (!r.ok) return NextResponse.json({ error: r.error ?? 'Email failed' }, { status: 502 })
  await supabase.from(SIA_TABLE).update({ reminder_sent_at: new Date().toISOString() }).in('id', due.map(a => a.id))
  return NextResponse.json({ ok: true, reminded: due.length })
}
