// app/api/bcps/school-scores/route.ts
//
// GET /api/bcps/school-scores - per-school aggregate for the Schools ADA
// page: the school's most recent full-site scan batch (scan_batch_id set
// by /api/bcps/school-sitemap + repeated /api/bcps/ada-scan calls from
// SchoolsAdaPage), averaged into one score. A school with no full-site scan
// yet simply has no aggregate - single-page scans (scan_batch_id null,
// e.g. a WCM using the standalone ADA Scanner tool) are not counted here,
// they're a different measurement (one page vs. the whole site).
//
// 2026-09-02: now also returns each page's ada_violations/wave_violations
// so ADA Manager can render real per-issue detail (glossary-mapped, same
// as the standalone ADA Scanner) instead of just a page_url + score row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

type ViolationRow = {
  id: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null
  description: string
  help: string
  helpUrl: string
  affected_elements: number | null
}

type WaveViolationRow = {
  category: 'error' | 'contrast' | 'alert'
  id: string
  description: string
  count: number
}

type Row = {
  school_id: string
  scan_batch_id: string | null
  ada_score: number | null
  ada_violations_critical: number | null
  ada_violations_serious: number | null
  ada_violations_moderate: number | null
  ada_violations_minor: number | null
  ada_violations: ViolationRow[] | null
  wave_violations: WaveViolationRow[] | null
  page_url: string
  audited_at: string
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await svc
    .from('bcps_audit_results')
    .select('school_id, scan_batch_id, ada_score, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, ada_violations, wave_violations, page_url, audited_at')
    .eq('auditor', 'wcm-ada-scanner')
    .not('school_id', 'is', null)
    .not('scan_batch_id', 'is', null)
    .order('audited_at', { ascending: false })
    .limit(5000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as Row[]

  // Find each school's most recent batch (rows are already newest-first, so
  // the first row seen per school_id fixes that school's latest batch id).
  const latestBatchBySchool = new Map<string, string>()
  for (const r of rows) {
    if (!r.scan_batch_id) continue
    if (!latestBatchBySchool.has(r.school_id)) latestBatchBySchool.set(r.school_id, r.scan_batch_id)
  }

  type Page = {
    page_url: string
    ada_score: number | null
    ada_violations: ViolationRow[]
    wave_violations: WaveViolationRow[]
    ada_violations_critical: number
    ada_violations_serious: number
    ada_violations_moderate: number
    ada_violations_minor: number
  }
  type Agg = {
    school_id: string
    scan_batch_id: string
    page_count: number
    avg_ada_score: nuler | null
    critical_count: number
    serious_count: number
    last_audited_at: string
    pages: Page[]
  }
  const aggBySchool = new Map<string, Agg>()

  for (const r of rows) {
    if (r.scan_batch_id !== latestBatchBySchool.get(r.school_id)) continue
    let agg = aggBySchool.get(r.school_id)
    if (!agg) {
      agg = {
        school_id: r.school_id,
        scan_batch_id: r.scan_batch_id!,
        page_count: 0,
        avg_ada_score: null,
        critical_count: 0,
        serious_count: 0,
        last_audited_at: r.audited_at,
        pages: [],
      }
      aggBySchool.set(r.school_id, agg)
    }
    agg.page_count += 1
    agg.critical_count += r.ada_violations_critical ?? 0
    agg.serious_count += r.ada_violations_serious ?? 0
    if (r.audited_at > agg.last_audited_at) agg.last_audited_at = r.audited_at
    agg.pages.push({
      page_url: r.page_url,
      ada_score: r.ada_score,
      ada_violations: r.ada_violations ?? [],
      wave_violations: r.wave_violations ?? [],
      ada_violations_critical: r.ada_violations_critical ?? 0,
      ada_violations_serious: r.ada_violations_serious ?? 0,
      ada_violations_moderate: r.ada_violations_moderate ?? 0,
      ada_violations_minor: r.ada_violations_minor ?? 0,
    })
  }

  for (const agg of Array.from(aggBySchool.values())) {
    const scored = agg.pages.filter(p => p.ada_score != null) as { page_url: string; ada_score: number }[]
    agg.avg_ada_score = scored.length ? Math.round(scored.reduce((s, p) => s + p.ada_score, 0) / scored.length) : null
  }

  return NextResponse.json({ ok: true, scores: Array.from(aggBySchool.values()) })
}
