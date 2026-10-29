'use client'
// src/components/bcps/DepartmentReport.tsx
//
// The department report body (src/app/reports/departments/[slug]/page.tsx
// loads the data and decides access; this only draws it). Kept apart so it
// can be rendered and checked with real numbers without a signed-in session.
import React from 'react'
import TrafficTrend from '@/components/bcps/TrafficTrend'
import type { DeadPage, Idea, ReportDepartment, ReportMonth } from '@/lib/bcps-department-report'

const BWS = 'https://www.browardschools.com'

const AUDIT_LABELS: Record<string, string> = {
  not_started: 'Not started', in_progress: 'Audit in progress', wcm_notified: 'Action required',
  wcm_submitted: 'Submitted, pending review', admin_review: 'Under review', needs_rework: 'Updates needed', complete: 'Complete',
}

const num = (n: number) => n.toLocaleString('en-US')
const duration = (s: number | null) => s === null ? 'n/a' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const monthName = (p: string) => new Date(p + '-15T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
function pageName(path: string) {
  const last = path.replace(/\/+$/, '').split('/').pop() || path
  let seg = last
  try { seg = decodeURIComponent(last) } catch { /* keep raw */ }
  const pdf = /\.pdf$/i.test(seg)
  seg = seg.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[-_]+/g, ' ').trim()
  seg = seg.replace(/\b([a-z])/g, (c) => c.toUpperCase())
  return (seg || path) + (pdf ? ' (PDF)' : '')
}

function Change({ cur, prev }: { cur: number; prev: number | null }) {
  if (prev === null || prev < 20) return null
  const c = Math.round(((cur - prev) / prev) * 100)
  if (!c) return <span className="chg">Same as the month before</span>
  return <span className={`chg ${c > 0 ? 'up' : 'down'}`}>{c > 0 ? '+' : ''}{c}% from the month before</span>
}

export interface DepartmentReportProps {
  dept: ReportDepartment
  months: ReportMonth[]
  cur: ReportMonth | null
  prev: ReportMonth | null
  dead: DeadPage[]
  ideas: Idea[]
  synced: string | null
  thisMonth: string
}

export function DepartmentReportView({ dept, months, cur, prev, dead, ideas, synced, thisMonth }: DepartmentReportProps) {
  return (
    <>
      <style>{`
        :root { --bcps-blue:#1672A7; --bcps-blue-dark:#0e4e73; --bcps-green:#16750C; --bcps-orange:#C55326;
                --border:rgba(0,0,0,0.10); --surface:#fff; --surface2:#fafafa; --text-50:rgba(26,26,26,0.6); }
        *,*::before,*::after { box-sizing:border-box; }
        body { margin:0; background:#f5f5f5; color:#1a1a1a; font-family:'Open Sans', Arial,Helvetica,Verdana,sans-serif; line-height:1.55; }
        header.bcps-header { position:fixed; top:0; left:0; right:0; z-index:200; height:64px; background:#fff;
          border-bottom:3px solid var(--bcps-blue); display:flex; align-items:center; padding:0 28px; gap:20px; box-shadow:0 1px 4px rgba(0,0,0,0.08); }
        .bcps-logo-link { display:flex; align-items:center; }
        .bcps-logo { height:44px; width:auto; display:block; }
        .bcps-header-divider { width:1px; height:32px; background:var(--border); }
        .bcps-header-title { font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:0.16em; color:var(--bcps-blue);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
        main { max-width:none; margin:0; padding:86px 40px 80px; }
        h1 { font-size:26px; font-weight:800; margin:0 0 4px; overflow-wrap:anywhere; }
        h2 { font-size:13px; font-weight:800; margin:26px 0 12px; text-transform:uppercase; letter-spacing:.06em; color:var(--bcps-green); }
        .meta-row { display:flex; flex-wrap:wrap; gap:26px; padding:14px 0 18px; border-bottom:1px solid var(--border); margin-bottom:8px; }
        .meta-item { display:flex; flex-direction:column; gap:2px; min-width:0; }
        .meta-label { font-size:9.5px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; color:var(--text-50); }
        .meta-value { font-size:12.5px; font-weight:700; overflow-wrap:anywhere; }
        .meta-value a { color:var(--bcps-blue-dark); }
        .section-block { border:1px solid var(--border); border-radius:8px; background:var(--surface); padding:18px 20px; margin-bottom:14px; min-width:0; }
        .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(180px,100%),1fr)); gap:12px; }
        @media (max-width:700px) { .kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .kpi b { font-size:20px; } }
        .kpi { border:1px solid var(--border); border-radius:8px; background:var(--surface); padding:14px 16px; min-width:0; }
        .kpi b { display:block; font-size:24px; font-weight:800; }
        .kpi span { display:block; font-size:11px; font-weight:700; color:var(--text-50); text-transform:uppercase; letter-spacing:.06em; }
        .kpi span.chg { display:block; font-size:11.5px; font-weight:700; margin-top:4px; color:var(--text-50); text-transform:none; letter-spacing:0; }
        .kpi span.chg.up { color:var(--bcps-green); } .kpi span.chg.down { color:var(--bcps-orange); }
        .cols { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; }
        .src { display:grid; grid-template-columns:minmax(0,9rem) minmax(0,1fr) 3.2rem; gap:10px; align-items:center; font-size:12.5px; margin:8px 0; }
        .src .bar { height:8px; border-radius:4px; background:#e5e7eb; overflow:hidden; }
        .src .bar i { display:block; height:100%; background:var(--bcps-blue); }
        .src .n { text-align:right; font-weight:700; }
        table { width:100%; border-collapse:collapse; font-size:12.5px; }
        th { text-align:left; font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--text-50); padding:6px 8px; border-bottom:1px solid var(--border); }
        td { padding:8px; border-bottom:1px solid #f1f1f1; vertical-align:top; overflow-wrap:anywhere; }
        td.num, th.num { text-align:right; white-space:nowrap; }
        td a { color:var(--bcps-blue-dark); font-weight:700; text-decoration:none; }
        .path { display:block; font-size:10.5px; color:var(--text-50); }
        .idea { border-left:4px solid var(--bcps-green); background:rgba(22,117,12,.05); border-radius:6px; padding:12px 16px; margin-bottom:10px; }
        .idea b { display:block; font-size:13.5px; margin-bottom:3px; }
        .idea span { font-size:12.5px; color:rgba(26,26,26,.8); }
        .empty { font-size:12.5px; color:var(--text-50); }
        @media (max-width:700px) {
          main { padding:80px 16px 60px; } header.bcps-header { padding:0 16px; gap:12px; } .bcps-logo { height:36px; }
          .meta-row { gap:16px; } .cols { grid-template-columns:minmax(0,1fr); }
          table.pages thead { display:none; }
          table.pages tr { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:4px 10px; padding:10px 0; border-bottom:1px solid #f1f1f1; }
          table.pages td { padding:0; border:0; text-align:left !important; }
          table.pages td.t { grid-column:1/-1; }
          table.pages td[data-label]::before { content:attr(data-label); display:block; font-size:9px; font-weight:700; text-transform:uppercase; color:var(--text-50); }
        }
      `}</style>

      <header className="bcps-header" role="banner">
        <a className="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS MarComm dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" className="bcps-logo" />
        </a>
        <div className="bcps-header-divider" aria-hidden="true" />
        <span className="bcps-header-title">BCPS MarComm &middot; Department Report</span>
      </header>

      <main>
        <h1>{dept.name}</h1>
        <div className="meta-row">
          <div className="meta-item"><span className="meta-label">Month</span><span className="meta-value">{cur ? monthName(cur.period) + (cur.period === thisMonth ? ', last 30 days' : '') : 'No data yet'}</span></div>
          {dept.division && <div className="meta-item"><span className="meta-label">Division</span><span className="meta-value">{dept.division}</span></div>}
          {dept.director_name && <div className="meta-item"><span className="meta-label">Director</span><span className="meta-value">{dept.director_name}</span></div>}
          {dept.website_url && <div className="meta-item"><span className="meta-label">Website</span><span className="meta-value"><a href={dept.website_url} target="_blank" rel="noopener noreferrer">Visit the page</a></span></div>}
          {dept.audit_status && <div className="meta-item"><span className="meta-label">Website review</span><span className="meta-value">{AUDIT_LABELS[dept.audit_status] ?? dept.audit_status}</span></div>}
          {synced && <div className="meta-item"><span className="meta-label">Updated</span><span className="meta-value">{synced}</span></div>}
        </div>

        {!cur ? (
          <div className="section-block"><p className="empty">No analytics have synced for this department yet. Once its pages are connected to the monthly Google Analytics sync, this report fills in on its own.</p></div>
        ) : <>
          <h2>At a glance</h2>
          <div className="kpis">
            <div className="kpi"><span>Visitors</span><b>{num(cur.visitors)}</b><Change cur={cur.visitors} prev={prev?.visitors ?? null} /></div>
            <div className="kpi"><span>Visits</span><b>{num(cur.visits)}</b><Change cur={cur.visits} prev={prev?.visits ?? null} /></div>
            <div className="kpi"><span>First-time visitors</span><b>{num(cur.new_visitors)}</b></div>
            {cur.engaged_pct !== null && <div className="kpi"><span>Engaged visits</span><b>{cur.engaged_pct}%</b></div>}
            <div className="kpi"><span>Average visit</span><b>{duration(cur.avg_seconds)}</b></div>
          </div>

          {ideas.length > 0 && <>
            <h2>Ideas for your department</h2>
            <div className="section-block">
              {ideas.map((i) => <div key={i.title} className="idea"><b>{i.title}</b><span>{i.detail}</span></div>)}
              <p className="empty" style={{ margin: '10px 0 0' }}>Drawn from this report&apos;s numbers. The District Web Team and the Office of Communications can help with any of them.</p>
            </div>
          </>}

          <div className="cols">
            <div>
              <h2>Traffic over time</h2>
              <div className="section-block">
                <TrafficTrend subject={dept.name} points={months.map((m) => ({ period: m.period, visits: m.visits, visitors: m.visitors }))} />
              </div>
            </div>
            <div>
              <h2>How people find you</h2>
              <div className="section-block">
                {cur.sources.length ? cur.sources.slice(0, 8).map((s) => (
                  <div key={s.source} className="src">
                    <span>{s.source === 'Unassigned' || s.source === '(not set)' ? 'Other' : s.source}</span>
                    <span className="bar" role="img" aria-label={`${s.pct}%`}><i style={{ width: `${s.pct}%` }} /></span>
                    <span className="n">{s.pct}%</span>
                  </div>
                )) : <p className="empty">Traffic sources start with the next analytics sync.</p>}
              </div>
            </div>
          </div>

          <h2>Most visited pages</h2>
          <div className="section-block">
            {cur.pages.length ? (
              <table className="pages">
                <thead><tr><th>Page</th><th className="num">Visits</th><th className="num">Visitors</th><th className="num">Avg. visit</th></tr></thead>
                <tbody>
                  {cur.pages.slice(0, 10).map((p) => (
                    <tr key={p.path}>
                      <td className="t"><a href={BWS + p.path} target="_blank" rel="noopener noreferrer">{pageName(p.path)}</a><span className="path">{p.path}</span></td>
                      <td className="num" data-label="Visits">{num(p.visits)}</td>
                      <td className="num" data-label="Visitors">{num(p.visitors)}</td>
                      <td className="num" data-label="Avg. visit">{duration(p.avg_seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="empty">No page-level numbers for this month.</p>}
          </div>

          {dead.length > 0 && <>
            <h2>Links to fix</h2>
            <div className="section-block">
              <p className="empty" style={{ marginTop: 0 }}>These old addresses under your pages showed visitors &ldquo;page not found&rdquo; in the last 30 days. Your WCM can set a redirect for each one.</p>
              <table className="pages">
                <thead><tr><th>Address</th><th className="num">Visits</th><th>Suggested redirect</th></tr></thead>
                <tbody>
                  {dead.map((d) => (
                    <tr key={d.path}>
                      <td className="t">{pageName(d.path)}<span className="path">{d.path}</span></td>
                      <td className="num" data-label="Visits">{num(d.sessions)}</td>
                      <td data-label="Suggested redirect" style={{ gridColumn: 'span 2' }}>{d.suggested_path ? <span className="path" style={{ color: 'inherit' }}>{d.suggested_path}</span> : <span className="path">None found</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
        </>}

        <p style={{ fontSize: 10.5, color: 'var(--text-50)', marginTop: 24, lineHeight: 1.6, maxWidth: 780 }}>
          Numbers come from the District&apos;s Google Analytics and refresh on each sync, so this link stays current. Shared with the department&apos;s director and the leaders who oversee it.
        </p>
      </main>
    </>
  )
}
