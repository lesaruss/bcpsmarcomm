// src/lib/bcps-department-report.ts
//
// Department website report at /reports/departments/[slug] (Sean, 2026-10-28):
// the director's version of a campaign report. A breakdown of how their
// department's pages are doing, plus a few marketing ideas drawn from those
// numbers.
//
// ACCESS is DEFAULT DENY, like campaign reports, and scoped to the department:
//   1. BCPS admins and superadmins.
//   2. The department's director (bcps_departments.director_email) and the
//      executives it reports to (executive_emails), matched exactly.
//   3. Department Oversight and Leadership View, who see every department on
//      their dashboard already, and the Office of Communications.
// Nobody else, including the department's WCMs and other directors.
//
// The ideas are rules over the report's own numbers, not generated text, so
// every suggestion points at a figure the reader can see on the same page.
import type { SupabaseClient } from '@supabase/supabase-js'

const BRAND = 'bcps'
const REPORT_GROUPS = ['Department Oversight', 'Leadership View', 'Office of Communications']

export interface ReportDepartment {
  id: string
  slug: string
  name: string
  division: string | null
  website_url: string | null
  director_name: string | null
  director_email: string | null
  executive_emails: string[] | null
  audit_status: string | null
  ada_score: number | null
}

export async function checkDepartmentReportAccess(
  db: SupabaseClient,
  user: { id: string; email: string | null },
  dept: ReportDepartment,
): Promise<boolean> {
  const email = (user.email || '').trim().toLowerCase()
  if (email && ((dept.director_email || '').trim().toLowerCase() === email
    || (dept.executive_emails ?? []).some((e) => (e || '').trim().toLowerCase() === email))) return true

  const { data: roleRow } = await db.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin') return true

  const { data: gm } = await db.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const ids = (gm ?? []).map((g: { group_id: string }) => g.group_id)
  if (!ids.length) return false
  const { data: groups } = await db.from('acl_groups').select('name').eq('brand', BRAND).in('id', ids)
  return (groups ?? []).some((g: { name: string }) => REPORT_GROUPS.includes(g.name))
}

export interface ReportMonth {
  period: string
  visitors: number
  visits: number
  new_visitors: number
  engaged_pct: number | null
  avg_seconds: number | null
  pages: { path: string; visits: number; visitors: number; avg_seconds: number }[]
  sources: { source: string; sessions: number; pct: number }[]
}

export interface DeadPage { path: string; name: string; sessions: number; suggested_path: string | null }

export interface Idea { title: string; detail: string }

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0)
const share = (m: ReportMonth, source: string) => m.sources.find((s) => s.source === source)?.pct ?? 0

// Three to six ideas, most useful first. Each one fires only when the numbers
// call for it, and says which number.
export function marketingIdeas(cur: ReportMonth, prev: ReportMonth | null, dead: DeadPage[], dept: ReportDepartment): Idea[] {
  const out: Idea[] = []
  const top = cur.pages[0]

  if (prev && prev.visitors >= 50) {
    const change = pct(cur.visitors - prev.visitors, prev.visitors)
    if (change <= -15) out.push({
      title: 'Bring visitors back with something timely',
      detail: `Visitors are down ${Math.abs(change)}% from the month before. Check whether a deadline, event or season drove last month's traffic, and put what families need next at the top of your main page.`,
    })
    else if (change >= 15) out.push({
      title: 'Build on the jump in visitors',
      detail: `Visitors are up ${change}% from the month before. Find out what drove it, and link from that page to your other services while people are paying attention.`,
    })
  }

  const dead404 = dead.reduce((n, d) => n + d.sessions, 0)
  if (dead.length) out.push({
    title: 'Fix the links that lead to a dead end',
    detail: `${dead.length} old address${dead.length === 1 ? '' : 'es'} under your pages showed "page not found" to ${dead404.toLocaleString('en-US')} visit${dead404 === 1 ? '' : 's'}. Ask your WCM to set a redirect for each one; the list is below.`,
  })

  const search = share(cur, 'Organic Search')
  if (cur.sources.length && search >= 55) out.push({
    title: 'Write for the words families search',
    detail: `${search}% of visits come from search engines. Keep page titles and opening sentences in plain words people actually type, such as the names of your busiest pages${top ? ` ("${top.path.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')}")` : ''}.`,
  })
  else if (cur.sources.length && search > 0 && search < 25) out.push({
    title: 'Help search engines find you',
    detail: `Only ${search}% of visits come from search. Clear page titles, a short summary at the top of each page, and links from related District pages make your pages easier to find.`,
  })

  const social = share(cur, 'Organic Social') + share(cur, 'Paid Social')
  if (cur.sources.length && social < 3) out.push({
    title: 'Share your pages on District social media',
    detail: `${social ? `Only ${social}% of visits come` : 'Almost no visits come'} from social media. Send the Office of Communications a request with a page, a date and a sentence about why it matters, and they can share it on the District's channels.`,
  })

  const email = share(cur, 'Email')
  if (cur.sources.length && email < 2 && cur.visitors >= 200) out.push({
    title: 'Link your pages in emails and newsletters',
    detail: 'Almost no visits come from email. Put a link to the right page in every message your department sends to families or staff, rather than attaching a document.',
  })

  if (cur.engaged_pct !== null && cur.engaged_pct < 50) out.push({
    title: 'Put the answer at the top',
    detail: `${cur.engaged_pct}% of visits are engaged, so many people leave quickly. Lead each page with the one thing most visitors come for: a button, a date or a contact, before any background.`,
  })

  if (top && cur.visits && top.visits / cur.visits >= 0.6 && cur.pages.length > 1) out.push({
    title: 'Point visitors from your busiest page to the rest',
    detail: `One page draws ${pct(top.visits, cur.visits)}% of your visits. Add short links on it to your other services so those visitors discover them.`,
  })

  if (top && /\.pdf$/i.test(top.path)) out.push({
    title: 'Turn your most-read PDF into a web page',
    detail: 'Your most visited item is a PDF. A web page version is easier to read on a phone, easier to find in search, and easier to keep accessible.',
  })

  if (dept.audit_status && dept.audit_status !== 'complete') out.push({
    title: 'Finish your website review',
    detail: 'Your department’s website review is still open. The fixes it lists usually help visitors and search engines at the same time.',
  })

  return out.slice(0, 6)
}

// One month's numbers out of a snapshot entry (bcps_analytics_snapshots.top_department_pages).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function monthFromEntry(period: string, entry: any): ReportMonth {
  const sources = Array.isArray(entry?.sources) ? entry.sources : []
  return {
    period,
    visitors: Number(entry?.active_users ?? 0),
    visits: Number(entry?.sessions ?? 0),
    new_visitors: Number(entry?.new_users ?? 0),
    engaged_pct: entry?.engagement_rate === undefined || entry?.engagement_rate === null ? null : Math.round(Number(entry.engagement_rate) * 100),
    avg_seconds: entry?.avg_session_duration === undefined ? null : Math.round(Number(entry.avg_session_duration)),
    pages: mergePages(Array.isArray(entry?.pages) ? entry.pages : []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sources: sources.map((s: any) => ({ source: String(s.source), sessions: Number(s.sessions ?? 0), pct: Math.round(Number(s.pct ?? 0)) })),
  }
}

// GA4 reports a page with and without its trailing slash as two rows; they are
// one page to a reader, so they are added together under the plain address.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mergePages(rows: any[]): ReportMonth['pages'] {
  const byPath = new Map<string, { path: string; visits: number; visitors: number; secs: number }>()
  for (const p of rows) {
    const path = String(p.path).replace(/(.)\/+$/, '$1')
    const visits = Number(p.sessions ?? 0)
    const cur = byPath.get(path) ?? { path, visits: 0, visitors: 0, secs: 0 }
    cur.visits += visits
    cur.visitors += Number(p.active_users ?? 0)
    cur.secs += Number(p.avg_session_duration ?? 0) * visits
    byPath.set(path, cur)
  }
  return Array.from(byPath.values())
    .map((p) => ({ path: p.path, visits: p.visits, visitors: p.visitors, avg_seconds: p.visits ? Math.round(p.secs / p.visits) : 0 }))
    .sort((a, b) => b.visits - a.visits)
}

/** The month without addresses that served "page not found": those are
 * listed under Links to fix, not counted as the department's busiest pages. */
export function withoutDeadPages(m: ReportMonth, dead: DeadPage[]): ReportMonth {
  const gone = new Set(dead.map((d) => d.path.toLowerCase().replace(/(.)\/+$/, '$1')))
  return { ...m, pages: m.pages.filter((p) => !gone.has(p.path.toLowerCase())) }
}

/** Dead pages that sit under one of the department's addresses. */
export function deadPagesFor(paths: string[], dead: DeadPage[]): DeadPage[] {
  const roots = paths.map((p) => p.replace(/\/+$/, '').toLowerCase()).filter(Boolean)
  return dead.filter((d) => {
    const p = d.path.toLowerCase().replace(/\/+$/, '')
    return roots.some((r) => p === r || p.startsWith(r + '/'))
  })
}
