import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

// Server-side gate, deliberately not just UI hiding (see run-audit's
// requireBcpsAdmin comment re: Celia Jimenez 2026-07-28 - a page hidden in
// the sidebar is not access control). admin/superadmin always pass;
// everyone else needs a grant on the ada-scanner acl_objects row, either
// direct or through one of their acl_group_members groups (wcm, dwt).
async function requirePageAccess(userId: string): Promise<boolean> {
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', userId).eq('brand', BRAND).maybeSingle()
  const role = roleRow?.role || 'user'
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

interface LighthouseAudit {
  id: string
  title: string
  description: string
  score: number | null
  scoreDisplayMode: string
  weight?: number
  details?: { items?: unknown[] }
}

// Buckets a failing Lighthouse audit into a severity by its own reported
// weight (how much Lighthouse itself says the check matters to the overall
// accessibility score) - not fabricated, read straight from the API response.
function severityFromWeight(weight: number): 'critical' | 'serious' | 'moderate' | 'minor' {
  if (weight >= 7) return 'critical'
  if (weight >= 4) return 'serious'
  if (weight >= 2) return 'moderate'
  return 'minor'
}

// GET /api/bcps/ada-scan - recent self-service scan history (most recent 20).
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requirePageAccess(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await svc
    .from('bcps_audit_results')
    .select('id, page_url, ada_score, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at, status')
    .eq('auditor', 'wcm-ada-scanner')
    .order('audited_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, scans: data ?? [] })
}

// POST /api/bcps/ada-scan - { url } - runs a real Google Lighthouse
// accessibility scan via the PageSpeed Insights API (no mocked/random data)
// and logs the result into bcps_audit_results alongside the formal audit
// pipeline's rows, tagged auditor='wcm-ada-scanner' so it's clearly a
// self-service check. Deliberately does NOT write to bcps_audit_rounds or
// update bcps_departments (that would trigger the formal WCM-notified /
// admin-review workflow) - this is a look-it-up tool, not a new audit round.
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requirePageAccess(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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
  if (!apiKey) return NextResponse.json({ error: 'Scanner is not configured (missing PageSpeed API key). Contact the District Web Team.' }, { status: 503 })

  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(target)}&category=accessibility&strategy=mobile&key=${apiKey}`

  let lighthouse: any
  try {
    const r = await fetch(psiUrl, { cache: 'no-store' })
    const j = await r.json()
    if (!r.ok) {
      const msg = j?.error?.message || `PageSpeed API error (${r.status})`
      return NextResponse.json({ error: msg }, { status: 502 })
    }
    lighthouse = j.lighthouseResult
    if (!lighthouse) return NextResponse.json({ error: 'PageSpeed returned no result for that URL.' }, { status: 502 })
  } catch {
    return NextResponse.json({ error: 'Could not reach the PageSpeed API. Try again in a moment.' }, { status: 502 })
  }

  const categoryScore = lighthouse.categories?.accessibility?.score
  const ada_score = categoryScore == null ? null : Math.round(categoryScore * 100)

  const auditRefs: string[] = lighthouse.categories?.accessibility?.auditRefs?.map((a: { id: string }) => a.id) ?? []
  const auditsById: Record<string, LighthouseAudit> = lighthouse.audits ?? {}

  const violations = auditRefs
    .map(id => auditsById[id])
    .filter((a): a is LighthouseAudit => !!a && a.scoreDisplayMode === 'binary' && a.score === 0)
    .map(a => {
      const ref = lighthouse.categories.accessibility.auditRefs.find((r: { id: string }) => r.id === a.id)
      const weight = ref?.weight ?? 0
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        severity: severityFromWeight(weight),
        weight,
        affected_elements: a.details?.items?.length ?? null,
      }
    })
    .sort((a, b) => b.weight - a.weight)

  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  violations.forEach(v => { counts[v.severity]++ })

  const status = ada_score == null ? 'unknown' : ada_score >= 90 ? 'pass' : ada_score >= 60 ? 'needs_work' : 'critical'

  const { data: result, error: insertErr } = await svc
    .from('bcps_audit_results')
    .insert({
      department_id: null,
      page_url: target,
      auditor: 'wcm-ada-scanner',
      status,
      ada_score,
      ada_violations: violations,
      ada_violations_critical: counts.critical,
      ada_violations_serious: counts.serious,
      ada_violations_moderate: counts.moderate,
      ada_violations_minor: counts.minor,
      audited_at: new Date().toISOString(),
    })
    .select('id, page_url, ada_score, ada_violations, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at, status')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, result })
}
