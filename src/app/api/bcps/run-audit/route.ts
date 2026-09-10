import { NextRequest, NextResponse } from 'next/server'
import { runAxeScan } from '@/lib/axe-scan'

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

// Admin-only endpoint (per Sean, Hot Lab 2026-07-28: a WCM, Celia Jimenez,
// had access to Run Audit on her own department profile - never
// server-enforced, only ever hidden/disabled in some UI. Real gate belongs
// here, not just in the client.)
async function requireBcpsAdmin(req: NextRequest): Promise<{ ok: true; email: string } | { ok: false; status: number }> {
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
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403 }
  return { ok: true, email: user.email || '' }
}


type IssueItem = { category: string; passed: boolean; severity?: string; label: string; detail?: string; fix_instructions?: string[] }
type AdaItem = { impact?: string; id: string; nodes?: number; description: string; fix_instructions?: string; helpUrl?: string }

// STILL SYNTHETIC, flagged to Sean 2026-09-10, not changed here. The ADA
// half of this route is now a real scan, but layout/content/nav below are
// still generated: pass/fail per item is r() > 0.4 and the scores are
// derived from those coin flips. They feed overall_score, audit_status and
// the Page Audit findings list on the department pages. Making them real
// means deciding what a layout/content/nav audit actually measures, which
// is a product call, not a refactor.
function runPhase1Audit(deptName: string): { issues: IssueItem[]; layout_score: number; content_score: number; nav_score: number } {
  const r = () => Math.random()

  const issues: IssueItem[] = [
    // Layout
    { category: 'layout', label: 'Header image present and within spec', passed: true, detail: 'Header image detected at standard 1920x400 dimensions.' },
    { category: 'layout', label: 'Page renders correctly on mobile (320px-768px)', passed: r() > 0.4, severity: 'moderate', detail: 'Mobile layout tested at 320px, 375px, 768px breakpoints.', fix_instructions: ['Navigate to Finalsite PageBuilder', 'Add responsive image breakpoint settings to header module', 'Test with browser DevTools at 375px width'] },
    { category: 'layout', label: 'Footer present with required district links', passed: true, detail: 'District-standard footer detected with all required links.' },
    { category: 'layout', label: 'No broken layout containers or overflow', passed: r() > 0.35, severity: 'minor', detail: 'Content overflow detected in sidebar on narrow viewports.', fix_instructions: ['In PageBuilder, select the content column', 'Set max-width constraint or overflow: hidden on sidebar container'] },
    { category: 'layout', label: 'Department page uses current Finalsite template (v3)', passed: r() > 0.3, severity: 'moderate', detail: 'Page may be using an outdated template version.', fix_instructions: ['Submit WCM ticket requesting template upgrade to v3', 'Reference: Communications > Web Standards > Template Version Guide'] },
    // Content
    { category: 'content', label: 'Department name matches district directory', passed: true, detail: `Page title matches district directory: "${deptName}"` },
    { category: 'content', label: 'Department description/intro text present', passed: true, detail: 'Intro text block detected with adequate description.' },
    { category: 'content', label: 'Contact information (phone + email) visible', passed: r() > 0.25, severity: 'serious', detail: 'Email address not found on page.', fix_instructions: ['Add a Contact module in PageBuilder', 'Include department email and main phone number', 'Ensure contact info is in the body, not just the footer'] },
    { category: 'content', label: 'Staff directory or primary contact listed', passed: r() > 0.4, severity: 'moderate', detail: 'No staff directory widget found on this page.', fix_instructions: ['Add Staff Directory module from PageBuilder module library', 'Tag relevant staff members with this department slug in CMS admin'] },
    { category: 'content', label: 'Content reviewed within last 12 months', passed: r() > 0.45, severity: 'minor', detail: 'Last content update timestamp appears to be over 12 months ago.', fix_instructions: ['Review and refresh at least one content block for accuracy', 'Update the page review date in Finalsite Page Properties > Metadata'] },
    // Nav
    { category: 'nav', label: 'Breadcrumb navigation present', passed: true, detail: `Breadcrumb path confirmed: Home > Departments > ${deptName}` },
    { category: 'nav', label: 'Back to departments link functional', passed: true, detail: 'Return to departments link verified and resolves correctly.' },
    { category: 'nav', label: 'No broken internal links (threshold: 2)', passed: r() > 0.35, severity: 'moderate', detail: '2 broken internal links detected on this page.', fix_instructions: ['Run the Finalsite built-in link checker under Page Properties > Links', 'Update or remove broken links from the PageBuilder content blocks'] },
    { category: 'nav', label: 'Quick links / sub-navigation present', passed: r() > 0.45, severity: 'minor', detail: 'No quick links or sub-navigation module found.', fix_instructions: ['Add a Quick Links module from PageBuilder module library', 'Include links to key resources, forms, and documents for this department'] },
  ]

  const score = (items: IssueItem[]) => {
    const passed = items.filter(i => i.passed).length
    return Math.min(100, Math.round((passed / items.length) * 100) + Math.floor(r() * 4))
  }

  return {
    issues,
    layout_score: score(issues.filter(i => i.category === 'layout')),
    content_score: score(issues.filter(i => i.category === 'content')),
    nav_score: score(issues.filter(i => i.category === 'nav')),
  }
}

// REAL axe-core scan of the department's own page. Replaces runAdaAudit(),
// which returned eight hardcoded findings with Math.random() element counts
// (nodes: Math.floor(r() * 4) + 1) and derived an ada_score from those random
// counts - a score this route then wrote to bcps_departments.ada_score, which
// is what the department pages and the dashboard ADA Audit row display. 66
// audit rows had been produced that way. Found 2026-09-10 while tracing the
// ADA Scanner pipeline; removed with Sean's go-ahead the same day.
//
// Same scanner the ADA Scanner and school-scan routes already run in
// production (src/lib/axe-scan.ts), mapped into the AdaItem shape the
// findings rows and department/page.tsx already expect. axe carries no
// prose fix steps, so recommendation is null rather than invented; the
// glossary surfaces (lib/ada-glossary) are where fix guidance lives.
//
// No fabricated fallback: a department with no website_url, or a scan that
// fails, yields ada_score null and no ADA findings. A missing number is
// honest; a generated one is not.
async function runRealAdaAudit(url: string | null): Promise<{
  violations: AdaItem[]; ada_score: number | null
  critical: number; serious: number; moderate: number; minor: number
}> {
  const empty = { violations: [] as AdaItem[], ada_score: null, critical: 0, serious: 0, moderate: 0, minor: 0 }
  if (!url) return empty

  const axe = await runAxeScan(url)
  if (!axe.ok) {
    console.error('[run-audit] axe scan failed for', url, axe.error)
    return empty
  }

  const violations: AdaItem[] = axe.violations.map(v => ({
    id: v.id,
    impact: v.impact ?? 'moderate',
    nodes: v.nodeCount,
    description: v.description,
    helpUrl: v.helpUrl,
  }))

  return {
    violations,
    ada_score: axe.adaScore,
    critical: axe.counts.critical,
    serious: axe.counts.serious,
    moderate: axe.counts.moderate,
    minor: axe.counts.minor,
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireBcpsAdmin(req)
    if (!auth.ok) return NextResponse.json({ error: 'Forbidden - admin access required' }, { status: auth.status })

    const body = await req.json()
    const { department_id, triggered_by = 'initial' } = body as { department_id: string; triggered_by?: 'initial' | 'admin_reaudit' }

    if (!department_id) return NextResponse.json({ error: 'department_id required' }, { status: 400 })

    const { data: dept, error: deptErr } = await supabase
      .from('bcps_departments')
      .select('id, name, website_url, current_round')
      .eq('id', department_id)
      .single()

    if (deptErr || !dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    const round_number = triggered_by === 'admin_reaudit' ? (dept.current_round ?? 1) : 1

    // Run the audit
    const phase1  = runPhase1Audit(dept.name)
    const ada     = await runRealAdaAudit(dept.website_url)
    // ada.ada_score is null when there is no page to scan or the scan
    // failed, so it is averaged in only when real.
    const scored = [phase1.layout_score, phase1.content_score, phase1.nav_score]
    if (ada.ada_score != null) scored.push(ada.ada_score)
    const overall = Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
    const auditStatus = overall >= 80 ? 'pass' : overall >= 60 ? 'needs_work' : 'critical'

    // Insert audit result
    const { data: result, error: insertErr } = await supabase
      .from('bcps_audit_results')
      .insert({
        department_id:          dept.id,
        page_url:               dept.website_url,
        auditor:                'k12-unlocked-auto',
        status:                 auditStatus,
        layout_score:           phase1.layout_score,
        content_score:          phase1.content_score,
        nav_score:              phase1.nav_score,
        ada_score:              ada.ada_score,
        overall_score:          overall,
        issues:                 phase1.issues,
        ada_violations:         ada.violations,
        ada_violations_critical: ada.critical,
        ada_violations_serious:  ada.serious,
        ada_violations_moderate: ada.moderate,
        ada_violations_minor:    ada.minor,
        audited_at:             new Date().toISOString(),
      })
      .select('*')
      .single()

    if (insertErr) throw insertErr

    // Expand issues into individual bcps_audit_findings rows
    const findingRows = [
      ...phase1.issues.map((issue: IssueItem) => ({
        audit_result_id:  result.id,
        department_id:    dept.id,
        round_number,
        category:         issue.category as 'layout' | 'content' | 'nav',
        severity:         (issue.severity ?? 'minor') as 'critical' | 'serious' | 'moderate' | 'minor',
        finding_text:     issue.label,
        recommendation:   issue.fix_instructions ? issue.fix_instructions.join(' ') : null,
        wcm_fixed:        issue.passed, // pre-mark passing items as already fixed
        wcm_fixed_at:     issue.passed ? new Date().toISOString() : null,
        admin_verified:   false,
        carry_forward:    false,
      })),
      ...ada.violations.map((v: AdaItem) => ({
        audit_result_id:  result.id,
        department_id:    dept.id,
        round_number,
        category:         'ada' as const,
        severity:         (v.impact ?? 'moderate') as 'critical' | 'serious' | 'moderate' | 'minor',
        finding_text:     v.description,
        recommendation:   v.fix_instructions ?? null,
        wcm_fixed:        false,
        wcm_fixed_at:     null,
        admin_verified:   false,
        carry_forward:    false,
      })),
    ]

    const { error: findingsErr } = await supabase
      .from('bcps_audit_findings')
      .insert(findingRows)

    if (findingsErr) console.error('Findings insert error:', findingsErr)

    // Create audit round record
    const { error: roundErr } = await supabase
      .from('bcps_audit_rounds')
      .insert({
        department_id:    dept.id,
        audit_result_id:  result.id,
        round_number,
        wcm_notified_at:  new Date().toISOString(),
        findings_total:   findingRows.length,
        findings_fixed:   findingRows.filter(f => f.wcm_fixed).length,
        audit_passed:     null, // admin decides after WCM submits
      })

    if (roundErr) console.error('Round insert error:', roundErr)

    // Update department status and round tracking
    const newAuditStatus = triggered_by === 'admin_reaudit' ? 'admin_review' : 'wcm_notified'
    await supabase
      .from('bcps_departments')
      .update({
        audit_status:      newAuditStatus,
        ada_score:         ada.ada_score,
        current_round:     round_number,
        wcm_notified_at:   new Date().toISOString(),
        audit_date:        new Date().toISOString().split('T')[0],
      })
      .eq('id', dept.id)

    return NextResponse.json({ result, round_number, findings_count: findingRows.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

