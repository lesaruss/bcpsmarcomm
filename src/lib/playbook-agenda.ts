import { parse } from 'node-html-parser'
import { versionInfo, sections, longDate, QUEUE_TITLE, recountStatus } from '@/lib/playbook-update'

// Agenda builder (BCPS Document System, Phase 3, V 2026-10-28): a Playbook
// proposes its next meeting agenda from what is still open on the page.
// Rules from the approved design ("Agendas From What Is Missing"):
//   - a standing first item: last meeting's to-dos, reviewed by owner
//   - then overdue to-dos, then open questions, then required sections still
//     Missing, then team input waiting for a lead
//   - six items at most, each with an owner, a time box and an outcome verb
//     (Decide, Assign, Confirm or Review; never Discuss)
//   - optional sections never appear
//   - an item on its third agenda goes to the sponsor as a Concern to Watch
// The lead edits the proposal before saving; saving files the agenda as a
// Meeting Record and fills the Playbook's Next Meeting Agenda section.
// Everything here reads the version a reader sees first.

export type AgendaVerb = 'Decide' | 'Assign' | 'Confirm' | 'Review'
export const AGENDA_VERBS: AgendaVerb[] = ['Decide', 'Assign', 'Confirm', 'Review']
export type AgendaSource = 'standing' | 'overdue' | 'question' | 'missing' | 'input' | 'lead'
export interface AgendaItem {
  key: string
  source: AgendaSource
  verb: AgendaVerb
  title: string
  owner: string
  minutes: number
  detail: string
  strikes: number
}
export const MAX_AGENDA_ITEMS = 6
const MINUTES: Record<AgendaVerb, number> = { Decide: 10, Assign: 5, Confirm: 5, Review: 5 }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()
export const agendaKey = (source: AgendaSource, text: string) => `${source}:${clean(text).toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 160)}`

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?'
// Only a date the page states as a due date: "by Oct 30", "before November 4",
// "(due 10/30)". A date mentioned for another reason never makes an item overdue.
const DUE_RE = new RegExp(`\\b(?:by|before|due(?: by)?|no later than)\\s+(?:${MONTH_RE}|(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?)`, 'i')

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// The due date a line states, as YYYY-MM-DD. A date with no year is this
// year's, unless that is more than six months ahead (then last year's).
export function dueDate(text: string, today: string): string | null {
  const m = DUE_RE.exec(text)
  if (!m) return null
  const year = Number(today.slice(0, 4))
  let month: number, day: number, y: number | null
  if (m[1]) { month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); day = Number(m[2]); y = m[3] ? Number(m[3]) : null }
  else { month = Number(m[4]) - 1; day = Number(m[5]); y = m[6] ? Number(m[6].length === 2 ? `20${m[6]}` : m[6]) : null }
  if (month < 0 || month > 11 || day < 1 || day > 31) return null
  if (y) return isoOf(y, month, day)
  const guess = isoOf(year, month, day)
  const ahead = (Date.parse(guess) - Date.parse(today)) / 86_400_000
  return ahead > 183 ? isoOf(year - 1, month, day) : guess
}

// "(Vanessa, Tricia)" at the end of a to-do line.
function trailingOwner(text: string): string {
  const m = /\(([^()]*)\)\s*$/.exec(text.trim())
  return m ? m[1].trim() : ''
}
const withoutOwner = (text: string) => clean(text.replace(/\s*\([^()]*\)\s*$/, ''))

export interface AgendaContext {
  today: string                    // YYYY-MM-DD, Eastern
  leadName: string                 // who owns items no one else does
  openInputs: number               // team input waiting for a lead
  earlier: string[][]              // item keys of earlier agendas, newest first
}

interface Candidate { source: AgendaSource; verb: AgendaVerb; title: string; owner: string; detail: string; keyText: string }

// What could go on the agenda, in the approved order. The first six become
// the proposal; the rest are offered to the lead as "also open".
export function agendaCandidates(html: string, ctx: AgendaContext): Candidate[] {
  const root = parse(html, { comment: true })
  const block = versionInfo(root).current
  if (!block) return []
  const out: Candidate[] = []
  const lead = ctx.leadName || 'the project lead'

  // Standing item: the to-dos the last meeting added (the transcript upload
  // files them as a group named "From <meeting>, <date>").
  const groups = block.querySelectorAll('details.held')
  const fromLast = groups.find((g) => /^from\b/i.test(clean(g.querySelector('summary')?.text || '')))
  const lastOpen = fromLast ? fromLast.querySelectorAll('li.chk-item.pending').map((li) => clean(li.text)) : []
  if (lastOpen.length) {
    const label = clean((fromLast!.querySelector('summary')?.text || '').replace(/\d+\s*$/, ''))
    out.push({ source: 'standing', verb: 'Review', title: `Last meeting's to-dos: ${lastOpen.length} still open`, owner: 'Each owner',
      detail: `${label}: ${lastOpen.join('; ')}`, keyText: 'last meetings todos' })
  }

  // Overdue: a pending to-do whose own line, or whose group title ("Before
  // Oct 7"), states a due date that has passed; an Action Items entry whose
  // deadline has passed.
  const overdue: { text: string; owner: string; due: string }[] = []
  for (const li of block.querySelectorAll('li.chk-item.pending')) {
    const text = clean(li.text)
    const group = li.closest('details.held')?.querySelector('summary')?.text || ''
    const due = dueDate(text, ctx.today) ?? dueDate(clean(group), ctx.today)
    if (due && due < ctx.today) overdue.push({ text, owner: trailingOwner(text), due })
  }
  for (const s of sections(block)) {
    if (!/action items/i.test(s.title) || !s.body) continue
    for (const a of s.body.querySelectorAll('.action-item')) {
      if (a.querySelector('.action-done')) continue
      const title = clean(a.querySelector('.action-title')?.text || '')
      const raw = clean(a.querySelector('.action-deadline')?.text || '')
      const due = dueDate(`by ${raw}`, ctx.today)
      if (title && due && due < ctx.today && !overdue.some((o) => o.text.toLowerCase().includes(title.toLowerCase())))
        overdue.push({ text: title, owner: clean((a.querySelector('.action-owner')?.text || '').replace(/^\s*owners?:\s*/i, '')), due })
    }
  }
  overdue.sort((a, b) => a.due.localeCompare(b.due))
  if (overdue.length > 2) {
    out.push({ source: 'overdue', verb: 'Confirm', title: `New dates for ${overdue.length} overdue to-dos`, owner: 'Each owner',
      detail: overdue.map((o) => `${withoutOwner(o.text)} (due ${longDate(o.due)}${o.owner ? `, ${o.owner}` : ''})`).join('; '), keyText: 'overdue todos' })
  } else {
    for (const o of overdue) out.push({ source: 'overdue', verb: 'Confirm', title: `New date or owner: ${withoutOwner(o.text)}`, owner: o.owner || lead,
      detail: `Was due ${longDate(o.due)}.`, keyText: o.text })
  }

  // Open questions still marked open (a Done or Closed tag is settled).
  for (const s of sections(block)) {
    if (!/^(open questions|open issues|questions)\b/i.test(s.title) || !s.body) continue
    const entries = s.body.querySelectorAll('.agenda-item, li').filter((e) => !e.closest('.team-input'))
    for (const e of entries) {
      if (e.tagName === 'LI' && e.closest('.agenda-item')) continue
      const tag = clean(e.querySelector('.tag')?.text || '')
      if (/^(done|closed|resolved|answered|decided)$/i.test(tag)) continue
      const title = clean(e.querySelector('.agenda-title')?.text || (e.tagName === 'LI' ? e.text : '') || e.querySelector('.agenda-detail')?.text || '')
      if (!title) continue
      const detail = e.querySelector('.agenda-title') ? clean(e.querySelector('.agenda-detail')?.text || '') : ''
      // A question already being worked on needs a progress check, not a decision.
      const verb: AgendaVerb = /^in progress$/i.test(tag) ? 'Review' : 'Decide'
      out.push({ source: 'question', verb, title: withoutOwner(title), owner: trailingOwner(title) || lead, detail, keyText: title })
    }
  }

  // Required sections still Missing. The agenda itself is not one of them.
  for (const s of sections(block)) {
    if (QUEUE_TITLE.test(s.title) || /next meeting agenda/i.test(s.title)) continue
    const tag = clean(s.el.querySelector('summary .status-tag')?.text || '')
    if (!/^missing$/i.test(tag)) continue
    const note = clean(s.el.querySelector('.missing-note')?.text || '')
    const owner = /Owner:\s*(.+?)\.(?:\s+Due:|\s*$)/.exec(note)?.[1]?.trim() || lead
    const need = note.replace(/^missing:\s*/i, '').replace(/\s*Owner:.*$/i, '')
    out.push({ source: 'missing', verb: 'Assign', title: `Who fills in ${s.title}, and by when`, owner: /to be named/i.test(owner) ? lead : owner,
      detail: need ? `Needs ${need}` : '', keyText: s.title })
  }

  if (ctx.openInputs > 0) {
    out.push({ source: 'input', verb: 'Review', title: `Team input waiting for review (${ctx.openInputs})`, owner: lead,
      detail: 'Accept what belongs in the plan; dismiss the rest.', keyText: 'team input' })
  }
  return out
}

// How many agendas in a row (counting this one) an item has been on.
function strikesOf(key: string, earlier: string[][]): number {
  let n = 1
  for (const keys of earlier) { if (keys.includes(key)) n++; else break }
  return n
}

// Each kind gets a share first, so a page with many open questions still
// brings its Missing sections and waiting input to the meeting; any room
// left goes to the rest, in order. Order on the agenda stays the approved one.
const SHARE: Record<AgendaSource, number> = { standing: 1, overdue: 2, question: 3, missing: 2, input: 1, lead: 0 }

export function proposeAgenda(html: string, ctx: AgendaContext): { items: AgendaItem[]; more: AgendaItem[] } {
  const all = agendaCandidates(html, ctx).map((c): AgendaItem => {
    const key = agendaKey(c.source, c.keyText)
    return { key, source: c.source, verb: c.verb, title: c.title, owner: c.owner, minutes: MINUTES[c.verb], detail: c.detail, strikes: strikesOf(key, ctx.earlier) }
  })
  const used = new Set<number>()
  const taken: Partial<Record<AgendaSource, number>> = {}
  all.forEach((it, i) => {
    if (used.size >= MAX_AGENDA_ITEMS || (taken[it.source] ?? 0) >= SHARE[it.source]) return
    used.add(i); taken[it.source] = (taken[it.source] ?? 0) + 1
  })
  all.forEach((_, i) => { if (used.size < MAX_AGENDA_ITEMS) used.add(i) })
  return { items: all.filter((_, i) => used.has(i)), more: all.filter((_, i) => !used.has(i)) }
}

// What the lead sends back, cleaned: known verbs only, six items at most.
export function cleanAgendaItems(raw: unknown, earlier: string[][]): AgendaItem[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_AGENDA_ITEMS).flatMap((r): AgendaItem[] => {
    if (!r || typeof r !== 'object') return []
    const o = r as Record<string, unknown>
    const verb = AGENDA_VERBS.find((v) => v === o.verb)
    const title = clean(String(o.title || '')).slice(0, 300)
    if (!verb || !title) return []
    const source = (['standing', 'overdue', 'question', 'missing', 'input', 'lead'] as AgendaSource[]).find((s) => s === o.source) ?? 'lead'
    const key = typeof o.key === 'string' && o.key ? o.key.slice(0, 200) : agendaKey('lead', title)
    const minutes = Math.min(60, Math.max(1, Math.round(Number(o.minutes) || MINUTES[verb])))
    return [{ key, source, verb, title, owner: clean(String(o.owner || '')).slice(0, 120) || 'The project lead', minutes, detail: clean(String(o.detail || '')).slice(0, 1200), strikes: strikesOf(key, earlier) }]
  })
}

const THIRD = 'Third agenda in a row: this goes to the sponsor and becomes a Concern to Watch.'

export function agendaItemsHtml(items: AgendaItem[]): string {
  return items.map((it) => `<div class="agenda-item"><div class="agenda-head"><span class="agenda-time">${it.minutes} min</span><span class="agenda-title">${esc(it.verb)}: ${esc(it.title)}</span></div>`
    + `<div class="agenda-detail">Owner: ${esc(it.owner)}.${it.detail ? ` ${esc(it.detail)}` : ''}${it.strikes >= 3 ? ` <strong>${THIRD}</strong>` : ''}</div></div>`).join('\n')
}

// The agenda as a Meeting Record (the notes are added after the meeting).
export function agendaRecordHtml(head: string, pb: { slug: string; title: string }, label: string, date: string, author: string, items: AgendaItem[]): string {
  const title = `${label}: ${longDate(date)} Agenda`
  const total = items.reduce((n, it) => n + it.minutes, 0)
  const meta = [
    ['Type', '<span class="doc-type-badge">Meeting Record</span>'],
    ['Playbook', `<a href="/playbooks/${esc(pb.slug)}">${esc(pb.title)}</a>`],
    ['Meeting date', esc(longDate(date))],
    ['Agenda by', esc(author)],
  ].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('\n    ')
  const groups: [string, string, string[]][] = [
    ['The Meeting', 'What this meeting needs to settle, in order.', [
      `<details class="doc-accordion" open><summary><h3>Agenda</h3></summary><div class="section-block">${agendaItemsHtml(items)}</div></details>`,
    ]],
    ['Resources and History', 'Where this agenda came from.', [
      `<details class="doc-accordion"><summary><h3>Related Documents</h3></summary><div class="section-block"><ul class="link-list"><li><a href="/playbooks/${esc(pb.slug)}">${esc(pb.title)}</a>: the Playbook this meeting is for.</li></ul></div></details>`,
    ]],
  ]
  const index = groups.map(([eb, , accs], i) => `<li><a href="#g${i + 1}">${eb}</a><span class="pi-count">${accs.length} section${accs.length === 1 ? '' : 's'}</span></li>`).join('')
  const body = groups.map(([eb, note, accs], i) => `<section class="doc-group" aria-labelledby="g${i + 1}"><h2 class="eyebrow" id="g${i + 1}">${eb}</h2><p class="group-note">${note}</p>${accs.join('')}</section>`).join('\n  ')
  return `${head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)}<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="bcps-header" role="banner"><a class="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS MarComm dashboard"><img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" class="bcps-logo"></a><div class="bcps-header-divider" aria-hidden="true"></div><span class="bcps-header-title">BCPS MarComm &middot; ${esc(pb.title)}</span></header>
<main id="content">
  <h1>${esc(title)}</h1>
  <div class="meta-row">
    ${meta}
  </div>
  <div class="audience-banner"><p><strong>For:</strong> The ${esc(pb.title)} project team. Built from what is still open on the Playbook and edited by ${esc(author)} before sending.</p></div>
  <nav class="page-index" aria-label="On this page"><p class="pi-label">On this page</p><ol>${index}</ol></nav>
  <h2 class="lead-heading">Summary</h2>
  <div class="section-block lead-summary"><p>Agenda for ${esc(longDate(date))}: ${items.length} item${items.length === 1 ? '' : 's'}, about ${total} minutes. Each item ends in a decision, an owner, a confirmed date or a review. The notes are added here after the meeting.</p></div>
  ${body}
</main>
</body>
</html>`
}

// Writes a saved agenda into the Playbook: the Next Meeting Agenda section
// shows it (and is marked Done), and any item on its third agenda in a row is
// added to Concerns to Watch for the sponsor. Returns null when the Playbook
// has neither section.
export function applyAgendaToPlaybook(html: string, items: AgendaItem[], date: string, path: string): string | null {
  const root = parse(html, { comment: true })
  const block = versionInfo(root).current
  if (!block) return null
  const secs = sections(block)
  const markDone = (el: typeof secs[number]['el'], status: 'Done' | 'Draft') => {
    const tag = el.querySelector('summary .status-tag')
    if (tag && !/done/i.test(tag.getAttribute('class') || '')) { tag.set_content(status); tag.setAttribute('class', status === 'Done' ? 'status-tag done' : 'status-tag') }
  }
  let changed = false
  const next = secs.find((s) => /^next meeting agenda$/i.test(s.title))
  if (next?.body) {
    next.body.set_content(`<p class="block-intro">Agenda for ${esc(longDate(date))}. <a href="${esc(path)}">Open the full agenda</a>; the meeting notes are added there afterward.</p>${agendaItemsHtml(items)}`)
    markDone(next.el, 'Done')
    changed = true
  }
  const third = items.filter((it) => it.strikes >= 3)
  const concerns = secs.find((s) => /^concerns to watch$/i.test(s.title))
  if (third.length && concerns?.body) {
    concerns.body.querySelector('.missing-note')?.remove()
    concerns.body.insertAdjacentHTML('beforeend', third.map((it) => `<div class="agenda-item"><div class="agenda-head"><span class="agenda-title">${esc(it.title)}</span><span class="tag">For the sponsor</span></div>`
      + `<div class="agenda-detail">On three meeting agendas in a row without an outcome (latest ${esc(longDate(date))}). Owner: ${esc(it.owner)}.</div></div>`).join('\n'))
    markDone(concerns.el, 'Draft')
    changed = true
  }
  if (!changed) return null
  recountStatus(block)
  return root.toString()
}

// The lead's name for items no one else owns: the first project lead who is
// also a reader of the Playbook.
export function leadNameOf(metadata: Record<string, unknown> | null, recipients: { name: string; email: string }[]): string {
  const leads = Array.isArray(metadata?.transcript_admins) ? (metadata!.transcript_admins as unknown[]).filter((e): e is string => typeof e === 'string') : []
  for (const e of leads) {
    const r = recipients.find((x) => x.email.toLowerCase() === e.toLowerCase())
    if (r?.name) return r.name
  }
  return 'The project lead'
}

