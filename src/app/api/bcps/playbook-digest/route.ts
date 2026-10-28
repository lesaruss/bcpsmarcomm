import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
import { timingSafeEqual } from 'crypto'
import { sendEmail } from '@/lib/resend'
import { buildDigests, digestHtml, digestSubject, type DigestPlaybook, type AgendaRow } from '@/lib/playbook-digest'
import { listItems } from '@/lib/playbook-items'
import { dueDate } from '@/lib/playbook-agenda'
import { easternDate } from '@/lib/playbook-people'

// Weekly Playbook digest (BCPS Document System, Phase 3, V 2026-10-28). One
// email per person with to-dos due or overdue, open deliverables, and team
// input waiting on them as a lead or backup lead. See lib/playbook-digest.
// Callers prove themselves with x-audit-key (lesaruss_secrets.BCPS_AUDIT_WORKER_KEY,
// the same key the audit-question digest uses).
//
//   POST {}                         -> sends to everyone with something due or waiting
//   POST { dry_run: true }          -> who would get what, nothing sent
//   POST { preview_to, only? }      -> one digest (only: whose; default the first) sent to preview_to
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const supabase = createClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
// Playbooks, readers, team input and agendas are read with the BCPS service
// client, the same one every other Playbook route uses; the client above only
// checks the caller's key (as the audit-question digest does). The first
// preview read zero Playbooks through it (V, 2026-10-28).
const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function authorized(req: NextRequest) {
  const given = req.headers.get('x-audit-key') || ''
  if (!given) return false
  const { data } = await supabase.from('lesaruss_secrets').select('value').eq('key', 'BCPS_AUDIT_WORKER_KEY').maybeSingle()
  const want = data?.value || ''
  if (!want || want.length !== given.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const today = easternDate()

  const { data: rows, error } = await svc.from('briefings').select('slug, title, content, metadata, status')
    .eq('brand_slug', 'bcps').eq('type', 'playbook')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const live = (rows ?? []).filter((r) => r.status !== 'archived' && r.status !== 'withdrawn')
  const { data: recs } = await svc.from('bcps_brief_recipients').select('brief_slug, attendee_name, attendee_email').in('brief_slug', live.map((r) => r.slug))
  const playbooks: DigestPlaybook[] = live.map((r) => ({
    slug: r.slug as string, title: (r.title as string) || (r.slug as string), html: String(r.content || ''), metadata: r.metadata,
    recipients: (recs ?? []).filter((x) => x.brief_slug === r.slug && x.attendee_email).map((x) => ({ name: String(x.attendee_name || ''), email: String(x.attendee_email) })),
  }))
  const { data: waiting } = await svc.from('bcps_playbook_inputs').select('playbook_slug, created_at').eq('status', 'new')
  const since = new Date(Date.parse(today + 'T12:00:00Z') - 15 * 86_400_000).toISOString().slice(0, 10)
  const { data: agendas } = await svc.from('bcps_playbook_agendas').select('playbook_slug, meeting_date, items, outcomes').gte('meeting_date', since)
  const digests = buildDigests(playbooks, (waiting ?? []) as { playbook_slug: string; created_at: string }[], today, (agendas ?? []) as AgendaRow[])

  if (body.dry_run) {
    // Per Playbook: open items found, how many have an owner, how many state a due date.
    const per = playbooks.map((pb) => {
      const items = listItems(pb.html, pb.recipients)
      return { slug: pb.slug, readers: pb.recipients.length, chars: pb.html.length, items: items.length, owned: items.filter((i) => i.owners.length).length,
        dated: items.filter((i) => dueDate(i.text, today) ?? (i.dueText ? dueDate(i.dueText, today) : null)).length }
    }).filter((p) => p.items)
    return NextResponse.json({ ok: true, today, per, read: { playbooks: live.length, readers: recs?.length ?? 0, waiting_input: waiting?.length ?? 0, agendas: agendas?.length ?? 0 }, people: digests.length, digests: digests.map((d) => ({
      email: d.email, name: d.name, subject: digestSubject(d), due: d.due.map((t) => `${t.playbook}: ${t.text}${t.due ? ` (${t.due})` : ''}`), reviews: d.reviews, followups: d.followups, other: d.other.length,
    })) })
  }

  if (body.preview_to) {
    const d = digests.find((x) => x.email === String(body.only || '').toLowerCase()) ?? digests[0]
    if (!d) return NextResponse.json({ ok: true, sent: false, reason: 'nobody has anything due or waiting' })
    const sent = await sendEmail({ to: String(body.preview_to), subject: `[Preview for ${d.name || d.email}] ${digestSubject(d)}`, html: digestHtml(d, today), kind: 'bcps-playbook-digest-preview', context: { for: d.email } })
    return NextResponse.json({ ok: sent.ok, sent: sent.ok, for: d.email, error: sent.error })
  }

  let sent = 0
  const failed: string[] = []
  for (const d of digests) {
    const r = await sendEmail({ to: d.email, subject: digestSubject(d), html: digestHtml(d, today), kind: 'bcps-playbook-digest', context: { due: d.due.length, reviews: d.reviews.length } })
    if (r.ok) sent++
    else failed.push(d.email)
  }
  return NextResponse.json({ ok: !failed.length, people: digests.length, sent, failed })
}
