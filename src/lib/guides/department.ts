import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDepartmentAnalytics, type DepartmentAnalytics } from '@/lib/bcps-department-analytics'
import type { GuideViewer } from './audience'

// The live side of a department guide (Sean, 2026-11-03): the department's page
// as families see it, its audit snapshot and its analytics, for the guide whose
// slug is the department's slug. What is sent depends on who is reading, the
// same way the guide's own sections are: the audit snapshot only to the
// department's Web Content Managers (and admins), analytics to its WCMs and
// director (and admins), the page image to everyone with the guide.

export interface GuideDepartment {
  id: string
  slug: string
  name: string
  website_url: string | null
  // The department's page as the last audit saw it (a screenshot from the
  // audit's public bucket), cropped on the page to its top.
  hero: { image: string; page_url: string; audited_at: string } | null
  // The latest audit of every page the department has, added up.
  audit: { pages: number; avg_score: number | null; to_fix: number; to_review: number; passed: number; audited_at: string } | null
  analytics: DepartmentAnalytics | null
}

const SHOTS = 'https://fwbhwfxpncrsfhttimna.supabase.co/storage/v1/object/public/bcps-audit-shots/'
const norm = (u?: string | null) => (u || '').trim().toLowerCase().replace(/\/+$/, '')

interface AuditRow {
  page_url: string | null
  audited_at: string
  overall_score: number | null
  checks_passed: number | null
  checks_failed: number | null
  checks_review: number | null
  screenshots: { desktop?: { url?: string } } | null
}

export async function loadGuideDepartment(db: SupabaseClient, slug: string, viewer: GuideViewer): Promise<GuideDepartment | null> {
  const { data: dept } = await db.from('bcps_departments').select('id, slug, name, website_url, previous_paths').eq('slug', slug).maybeSingle()
  if (!dept) return null

  const seeAudit = viewer === 'all' || viewer.has('wcm')
  const seeAnalytics = viewer === 'all' || viewer.has('wcm') || viewer.has('director')

  const { data: rows } = await db.from('bcps_audit_results')
    .select('page_url, audited_at, overall_score, checks_passed, checks_failed, checks_review, screenshots')
    .eq('department_id', dept.id).gte('audit_version', 3)
    .order('audited_at', { ascending: false }).limit(600)
  const audits = (rows ?? []) as AuditRow[]

  // The page image: the department's own page if it has been audited, else the
  // most recent audited page. Only images from the audit bucket are used.
  const roots = new Set([norm(dept.website_url), ...((dept.previous_paths as string[] | null) ?? []).map((p) => `https://www.browardschools.com${norm(p)}`)].filter(Boolean))
  const shot = (a: AuditRow) => (a.screenshots?.desktop?.url && a.screenshots.desktop.url.startsWith(SHOTS) ? a.screenshots.desktop.url : null)
  const heroRow = audits.find((a) => shot(a) && roots.has(norm(a.page_url))) ?? audits.find((a) => shot(a))
  const hero = heroRow ? { image: shot(heroRow)!, page_url: heroRow.page_url || (dept.website_url as string) || '', audited_at: heroRow.audited_at } : null

  // The snapshot: the latest audit of each page, so a page fixed since an
  // earlier run counts as fixed.
  let audit: GuideDepartment['audit'] = null
  if (seeAudit && audits.length) {
    const latest = new Map<string, AuditRow>()
    for (const a of audits) if (a.page_url && !latest.has(a.page_url)) latest.set(a.page_url, a)
    const list = Array.from(latest.values())
    const scored = list.filter((a) => a.overall_score !== null)
    audit = {
      pages: list.length,
      avg_score: scored.length ? Math.round(scored.reduce((n, a) => n + (a.overall_score ?? 0), 0) / scored.length) : null,
      to_fix: list.reduce((n, a) => n + (a.checks_failed ?? 0), 0),
      to_review: list.reduce((n, a) => n + (a.checks_review ?? 0), 0),
      passed: list.reduce((n, a) => n + (a.checks_passed ?? 0), 0),
      audited_at: list.reduce((m, a) => (a.audited_at > m ? a.audited_at : m), list[0].audited_at),
    }
  }

  const analytics = seeAnalytics ? (await loadDepartmentAnalytics(db, [dept.id as string])).get(dept.id as string) ?? null : null

  return { id: dept.id as string, slug: dept.slug as string, name: dept.name as string, website_url: (dept.website_url as string | null) ?? null, hero, audit, analytics }
}
