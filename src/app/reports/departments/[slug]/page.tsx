// src/app/reports/departments/[slug]/page.tsx
//
// A department's website report as its own page (Sean, 2026-10-28), opened
// from the director dashboard's Analytics tab the way a campaign report opens
// from the Analytics page: how the department's pages are doing, where
// visitors come from, what to fix, and a few marketing ideas drawn from those
// numbers. Access and the ideas live in src/lib/bcps-department-report.ts.
//
// The shell follows the campaign report (src/app/campaigns/[slug]/page.tsx):
// BCPS header with the logo back to the dashboard, a meta row, plain sections.
// Signed out, the middleware sends the visitor to /login and back.
import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { campaignServiceClient, getSessionUser } from '@/lib/bcps-campaign-access'
import {
  checkDepartmentReportAccess, deadPagesFor, marketingIdeas, monthFromEntry, withoutDeadPages,
  type DeadPage, type ReportDepartment, type ReportMonth,
} from '@/lib/bcps-department-report'
import { DepartmentReportView } from '@/components/bcps/DepartmentReport'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata() {
  return { title: 'Department report | BCPS', robots: { index: false, follow: false } }
}

const MONTHS = 13

export default async function DepartmentReportPage({ params }: Props) {
  const { slug } = await params
  await headers()
  const db = campaignServiceClient()
  if (!db) notFound()

  const { data: dept } = await db.from('bcps_departments')
    .select('id, slug, name, division, website_url, director_name, director_email, executive_emails, audit_status, ada_score, previous_paths')
    .eq('slug', slug).maybeSingle()
  if (!dept) notFound()

  const user = await getSessionUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/reports/departments/${slug}`)}`)
  if (!(await checkDepartmentReportAccess(db, user, dept as ReportDepartment))) {
    return (
      <main style={{ minHeight: '100vh', background: '#f5f5f5', fontFamily: 'Arial, Helvetica, sans-serif', padding: '80px 24px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>You do not have access to this report</h1>
        <p style={{ fontSize: 13, color: '#666', maxWidth: 480, margin: '10px auto 0', lineHeight: 1.6 }}>
          Department reports are shared with the department&apos;s director and the leaders who oversee it. Ask the District Web Team if you need access.
        </p>
      </main>
    )
  }

  const { data: snaps } = await db.from('bcps_analytics_snapshots')
    .select('period, top_department_pages, dead_pages, synced_at')
    .order('period', { ascending: false }).limit(MONTHS)
  const months: ReportMonth[] = (snaps ?? [])
    .map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = (Array.isArray(s.top_department_pages) ? s.top_department_pages : []).find((e: any) => e?.dept_id === dept.id)
      return entry ? monthFromEntry(s.period as string, entry) : null
    })
    .filter((m): m is ReportMonth => !!m)
    .sort((a, b) => a.period.localeCompare(b.period))
  const latestMonth = months[months.length - 1] ?? null
  const prev = months.length > 1 ? months[months.length - 2] : null
  const latest = snaps?.[0]

  const paths: string[] = []
  try { if (dept.website_url) paths.push(new URL(dept.website_url).pathname) } catch { /* no address */ }
  for (const p of (dept.previous_paths ?? []) as string[]) if (p) paths.push(p)
  const allDead: DeadPage[] = deadPagesFor(paths, (Array.isArray(latest?.dead_pages) ? latest!.dead_pages : []) as DeadPage[])
  const dead = allDead.slice(0, 15)
  const cur = latestMonth ? withoutDeadPages(latestMonth, allDead) : null
  const ideas = cur ? marketingIdeas(cur, prev, dead, dept as ReportDepartment) : []
  const synced = latest?.synced_at
    ? new Date(latest.synced_at as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
    : null

  return <DepartmentReportView dept={dept as ReportDepartment} months={months} cur={cur} prev={prev} dead={dead} ideas={ideas} synced={synced} thisMonth={new Date().toISOString().slice(0, 7)} />
}
