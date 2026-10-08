import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { sendEmail } from '@/lib/resend'

// Daily digest of waiting audit questions (Sean, 2026-10-08). pg_cron
// (bcps-audit-questions-digest, weekday mornings) calls this only when a
// question is waiting; it emails every BCPS admin and superadmin the open
// questions, grouped by item with the most-asked first, and a link to the
// question bank. Callers prove themselves with x-audit-key, checked against
// lesaruss_secrets.BCPS_AUDIT_WORKER_KEY (same key as the audit worker).
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
const BANK = 'https://bcpsmarcomm.com/audit-questions'

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })

  const { data: open, error } = await supabase.from('bcps_audit_questions')
    .select('id, created_at, asked_by, page_url, check_id, check_title, question, bcps_departments(name), bcps_schools(name)')
    .eq('status', 'open').order('created_at', { ascending: true }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!open?.length) return NextResponse.json({ ok: true, sent: false, reason: 'no open questions' })

  // How often each item has been asked about, ever: three or more is a Hot Lab topic.
  const { data: all } = await supabase.from('bcps_audit_questions').select('check_id')
  const asked = new Map<string, number>()
  for (const r of all ?? []) asked.set(r.check_id, (asked.get(r.check_id) ?? 0) + 1)

  const groups = new Map<string, typeof open>()
  for (const q of open) groups.set(q.check_id, [...(groups.get(q.check_id) ?? []), q])
  const ordered = Array.from(groups.entries()).sort((a, b) => (asked.get(b[0]) ?? 0) - (asked.get(a[0]) ?? 0))
  const since = Date.now() - 24 * 3600 * 1000
  const fresh = open.filter((q) => new Date(q.created_at).getTime() > since).length

  const { data: roles } = await supabase.from('acl_member_roles').select('user_id').eq('brand', 'bcps').in('role', ['admin', 'superadmin'])
  const to: string[] = []
  for (const r of roles ?? []) {
    const { data } = await supabase.auth.admin.getUserById(r.user_id)
    if (data.user?.email) to.push(data.user.email)
  }
  if (!to.length) return NextResponse.json({ ok: false, error: 'no admin recipients' }, { status: 500 })

  const name = (q: (typeof open)[number]) => {
    const d = q.bcps_departments as unknown as { name: string } | null
    const s = q.bcps_schools as unknown as { name: string } | null
    return d?.name ?? s?.name ?? ''
  }
  const sections = ordered.map(([id, qs]) => {
    const n = asked.get(id) ?? qs.length
    const kind = id.startsWith('a11y-') ? 'ADA' : 'Audit'
    return `
      <h3 style="margin:22px 0 6px;font-size:15px;color:#0e4e73">${kind}: ${esc(qs[0].check_title)}
        <span style="font-size:12px;font-weight:700;color:${n >= 3 ? '#a13a2f' : '#666'}">&nbsp;${n} asked${n >= 3 ? ' · Hot Lab topic' : ''}</span></h3>
      ${qs.map((q) => `
        <div style="border-left:3px solid #1672A7;padding:4px 0 4px 10px;margin:0 0 10px">
          <div style="font-size:14px;font-weight:700;color:#1a1a1a">${esc(q.question)}</div>
          <div style="font-size:12px;color:#666;margin-top:2px">${esc(q.asked_by)}${name(q) ? ` · ${esc(name(q))}` : ''} · ${new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}${q.page_url ? ` · <a href="${esc(q.page_url)}" style="color:#1672A7">${esc(q.page_url.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/')}</a>` : ''}</div>
        </div>`).join('')}`
  }).join('')

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#C55326">Web Review</div>
      <h2 style="margin:4px 0 6px;font-size:22px">${open.length} audit question${open.length === 1 ? '' : 's'} waiting</h2>
      <p style="margin:0 0 6px;font-size:14px;color:#444">${fresh ? `${fresh} new since yesterday. ` : ''}WCMs asked these from items in their website audit. Your answer shows under that item for every WCM.</p>
      <p style="margin:14px 0"><a href="${BANK}" style="background:#1672A7;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:10px 16px;border-radius:8px;display:inline-block">Answer in the question bank</a></p>
      ${sections}
      <p style="margin:26px 0 0;font-size:12px;color:#888">Sent each weekday morning while questions are waiting. Nothing is sent on days with none.</p>
    </div>`

  const sent = await sendEmail({
    to, subject: `${open.length} audit question${open.length === 1 ? '' : 's'} waiting${fresh ? ` (${fresh} new)` : ''}`, html,
    kind: 'bcps-audit-questions-digest', context: { open: open.length, fresh },
  })
  return NextResponse.json({ ok: sent.ok, sent: sent.ok, to: to.length, open: open.length, error: sent.error })
}
