// app/api/bcps/ada-owner-overrides/route.ts
//
// Per Sean, 2026-09-02: a "depends" glossary entry (fires from either
// FinalSite's shared template or a WCM's own content, depending on the
// page) needs a way for an admin to pin it to wcm or finalsite once they've
// looked at it, rather than leaving every occurrence sitting in limbo. This
// is a small override layer on top of the static glossary in
// lib/ada-glossary.ts: it stores overrides keyed by the glossary entry's
// stable `key`, and the UI treats an override as replacing that entry's
// owner everywhere it's rendered. Anything with no override keeps the
// glossary's default owner. A "depends" entry that has never been
// reclassified counts as NOT the school's responsibility for scoring
// purposes (Sean: "depends... we would just count it as a school doesn't
// do it") - that accounting happens client-side wherever owner buckets are
// tallied, this route only owns the override data itself.
//
// GET  -> { ok: true, overrides: { [glossary_key]: 'wcm'|'finalsite'|'depends' } }
// POST -> body { glossary_key, owner }, upserts one override, returns the
//         updated map in the same shape as GET.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function requireAuth(req: NextRequest): Promise<{ ok: true; userId: string; email: string | null } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, userId: user.id, email: user.email ?? null }
}

const VALID_OWNERS = new Set(['wcm', 'finalsite', 'depends'])

async function currentMap() {
  const { data, error } = await svc.from('bcps_ada_owner_overrides').select('glossary_key, owner')
  if (error) throw new Error(error.message)
  const map: Record<string, string> = {}
  for (const row of data ?? []) map[row.glossary_key as string] = row.owner as string
  return map
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    return NextResponse.json({ ok: true, overrides: await currentMap() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load overrides.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const glossary_key = body?.glossary_key
  const owner = body?.owner
  if (!glossary_key || typeof glossary_key !== 'string') return NextResponse.json({ error: 'glossary_key is required.' }, { status: 400 })
  if (!VALID_OWNERS.has(owner)) return NextResponse.json({ error: "owner must be 'wcm', 'finalsite', or 'depends'." }, { status: 400 })

  const { error } = await svc.from('bcps_ada_owner_overrides').upsert(
    { glossary_key, owner, updated_by: auth.email ?? auth.userId, updated_at: new Date().toISOString() },
    { onConflict: 'glossary_key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    return NextResponse.json({ ok: true, overrides: await currentMap() })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Saved, but failed to reload overrides.' }, { status: 500 })
  }
}
