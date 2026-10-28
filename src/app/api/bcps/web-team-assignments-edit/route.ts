import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireBcpsPageAccess, requireNamedPageGrant } from '@/lib/bcps-auth'
import { loadAssignments } from '@/lib/bcps-team-home'

// The Web Team Assignments toolbar (V, 2026-10-28): the same row of buttons a
// Playbook has, given a tracker's meaning. Edit this page adds an assignment or
// rewrites one's description, for the people who may upload its transcripts
// (the named 'meeting-transcripts' grant). Add your input leaves a note on an
// assignment, for anyone with the tracker. Titles, leads, dates and statuses
// stay edited on the row itself. Writes land where transcript uploads write
// (bcps_assignment_tags, bcps_assignment_notes), so lib/web-team-tracker merges
// them into the page the same way.
//
//   GET                                               -> { can_edit, can_input, rows: [{ slug, title, desc, status }] }
//   POST { action: 'add', title, description, lead, support, status } -> { ok, slug }
//   POST { action: 'describe', slug, description }                   -> { ok }
//   POST { action: 'input', slug, text }                              -> { ok }
export const dynamic = 'force-dynamic'

const READ_PAGE = 'bcps-assignments'
const EDIT_PAGE = 'meeting-transcripts'
const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/
const STATUSES = ['in-progress', 'pending', 'ongoing', 'completed', 'archived']

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const noStore = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

async function displayName(userId: string, email: string): Promise<string> {
  const { data } = await svc.from('wcm_cert_users').select('full_name').eq('user_id', userId).maybeSingle()
  if (data?.full_name) return data.full_name as string
  const local = email.split('@')[0].split('.')
  return local.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
const today = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })

// A new row's slug from its title, unused by any row on the page or in the table.
async function freeSlug(title: string, taken: Set<string>): Promise<string> {
  const base = title.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'assignment'
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`
    if (taken.has(slug)) continue
    const { data } = await svc.from('bcps_assignment_tags').select('assignment_slug').eq('assignment_slug', slug).maybeSingle()
    if (!data) return slug
  }
  return `${base}-${Date.now()}`
}

export async function GET(req: NextRequest) {
  const read = await requireBcpsPageAccess(req, READ_PAGE)
  if (!read.ok) return noStore({ can_edit: false, can_input: false, rows: [] }, read.status === 401 ? 401 : 200)
  const edit = await requireNamedPageGrant(req, EDIT_PAGE)
  const rows = await loadAssignments(svc, req.nextUrl.origin).catch(() => [])
  return noStore({
    can_edit: edit.ok,
    can_input: true,
    rows: rows.map((r) => ({ slug: r.slug, title: r.title, desc: r.desc, status: r.status })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')

  if (action === 'input') {
    const auth = await requireBcpsPageAccess(req, READ_PAGE)
    if (!auth.ok) return noStore({ error: auth.error }, auth.status)
    const slug = String(body.slug || '')
    const note = text(body.text, 4000)
    if (!SLUG.test(slug)) return noStore({ error: 'Choose an assignment.' }, 400)
    if (!note) return noStore({ error: 'Write your input first.' }, 400)
    const author = await displayName(auth.user.userId, auth.user.email)
    const { error } = await svc.from('bcps_assignment_notes').insert({ assignment_slug: slug, note_text: note, author })
    if (error) return noStore({ error: 'Your input could not be saved. Try again.' }, 500)
    return noStore({ ok: true })
  }

  const auth = await requireNamedPageGrant(req, EDIT_PAGE)
  if (!auth.ok) return noStore({ error: auth.status === 401 ? auth.error : 'Only the people who update this tracker can edit it.' }, auth.status)
  const author = await displayName(auth.user.userId, auth.user.email)

  if (action === 'describe') {
    const slug = String(body.slug || '')
    const description = text(body.description, 2000)
    if (!SLUG.test(slug)) return noStore({ error: 'Choose an assignment.' }, 400)
    if (!description) return noStore({ error: 'Write the new description first.' }, 400)
    await svc.from('bcps_assignment_tags').upsert({ assignment_slug: slug }, { onConflict: 'assignment_slug', ignoreDuplicates: true })
    const { error } = await svc.from('bcps_assignment_tags')
      .update({ description_override: description, updated_at: new Date().toISOString() }).eq('assignment_slug', slug)
    if (error) return noStore({ error: 'The description could not be saved. Try again.' }, 500)
    await svc.from('bcps_assignment_notes').insert({ assignment_slug: slug, note_text: `Description updated on the page: ${description}`, author })
    return noStore({ ok: true })
  }

  if (action === 'add') {
    const title = text(body.title, 200)
    const description = text(body.description, 2000)
    const lead = text(body.lead, 120)
    const support = (Array.isArray(body.support) ? body.support : String(body.support || '').split(','))
      .map((s: unknown) => text(s, 120)).filter(Boolean).slice(0, 10)
    const status = STATUSES.includes(body.status) ? body.status as string : (lead ? 'in-progress' : 'pending')
    if (!title) return noStore({ error: 'Give the assignment a title.' }, 400)
    const rows = await loadAssignments(svc, req.nextUrl.origin).catch(() => [])
    if (rows.some((r) => r.title.toLowerCase() === title.toLowerCase())) return noStore({ error: 'An assignment with that title is already on the tracker.' }, 409)
    const slug = await freeSlug(title, new Set(rows.map((r) => r.slug)))
    const now = new Date().toISOString()
    const { error } = await svc.from('bcps_assignment_tags').insert({
      assignment_slug: slug, title_override: title, description_override: description || null, lead_override: lead || null,
      support_override: support.length ? support : null, status, completed_at: ['completed', 'archived'].includes(status) ? now : null,
      team_ooc: false, team_app_services: false, added_from_meeting: `${today()} Added on the page`, added_at: now, updated_at: now,
    })
    if (error) return noStore({ error: 'The assignment could not be added. Try again.' }, 500)
    await svc.from('bcps_assignment_notes').insert({ assignment_slug: slug, note_text: `Added on the page by ${author}.`, author })
    return noStore({ ok: true, slug })
  }

  return noStore({ error: 'Unknown action.' }, 400)
}
