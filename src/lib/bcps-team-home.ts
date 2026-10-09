import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_WINDOWS } from './review-windows'

// Data for the District Web Team and SuperAdmin dashboards (Sean, 2026-10-01,
// mock v3 "Team Dashboards"). Read with the service role from
// /api/bcps/home, which decides who gets which part:
//   everyone on the team: program numbers, ADA, banners, widgets, their own
//     assignments from the Web Team Assignments page
//   SuperAdmin only: decisions waiting on them and each team member's
//     assignments (the Team tab and the web team "View as" previews)

export interface TeamDepartment {
  id: string
  name: string
  division: string | null
  audit_status: string | null
  findings_open: number
  wcms: { email: string | null; certified: boolean }[]
}

export interface Assignment {
  slug: string
  title: string
  role: 'lead' | 'support'
  status: string
  date_label: string | null
  date_iso: string | null
  past_date: boolean
  priority: 'high' | 'medium' | 'low' | null
}

export interface TeamMemberWork {
  user_id: string
  name: string
  email: string
  title: string | null
  department: string | null
  team: 'comms' | 'appsvc'
  assignments: Assignment[]
}

// ── Web Team Assignments ────────────────────────────────────────────────
// The page is a static file (public/bcps-web-team-assignments.html) with
// one section per meeting update; the newest section is the one whose tag
// buttons call the highest toggleTagN(). Lead, support, status and dates
// edited on the page are saved to bcps_assignment_tags and win over the
// file.
interface RawRow { slug: string; title: string; lead: string; support: string; status: string; deadline: string | null }

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, '’').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

export function parseAssignmentsHtml(html: string): RawRow[] {
  const versions = Array.from(html.matchAll(/toggleTag(\d+)\(/g)).map((m) => Number(m[1]))
  if (!versions.length) return []
  const marker = `toggleTag${Math.max(...versions)}(`
  const rows: RawRow[] = []
  const seen = new Set<string>()
  for (const block of html.split(/(?=<div class="assignment-row)/).slice(1)) {
    const head = block.slice(0, 8000)
    if (!head.includes(marker)) continue
    const m = /^<div class="assignment-row[^"]*" data-slug="([^"]+)"[^>]*data-lead="([^"]*)"/.exec(block)
    if (!m || seen.has(m[1])) continue
    const title = decode(/class="assignment-name">([^<]*)/.exec(block)?.[1] ?? m[1])
    // Rows folded into another row stay on the page "for the record".
    if (title.includes('(Merged)') || head.includes('Kept here for the record')) continue
    seen.add(m[1])
    rows.push({
      slug: m[1],
      title,
      lead: decode(m[2]),
      support: decode(/class="assignment-support">([^<]*)</.exec(block)?.[1] ?? ''),
      status: /status-badge-btn ([a-z-]+)"/.exec(block)?.[1] ?? 'pending',
      deadline: (() => {
        const d = /class="assignment-deadline[^"]*"[^>]*>([^<]*)</.exec(block)?.[1]
        const t = d ? decode(d) : ''
        return t && t !== '-' ? t : null
      })(),
    })
  }
  return rows
}

// "Aug 14, 2026" / "Sept 1, 2026" -> 2026-08-14. Anything looser ("Aug 2026
// (date TBD)", "Ongoing") has no exact date.
function isoFromLabel(label: string | null): string | null {
  if (!label || !/^[A-Za-z]+\.? \d{1,2}, \d{4}$/.test(label)) return null
  const t = Date.parse(label.replace(/^Sept\b/, 'Sep'))
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Saved edits are not all plain text: support_override is stored as a list
// (["Vanessa", "Rudy"]). Anything else odd becomes empty rather than
// breaking the dashboard.
function asText(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ')
  return ''
}

function namesIn(s: string): string[] {
  return s.split(/[\/,]/).map((x) => x.trim()).filter(Boolean)
}

// A person matches a lead or support entry by first name ("Felicia") or by
// full name ("Sean A. Russell").
function personMatches(entry: string, first: string, full: string): boolean {
  const e = entry.toLowerCase()
  return e === first.toLowerCase() || e === full.toLowerCase() || e.split(/\s+/)[0] === first.toLowerCase()
}

type LoadedRow = RawRow & { date_iso: string | null; priority: 'high' | 'medium' | 'low' | null }

export async function loadAssignments(svc: SupabaseClient, origin: string): Promise<LoadedRow[]> {
  let html = ''
  try {
    const res = await fetch(`${origin}/bcps-web-team-assignments.html`, { cache: 'no-store' })
    if (res.ok) html = await res.text()
  } catch { /* no assignments rather than a failed dashboard */ }
  const rows = parseAssignmentsHtml(html)
  if (!rows.length) return []
  const { data: tags } = await svc.from('bcps_assignment_tags')
    .select('assignment_slug, status, lead_override, support_override, deadline_date, title_override, is_ongoing, priority')
    .in('assignment_slug', rows.map((r) => r.slug))
  const bySlug = new Map((tags ?? []).map((t) => [t.assignment_slug as string, t]))
  return rows.map((r) => {
    const t = bySlug.get(r.slug)
    const deadlineIso = t?.deadline_date ? String(t.deadline_date).slice(0, 10) : isoFromLabel(r.deadline)
    return {
      slug: r.slug,
      title: asText(t?.title_override) || r.title,
      lead: asText(t?.lead_override) || r.lead,
      support: t?.support_override === null || t?.support_override === undefined ? r.support : asText(t.support_override),
      status: t?.is_ongoing ? 'ongoing' : (t?.status || r.status),
      deadline: t?.deadline_date ? null : r.deadline,
      date_iso: deadlineIso,
      priority: (['high', 'medium', 'low'].includes(t?.priority) ? t!.priority : null) as LoadedRow['priority'],
    }
  })
}

export function assignmentsFor(rows: LoadedRow[], first: string, full: string): Assignment[] {
  const today = new Date().toISOString().slice(0, 10)
  const out: Assignment[] = []
  for (const r of rows) {
    if (r.status === 'completed') continue
    const lead = namesIn(r.lead).some((n) => personMatches(n, first, full))
    const support = !lead && namesIn(r.support).some((n) => personMatches(n, first, full))
    if (!lead && !support) continue
    const label = r.date_iso
      ? new Date(r.date_iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : r.deadline
    out.push({
      slug: r.slug,
      title: r.title,
      role: lead ? 'lead' : 'support',
      status: r.status,
      date_label: r.status === 'ongoing' ? 'Ongoing' : label,
      date_iso: r.date_iso,
      past_date: !!r.date_iso && r.date_iso < today && r.status !== 'ongoing',
      priority: r.priority,
    })
  }
  // Soonest dated first, then undated, ongoing last.
  const rank = (a: Assignment) => (a.status === 'ongoing' ? 2 : a.date_iso ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || (a.date_iso ?? '').localeCompare(b.date_iso ?? '') || a.title.localeCompare(b.title))
}

// ── Program numbers ─────────────────────────────────────────────────────
export async function loadProgram(svc: SupabaseClient, depts: TeamDepartment[]) {
  const byDivision = new Map<string, { wcms: Set<string>; certified: Set<string> }>()
  const allWcms = new Set<string>()
  const allCertified = new Set<string>()
  for (const d of depts) {
    const key = d.division || 'Other'
    const bucket = byDivision.get(key) ?? { wcms: new Set<string>(), certified: new Set<string>() }
    for (const w of d.wcms) {
      const e = (w.email || '').trim().toLowerCase()
      if (!e) continue
      bucket.wcms.add(e); allWcms.add(e)
      if (w.certified) { bucket.certified.add(e); allCertified.add(e) }
    }
    byDivision.set(key, bucket)
  }
  const [{ data: dirRows }, { data: accounts }] = await Promise.all([
    svc.from('bcps_departments').select('director_email').not('director_email', 'is', null),
    svc.rpc('bcps_director_accounts'),
  ])
  const directors = new Set((dirRows ?? []).map((r) => (r.director_email as string).trim().toLowerCase()).filter(Boolean))
  return {
    certification: Array.from(byDivision.entries())
      .map(([division, b]) => ({ division, wcms: b.wcms.size, certified: b.certified.size }))
      .filter((r) => r.wcms > 0)
      .sort((a, b) => b.wcms - a.wcms || a.division.localeCompare(b.division)),
    wcms_total: allWcms.size,
    wcms_certified: allCertified.size,
    directors_on_file: directors.size,
    directors_signed_in: (accounts ?? []).length,
    departments_total: depts.length,
    departments_with_wcm: depts.filter((d) => d.wcms.length > 0).length,
    open_findings: depts.reduce((n, d) => n + d.findings_open, 0),
    windows: REVIEW_WINDOWS.map((w) => {
      const inWindow = depts.filter((d) => d.division && w.divisions.includes(d.division))
      return { id: w.id, departments: inWindow.length, signed_off: inWindow.filter((d) => d.audit_status === 'complete').length }
    }),
  }
}

// ── ADA ─────────────────────────────────────────────────────────────────
// Latest scan per department site (school full-site scans live in ADA
// Manager and are not mixed in here).
export async function loadAda(svc: SupabaseClient, depts: { id: string; name: string }[]) {
  const { data } = await svc.from('bcps_audit_results')
    .select('department_id, ada_score, audited_at')
    .not('department_id', 'is', null)
    .order('audited_at', { ascending: false })
    .limit(1000)
  const rows = data ?? []
  const latest = new Map<string, { score: number | null; at: string }>()
  for (const r of rows) if (!latest.has(r.department_id)) latest.set(r.department_id, { score: r.ada_score === null ? null : Number(r.ada_score), at: r.audited_at })
  const scored = Array.from(latest.entries()).filter(([, v]) => v.score !== null) as [string, { score: number; at: string }][]
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000
  const names = new Map(depts.map((d) => [d.id, d.name]))
  return {
    sites_scanned: latest.size,
    average_score: scored.length ? Math.round(scored.reduce((n, [, v]) => n + v.score, 0) / scored.length) : null,
    scans_30d: rows.filter((r) => Date.parse(r.audited_at) > monthAgo).length,
    last_scan: rows[0]?.audited_at ?? null,
    lowest: scored
      .filter(([id]) => names.has(id))
      .sort((a, b) => a[1].score - b[1].score)
      .slice(0, 5)
      .map(([id, v]) => ({ department: names.get(id)!, score: Math.round(v.score) })),
  }
}

// ── Banners ─────────────────────────────────────────────────────────────
export async function loadBanners(svc: SupabaseClient) {
  const { data } = await svc.from('bcps_banner_submissions')
    .select('status, is_test, archived_at')
  const live = (data ?? []).filter((b) => !b.is_test && !b.archived_at)
  const count = (s: string) => live.filter((b) => b.status === s).length
  return { pending: count('pending'), approved: count('approved'), rejected: count('rejected') }
}

// ── Proud Points (2026-10-08) ─────────────────────────────────────────
// Same counts as banners; drafts are the WCM's own work in progress and are
// not the team's to review. ready = approved, not yet marked posted.
export async function loadProudPoints(svc: SupabaseClient) {
  const { data } = await svc.from('bcps_proud_point_submissions')
    .select('status, posted_at, is_test, archived_at')
  const live = (data ?? []).filter((b) => !b.is_test && !b.archived_at)
  const count = (s: string) => live.filter((b) => b.status === s).length
  return {
    pending: count('pending'), approved: count('approved'), rejected: count('rejected'),
    ready: live.filter((b) => b.status === 'approved' && !b.posted_at).length,
  }
}

// ── Widgets ─────────────────────────────────────────────────────────────
// Same edit rule as /api/bcps/widgets: admins edit everything; anyone else
// edits a widget their user or group holds an edit/manage grant on.
export async function loadWidgets(svc: SupabaseClient, brand: string, userId: string, groupIds: string[], isAdmin: boolean) {
  const { data: widgets } = await svc.from('bcps_widgets').select('slug, title, description, preview_path').order('sort_order')
  const list = (widgets ?? []).filter((w) => w.preview_path)
  const slugs = list.map((w) => w.slug as string)
  let editable = new Set<string>()
  if (!isAdmin && slugs.length) {
    const { data: objects } = await svc.from('acl_objects').select('id, slug').eq('brand', brand).eq('kind', 'page').in('slug', slugs)
    const slugById = new Map((objects ?? []).map((o) => [o.id as string, o.slug as string]))
    const { data: grants } = slugById.size
      ? await svc.from('acl_grants').select('object_id, subject_type, subject_id, role').in('object_id', Array.from(slugById.keys()))
      : { data: [] as { object_id: string; subject_type: string; subject_id: string; role: string }[] }
    editable = new Set((grants ?? [])
      .filter((g) => ['edit', 'manage'].includes(g.role) && ((g.subject_type === 'user' && g.subject_id === userId) || (g.subject_type === 'group' && groupIds.includes(g.subject_id))))
      .map((g) => slugById.get(g.object_id)!)
      .filter(Boolean))
  }
  return list.map((w) => ({ ...w, can_edit: isAdmin || editable.has(w.slug as string) }))
}

// ── SuperAdmin decisions ────────────────────────────────────────────────
export async function loadDecisions(svc: SupabaseClient) {
  const { data } = await svc.from('bcps_wcm_roster_submissions')
    .select('id, department_name, director_name, wcm_name, submitted_at, action')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: false })
    .limit(20)
  return { roster_pending: data ?? [] }
}
