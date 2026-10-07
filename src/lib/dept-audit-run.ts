// lib/dept-audit-run.ts
//
// Server-only: runs one department page through audit v3 (lib/dept-standards)
// in headless Chromium. Shared by /api/bcps/run-audit (saves the result) and
// /api/bcps/audit-preview (preview deployments only, returns it unsaved).
// Any route importing this must be listed in next.config.js
// outputFileTracingIncludes, or Chromium never reaches its Lambda.

import type { SupabaseClient } from '@supabase/supabase-js'
import { runAxeScan, type AxeViolation } from './axe-scan'
import {
  AUDIT_VERSION,
  accessibilityRows, capturePage, findBrokenLinks, linksToCheck, runStandards, scoreOf,
  type CheckResult, type PageCapture,
} from './dept-standards'

export interface DeptAuditOutcome {
  ok: true
  url: string
  pageTitle: string
  results: CheckResult[]
  score: ReturnType<typeof scoreOf>
  accessibility: ReturnType<typeof scoreOf>
  finalsite: { id: string; impact: string | null; description: string; nodeCount: number }[]
  violations: AxeViolation[]
  desktopShot: Buffer | null
  mobileShot: Buffer | null
  desktopSize: { w: number; h: number }
  mobileSize: { w: number; h: number }
}

export async function auditDepartmentPage(url: string, deptName: string): Promise<DeptAuditOutcome | { ok: false; error: string }> {
  const scan = await runAxeScan<PageCapture>(url, {
    onPage: (page, violations) => capturePage(page, violations.flatMap((v) => v.nodes.map((n) => n.target))),
  })
  if (!scan.ok) return { ok: false, error: scan.error ?? 'scan failed' }
  if (!scan.extra) return { ok: false, error: scan.extraError ?? 'page capture failed' }
  const cap = scan.extra

  const toCheck = linksToCheck(cap.facts)
  const brokenLinks = await findBrokenLinks(toCheck)
  const standards = runStandards({ facts: cap.facts, deptName, brokenLinks, linksChecked: toCheck.length, now: new Date() })
  const a11y = accessibilityRows(scan.violations, cap.inContent, { headingSkips: cap.facts.headingSkips })
  const results = [...standards, ...a11y.rows]
  cap.place(results)

  return {
    ok: true,
    url: cap.facts.url || url,
    pageTitle: cap.facts.title,
    results,
    score: scoreOf(results),
    accessibility: scoreOf(a11y.rows),
    finalsite: a11y.finalsite.map((v) => ({ id: v.id, impact: v.impact, description: v.description, nodeCount: v.nodeCount })),
    violations: scan.violations,
    desktopShot: cap.desktopShot,
    mobileShot: cap.mobileShot,
    desktopSize: cap.desktopSize,
    mobileSize: cap.mobileSize,
  }
}

const SHOT_BUCKET = 'bcps-audit-shots'

/**
 * Audit one department page and save it: screenshots, the result row, the
 * red findings and an audit round, and the department's score. Shared by the
 * Run Audit button (/api/bcps/run-audit) and the monthly run
 * (/api/bcps/audit-worker), so both produce exactly the same record.
 * runBy is the person's email, or null for the scheduled run.
 */
export async function runAndSaveDeptAudit(
  db: SupabaseClient,
  dept: { id: string; name: string; website_url: string },
  opts: { runBy: string | null; roundNumber: number },
) {
  const out = await auditDepartmentPage(dept.website_url, dept.name)
  if (!out.ok) return { ok: false as const, error: out.error }

  const status = out.score.score >= 80 ? 'pass' : out.score.score >= 60 ? 'needs_work' : 'critical'
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of out.violations) counts[(v.impact ?? 'moderate') as keyof typeof counts]++

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const upload = async (buf: Buffer | null, kind: string, size: { w: number; h: number }) => {
    if (!buf) return null
    const path = `${dept.id}/${stamp}-${kind}.jpg`
    const { error } = await db.storage.from(SHOT_BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
    if (error) { console.error('[dept-audit] screenshot upload failed', error); return null }
    return { path, url: db.storage.from(SHOT_BUCKET).getPublicUrl(path).data.publicUrl, w: size.w, h: size.h }
  }
  const screenshots = {
    desktop: await upload(out.desktopShot, 'desktop', out.desktopSize),
    mobile: await upload(out.mobileShot, 'mobile', out.mobileSize),
  }

  const { data: result, error: insertErr } = await db
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
      run_by:                  opts.runBy,
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
    round_number:    opts.roundNumber,
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
    const { error } = await db.from('bcps_audit_findings').insert(findingRows)
    if (error) console.error('[dept-audit] findings insert error:', error)
  }
  const { error: roundErr } = await db.from('bcps_audit_rounds').insert({
    department_id:   dept.id,
    audit_result_id: result.id,
    round_number:    opts.roundNumber,
    wcm_notified_at: new Date().toISOString(),
    findings_total:  findingRows.length,
    findings_fixed:  0,
    audit_passed:    null, // admin decides after WCM submits
  })
  if (roundErr) console.error('[dept-audit] round insert error:', roundErr)

  await db.from('bcps_departments').update({
    ada_score:  out.accessibility.score,
    audit_date: new Date().toISOString().split('T')[0],
  }).eq('id', dept.id)

  return { ok: true as const, result, findingsCount: findingRows.length, out }
}
