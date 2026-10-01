import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MODULES, COURSE_ID } from '@/lib/cert-data'
import {
  loadAssignments, assignmentsFor, loadProgram, loadAda, loadBanners, loadWidgets, loadDecisions,
  type TeamMemberWork,
} from '@/lib/bcps-team-home'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

// The BCPS MarComm dashboard sets itself up for whoever signs in (Sean,
// 2026-10-01, playbook wcm-community-hub "BCPS MarComm Dashboard"). This route
// decides which experience the caller gets and returns only the data that
// experience shows:
//   District Web Team: acl_member_roles admin/superadmin, or the "District Web
//     Team" group. Sees every department plus what is waiting on the team.
//   Director: signed-in email matches bcps_departments.director_email. Sees
//     only the departments they lead, with each one's analytics, audit
//     findings count, the widget catalog and the meeting notes shared with
//     them (directors have no group, so the Analytics and Widgets pages are
//     closed to them; their dashboard carries that data itself).
//   WCM: "Web Content Management" group, or listed on a department roster.
// Precedence is SuperAdmin > District Web Team > Director > WCM; the flags
// tell the page which extra cards someone who fits more than one also gets.
//
// The District Web Team has two views (Sean, 2026-10-01): team members also
// in the "Office of Communications" group work the department side
// ('comms'); everyone else is Application Services ('appsvc'), focused on
// ADA, schools and tools. The SuperAdmin gets the team data plus decisions
// waiting on them and each team member's assignments.
//
// Gate: department rosters and per-WCM certification status are scoped here,
// server-side, by the caller's own email (director) or role/group (team). The
// page never queries those tables directly.

// Only pages in the current course count toward progress, so a page that was
// later removed from the course cannot push someone past 100%.
const COURSE_PAGE_KEYS = new Set(MODULES.flatMap((m) => m.pages.map((p) => `${m.id}::${p.id}`)))
const TOTAL_PAGES = COURSE_PAGE_KEYS.size

// PostgREST returns at most 1000 rows per request, and course progress alone
// is ~2,600 completed-page rows, so anything that can grow is read in pages.
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < size) return out
  }
}

interface WcmStatus {
  name: string
  email: string | null
  sub_department: string | null
  has_account: boolean
  certified: boolean
  certified_at: string | null
  progress_pct: number
}

interface DepartmentAnalytics {
  period: string
  visitors: number | null
  new_visitors: number | null
  visits: number | null
  engaged_pct: number | null
  avg_seconds: number | null
  top_pages: { title: string; path: string; visits: number; visitors: number; avg_seconds: number }[]
}

interface DepartmentSummary {
  id: string
  name: string
  division: string | null
  website_url: string | null
  audit_status: string | null
  audit_date: string | null
  ada_score: number | null
  findings_open: number
  findings_fixed: number
  wcms: WcmStatus[]
  analytics?: DepartmentAnalytics | null
}

interface DirectorNote {
  id: string
  title: string
  description: string
  href: string
  link_label: string
  department_id: string | null
  posted_at: string
}

export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user || !user.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const email = user.email.toLowerCase()

  const [roleRes, gmRes, profileRes, certRes] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle(),
    svc.from('acl_group_members').select('group_id').eq('user_id', user.id),
    svc.from('wcm_cert_users').select('full_name').eq('user_id', user.id).maybeSingle(),
    svc.from('wcm_certifications').select('issued_at').eq('user_id', user.id).eq('course_id', COURSE_ID).maybeSingle(),
  ])
  const role = roleRes.data?.role || 'user'
  const gids = (gmRes.data ?? []).map((g) => g.group_id)
  let groups: string[] = []
  if (gids.length) {
    const { data: gRows } = await svc.from('acl_groups').select('name').eq('brand', BRAND).in('id', gids)
    groups = (gRows ?? []).map((g) => g.name as string)
  }

  const isDwt = role === 'admin' || role === 'superadmin' || groups.includes('District Web Team')
  const isSuperadmin = role === 'superadmin'
  const teamKind: 'comms' | 'appsvc' | null = !isDwt ? null
    : (role === 'admin' || isSuperadmin || groups.includes('Office of Communications')) ? 'comms' : 'appsvc'

  // Exact, case-insensitive email matches done here rather than with ilike,
  // where '_' in an address is a wildcard and could match another person.
  const [allDepts, allMembers] = await Promise.all([
    fetchAll<{ id: string; director_email: string | null }>((a, b) => svc.from('bcps_departments').select('id, director_email').order('id').range(a, b)),
    fetchAll<{ roster_id: string; wcm_email: string | null }>((a, b) => svc.from('bcps_wcm_roster_members').select('roster_id, wcm_email').order('id').range(a, b)),
  ])
  const ledIds = allDepts
    .filter((d) => (d.director_email || '').trim().toLowerCase() === email)
    .map((d) => d.id as string)
  const isDirector = ledIds.length > 0

  const myRosterRows = allMembers
    .filter((m) => (m.wcm_email || '').trim().toLowerCase() === email)
  const isWcm = groups.includes('Web Content Management') || myRosterRows.length > 0

  const experience = isSuperadmin ? 'superadmin' : isDwt ? 'dwt' : isDirector ? 'director' : isWcm ? 'wcm' : 'member'

  // Departments shown: every department for the team, the led ones for a
  // director, the caller's own roster departments for a WCM.
  let departmentIds: string[] | null = null
  if (!isDwt) {
    const ids = new Set(ledIds)
    if (myRosterRows.length) {
      const { data: rr } = await svc.from('bcps_wcm_roster')
        .select('matched_department_id').in('id', myRosterRows.map((r) => r.roster_id))
      for (const r of rr ?? []) if (r.matched_department_id) ids.add(r.matched_department_id as string)
    }
    departmentIds = Array.from(ids)
  }

  const departments = await loadDepartments(departmentIds)

  // Director-only extras. Analytics only for the departments they lead.
  let widgets: { slug: string; title: string; description: string | null; preview_path: string | null }[] = []
  let directorNotes: DirectorNote[] = []
  if (isDirector) {
    const analytics = await loadAnalytics(ledIds, departments)
    for (const d of departments) if (ledIds.includes(d.id)) d.analytics = analytics.get(d.id) ?? null
    directorNotes = await loadDirectorNotes(ledIds, email)
  } else if (isWcm && !isDwt && departments.length) {
    // A WCM's own department site visitors, for the My Department tab.
    const ids = departments.map((d) => d.id)
    const analytics = await loadAnalytics(ids, departments)
    for (const d of departments) d.analytics = analytics.get(d.id) ?? null
  }

  // The caller's own certification progress (WCM status strip). Only
  // pages in the current course count, same as the director view.
  let myCert: { certified: boolean; done: number; total: number; pct: number } | null = null
  if (isWcm || isDirector) {
    const prog = await fetchAll<{ module_id: string; page_id: string }>((a, b) => svc.from('wcm_cert_progress')
      .select('module_id, page_id').eq('user_id', user.id).eq('course_id', COURSE_ID).eq('completed', true).order('id').range(a, b))
    const done = new Set(prog.map((p) => `${p.module_id}::${p.page_id}`).filter((k) => COURSE_PAGE_KEYS.has(k))).size
    const certified = !!certRes.data?.issued_at
    myCert = { certified, done: certified ? TOTAL_PAGES : done, total: TOTAL_PAGES, pct: certified ? 100 : TOTAL_PAGES ? Math.min(99, Math.round((done / TOTAL_PAGES) * 100)) : 0 }
  }
  // The widget catalog is the same for everyone. The team gets it with
  // their own edit rights (also used by the "View as" director preview).
  if (isDwt) {
    widgets = await loadWidgets(svc, BRAND, user.id, gids, role === 'admin' || isSuperadmin)
  } else if (isDirector) {
    const { data: wRows } = await svc.from('bcps_widgets').select('slug, title, description, preview_path').order('sort_order')
    widgets = (wRows ?? []).filter((w) => w.preview_path)
  }

  const displayName = profileRes.data?.full_name || nameFromEmail(email)

  let teamHome: Record<string, unknown> | null = null
  if (isDwt) {
    const [program, ada, banners, rows] = await Promise.all([
      loadProgram(svc, departments),
      loadAda(svc, departments),
      loadBanners(svc),
      // Assignments are a bonus on the dashboard: if they cannot be read,
      // the rest of the dashboard still loads (2026-10-01 incident).
      loadAssignments(svc, req.nextUrl.origin).catch((e) => { console.error('home: assignments failed', e); return [] }),
    ])
    const { data: kb } = await svc.from('bcps_kb_articles')
      .select('id, topic, title, summary, href, sort_order')
      .eq('state', 'live').contains('audience', ['team'])
      .order('topic').order('sort_order')
    teamHome = {
      program,
      ada,
      banners,
      kb_articles: kb ?? [],
      my_assignments: assignmentsFor(rows, displayName.split(/\s+/)[0], displayName),
    }
    if (isSuperadmin) {
      teamHome.decisions = await loadDecisions(svc).catch((e) => { console.error('home: decisions failed', e); return { roster_pending: [] } })
      teamHome.team_members = await loadTeamMembers(rows).catch((e) => { console.error('home: team members failed', e); return [] })
    }
  }


  let team: Record<string, number> | null = null
  if (isDwt) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const [pending, unread, access, certs] = await Promise.all([
      svc.from('bcps_wcm_roster_submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      svc.from('wcm_pilot_feedback').select('id', { count: 'exact', head: true }).is('read_at', null),
      svc.from('support_access_grants').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
      svc.from('wcm_certifications').select('id', { count: 'exact', head: true }).eq('course_id', COURSE_ID).gte('issued_at', weekAgo),
    ])
    team = {
      roster_pending: pending.count ?? 0,
      messages_unread: unread.count ?? 0,
      access_requests: access.count ?? 0,
      certifications_7d: certs.count ?? 0,
    }
  }

  return NextResponse.json({
    experience,
    is_dwt: isDwt,
    is_director: isDirector,
    is_superadmin: isSuperadmin,
    my_certified: !!certRes.data?.issued_at,
    my_cert: myCert,
    team_kind: teamKind,
    is_wcm: isWcm,
    name: profileRes.data?.full_name ?? null,
    email,
    led_department_ids: ledIds,
    departments,
    team,
    widgets,
    director_notes: directorNotes,
    team_home: teamHome,
  })
}

async function loadDepartments(ids: string[] | null): Promise<DepartmentSummary[]> {
  if (ids !== null && ids.length === 0) return []
  let dq = svc.from('bcps_departments').select('id, name, division, website_url, audit_status, audit_date, ada_score').order('name')
  if (ids !== null) dq = dq.in('id', ids)
  const { data: depts } = await dq
  if (!depts?.length) return []

  const { data: rosters } = await svc.from('bcps_wcm_roster')
    .select('id, matched_department_id, no_website').in('matched_department_id', depts.map((d) => d.id))
  const rosterIds = (rosters ?? []).filter((r) => !r.no_website).map((r) => r.id)
  const { data: members } = rosterIds.length
    ? await svc.from('bcps_wcm_roster_members').select('roster_id, wcm_name, wcm_email, sub_department').in('roster_id', rosterIds)
    : { data: [] as { roster_id: string; wcm_name: string; wcm_email: string | null; sub_department: string | null }[] }

  const emails = new Set((members ?? []).map((m) => (m.wcm_email || '').trim().toLowerCase()).filter(Boolean))
  const userByEmail = new Map<string, string>()
  const certByUser = new Map<string, string>()
  const doneByUser = new Map<string, number>()
  if (emails.size) {
    // wcm_cert_users.email is not always stored lowercase, so match in code.
    const accounts = await fetchAll<{ user_id: string | null; email: string | null }>((a, b) => svc.from('wcm_cert_users').select('user_id, email').order('id').range(a, b))
    for (const a of accounts) {
      const e = (a.email || '').trim().toLowerCase()
      if (a.user_id && emails.has(e)) userByEmail.set(e, a.user_id)
    }
    const uids = Array.from(new Set(userByEmail.values()))
    if (uids.length) {
      const [certs, prog] = await Promise.all([
        fetchAll<{ user_id: string; issued_at: string }>((a, b) => svc.from('wcm_certifications').select('user_id, issued_at').eq('course_id', COURSE_ID).in('user_id', uids).order('id').range(a, b)),
        fetchAll<{ user_id: string; module_id: string; page_id: string }>((a, b) => svc.from('wcm_cert_progress').select('user_id, module_id, page_id').eq('course_id', COURSE_ID).eq('completed', true).in('user_id', uids).order('id').range(a, b)),
      ])
      for (const c of certs) certByUser.set(c.user_id, c.issued_at)
      for (const p of prog) {
        if (!COURSE_PAGE_KEYS.has(`${p.module_id}::${p.page_id}`)) continue
        doneByUser.set(p.user_id, (doneByUser.get(p.user_id) ?? 0) + 1)
      }
    }
  }

  const findings = await fetchAll<{ department_id: string; wcm_fixed: boolean | null }>((a, b) => {
    let q = svc.from('bcps_audit_findings').select('department_id, wcm_fixed').order('id').range(a, b)
    if (ids !== null) q = q.in('department_id', ids)
    return q
  })
  const openByDept = new Map<string, number>()
  const fixedByDept = new Map<string, number>()
  for (const f of findings) {
    const m = f.wcm_fixed ? fixedByDept : openByDept
    m.set(f.department_id, (m.get(f.department_id) ?? 0) + 1)
  }

  const rosterToDept = new Map((rosters ?? []).map((r) => [r.id as string, r.matched_department_id as string]))
  const noWebsite = new Set((rosters ?? []).filter((r) => r.no_website).map((r) => r.matched_department_id as string))
  const byDept = new Map<string, WcmStatus[]>()
  for (const m of members ?? []) {
    const deptId = rosterToDept.get(m.roster_id)
    if (!deptId) continue
    const e = (m.wcm_email || '').trim().toLowerCase()
    const uid = e ? userByEmail.get(e) : undefined
    const certifiedAt = uid ? certByUser.get(uid) ?? null : null
    const done = uid ? doneByUser.get(uid) ?? 0 : 0
    const list = byDept.get(deptId) ?? []
    list.push({
      name: m.wcm_name,
      email: m.wcm_email,
      sub_department: m.sub_department,
      has_account: !!uid,
      certified: !!certifiedAt,
      certified_at: certifiedAt,
      progress_pct: certifiedAt ? 100 : TOTAL_PAGES ? Math.min(99, Math.round((done / TOTAL_PAGES) * 100)) : 0,
    })
    byDept.set(deptId, list)
  }

  return depts
    // A department marked as having no website needs no WCM, so it is left out.
    .filter((d) => !noWebsite.has(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      division: d.division ?? null,
      website_url: d.website_url ?? null,
      audit_status: d.audit_status,
      audit_date: d.audit_date ?? null,
      ada_score: d.ada_score === null || d.ada_score === undefined ? null : Math.round(Number(d.ada_score)),
      findings_open: openByDept.get(d.id) ?? 0,
      findings_fixed: fixedByDept.get(d.id) ?? 0,
      wcms: (byDept.get(d.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

// "/bcps-departments/procurement-logistics/warehousing-services" -> "Warehousing Services"
function titleFromPath(path: string): string {
  const seg = path.replace(/\/+$/, '').split('/').pop() || path
  return seg.split('-').filter(Boolean).map((w) => (w === 'and' ? 'and' : w[0].toUpperCase() + w.slice(1))).join(' ')
}

// Latest month for each department: visitors, average visit and engaged
// share from bcps_department_analytics; visits, first-time visitors and the
// most visited pages from the same month's site snapshot (GA4 sync).
async function loadAnalytics(ids: string[], depts: DepartmentSummary[]): Promise<Map<string, DepartmentAnalytics>> {
  const out = new Map<string, DepartmentAnalytics>()
  if (!ids.length) return out
  const { data: rows } = await svc.from('bcps_department_analytics')
    .select('department_id, period, monthly_visitors, avg_time_seconds, bounce_rate')
    .in('department_id', ids).order('period', { ascending: false })
  const latest = new Map<string, { period: string; monthly_visitors: number | null; avg_time_seconds: number | null; bounce_rate: number | null }>()
  for (const r of rows ?? []) if (!latest.has(r.department_id)) latest.set(r.department_id, r)

  const periods = Array.from(new Set(Array.from(latest.values()).map((r) => r.period)))
  const snapByPeriod = new Map<string, { dept_id?: string; sessions?: number; new_users?: number; engagement_rate?: number; pages?: { path: string; sessions: number; active_users: number; avg_session_duration: number }[] }[]>()
  if (periods.length) {
    const { data: snaps } = await svc.from('bcps_analytics_snapshots').select('period, top_department_pages').in('period', periods)
    for (const s of snaps ?? []) snapByPeriod.set(s.period, Array.isArray(s.top_department_pages) ? s.top_department_pages : [])
  }

  for (const id of ids) {
    if (!depts.some((d) => d.id === id)) continue
    const row = latest.get(id)
    if (!row) continue
    const entry = (snapByPeriod.get(row.period) ?? []).find((e) => e.dept_id === id)
    const bounce = row.bounce_rate === null || row.bounce_rate === undefined ? null : Number(row.bounce_rate)
    out.set(id, {
      period: row.period,
      visitors: row.monthly_visitors ?? null,
      new_visitors: entry?.new_users ?? null,
      visits: entry?.sessions ?? null,
      engaged_pct: entry?.engagement_rate !== undefined && entry?.engagement_rate !== null
        ? Math.round(Number(entry.engagement_rate) * 100)
        : bounce !== null ? Math.round((1 - bounce) * 100) : null,
      avg_seconds: row.avg_time_seconds ?? null,
      top_pages: (entry?.pages ?? [])
        .slice()
        .sort((a, b) => (b.sessions ?? 0) - (a.sessions ?? 0))
        .slice(0, 6)
        .map((p) => ({
          title: titleFromPath(p.path),
          path: p.path,
          visits: p.sessions ?? 0,
          visitors: p.active_users ?? 0,
          avg_seconds: Math.round(p.avg_session_duration ?? 0),
        })),
    })
  }
  return out
}

// Meeting notes the team shared with directors (bcps_wcm_hub_items, tab
// 'director_notes'): every-director notes plus notes for a department this
// person leads. A note linking to a brief is only returned when the director
// can open it: the brief has no recipient list, or lists their email.
async function loadDirectorNotes(ledIds: string[], email: string): Promise<DirectorNote[]> {
  const { data } = await svc.from('bcps_wcm_hub_items')
    .select('id, title, description, href, link_label, department_id, created_at, sort_order')
    .eq('tab', 'director_notes').eq('state', 'live')
    .order('created_at', { ascending: false })
  const rows = (data ?? []).filter((n) => !n.department_id || ledIds.includes(n.department_id))
  const briefSlugs = Array.from(new Set(rows
    .map((n) => /^\/briefs\/([^/?#]+)/.exec(n.href)?.[1])
    .filter((s): s is string => !!s)))
  const recipientsBySlug = new Map<string, string[]>()
  if (briefSlugs.length) {
    const recips = await fetchAll<{ brief_slug: string; attendee_email: string | null }>((a, b) => svc.from('bcps_brief_recipients')
      .select('brief_slug, attendee_email').in('brief_slug', briefSlugs).order('id').range(a, b))
    for (const r of recips) {
      const list = recipientsBySlug.get(r.brief_slug) ?? []
      list.push((r.attendee_email || '').trim().toLowerCase())
      recipientsBySlug.set(r.brief_slug, list)
    }
  }
  return rows
    .filter((n) => {
      const slug = /^\/briefs\/([^/?#]+)/.exec(n.href)?.[1]
      if (!slug) return true
      const list = recipientsBySlug.get(slug)
      return !list || list.includes(email)
    })
    .map((n) => ({
      id: n.id,
      title: n.title,
      description: n.description,
      href: n.href,
      link_label: n.link_label,
      department_id: n.department_id,
      posted_at: n.created_at,
    }))
}

// "vanessa.deslandes@browardschools.com" -> "Vanessa Deslandes"
function nameFromEmail(email: string): string {
  return email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
}

// Every District Web Team member with their open assignments, for the
// SuperAdmin's Team tab and the web team "View as" previews.
async function loadTeamMembers(rows: Awaited<ReturnType<typeof loadAssignments>>): Promise<TeamMemberWork[]> {
  const { data: groupRows } = await svc.from('acl_groups').select('id, name').eq('brand', BRAND).in('name', ['District Web Team', 'Office of Communications'])
  const dwtId = groupRows?.find((g) => g.name === 'District Web Team')?.id
  const oocId = groupRows?.find((g) => g.name === 'Office of Communications')?.id
  if (!dwtId) return []
  const { data: members } = await svc.from('acl_group_members').select('user_id, group_id').in('group_id', [dwtId, oocId].filter(Boolean) as string[])
  const dwtUsers = Array.from(new Set((members ?? []).filter((m) => m.group_id === dwtId).map((m) => m.user_id as string)))
  const oocUsers = new Set((members ?? []).filter((m) => m.group_id === oocId).map((m) => m.user_id as string))
  const [{ data: profiles }, { data: roles }] = await Promise.all([
    svc.from('wcm_cert_users').select('user_id, full_name').in('user_id', dwtUsers),
    svc.from('acl_member_roles').select('user_id, title, department_slug').eq('brand', BRAND).in('user_id', dwtUsers),
  ])
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id as string, p.full_name as string | null]))
  const roleById = new Map((roles ?? []).map((r) => [r.user_id as string, r]))
  const slugs = Array.from(new Set((roles ?? []).map((r) => r.department_slug).filter(Boolean))) as string[]
  const { data: deptRows } = slugs.length
    ? await svc.from('bcps_departments').select('slug, name').in('slug', slugs)
    : { data: [] as { slug: string; name: string }[] }
  const deptBySlug = new Map((deptRows ?? []).map((d) => [d.slug as string, d.name as string]))
  const out: TeamMemberWork[] = []
  for (const id of dwtUsers) {
    const { data } = await svc.auth.admin.getUserById(id)
    const email = (data.user?.email || '').toLowerCase()
    if (!email) continue
    const name = nameById.get(id) || nameFromEmail(email)
    const role = roleById.get(id)
    out.push({
      user_id: id,
      name,
      email,
      title: (role?.title as string | null) || null,
      department: role?.department_slug ? deptBySlug.get(role.department_slug as string) ?? null : null,
      team: oocUsers.has(id) ? 'comms' : 'appsvc',
      assignments: assignmentsFor(rows, name.split(/\s+/)[0], name),
    })
  }
  return out.sort((a, b) => (a.team === b.team ? 0 : a.team === 'comms' ? -1 : 1) || b.assignments.length - a.assignments.length)
}
