'use client'
// src/components/bcps/CampaignReport.tsx
//
// The campaign report body, shared by the shareable document page at
// /campaigns/[slug]. Lives here rather than inside AnalyticsPage so the
// document and the Analytics tab can never drift apart: there is one
// implementation of the chart, the rundown and the breakdowns.
//
// Everything here is presentational. Access is decided before this renders,
// server-side, by src/lib/bcps-campaign-access.ts.
import React, { useState } from 'react'

const BWS = 'https://www.browardschools.com'
const DISTRICT_GA4_PROPERTY = '527326342'

// A campaign on browardschools.com links its paths back to browardschools.com;
// one on another District site (browardschools.ai) has to link to that site
// instead, or every row in the Pages tab points at a page that does not exist.
// primary_url already carries the site, so it decides.
function siteOrigin(campaign: Campaign): string {
  if (campaign.primary_url) {
    try { return new URL(campaign.primary_url).origin } catch { /* fall through */ }
  }
  return BWS
}

// The window a campaign's numbers cover. start_date set = measured from that
// day (see bcps-ga4-sync); otherwise the rolling 30 days. Formatted in UTC so
// a YYYY-MM-DD date cannot slip a day between server and browser.
export function fmtDate(iso: string, month: 'long' | 'short' = 'long') {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month, day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function windowLabel(c: { start_date: string | null }, month: 'long' | 'short' = 'short') {
  return c.start_date ? `since ${fmtDate(c.start_date, month)}` : 'last 30 days'
}

export function fmt(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}

export function fmtTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export interface CampaignPage {
  path: string
  unique_visitors: number
  page_views: number
  sessions: number
  engagement_seconds: number
  avg_time_seconds: number
}

export interface CampaignDay {
  date: string
  unique_visitors: number
  page_views: number
  sessions: number
  engagement_seconds: number
}

export interface CampaignDimension {
  name: string
  sessions: number
  unique_visitors: number
  page_views: number
}

export interface CampaignMetrics {
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

export interface Campaign {
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
  is_public: boolean
  // NULL = the District property. See the bcps_campaigns.ga4_property_id comment.
  ga4_property_id?: string | null
  metrics: CampaignMetrics | null
  daily: CampaignDay[]
}


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
export const SERIES = {
  views:    { key: 'page_views'      as const, label: 'Page views',      color: '#1672A7' },
  visitors: { key: 'unique_visitors' as const, label: 'Unique visitors', color: '#C55326' },
}

export const INK        = '#1a1a1a'
export const INK_MUTED  = '#94a3b8'
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

export function CampaignTrend({ daily, campaignName }: { daily: CampaignDay[]; campaignName: string }) {
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

export function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 100) : 0
}

export function buildRundown(c: Campaign): { headline: string | null; notes: RundownNote[] } {
  const m = c.metrics
  const daily = c.daily ?? []
  if (!m || !m.page_views) return { headline: null, notes: [] }

  const notes: RundownNote[] = []
  const views = m.page_views ?? 0
  const visitors = m.unique_visitors ?? 0
  const sessions = m.sessions ?? 0

  const headline = c.start_date
    ? `${visitors.toLocaleString('en-US')} people opened this page ${views.toLocaleString('en-US')} times ${windowLabel(c, 'long')}.`
    : daily.length
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


// A horizontal share bar for a dimension breakdown (channels, devices).
export function ShareRows({ rows, total }: { rows: CampaignDimension[]; total: number }) {
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

// This report is a PAGE, not a document, and it navigates by tabs.
//
// Sean, 2026-09-22: "we don't have to make things documents if it's on a web
// page." The report keeps the document shell it lives in - its own URL, the
// BCPS header, the access gate, shareable - but the body reads as an app
// surface, because four sections stacked as accordions is a long scroll where
// a tab strip is one click.
//
// This is a deliberate, Sean-directed departure from the every-section-is-an-
// accordion rule in canon-bcps-doc-template-standard, which governs authored
// documents stored in briefings. Do not "restore" accordions here.
const REPORT_TABS = [
  ['rundown', 'Rundown'],
  ['traffic', 'Traffic'],
  ['sources', 'Sources & Devices'],
  ['pages', 'Pages'],
] as const
type ReportTab = typeof REPORT_TABS[number][0]

export function CampaignReportBody({ campaign, copyEnabled = true }: { campaign: Campaign; copyEnabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<ReportTab>('rundown')
  const m = campaign.metrics
  const { headline, notes } = buildRundown(campaign)
  const origin = siteOrigin(campaign)
  const link = campaign.primary_url || (campaign.page_paths[0] ? origin + campaign.page_paths[0] : null)
  const sessions = m?.sessions ?? 0
  const deviceTotal = (m?.devices ?? []).reduce((s, d) => s + d.sessions, 0)

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
    m ? `Source: GA4, ${windowLabel(campaign, 'long')}. Pulled ${new Date(m.synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.` : 'No data pulled yet.',
  ].filter(Boolean).join('\n')

  const toneColor = { good: '#16750C', watch: '#854F0B', neutral: '#1672A7' }
  const toneBg = { good: 'rgba(22,117,12,.06)', watch: '#fef3e2', neutral: 'rgba(22,114,167,.05)' }

  const stat = (label: string, value: string, note: string) => (
    <div key={label} style={{ flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: INK }}>{value}</div>
      <div style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 5 }}>{note}</div>
    </div>
  )

  return (
    <>
      {/* Meta row, the shape every BCPS document uses. */}
      <div className="meta-row">
        <div className="meta-item"><span className="meta-label">Type</span><span className="meta-value">Campaign report</span></div>
        <div className="meta-item"><span className="meta-label">Period</span><span className="meta-value">{m ? (campaign.start_date ? `Since ${fmtDate(campaign.start_date, 'short')}` : `${m.period} · last 30 days`) : 'Not yet pulled'}</span></div>
        <div className="meta-item"><span className="meta-label">Source</span><span className="meta-value">GA4 property {campaign.ga4_property_id || DISTRICT_GA4_PROPERTY}</span></div>
        <div className="meta-item"><span className="meta-label">Updated</span><span className="meta-value">
          {m ? new Date(m.synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
        </span></div>
      </div>

      {link && (
        <p style={{ margin: '0 0 18px', fontSize: 12.5 }}>
          <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: '#1672A7', fontWeight: 600, wordBreak: 'break-all' }}>{link}</a>
        </p>
      )}

      {/* Lead section: plain, non-collapsible, green heading. Always open. */}
      <h2 className="lead-heading">Overview</h2>
      <div className="section-block lead-summary">
        {headline
          ? <p style={{ fontSize: 14.5, fontWeight: 700, color: INK, margin: '0 0 16px', lineHeight: 1.5 }}>{headline}</p>
          : <p style={{ fontSize: 13, color: INK_MUTED, margin: 0 }}>No data pulled yet for this campaign.</p>}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {stat('Unique Visitors', fmt(m?.unique_visitors ?? 0), 'People, counted once')}
          {stat('Page Views', fmt(m?.page_views ?? 0), 'Total views')}
          {stat('Avg. Time on Page', fmtTime(m?.avg_time_seconds ?? 0), 'Engagement per view')}
          {m?.engagement_rate != null && stat('Engaged Visits', `${Math.round(m.engagement_rate * 100)}%`, 'Stayed, not bounced')}
          {m?.new_users != null && stat('New Visitors', `${pct(m.new_users, m.unique_visitors ?? 0)}%`, 'First time on the site')}
        </div>
        {copyEnabled && (
          <button
            onClick={() => { navigator.clipboard.writeText(summary).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }}
            style={{ marginTop: 18, fontSize: 11, fontWeight: 700, background: '#1672A7', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Copied' : 'Copy for team'}
          </button>
        )}
      </div>

      {/* Tab strip. Same navigation the Analytics tab used, kept because it
          reads faster than four stacked accordions. */}
      <div role="tablist" aria-label="Campaign report sections"
        style={{ display: 'flex', gap: 4, margin: '22px 0 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        {REPORT_TABS.map(([t, label]) => (
          <button key={t} role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
              color: tab === t ? '#1672A7' : INK_MUTED,
              borderBottom: tab === t ? '2px solid #1672A7' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {label}
          </button>
        ))}
      </div>

      <div className="section-block" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 }}>
        {tab === 'rundown' && (
          <div role="tabpanel" id="panel-rundown" aria-labelledby="tab-rundown">
            {notes.length ? notes.map(n => (
              <div key={n.title} style={{ background: toneBg[n.tone], borderLeft: `3px solid ${toneColor[n.tone]}`, borderRadius: '0 8px 8px 0', padding: '12px 16px', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: toneColor[n.tone], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>{n.title}</div>
                <div style={{ fontSize: 12.5, color: '#333', lineHeight: 1.6 }}>{n.body}</div>
              </div>
            )) : <p style={{ fontSize: 12, color: INK_MUTED, margin: 0 }}>Nothing to read yet. The rundown writes itself once data is pulled.</p>}
            <p style={{ fontSize: 10.5, color: INK_MUTED, marginTop: 14, lineHeight: 1.6 }}>
              Every line above is calculated from the same figures shown on the other
              tabs, so it always matches them. It is not an opinion and it is not
              written by hand.
            </p>
          </div>
        )}

        {tab === 'traffic' && (
          <div role="tabpanel" id="panel-traffic" aria-labelledby="tab-traffic">
            <CampaignTrend daily={campaign.daily} campaignName={campaign.name} />
          </div>
        )}

        {tab === 'sources' && (
          <div role="tabpanel" id="panel-sources" aria-labelledby="tab-sources"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: 28 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 12 }}>How people arrived</div>
              <ShareRows rows={m?.channels ?? []} total={sessions} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED, marginBottom: 12 }}>What they used</div>
              <ShareRows rows={m?.devices ?? []} total={deviceTotal} />
            </div>
          </div>
        )}

        {tab === 'pages' && (
          <div role="tabpanel" id="panel-pages" aria-labelledby="tab-pages">
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
                        <a href={`${origin}${pg.path}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#1672A7', textDecoration: 'none', fontWeight: 600 }}>{pg.path}</a>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt(pg.unique_visitors)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{fmt(pg.page_views)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 11.5, color: '#555', textAlign: 'right' }}>{fmtTime(pg.avg_time_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p style={{ fontSize: 12, color: INK_MUTED, margin: 0 }}>No page data yet.</p>}
            <div style={{ fontSize: 10.5, color: '#b0b8c4', marginTop: 12 }}>
              Counting: {campaign.page_paths.join('  ·  ')}
            </div>
          </div>
        )}
      </div>

    </>
  )
}
