import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MODULES, COURSE_ID } from '@/lib/cert-data'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

// The BCPS Marcom dashboard sets itself up for whoever signs in (Sean,
// 2026-10-01, playbook wcm-community-hub "BCPS Marcom Dashboard"). This route
// decides which experience the caller gets and returns only the data that
// experience shows:
//   District Web Team: acl_member_roles admin/superadmin, or the "District Web
//     Team" group. Sees every department plus what is waiting on the team.
//   Director: signed-in email matches bcps_departments.director_email. Sees
//     only the departments they lead.
//   WCM: "Web Content Management" group, or listed on a department roster.
// Precedence is District Web Team > Director > WCM; the flags tell the page
// which extra cards someone who fits more than one also gets.
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

interface DepartmentSummary {
  id: string
  name: string
  audit_status: string | null
  wcms: WcmStatus[]
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

  const [roleRes, gmRes, profileRes] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle(),
    svc.from('acl_group_members').select('group_id').eq('user_id', user.id),
    svc.from('wcm_cert_users').select('full_name').eq('user_id', user.id).maybeSingle(),
  ])
  const role = roleRes.data?.role || 'user'
  const gids = (gmRes.data ?? []).map((g) => g.group_id)
  let groups: string[] = []
  if (gids.length) {
    const { data: gRows } = await svc.from('acl_groups').select('name').eq('brand', BRAND).in('id', gids)
    groups = (gRows ?? []).map((g) => g.name as string)
  }

  const isDwt = role === 'admin' || role === 'superadmin' || groups.includes('District Web Team')

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

  const experience = isDwt ? 'dwt' : isDirector ? 'director' : isWcm ? 'wcm' : 'member'

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
    is_wcm: isWcm,
    name: profileRes.data?.full_name ?? null,
    email,
    led_department_ids: ledIds,
    departments,
    team,
  })
}

async function loadDepartments(ids: string[] | null): Promise<DepartmentSummary[]> {
  if (ids !== null && ids.length === 0) return []
  let dq = svc.from('bcps_departments').select('id, name, audit_status').order('name')
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
      audit_status: d.audit_status,
      wcms: (byDept.get(d.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }))
}
