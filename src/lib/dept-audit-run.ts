// lib/dept-audit-run.ts
//
// Server-only: runs one department page through audit v3 (lib/dept-standards)
// in headless Chromium. Shared by /api/bcps/run-audit (saves the result) and
// /api/bcps/audit-preview (preview deployments only, returns it unsaved).
// Any route importing this must be listed in next.config.js
// outputFileTracingIncludes, or Chromium never reaches its Lambda.

import { runAxeScan, type AxeViolation } from './axe-scan'
import {
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
  const a11y = accessibilityRows(scan.violations, cap.inContent)
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
