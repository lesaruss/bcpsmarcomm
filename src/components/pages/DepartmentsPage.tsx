'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { PageId, BreadcrumbItem } from '@/lib/types'

interface Dept {
  id: string
  name: string
  slug: string
  division?: string
  health_status?: string
  audit_status?: string
  current_round?: number
  wcm_submitted_at?: string | null
  ada_score?: number
  overall_score?: number
  layout_score?: number
  content_score?: number
  nav_score?: number
  traffic_rank?: number
  website_url?: string
  wcm_name?: string
  director_name?: string
  chief_name?: string
  chief_title?: string
  blurb?: string
  audit_date?: string
}

const WORKFLOW_CONFIG: Record<string, { label: string; chipClass: string }> = {
  not_started:   { label: 'Not Started',            chipClass: 'not-started' },
  in_progress:   { label: 'In Progress',            chipClass: 'in-progress' },
  wcm_notified:  { label: 'WCM: Action Required',   chipClass: 'wcm-notified' },
  wcm_submitted: { label: 'WCM: Submitted',         chipClass: 'wcm-submitted' },
  admin_review:  { label: 'Admin Review',           chipClass: 'admin-review' },
  needs_rework:  { label: 'Needs Rework',           chipClass: 'needs-update' },
  complete:      { label: 'Complete',               chipClass: 'complete' },
  // legacy
  Completed:     { label: 'Complete',               chipClass: 'complete' },
  'In Review':   { label: 'In Progress',            chipClass: 'in-progress' },
  Incomplete:    { label: 'Not Started',            chipClass: 'not-started' },
}

function auditChipClass(s?: string) {
  return WORKFLOW_CONFIG[s ?? '']?.chipClass ?? 'not-started'
}
function auditLabel(s?: string) {
  return WORKFLOW_CONFIG[s ?? '']?.label ?? (s || 'Not Started')
}

function scoreColor(n?: number | null) {
  if (n == null) return '#9ca3af'
  if (n >= 80) return '#16a34a'
  if (n >= 65) return '#c97a1b'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  const r = 20, circ = 2 * Math.PI * r
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  const offset = circ * (1 - pct)
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 26 26)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color }}>{score != null ? score : '–'}</span>
      </div>
    </div>
  )
}

function TrafficRing({ rank }: { rank: number | null | undefined }) {
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="20" fill="none" stroke="#1672A7" strokeWidth="5" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color: '#1672A7' }}>{rank != null ? `#${rank}` : '–'}</span>
      </div>
    </div>
  )
}

interface DepartmentsPageProps {
  subPage?: string
  onNavigate?: (page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => void
}

export default function DepartmentsPage({ subPage: _subPage, onNavigate: _onNavigate }: DepartmentsPageProps = {}) {
  const [search, setSearch]         = useState('')
  const [divFilter, setDivFilter]   = useState('')
  const [auditFilter, setAuditFilter] = useState('')
  const [departments, setDepartments] = useState<Dept[]>([])
  const [loading, setLoading]       = useState(true)
  const [auditingId, setAuditingId] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)

  const loadDepartments = useCallback(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from('bcps_departments')
        .select('id,name,slug,division,health_status,audit_status,current_round,wcm_submitted_at,ada_score,website_url,wcm_name,director_name,chief_name,chief_title,blurb,audit_date')
        .order('name'),
      supabase
        .from('bcps_audit_results')
        .select('department_id,overall_score,layout_score,content_score,nav_score,ada_score,audited_at')
        .order('audited_at', { ascending: false }),
      supabase
        .from('bcps_department_analytics')
        .select('department_id,monthly_visitors'),
    ]).then(([deptRes, auditRes, analyticsRes]) => {
      const depts = deptRes.data ?? []

      const auditMap = new Map<string, {
        overall_score: number; layout_score: number; content_score: number
        nav_score: number; ada_score: number
      }>()
      for (const a of (auditRes.data ?? [])) {
        if (!auditMap.has(a.department_id)) {
          auditMap.set(a.department_id, {
            overall_score: a.overall_score,
            layout_score: a.layout_score,
            content_score: a.content_score,
            nav_score: a.nav_score,
            ada_score: a.ada_score,
          })
        }
      }

      const trafficMap = new Map<string, number>()
      for (const a of (analyticsRes.data ?? [])) {
        const cur = trafficMap.get(a.department_id) ?? 0
        if ((a.monthly_visitors ?? 0) > cur) trafficMap.set(a.department_id, a.monthly_visitors ?? 0)
      }
      const rankMap = new Map<string, number>()
      ;Array.from(trafficMap.entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([id], i) => rankMap.set(id, i + 1))

      setDepartments(depts.map(d => ({
        ...d,
        ...(auditMap.get(d.id) ?? {}),
        traffic_rank: rankMap.get(d.id),
      })))
      setLoading(false)
    })
  }, [])

  useEffect(() => { loadDepartments() }, [loadDepartments])

  const runAudit = async (dept: Dept, triggeredBy: 'initial' | 'admin_reaudit' = 'initial') => {
    setAuditingId(dept.id)
    try {
      const res = await fetch('/api/bcps/run-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: dept.id, triggered_by: triggeredBy }),
      })
      if (!res.ok) throw new Error('Audit failed')
      // Refresh departments to get updated status + scores
      loadDepartments()
    } catch (e) {
      console.error('Audit error:', e)
      alert('Audit failed. Please try again.')
    } finally {
      setAuditingId(null)
    }
  }

  const adminDecision = async (dept: Dept, decision: 'pass' | 'send_back') => {
    const notes = decision === 'send_back'
      ? (prompt('Optional: Add a note for the WCM (press OK to skip):') ?? '')
      : ''
    setDecidingId(dept.id)
    try {
      const res = await fetch('/api/bcps/admin-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: dept.id, decision, admin_notes: notes }),
      })
      if (!res.ok) throw new Error('Decision failed')
      loadDepartments()
    } catch (e) {
      console.error('Decision error:', e)
      alert('Action failed. Please try again.')
    } finally {
      setDecidingId(null)
    }
  }

  const divisions = Array.from(new Set(departments.map(d => d.division).filter(Boolean))).sort() as string[]

  const filtered = departments.filter(d => {
    const q = search.toLowerCase().trim()
    if (q && !d.name.toLowerCase().includes(q) && !(d.division ?? '').toLowerCase().includes(q) && !(d.blurb ?? '').toLowerCase().includes(q)) return false
    if (divFilter && d.division !== divFilter) return false
    if (auditFilter && (d.audit_status || 'not_started') !== auditFilter) return false
    return true
  })

  const statTotal   = departments.length
  const statPending = departments.filter(d => !d.audit_status || d.audit_status === 'not_started').length
  const statWcm     = departments.filter(d => d.wcm_name).length
  const audited     = departments.filter(d => d.overall_score != null)
  const avgScore    = audited.length > 0
    ? Math.round(audited.reduce((s, d) => s + (d.overall_score ?? 0), 0) / audited.length)
    : null
  const statWcmSubmitted = departments.filter(d => d.audit_status === 'wcm_submitted').length

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(22,114,167,.15)', borderTopColor: '#1672A7', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800;900&display=swap');
        .dv-root{--dv-blue:#1672A7;--dv-blue-dark:#125e8a;--dv-blue-xlight:#e8f4fb;--dv-text:#262626;--dv-text-s:#525252;--dv-text-m:#767676;--dv-card:#ffffff;--dv-border:#dde3ea;--dv-page:#f0f4f8}
        .dv-root{padding:28px;flex:1;font-family:'Open Sans',sans-serif}
        .dv-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:22px}
        .dv-tile{background:var(--dv-card);border-radius:10px;padding:16px;border:1.5px solid var(--dv-border)}
        .dv-tile-label{font-size:10px;font-weight:700;color:var(--dv-text-m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
        .dv-tile-val{font-size:24px;font-weight:800;color:var(--dv-text)}
        .dv-tile.alert .dv-tile-val{color:#7c3aed}
        .dv-filters{display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap}
        .dv-search{flex:1;min-width:220px;border:1.5px solid var(--dv-border);border-radius:8px;padding:9px 14px;font-size:13px;font-family:'Open Sans',sans-serif;outline:none;background:var(--dv-card);color:var(--dv-text);transition:border-color .2s}
        .dv-search:focus{border-color:var(--dv-blue)}
        .dv-select{border:1.5px solid var(--dv-border);border-radius:8px;padding:8px 36px 8px 14px;font-size:12px;font-family:'Open Sans',sans-serif;background:var(--dv-card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E") no-repeat right 10px center;-webkit-appearance:none;appearance:none;color:var(--dv-text);cursor:pointer;outline:none;font-weight:600}
        .dv-select:focus{border-color:var(--dv-blue)}
        .dv-count{font-size:12px;color:var(--dv-text-m);font-weight:600;margin-left:auto;white-space:nowrap}
        .dv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .dv-card{background:var(--dv-card)!important;border:1px solid var(--dv-border)!important;border-radius:12px!important;padding:18px!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;gap:0!important;cursor:default;transition:box-shadow .15s,border-color .15s;text-align:left!important;width:auto!important}
        .dv-card:hover{box-shadow:0 4px 20px rgba(22,114,167,.13)!important;border-color:var(--dv-blue)!important}
        .dv-card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px}
        .dv-name{font-size:13.5px;font-weight:800;color:var(--dv-text);line-height:1.3;text-align:left;flex:1;min-width:0}
        .dv-rings{display:flex;align-items:flex-end;gap:6px;flex-shrink:0}
        .dv-ring-col{display:flex;flex-direction:column;align-items:center;gap:3px}
        .dv-ring-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--dv-text-m)}
        .dv-division{font-size:10.5px;font-weight:700;color:var(--dv-blue);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;text-align:left}
        .dv-blurb{font-size:11.5px;color:var(--dv-text-m);line-height:1.55;margin-bottom:8px;text-align:left}
        .dv-links{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px}
        .dv-profile-link{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:#1a7a3c;text-transform:uppercase;letter-spacing:.1em;text-decoration:none;transition:color .12s}
        .dv-profile-link:hover{color:#145f2f;text-decoration:underline}
        .dv-website-link{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--dv-blue);text-transform:uppercase;letter-spacing:.1em;text-decoration:none;transition:color .12s}
        .dv-website-link:hover{color:var(--dv-blue-dark);text-decoration:underline}
        .dv-subscores{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--dv-border);margin-top:auto;padding-top:10px}
        .dv-subscore{display:flex;flex-direction:column;align-items:center;gap:3px;padding:0 4px}
        .dv-subscore+.dv-subscore{border-left:1px solid var(--dv-border)}
        .dv-subscore-key{font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--dv-text-m)}
        .dv-subscore-val{font-size:13px;font-weight:800;line-height:1}
        .dv-chip{display:inline-block;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:2px 7px;border-radius:999px}
        .dv-chip.not-started{background:#f3f4f6;color:var(--dv-text-m)}
        .dv-chip.in-progress{background:#eff6ff;color:#1d4ed8}
        .dv-chip.complete{background:#dcfce7;color:#16a34a}
        .dv-chip.needs-update{background:#fff7ed;color:#c2410c}
        .dv-chip.pending-review{background:#f0f9ff;color:#0369a1}
        .dv-chip.pending{background:#fdf4ff;color:#7e22ce}
        .dv-chip.wcm-notified{background:#fffbeb;color:#b45309}
        .dv-chip.wcm-submitted{background:#f5f3ff;color:#6d28d9}
        .dv-chip.admin-review{background:#eff6ff;color:#1d4ed8}
        .dv-workflow{border-top:1px solid var(--dv-border);margin-top:10px;padding-top:10px;padding-bottom:10px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .dv-action-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;font-size:10.5px;font-weight:700;cursor:pointer;border:none;font-family:'Open Sans',sans-serif;transition:opacity .15s;white-space:nowrap}
        .dv-action-btn:disabled{opacity:.5;cursor:default}
        .dv-action-btn.run{background:#1672A7;color:#fff}
        .dv-action-btn.run:hover:not(:disabled){background:#125e8a}
        .dv-action-btn.pass{background:#059669;color:#fff}
        .dv-action-btn.pass:hover:not(:disabled){background:#047857}
        .dv-action-btn.sendback{background:#fff;color:#c2410c;border:1.5px solid #fed7aa}
        .dv-action-btn.sendback:hover:not(:disabled){background:#fff7ed}
        .dv-action-round{font-size:9.5px;color:var(--dv-text-m);font-weight:600;margin-left:auto}
        .dv-empty{text-align:center;padding:60px 20px;color:var(--dv-text-m)}
        .dv-empty h3{font-size:16px;font-weight:700;margin-bottom:6px;color:var(--dv-text-s)}
        @media(max-width:900px){.dv-stats{grid-template-columns:repeat(3,1fr)}.dv-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:600px){.dv-grid{grid-template-columns:1fr}.dv-stats{grid-template-columns:repeat(2,1fr)}.dv-root{padding:16px}}
      `}</style>

      <div className="dv-root">
        {/* Stats */}
        <div className="dv-stats">
          <div className="dv-tile"><div className="dv-tile-label">Departments</div><div className="dv-tile-val">{statTotal}</div></div>
          <div className="dv-tile"><div className="dv-tile-label">Avg Score</div><div className="dv-tile-val" style={{ color: scoreColor(avgScore) }}>{avgScore ?? '–'}</div></div>
          <div className="dv-tile"><div className="dv-tile-label">Audited</div><div className="dv-tile-val">{audited.length}</div></div>
          <div className="dv-tile"><div className="dv-tile-label">Pending Audits</div><div className="dv-tile-val">{statPending}</div></div>
          <div className={`dv-tile${statWcmSubmitted > 0 ? ' alert' : ''}`}>
            <div className="dv-tile-label">Awaiting Review</div>
            <div className="dv-tile-val">{statWcmSubmitted}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="dv-filters">
          <input
            type="text"
            className="dv-search"
            placeholder="Search departments..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search departments"
          />
          <select className="dv-select" value={divFilter} onChange={e => setDivFilter(e.target.value)}>
            <option value="">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="dv-select" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="wcm_notified">WCM: Action Required</option>
            <option value="wcm_submitted">WCM: Submitted</option>
            <option value="admin_review">Admin Review</option>
            <option value="needs_rework">Needs Rework</option>
            <option value="complete">Complete</option>
          </select>
          <span className="dv-count">{filtered.length} of {departments.length} departments</span>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="dv-empty">
            <h3>No departments found</h3>
            <p>Try adjusting your search or filters.</p>
          </div>
        ) : (
          <div className="dv-grid">
            {filtered.map(dept => {
              const isAuditing  = auditingId  === dept.id
              const isDeciding  = decidingId  === dept.id
              const busy        = isAuditing || isDeciding
              const status      = dept.audit_status ?? 'not_started'
              const round       = dept.current_round ?? 1

              return (
                <article key={dept.id} className="dv-card">
                  <div className="dv-card-header">
                    <div className="dv-name">{dept.name}</div>
                    <div className="dv-rings">
                      <div className="dv-ring-col">
                        <ScoreRing score={dept.overall_score} />
                        <span className="dv-ring-label">Score</span>
                      </div>
                      <div className="dv-ring-col">
                        <TrafficRing rank={dept.traffic_rank} />
                        <span className="dv-ring-label">Traffic</span>
                      </div>
                    </div>
                  </div>
                  <div className="dv-division">{dept.division}</div>
                  {dept.blurb && <p className="dv-blurb">{dept.blurb}</p>}
                  <div className="dv-links">
                    <a className="dv-profile-link" href={`/bcps/department?id=${dept.id}`}>
                      Visit Profile
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </a>
                    {dept.website_url && (
                      <a className="dv-website-link" href={dept.website_url} target="_blank" rel="noopener noreferrer">
                        Visit Website
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                      </a>
                    )}
                    <span className={`dv-chip ${auditChipClass(status)}`} style={{ marginLeft: 'auto' }}>{auditLabel(status)}</span>
                  </div>

                  {/* Audit workflow action row */}
                  <div className="dv-workflow">
                    {(status === 'not_started' || status === 'in_progress' || status === 'wcm_notified') && (
                      <button
                        className="dv-action-btn run"
                        disabled={busy}
                        onClick={() => runAudit(dept, status === 'wcm_notified' ? 'admin_reaudit' : 'initial')}
                      >
                        {isAuditing
                          ? <><span style={{ display:'inline-block',width:10,height:10,border:'1.5px solid rgba(255,255,255,.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite' }} /> Running...</>
                          : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Audit</>
                        }
                      </button>
                    )}

                    {status === 'wcm_submitted' && (
                      <button
                        className="dv-action-btn run"
                        disabled={busy}
                        onClick={() => runAudit(dept, 'admin_reaudit')}
                      >
                        {isAuditing
                          ? <><span style={{ display:'inline-block',width:10,height:10,border:'1.5px solid rgba(255,255,255,.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin .7s linear infinite' }} /> Running...</>
                          : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-4.36"/></svg> Re-run Audit</>
                        }
                      </button>
                    )}

                    {status === 'admin_review' && (
                      <>
                        <button
                          className="dv-action-btn pass"
                          disabled={busy}
                          onClick={() => adminDecision(dept, 'pass')}
                        >
                          {isDeciding
                            ? 'Saving...'
                            : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Mark Complete</>
                          }
                        </button>
                        <button
                          className="dv-action-btn sendback"
                          disabled={busy}
                          onClick={() => adminDecision(dept, 'send_back')}
                        >
                          {isDeciding
                            ? 'Saving...'
                            : <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg> Send Back</>
                          }
                        </button>
                      </>
                    )}

                    {status === 'needs_rework' && (
                      <span style={{ fontSize: 10.5, color: '#c2410c', fontWeight: 600 }}>
                        Sent back - WCM is making updates
                      </span>
                    )}

                    {status === 'complete' && (
                      <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10.5, color:'#059669', fontWeight:700 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        Audit complete
                      </span>
                    )}

                    <span className="dv-action-round">Round {round}</span>
                  </div>

                  <div className="dv-subscores">
                    {(['Layout', 'Content', 'Nav', 'ADA'] as const).map((label) => {
                      const key = label === 'Layout' ? 'layout_score' : label === 'Content' ? 'content_score' : label === 'Nav' ? 'nav_score' : 'ada_score'
                      const val = dept[key as keyof Dept] as number | undefined
                      return (
                        <div key={label} className="dv-subscore">
                          <span className="dv-subscore-key">{label}</span>
                          <span className="dv-subscore-val" style={{ color: scoreColor(val) }}>{val != null ? val : '–'}</span>
                        </div>
                      )
                    })}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
