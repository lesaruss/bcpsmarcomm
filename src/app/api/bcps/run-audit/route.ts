import { NextRequest, NextResponse } from 'next/server'
import { runAxeScan } from '@/lib/axe-scan'
import { AUDIT_VERSION, accessibilityScore, findBrokenLinks, linksToCheck, ownerOf, runMarketingChecks } from '@/lib/dept-audit'

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


// Department audit v2 (Sean, 2026-10-06 Hot Lab): the old layout/content/nav
// half was Math.random() and produced findings WCMs could not act on. v2 is
// real end to end and lives in src/lib/dept-audit.ts: 12 marketing checks a
// WCM controls, plus the axe scan scored only on rules the WCM owns. The
// same file drives the Score 100 checklist, so following it scores 100.
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

    // Run the audit. No page or a failed scan is an honest error, never a
    // generated score.
    if (!dept.website_url) return NextResponse.json({ error: 'This department has no website address on file to audit.' }, { status: 422 })
    const scan = await runAxeScan(dept.website_url, { collectFacts: true })
    if (!scan.ok || !scan.facts) return NextResponse.json({ error: 'The page could not be scanned. Try again in a minute.', detail: scan.error ?? null }, { status: 502 })

    const toCheck = linksToCheck(scan.facts)
    const brokenLinks = await findBrokenLinks(toCheck)
    const marketing = runMarketingChecks({ facts: scan.facts, deptName: dept.name, brokenLinks, linksChecked: toCheck.length, now: new Date() })
    const a11y = accessibilityScore(scan.violations)
    const overall = Math.round((marketing.score + a11y.score) / 2)
    const auditStatus = overall >= 80 ? 'pass' : overall >= 60 ? 'needs_work' : 'critical'
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    for (const v of a11y.counted) counts[(v.impact ?? 'moderate') as keyof typeof counts] = (counts[(v.impact ?? 'moderate') as keyof typeof counts] ?? 0) + 1
    const severityFor = (weight: number) => (weight >= 10 ? 'serious' : weight >= 8 ? 'moderate' : 'minor') as 'serious' | 'moderate' | 'minor'

    // Insert audit result
    const { data: result, error: insertErr } = await supabase
      .from('bcps_audit_results')
      .insert({
        department_id:          dept.id,
        page_url:               dept.website_url,
        auditor:                'bcps-audit-v2',
        audit_version:          AUDIT_VERSION,
        status:                 auditStatus,
        layout_score:           null,
        content_score:          null,
        nav_score:              null,
        marketing_score:        marketing.score,
        marketing_checks:       marketing.results,
        ada_score:              a11y.score,
        overall_score:          overall,
        issues:                 marketing.results.map((r) => ({ id: r.id, category: 'marketing', label: r.title, passed: r.passed, detail: r.detail, fix_instructions: r.steps, severity: severityFor(r.weight) })),
        ada_violations:         scan.violations.map((v) => ({ id: v.id, impact: v.impact ?? 'moderate', nodes: v.nodeCount, description: v.description, helpUrl: v.helpUrl, owner: ownerOf(v.id).owner })),
        ada_violations_critical: counts.critical,
        ada_violations_serious:  counts.serious,
        ada_violations_moderate: counts.moderate,
        ada_violations_minor:    counts.minor,
        audited_at:             new Date().toISOString(),
      })
      .select('*')
      .single()

    if (insertErr) throw insertErr

    // Expand issues into individual bcps_audit_findings rows
    // Findings are what the WCM has to do: failed marketing checks and the
    // accessibility rules they own. Finalsite-owned rules stay on the result
    // (ada_violations, owner 'finalsite') for the monthly Finalsite report.
    const findingRows = [
      ...marketing.results.filter((r) => !r.passed).map((r) => ({
        audit_result_id:  result.id,
        department_id:    dept.id,
        round_number,
        category:         'marketing' as const,
        severity:         severityFor(r.weight),
        finding_text:     `${r.title}: ${r.detail}`,
        recommendation:   r.steps.join(' '),
        wcm_fixed:        false,
        wcm_fixed_at:     null,
        admin_verified:   false,
        carry_forward:    false,
      })),
      ...a11y.counted.map((v) => {
        const entry = ownerOf(v.id).entry
        return {
          audit_result_id:  result.id,
          department_id:    dept.id,
          round_number,
          category:         'ada' as const,
          severity:         (v.impact ?? 'moderate') as 'critical' | 'serious' | 'moderate' | 'minor',
          finding_text:     entry ? `${entry.title}${v.nodeCount ? ` (${v.nodeCount} on the page)` : ''}` : v.description,
          recommendation:   entry?.fixSteps?.join(' ') ?? null,
          wcm_fixed:        false,
          wcm_fixed_at:     null,
          admin_verified:   false,
          carry_forward:    false,
        }
      }),
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
        ada_score:         a11y.score,
        current_round:     round_number,
        wcm_notified_at:   new Date().toISOString(),
        audit_date:        new Date().toISOString().split('T')[0],
      })
      .eq('id', dept.id)

    return NextResponse.json({ result, round_number, findings_count: findingRows.length, marketing_score: marketing.score, accessibility_score: a11y.score, finalsite_owned: a11y.finalsite.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

