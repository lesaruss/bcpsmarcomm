import type { SupabaseClient } from '@supabase/supabase-js'

// Meeting transcript upload for MarComm Assignments (Sean, 2026-10-21): the
// MarComm side of /api/bcps/meeting-transcript (tracker 'marcomm'). Claude
// reads a Marcomm Meeting transcript against the open requests and proposes
// changes; applying runs bcps_marcomm_apply_meeting_update, which writes a
// dated meeting note on every row it touches and saves the meeting snapshot.
//
// The proposal uses the same shape as Web Team Assignments so one review
// screen serves both (components/bcps/MeetingTranscriptUpload): "slug" is the
// row's reference (J1744 for a job number, T<id> for a team item) and
// "deadline_date" is the date needed.

export const MARCOMM_TRANSCRIPT_PAGE = 'marcomm-transcripts'
export const MARCOMM_STATUSES = ['new', 'needs_info', 'assigned', 'in_progress', 'in_review', 'scheduled', 'on_hold', 'completed', 'declined']

const orNull = (t: Record<string, unknown>) => ({ anyOf: [t, { type: 'null' }] })
const nullableString = orNull({ type: 'string' })
const nullableList = orNull({ type: 'array', items: { type: 'string' } })
export const MARCOMM_PROPOSAL_SCHEMA = {
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
        required: ['slug', 'status', 'lead', 'support', 'deadline_date', 'priority', 'note', 'evidence'],
        properties: {
          slug: { type: 'string' },
          status: orNull({ type: 'string', enum: MARCOMM_STATUSES }),
          lead: nullableString,
          support: nullableList,
          deadline_date: nullableString,
          priority: orNull({ type: 'string', enum: ['high', 'medium', 'low'] }),
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
        required: ['title', 'description', 'lead', 'support', 'deadline_date', 'priority', 'note', 'evidence'],
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          lead: nullableString,
          support: nullableList,
          deadline_date: nullableString,
          priority: orNull({ type: 'string', enum: ['high', 'medium', 'low'] }),
          note: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
  },
}

export const MARCOMM_SYSTEM = `You update the Broward County Public Schools Office of Communications request tracker (MarComm Assignments) from a Marcomm Meeting transcript.

Rules:
- Apply what was stated in the meeting: who leads or supports a request, status changes, new or changed dates needed, priorities, and new work the team took on. Do not ask; propose.
- Only propose a change the transcript actually supports. If something was only mentioned in passing, or is ambiguous, leave it out. Never invent dates, owners or decisions.
- The team refers to requests by job number ("1744", "job 1744") or by name. Match discussion to an existing row whenever it is the same request. Propose a new item only for work that has no row (it becomes a team item without a job number).
- Statuses: new, needs_info, assigned, in_progress, in_review, scheduled, on_hold, completed, declined. Use completed only when the work was said to be done, declined only when the team said it will not do it.
- Use people's names the way the tracker and its team list already write them.
- BECON is always written BECON, all capitals.
- Dates are YYYY-MM-DD. Resolve relative dates ("next Friday", "two weeks") from the meeting date.

For each change: set only the fields that change and null for the rest (support null means unchanged; an empty list clears it). "slug" is the row's ref exactly as given. "deadline_date" is the date needed. "note" is one or two plain sentences saying what was said or decided, written for the team. "evidence" quotes or closely paraphrases the transcript line(s) it rests on, so a reviewer can check it.

"summary" is two to four sentences on what this meeting changed, saved with the meeting's version of the tracker.

Write plainly. No em dashes.`

interface Row {
  id: string; job_number: number | null; title: string; requester_name: string | null; org_name: string | null
  lead: string | null; support: string | null; status: string; date_needed: string | null; priority: string | null
}
export interface MarcommRow extends Row { ref: string }

const refOf = (r: Row) => r.job_number ? `J${r.job_number}` : `T${r.id.slice(0, 8)}`

// Open requests, plus the team roster so names come out right.
export async function loadMarcommRows(svc: SupabaseClient): Promise<{ rows: MarcommRow[]; team: string[] }> {
  const [{ data: rows }, { data: team }] = await Promise.all([
    svc.from('bcps_marcomm_requests')
      .select('id, job_number, title, requester_name, org_name, lead, support, status, date_needed, priority')
      .is('merged_into', null).not('status', 'in', '(completed,declined)').order('job_number', { ascending: false, nullsFirst: false }).limit(500),
    svc.from('bcps_marcomm_team').select('name').eq('active', true).order('sort_order'),
  ])
  return { rows: (rows ?? []).map((r) => ({ ...(r as Row), ref: refOf(r as Row) })), team: (team ?? []).map((t) => t.name as string) }
}

export function marcommPrompt(rows: MarcommRow[], team: string[]): string {
  return `Team: ${team.join(', ')}\n\n` + rows.map((r) => [
    `ref: ${r.ref}`,
    `title: ${r.title}`,
    r.requester_name || r.org_name ? `requested by: ${[r.requester_name, r.org_name].filter(Boolean).join(', ')}` : null,
    `lead: ${r.lead || '-'}`,
    r.support ? `support: ${r.support}` : null,
    `status: ${r.status}`,
    r.date_needed ? `date needed: ${r.date_needed}` : null,
    r.priority ? `priority: ${r.priority}` : null,
  ].filter(Boolean).join('\n')).join('\n\n')
}

// Keep only changes to rows that exist, and attach each row as it stands now
// for the review screen.
export function attachCurrent(proposal: { changes: Array<Record<string, unknown> & { slug: string }> }, rows: MarcommRow[]) {
  const byRef = new Map(rows.map((r) => [r.ref, r]))
  proposal.changes = (proposal.changes || []).filter((c) => byRef.has(c.slug)).map((c) => {
    const r = byRef.get(c.slug)!
    return { ...c, current: { title: `${r.job_number ? `#${r.job_number} ` : ''}${r.title}`, lead: r.lead, support: r.support, status: r.status, deadline: r.date_needed, priority: r.priority } }
  })
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

// The reviewed proposal -> the bcps_marcomm_apply_meeting_update payload.
// Rows are matched by id; only the fields that change are sent.
export function marcommPayload(p: { summary?: unknown; changes?: Array<Record<string, unknown>>; new_items?: Array<Record<string, unknown>> }, rows: MarcommRow[], meetingDate: string, meetingLabel: string) {
  const byRef = new Map(rows.map((r) => [r.ref, r]))
  const pick = (src: Record<string, unknown>, out: Record<string, unknown>) => {
    if (typeof src.status === 'string' && MARCOMM_STATUSES.includes(src.status)) out.status = src.status
    if (typeof src.lead === 'string' && src.lead.trim()) out.lead = src.lead.trim()
    if (Array.isArray(src.support)) out.support = src.support.filter((s) => typeof s === 'string' && s.trim()).map((s) => (s as string).trim()).join(', ')
    if (typeof src.deadline_date === 'string' && DATE.test(src.deadline_date)) out.date_needed = src.deadline_date
    if (typeof src.priority === 'string' && ['high', 'medium', 'low'].includes(src.priority)) out.priority = src.priority
    if (typeof src.note === 'string' && src.note.trim()) out.note = src.note.trim()
    return out
  }
  return {
    meeting_date: meetingDate,
    meeting_label: meetingLabel,
    summary: typeof p.summary === 'string' ? p.summary.trim() : '',
    changes: (p.changes || []).filter((c) => typeof c.slug === 'string' && byRef.has(c.slug as string))
      .map((c) => pick(c, { id: byRef.get(c.slug as string)!.id })),
    new_items: (p.new_items || []).filter((n) => typeof n.title === 'string' && (n.title as string).trim())
      .map((n) => pick(n, { title: (n.title as string).trim(), ...(typeof n.description === 'string' && n.description.trim() ? { description: n.description.trim() } : {}) })),
  }
}
