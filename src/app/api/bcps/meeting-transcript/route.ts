import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'
import { loadAssignments } from '@/lib/bcps-team-home'
import { MARCOMM_TRANSCRIPT_PAGE, MARCOMM_PROPOSAL_SCHEMA, MARCOMM_SYSTEM, loadMarcommRows, marcommPrompt, attachCurrent, marcommPayload } from '@/lib/marcomm-meeting-transcript'

// Meeting transcript upload for Web Team Assignments (Sean, 2026-10-21).
// A designated person (granted the 'meeting-transcripts' page, or a BCPS
// admin) pastes or uploads a transcript; Claude reads it against the current
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
// MarComm Assignments (Sean, 2026-10-21), under the 'marcomm-transcripts'
// grant; see lib/marcomm-meeting-transcript.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PAGE = 'meeting-transcripts'
const MODEL = 'claude-opus-5-5'
const MAX_TRANSCRIPT = 600_000
const STATUSES = ['in-progress', 'pending', 'ongoing', 'completed', 'archived']

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// The key lives in the vault (lesaruss_secrets.ANTHROPIC_API_KEY), read with
// the service role the same way audit-worker reads its key; an env var wins
// if one is ever set on the project.
async function anthropicKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const lesaruss = createServiceClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
  const { data } = await lesaruss.from('lesaruss_secrets').select('value').eq('key', 'ANTHROPIC_API_KEY').maybeSingle()
  return (data?.value as string) || null
}

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

type Tracker = 'web-team' | 'marcomm'
const trackerOf = (v: unknown): Tracker => (v === 'marcomm' ? 'marcomm' : 'web-team')

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
  const auth = await requireBcpsPageAccess(req, tracker === 'marcomm' ? MARCOMM_TRANSCRIPT_PAGE : PAGE)
  if (!auth.ok) return NextResponse.json({ allowed: false }, { status: auth.status === 401 ? 401 : 200 })
  const { data } = await svc.from('bcps_meeting_uploads')
    .select('id, meeting_date, meeting_label, status, uploaded_by_name, created_at, applied_at, result')
    .eq('tracker', tracker).order('created_at', { ascending: false }).limit(10)
  return NextResponse.json({ allowed: true, uploads: data ?? [] })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const tracker = trackerOf(body.tracker)
  const auth = await requireBcpsPageAccess(req, tracker === 'marcomm' ? MARCOMM_TRANSCRIPT_PAGE : PAGE)
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? auth.error : 'You have not been designated to upload meeting transcripts.' }, { status: auth.status })
  const name = await displayName(auth.user.userId, auth.user.email)

  if (body.action === 'propose') {
    const transcript = String(body.transcript || '').trim()
    const meetingDate = String(body.meeting_date || '')
    const meetingLabel = String(body.meeting_label || '').trim().slice(0, 120) || (tracker === 'marcomm' ? 'Marcomm Meeting' : 'District Web Team Meeting')
    if (transcript.length < 200) return NextResponse.json({ error: 'Paste or upload the transcript first.' }, { status: 400 })
    if (transcript.length > MAX_TRANSCRIPT) return NextResponse.json({ error: 'That transcript is too long for one upload. Split it in two.' }, { status: 400 })
    if (!DATE.test(meetingDate)) return NextResponse.json({ error: 'Choose the meeting date.' }, { status: 400 })

    const { data: up, error: insErr } = await svc.from('bcps_meeting_uploads').insert({
      tracker, meeting_date: meetingDate, meeting_label: meetingLabel, transcript,
      uploaded_by_email: auth.user.email, uploaded_by_name: name,
    }).select('id').single()
    if (insErr || !up) return NextResponse.json({ error: 'Could not save the upload.' }, { status: 500 })

    try {
      const proposal = tracker === 'marcomm'
        ? await proposeMarcomm(transcript, meetingDate, meetingLabel)
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
    const { data: up } = await svc.from('bcps_meeting_uploads').select('id, status, meeting_date, meeting_label, tracker').eq('id', String(body.upload_id || '')).maybeSingle()
    if (!up || up.tracker !== tracker) return NextResponse.json({ error: 'That upload was not found.' }, { status: 404 })
    if (up.status !== 'proposed') return NextResponse.json({ error: `That upload was already ${up.status}.` }, { status: 409 })

    if (body.action === 'discard') {
      await svc.from('bcps_meeting_uploads').update({ status: 'discarded' }).eq('id', up.id)
      return NextResponse.json({ ok: true })
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
