import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'

// Web Team Assignments row edits (2026-10-28). The page used to write
// bcps_assignment_tags straight through Supabase REST with the public anon
// key, under policies that let anyone insert and update, so anyone holding
// that key could rewrite the tracker. Every write now comes through here,
// gated on the page grant, as the notes are (api/bcps/assignment-notes). The
// table keeps public read: the page itself is public and renders the same data.
// The page is same-origin, so its fetches carry the session cookie.
//
//   POST { op: 'patch',  slug, fields }   update one existing row
//   POST { op: 'upsert', slug, fields }   insert the row or merge into it
//   POST { op: 'seed',   rows }           insert missing rows, never overwrite
export const dynamic = 'force-dynamic'

const PAGE = 'bcps-assignments'
const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/
const STATUSES = ['in-progress', 'pending', 'ongoing', 'completed', 'archived']
const PRIORITIES = ['high', 'medium', 'low']
const MAX_SEED = 300

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const noStore = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

const bool = (v: unknown) => typeof v === 'boolean' ? v : undefined
const textOrNull = (max: number) => (v: unknown) => v === null ? null : typeof v === 'string' ? (v.trim().slice(0, max) || null) : undefined
const dateOrNull = (v: unknown) => v === null ? null : typeof v === 'string' && DATE.test(v) ? v : undefined
const timeOrNull = (v: unknown) => v === null ? null : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : undefined

// The columns the page edits, each with how its value is checked; anything
// else, or a value that fails its check, is dropped.
const FIELDS: Record<string, (v: unknown) => unknown> = {
  team_ooc: bool,
  team_app_services: bool,
  status: (v) => typeof v === 'string' && STATUSES.includes(v) ? v : undefined,
  priority: (v) => v === null ? null : typeof v === 'string' && PRIORITIES.includes(v) ? v : undefined,
  completed_at: timeOrNull,
  lead_override: textOrNull(120),
  support_override: (v) => Array.isArray(v) ? v.filter((s) => typeof s === 'string').map((s: string) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 10) : undefined,
  start_date: dateOrNull,
  deadline_date: dateOrNull,
  is_ongoing: bool,
  overdue_dismissed: bool,
  title_override: textOrNull(200),
}

function clean(fields: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!fields || typeof fields !== 'object') return out
  for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
    const check = FIELDS[k]
    if (!check) continue
    const value = check(v)
    if (value !== undefined) out[k] = value
  }
  return out
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return noStore({ error: auth.error }, auth.status)
  const body = await req.json().catch(() => ({}))
  const op = String(body.op || '')

  if (op === 'seed') {
    const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, MAX_SEED)
      .filter((r: { assignment_slug?: unknown }) => typeof r?.assignment_slug === 'string' && SLUG.test(r.assignment_slug))
      .map((r: { assignment_slug: string }) => ({ ...clean(r), assignment_slug: r.assignment_slug }))
    if (!rows.length) return noStore({ ok: true })
    const { error } = await svc.from('bcps_assignment_tags').upsert(rows, { onConflict: 'assignment_slug', ignoreDuplicates: true })
    if (error) return noStore({ error: 'Could not save.' }, 500)
    return noStore({ ok: true })
  }

  const slug = String(body.slug || '')
  if (!SLUG.test(slug)) return noStore({ error: 'Unknown assignment.' }, 400)
  const fields = clean(body.fields)
  if (!Object.keys(fields).length) return noStore({ error: 'Nothing to save.' }, 400)
  const row = { ...fields, updated_at: new Date().toISOString() }

  if (op === 'patch') {
    const { error } = await svc.from('bcps_assignment_tags').update(row).eq('assignment_slug', slug)
    if (error) return noStore({ error: 'Could not save.' }, 500)
    return noStore({ ok: true })
  }
  if (op === 'upsert') {
    const { error } = await svc.from('bcps_assignment_tags').upsert({ ...row, assignment_slug: slug }, { onConflict: 'assignment_slug' })
    if (error) return noStore({ error: 'Could not save.' }, 500)
    return noStore({ ok: true })
  }
  return noStore({ error: 'Unknown op.' }, 400)
}
