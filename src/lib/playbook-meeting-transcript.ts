import type { SupabaseClient } from '@supabase/supabase-js'
import { playbookOutline } from '@/lib/playbook-update'

// Meeting transcript upload on a Playbook (Sean, 2026-10-22): the Playbook
// side of /api/bcps/meeting-transcript (tracker 'playbook'). A project lead
// (the Playbook's metadata.transcript_admins) uploads a meeting about the
// project; Claude reads it against the Playbook and proposes meeting notes:
// a summary, decisions, action items and open questions. Applying files the
// reviewed notes as a doc under the Playbook (/playbooks/[playbook]/[doc]),
// built from the BCPS MarComm document template, with the Playbook's own
// recipients so the notes are never more open than the Playbook.
// Since V, 2026-10-28, Claude also proposes updates to the Playbook itself
// (section updates, finished Work Queue items, the stage), and applying
// writes the meeting into the Playbook as a new version (lib/playbook-update).

const BCPS_DOC_TEMPLATE_ID = 'f7037d82-c5e2-4997-8631-aa68993157a4'
const MAX_PLAYBOOK_TEXT = 80_000

const orNull = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })
const evidenced = (props: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(props), 'evidence'],
  properties: { ...props, evidence: { type: 'string' } },
})

// Same top-level shape as the trackers (summary, changes, new_items) so one
// review screen serves all three; changes is always empty here, new_items are
// the action items, and decisions and open_questions are Playbook-only.
export const PLAYBOOK_PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes', 'new_items', 'decisions', 'open_questions', 'section_updates', 'queue_done', 'stage'],
  properties: {
    summary: { type: 'string' },
    changes: { type: 'array', items: { type: 'string' } },
    new_items: {
      type: 'array',
      items: evidenced({
        title: { type: 'string' },
        description: { type: 'string' },
        lead: orNull({ type: 'string' }),
        support: orNull({ type: 'array', items: { type: 'string' } }),
        deadline_date: orNull({ type: 'string' }),
        priority: orNull({ type: 'string', enum: ['high', 'medium', 'low'] }),
        ooc: { type: 'boolean' },
        note: { type: 'string' },
      }),
    },
    decisions: { type: 'array', items: evidenced({ decision: { type: 'string' } }) },
    open_questions: { type: 'array', items: evidenced({ question: { type: 'string' } }) },
    section_updates: {
      type: 'array',
      items: evidenced({
        section: { type: 'string' },
        new_section: { type: 'boolean' },
        title: { type: 'string' },
        detail: { type: 'string' },
        replaces: orNull({ type: 'string' }),
      }),
    },
    queue_done: { type: 'array', items: evidenced({ item: { type: 'string' } }) },
    stage: orNull({ type: 'string' }),
  },
}

export const PLAYBOOK_SYSTEM = `You update a Broward County Public Schools project Playbook from a meeting transcript, and write the meeting notes. The Playbook's current version is given as an outline: its stage, lead section, sections with their items, and the pending Work Queue.

Rules:
- Record only what the transcript supports. Never invent dates, owners or decisions. Leave out anything mentioned only in passing or ambiguous.
- "summary" is three to five sentences on what this meeting covered and changed for the project.
- "decisions" are things the group agreed or settled. One plain sentence each.
- "new_items" are action items: someone agreed to do something. "title" is short and starts with a verb, "description" adds the detail, "lead" is the person who owns it (null if no one was named), "support" anyone helping, "deadline_date" YYYY-MM-DD resolved from the meeting date (null if none was given), "priority" null unless stated, "ooc" false, "note" one sentence of context.
- "open_questions" are things raised but not settled, or waiting on someone.
- "evidence" quotes or closely paraphrases the transcript line(s) each item rests on, so a reviewer can check it.
- "changes" is always an empty list.
- Decisions, action items and open questions are placed in the Playbook automatically (decisions section, Work Queue, open issues). Do not repeat them below.
- "section_updates" bring the meeting's new context into the Playbook: new figures, a changed plan, status, dates, who is involved, and answers to what a section is missing. "section" is a section title copied exactly from the outline, with "new_section" false. Only when no section fits, give a short new title and "new_section" true. "title" is a short headline, "detail" one to three plain sentences. Leave out anything the Playbook already says.
- Sections marked [MISSING: ...] say what they need. When the meeting supplies it, fill that section first: use its exact title and write what the meeting said.
- When the meeting changed something an existing item says (a new number, a moved date, a different plan), revise it: set "replaces" to that item's text copied exactly from the outline, and write the corrected item. Otherwise "replaces" is null.
- "queue_done" lists pending Work Queue items the transcript says are finished. "item" is copied exactly from the outline's pending list. Only include an item when the transcript clearly says it is done.
- "stage" is one short line for where the project now stands, only if the meeting changed it; otherwise null.
- Use people's names the way the Playbook writes them. BECON is always written BECON, all capitals.

Write plainly, for the team. No em dashes.`

export interface PlaybookRef { slug: string; title: string; text: string; html: string; tenantId: string; metadata: Record<string, unknown> }

export async function loadPlaybook(svc: SupabaseClient, slug: string): Promise<PlaybookRef | null> {
  const { data } = await svc.from('briefings').select('slug, title, content, metadata, tenant_id')
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
  if (!data) return null
  const html = String(data.content || '')
  const text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYBOOK_TEXT)
  return { slug: data.slug, title: data.title || slug, text, html, tenantId: data.tenant_id as string, metadata: (data.metadata ?? {}) as Record<string, unknown> }
}

// The outline of the current version, not the whole page: a Playbook keeps
// every earlier version in its HTML, and Claude should read only the live one.
export function playbookPrompt(pb: PlaybookRef, meetingLabel: string, meetingDate: string, transcript: string): string {
  const outline = playbookOutline(pb.html).text || pb.text
  return `Project: ${pb.title}\nMeeting: ${meetingLabel}\nMeeting date: ${meetingDate}\n\n<playbook>\n${outline}\n</playbook>\n\n<transcript>\n${transcript}\n</transcript>`
}

type Item = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const DATE = /^\d{4}-\d{2}-\d{2}$/

function longDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
}

// The reviewed proposal, cleaned: only text the person kept.
export function playbookPayload(p: Item) {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Item => !!x && typeof x === 'object') : [])
  return {
    summary: str(p.summary),
    decisions: list(p.decisions).map((d) => str(d.decision)).filter(Boolean),
    open_questions: list(p.open_questions).map((q) => str(q.question)).filter(Boolean),
    actions: list(p.new_items).filter((n) => str(n.title)).map((n) => ({
      title: str(n.title),
      description: str(n.description),
      lead: str(n.lead),
      support: Array.isArray(n.support) ? n.support.map(str).filter(Boolean) : [],
      deadline_date: DATE.test(str(n.deadline_date)) ? str(n.deadline_date) : '',
    })),
    section_updates: list(p.section_updates).filter((u) => str(u.section) && str(u.title)).map((u) => ({
      section: str(u.section).slice(0, 120),
      new_section: u.new_section === true,
      title: str(u.title),
      detail: str(u.detail),
      replaces: str(u.replaces),
    })),
    queue_done: list(p.queue_done).map((q) => str(q.item)).filter(Boolean),
    stage: str(p.stage).slice(0, 200),
  }
}
export type PlaybookPayload = ReturnType<typeof playbookPayload>

// Body markup follows the template's body_skeleton: fixed header, meta row,
// audience banner, an open lead section, closed accordions for the rest.
function notesHtml(head: string, pb: PlaybookRef, label: string, date: string, author: string, p: PlaybookPayload): string {
  const title = `${label}: ${longDate(date)}`
  const meta = [
    ['Type', '<span class="doc-type-badge">Meeting Notes</span>'],
    ['Playbook', `<a href="/playbooks/${esc(pb.slug)}">${esc(pb.title)}</a>`],
    ['Meeting date', esc(longDate(date))],
    ['Uploaded by', esc(author)],
  ].map(([l, v]) => `<div class="meta-item"><span class="meta-label">${l}</span><span class="meta-value">${v}</span></div>`).join('\n    ')
  const section = (name: string, inner: string) =>
    `<details class="doc-accordion"><summary><h2>${name}</h2></summary><div class="section-block">${inner}</div></details>`
  const points = (xs: string[]) => xs.map((x) => `<div class="agenda-item"><div class="agenda-detail">${esc(x)}</div></div>`).join('\n')
  const actions = p.actions.map((a, i) => `<div class="action-item"><div class="action-num">${i + 1}</div><div class="action-body"><div class="action-title">${esc(a.title)}</div>${a.description ? `<div class="action-detail">${esc(a.description)}</div>` : ''}<div class="action-owner">${esc([a.lead, ...a.support].filter(Boolean).join(', ') || 'No owner named')}</div><div class="action-deadline">${a.deadline_date ? esc(longDate(a.deadline_date)) : 'No date set'}</div></div></div>`).join('\n')
  const headWithTitle = head.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`)
  return `${headWithTitle}<body>
<header class="bcps-header" role="banner"><a class="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS MarComm dashboard"><img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" class="bcps-logo"></a><div class="bcps-header-divider" aria-hidden="true"></div><span class="bcps-header-title">BCPS MarComm &middot; ${esc(pb.title)}</span></header>
<main>
  <h1>${esc(title)}</h1>
  <div class="meta-row">
    ${meta}
  </div>
  <div class="audience-banner"><p><strong>For:</strong> The ${esc(pb.title)} project team. Written from the meeting transcript and reviewed by ${esc(author)} before filing.</p></div>
  <h2 class="lead-heading">Summary</h2>
  <div class="section-block lead-summary"><p>${esc(p.summary || 'No summary was kept.')}</p></div>
  ${section(`Decisions (${p.decisions.length})`, p.decisions.length ? points(p.decisions) : '<p>None recorded.</p>')}
  ${section(`Action Items (${p.actions.length})`, p.actions.length ? actions : '<p>None recorded.</p>')}
  ${section(`Open Questions (${p.open_questions.length})`, p.open_questions.length ? points(p.open_questions) : '<p>None recorded.</p>')}
</main>
</body>
</html>`
}

// Files the notes under the Playbook and copies its recipients. Returns the
// new doc's slug and path.
export async function filePlaybookNotes(svc: SupabaseClient, pb: PlaybookRef, label: string, date: string, author: string, uploadId: string, p: PlaybookPayload) {
  const { data: tpl } = await svc.from('templates').select('parameters, version').eq('id', BCPS_DOC_TEMPLATE_ID).maybeSingle()
  const head = (tpl?.parameters as Record<string, unknown> | null)?.html_head
  if (typeof head !== 'string' || !head) throw new Error('The BCPS document template could not be read.')

  const base = `${pb.slug}-meeting-${date}`.slice(0, 120)
  const { data: taken } = await svc.from('briefings').select('slug').like('slug', `${base}%`)
  const used = new Set((taken ?? []).map((r) => r.slug as string))
  let slug = base
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`

  const { error } = await svc.from('briefings').insert({
    slug,
    tenant_id: pb.tenantId,
    brand_slug: 'bcps',
    type: 'record',
    author,
    title: `${label}: ${longDate(date)}`,
    content: notesHtml(head, pb, label, date, author, p),
    metadata: {
      parent_playbook_slug: pb.slug,
      doc_kind: 'meeting-notes',
      meeting_date: date,
      source: 'meeting transcript upload',
      upload_id: uploadId,
      template_id: BCPS_DOC_TEMPLATE_ID,
      template_version: tpl?.version ?? null,
      client: true,
    },
  })
  if (error) throw new Error('The meeting notes could not be filed.')

  const { data: recipients } = await svc.from('bcps_brief_recipients').select('*').eq('brief_slug', pb.slug)
  if (recipients?.length) {
    await svc.from('bcps_brief_recipients').insert(recipients.map((r) => {
      const { id: _id, created_at: _c, ...rest } = r as Record<string, unknown>
      return { ...rest, brief_slug: slug }
    }))
  }
  return { slug, path: `/playbooks/${pb.slug}/${slug}`, decisions: p.decisions.length, actions: p.actions.length, questions: p.open_questions.length }
}
