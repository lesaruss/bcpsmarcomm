import type { SupabaseClient } from '@supabase/supabase-js'

// A department's Google Analytics numbers, shaped for the dashboard's Analytics
// tab. Shared by /api/bcps/home (the Director and WCM dashboards) and
// /api/bcps/guides (a department guide's Analytics tab), so both show the same
// numbers.

export interface DepartmentMonth {
  period: string
  visitors: number | null
  new_visitors: number | null
  visits: number | null
  engaged_pct: number | null
  avg_seconds: number | null
  top_pages: { title: string; path: string; visits: number; visitors: number; avg_seconds: number }[]
}

export interface DepartmentAnalytics {
  period: string
  visitors: number | null
  new_visitors: number | null
  visits: number | null
  engaged_pct: number | null
  avg_seconds: number | null
  top_pages: { title: string; path: string; visits: number; visitors: number; avg_seconds: number }[]
  // Every synced month, oldest first, for the Analytics tab's period picker
  // and Traffic chart (Sean, Oct 27 Hot Lab).
  months: DepartmentMonth[]
}

// "/bcps-departments/procurement-logistics/warehousing-services" -> "Warehousing Services"
export function titleFromPath(path: string): string {
  const seg = path.replace(/\/+$/, '').split('/').pop() || path
  return seg.split('-').filter(Boolean).map((w) => (w === 'and' ? 'and' : w[0].toUpperCase() + w.slice(1))).join(' ')
}

// Latest month for each department: visitors, average visit and engaged
// share from bcps_department_analytics; visits, first-time visitors and the
// most visited pages from the same month's site snapshot (GA4 sync).
export async function loadDepartmentAnalytics(svc: SupabaseClient, ids: string[]): Promise<Map<string, DepartmentAnalytics>> {
  const out = new Map<string, DepartmentAnalytics>()
  if (!ids.length) return out
  const { data: rows } = await svc.from('bcps_department_analytics')
    .select('department_id, period, monthly_visitors, avg_time_seconds, bounce_rate')
    .in('department_id', ids).order('period', { ascending: false })

  const periods = Array.from(new Set((rows ?? []).map((r) => r.period as string)))
  const snapByPeriod = new Map<string, { dept_id?: string; sessions?: number; new_users?: number; engagement_rate?: number; pages?: { path: string; sessions: number; active_users: number; avg_session_duration: number }[] }[]>()
  if (periods.length) {
    const { data: snaps } = await svc.from('bcps_analytics_snapshots').select('period, top_department_pages').in('period', periods)
    for (const s of snaps ?? []) snapByPeriod.set(s.period, Array.isArray(s.top_department_pages) ? s.top_department_pages : [])
  }

  const monthOf = (id: string, row: { period: string; monthly_visitors: number | null; avg_time_seconds: number | null; bounce_rate: number | null }): DepartmentMonth => {
    const entry = (snapByPeriod.get(row.period) ?? []).find((e) => e.dept_id === id)
    const bounce = row.bounce_rate === null || row.bounce_rate === undefined ? null : Number(row.bounce_rate)
    return {
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
        .slice(0, 20)
        .map((p) => ({
          title: titleFromPath(p.path),
          path: p.path,
          visits: p.sessions ?? 0,
          visitors: p.active_users ?? 0,
          avg_seconds: Math.round(p.avg_session_duration ?? 0),
        })),
    }
  }

  for (const id of ids) {
    const mine = (rows ?? []).filter((r) => r.department_id === id)
    if (!mine.length) continue
    const months = mine.map((r) => monthOf(id, r)).reverse()
    const latest = months[months.length - 1]
    out.set(id, { ...latest, top_pages: latest.top_pages.slice(0, 6), months })
  }
  return out
}
