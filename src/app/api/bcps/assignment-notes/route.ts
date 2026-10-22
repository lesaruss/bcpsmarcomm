import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requireBcpsPageAccess } from '@/lib/bcps-auth'

// Web Team Assignments notes (2026-10-22). bcps_assignment_notes used to be
// read and written straight through Supabase REST with the public anon key,
// so anyone holding that key could read every internal note and add their
// own. Every reader and writer now comes through here, gated on the same
// page grant as Web Team Assignments itself; the table has no client policies.
// The tracker page is same-origin, so its fetches carry the session cookie.
//
//   GET ?slug=X     -> { notes }   one assignment's trail, newest first
//   GET ?counts=1   -> { counts, latest }   note count per slug, newest note time
//   GET ?recent=N   -> { notes }   the N newest notes overall (N <= 20)
//   POST { slug, note_text, author } -> { ok }
export const dynamic = 'force-dynamic'

const PAGE = 'bcps-assignments'
const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const noStore = (body: unknown, status = 200) => {
  const res = NextResponse.json(body, { status })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return noStore({ error: auth.error }, auth.status)
  const p = req.nextUrl.searchParams

  if (p.get('counts')) {
    const { data, error } = await svc.from('bcps_assignment_notes').select('assignment_slug, created_at')
    if (error) return noStore({ error: 'Could not read the notes.' }, 500)
    const counts: Record<string, number> = {}
    let latest: string | null = null
    for (const r of data ?? []) {
      counts[r.assignment_slug as string] = (counts[r.assignment_slug as string] || 0) + 1
      if (!latest || (r.created_at as string) > latest) latest = r.created_at as string
    }
    return noStore({ counts, latest })
  }

  const recent = Number(p.get('recent') || 0)
  if (recent > 0) {
    const { data, error } = await svc.from('bcps_assignment_notes')
      .select('id, assignment_slug, note_text, author, created_at')
      .order('created_at', { ascending: false }).limit(Math.min(recent, 20))
    if (error) return noStore({ error: 'Could not read the notes.' }, 500)
    return noStore({ notes: data ?? [] })
  }

  const slug = String(p.get('slug') || '')
  if (!SLUG.test(slug)) return noStore({ error: 'Choose an assignment.' }, 400)
  const { data, error } = await svc.from('bcps_assignment_notes')
    .select('id, assignment_slug, note_text, author, created_at')
    .eq('assignment_slug', slug).order('created_at', { ascending: false })
  if (error) return noStore({ error: 'Could not read the notes.' }, 500)
  return noStore({ notes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsPageAccess(req, PAGE)
  if (!auth.ok) return noStore({ error: auth.error }, auth.status)
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const text = String(body.note_text || '').trim()
  const author = String(body.author || '').trim().slice(0, 120) || 'Team'
  if (!SLUG.test(slug)) return noStore({ error: 'Choose an assignment.' }, 400)
  if (!text) return noStore({ error: 'Write the note first.' }, 400)
  if (text.length > 10_000) return noStore({ error: 'That note is too long.' }, 400)
  const { error } = await svc.from('bcps_assignment_notes').insert({ assignment_slug: slug, note_text: text, author })
  if (error) return noStore({ error: 'Could not save the note.' }, 500)
  return noStore({ ok: true })
}
