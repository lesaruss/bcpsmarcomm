// lib/dept-audit-run.ts
//
// Server-only: runs one page through the audit (lib/dept-standards) in
// headless Chromium and saves it. Shared by /api/bcps/run-audit (the Run
// Audit button), /api/bcps/audit-worker (queued and monthly runs) and
// /api/bcps/audit-preview (preview deployments only, unsaved).
// Any route importing this must be listed in next.config.js
// outputFileTracingIncludes, or Chromium never reaches its Lambda.
//
// Modes (Sean, 2026-10-07):
//   dept-main   a department's main page: every check, homepage ones included
//   dept-sub    any other page of the department's site: every check except
//               the homepage-only ones (description, Quick Access, directory,
//               contact block)
//   school-ada  a school page: the accessibility checks only, until the
//               schools' own standards are set

import type { SupabaseClient } from '@supabase/supabase-js'
import { runAxeScan, type AxeViolation } from './axe-scan'
import {
  AUDIT_VERSION,
  accessibilityRows, capturePage, findBrokenLinks, linksToCheck, runStandards, scoreOf,
  type CheckResult, type PageCapture,
} from './dept-standards'

export type AuditMode = 'dept-main' | 'dept-sub' | 'school-ada'

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

export async function auditPage(url: string, opts: { ownerName: string; mode: AuditMode }): Promise<DeptAuditOutcome | { ok: false; error: string }> {
  const school = opts.mode === 'school-ada'
  const scan = await runAxeScan<PageCapture>(url, {
    onPage: (page, violations) => capturePage(page, violations.flatMap((v) => v.nodes.map((n) => n.target)), { scope: school ? 'school' : 'dept' }),
  })
  if (!scan.ok) return { ok: false, error: scan.error ?? 'scan failed' }
  if (!scan.extra) return { ok: false, error: scan.extraError ?? 'page capture failed' }
  const cap = scan.extra

  let standards: CheckResult[] = []
  if (!school) {
    const toCheck = linksToCheck(cap.facts)
    const brokenLinks = await findBrokenLinks(toCheck)
    standards = runStandards({ facts: cap.facts, deptName: opts.ownerName, brokenLinks, linksChecked: toCheck.length, now: new Date() }, { homepage: opts.mode === 'dept-main' })
  }
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

/** The department main-page audit (kept for the preview dry run). */
export function auditDepartmentPage(url: string, deptName: string) {
  return auditPage(url, { ownerName: deptName, mode: 'dept-main' })
}

const SHOT_BUCKET = 'bcps-audit-shots'

export interface AuditTarget {
  departmentId?: string | null
  schoolId?: string | null
  name: string
  url: string
  mode: AuditMode
  sitePageId?: string | null
  runId?: string | null
  pageTitle?: string | null
}

/**
 * Audit one page and save it: screenshots, the result row and, for
 * departments, the red findings. A department's main page also records an
 * audit round and updates the department's score. runBy is the person's
 * email, or null for a scheduled run.
 */
export async function runAndSavePageAudit(db: SupabaseClient, t: AuditTarget, opts: { runBy: string | null; roundNumber: number }) {
  const out = await auditPage(t.url, { ownerName: t.name, mode: t.mode })
  if (!out.ok) return { ok: false as const, error: out.error }

  const status = out.score.score >= 80 ? 'pass' : out.score.score >= 60 ? 'needs_work' : 'critical'
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const v of out.violations) counts[(v.impact ?? 'moderate') as keyof typeof counts]++

  const owner = t.departmentId ?? t.schoolId ?? 'unknown'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const upload = async (buf: Buffer | null, kind: string, size: { w: number; h: number }) => {
    if (!buf) return null
    const path = `${owner}/${t.sitePageId ?? 'main'}/${stamp}-${kind}.jpg`
    const { error } = await db.storage.from(SHOT_BUCKET).upload(path, buf, { contentType: 'image/jpeg', upsert: true })
    if (error) { console.error('[audit] screenshot upload failed', error); return null }
    return { path, url: db.storage.from(SHOT_BUCKET).getPublicUrl(path).data.publicUrl, w: size.w, h: size.h }
  }
  const screenshots = {
    desktop: await upload(out.desktopShot, 'desktop', out.desktopSize),
    mobile: await upload(out.mobileShot, 'mobile', out.mobileSize),
  }

  const { data: result, error: insertErr } = await db
    .from('bcps_audit_results')
    .insert({
      department_id:           t.departmentId ?? null,
      school_id:               t.schoolId ?? null,
      site_page_id:            t.sitePageId ?? null,
      run_id:                  t.runId ?? null,
      page_url:                t.url,
      auditor:                 t.mode === 'school-ada' ? 'bcps-audit-v3-ada' : 'bcps-audit-v3',
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

  let findingsCount = 0
  if (t.departmentId) {
    // Findings are the red rows: what the WCM has to fix. A sub-page's
    // findings name the page, so the list stays readable across the site.
    const where = t.mode === 'dept-sub' ? ` (${t.pageTitle || out.pageTitle || t.url})` : ''
    const findingRows = out.results.filter((r) => r.status === 'fail').map((r) => ({
      audit_result_id: result.id,
      department_id:   t.departmentId,
      round_number:    opts.roundNumber,
      category:        (r.area === 'Accessibility' ? 'ada' : 'standards') as 'ada' | 'standards',
      severity:        (r.area === 'Accessibility' || r.area === 'Homepage' ? 'serious' : 'moderate') as 'serious' | 'moderate',
      finding_text:    `${r.title}${where}: ${r.detail}`,
      recommendation:  r.steps.join(' '),
      wcm_fixed:       false,
      wcm_fixed_at:    null,
      admin_verified:  false,
      carry_forward:   false,
    }))
    findingsCount = findingRows.length
    if (findingRows.length) {
      const { error } = await db.from('bcps_audit_findings').insert(findingRows)
      if (error) console.error('[audit] findings insert error:', error)
    }
    if (t.mode === 'dept-main') {
      const { error: roundErr } = await db.from('bcps_audit_rounds').insert({
        department_id:   t.departmentId,
        audit_result_id: result.id,
        round_number:    opts.roundNumber,
        wcm_notified_at: new Date().toISOString(),
        findings_total:  findingRows.length,
        findings_fixed:  0,
        audit_passed:    null, // admin decides after WCM submits
      })
      if (roundErr) console.error('[audit] round insert error:', roundErr)
      await db.from('bcps_departments').update({
        ada_score:  out.accessibility.score,
        audit_date: new Date().toISOString().split('T')[0],
      }).eq('id', t.departmentId)
    }
  }

  return { ok: true as const, result, findingsCount, out }
}

/** Main-page audit for the Run Audit button (kept signature). */
export function runAndSaveDeptAudit(db: SupabaseClient, dept: { id: string; name: string; website_url: string }, opts: { runBy: string | null; roundNumber: number; sitePageId?: string | null; runId?: string | null }) {
  return runAndSavePageAudit(db, { departmentId: dept.id, name: dept.name, url: dept.website_url, mode: 'dept-main', sitePageId: opts.sitePageId, runId: opts.runId }, opts)
}

// ── Finding a site's pages ──────────────────────────────────────────────
const MAX_SITE_PAGES = 40
const norm = (u: string) => u.split('#')[0].split('?')[0].replace(/\/+$/, '')

/**
 * A department's site = its main page plus every page in its left menu that
 * sits under the main page's own address (the menu also lists sibling
 * departments, which are not this department's pages). Reads the page's HTML
 * directly; no browser needed.
 */
export async function discoverDeptPages(mainUrl: string): Promise<{ url: string; title: string; isMain: boolean }[]> {
  const main = norm(mainUrl)
  const pages: { url: string; title: string; isMain: boolean }[] = [{ url: main, title: '', isMain: true }]
  let html = ''
  try {
    const ctl = new AbortController()
    const tm = setTimeout(() => ctl.abort(), 20000)
    const res = await fetch(mainUrl, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (BCPS MarComm department audit)' } })
    clearTimeout(tm)
    html = res.ok ? await res.text() : ''
  } catch { html = '' }
  const start = html.indexOf('id="fsBannerLeft"')
  if (start < 0) return pages
  const end = html.indexOf('id="fsPageContent"', start)
  const nav = html.slice(start, end > start ? end : start + 200000)
  const base = new URL(mainUrl)
  const prefix = new URL(main).pathname
  const seen = new Set([main])
  const re = /<a\s[^>]*href="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(nav)) && pages.length < MAX_SITE_PAGES) {
    let u: URL
    try { u = new URL(m[1], base) } catch { continue }
    if (u.host !== base.host) continue
    const path = u.pathname.replace(/\/+$/, '')
    if (path !== prefix && !path.startsWith(prefix + '/')) continue
    const url = norm(u.origin + path)
    if (seen.has(url)) continue
    seen.add(url)
    const title = m[2].replace(/<span[^>]*fsStyleSROnly[\s\S]*?<\/span>/gi, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    pages.push({ url, title, isMain: false })
  }
  return pages
}
