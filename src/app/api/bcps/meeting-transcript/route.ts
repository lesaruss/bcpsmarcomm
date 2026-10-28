import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-admin'
import { anthropicKey } from '@/lib/anthropic-key'
import { requireBcpsPageAccess, requireNamedPageGrant, requirePlaybookTranscriptAccess } from '@/lib/bcps-auth'
import { loadAssignments } from '@/lib/bcps-team-home'
import { PLAYBOOK_PROPOSAL_SCHEMA, PLAYBOOK_SYSTEM, loadPlaybook, playbookPrompt, playbookPayload, filePlaybookNotes } from '@/lib/playbook-meeting-transcript'
import { playbookOutline, applyPlaybookUpdate } from '@/lib/playbook-update'
import { resolveOwners } from '@/lib/playbook-items'
import { screenTranscript, screenMessage } from '@/lib/transcript-screen'
import { logChange } from '@/lib/doc-change-log'
import { askClaudeJson } from '@/lib/anthropic-key'
import { OUTCOME_SCHEMA, OUTCOME_SYSTEM, outcomePrompt, cleanOutcomes, applyOutcomesToRecord, type AgendaItem, type AgendaOutcome, type ItemOutcome } from '@/lib/playbook-agenda'
import { MARCOMM_TRANSCRIPT_PAGE, MARCOMM_PROPOSAL_SCHEMA, MARCOMM_SYSTEM, loadMarcommRows, marcommPrompt, attachCurrent, marcommPayload } from '@/lib/marcomm-meeting-transcript'

// Meeting transcript upload for Web Team Assignments (Sean, 2026-10-21).
// A designated person (granted the 'meeting-transcripts' page by name, or the
// superadmin; a group grant does not count, Sean 2026-10-22) pastes or uploads a transcript; Claude reads it against the current
// tracker under canon-bcps-web-team-assignments-meeting-updates and proposes
// changes; the person reviews them and applies. Nothing is written to the
// tracker until they press Apply.
//
//   GET                           -> { allowed, uploads }   recent uploads
//   POST { action: 'propose', transcript, meeting_date, meeting_label }
//                                 -> { upload_id, proposal }
//   POST { action: 'apply', upload_id, payload }
//                                 -> { result }   payload is the reviewed proposal
//   POST { action: 'discard', upload_id }
// ?tracker=marcomm (GET) or tracker: 'marcomm' (POST) does the same for
// MarComm Assignments (Sean, 2026-10-21), under the 'marcomm-edit'
// grant; see lib/marcomm-meeting-transcript.
// ?tracker=playbook&playbook=<slug> (GET) or tracker: 'playbook', playbook
// (POST) files meeting notes under that Playbook, for its designated leads
// only (Sean, 2026-10-22); see lib/playbook-meeting-transcript. Applying also
// writes the meeting into the Playbook itself as a new version (V,
// 2026-10-28); see lib/playbook-update.
// On a Playbook (BCPS Document System, Phase 3, V 2026-10-28) the lead must
// confirm everyone knew the meeting was recorded (consent: true), and the
// transcript is screened before it is summarized: a named student, a student
// ID, a personnel or a legal matter stops the upload (status 'flagged') with
// the lines to remove (lib/transcript-screen). Applying records each change in
// the change trail, with what the lead left out (lib/doc-change-log).
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PAGE = 'meeting-transcripts'
const MODEL = 'claude-opus-5-5'
const MAX_TRANSCRIPT = 600_000
const STATUSES = ['in-progress', 'pending', 'ongoing', 'completed', 'archived']

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  const local = email.split('@')[0].split('.')
  return local.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

const orNull = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })
const nullableString = orNull({ type: 'string' })
const nullableList = orNull({ type: 'array', items: { type: 'string' } })
const PROPOSAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'changes', 'new_items'],
  properties: {
    summary: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slug', 'status', 'lead', 'support', 'start_date', 'deadline_date', 'priority', 'ooc', 'description', 'note', 'evidence'],
        properties: {
          slug: { type: 'string' },
          status: orNull({ type: 'string', enum: STATUSES }),
          lead: nullableString,
          support: nullableList,
          start_date: nullableString,
          deadline_date: nullableString,
          priority: orNull({ type: 'string', enum: ['high', 'medium', 'low'] }),
          ooc: orNull({ type: 'boolean' }),
          description: nullableString,
          note: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    new_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'description', 'lead', 'support', 'deadline_date', 'priority', 'ooc', 'note', 'evidence'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          lead: nullableString,
          support: nullableList,
          deadline_date: nullableString,
          priority: orNull({ type: 'string', enum: ['high', 'medium', 'low'] }),
          ooc: { type: 'boolean' },
          note: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

const SYSTEM = `You update the Broward County Public Schools District Web Team's assignments tracker from a meeting transcript.

Rules (from the team's standing instructions):
- Apply what was stated in the meeting: new or changed deadlines, owners (lead/support), statuses and action items. Do not ask; propose.
- Only propose a change the transcript actually supports. If something was only mentioned in passing, or is ambiguous, leave it out. Never invent dates, owners or decisions.
- Match discussion to an existing row whenever it is the same work, even if named differently. Propose a new item only for work that has no row.
- Every task named in the meeting is tagged OOC (ooc: true) unless it clearly belongs only to Application Services.
- Keep the tracker as one list; never propose sections or categories.
- BECON is always written BECON, all capitals.
- Use people's names the way the tracker already writes them (for example "Sean A. Russell", "Vanessa", "Felicia", "Tricia", "Rudy", "Nakesha", "Andrea").
- Dates are YYYY-MM-DD. Resolve relative dates ("next Friday", "two weeks") from the meeting date.

For each change: set only the fields that change and null for the rest (support null means unchanged; an empty list clears it). "description" rewrites the row's short description and should be null unless the row's description is now wrong or missing the key new fact. "note" is one or two plain sentences saying what was said or decided, written for the team. "evidence" quotes or closely paraphrases the transcript line(s) it rests on, so a reviewer can check it.

"summary" is two to four sentences on what this meeting changed, for the top of the tracker.

Write plainly. No em dashes.`

function rowsForPrompt(rows: Awaited<ReturnType<typeof loadAssignments>>): string {
  return rows
    .filter((r) => r.status !== 'archived')
    .map((r) => [
      `slug: ${r.slug}`,
      `title: ${r.title}`,
      r.desc ? `description: ${r.desc}` : null,
      `lead: ${r.lead || '-'}`,
      r.support ? `support: ${r.support}` : null,
      `status: ${r.status}`,
      r.date_iso ? `deadline: ${r.date_iso}` : r.deadline ? `deadline: ${r.deadline}` : null,
      r.priority ? `priority: ${r.priority}` : null,
    ].filter(Boolean).join('\n'))
    .join('\n\n')
}

interface Proposal {
  summary: string
  changes: Array<Record<string, unknown> & { slug: string }>
  new_items: Array<Record<string, unknown> & { title: string }>
}

type Tracker = 'web-team' | 'marcomm' | 'playbook'
const trackerOf = (v: unknown): Tracker => (v === 'marcomm' ? 'marcomm' : v === 'playbook' ? 'playbook' : 'web-team')
const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/

// Who may upload: the tracker's page grant, or for a Playbook its own leads.
function authFor(req: NextRequest, tracker: Tracker, playbook: string) {
  if (tracker === 'playbook') {
    if (!SLUG.test(playbook)) return Promise.resolve({ ok: false as const, status: 404, error: 'That Playbook was not found.' })
    return requirePlaybookTranscriptAccess(req, playbook)
  }
  // Web Team transcripts go to people named on the page, never a whole group
  // (Sean, 2026-10-22); MarComm keeps its editors' grant.
  return tracker === 'marcomm' ? requireBcpsPageAccess(req, MARCOMM_TRANSCRIPT_PAGE) : requireNamedPageGrant(req, PAGE)
}

async function ask(schema: Record<string, unknown>, system: string, content: string): Promise<Proposal> {
  const key = await anthropicKey()
  if (!key) throw new Error('The Claude key is not set up for this site.')
  const client = new Anthropic({ apiKey: key })
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to read this transcript.')
  if (msg.stop_reason === 'max_tokens') throw new Error('The transcript produced more changes than fit in one pass. Try uploading it in two halves.')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  return JSON.parse(text) as Proposal
}

async function proposeMarcomm(transcript: string, meetingDate: string, meetingLabel: string): Promise<Proposal> {
  const { rows, team } = await loadMarcommRows(svc)
  if (!rows.length) throw new Error('Could not read the current tracker.')
  const parsed = await ask(MARCOMM_PROPOSAL_SCHEMA, MARCOMM_SYSTEM,
    `Meeting: ${meetingLabel}\nMeeting date: ${meetingDate}\n\n<tracker>\n${marcommPrompt(rows, team)}\n</tracker>\n\n<transcript>\n${transcript}\n</transcript>`)
  attachCurrent(parsed, rows)
  parsed.new_items = parsed.new_items || []
  return parsed
}

// The agenda saved for this meeting (agenda builder): the latest one dated on
// or up to a week before the meeting that has no outcomes yet.
const OUTCOME_MODEL = 'claude-sonnet-5-5'
async function agendaFor(slug: string, meetingDate: string) {
  const weekBefore = new Date(Date.parse(meetingDate + 'T12:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10)
  const { data } = await svc.from('bcps_playbook_agendas').select('id, record_slug, meeting_date, items')
    .eq('playbook_slug', slug).is('outcomes', null).lte('meeting_date', meetingDate).gte('meeting_date', weekBefore)
    .order('meeting_date', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data && Array.isArray(data.items) && data.items.length ? { id: data.id as string, record_slug: data.record_slug as string | null, meeting_date: data.meeting_date as string, items: data.items as AgendaItem[] } : null
}

// Each agenda item's outcome from the transcript. A failure here never stops
// the upload; the lead just sees no outcomes to confirm.
async function agendaOutcomes(items: AgendaItem[], transcript: string): Promise<ItemOutcome[] | null> {
  try {
    const out = await askClaudeJson(OUTCOME_MODEL, OUTCOME_SCHEMA, OUTCOME_SYSTEM, outcomePrompt(items, transcript))
    return cleanOutcomes(out.outcomes, items)
  } catch (e) {
    console.error('meeting-transcript: agenda outcomes failed', e)
    return null
  }
}

async function proposePlaybook(slug: string, transcript: string, meetingDate: string, meetingLabel: string): Promise<Proposal> {
  const pb = await loadPlaybook(svc, slug)
  if (!pb) throw new Error('That Playbook was not found.')
  const agenda = await agendaFor(slug, meetingDate)
  const [parsed, outcomes] = await Promise.all([
    ask(PLAYBOOK_PROPOSAL_SCHEMA, PLAYBOOK_SYSTEM, playbookPrompt(pb, meetingLabel, meetingDate, transcript)) as Promise<Proposal & Record<string, unknown>>,
    agenda ? agendaOutcomes(agenda.items, transcript) : Promise.resolve(null),
  ])
  if (agenda && outcomes) {
    parsed.agenda = { id: agenda.id, record_slug: agenda.record_slug, meeting_date: agenda.meeting_date,
      items: agenda.items.map((it) => ({ verb: it.verb, title: it.title, owner: it.owner, ...outcomes.find((o) => o.key === it.key)! })) }
  }
  parsed.changes = []
  parsed.new_items = parsed.new_items || []
  // Keep only updates that point at a real section or Work Queue item, so a
  // misquoted title cannot add a stray section or tick the wrong item.
  const outline = playbookOutline(pb.html)
  const sections = new Set(outline.sections.map((t) => t.toLowerCase()))
  const pending = new Set(outline.pending.map((t) => t.toLowerCase()))
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
  const missing = new Set(outline.missing.map((t) => t.toLowerCase()))
  parsed.section_updates = list(parsed.section_updates)
    .filter((u) => u.new_section === true || sections.has(String(u.section || '').trim().toLowerCase()))
    .map((u) => ({ ...u, fills_missing: missing.has(String(u.section || '').trim().toLowerCase()) }))
  parsed.queue_done = list(parsed.queue_done).filter((q) => pending.has(String(q.item || '').replace(/\s+/g, ' ').trim().toLowerCase()))
  parsed.stage = typeof parsed.stage === 'string' && parsed.stage.trim() ? parsed.stage.trim() : null
  parsed.current_stage = outline.stage
  return parsed
}

// Writes the reviewed meeting into the Playbook as a new version, keeping the
// previous content in bcps_doc_revisions. The write only lands if nobody saved
// the Playbook in between.
async function updatePlaybook(slug: string, notes: ReturnType<typeof playbookPayload>, meetingLabel: string, meetingDate: string, notesPath: string, notesTitle: string, email: string) {
  const { data: row } = await svc.from('briefings').select('content, updated_at')
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).maybeSingle()
  if (!row) throw new Error('That Playbook was not found.')
  // Owners are stored on each new Work Queue item, so its Complete button
  // goes to exactly those people (lib/playbook-items).
  const { data: readers } = await svc.from('bcps_brief_recipients').select('attendee_name, attendee_email').eq('brief_slug', slug)
  const people = (readers ?? []).filter((r) => r.attendee_email).map((r) => ({ name: String(r.attendee_name || ''), email: String(r.attendee_email) }))
  const actions = notes.actions.map((a) => ({ ...a, owners: resolveOwners([a.lead, ...a.support].filter(Boolean).join(', '), people) }))
  const out = applyPlaybookUpdate(String(row.content || ''), {
    meeting_label: meetingLabel, meeting_date: meetingDate, summary: notes.summary, decisions: notes.decisions,
    open_questions: notes.open_questions, actions, section_updates: notes.section_updates,
    queue_done: notes.queue_done, stage: notes.stage, notes_path: notesPath, notes_title: notesTitle,
  })
  const { data: rev, error: revErr } = await svc.from('bcps_doc_revisions')
    .insert({ slug, content: row.content, replaced_by_email: email }).select('id').single()
  if (revErr || !rev) throw new Error('Could not keep the previous version of the Playbook, so it was not changed.')
  const { data: saved, error } = await svc.from('briefings').update({ content: out.html, updated_at: new Date().toISOString() })
    .eq('brand_slug', 'bcps').eq('type', 'playbook').eq('slug', slug).eq('updated_at', row.updated_at).select('slug')
  if (error || !saved?.length) throw new Error('The Playbook changed while you were reviewing. Upload the transcript again to update it.')
  await svc.from('playbook_records').insert({
    slug, brand_slug: 'bcps', author: email, kind: 'edit', source: 'transcript', applied: true,
    body: `Updated from the ${meetingLabel} transcript (${meetingDate})${out.version ? `, as v${out.version}` : ''}. Previous content kept in bcps_doc_revisions ${rev.id}.`,
  }).then(() => null, () => null)
  return { version: out.version, counts: out.counts, revision_id: rev.id as string, html: out.html }
}

// Writes the outcomes the lead confirmed into the agenda record and the
// agenda row. Returns how many items were settled.
async function recordOutcomes(playbook: string, agenda: { id: string; record_slug: string | null; items: (ItemOutcome & { verb: string; title: string; owner: string })[] }, raw: unknown[], notesPath: string, uploadId: string, email: string) {
  const { data: row } = await svc.from('bcps_playbook_agendas').select('items, outcomes').eq('id', agenda.id).maybeSingle()
  if (!row || row.outcomes) throw new Error('That agenda already has its outcomes.')
  const items = (row.items ?? []) as AgendaItem[]
  const confirmed: ItemOutcome[] = items.map((it) => {
    const proposed = agenda.items.find((a) => a.key === it.key)
    const given = raw.find((r) => r && typeof r === 'object' && (r as Record<string, unknown>).key === it.key) as Record<string, unknown> | undefined
    const outcome = (['settled', 'partly', 'not_covered'] as AgendaOutcome[]).find((v) => v === given?.outcome) ?? proposed?.outcome ?? 'not_covered'
    return { key: it.key, outcome, note: String(given?.note ?? proposed?.note ?? '').slice(0, 600), evidence: proposed?.evidence ?? '' }
  })
  if (agenda.record_slug) {
    const { data: rec } = await svc.from('briefings').select('content, updated_at').eq('brand_slug', 'bcps').eq('slug', agenda.record_slug).maybeSingle()
    if (rec) {
      const html = applyOutcomesToRecord(String(rec.content || ''), items, confirmed, notesPath)
      const { data: rev } = await svc.from('bcps_doc_revisions').insert({ slug: agenda.record_slug, content: rec.content, replaced_by_email: email }).select('id').single()
      if (rev) {
        await svc.from('briefings').update({ content: html, updated_at: new Date().toISOString() }).eq('brand_slug', 'bcps').eq('slug', agenda.record_slug).eq('updated_at', rec.updated_at)
        await logChange(svc, {
          slug: agenda.record_slug, action: 'agenda_outcomes', actor: email, approvedBy: email, model: OUTCOME_MODEL,
          source: { upload_id: uploadId, playbook, outcomes: confirmed }, summary: `Meeting outcomes recorded: ${confirmed.filter((o) => o.outcome === 'settled').length} of ${confirmed.length} settled.`,
          unticked: confirmed.filter((o) => o.outcome !== agenda.items.find((a) => a.key === o.key)?.outcome).map((o) => ({ key: o.key, changed_to: o.outcome })),
          revisionId: rev.id as string, after: html,
        })
      }
    }
  }
  await svc.from('bcps_playbook_agendas').update({ outcomes: confirmed, outcomes_at: new Date().toISOString(), upload_id: uploadId }).eq('id', agenda.id)
  return { settled: confirmed.filter((o) => o.outcome === 'settled').length, total: confirmed.length }
}

// What the proposal held that the lead left out of what they applied.
function unticked(proposal: Record<string, unknown> | null, applied: ReturnType<typeof playbookPayload>) {
  if (!proposal) return []
  const list = (k: string) => (Array.isArray(proposal[k]) ? proposal[k] as Record<string, unknown>[] : [])
  const out: { kind: string; text: string; evidence: string }[] = []
  const left = (kind: string, items: Record<string, unknown>[], field: string, kept: string[]) => {
    for (const i of items) if (!kept.includes(String(i[field] || '').trim())) out.push({ kind, text: String(i[field] || ''), evidence: String(i.evidence || '') })
  }
  left('decision', list('decisions'), 'decision', applied.decisions)
  left('open question', list('open_questions'), 'question', applied.open_questions)
  left('to-do', list('new_items'), 'title', applied.actions.map((a) => a.title))
  left('section update', list('section_updates'), 'title', applied.section_updates.map((u) => u.title))
  left('done', list('queue_done'), 'item', applied.queue_done)
  if (proposal.stage && !applied.stage) out.push({ kind: 'stage', text: String(proposal.stage), evidence: '' })
  return out
}

// The transcript lines each applied item rests on, for the trail.
function evidenceOf(proposal: Record<string, unknown> | null) {
  if (!proposal) return []
  const out: { kind: string; text: string; evidence: string }[] = []
  for (const [k, field] of [['decisions', 'decision'], ['open_questions', 'question'], ['new_items', 'title'], ['section_updates', 'title'], ['queue_done', 'item']] as const) {
    for (const i of (Array.isArray(proposal[k]) ? proposal[k] as Record<string, unknown>[] : [])) out.push({ kind: k, text: String(i[field] || ''), evidence: String(i.evidence || '').slice(0, 400) })
  }
  return out
}

async function propose(transcript: string, meetingDate: string, meetingLabel: string, origin: string): Promise<Proposal> {
  const rows = await loadAssignments(svc, origin)
  if (!rows.length) throw new Error('Could not read the current tracker.')
  const parsed = await ask(PROPOSAL_SCHEMA, SYSTEM,
    `Meeting: ${meetingLabel}\nMeeting date: ${meetingDate}\n\n<tracker>\n${rowsForPrompt(rows)}\n</tracker>\n\n<transcript>\n${transcript}\n</transcript>`)

  // Keep only changes to rows that exist, so a mistyped slug cannot create a
  // phantom row.
  const known = new Set(rows.map((r) => r.slug))
  parsed.changes = (parsed.changes || []).filter((c) => known.has(c.slug)).map((c) => {
    const row = rows.find((r) => r.slug === c.slug)!
    return { ...c, current: { title: row.title, lead: row.lead, support: row.support, status: row.status, deadline: row.date_iso || row.deadline, priority: row.priority } }
  })
  parsed.new_items = parsed.new_items || []
  return parsed
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

// The reviewed proposal -> the RPC payload. Only fields that change are sent,
// so the function leaves everything else on the row alone.
function toPayload(p: Proposal, meetingDate: string, meetingLabel: string) {
  const pick = (src: Record<string, unknown>, out: Record<string, unknown>) => {
    if (typeof src.status === 'string' && STATUSES.includes(src.status)) out.status = src.status
    if (typeof src.lead === 'string' && src.lead.trim()) out.lead = src.lead.trim()
    if (Array.isArray(src.support)) out.support = src.support.filter((s) => typeof s === 'string' && s.trim()).map((s) => (s as string).trim())
    if (typeof src.start_date === 'string' && DATE.test(src.start_date)) out.start_date = src.start_date
    if (typeof src.deadline_date === 'string' && DATE.test(src.deadline_date)) out.deadline_date = src.deadline_date
    if (typeof src.priority === 'string' && ['high', 'medium', 'low'].includes(src.priority)) out.priority = src.priority
    if (typeof src.ooc === 'boolean') out.ooc = src.ooc
    if (typeof src.description === 'string' && src.description.trim()) out.description = src.description.trim()
    if (typeof src.note === 'string' && src.note.trim()) out.note = src.note.trim()
    return out
  }
  return {
    meeting_date: meetingDate,
    meeting_label: meetingLabel,
    summary: typeof p.summary === 'string' ? p.summary.trim() : '',
    changes: (p.changes || []).filter((c) => typeof c.slug === 'string').map((c) => pick(c, { slug: c.slug })),
    new_items: (p.new_items || []).filter((n) => typeof n.title === 'string' && n.title.trim())
      .map((n) => pick(n, { title: (n.title as string).trim() })),
  }
}

export async function GET(req: NextRequest) {
  const tracker = trackerOf(req.nextUrl.searchParams.get('tracker'))
  const playbook = String(req.nextUrl.searchParams.get('playbook') || '')
  const auth = await authFor(req, tracker, playbook)
  if (!auth.ok) return NextResponse.json({ allowed: false }, { status: auth.status === 401 ? 401 : 200 })
  let q = svc.from('bcps_meeting_uploads')
    .select('id, meeting_date, meeting_label, status, uploaded_by_name, created_at, applied_at, result')
    .eq('tracker', tracker)
  if (tracker === 'playbook') q = q.eq('playbook_slug', playbook)
  const { data } = await q.order('created_at', { ascending: false }).limit(10)
  return NextResponse.json({ allowed: true, uploads: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const tracker = trackerOf(body.tracker)
  const playbook = tracker === 'playbook' ? String(body.playbook || '') : ''
  const auth = await authFor(req, tracker, playbook)
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? auth.error : 'You have not been designated to upload meeting transcripts.' }, { status: auth.status })
  const name = await displayName(auth.user.userId, auth.user.email)

  if (body.action === 'propose') {
    const transcript = String(body.transcript || '').trim()
    const meetingDate = String(body.meeting_date || '')
    const meetingLabel = String(body.meeting_label || '').trim().slice(0, 120) || (tracker === 'marcomm' ? 'Marcomm Meeting' : tracker === 'playbook' ? 'Project Meeting' : 'District Web Team Meeting')
    if (transcript.length < 200) return NextResponse.json({ error: 'Paste or upload the transcript first.' }, { status: 400 })
    if (transcript.length > MAX_TRANSCRIPT) return NextResponse.json({ error: 'That transcript is too long for one upload. Split it in two.' }, { status: 400 })
    if (!DATE.test(meetingDate)) return NextResponse.json({ error: 'Choose the meeting date.' }, { status: 400 })
    if (tracker === 'playbook' && body.consent !== true) return NextResponse.json({ error: 'Confirm that everyone in the meeting knew it was being recorded.' }, { status: 400 })

    const { data: up, error: insErr } = await svc.from('bcps_meeting_uploads').insert({
      tracker, playbook_slug: playbook || null, meeting_date: meetingDate, meeting_label: meetingLabel, transcript,
      uploaded_by_email: auth.user.email, uploaded_by_name: name,
      source_name: String(body.source_name || '').slice(0, 200) || null,
      ...(tracker === 'playbook' ? { consent_confirmed_at: new Date().toISOString(), consent_confirmed_by: auth.user.email } : {}),
    }).select('id').single()
    if (insErr || !up) return NextResponse.json({ error: 'Could not save the upload.' }, { status: 500 })

    // The content stop: nothing about a named student, a student ID, a
    // personnel or a legal matter is summarized into a project document.
    if (tracker === 'playbook') {
      let screen: Awaited<ReturnType<typeof screenTranscript>>
      try { screen = await screenTranscript(transcript) } catch (e) {
        console.error('meeting-transcript: screen failed', e)
        await svc.from('bcps_meeting_uploads').update({ status: 'failed', error: `screen: ${String((e as Error).message).slice(0, 900)}` }).eq('id', up.id)
        return NextResponse.json({ error: 'The privacy check could not run, so nothing was summarized. Try again in a minute.' }, { status: 502 })
      }
      await svc.from('bcps_meeting_uploads').update({ screen }).eq('id', up.id)
      if (!screen.clean) {
        await svc.from('bcps_meeting_uploads').update({ status: 'flagged' }).eq('id', up.id)
        return NextResponse.json({ error: screenMessage(screen), flagged: screen.findings }, { status: 422 })
      }
    }

    try {
      const proposal = tracker === 'marcomm'
        ? await proposeMarcomm(transcript, meetingDate, meetingLabel)
        : tracker === 'playbook'
          ? await proposePlaybook(playbook, transcript, meetingDate, meetingLabel)
          : await propose(transcript, meetingDate, meetingLabel, req.nextUrl.origin)
      await svc.from('bcps_meeting_uploads').update({ proposal }).eq('id', up.id)
      return NextResponse.json({ upload_id: up.id, proposal })
    } catch (e) {
      const message = e instanceof Anthropic.APIError ? `Claude could not read the transcript (${e.status}). Try again in a minute.` : (e as Error).message
      console.error('meeting-transcript: propose failed', e)
      await svc.from('bcps_meeting_uploads').update({ status: 'failed', error: String((e as Error).message).slice(0, 1000) }).eq('id', up.id)
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  if (body.action === 'apply' || body.action === 'discard') {
    const { data: up } = await svc.from('bcps_meeting_uploads').select('id, status, meeting_date, meeting_label, tracker, playbook_slug, proposal, source_name').eq('id', String(body.upload_id || '')).maybeSingle()
    if (!up || up.tracker !== tracker || (tracker === 'playbook' && up.playbook_slug !== playbook)) return NextResponse.json({ error: 'That upload was not found.' }, { status: 404 })
    if (up.status !== 'proposed') return NextResponse.json({ error: `That upload was already ${up.status}.` }, { status: 409 })

    if (body.action === 'discard') {
      await svc.from('bcps_meeting_uploads').update({ status: 'discarded' }).eq('id', up.id)
      return NextResponse.json({ ok: true })
    }

    if (tracker === 'playbook') {
      const pb = await loadPlaybook(svc, playbook)
      if (!pb) return NextResponse.json({ error: 'That Playbook was not found.' }, { status: 404 })
      const notes = playbookPayload(body.payload || {})
      if (!notes.summary && !notes.decisions.length && !notes.actions.length && !notes.open_questions.length
        && !notes.section_updates.length && !notes.queue_done.length && !notes.stage) {
        return NextResponse.json({ error: 'Nothing is selected to apply.' }, { status: 400 })
      }
      let filed: Awaited<ReturnType<typeof filePlaybookNotes>>
      try {
        filed = await filePlaybookNotes(svc, pb, up.meeting_label as string, up.meeting_date as string, name, up.id as string, notes)
      } catch (e) {
        console.error('meeting-transcript: playbook notes failed', e)
        return NextResponse.json({ error: (e as Error).message }, { status: 500 })
      }
      await logChange(svc, {
        slug: filed.slug, action: 'meeting_notes', actor: auth.user.email, approvedBy: auth.user.email, model: MODEL,
        source: { upload_id: up.id, file: up.source_name ?? null, meeting: up.meeting_label, meeting_date: up.meeting_date, playbook },
        summary: `Meeting notes filed from the ${up.meeting_label} transcript, reviewed by the lead.`,
      })
      // The notes are the meeting's record; the Playbook update is the point.
      // If the update fails the notes stay filed and the person is told.
      let result: Record<string, unknown> = { ...filed }
      try {
        const pbUpdate = await updatePlaybook(playbook, notes, up.meeting_label as string, up.meeting_date as string, filed.path,
          `Meeting notes: ${up.meeting_label}`, auth.user.email)
        result = { ...result, playbook_updated: true, playbook_version: pbUpdate.version, playbook_counts: pbUpdate.counts, revision_id: pbUpdate.revision_id }
        await logChange(svc, {
          slug: playbook, action: 'transcript_update', actor: auth.user.email, approvedBy: auth.user.email, model: MODEL,
          source: { upload_id: up.id, file: up.source_name ?? null, meeting: up.meeting_label, meeting_date: up.meeting_date, notes: filed.path, evidence: evidenceOf(up.proposal as Record<string, unknown> | null) },
          summary: `Updated from the ${up.meeting_label} transcript (${up.meeting_date})${pbUpdate.version ? ` as v${pbUpdate.version}` : ''}.`,
          unticked: unticked(up.proposal as Record<string, unknown> | null, notes), revisionId: pbUpdate.revision_id, after: pbUpdate.html,
        })
      } catch (e) {
        console.error('meeting-transcript: playbook update failed', e)
        result = { ...result, playbook_updated: false, playbook_error: (e as Error).message }
      }
      // Agenda outcomes the lead confirmed, written into the agenda record.
      const agenda = (up.proposal as Record<string, unknown> | null)?.agenda as { id: string; record_slug: string | null; items: (ItemOutcome & { verb: string; title: string; owner: string })[] } | undefined
      if (agenda && Array.isArray(body.agenda_outcomes)) {
        try {
          result = { ...result, agenda_outcomes: await recordOutcomes(playbook, agenda, body.agenda_outcomes, filed.path, up.id as string, auth.user.email) }
        } catch (e) {
          console.error('meeting-transcript: agenda outcomes not recorded', e)
          result = { ...result, agenda_outcomes_error: (e as Error).message }
        }
      }
      await svc.from('bcps_meeting_uploads').update({
        status: 'applied', applied_payload: notes, result, applied_by_email: auth.user.email, applied_at: new Date().toISOString(),
      }).eq('id', up.id)
      return NextResponse.json({ result })
    }

    const payload = tracker === 'marcomm'
      ? marcommPayload(body.payload || {}, (await loadMarcommRows(svc)).rows, up.meeting_date as string, up.meeting_label as string)
      : toPayload(body.payload || {}, up.meeting_date as string, up.meeting_label as string)
    if (!payload.changes.length && !payload.new_items.length && !payload.summary) {
      return NextResponse.json({ error: 'Nothing is selected to apply.' }, { status: 400 })
    }
    const { data: result, error } = tracker === 'marcomm'
      ? await svc.rpc('bcps_marcomm_apply_meeting_update', { payload })
      : await svc.rpc('bcps_web_team_apply_meeting_update', { payload, p_author: name })
    if (error) {
      console.error('meeting-transcript: apply failed', error)
      return NextResponse.json({ error: 'The tracker could not be updated. Nothing was changed.' }, { status: 500 })
    }
    await svc.from('bcps_meeting_uploads').update({
      status: 'applied', applied_payload: payload, result, applied_by_email: auth.user.email, applied_at: new Date().toISOString(),
    }).eq('id', up.id)
    return NextResponse.json({ result })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
