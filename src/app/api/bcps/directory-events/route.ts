import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// POST /api/bcps/directory-events - public. The Department & Program Directory
// embed (public/embeds/department-program-directory.html) reports what people
// search for and which result they open, so the Directory editor can show top
// searches and searches that found nothing (BOSS 2026-10-02). Anon has no
// access to bcps_directory_events at all; this route is the only way in.
//
// What it stores and what it doesn't:
//   - no IP, account, or lasting visitor id. session_id is random per page
//     load. The IP is used only for the in-memory throttle below.
//   - a query that looks like an email address or a long number (a student
//     or employee ID, a phone number) is replaced with a placeholder before
//     it is stored, so the log never holds someone's personal details.
//
// Accepts one event or { events: [...] } (up to 10), as JSON. sendBeacon
// posts text/plain, so the body is read as text and parsed here.
//
// event 'feedback' is the widget's "Can't find it?" form (Sean and Vanessa,
// 2026-10-02): what the person was looking for, in their words, stored in
// bcps_directory_feedback for the editor's Search insights tab. The same
// redaction applies, since people sometimes type their email or a phone
// number into a message box.

const MAX_PER_MINUTE = 120
const hits = new Map<string, { n: number; t: number }>()
function throttled(key: string) {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || now - h.t > 60_000) {
    hits.set(key, { n: 1, t: now })
    if (hits.size > 5000) hits.clear()
    return false
  }
  h.n++
  return h.n > MAX_PER_MINUTE
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION = /^[a-z0-9]{8,40}$/i
const TYPES = new Set(['all', 'dept', 'prog'])
const REDACTED = '(personal detail removed)'

function text(v: unknown, max: number) {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}
function int(v: unknown, max: number) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null
}

const PERSONAL = /[^\s@]+@[^\s@]+|\+?\d[\d\s().-]{4,}\d/g
function hasPersonal(s: string) {
  return /@/.test(s) || /\d{5,}/.test(s.replace(/[\s().-]/g, ''))
}

function cleanFeedback(e: any) {
  let message = text(e.message, 500)
  if (!message) return null
  // Keep the message readable, removing only the personal detail itself.
  if (hasPersonal(message)) message = message.replace(PERSONAL, '[removed]')
  let query = text(e.query, 120)
  if (query && hasPersonal(query)) query = REDACTED
  return {
    query,
    message,
    result_count: int(e.result_count, 1000),
    session_id: typeof e.session_id === 'string' && SESSION.test(e.session_id) ? e.session_id : null,
    host: text(e.host, 200),
  }
}

function clean(e: any) {
  if (!e || (e.event !== 'search' && e.event !== 'click')) return null
  let query = text(e.query, 120)
  if (query && hasPersonal(query)) query = REDACTED
  const norm = query ? query.toLowerCase() : null
  if (e.event === 'search' && !norm) return null
  return {
    event: e.event,
    query,
    query_norm: norm,
    result_count: int(e.result_count, 1000),
    entry_id: typeof e.entry_id === 'string' && UUID.test(e.entry_id) ? e.entry_id : null,
    result_rank: int(e.result_rank, 1000),
    type_filter: TYPES.has(e.type_filter) ? e.type_filter : null,
    topic_filter: text(e.topic_filter, 20),
    session_id: typeof e.session_id === 'string' && SESSION.test(e.session_id) ? e.session_id : null,
    host: text(e.host, 200),
    input: e.input === 'voice' || e.input === 'typed' ? e.input : null,
  }
}

export async function POST(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (throttled(ip)) return new NextResponse(null, { status: 429 })

  let body: any
  try { body = JSON.parse(await req.text()) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const list: any[] = Array.isArray(body?.events) ? body.events.slice(0, 10) : [body]
  const feedback = list.filter(e => e?.event === 'feedback').map(cleanFeedback).filter(Boolean)
  const rows = list.filter(e => e?.event !== 'feedback').map(clean).filter(Boolean)
  if (!rows.length && !feedback.length) return NextResponse.json({ error: 'No valid events' }, { status: 400 })

  const results = await Promise.all([
    rows.length ? svc.from('bcps_directory_events').insert(rows) : null,
    feedback.length ? svc.from('bcps_directory_feedback').insert(feedback) : null,
  ])
  if (results.some(r => r?.error)) return NextResponse.json({ error: 'Could not record event' }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
