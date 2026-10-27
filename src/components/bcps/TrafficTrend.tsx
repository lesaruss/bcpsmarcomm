'use client'
import { useState } from 'react'
import { SERIES, INK, INK_MUTED, fmt, niceTicks } from './CampaignReport'

// Monthly traffic chart for the Analytics page and the department Analytics
// tab (Sean, Oct 27 Hot Lab: "the same type of graph that we've been using in
// the campaigns", named Traffic for consistency). Same palette, ticks and
// one-y-axis rule as CampaignTrend; one point per month, so the current month
// is drawn dashed and hollow while it is still in progress.

export interface TrafficPoint { period: string; visits?: number | null; visitors?: number | null }

const GRID = '#e5e7eb'
const SURFACE = '#ffffff'

function monthLabel(period: string, withYear = false): string {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', withYear ? { month: 'short', year: 'numeric' } : { month: 'short' })
}

export default function TrafficTrend({ points, title = 'Traffic', subject }: { points: TrafficPoint[]; title?: string; subject: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const has = (p: TrafficPoint, k: 'visits' | 'visitors') => p[k] !== null && p[k] !== undefined
  const rows = points.filter((p) => has(p, 'visits') || has(p, 'visitors')).sort((a, b) => a.period.localeCompare(b.period))
  // Only series with numbers are drawn, so a month with visitors but no visit
  // count is never plotted as visits.
  const series = [
    ...(rows.some((r) => has(r, 'visits')) ? [{ key: 'visits' as const, label: 'Visits', color: SERIES.views.color }] : []),
    ...(rows.some((r) => has(r, 'visitors')) ? [{ key: 'visitors' as const, label: 'Visitors', color: SERIES.visitors.color }] : []),
  ]
  const val = (r: TrafficPoint, k: 'visits' | 'visitors') => Number(r[k] ?? 0)

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: INK_MUTED }}>{title}</div>
      {series.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {series.map((s) => (
            <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', fontWeight: 600 }}>
              <svg width="14" height="4" aria-hidden="true"><rect width="14" height="3" rx="1.5" fill={s.color} /></svg>
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )

  if (rows.length < 2) {
    return (
      <div>
        {head}
        <div style={{ padding: '18px 0 4px', fontSize: 11.5, color: INK_MUTED }}>
          {rows.length === 1
            ? `Only ${monthLabel(rows[0].period, true)} is synced for this period. The trend appears once there are two months.`
            : 'No traffic synced for this period yet.'}
        </div>
      </div>
    )
  }

  const W = 720, H = 220
  const padL = 48, padR = 16, padT = 16, padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const maxVal = Math.max(...rows.flatMap((r) => series.map((s) => val(r, s.key))), 1)
  const ticks = niceTicks(maxVal)
  const yMax = ticks[ticks.length - 1]
  const x = (i: number) => padL + (i / (rows.length - 1)) * plotW
  const y = (v: number) => padT + plotH - (v / yMax) * plotH
  const thisMonth = new Date().toISOString().slice(0, 7)
  const lastIdx = rows.length - 1
  const partial = rows[lastIdx].period >= thisMonth
  const solidEnd = partial ? lastIdx : lastIdx + 1
  const path = (k: 'visits' | 'visitors', from: number, to: number) =>
    rows.slice(from, to).map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i + from).toFixed(1)},${y(val(r, k)).toFixed(1)}`).join(' ')
  const labelEvery = Math.ceil(rows.length / 8)

  return (
    <div>
      {head}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible', touchAction: 'none' }}
        role="img" tabIndex={0}
        aria-label={`Monthly ${series.map((s) => s.label.toLowerCase()).join(' and ')} for ${subject}, ${monthLabel(rows[0].period, true)} to ${monthLabel(rows[lastIdx].period, true)}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min((h ?? -1) + 1, lastIdx)) }
          if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max((h ?? rows.length) - 1, 0)) }
        }}
        onBlur={() => setHover(null)}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(lastIdx, Math.round(((px - padL) / plotW) * lastIdx))))
        }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>{fmt(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % labelEvery === 0 || i === lastIdx) && (
          <text key={r.period} x={x(i)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
            {monthLabel(r.period, i === 0 || r.period.endsWith('-01'))}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s.key, 0, solidEnd)} fill="none" stroke={s.color} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
            {partial && <path d={path(s.key, lastIdx - 1, lastIdx + 1)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="4 4" />}
            {partial && <circle cx={x(lastIdx)} cy={y(val(rows[lastIdx], s.key))} r={3.5} fill={SURFACE} stroke={s.color} strokeWidth={2} />}
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + plotH} stroke={INK_MUTED} strokeWidth={1} strokeDasharray="2 3" />
            {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(val(rows[hover], s.key))} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />)}
          </g>
        )}
      </svg>
      <div style={{ minHeight: 18, fontSize: 11.5, color: INK, fontWeight: 600, marginTop: 4 }}>
        {hover !== null
          ? <>{monthLabel(rows[hover].period, true)}{partial && hover === lastIdx ? ' (so far)' : ''}: {series.map((s) => `${fmt(val(rows[hover], s.key))} ${s.label.toLowerCase()}`).join(', ')}</>
          : <span style={{ color: INK_MUTED, fontWeight: 500 }}>Hover or use the arrow keys for a month&apos;s numbers.{partial ? ' The dashed point is this month so far.' : ''}</span>}
      </div>
    </div>
  )
}
