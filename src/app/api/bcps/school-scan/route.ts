// app/api/bcps/school-scan/route.ts
//
// The school-facing counterpart to /api/bcps/ada-scan. Same underlying
// "gold standard" scan engine (Lighthouse + axe-core + WAVE, lib/axe-scan.ts
// + lib/wave-scan.ts), but a completely separate access gate: no
// acl_member_roles / acl_grants involved at all. A school WCM is
// authorized purely by their signed-in email matching a bcps_schools row's
// wcm_email - the same shape /wcm-portal already uses against
// bcps_departments.wcm_email. This keeps the school tier fully decoupled
// from the district ACL system per V's 2026-08-19 direction (schools get a
// real login, but only ever see this one page's worth of functionality).
//
// The scan target is always the school's own registered site_url - unlike
// the DWT tool, a school WCM cannot type in an arbitrary URL to scan.
//
// school_location_nbr stamped onto every inserted row as of 2026-09-04
// (School Profiles step 2) so this school's ADA history joins into the
// School Profile page the same way bcps_banner_submissions already does,
// by loc_no against bcps_school_directory - see bcps_schools.school_location_nbr
// for where it comes from.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAxeScan } from '@/lib/axe-scan'
import { runWaveScan } from '@/lib/wave-scan'

export const dynamic = 'force-dynamic'
export const maxDuration = 240

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

type SchoolRow = { id: string; name: string; site_url: string | null; wcm_email: string | null; school_location_nbr: string | null }

async function authedSchool(req: NextRequest): Promise<{ userId: string; school: SchoolRow } | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user?.email) return null

  const { data: school } = await svc
    .from('bcps_schools')
    .select('id, name, site_url, wcm_email, school_location_nbr')
    .ilike('wcm_email', user.email)
    .maybeSingle()
  if (!school) return null

  return { userId: user.id, school: school as SchoolRow }
}

// GET /api/bcps/school-scan - this school's own scan history (most recent 20).
export async function GET(req: NextRequest) {
  const ctx = await authedSchool(req)
  if (!ctx) return NextResponse.json({ error: 'No school account found for this email.' }, { status: 403 })

  const { data, error } = await svc
    .from('bcps_audit_results')
    .select('id, page_url, ada_score, wave_score, lighthouse_a11y_score, status, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at')
    .eq('auditor', 'school-wcm-ada-scanner')
    .eq('school_id', ctx.school.id)
    .order('audited_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, school: ctx.school, scans: data ?? [] })
}

// POST /api/bcps/school-scan - runs the same axe-core + WAVE + Lighthouse
// pass as the DWT tool, always against this school's own registered
// site_url (no free-form URL input - keeps this tier simple and scoped).
export async function POST(req: NextRequest) {
  const ctx = await authedSchool(req)
  if (!ctx) return NextResponse.json({ error: 'No school account found for this email.' }, { status: 403 })

  if (!ctx.school.site_url) {
    return NextResponse.json({ error: 'No website URL is on file for your school yet. Contact the District Web Team.' }, { status: 400 })
  }

  const target = ctx.school.site_url

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY
  let lighthouseA11yPct: number | null = null
  if (apiKey) {
    try {
      const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(target)}&category=accessibility&strategy=mobile&key=${apiKey}`
      const r = await fetch(psiUrl, { cache: 'no-store', signal: AbortSignal.timeout(110_000) })
      const j = await r.json()
      const score = j?.lighthouseResult?.categories?.accessibility?.score
      lighthouseA11yPct = score == null ? null : Math.round(score * 100)
    } catch {
      lighthouseA11yPct = null
    }
  }

  const [axe, wave] = await Promise.all([
    runAxeScan(target),
    runWaveScan(target),
  ])

  if (!axe.ok && !wave.ok) {
    return NextResponse.json({
      error: `Scan failed. axe-core: ${axe.error || 'unknown error'}. WAVE: ${wave.error || 'unknown error'}.`,
    }, { status: 502 })
  }

  const ada_score = axe.ok ? axe.adaScore : null
  const counts = axe.ok ? axe.counts : { critical: 0, serious: 0, moderate: 0, minor: 0 }
  const violations = axe.ok
    ? axe.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help: v.help,
        helpUrl: v.helpUrl,
        affected_elements: v.nodes,
      }))
    : []

  const scoreForStatus = ada_score ?? lighthouseA11yPct
  const status = scoreForStatus == null ? 'unknown' : scoreForStatus >= 90 ? 'pass' : scoreForStatus >= 60 ? 'needs_work' : 'critical'

  const { data: result, error: insertErr } = await svc
    .from('bcps_audit_results')
    .insert({
      department_id: null,
      school_id: ctx.school.id,
      school_location_nbr: ctx.school.school_location_nbr,
      page_url: target,
      auditor: 'school-wcm-ada-scanner',
      scanned_by_user_id: ctx.userId,
      status,
      ada_score,
      ada_violations: violations,
      ada_violations_critical: counts.critical,
      ada_violations_serious: counts.serious,
      ada_violations_moderate: counts.moderate,
      ada_violations_minor: counts.minor,
      wave_score: wave.ok ? wave.waveScore : null,
      wave_violations: wave.ok ? wave.violations : null,
      lighthouse_a11y_score: lighthouseA11yPct,
      issues: {
        axe_error: axe.ok ? null : axe.error,
        wave_error: wave.ok ? null : wave.error,
      },
      audited_at: new Date().toISOString(),
    })
    .select('id, page_url, ada_score, wave_score, lighthouse_a11y_score, ada_violations, wave_violations, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at, status')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, result, engine_notes: { axe_ok: axe.ok, wave_ok: wave.ok } })
}
