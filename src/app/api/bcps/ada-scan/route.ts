import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runAxeScan } from '@/lib/axe-scan'
import { runWaveScan } from '@/lib/wave-scan'

export const dynamic = 'force-dynamic'
// Raised 2026-08-19: this route now runs a real headless-Chromium axe-core
// pass plus a WAVE API call after the PageSpeed call, so worst case is
// PSI's own ~110s timeout PLUS the axe scan's page-load/scan time, not PSI
// alone (same reasoning as lesaruss-hq's /api/brand-audit/run, which this
// scan engine was ported from). vercel.json sets "fluid": true so this
// ceiling is actually available on this plan.
export const maxDuration = 240

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'ada-scanner'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function authedUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user ?? null
}

async function roleFor(userId: string): Promise<string> {
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', userId).eq('brand', BRAND).maybeSingle()
  return roleRow?.role || 'user'
}

// Server-side gate, deliberately not just UI hiding (see run-audit's
// requireBcpsAdmin comment re: Celia Jimenez 2026-07-28 - a page hidden in
// the sidebar is not access control). admin/superadmin always pass;
// everyone else needs a grant on the ada-scanner acl_objects row, either
// direct or through one of their acl_group_members groups (wcm, dwt).
async function requirePageAccess(userId: string, role: string): Promise<boolean> {
  if (role === 'admin' || role === 'superadmin') return true

  const { data: obj } = await svc.from('acl_objects')
    .select('id').eq('brand', BRAND).eq('kind', 'page').eq('slug', PAGE_SLUG).maybeSingle()
  if (!obj) return false

  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', userId)
  const gids = (gm ?? []).map(g => g.group_id)
  const { data: grants } = await svc.from('acl_grants')
    .select('subject_type, subject_id').eq('object_id', obj.id)
  return (grants ?? []).some(g =>
    (g.subject_type === 'user' && g.subject_id === userId) ||
    (g.subject_type === 'group' && gids.includes(g.subject_id))
  )
}

// GET /api/bcps/ada-scan[?user_id=<id>] - per-user scan history (most
// recent 20). Defaults to the caller's own scans. Per V's 2026-08-19
// direction, this is never a global cross-user feed - passing another
// user's id is only honored for admin/superadmin (used by the member
// dossier view), everyone else always gets their own history back
// regardless of what user_id they pass.
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await roleFor(user.id)
  if (!(await requirePageAccess(user.id, role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const requestedUserId = req.nextUrl.searchParams.get('user_id')
  const isPrivileged = role === 'admin' || role === 'superadmin'
  const targetUserId = requestedUserId && isPrivileged ? requestedUserId : user.id

  const { data, error } = await svc
    .from('bcps_audit_results')
    .select('id, page_url, ada_score, wave_score, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at, status')
    .eq('auditor', 'wcm-ada-scanner')
    .eq('scanned_by_user_id', targetUserId)
    .order('audited_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, scans: data ?? [], user_id: targetUserId })
}

// POST /api/bcps/ada-scan - { url } - runs the same "gold standard" ADA
// pass proven elsewhere: Lighthouse (PageSpeed Insights, accessibility
// category) + a real axe-core scan in a real headless browser + a real
// WAVE (WebAIM) scan - and logs the combined result into
// bcps_audit_results, tagged auditor='wcm-ada-scanner', attributed to the
// signed-in user via scanned_by_user_id. Switched from PageSpeed-only on
// 2026-08-19 per V: "if it's not really turning [in] real results, let's
// use the proven method... that we've already verified works." Deliberately
// does NOT write to bcps_audit_rounds or update bcps_departments (that
// would trigger the formal WCM-notified/admin-review workflow) - this is a
// look-it-up tool, not a new audit round.
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = await roleFor(user.id)
  if (!(await requirePageAccess(user.id, role))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const rawUrl = (body.url || '').trim()
  if (!rawUrl) return NextResponse.json({ error: 'url required' }, { status: 400 })

  let target: string
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('bad protocol')
    target = u.toString()
  } catch {
    return NextResponse.json({ error: 'Enter a valid page URL, e.g. https://www.browardschools.com/yourdept' }, { status: 400 })
  }

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

  // The proven gold-standard pass: real axe-core (headless Chromium) and
  // real WAVE, run in parallel. Lighthouse's own a11y % is kept alongside
  // for context but axe-core's score is now the authoritative ada_score,
  // matching the same combination already verified live in lesaruss-hq.
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
      page_url: target,
      auditor: 'wcm-ada-scanner',
      scanned_by_user_id: user.id,
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
