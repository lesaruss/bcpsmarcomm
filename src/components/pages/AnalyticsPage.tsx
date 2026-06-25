'use client'

import React, { useState, useEffect, useCallback } from 'react'

// ─── Period types ─────────────────────────────────────────────────────────────
type PeriodMode = 'calendar' | 'school' | 'custom'

const NOW = new Date()
const CUR_YEAR = NOW.getFullYear()
const CUR_MONTH = NOW.getMonth() + 1
// Current school year start: if Aug or later we're in CUR_YEAR's school year, else CUR_YEAR-1
const CUR_SCHOOL_START = CUR_MONTH >= 8 ? CUR_YEAR : CUR_YEAR - 1

interface PeriodState {
  mode: PeriodMode
  calYear: number
  schoolStart: number
  customFrom: string
  customTo: string
}

interface PeriodRange {
  from: string; to: string
  prevFrom: string; prevTo: string
  label: string; prevLabel: string
}

function getPeriodRange(p: PeriodState): PeriodRange | null {
  if (p.mode === 'calendar') {
    return {
      from: `${p.calYear}-01-01`, to: `${p.calYear}-12-31`,
      prevFrom: `${p.calYear - 1}-01-01`, prevTo: `${p.calYear - 1}-12-31`,
      label: String(p.calYear), prevLabel: String(p.calYear - 1),
    }
  }
  if (p.mode === 'school') {
    return {
      from: `${p.schoolStart}-08-01`, to: `${p.schoolStart + 1}-07-31`,
      prevFrom: `${p.schoolStart - 1}-08-01`, prevTo: `${p.schoolStart}-07-31`,
      label: `${p.schoolStart}–${String(p.schoolStart + 1).slice(-2)}`,
      prevLabel: `${p.schoolStart - 1}–${String(p.schoolStart).slice(-2)}`,
    }
  }
  if (p.customFrom && p.customTo) {
    const days = (new Date(p.customTo).getTime() - new Date(p.customFrom).getTime()) / 86400000
    const prevToDate = new Date(new Date(p.customFrom).getTime() - 86400000)
    const prevFromDate = new Date(prevToDate.getTime() - days * 86400000)
    const prevTo = prevToDate.toISOString().slice(0, 10)
    const prevFrom = prevFromDate.toISOString().slice(0, 10)
    return {
      from: p.customFrom, to: p.customTo,
      prevFrom, prevTo,
      label: `${p.customFrom} to ${p.customTo}`,
      prevLabel: `${prevFrom} to ${prevTo}`,
    }
  }
  return null
}

// ─── Analytics interfaces ─────────────────────────────────────────────────────
interface AnalyticsPageProps {
  onShowToast: (msg: string) => void
}

interface SubPage {
  path: string
  sessions: number
  active_users: number
  engagement_rate: number
  avg_session_duration: number
  new_users?: number
}

interface DeptRow {
  slug: string
  url_slug: string
  name: string
  sessions: number
  active_users: number
  new_users: number
  engagement_rate: number
  avg_session_duration: number
  pages?: SubPage[]
  path?: string
}

interface ProgramRow {
  name: string
  path: string
  sessions: number
  active_users: number
  engagement_rate: number
  avg_session_duration: number
  pages: SubPage[]
}

interface Snapshot {
  period: string
  top_department_pages: DeptRow[]
  top_program_pages?: ProgramRow[]
  top_project_pages?: ProgramRow[]
  traffic_sources: Record<string, number>
  synced_at: string
}

const PAGE_SIZES = [10, 25, 50, 100, 200]
const BWS = 'https://www.browardschools.com'

function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function EngagementBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100)
  const color = pct >= 70 ? '#1a7a3c' : pct >= 50 ? '#1672A7' : '#b45309'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function PaginationBar({
  total, pageSize, page, onPageSize, onPage
}: {
  total: number, pageSize: number, page: number,
  onPageSize: (n: number) => void, onPage: (n: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderTop: '1px solid rgba(0,0,0,0.08)', background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>Rows:</span>
        {PAGE_SIZES.map(n => (
          <button key={n} onClick={() => { onPageSize(n); onPage(0) }}
            style={{ fontSize: 11, fontWeight: pageSize === n ? 800 : 500, color: pageSize === n ? '#1672A7' : '#555', background: pageSize === n ? '#e8f1f8' : 'transparent', border: 'none', borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
            {n}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{total === 0 ? '0' : page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}</span>
        <button onClick={() => onPage(page - 1)} disabled={page === 0}
          style={{ fontSize: 13, border: 'none', background: 'none', cursor: page === 0 ? 'not-allowed' : 'pointer', color: page === 0 ? '#ccc' : '#1672A7', padding: '2px 6px', fontWeight: 700 }}>
          &lsaquo;
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}
          style={{ fontSize: 13, border: 'none', background: 'none', cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer', color: page >= totalPages - 1 ? '#ccc' : '#1672A7', padding: '2px 6px', fontWeight: 700 }}>
          &rsaquo;
        </button>
      </div>
    </div>
  )
}

const DEPT_LINK = (urlSlug: string) => `/bcps?page=departments&dept=${urlSlug}`

// ─── Period Selector ──────────────────────────────────────────────────────────
function PeriodSelector({
  period, setPeriod,
  customFrom, setCustomFrom,
  customTo, setCustomTo,
  onApply,
  prevLabel, hasPrevData,
}: {
  period: PeriodState
  setPeriod: React.Dispatch<React.SetStateAction<PeriodState>>
  customFrom: string
  setCustomFrom: (v: string) => void
  customTo: string
  setCustomTo: (v: string) => void
  onApply: () => void
  prevLabel: string | null
  hasPrevData: boolean
}) {
  const calYears = [CUR_YEAR, CUR_YEAR - 1, CUR_YEAR - 2]
  const schoolYears = [CUR_SCHOOL_START, CUR_SCHOOL_START - 1, CUR_SCHOOL_START - 2]

  const btnBase: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '6px 14px', border: 'none', borderRadius: 6,
    cursor: 'pointer', transition: 'all .12s', fontFamily: 'Montserrat, sans-serif',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', background: 'rgba(0,0,0,.06)', borderRadius: 8, padding: 2, gap: 2 }}>
        {([['calendar', 'Calendar Year'], ['school', 'School Year'], ['custom', 'Custom']] as [PeriodMode, string][]).map(([m, label]) => (
          <button key={m}
            onClick={() => setPeriod(p => ({ ...p, mode: m }))}
            style={{
              ...btnBase,
              background: period.mode === m ? '#fff' : 'transparent',
              color: period.mode === m ? '#1672A7' : '#94a3b8',
              boxShadow: period.mode === m ? '0 1px 3px rgba(0,0,0,.12)' : 'none',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Calendar Year picker */}
      {period.mode === 'calendar' && (
        <select
          value={period.calYear}
          onChange={e => setPeriod(p => ({ ...p, calYear: Number(e.target.value) }))}
          style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', border: '1px solid rgba(0,0,0,.15)', borderRadius: 7, color: '#1a1a1a', background: '#fff', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
          {calYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      )}

      {/* School Year picker */}
      {period.mode === 'school' && (
        <select
          value={period.schoolStart}
          onChange={e => setPeriod(p => ({ ...p, schoolStart: Number(e.target.value) }))}
          style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', border: '1px solid rgba(0,0,0,.15)', borderRadius: 7, color: '#1a1a1a', background: '#fff', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
          {schoolYears.map(y => (
            <option key={y} value={y}>{y}&ndash;{String(y + 1).slice(-2)}</option>
          ))}
        </select>
      )}

      {/* Custom date range */}
      {period.mode === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', border: '1px solid rgba(0,0,0,.15)', borderRadius: 7, fontFamily: 'Montserrat, sans-serif', color: '#1a1a1a' }} />
          <span style={{ fontSize: 12, color: '#94a3b8' }}>to</span>
          <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
            style={{ fontSize: 12, padding: '6px 8px', border: '1px solid rgba(0,0,0,.15)', borderRadius: 7, fontFamily: 'Montserrat, sans-serif', color: '#1a1a1a' }} />
          {customFrom && customTo && (
            <button onClick={onApply}
              style={{ fontSize: 11, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
              Apply
            </button>
          )}
        </div>
      )}

      {/* Comparison label */}
      {prevLabel && (
        <span style={{ fontSize: 11, color: '#94a3b8' }}>
          vs. {prevLabel}
          {!hasPrevData && <span style={{ color: '#c4c4c4', marginLeft: 4 }}>(no data yet)</span>}
        </span>
      )}
    </div>
  )
}

// ─── Delta indicator ──────────────────────────────────────────────────────────
function KpiDelta({ cur, prev, lowerIsBetter = false, prevLabel }: { cur?: number; prev?: number; lowerIsBetter?: boolean; prevLabel?: string }) {
  if (!cur || !prev || prev === 0) return null
  const diff = ((cur - prev) / prev) * 100
  const isGood = lowerIsBetter ? diff < 0 : diff > 0
  const color = isGood ? '#1a7a3c' : '#b91c1c'
  return (
    <div style={{ fontSize: 10, fontWeight: 600, color, marginTop: 4 }}>
      {diff > 0 ? '+' : ''}{diff.toFixed(1)}% {prevLabel ? `vs ${prevLabel}` : 'vs prev'}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AnalyticsPage({ onShowToast }: AnalyticsPageProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [prevSnapshot, setPrevSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'departments' | 'programs' | 'sources'>('departments')

  // Period selection
  const [period, setPeriod] = useState<PeriodState>({
    mode: 'calendar',
    calYear: CUR_YEAR,
    schoolStart: CUR_SCHOOL_START,
    customFrom: '',
    customTo: '',
  })
  // Custom inputs are staged separately (only applied on Apply click)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Search (per tab, departments + programs only)
  const [query, setQuery] = useState('')

  // Pagination
  const [deptPage, setDeptPage] = useState(0)
  const [deptPageSize, setDeptPageSize] = useState(10)
  const [progPage, setProgPage] = useState(0)
  const [progPageSize, setProgPageSize] = useState(25)

  // Drill-down rows
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set())
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const pr = getPeriodRange(period)
      let url = '/api/bcps/analytics'
      if (pr) {
        const params = new URLSearchParams({
          from: pr.from, to: pr.to,
          prevFrom: pr.prevFrom, prevTo: pr.prevTo,
        })
        url += '?' + params.toString()
      }
      const res = await fetch(url)
      const data = await res.json()
      setSnapshot(data.snapshot ?? null)
      setPrevSnapshot(data.prevSnapshot ?? null)
    } catch {
      setError('Failed to load analytics data.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  // Reset paging + search when switching tabs
  useEffect(() => { setQuery(''); setDeptPage(0); setProgPage(0) }, [activeTab])

  const handleApplyCustom = useCallback(() => {
    if (customFrom && customTo) {
      setPeriod(p => ({ ...p, customFrom, customTo }))
    }
  }, [customFrom, customTo])

  const handleSync = async () => {
    setSyncing(true)
    onShowToast('Syncing GA4 data...')
    try {
      const res = await fetch('/api/bcps/analytics', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      await load()
      onShowToast('GA4 data synced.')
    } catch {
      onShowToast('Sync failed - check function logs.')
    } finally {
      setSyncing(false)
    }
  }

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>) => (key: string) => {
    set(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  const toggleDept = toggle(setExpandedDepts)
  const toggleProgram = toggle(setExpandedPrograms)

  const allDepts = snapshot?.top_department_pages || []
  const allPrograms = snapshot?.top_program_pages || snapshot?.top_project_pages || []
  const prevDepts = prevSnapshot?.top_department_pages || []

  const q = query.trim().toLowerCase()
  const depts = q && activeTab === 'departments' ? allDepts.filter(d => d.name.toLowerCase().includes(q)) : allDepts
  const programs = q && activeTab === 'programs' ? allPrograms.filter(p => p.name.toLowerCase().includes(q)) : allPrograms

  const pagedDepts = depts.slice(deptPage * deptPageSize, (deptPage + 1) * deptPageSize)
  const pagedPrograms = programs.slice(progPage * progPageSize, (progPage + 1) * progPageSize)

  const totalSources = Object.values(snapshot?.traffic_sources || {}).reduce((a, b) => a + b, 0)
  const prevTotalSources = Object.values(prevSnapshot?.traffic_sources || {}).reduce((a, b) => a + b, 0)
  const sourceColors: Record<string, string> = {
    'Organic Search': '#1672A7', 'Direct': '#2E8B57', 'Referral': '#7B5EA7',
    'Organic Social': '#D4600A', 'Email': '#1a7a3c', 'Paid Search': '#b45309',
    'Unassigned': '#94a3b8',
  }

  const pr = getPeriodRange(period)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#94a3b8', fontSize: 14, fontFamily: 'Montserrat, sans-serif' }}>
      Loading analytics...
    </div>
  )

  if (error) return (
    <div style={{ padding: 32, textAlign: 'center', color: '#b91c1c', fontSize: 13, fontFamily: 'Montserrat, sans-serif' }}>
      {error} <button onClick={load} style={{ marginLeft: 8, color: '#1672A7', cursor: 'pointer', background: 'none', border: 'none', fontWeight: 700 }}>Retry</button>
    </div>
  )

  const syncedAt = snapshot?.synced_at
    ? new Date(snapshot.synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  const topDept = allDepts[0]
  const prevTopDept = prevDepts[0]

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', color: '#1a1a1a', padding: '0 0 40px' }}>

      {/* Period Selector */}
      <PeriodSelector
        period={period} setPeriod={setPeriod}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
        onApply={handleApplyCustom}
        prevLabel={pr?.prevLabel ?? null}
        hasPrevData={!!prevSnapshot}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '.6px' }}>Website Analytics</h2>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '3px 0 0', fontWeight: 500 }}>
            GA4 Property 527326342 - browardschools.com
            {syncedAt && <> &nbsp;&middot;&nbsp; Last synced {syncedAt}</>}
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          style={{ fontSize: 11, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1 }}>
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* No data for selected period */}
      {!snapshot && !loading && (
        <div style={{ background: '#fef3e2', border: '1px solid rgba(133,79,11,.2)', borderRadius: 10, padding: '16px 20px', marginBottom: 20, fontSize: 12, color: '#854F0B', fontWeight: 600 }}>
          No snapshot data found for {pr?.label || 'this period'}. Data syncs automatically each month. Try another period or click Sync Now.
        </div>
      )}

      {/* KPI Row */}
      {snapshot && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            {
              label: 'Top Dept Total Sessions',
              value: fmt(topDept?.sessions || 0),
              sub: topDept?.name || '-',
              delta: <KpiDelta cur={topDept?.sessions} prev={prevTopDept?.sessions} prevLabel={pr?.prevLabel} />,
            },
            {
              label: 'Departments Tracked',
              value: String(allDepts.length),
              sub: 'Aggregated this month',
              delta: null,
            },
            {
              label: 'Programs Tracked',
              value: String(allPrograms.length),
              sub: 'Programs & Services',
              delta: null,
            },
            {
              label: 'Top Source',
              value: Object.entries(snapshot.traffic_sources || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
              sub: 'By sessions',
              delta: null,
            },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94a3b8', marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: '#1a1a1a' }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.sub}</div>
              {k.delta}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        {([
          ['departments', 'Top Departments'],
          ['programs', 'Programs & Services'],
          ['sources', 'Traffic Sources'],
        ] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
              padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer',
              color: activeTab === tab ? '#1672A7' : '#94a3b8',
              borderBottom: activeTab === tab ? '2px solid #1672A7' : '2px solid transparent',
              marginBottom: -1
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Per-tab search (departments + programs only) */}
      {activeTab !== 'sources' && (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setDeptPage(0); setProgPage(0) }}
            placeholder={activeTab === 'departments' ? 'Search departments...' : 'Search programs & services...'}
            style={{ width: '100%', maxWidth: 360, fontSize: 12, fontFamily: 'Montserrat, sans-serif', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, outline: 'none', color: '#1a1a1a' }}
          />
          {q && (
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 10 }}>
              {(activeTab === 'departments' ? depts.length : programs.length)} match{(activeTab === 'departments' ? depts.length : programs.length) === 1 ? '' : 'es'}
            </span>
          )}
        </div>
      )}

      {/* Departments Tab */}
      {activeTab === 'departments' && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                {['#', 'Department', 'Total Sessions', 'Active Users', 'Engagement', 'Avg Duration', ''].map(h => (
                  <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', textAlign: h === '#' ? 'center' : 'left', padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {depts.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{allDepts.length === 0 ? 'No data yet. Click Sync Now.' : 'No departments match your search.'}</td></tr>
              )}
              {pagedDepts.map((row, i) => {
                const globalIdx = deptPage * deptPageSize + i + 1
                const key = row.slug || row.url_slug || row.path || String(i)
                const isExpanded = expandedDepts.has(key)
                const hasPages = row.pages && row.pages.length > 0
                // Find matching prev row for delta
                const prevRow = prevDepts.find(d => d.slug === row.slug || d.url_slug === row.url_slug)
                return (
                  <React.Fragment key={key}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f3f4f6', background: isExpanded ? '#f8fafc' : 'white' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>{globalIdx}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <a href={DEPT_LINK(row.url_slug)}
                          style={{ fontSize: 12, fontWeight: 700, color: '#1672A7', textDecoration: 'none' }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                          {row.name}
                        </a>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          /bcps-departments/{row.url_slug}
                          {hasPages && <span style={{ marginLeft: 6, color: '#1672A7' }}>{row.pages!.length} pages</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>{fmt(row.sessions)}</div>
                        {prevRow && <KpiDelta cur={row.sessions} prev={prevRow.sessions} prevLabel={pr?.prevLabel} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{fmt(row.active_users)}</td>
                      <td style={{ padding: '10px 14px', minWidth: 120 }}><EngagementBar rate={row.engagement_rate} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#555' }}>{fmtTime(row.avg_session_duration)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {hasPages && (
                          <button onClick={() => toggleDept(key)}
                            style={{ fontSize: 10, fontWeight: 700, color: '#1672A7', background: '#e8f1f8', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 5 }}>
                            {isExpanded ? 'Hide' : 'Drill down'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasPages && (
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td colSpan={7} style={{ padding: '0 14px 14px 40px', background: '#f8fafc' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                            <thead>
                              <tr>
                                {['Page Path', 'Sessions', 'Active Users', 'Engagement', 'Avg Duration'].map(h => (
                                  <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#b0b8c4', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {row.pages!.map((pg) => (
                                <tr key={pg.path} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '7px 10px' }}>
                                    <a href={`${BWS}${pg.path}`} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 11, color: '#1672A7', textDecoration: 'none', fontWeight: 600 }}
                                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                                      {pg.path}
                                    </a>
                                  </td>
                                  <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>{fmt(pg.sessions)}</td>
                                  <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600 }}>{fmt(pg.active_users)}</td>
                                  <td style={{ padding: '7px 10px', minWidth: 100 }}><EngagementBar rate={pg.engagement_rate} /></td>
                                  <td style={{ padding: '7px 10px', fontSize: 11, color: '#555' }}>{fmtTime(pg.avg_session_duration)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          {depts.length > 0 && (
            <PaginationBar total={depts.length} pageSize={deptPageSize} page={deptPage}
              onPageSize={setDeptPageSize} onPage={setDeptPage} />
          )}
        </div>
      )}

      {/* Programs & Services Tab */}
      {activeTab === 'programs' && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                {['#', 'Program / Service', 'Total Sessions', 'Active Users', 'Engagement', 'Avg Duration', ''].map(h => (
                  <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#94a3b8', textAlign: h === '#' ? 'center' : 'left', padding: '10px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{allPrograms.length === 0 ? 'No program data yet. Click Sync Now.' : 'No programs match your search.'}</td></tr>
              )}
              {pagedPrograms.map((row, i) => {
                const globalIdx = progPage * progPageSize + i + 1
                const key = row.name + row.path
                const isExpanded = expandedPrograms.has(key)
                const hasPages = row.pages && row.pages.length > 0
                return (
                  <React.Fragment key={key}>
                    <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #f3f4f6', background: isExpanded ? '#f8fafc' : 'white' }}>
                      <td style={{ padding: '10px 14px', fontSize: 11, color: '#94a3b8', fontWeight: 700, textAlign: 'center' }}>{globalIdx}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <a href={`${BWS}${row.path}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, fontWeight: 700, color: '#1672A7', textDecoration: 'none' }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                          {row.name}
                        </a>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          {row.path}
                          {hasPages && <span style={{ marginLeft: 6, color: '#1672A7' }}>{row.pages.length} pages</span>}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 800, color: '#1a1a1a' }}>{fmt(row.sessions)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{fmt(row.active_users)}</td>
                      <td style={{ padding: '10px 14px', minWidth: 120 }}><EngagementBar rate={row.engagement_rate} /></td>
                      <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#555' }}>{fmtTime(row.avg_session_duration)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {hasPages && (
                          <button onClick={() => toggleProgram(key)}
                            style={{ fontSize: 10, fontWeight: 700, color: '#1672A7', background: '#e8f1f8', border: 'none', cursor: 'pointer', padding: '3px 8px', borderRadius: 5 }}>
                            {isExpanded ? 'Hide' : 'Drill down'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasPages && (
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td colSpan={7} style={{ padding: '0 14px 14px 40px', background: '#f8fafc' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                            <thead>
                              <tr>
                                {['Page Path', 'Sessions', 'Active Users', 'Engagement', 'Avg Duration'].map(h => (
                                  <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#b0b8c4', textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {row.pages.map((pg) => (
                                <tr key={pg.path} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                  <td style={{ padding: '7px 10px' }}>
                                    <a href={`${BWS}${pg.path}`} target="_blank" rel="noopener noreferrer"
                                      style={{ fontSize: 11, color: '#1672A7', textDecoration: 'none', fontWeight: 600 }}
                                      onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                                      onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                                      {pg.path}
                                    </a>
                                  </td>
                                  <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700 }}>{fmt(pg.sessions)}</td>
                                  <td style={{ padding: '7px 10px', fontSize: 12, fontWeight: 600 }}>{fmt(pg.active_users)}</td>
                                  <td style={{ padding: '7px 10px', minWidth: 100 }}><EngagementBar rate={pg.engagement_rate} /></td>
                                  <td style={{ padding: '7px 10px', fontSize: 11, color: '#555' }}>{fmtTime(pg.avg_session_duration)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
          {programs.length > 0 && (
            <PaginationBar total={programs.length} pageSize={progPageSize} page={progPage}
              onPageSize={setProgPageSize} onPage={setProgPage} />
          )}
        </div>
      )}

      {/* Traffic Sources Tab */}
      {activeTab === 'sources' && (
        <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#94a3b8', marginBottom: 16 }}>
            Sessions by Channel {pr ? `(${pr.label})` : '(Last 30 Days)'}
          </div>
          {Object.entries(snapshot?.traffic_sources || {})
            .sort((a, b) => b[1] - a[1])
            .map(([source, sessions]) => {
              const pct = totalSources > 0 ? Math.round((sessions / totalSources) * 100) : 0
              const color = sourceColors[source] || '#94a3b8'
              const prevSessions = prevSnapshot?.traffic_sources?.[source]
              const prevPct = prevTotalSources > 0 && prevSessions ? Math.round((prevSessions / prevTotalSources) * 100) : null
              return (
                <div key={source} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a' }}>{source}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {prevPct !== null && (
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                          prev: {prevPct}%
                        </span>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>{fmt(sessions)} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({pct}%)</span></span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                    <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
                    </div>
                    {prevPct !== null && (
                      <div style={{ height: 4, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ width: `${prevPct}%`, height: '100%', background: color, opacity: 0.35, borderRadius: 999 }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          {prevSnapshot && (
            <div style={{ marginTop: 16, fontSize: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 16, height: 8, background: '#94a3b8', borderRadius: 2, opacity: 0.5 }} />
              <span>Lighter bar = {pr?.prevLabel || 'previous period'}</span>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 16, textAlign: 'right' }}>
        Data: GA4 Property 527326342{pr ? ` - ${pr.label}` : ' - Last 30 days'}. Departments and programs aggregated across all sub-pages.
      </p>
    </div>
  )
}
