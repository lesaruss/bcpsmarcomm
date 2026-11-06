import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireNamedPageGrant } from '@/lib/bcps-auth'
import { askClaudeJson } from '@/lib/anthropic-key'

// Web Team Meetings (Sean, 2026-11-06): the agenda, notes and recording of the
// Web Team Meeting (Sean, Farrah Wilson, Felicia Hicks), shown as a tab of the
// District Web Team Guide. Not a playbook. Only people with a named grant on
// the 'web-team-meetings' page (and the superadmin) can read or change it.
//
//   GET                                    -> { allowed, meetings }
//   POST { action: 'save', meeting }       -> { meeting }  create or update the agenda, title, date, recording
//   POST { action: 'notes', id, transcript } -> { meeting } Claude writes the notes from the transcript
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const PAGE = 'web-team-meetings'
const TEAM = 'web-team'
const MODEL = 'claude-opus-5-5'
const MAX_TRANSCRIPT = 600_000

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Link { label: string; url: string }
interface AgendaItem { title: string; owner: string; minutes: number | null; summary: string; detail: string; goal: string; done: string[]; left: string[]; points: string[]; links: Link[] }

const str = (v: unknown, max = 2000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const safeUrl = (v: unknown) => {
  const s = str(v, 2000)
  if (!s) return ''
  if (s.startsWith('/')) return s
  try { const u = new URL(s); return u.protocol === 'https:' ? u.toString() : '' } catch { return '' }
}

function cleanAgenda(v: unknown): AgendaItem[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, 30).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>
    const links = Array.isArray(o.links) ? o.links.slice(0, 10).map((l) => {
      const L = (l ?? {}) as Record<string, unknown>
      return { label: str(L.label, 120), url: safeUrl(L.url) }
    }).filter((l) => l.url) : []
    const m = Number(o.minutes)
    const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 600)).filter(Boolean).slice(0, 20) : [])
    return {
      title: str(o.title, 300), owner: str(o.owner, 200), minutes: Number.isFinite(m) && m > 0 ? Math.round(m) : null,
      summary: str(o.summary, 600), detail: str(o.detail, 4000), goal: str(o.goal, 600),
      done: list(o.done), left: list(o.left), points: list(o.points), links,
    }
  }).filter((i) => i.title)
}

const COLS = 'id, meeting_date, title, time_label, join_url, attendees, agenda, video_url, notes, notes_at, transcript, updated_at, updated_by'

const NOTES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items', 'decisions', 'action_items', 'other_topics'],
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['agenda_index', 'outcome', 'discussed'],
        properties: { agenda_index: { type: 'integer' }, outcome: { type: 'string' }, discussed: { type: 'boolean' } },
      },
    },
    decisions: { type: 'array', items: { type: 'string' } },
    action_items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['task', 'owner', 'due'],
        properties: { task: { type: 'string' }, owner: { type: 'string' }, due: { type: 'string' } },
      },
    },
    other_topics: { type: 'array', items: { type: 'string' } },
  },
}

const SYSTEM = `You write meeting notes for the District Web Team at Broward County Public Schools (BCPS). The people in the meeting are Sean A. Russell, Farrah Wilson and Felicia Hicks; others may join.
You get the meeting's agenda (numbered from 0) and its transcript. Write:
- summary: three to five plain sentences on what the meeting covered and where things landed.
- items: one entry per agenda item, by agenda_index. outcome is one to three sentences on what was said and decided about it; discussed is false (and outcome says "Not discussed.") when the transcript never reaches it.
- decisions: each decision the team made, one sentence each.
- action_items: each thing someone agreed to do. owner is the person's name as the team uses it (Sean, Farrah, Felicia, or another named person); due is the date or day said, or "" if none was said.
- other_topics: anything discussed that was not on the agenda, one sentence each.
Rules: only what the transcript supports, never invent. Plain, direct sentences in the team's own words. No em dashes. Transcription often garbles names; use the attendee names above when the match is clear, and leave an unfamiliar name as written rather than guessing. Leave out any student's name, student ID, personnel or legal matter.`

export async function GET(req: NextRequest) {
  const auth = await requireNamedPageGrant(req, PAGE)
  if (!auth.ok) return NextResponse.json({ ok: false, allowed: false }, { status: auth.status })
  const { data, error } = await svc.from('bcps_team_meetings').select(COLS).eq('team', TEAM).order('meeting_date', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const meetings = (data ?? []).map((m) => ({ ...m, has_transcript: !!m.transcript, transcript: undefined }))
  return NextResponse.json({ ok: true, allowed: true, meetings })
}

export async function POST(req: NextRequest) {
  const auth = await requireNamedPageGrant(req, PAGE)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  const email = auth.user.email
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  if (body.action === 'save') {
    const m = (body.meeting ?? {}) as Record<string, unknown>
    const date = str(m.meeting_date, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: 'Pick the meeting date.' }, { status: 400 })
    const row = {
      team: TEAM,
      meeting_date: date,
      title: str(m.title, 200) || 'Web Team Meeting',
      time_label: str(m.time_label, 80) || null,
      join_url: safeUrl(m.join_url) || null,
      attendees: Array.isArray(m.attendees) ? m.attendees.map((a) => str(a, 120)).filter(Boolean).slice(0, 20) : [],
      agenda: cleanAgenda(m.agenda),
      video_url: safeUrl(m.video_url) || null,
      updated_by: email,
      updated_at: new Date().toISOString(),
    }
    const id = str(m.id, 64)
    const q = id
      ? svc.from('bcps_team_meetings').update(row).eq('id', id).eq('team', TEAM).select(COLS).single()
      : svc.from('bcps_team_meetings').insert({ ...row, created_by: email }).select(COLS).single()
    const { data, error } = await q
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, meeting: { ...data, has_transcript: !!data.transcript, transcript: undefined } })
  }

  if (body.action === 'notes') {
    const id = str(body.id, 64)
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
    if (!id) return NextResponse.json({ ok: false, error: 'Missing meeting.' }, { status: 400 })
    if (transcript.length < 200) return NextResponse.json({ ok: false, error: 'That transcript looks too short. Paste the whole thing, or choose the .vtt file from Teams.' }, { status: 400 })
    if (transcript.length > MAX_TRANSCRIPT) return NextResponse.json({ ok: false, error: 'That transcript is too long to read in one go.' }, { status: 400 })
    const { data: mt } = await svc.from('bcps_team_meetings').select('id, title, meeting_date, attendees, agenda').eq('id', id).eq('team', TEAM).maybeSingle()
    if (!mt) return NextResponse.json({ ok: false, error: 'Meeting not found.' }, { status: 404 })
    const agenda = (mt.agenda ?? []) as AgendaItem[]
    const prompt = `Meeting: ${mt.title}, ${mt.meeting_date}. Attendees: ${(mt.attendees ?? []).join(', ') || 'Sean A. Russell, Farrah Wilson, Felicia Hicks'}.

Agenda:
${agenda.map((a, i) => `${i}. ${a.title}${a.owner ? ` (${a.owner})` : ''}${a.summary || a.detail ? `: ${a.summary || a.detail}` : ''}`).join('\n') || '(no agenda)'}

Transcript:
${transcript}`
    let notes: Record<string, unknown>
    try {
      notes = await askClaudeJson(MODEL, NOTES_SCHEMA, SYSTEM, prompt)
    } catch (e) {
      // Keep the transcript so nobody has to upload it twice.
      await svc.from('bcps_team_meetings').update({ transcript, updated_by: email, updated_at: new Date().toISOString() }).eq('id', id)
      return NextResponse.json({ ok: false, error: `The notes could not be written: ${(e as Error).message}` }, { status: 502 })
    }
    const { data, error } = await svc.from('bcps_team_meetings')
      .update({ transcript, notes, notes_at: new Date().toISOString(), updated_by: email, updated_at: new Date().toISOString() })
      .eq('id', id).select(COLS).single()
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, meeting: { ...data, has_transcript: true, transcript: undefined } })
  }

  if (body.action === 'transcript') {
    const id = str(body.id, 64)
    const { data } = await svc.from('bcps_team_meetings').select('transcript').eq('id', id).eq('team', TEAM).maybeSingle()
    return NextResponse.json({ ok: true, transcript: data?.transcript ?? '' })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action.' }, { status: 400 })
}
