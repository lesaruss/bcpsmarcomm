// app/api/bcps/school-sitemap/route.ts
//
// GET /api/bcps/school-sitemap?school_id=<id> - discovers the page URLs on
// a school's site (sitemap.xml only, capped, see lib/sitemap-crawl.ts) so
// the Schools ADA page can show what a "Scan Full Site" run will actually
// scan before the WCM/DWT team commits WAVE credits to it. Same auth model
// as /api/bcps/schools (any signed-in BCPS Marcomm login, no ACL gate -
// per V, 2026-08-19, this tooling is a working tool for the whole team).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { discoverSchoolPages } from '@/lib/sitemap-crawl'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function requireAuth(req: NextRequest): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const schoolId = req.nextUrl.searchParams.get('school_id')
  if (!schoolId) return NextResponse.json({ error: 'school_id required' }, { status: 400 })

  const { data: school, error } = await svc
    .from('bcps_schools')
    .select('id, name, site_url')
    .eq('id', schoolId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })
  if (!school.site_url) return NextResponse.json({ error: `${school.name} has no website URL on file yet. Add one on the School ADA Accounts page first.` }, { status: 400 })

  const discovery = await discoverSchoolPages(school.site_url)
  return NextResponse.json({ ok: true, school: { id: school.id, name: school.name }, ...discovery })
}
