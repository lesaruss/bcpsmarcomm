import { listItems, type Recipient } from '@/lib/playbook-items'
import { dueDate } from '@/lib/playbook-agenda'
import { leadsOf, backupsOf, handedOff, businessDaysBetween } from '@/lib/playbook-people'
import { longDate } from '@/lib/playbook-update'

// Weekly digest per person (BCPS Document System, Phase 3, V 2026-10-28):
// "You have 3 to-dos due and 1 change to review." One email per person,
// across every Playbook they can open: their to-dos and deliverables that are
// overdue or due in the next seven days, other open ones, and team input
// waiting on them as a lead (or as the backup lead, after five business days).
// People with nothing due and nothing to review get no email.

export interface DigestPlaybook { slug: string; title: string; html: string; metadata: unknown; recipients: Recipient[] }
export interface WaitingInput { playbook_slug: string; created_at: string }
export interface DigestTodo { slug: string; playbook: string; text: string; kind: string; due: string | null; overdue: boolean }
export interface DigestReview { slug: string; playbook: string; count: number; handoff: boolean }
export interface Digest { email: string; name: string; due: DigestTodo[]; other: DigestTodo[]; reviews: DigestReview[] }

const DAY = 86_400_000
const inDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10)

export function buildDigests(playbooks: DigestPlaybook[], waiting: WaitingInput[], today: string): Digest[] {
  const byEmail = new Map<string, Digest>()
  const person = (email: string, name: string) => {
    let d = byEmail.get(email)
    if (!d) { d = { email, name, due: [], other: [], reviews: [] }; byEmail.set(email, d) }
    if (!d.name && name) d.name = name
    return d
  }
  const nameIn = (pb: DigestPlaybook, email: string) => pb.recipients.find((r) => r.email.toLowerCase() === email)?.name || ''
  const weekOut = inDays(today, 7)

  // The same work can sit in Your To-Do List and Action Items; list it once.
  const same = (t: string) => t.replace(/\s*\([^()]*\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()
  for (const pb of playbooks) {
    const seen = new Set<string>()
    for (const item of listItems(pb.html, pb.recipients)) {
      if (seen.has(same(item.text))) continue
      seen.add(same(item.text))
      const due = dueDate(item.text, today) ?? (item.dueText ? dueDate(item.dueText, today) : null)
      const todo: DigestTodo = { slug: pb.slug, playbook: pb.title, text: item.text, kind: item.kind, due, overdue: !!due && due < today }
      for (const email of item.owners) {
        const d = person(email, nameIn(pb, email))
        if ((due && due <= weekOut) || item.kind === 'deliverable') d.due.push(todo)
        else d.other.push(todo)
      }
    }
    const mine = waiting.filter((w) => w.playbook_slug === pb.slug)
    if (!mine.length) continue
    for (const email of leadsOf(pb.metadata)) person(email, nameIn(pb, email)).reviews.push({ slug: pb.slug, playbook: pb.title, count: mine.length, handoff: false })
    const late = mine.filter((w) => handedOff(w.created_at, today)).length
    if (late) for (const email of backupsOf(pb.metadata)) person(email, nameIn(pb, email)).reviews.push({ slug: pb.slug, playbook: pb.title, count: late, handoff: true })
  }

  return Array.from(byEmail.values())
    .filter((d) => d.due.length || d.reviews.length)
    .map((d) => ({ ...d, due: d.due.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999')) }))
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const docLink = (slug: string) => `https://bcpsmarcomm.com/?page=dashboard&tab=documents&doc=${encodeURIComponent(slug)}`

export function digestSubject(d: Digest): string {
  const parts = [d.due.length && plural(d.due.length, 'to-do due', 'to-dos due'), d.reviews.length && plural(d.reviews.reduce((n, r) => n + r.count, 0), 'change to review', 'changes to review')].filter(Boolean)
  return `You have ${parts.join(' and ')}`
}

export function digestHtml(d: Digest, today: string): string {
  const first = (d.name || '').split(' ')[0]
  const when = (t: DigestTodo) => t.kind === 'deliverable' && !t.due ? 'Deliverable' : t.overdue ? `Overdue, was due ${longDate(t.due!)} (${businessDaysBetween(t.due!, today)} business days)` : t.due ? `Due ${longDate(t.due)}` : ''
  const row = (t: DigestTodo) => `
    <div style="border-left:3px solid ${t.overdue ? '#C55326' : '#1672A7'};padding:4px 0 4px 10px;margin:0 0 10px">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a">${esc(t.text)}</div>
      <div style="font-size:12px;color:#666;margin-top:2px">${esc(when(t))}${when(t) ? ' &middot; ' : ''}<a href="${docLink(t.slug)}" style="color:#1672A7">${esc(t.playbook)}</a></div>
    </div>`
  const reviews = d.reviews.map((r) => `
    <div style="border-left:3px solid #1672A7;padding:4px 0 4px 10px;margin:0 0 10px">
      <div style="font-size:14px;font-weight:700;color:#1a1a1a">${esc(plural(r.count, 'piece', 'pieces'))} of team input on <a href="${docLink(r.slug)}" style="color:#1672A7">${esc(r.playbook)}</a></div>
      <div style="font-size:12px;color:#666;margin-top:2px">${r.handoff ? 'Waiting five business days or more for the project lead, so it comes to you as backup lead.' : 'Accept what belongs in the plan; dismiss the rest.'}</div>
    </div>`).join('')
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#C55326">Your week on BCPS MarComm</div>
      <h2 style="margin:4px 0 6px;font-size:22px">${esc(digestSubject(d))}</h2>
      <p style="margin:0 0 6px;font-size:14px;color:#444">${first ? `${esc(first)}, here` : 'Here'} is what is yours on your BCPS projects. Open a project and use Turn in my work beside an item when it is done.</p>
      ${d.due.length ? `<h3 style="margin:22px 0 8px;font-size:15px;color:#0e4e73">Due this week or overdue</h3>${d.due.map(row).join('')}` : ''}
      ${d.reviews.length ? `<h3 style="margin:22px 0 8px;font-size:15px;color:#0e4e73">Waiting for your review</h3>${reviews}` : ''}
      ${d.other.length ? `<h3 style="margin:22px 0 8px;font-size:15px;color:#0e4e73">Also open</h3>${d.other.slice(0, 15).map(row).join('')}${d.other.length > 15 ? `<p style="font-size:12px;color:#666">And ${d.other.length - 15} more on your projects.</p>` : ''}` : ''}
      <p style="margin:26px 0 0;font-size:12px;color:#888">Sent Monday mornings when something is due or waiting for you. Nothing is sent in a week with none.</p>
    </div>`
}
