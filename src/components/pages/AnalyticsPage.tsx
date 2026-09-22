'use client'
import { createClient } from '@/lib/supabase'

// Session token for the API calls below. These routes verify the caller
// server-side as of 2026-09-15 (they previously had no auth at all).
const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

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
  // Set by bcps-ga4-sync v17+. false means these page views sit under
  // /bcps-departments/ but no department row claims them, so the bucket is a
  // district page rather than a department profile.
  matched?: boolean
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

interface CampaignPage {
  path: string
  unique_visitors: number
  page_views: number
  sessions: number
  engagement_seconds: number
  avg_time_seconds: number
}

interface CampaignDay {
  date: string
  unique_visitors: number
  page_views: number
  sessions: number
  engagement_seconds: number
}

interface CampaignDimension {
  name: string
  sessions: number
  unique_visitors: number
  page_views: number
}

interface CampaignMetrics {
  period: string
  unique_visitors: number | null
  page_views: number | null
  avg_time_seconds: number | null
  sessions: number | null
  engagement_seconds: number | null
  pages: CampaignPage[]
  synced_at: string
  // Added 2026-09-22 for the campaign report.
  new_users: number | null
  engaged_sessions: number | null
  engagement_rate: number | null
  channels: CampaignDimension[]
  devices: CampaignDimension[]
}

interface Campaign {
  id: string
  name: string
  slug: string
  page_paths: string[]
  primary_url: string | null
  description: string | null
  owner: string | null
  status: 'active' | 'archived'
  start_date: string | null
  end_date: string | null
  include_subpages: boolean
  metrics: CampaignMetrics | null
  daily: CampaignDay[]
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

// Links by the DEPARTMENT TABLE slug, which is what the departments page
// resolves (MembersPage and DashboardPage both pass department.slug). This
// used to pass url_slug, the GA4 URL segment, which only coincides with the
// table slug when a department's page happens to be named after its record -
// Instructional Innovation & Digital Learning sat at /innovative-learning, so
// its Analytics link pointed at a department that does not exist. Falls back
// to url_slug for buckets that match no department row.
const DEPT_LINK = (row: { slug?: string; url_slug: string }) =>
  `/?page=departments&dept=${row.slug || row.url_slug}`

// ─── Campaign trend chart ─────────────────────────────────────────────────────
//
// Two series, one y-axis: page views and unique visitors are both counts, so
// they share a scale honestly. Average time on page is seconds and is
// deliberately NOT plotted here - a second y-scale is the one thing a chart
// like this must never do.
//
// Colors are BCPS Blue #1672A7 and BCPS Orange #C55326, both official primary
// brand colors (brand_context.bcps, sourced from the District's Color Palette
// PDF). Validated as a categorical pair against a white surface rather than
// eyeballed: worst-case CVD separation dE 18.6 (protan) against a target of 8,
// normal-vision dE 27.3 against a floor of 15, both above 3:1 contrast.
const SERIES = {
  views:    { key: 'page_views'      as const, label: 'Page views',      color: '#1672A7' },
  visitors: { key: 'unique_visitors' as const, label: 'Unique visitors', color: '#C55326' },
}

const INK        = '#1a1a1a'
const INK_MUTED  = '#94a3b8'
const GRID       = '#e5e7eb'
const SURFACE    = '#ffffff'

// Ticks always reach AT OR ABOVE the series maximum, so the top gridline is a
// real ceiling. Stopping at the last tick below max lets the peak overflow the
// plot - caught by rendering the real data: peak 156 against a top tick of 150.
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + step * 0.001; v += step) ticks.push(Math.round(v))
  return ticks
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function CampaignTrend({ daily, campaignName }: { daily: CampaignDay[]; campaignName: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  if (!daily || daily.length < 2) {
    return (
      <div style={{ padding: '18px 0 4px', fontSize: 11.5, color: INK_MUTED }}>
        Not enough history to chart yet. The trend appears once this campaign has at
        least two days of data.
      </div>
    )
  }

  // Geometry. viewBox units; the SVG scales to its container width.
  const W = 720, H = 200
  const padL = 44, padR = 16, padT = 16, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxVal = Math.max(...daily.map(d => Math.max(d.page_views, d.unique_visitors)), 1)
  const ticks = niceTicks(maxVal)
  const yMax = ticks[ticks.length - 1]

  const x = (i: number) => padL + (daily.length === 1 ? plotW / 2 : (i / (daily.length - 1)) * plotW)
  const y = (v: number) => padT + plotH - (v / yMax) * plotH

  // The final day is today, still in progress, so its point is always lower
  // than it will end up. Drawn dashed and hollow rather than letting a partial
  // day read as a collapse in traffic.
  const lastIdx = daily.length - 1
  const solid = daily.slice(0, lastIdx)

  const path = (rows: CampaignDay[], key: 'page_views' | 'unique_visitors', offset = 0) =>
    rows.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i + offset).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ')

  // Peak of the headline series, direct-labeled. Labelling the extreme rather
  // than the line ends, because on any given day the two series can converge at
  // the right edge and stacked end-labels detach from their lines.
  const peakIdx = daily.reduce((best, d, i) => (d.page_views > daily[best].page_views ? i : best), 0)

  const active = hover ?? null

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f3f4f6' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED }}>
          Traffic over time
        </div>
        {/* Legend - always present for two series, keyed by a line stroke, text
            in ink tokens rather than the series color. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {Object.values(SERIES).map(s => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', fontWeight: 600 }}>
              <svg width="14" height="4" aria-hidden="true"><rect width="14" height="3" rx="1.5" fill={s.color} /></svg>
              {s.label}
            </span>
          ))}
          <button onClick={() => setShowTable(v => !v)}
            style={{ fontSize: 10, fontWeight: 700, color: '#1672A7', background: '#e8f1f8', border: 'none', cursor: 'pointer', padding: '3px 9px', borderRadius: 5 }}>
            {showTable ? 'Hide table' : 'Table'}
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', overflow: 'visible', touchAction: 'none' }}
        role="img"
        aria-label={`Daily page views and unique visitors for ${campaignName}, ${shortDate(daily[0].date)} to ${shortDate(daily[lastIdx].date)}`}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setHover(h => Math.min((h ?? -1) + 1, lastIdx)) }
          if (e.key === 'ArrowLeft')  { e.preventDefault(); setHover(h => Math.max((h ?? daily.length) - 1, 0)) }
          if (e.key === 'Escape') setHover(null)
        }}
        onBlur={() => setHover(null)}
      >
        {/* Gridlines: hairline, solid, recessive. Y ticks carry the values that
            are not directly labeled. */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize="9.5" fill={INK_MUTED} fontWeight="600">
              {t.toLocaleString('en-US')}
            </text>
          </g>
        ))}

        {/* X labels: first, middle, last only - a label per day is unreadable. */}
        {[0, Math.floor(lastIdx / 2), lastIdx].map(i => (
          <text key={i} x={x(i)} y={H - 8}
            textAnchor={i === 0 ? 'start' : i === lastIdx ? 'end' : 'middle'}
            fontSize="9.5" fill={INK_MUTED} fontWeight="600">
            {shortDate(daily[i].date)}
          </text>
        ))}

        {/* Series lines: 2px, round join and cap. The final segment is dashed
            because that day is still in progress. */}
        {Object.values(SERIES).map(s => (
          <g key={s.key}>
            <path d={path(solid, s.key)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path
              d={`M${x(lastIdx - 1).toFixed(1)},${y(daily[lastIdx - 1][s.key]).toFixed(1)} L${x(lastIdx).toFixed(1)},${y(daily[lastIdx][s.key]).toFixed(1)}`}
              fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" opacity="0.75"
            />
          </g>
        ))}

        {/* Peak marker on the headline series, with a 2px surface ring. */}
        <circle cx={x(peakIdx)} cy={y(daily[peakIdx].page_views)} r="4"
          fill={SERIES.views.color} stroke={SURFACE} strokeWidth="2" />
        <text x={x(peakIdx)} y={y(daily[peakIdx].page_views) - 10} textAnchor="middle"
          fontSize="10.5" fontWeight="800" fill={INK}>
          {daily[peakIdx].page_views.toLocaleString('en-US')}
        </text>

        {/* Hollow end marker: partial day, not a real drop. */}
        <circle cx={x(lastIdx)} cy={y(daily[lastIdx].page_views)} r="3.5"
          fill={SURFACE} stroke={SERIES.views.color} strokeWidth="2" />

        {/* Crosshair. The reader aims at a date, not at a 2px line. */}
        {active !== null && (
          <g pointerEvents="none">
            <line x1={x(active)} x2={x(active)} y1={padT} y2={padT + plotH} stroke={INK_MUTED} strokeWidth="1" />
            {Object.values(SERIES).map(s => (
              <circle key={s.key} cx={x(active)} cy={y(daily[active][s.key])} r="4"
                fill={s.color} stroke={SURFACE} strokeWidth="2" />
            ))}
          </g>
        )}

        {/* Nearest-X hit layer, so the pointer only has to be closest. */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent"
          onPointerMove={e => {
            const r = (e.target as SVGRectElement).getBoundingClientRect()
            const ratio = (e.clientX - r.left) / r.width
            setHover(Math.max(0, Math.min(lastIdx, Math.round(ratio * lastIdx))))
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>

      {/* Tooltip readout. Values lead, series names follow. Rendered as real
          text nodes by React, never as an HTML string. */}
      <div style={{ minHeight: 34, marginTop: 4 }}>
        {active !== null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 11.5 }}>
            <span style={{ fontWeight: 800, color: INK }}>
              {shortDate(daily[active].date)}
              {active === lastIdx && <span style={{ fontWeight: 600, color: INK_MUTED }}> (today, partial)</span>}
            </span>
            {Object.values(SERIES).map(s => (
              <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="4" aria-hidden="true"><rect width="12" height="3" rx="1.5" fill={s.color} /></svg>
                <strong style={{ color: INK, fontWeight: 800 }}>{daily[active][s.key].toLocaleString('en-US')}</strong>
                <span style={{ color: INK_MUTED }}>{s.label.toLowerCase()}</span>
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 10.5, color: INK_MUTED }}>
            Hover or focus the chart and use the arrow keys to read any day. The last
            point is today and still counting.
          </div>
        )}
      </div>

      {showTable && (
        <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8, border: '1px solid ' + GRID, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Page views', 'Unique visitors'].map((h, i) => (
                  <th key={h} style={{ position: 'sticky', top: 0, background: '#fafafa', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#b0b8c4', textAlign: i === 0 ? 'left' : 'right', padding: '6px 10px', borderBottom: '1px solid ' + GRID }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {daily.map((d, i) => (
                <tr key={d.date} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '5px 10px', fontSize: 11, color: '#555' }}>
                    {shortDate(d.date)}{i === lastIdx ? ' (partial)' : ''}
                  </td>
                  <td style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 700, textAlign: 'right' }}>{d.page_views.toLocaleString('en-US')}</td>
                  <td style={{ padding: '5px 10px', fontSize: 11.5, fontWeight: 600, textAlign: 'right' }}>{d.unique_visitors.toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Rundown ──────────────────────────────────────────────────────────────────
//
// Plain-language read of what the numbers say, for someone who runs marketing
// rather than analytics.
//
// This is DERIVED, never written prose and never generated text. Every sentence
// is computed from the figures on the same screen, so it cannot drift from them
// and cannot invent a claim about the District's data. If a number is missing,
// the sentence that needs it is dropped rather than hedged.
type RundownNote = { title: string; body: string; tone: 'good' | 'watch' | 'neutral' }

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0
}

function buildRundown(c: Campaign): { headline: string | null; notes: RundownNote[] } {
  const m = c.metrics
  const daily = c.daily ?? []
  if (!m || !m.page_views) return { headline: null, notes: [] }

  const notes: RundownNote[] = []
  const views = m.page_views ?? 0
  const visitors = m.unique_visitors ?? 0
  const sessions = m.sessions ?? 0

  const headline = daily.length
    ? `${visitors.toLocaleString('en-US')} people opened this page ${views.toLocaleString('en-US')} times over the last ${daily.length} days.`
    : `${visitors.toLocaleString('en-US')} people opened this page ${views.toLocaleString('en-US')} times.`

  // Trend. The last complete day is used as the right edge - today is partial
  // and would always read as a decline.
  const complete = daily.slice(0, -1)
  if (complete.length >= 14) {
    const last7 = complete.slice(-7).reduce((s, d) => s + d.page_views, 0)
    const prev7 = complete.slice(-14, -7).reduce((s, d) => s + d.page_views, 0)
    if (prev7 > 0) {
      const change = Math.round(((last7 - prev7) / prev7) * 100)
      const dir = change > 0 ? 'up' : change < 0 ? 'down' : 'level'
      notes.push({
        title: 'Which way it is going',
        tone: change > 5 ? 'good' : change < -15 ? 'watch' : 'neutral',
        body: change === 0
          ? `The last seven days matched the seven before them, at ${last7.toLocaleString('en-US')} views each.`
          : `Views are ${dir} ${Math.abs(change)}% over the last seven days, ${last7.toLocaleString('en-US')} against ${prev7.toLocaleString('en-US')} the week before. Today is left out of this because it is still counting.`,
      })
    }
  }

  // Peak day.
  if (daily.length) {
    const peak = daily.reduce((b, d) => (d.page_views > b.page_views ? d : b), daily[0])
    if (peak.page_views > 0) {
      notes.push({
        title: 'Busiest day',
        tone: 'neutral',
        body: `${shortDate(peak.date)} was the high point, with ${peak.page_views.toLocaleString('en-US')} views from ${peak.unique_visitors.toLocaleString('en-US')} people. If something went out that day, this is what it did.`,
      })
    }
  }

  // Where people came from - the most actionable cut.
  const channels = (m.channels ?? []).filter(ch => ch.sessions > 0)
  if (channels.length) {
    const top = channels[0]
    const share = pct(top.sessions, sessions)
    const named = channels.slice(0, 3)
      .map(ch => `${ch.name} ${pct(ch.sessions, sessions)}%`)
      .join(', ')
    notes.push({
      title: 'How people found it',
      tone: 'neutral',
      body: `${named}. ${top.name} is the biggest single source at ${share}% of visits (${top.sessions.toLocaleString('en-US')} of ${sessions.toLocaleString('en-US')}).${
        top.name === 'Organic Search'
          ? ' That means people are searching for this rather than being sent to it, so the page is doing the work, not a push.'
          : ''
      }`,
    })

    // A channel that should be delivering and is not is worth saying out loud.
    const email = channels.find(ch => ch.name.toLowerCase().includes('email'))
    const emailSessions = email?.sessions ?? 0
    if (emailSessions <= Math.max(5, sessions * 0.01)) {
      notes.push({
        title: 'Email is not showing up',
        tone: 'watch',
        body: `Email accounts for ${emailSessions} of ${sessions.toLocaleString('en-US')} visits. If this campaign is being emailed out, the links are not being tagged in a way analytics can see, so that effort is invisible here and may be landing in Direct instead.`,
      })
    }
  }

  // Device split.
  const devices = (m.devices ?? []).filter(d => d.sessions > 0)
  if (devices.length) {
    const total = devices.reduce((s, d) => s + d.sessions, 0)
    const mobile = devices.find(d => d.name.toLowerCase() === 'mobile')
    const mobileShare = pct(mobile?.sessions ?? 0, total)
    if (mobile) {
      notes.push({
        title: 'What they are reading it on',
        tone: mobileShare >= 60 ? 'watch' : 'neutral',
        body: `${mobileShare}% arrived on a phone${mobileShare >= 60 ? ', so the phone layout is the real layout here' : ''}. ${devices.map(d => `${d.name.charAt(0).toUpperCase()}${d.name.slice(1)} ${pct(d.sessions, total)}%`).join(', ')}.`,
      })
    }
  }

  // Reach versus repetition.
  if (m.new_users != null && visitors > 0) {
    const newShare = pct(m.new_users, visitors)
    notes.push({
      title: 'New faces or the same ones',
      tone: newShare >= 50 ? 'good' : 'neutral',
      body: `${newShare}% of visitors were new to the site (${m.new_users.toLocaleString('en-US')} of ${visitors.toLocaleString('en-US')}). ${
        newShare >= 50
          ? 'The campaign is reaching beyond the people who already follow the District.'
          : 'Most of this traffic is people who have been here before, so it is holding an existing audience more than widening it.'
      }`,
    })
  }

  // Did they actually read it.
  if (m.engagement_rate != null && sessions > 0) {
    const rate = Math.round(m.engagement_rate * 100)
    notes.push({
      title: 'Did they stay',
      tone: rate >= 50 ? 'good' : 'watch',
      body: `${rate}% of visits counted as engaged, meaning the visitor stayed past ten seconds, viewed another page, or did something on the page. The other ${100 - rate}% opened it and left. Average time on the page was ${fmtTime(m.avg_time_seconds ?? 0)}.`,
    })
  }

  return { headline, notes }
}

// ─── Campaigns ────────────────────────────────────────────────────────────────
function CampaignForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<Campaign>
  onSave: (payload: Record<string, unknown>) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [paths, setPaths] = useState((initial?.page_paths ?? []).join('\n'))
  const [primaryUrl, setPrimaryUrl] = useState(initial?.primary_url ?? '')
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')

  const input: React.CSSProperties = {
    width: '100%', fontSize: 12, fontFamily: 'Montserrat, sans-serif',
    padding: '8px 10px', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 7,
    outline: 'none', color: '#1a1a1a', background: '#fff',
  }
  const label: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.5px', color: '#94a3b8', marginBottom: 4, display: 'block',
  }

  return (
    <div style={{ background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
        <div>
          <label style={label} htmlFor="camp-name">Campaign name</label>
          <input id="camp-name" style={input} value={name} onChange={e => setName(e.target.value)} placeholder="Referendum 2026" />
        </div>
        <div>
          <label style={label} htmlFor="camp-url">Link you share</label>
          <input id="camp-url" style={input} value={primaryUrl} onChange={e => setPrimaryUrl(e.target.value)} placeholder="https://www.browardschools.com/referendum2026" />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={label} htmlFor="camp-paths">Pages to count (one per line)</label>
        <textarea id="camp-paths" style={{ ...input, minHeight: 68, resize: 'vertical' }} value={paths}
          onChange={e => setPaths(e.target.value)}
          placeholder={'/referendum2026\n/school-board/referendum-2026'} />
        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 5, lineHeight: 1.5 }}>
          Paste a full URL or a path; either works. Add every address the campaign lives at.
          A vanity link usually redirects, and analytics only records where the visitor
          actually landed, so listing just the short link can read as zero. Sub-pages are
          included automatically.
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={label} htmlFor="camp-owner">Owner (optional)</label>
          <input id="camp-owner" style={input} value={owner} onChange={e => setOwner(e.target.value)} placeholder="Who runs this" />
        </div>
        <div>
          <label style={label} htmlFor="camp-desc">Notes (optional)</label>
          <input id="camp-desc" style={input} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this campaign is" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          disabled={saving || !name.trim() || !paths.trim()}
          onClick={() => onSave({
            name, page_paths: paths, primary_url: primaryUrl,
            owner, description,
            ...(initial?.id ? { id: initial.id } : {}),
          })}
          style={{
            fontSize: 11, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none',
            borderRadius: 7, padding: '8px 18px',
            cursor: saving || !name.trim() || !paths.trim() ? 'not-allowed' : 'pointer',
            opacity: saving || !name.trim() || !paths.trim() ? 0.5 : 1,
          }}>
          {saving ? 'Saving...' : initial?.id ? 'Save changes' : 'Add campaign'}
        </button>
        <button onClick={onCancel}
          style={{ fontSize: 11, fontWeight: 700, background: 'none', color: '#94a3b8', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 7, padding: '8px 16px', cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// Sparkline for a tile. Same series color as the full chart's headline series,
// no axes or labels - it is a shape, not a reading surface. The full chart
// inside the campaign carries the values.
function Sparkline({ daily }: { daily: CampaignDay[] }) {
  if (!daily || daily.length < 2) {
    return <div style={{ height: 34, display: 'flex', alignItems: 'center', fontSize: 10, color: INK_MUTED }}>No history yet</div>
  }
  const W = 240, H = 34, pad = 2
  const max = Math.max(...daily.map(d => d.page_views), 1)
  const x = (i: number) => pad + (i / (daily.length - 1)) * (W - pad * 2)
  const y = (v: number) => pad + (1 - v / max) * (H - pad * 2)
  const line = daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.page_views).toFixed(1)}`).join(' ')
  const area = `${line} L${x(daily.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }} aria-hidden="true">
      <path d={area} fill={SERIES.views.color} opacity="0.1" />
      <path d={line} fill="none" stroke={SERIES.views.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function CampaignTile({ campaign, onOpen }: { campaign: Campaign; onOpen: () => void }) {
  const m = campaign.metrics
  const stat = (label: string, value: string) => (
    <div key={label} style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: INK_MUTED, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1 }}>{value}</div>
    </div>
  )
  return (
    <button onClick={onOpen}
      style={{
        textAlign: 'left', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10,
        padding: '16px 18px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', width: '100%',
        display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow .12s, border-color .12s',
      }}
      onMouseOver={e => { e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,.08)'; e.currentTarget.style.borderColor = 'rgba(22,114,167,.4)' }}
      onMouseOut={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)' }}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{campaign.name}</div>
        <div style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {campaign.primary_url || campaign.page_paths[0] || ''}
        </div>
      </div>
      <Sparkline daily={campaign.daily} />
      <div style={{ display: 'flex', gap: 12, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
        {stat('Visitors', fmt(m?.unique_visitors ?? 0))}
        {stat('Views', fmt(m?.page_views ?? 0))}
        {stat('Avg. time', fmtTime(m?.avg_time_seconds ?? 0))}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1672A7', letterSpacing: '.4px' }}>
        View report &rarr;
      </div>
    </button>
  )
}

// A horizontal share bar for a dimension breakdown (channels, devices).
// Sequential single hue, more-is-darker is not needed here because the rows are
// already ordered - one hue at one step, with the value read from the label.
function ShareRows({ rows, total }: { rows: CampaignDimension[]; total: number }) {
  if (!rows.length) return <div style={{ fontSize: 11.5, color: INK_MUTED, padding: '8px 0' }}>No breakdown recorded for this period.</div>
  return (
    <div>
      {rows.map(r => {
        const p = pct(r.sessions, total)
        return (
          <div key={r.name} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: INK, textTransform: 'capitalize' }}>{r.name}</span>
              <span style={{ fontSize: 11.5, color: '#555', fontWeight: 600 }}>
                {r.sessions.toLocaleString('en-US')} <span style={{ color: INK_MUTED, fontWeight: 500 }}>({p}%)</span>
              </span>
            </div>
            <div style={{ height: 8, background: '#eef2f5', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${p}%`, height: '100%', background: SERIES.views.color, borderRadius: 999 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CampaignDetail({
  campaign, onBack, onEdit, onArchive, onCopy,
}: {
  campaign: Campaign
  onBack: () => void
  onEdit: () => void
  onArchive: () => void
  onCopy: (text: string) => void
}) {
  const [tab, setTab] = useState<'rundown' | 'traffic' | 'sources' | 'pages'>('rundown')
  const m = campaign.metrics
  const link = campaign.primary_url || (campaign.page_paths[0] ? BWS + campaign.page_paths[0] : null)
  const { headline, notes } = buildRundown(campaign)

  const summary = [
    campaign.name,
    link || '',
    '',
    `Unique visitors: ${m?.unique_visitors ?? 0}`,
    `Page views: ${m?.page_views ?? 0}`,
    `Average time on page: ${fmtTime(m?.avg_time_seconds ?? 0)}`,
    m?.engagement_rate != null ? `Engaged visits: ${Math.round(m.engagement_rate * 100)}%` : '',
    m?.new_users != null ? `New visitors: ${m.new_users}` : '',
    (m?.channels ?? []).length ? `Top source: ${m!.channels[0].name}` : '',
    '',
    m ? `Source: GA4, ${m.period}, last 30 days. Pulled ${new Date(m.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No data pulled yet.',
  ].filter(Boolean).join('\n')

  const sessions = m?.sessions ?? 0
  const deviceTotal = (m?.devices ?? []).reduce((s, d) => s + d.sessions, 0)

  const stat = (label: string, value: string, note: string) => (
    <div key={label} style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: INK }}>{value}</div>
      <div style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 5 }}>{note}</div>
    </div>
  )

  const toneColor = { good: '#16750C', watch: '#854F0B', neutral: '#1672A7' }
  const toneBg    = { good: 'rgba(22,117,12,.06)', watch: '#fef3e2', neutral: 'rgba(22,114,167,.05)' }

  return (
    <div>
      <button onClick={onBack}
        style={{ fontSize: 11, fontWeight: 700, color: '#1672A7', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px' }}>
        &larr; All campaigns
      </button>

      <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>{campaign.name}</div>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11.5, color: '#1672A7', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>
                {link}
              </a>
            )}
            {campaign.description && <div style={{ fontSize: 11, color: INK_MUTED, marginTop: 4 }}>{campaign.description}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onCopy(summary)}
              style={{ fontSize: 10.5, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              Copy for team
            </button>
            <button onClick={onEdit}
              style={{ fontSize: 10.5, fontWeight: 700, background: '#e8f1f8', color: '#1672A7', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              Edit
            </button>
            <button onClick={onArchive}
              style={{ fontSize: 10.5, fontWeight: 700, background: 'none', color: INK_MUTED, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>
              Archive
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, paddingTop: 14, borderTop: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
          {stat('Unique Visitors', fmt(m?.unique_visitors ?? 0), 'People, counted once')}
          {stat('Page Views', fmt(m?.page_views ?? 0), 'Total views')}
          {stat('Avg. Time on Page', fmtTime(m?.avg_time_seconds ?? 0), 'Engagement per view')}
          {m?.engagement_rate != null && stat('Engaged Visits', `${Math.round(m.engagement_rate * 100)}%`, 'Stayed, not bounced')}
          {m?.new_users != null && stat('New Visitors', `${pct(m.new_users, m.unique_visitors ?? 0)}%`, 'First time on the site')}
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 18, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          {([
            ['rundown', 'Rundown'],
            ['traffic', 'Traffic'],
            ['sources', 'Sources & Devices'],
            ['pages', 'Pages'],
          ] as const).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
                padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer',
                color: tab === t ? '#1672A7' : INK_MUTED,
                borderBottom: tab === t ? '2px solid #1672A7' : '2px solid transparent',
                marginBottom: -1,
              }}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'rundown' && (
          <div style={{ paddingTop: 16 }}>
            {headline ? (
              <>
                <p style={{ fontSize: 14.5, fontWeight: 700, color: INK, margin: '0 0 16px', lineHeight: 1.5 }}>{headline}</p>
                {notes.map(n => (
                  <div key={n.title} style={{ background: toneBg[n.tone], borderLeft: `3px solid ${toneColor[n.tone]}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: toneColor[n.tone], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{n.title}</div>
                    <div style={{ fontSize: 12.5, color: '#333', lineHeight: 1.6 }}>{n.body}</div>
                  </div>
                ))}
                <p style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 14, lineHeight: 1.6 }}>
                  Every line above is calculated from the same figures shown on the other
                  tabs, so it always matches them. It is not an opinion and it is not
                  written by hand.
                </p>
              </>
            ) : (
              <div style={{ fontSize: 12, color: INK_MUTED, padding: '12px 0' }}>
                No data pulled yet. Click Sync Now and the rundown writes itself from the numbers.
              </div>
            )}
          </div>
        )}

        {tab === 'traffic' && <CampaignTrend daily={campaign.daily} campaignName={campaign.name} />}

        {tab === 'sources' && (
          <div style={{ paddingTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 28 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 12 }}>
                How people arrived
              </div>
              <ShareRows rows={m?.channels ?? []} total={sessions} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 12 }}>
                What they used
              </div>
              <ShareRows rows={m?.devices ?? []} total={deviceTotal} />
            </div>
          </div>
        )}

        {tab === 'pages' && (
          <div style={{ paddingTop: 12 }}>
            {(m?.pages ?? []).length ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Page Path', 'Unique Visitors', 'Page Views', 'Avg. Time'].map((h, i) => (
                      <th key={h} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#b0b8c4', textAlign: i === 0 ? 'left' : 'right', padding: '8px 10px', borderBottom: '1px solid ' + GRID }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m!.pages.map(pg => (
                    <tr key={pg.path} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '8px 10px' }}>
                        <a href={`${BWS}${pg.path}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11.5, color: '#1672A7', textDecoration: 'none', fontWeight: 600 }}>
                          {pg.path}
                        </a>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt(pg.unique_visitors)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmt(pg.page_views)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11.5, color: '#555', textAlign: 'right' }}>{fmtTime(pg.avg_time_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 12, color: INK_MUTED, padding: '12px 0' }}>No page data yet.</div>
            )}
            <div style={{ fontSize: 10, color: '#b0b8c4', marginTop: 12 }}>
              Counting: {campaign.page_paths.join('  ·  ')}
            </div>
          </div>
        )}

        <div style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 16, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
          {m
            ? <>GA4 {m.period} · last 30 days · synced {new Date(m.synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</>
            : <>No data pulled yet. Click Sync Now.</>}
        </div>
      </div>
    </div>
  )
}



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
  const [activeTab, setActiveTab] = useState<'campaigns' | 'departments' | 'programs' | 'sources'>('departments')

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null)
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [showCampaignForm, setShowCampaignForm] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null)
  const [savingCampaign, setSavingCampaign] = useState(false)

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
      const res = await fetch(url, { headers: await authHeaders() })
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

  const loadCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    try {
      const res = await fetch('/api/bcps/campaigns', { headers: await authHeaders() })
      const data = await res.json()
      setCampaigns(data.campaigns ?? [])
    } catch {
      setCampaigns([])
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  const saveCampaign = useCallback(async (payload: Record<string, unknown>) => {
    setSavingCampaign(true)
    try {
      const editing = !!payload.id
      const res = await fetch('/api/bcps/campaigns', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setShowCampaignForm(false)
      setEditingCampaign(null)
      await loadCampaigns()
      onShowToast(editing ? 'Campaign updated. Click Sync Now to pull its numbers.' : 'Campaign added. Click Sync Now to pull its numbers.')
    } catch (e) {
      onShowToast(e instanceof Error ? e.message : 'Could not save campaign.')
    } finally {
      setSavingCampaign(false)
    }
  }, [loadCampaigns, onShowToast])

  const archiveCampaign = useCallback(async (c: Campaign) => {
    if (!window.confirm(`Archive "${c.name}"? It stops syncing and drops off this tab. Its history is kept.`)) return
    try {
      const res = await fetch('/api/bcps/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: c.id, status: 'archived' }),
      })
      if (!res.ok) throw new Error('Archive failed')
      await loadCampaigns()
      onShowToast('Campaign archived.')
    } catch {
      onShowToast('Could not archive campaign.')
    }
  }, [loadCampaigns, onShowToast])

  const copyCampaign = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => onShowToast('Copied. Paste it straight into an email or Teams.'))
      .catch(() => onShowToast('Could not copy to clipboard.'))
  }, [onShowToast])

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
      const res = await fetch('/api/bcps/analytics', { method: 'POST', headers: await authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      await Promise.all([load(), loadCampaigns()])
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
          ['campaigns', 'Campaigns'],
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

      {/* Campaigns Tab */}
      {activeTab === 'campaigns' && (() => {
        const open = openCampaignId ? campaigns.find(c => c.id === openCampaignId) ?? null : null

        if (open) {
          return (
            <CampaignDetail
              campaign={open}
              onBack={() => setOpenCampaignId(null)}
              onEdit={() => { setEditingCampaign(open); setShowCampaignForm(true); setOpenCampaignId(null) }}
              onArchive={() => { archiveCampaign(open); setOpenCampaignId(null) }}
              onCopy={copyCampaign}
            />
          )
        }

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 11.5, color: '#94a3b8', margin: 0, maxWidth: 620, lineHeight: 1.6 }}>
                Track a specific push by the page it lives on. Open a campaign for its full
                report: a plain-language rundown of what the numbers mean, the traffic
                trend, where people came from, and what they read it on.
              </p>
              {!showCampaignForm && (
                <button onClick={() => { setEditingCampaign(null); setShowCampaignForm(true) }}
                  style={{ fontSize: 11, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', flexShrink: 0 }}>
                  Add campaign
                </button>
              )}
            </div>

            {showCampaignForm && (
              <CampaignForm
                key={editingCampaign?.id ?? 'new'}
                initial={editingCampaign ?? undefined}
                saving={savingCampaign}
                onSave={saveCampaign}
                onCancel={() => { setShowCampaignForm(false); setEditingCampaign(null) }}
              />
            )}

            {campaignsLoading && (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading campaigns...</div>
            )}

            {!campaignsLoading && campaigns.length === 0 && !showCampaignForm && (
              <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }}>No campaigns yet</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8' }}>Add one with the page it lives on and its numbers appear here after the next sync.</div>
              </div>
            )}

            {!campaignsLoading && campaigns.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
                {campaigns.map(c => (
                  <CampaignTile key={c.id} campaign={c} onOpen={() => setOpenCampaignId(c.id)} />
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Per-tab search (departments + programs only) */}
      {(activeTab === 'departments' || activeTab === 'programs') && (
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
                        <a href={DEPT_LINK(row)}
                          style={{ fontSize: 12, fontWeight: 700, color: '#1672A7', textDecoration: 'none' }}
                          onMouseOver={e => (e.currentTarget.style.textDecoration = 'underline')}
                          onMouseOut={e => (e.currentTarget.style.textDecoration = 'none')}>
                          {row.name}
                        </a>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                          {row.path || `/bcps-departments/${row.url_slug}`}
                          {row.matched === false && (
                            <span style={{ marginLeft: 6, color: '#b45309', fontWeight: 600 }}>no department record</span>
                          )}
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
