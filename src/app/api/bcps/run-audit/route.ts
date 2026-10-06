import { NextRequest, NextResponse } from 'next/server'
import { runAxeScan } from '@/lib/axe-scan'
import { auditDepartmentPage } from '@/lib/dept-audit-run'
import { AUDIT_VERSION } from '@/lib/dept-standards'

// This route now launches headless Chromium for a real axe scan, so it needs
// the same budget its siblings already use (ada-scan, school-scan). Without
// it the default function timeout kills the scan mid-run.
export const dynamic = 'force-dynamic'
export const maxDuration = 240
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Who may run an audit: BCPS admins, and the department's own WCM (Sean,
// 2026-10-06: a WCM re-checks a page after fixing it, the way they resubmit
// a banner). Hot Lab 2026-07-28 found the button was only ever hidden in the
// UI, so the gate lives here.
type Caller = { ok: true; email: string; admin: boolean } | { ok: false; status: number }
async function identify(req: NextRequest): Promise<Caller> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const { createClient: createAnonClient } = await import('@supabase/supabase-js')
  const asUser = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
  )
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await supabase.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  return { ok: true, email: (user.email || '').toLowerCase(), admin: role === 'admin' || role === 'superadmin' }
}

// A WCM gets a few re-checks a day per department; admins are not limited.
const WCM_RUNS_PER_DAY = 3
const SHOT_BUCKET = 'bcps-audit-shots'

// Department audit v3 (Sean, 2026-10-06): every check is a standard from the
// WCM Department Certification course (lib/dept-standards.ts), green, red or
// amber, pinned on screenshots of the page so the WCM sees exactly where
// each one is.
export async function POST(req: NextRequest) {
  try {
    const caller = await identify(req)
    if (!caller.ok) return NextResponse.json({ error: 'Sign in to run an audit.' }, { status: caller.status })

    const body = await req.json()
    const { department_id, triggered_by = 'initial' } = body as { department_id: string; triggered_by?: 'initial' | 'admin_reaudit' }
    if (!department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })

    const { data: dept, error: deptErr } = await supabase
      .from('bcps_departments')
      .select('id, name, website_url, current_round, wcm_email')
      .eq('id', department_id)
      .single()
    if (deptErr || !dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    const isDeptWcm = !!dept.wcm_email && dept.wcm_email.trim().toLowerCase() === caller.email
    if (!caller.admin && !isDeptWcm) return NextResponse.json({ error: 'Only this department’s WCM or the District Web Team can run this audit.' }, { status: 403 })
    if (!caller.admin) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { count } = await supabase.from('bcps_audit_results').select('id', { count: 'exact', head: true })
        .eq('department_id', dept.id).eq('run_by', caller.email).gte('audited_at', since)
      if ((count ?? 0) >= WCM_RUNS_PER_DAY) return NextResponse.json({ error: `You have run ${WCM_RUNS_PER_DAY} checks in the last 24 hours. Try again tomorrow, or ask the District Web Team.` }, { status: 429 })
    }

    if (!dept.website_url) return NextResponse.json({ error: 'This department has no website address on file to audit.' }, { status: 422 })
    const round_number = triggered_by === 'admin_reaudit' ? (dept.current_round ?? 1) : 1

    // No page or a failed scan is an honest error, never a generated score.
    const out = await auditDepartmentPage(dept.website_url, dept.name)
    if (!out.ok) return NextResponse.json({ error: 'The page could not be scanned. Try again in a minute.', detail: out.error }, { status: 502 })

    const status = out.score.score >= 80 ? 'pass' : out.score.score >= 60 ? 'needs_work' : 'critical'
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    for (const v of out.violations) counts[(v.impact ?? 'moderate') as keyof typeof counts]++

    // Screenshots first, so the result row can point at them.
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const upload = async (buf: Buffer | null, kind: string, size: { w: number; h: number }) => {
      if (!buf) return null
      const path = `${dept.id}/${stamp}-${kind}.jpg`
      const { error } = await supabase.storage.from(SHOT_BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
      if (error) { console.error('[run-audit] screenshot upload failed', error); return null }
      return { path, url: supabase.storage.from(SHOT_BUCKET).getPublicUrl(path).data.publicUrl, w: size.w, h: size.h }
    }
    const screenshots = {
      desktop: await upload(out.desktopShot, 'desktop', out.desktopSize),
      mobile: await upload(out.mobileShot, 'mobile', out.mobileSize),
    }

    const { data: result, error: insertErr } = await supabase
      .from('bcps_audit_results')
      .insert({
        department_id:           dept.id,
        page_url:                dept.website_url,
        auditor:                 'bcps-audit-v3',
        audit_version:           AUDIT_VERSION,
        status,
        layout_score:            null,
        content_score:           null,
        nav_score:               null,
        marketing_score:         null,
        ada_score:               out.accessibility.score,
        overall_score:           out.score.score,
        checks:                  out.results,
        checks_passed:           out.score.passed,
        checks_failed:           out.score.failed,
        checks_review:           out.score.review,
        screenshots,
        run_by:                  caller.email,
        issues:                  [],
        ada_violations:          out.violations.map((v) => ({ id: v.id, impact: v.impact ?? 'moderate', nodes: v.nodeCount, description: v.description, helpUrl: v.helpUrl, owner: out.finalsite.some((f) => f.id === v.id) ? 'finalsite' : 'wcm' })),
        ada_violations_critical: counts.critical,
        ada_violations_serious:  counts.serious,
        ada_violations_moderate: counts.moderate,
        ada_violations_minor:    counts.minor,
        audited_at:              new Date().toISOString(),
      })
      .select('*')
      .single()
    if (insertErr) throw insertErr

    // Findings are the red rows: what the WCM has to fix.
    const findingRows = out.results.filter((r) => r.status === 'fail').map((r) => ({
      audit_result_id: result.id,
      department_id:   dept.id,
      round_number,
      category:        (r.area === 'Accessibility' ? 'ada' : 'standards') as 'ada' | 'standards',
      severity:        (r.area === 'Accessibility' || r.area === 'Homepage' ? 'serious' : 'moderate') as 'serious' | 'moderate',
      finding_text:    `${r.title}: ${r.detail}`,
      recommendation:  r.steps.join(' '),
      wcm_fixed:       false,
      wcm_fixed_at:    null,
      admin_verified:  false,
      carry_forward:   false,
    }))
    if (findingRows.length) {
      const { error: findingsErr } = await supabase.from('bcps_audit_findings').insert(findingRows)
      if (findingsErr) console.error('Findings insert error:', findingsErr)
    }

    const { error: roundErr } = await supabase.from('bcps_audit_rounds').insert({
      department_id:   dept.id,
      audit_result_id: result.id,
      round_number,
      wcm_notified_at: new Date().toISOString(),
      findings_total:  findingRows.length,
      findings_fixed:  0,
      audit_passed:    null, // admin decides after WCM submits
    })
    if (roundErr) console.error('Round insert error:', roundErr)

    // A WCM's own re-check updates the score but not the review workflow.
    await supabase.from('bcps_departments').update({
      ada_score:  out.accessibility.score,
      audit_date: new Date().toISOString().split('T')[0],
      ...(caller.admin ? {
        audit_status:    triggered_by === 'admin_reaudit' ? 'admin_review' : 'wcm_notified',
        current_round:   round_number,
        wcm_notified_at: new Date().toISOString(),
      } : {}),
    }).eq('id', dept.id)

    return NextResponse.json({ result, round_number, findings_count: findingRows.length, score: out.score, finalsite_owned: out.finalsite.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
