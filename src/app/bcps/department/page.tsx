'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useBCPSShell } from '@/components/BCPSShell'

// ─── Period types ─────────────────────────────────────────────────────────────
type PeriodMode = 'calendar' | 'school' | 'custom'
const NOW_D = new Date()
const CUR_YEAR_D = NOW_D.getFullYear()
const CUR_MONTH_D = NOW_D.getMonth() + 1
const CUR_SCHOOL_START_D = CUR_MONTH_D >= 8 ? CUR_YEAR_D : CUR_YEAR_D - 1

// ─── Types ────────────────────────────────────────────────────────────────────
interface Dept { id: string; name: string; division?: string; health_status?: string; website_url?: string; wcm_name?: string; wcm_email?: string; director_name?: string; chief_name?: string; chief_title?: string; audit_status?: string; ada_score?: number }
interface Audit { id: string; audited_at: string; overall_score: number | null; layout_score: number | null; content_score: number | null; nav_score: number | null; ada_score: number | null; status: string; auditor?: string; issues?: unknown; ada_violations?: unknown; ada_violations_critical?: number; ada_violations_serious?: number; ada_violations_moderate?: number; ada_violations_minor?: number }
interface AnalyticsRow { period: string; synced_at?: string; monthly_visitors?: number; avg_time_seconds?: number; bounce_rate?: number; mobile_pct?: number; top_pages?: Array<{ title: string; url: string; views: number }>; traffic_sources?: Array<{ source: string; sessions: number | string; pct: string }>; top_queries?: Array<{ query: string; clicks: number; impressions: number }> }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function scoreClass(n: number | null) { if (n == null) return 'na'; if (n >= 80) return 'green'; if (n >= 60) return 'yellow'; return 'red' }
function healthLabel(s?: string) { if (s === 'healthy') return 'Healthy'; if (s === 'review') return 'Needs Review'; if (s === 'at_risk') return 'At Risk'; return 'Unassessed' }
function healthClass(s?: string) { if (s === 'at_risk') return 'at-risk'; return s || 'unassessed' }
function statusLabel(s: string) { if (s === 'pass') return 'Passing'; if (s === 'needs_work') return 'Needs Work'; if (s === 'critical') return 'Critical Issues'; return 'Pending' }
function catLabel(c: string) { const m: Record<string,string> = { layout:'Layout', content:'Content', nav:'Navigation', ada:'ADA' }; return m[c] || c.charAt(0).toUpperCase() + c.slice(1) }
function fmtDate(ts?: string | null) { if (!ts) return 'Never'; const d = new Date(ts); return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit' }) }
function fmtNum(n?: number | string | null) { if (n == null) return '-'; const v = Number(n); return v >= 1000 ? (v/1000).toFixed(1) + 'k' : String(v) }
function fmtTime(secs?: number | null) { if (!secs) return '-'; const m = Math.floor(secs/60), s = secs%60; return m + 'm ' + String(s).padStart(2,'0') + 's' }
function fmtPct(n?: number | null) { if (n == null) return '-'; return Number(n).toFixed(1) + '%' }
function esc(s?: string | null) { if (!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
function scoreLabel(n: number | null) { return n == null ? 'N/A' : String(n) }
function parseArr<T>(v: unknown): T[] { if (Array.isArray(v)) return v as T[]; if (typeof v === 'string' && v) { try { const p = JSON.parse(v); return Array.isArray(p) ? p as T[] : [] } catch { return [] } } return [] }

type IssueItem = {category:string;passed:boolean;severity?:string;label:string;detail?:string;fix_instructions?:string[]}
type AdaItem = {impact?:string;id:string;nodes?:number;description:string;fix_instructions?:string;helpUrl?:string}
function getIssues(audit: Audit): IssueItem[] { return Array.isArray(audit.issues) ? audit.issues as IssueItem[] : JSON.parse((audit.issues as string) || '[]') as IssueItem[] }
function getAdaViolations(audit: Audit): AdaItem[] { return Array.isArray(audit.ada_violations) ? audit.ada_violations as AdaItem[] : JSON.parse((audit.ada_violations as string) || '[]') as AdaItem[] }

function buildScoreRing(score: number | null, size = 100) {
  const r = 40, circ = 2 * Math.PI * r
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  const offset = circ * (1 - pct)
  const cls = score != null ? scoreClass(score) : 'empty'
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><circle class="score-ring-track" cx="50" cy="50" r="${r}"/><circle class="score-ring-fill ${cls}" cx="50" cy="50" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/></svg>`
}

function renderCatScore(label: string, score: number | null, sub: string | null) {
  const cls = scoreClass(score); const pct = score != null ? Math.max(0, Math.min(100, score)) : 0
  return `<div class="score-card"><div class="score-card-label">${label}</div><div class="category-score"><div class="cat-score-num ${cls}">${score != null ? score : 'N/A'}</div><div class="cat-score-bar"><div class="cat-score-bar-fill ${score != null ? cls : ''}" style="width:${score != null ? pct : 0}%"></div></div><div class="cat-score-checks">${sub || (score == null ? 'Not run' : 'No issues')}</div></div></div>`
}

// ─── Period aggregation helpers ────────────────────────────────────────────────
function aggregatePeriodRows(rows: AnalyticsRow[]): AnalyticsRow | null {
  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]
  const totalVisitors = rows.reduce((s, r) => s + (r.monthly_visitors || 0), 0)
  const avgTime = rows.reduce((s, r) => s + (r.avg_time_seconds || 0), 0) / rows.length
  const avgBounce = rows.reduce((s, r) => s + (r.bounce_rate || 0), 0) / rows.length
  const avgMobile = rows.reduce((s, r) => s + (r.mobile_pct || 0), 0) / rows.length
  const pageMap = new Map<string, {title: string; url: string; views: number}>()
  rows.forEach(r => {
    parseArr<{title:string;url:string;views:number}>(r.top_pages).forEach(p => {
      const ex = pageMap.get(p.url)
      if (ex) ex.views += p.views
      else pageMap.set(p.url, {...p})
    })
  })
  const top_pages = Array.from(pageMap.values()).sort((a, b) => b.views - a.views).slice(0, 10)
  const srcMap = new Map<string, {source: string; sessions: number}>()
  rows.forEach(r => {
    parseArr<{source:string;sessions:number|string;pct:string}>(r.traffic_sources).forEach(s => {
      const ex = srcMap.get(s.source)
      const n = Number(s.sessions)
      if (ex) ex.sessions += n
      else srcMap.set(s.source, {source: s.source, sessions: n})
    })
  })
  const totalSrc = Array.from(srcMap.values()).reduce((s, x) => s + x.sessions, 0)
  const traffic_sources = Array.from(srcMap.values())
    .sort((a, b) => b.sessions - a.sessions)
    .map(s => ({source: s.source, sessions: s.sessions, pct: totalSrc > 0 ? (s.sessions / totalSrc * 100).toFixed(1) : '0'}))
  const qMap = new Map<string, {query: string; clicks: number; impressions: number}>()
  rows.forEach(r => {
    parseArr<{query:string;clicks:number;impressions:number}>(r.top_queries).forEach(q => {
      const ex = qMap.get(q.query)
      if (ex) { ex.clicks += q.clicks; ex.impressions += q.impressions }
      else qMap.set(q.query, {...q})
    })
  })
  const top_queries = Array.from(qMap.values()).sort((a, b) => b.clicks - a.clicks).slice(0, 10)
  return {
    period: rows.length === 1 ? rows[0].period : `${rows[rows.length-1].period} to ${rows[0].period}`,
    monthly_visitors: totalVisitors,
    avg_time_seconds: Math.round(avgTime),
    bounce_rate: parseFloat(avgBounce.toFixed(2)),
    mobile_pct: parseFloat(avgMobile.toFixed(1)),
    top_pages, traffic_sources, top_queries,
    synced_at: rows[0]?.synced_at,
  }
}

function getAnalyticsPeriodRows(rows: AnalyticsRow[], mode: PeriodMode, calYear: number, schoolStart: number, customFrom: string, customTo: string): { curRows: AnalyticsRow[], prevRows: AnalyticsRow[], label: string, prevLabel: string } {
  // rows have period like "2026-06"
  let from: string, to: string, prevFrom: string, prevTo: string, label: string, prevLabel: string
  if (mode === 'calendar') {
    from = `${calYear}-01`; to = `${calYear}-12`
    prevFrom = `${calYear-1}-01`; prevTo = `${calYear-1}-12`
    label = String(calYear); prevLabel = String(calYear-1)
  } else if (mode === 'school') {
    from = `${schoolStart}-08`; to = `${schoolStart+1}-07`
    prevFrom = `${schoolStart-1}-08`; prevTo = `${schoolStart}-07`
    label = `${schoolStart}-${String(schoolStart+1).slice(-2)}`
    prevLabel = `${schoolStart-1}-${String(schoolStart).slice(-2)}`
  } else {
    if (!customFrom || !customTo) return { curRows: [], prevRows: [], label: 'Custom', prevLabel: 'Previous period' }
    from = customFrom.slice(0, 7); to = customTo.slice(0, 7)
    const days = (new Date(customTo).getTime() - new Date(customFrom).getTime()) / 86400000
    const prevToDate = new Date(new Date(customFrom).getTime() - 86400000)
    const prevFromDate = new Date(prevToDate.getTime() - days * 86400000)
    prevFrom = prevFromDate.toISOString().slice(0, 7)
    prevTo = prevToDate.toISOString().slice(0, 7)
    label = `${customFrom} to ${customTo}`
    prevLabel = `${prevFrom} to ${prevTo}`
  }
  const curRows = rows.filter(r => r.period >= from && r.period <= to)
  const prevRows = rows.filter(r => r.period >= prevFrom && r.period <= prevTo)
  return { curRows, prevRows, label, prevLabel }
}

// ─── Main content ─────────────────────────────────────────────────────────────
function DepartmentContent() {
  const searchParams = useSearchParams()
  const id = searchParams.get('id')
  const supabase = createClient()
  const { role } = useBCPSShell()
  const isAdmin = role === 'superadmin'

  const [dept, setDept] = useState<Dept | null>(null)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [history, setHistory] = useState<Audit[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCat, setActiveCat] = useState('all')
  const [auditRunning, setAuditRunning] = useState(false)
  const [auditStep, setAuditStep] = useState('')
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null)
  const [expandedIssues, setExpandedIssues] = useState<Set<number>>(new Set())
  const [expandedAda, setExpandedAda] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'audit' | 'ada' | 'analytics'>('audit')
  const [adaScope, setAdaScope] = useState<'wcm' | 'finalsite'>('wcm')

  // Analytics period state
  const [periodMode, setPeriodMode] = useState<PeriodMode>('calendar')
  const [calYear, setCalYear] = useState(CUR_YEAR_D)
  const [schoolStart, setSchoolStart] = useState(CUR_SCHOOL_START_D)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customFromInput, setCustomFromInput] = useState('')
  const [customToInput, setCustomToInput] = useState('')

  const showToast = useCallback((msg: string, type?: string) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  useEffect(() => {
    if (!id) { setError('No department ID provided.'); setLoading(false); return }
    const load = async () => {
      try {
        const [deptRes, auditRes, histRes, analyticsRes] = await Promise.all([
          supabase.from('bcps_departments').select('*').eq('id', id).single(),
          supabase.from('bcps_audit_results').select('*').eq('department_id', id).order('audited_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('bcps_audit_results').select('id,audited_at,overall_score,layout_score,content_score,nav_score,ada_score,status,auditor').eq('department_id', id).order('audited_at', { ascending: false }).limit(10),
          supabase.from('bcps_department_analytics').select('*').eq('department_id', id).order('period', { ascending: false }).limit(24)
        ])
        if (deptRes.error || !deptRes.data) { setError('Department not found.'); setLoading(false); return }
        setDept(deptRes.data)
        setAudit(auditRes.data || null)
        setHistory(histRes.data || [])
        setAnalytics(analyticsRes.data || [])
        document.title = deptRes.data.name + ' - Audit Profile | Broward County Public Schools'
      } catch { setError('Failed to load department data. Please refresh.') }
      finally { setLoading(false) }
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const runAudit = useCallback(async () => {
    if (!dept) return
    setAuditRunning(true)
    const steps = ['Scanning page structure...', 'Running Phase 1 checklist...', 'Running ADA scan...', 'Scoring results...']
    let i = 0
    setAuditStep(steps[0])
    const interval = setInterval(() => { i++; if (i < steps.length) setAuditStep(steps[i]) }, 900)
    try {
      const res = await fetch('/api/bcps/run-audit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ department_id: dept.id }) })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'Audit failed')
      setAudit(json.result)
      setHistory(prev => [json.result, ...prev.filter((h: Audit) => h.id !== json.result.id)].slice(0, 10))
      showToast('Audit complete.', 'success')
    } catch (e: unknown) {
      showToast((e instanceof Error ? e.message : 'Audit failed') + ' Please try again.', 'error')
    } finally {
      clearInterval(interval)
      setAuditRunning(false)
      setAuditStep('')
    }
  }, [dept, showToast])

  const loadHistoricalAudit = useCallback(async (auditId: string) => {
    if (audit?.id === auditId) return
    try {
      const { data } = await supabase.from('bcps_audit_results').select('*').eq('id', auditId).single()
      if (data) { setAudit(data); showToast('Viewing audit from ' + fmtDate(data.audited_at)) }
    } catch { showToast('Could not load this audit.', 'error') }
  }, [audit, supabase, showToast])

  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:300}}><div style={{width:32,height:32,border:'3px solid rgba(22,114,167,.15)',borderTopColor:'#1672A7',borderRadius:'50%',animation:'spin .7s linear infinite'}} /></div>
  if (error || !dept) return (
    <div style={{textAlign:'center',padding:'80px 20px',color:'rgba(26,26,26,0.55)'}}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{margin:'0 auto 12px',display:'block',opacity:0.4}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <h3 style={{fontSize:15,fontWeight:700,color:'#1a1a1a',marginBottom:6}}>Something went wrong</h3>
      <p style={{fontSize:13}}>{error || 'Department not found.'} <a href="/bcps?page=departments" style={{color:'#1672A7'}}>Return to departments</a></p>
    </div>
  )

  const a = audit
  const overallScore = a?.overall_score ?? null
  const adaCritical = a?.ada_violations_critical ?? 0
  const adaSerious = a?.ada_violations_serious ?? 0
  const adaModerate = a?.ada_violations_moderate ?? 0
  const adaMinor = a?.ada_violations_minor ?? 0
  const hClass = healthClass(dept.health_status)
  const issues = a ? getIssues(a) : []
  const adaViolations = a ? getAdaViolations(a) : []
  const cats = ['all', ...Array.from(new Set(issues.map(i => i.category)))]
  const visibleIssues = activeCat === 'all' ? issues : issues.filter(i => i.category === activeCat)
  const failedCount = visibleIssues.filter(i => !i.passed).length
  const adaSorted = [...adaViolations].sort((a, b) => { const o: Record<string,number> = {critical:0,serious:1,moderate:2,minor:3}; return (o[a.impact||'']??4)-(o[b.impact||'']??4) })
  // ADA scope classification: WCM can fix in Finalsite PageBuilder vs. requires Finalsite/template-level ticket
  const WCM_FIXABLE_IDS = new Set(['image-alt', 'heading-order', 'link-name', 'pdf-tagged', 'color-contrast'])
  const adaWcmItems = adaSorted.filter(v => WCM_FIXABLE_IDS.has(v.id))
  const adaFinalsiteItems = adaSorted.filter(v => !WCM_FIXABLE_IDS.has(v.id))
  const adaScoped = adaScope === 'wcm' ? adaWcmItems : adaFinalsiteItems

  // Analytics - period-aware
  const analyticsRows = [...analytics].sort((a, b) => b.period.localeCompare(a.period))
  const { curRows, prevRows, label: periodLabel, prevLabel } = getAnalyticsPeriodRows(analyticsRows, periodMode, calYear, schoolStart, customFrom, customTo)
  const cur = aggregatePeriodRows(curRows)
  const prev = aggregatePeriodRows(prevRows)

  function delta(curVal?: number | null, prevVal?: number | null, lowerIsBetter = false) {
    if (!prevVal || !curVal) return ''
    const diff = ((curVal - prevVal) / prevVal) * 100
    const dir = lowerIsBetter ? (diff > 0 ? 'down' : 'up') : (diff > 0 ? 'up' : 'down')
    return `<div class="analytics-kpi-delta ${dir}">${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs ${prevLabel}</div>`
  }

  // Sparkline uses curRows (monthly detail)
  let sparklineHTML = ''
  if (curRows.length > 0) {
    const sparkRows = [...curRows].sort((a, b) => a.period.localeCompare(b.period))
    const vals = sparkRows.map(r => r.monthly_visitors || 0)
    const maxV = Math.max(...vals, 1)
    const W = 900, H = 80, pad = 4
    const points = vals.map((v, i) => { const x = pad + (i/Math.max(vals.length-1,1))*(W-pad*2); const y = H-pad-((v/maxV)*(H-pad*2)); return x.toFixed(1)+','+y.toFixed(1) }).join(' ')
    const lastX = W - pad, lastY = (H-pad-((vals[vals.length-1]/maxV)*(H-pad*2))).toFixed(1)
    const areaPoints = 'M '+pad+','+H+' L '+points.split(' ').map(p=>'L '+p).join(' ').substring(2)+' L '+lastX+','+H+' Z'
    sparklineHTML = `<svg class="analytics-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1672a7" stop-opacity="0.18"/><stop offset="100%" stop-color="#1672a7" stop-opacity="0.02"/></linearGradient></defs><path d="${areaPoints}" fill="url(#sg)"/><polyline points="${points}" fill="none" stroke="#1672a7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pad}" cy="${(H-pad-((vals[0]/maxV)*(H-pad*2))).toFixed(1)}" r="4" fill="#1672a7"/><circle cx="${lastX}" cy="${lastY}" r="4" fill="#1672a7"/></svg><div style="display:flex;justify-content:space-between;font-size:10px;color:var(--lr-text-50);margin-top:6px"><span>${sparkRows[0]?.period||''}</span><span>${sparkRows[sparkRows.length-1]?.period||''}</span></div>`
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800;900&display=swap');
        :root{--bcps-blue:#1672A7;--bcps-blue-dark:#125e8a;--lr-bg:#f0f4f8;--lr-border:#dde3ea;--lr-text:#262626;--lr-text-75:#525252;--lr-text-50:#767676;--score-green:#16750C;--score-green-bg:#edf7ea;--score-yellow:#854F0B;--score-yellow-bg:#fef3e2;--score-red:#A32D2D;--score-red-bg:#fdf0f0;--sev-critical:#7C0E0E;--sev-critical-bg:#fce8e8;--sev-serious:#A32D2D;--sev-serious-bg:#fdf0f0;--sev-moderate:#854F0B;--sev-moderate-bg:#fef3e2;--sev-minor:#1a5276;--sev-minor-bg:#e8f1f8}
        .dept-page{padding:28px;background:var(--lr-bg);min-height:100%;width:100%;box-sizing:border-box}
        .dept-loading{display:flex;align-items:center;justify-content:center;min-height:300px}.dept-spinner{width:32px;height:32px;border:3px solid rgba(22,114,167,.15);border-top-color:var(--bcps-blue);border-radius:50%;animation:spin .7s linear infinite}
        .dept-error-state{text-align:center;padding:80px 20px;color:var(--lr-text-50)}.dept-error-state svg{width:36px;height:36px;margin:0 auto 12px;display:block;opacity:.4}.dept-error-state h3{font-size:15px;font-weight:700;color:var(--lr-text);margin-bottom:6px}.dept-error-state p{font-size:13px}.dept-error-state a{color:var(--bcps-blue)}
        @keyframes spin{to{transform:rotate(360deg)}}
        .dept-header{background:#fff;border:1px solid var(--lr-border);border-radius:12px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
        .dept-header-left{flex:1;min-width:0}
        .dept-header-eyebrow{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:var(--bcps-blue);margin-bottom:4px}
        .dept-header-name{font-size:20px;font-weight:900;color:var(--lr-text);line-height:1.2;margin-bottom:10px}
        .dept-header-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .health-badge{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border-radius:20px;flex-shrink:0}
        .health-badge.healthy{background:#edf7ea;color:#16750C}.health-badge.review{background:#fef3e2;color:#854F0B}.health-badge.at-risk{background:#fdf0f0;color:#A32D2D}.health-badge.unassessed{background:rgba(26,26,26,.06);color:var(--lr-text-50)}
        .dept-website-link{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:800;color:var(--bcps-blue);text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border:1.5px solid var(--bcps-blue);border-radius:20px;text-decoration:none;transition:background .12s}
        .dept-website-link:hover{background:#f0f7fd}.dept-website-link svg{stroke:currentColor;fill:none;stroke-width:2;width:10px;height:10px}
        .audited-ts{font-size:10px;color:var(--lr-text-50);font-weight:600}
        .btn-primary{background:var(--bcps-blue);color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:background .12s;font-family:inherit}
        .btn-primary:hover{background:var(--bcps-blue-dark)}.btn-primary:disabled{opacity:.5;cursor:not-allowed}
        .btn-primary svg{stroke:currentColor;fill:none;stroke-width:2;width:13px;height:13px}
        .btn-secondary{background:#fff;color:var(--lr-text);border:1px solid var(--lr-border);border-radius:8px;padding:9px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:border-color .12s,background .12s;text-decoration:none;font-family:inherit}
        .btn-secondary:hover{border-color:var(--bcps-blue);background:#f0f7fd}.btn-secondary svg{stroke:currentColor;fill:none;stroke-width:2;width:13px;height:13px}
        .scores-row{display:grid;grid-template-columns:180px repeat(4,1fr);gap:14px;margin-bottom:20px}
        .score-card{background:#fff;border:1px solid var(--lr-border);border-radius:12px;padding:20px 18px;text-align:center}
        .score-card.overall{display:flex;flex-direction:column;align-items:center;justify-content:center}
        .score-card-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:var(--lr-text-50);margin-bottom:12px}
        .score-ring-wrap{position:relative;width:100px;height:100px;margin:0 auto 10px}.score-ring-wrap svg{transform:rotate(-90deg)}
        .score-ring-track{fill:none;stroke:rgba(26,26,26,.08);stroke-width:8}.score-ring-fill{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)}
        .score-ring-fill.green{stroke:#16750C}.score-ring-fill.yellow{stroke:#C97A1B}.score-ring-fill.red{stroke:#A32D2D}.score-ring-fill.empty{stroke:rgba(26,26,26,.15)}
        .score-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:var(--lr-text)}.score-ring-num.na{font-size:14px;color:var(--lr-text-50)}
        .category-score{display:flex;flex-direction:column;align-items:center}
        .cat-score-num{font-size:32px;font-weight:900;line-height:1;margin-bottom:4px}.cat-score-num.green{color:var(--score-green)}.cat-score-num.yellow{color:var(--score-yellow)}.cat-score-num.red{color:var(--score-red)}.cat-score-num.na{color:var(--lr-text-50);font-size:18px}
        .cat-score-bar{width:100%;height:6px;background:rgba(26,26,26,.08);border-radius:3px;overflow:hidden;margin-bottom:8px}
        .cat-score-bar-fill{height:100%;border-radius:3px;transition:width .8s cubic-bezier(.4,0,.2,1)}.cat-score-bar-fill.green{background:var(--score-green)}.cat-score-bar-fill.yellow{background:#C97A1B}.cat-score-bar-fill.red{background:var(--score-red)}
        .cat-score-checks{font-size:10px;font-weight:600;color:var(--lr-text-50)}
        .ada-severity-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .sev-tile{border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:12px;border:1px solid transparent}
        .sev-tile.critical{background:var(--sev-critical-bg);border-color:rgba(124,14,14,.15)}.sev-tile.serious{background:var(--sev-serious-bg);border-color:rgba(163,45,45,.15)}.sev-tile.moderate{background:var(--sev-moderate-bg);border-color:rgba(133,79,11,.15)}.sev-tile.minor{background:var(--sev-minor-bg);border-color:rgba(26,82,118,.15)}
        .sev-count{font-size:28px;font-weight:900;line-height:1}.sev-tile.critical .sev-count{color:var(--sev-critical)}.sev-tile.serious .sev-count{color:var(--sev-serious)}.sev-tile.moderate .sev-count{color:var(--sev-moderate)}.sev-tile.minor .sev-count{color:var(--sev-minor)}
        .sev-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.sev-tile.critical .sev-label{color:var(--sev-critical)}.sev-tile.serious .sev-label{color:var(--sev-serious)}.sev-tile.moderate .sev-label{color:var(--sev-moderate)}.sev-tile.minor .sev-label{color:var(--sev-minor)}
        .sev-sub{font-size:9px;color:rgba(26,26,26,.5);font-weight:600;margin-top:2px}
        .content-cols{display:grid;grid-template-columns:1fr 340px;gap:16px;margin-bottom:20px}
        .panel{background:#fff;border:1px solid var(--lr-border);border-radius:12px}
        .panel-header{padding:16px 20px 12px;border-bottom:1px solid var(--lr-border);display:flex;align-items:center;justify-content:space-between;gap:8px}
        .panel-title{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;color:var(--lr-text)}.panel-count{font-size:10px;font-weight:700;color:var(--lr-text-50)}
        .panel-body{padding:16px 20px}
        .cat-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px}
        .cat-tab{background:rgba(26,26,26,.05);border:1px solid transparent;border-radius:6px;padding:5px 12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--lr-text-50);cursor:pointer;transition:all .12s;font-family:inherit}
        .cat-tab:hover{background:rgba(26,26,26,.08);color:var(--lr-text)}.cat-tab.active{background:var(--bcps-blue);color:#fff;border-color:var(--bcps-blue)}
        .dept-tab-bar{display:flex;border-bottom:1px solid var(--lr-border);gap:0;padding:0 4px}
        .dept-tab{background:none;border:none;border-bottom:2px solid transparent;padding:12px 16px;font-size:11px;font-weight:700;color:var(--lr-text-50);cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;transition:all .12s;white-space:nowrap;margin-bottom:-1px}
        .dept-tab:hover{color:var(--lr-text)}.dept-tab.active{color:var(--bcps-blue);border-bottom-color:var(--bcps-blue)}
        .dept-tab-badge{background:var(--sev-critical-bg);color:var(--sev-critical);font-size:9px;font-weight:900;padding:1px 5px;border-radius:10px;line-height:1.4}
        .dept-tab-badge.warn{background:#FEF3C7;color:#D97706}
        .ada-scope-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
        .ada-scope-label{font-size:10px;font-weight:700;color:var(--lr-text-50);text-transform:uppercase;letter-spacing:.1em}
        .ada-scope-toggle{display:flex;background:rgba(0,0,0,.05);border-radius:7px;padding:2px;gap:2px}
        .ada-scope-btn{font-size:10px;font-weight:700;padding:5px 12px;border:none;border-radius:5px;cursor:pointer;font-family:inherit;transition:all .12s}
        .ada-scope-btn.active{background:#fff;color:var(--bcps-blue);box-shadow:0 1px 3px rgba(0,0,0,.1)}.ada-scope-btn.inactive{background:transparent;color:var(--lr-text-50)}
        .ada-scope-note{font-size:11px;color:var(--lr-text-50);padding:10px 14px;background:#F8FAFC;border-radius:8px;margin-bottom:14px;border-left:3px solid var(--bcps-blue)}
        .issue-list{display:flex;flex-direction:column;gap:10px}
        .issue-card{border:1px solid var(--lr-border);border-radius:8px;overflow:hidden}
        .issue-card.passed{border-color:rgba(22,117,12,.2)}.issue-card.failed.severity-critical{border-color:rgba(124,14,14,.25)}.issue-card.failed.severity-high{border-color:rgba(163,45,45,.2)}.issue-card.failed.severity-medium{border-color:rgba(133,79,11,.2)}.issue-card.failed.severity-low{border-color:rgba(26,82,118,.2)}
        .issue-card-header{padding:10px 14px;display:flex;align-items:flex-start;gap:10px;cursor:pointer;user-select:none}
        .issue-card.passed .issue-card-header{background:rgba(22,117,12,.03)}.issue-card.failed.severity-critical .issue-card-header{background:rgba(124,14,14,.04)}.issue-card.failed.severity-high .issue-card-header{background:rgba(163,45,45,.04)}.issue-card.failed.severity-medium .issue-card-header{background:rgba(133,79,11,.04)}.issue-card.failed.severity-low .issue-card-header{background:rgba(26,82,118,.04)}
        .issue-check-icon{flex-shrink:0;margin-top:1px}.issue-check-icon svg{stroke:currentColor;fill:none;stroke-width:2.5;width:14px;height:14px}.issue-check-icon.pass svg{stroke:#16750C}.issue-check-icon.fail svg{stroke:#A32D2D}
        .issue-body{flex:1;min-width:0}.issue-label{font-size:12px;font-weight:800;color:var(--lr-text);line-height:1.3}.issue-detail{font-size:11px;color:var(--lr-text-75);margin-top:3px}
        .issue-sev{flex-shrink:0;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;padding:2px 7px;border-radius:4px}
        .issue-sev.critical{background:var(--sev-critical-bg);color:var(--sev-critical)}.issue-sev.high{background:var(--sev-serious-bg);color:var(--sev-serious)}.issue-sev.medium{background:var(--sev-moderate-bg);color:var(--sev-moderate)}.issue-sev.low{background:var(--sev-minor-bg);color:var(--sev-minor)}
        .issue-expand-btn{flex-shrink:0;color:var(--lr-text-50);background:none;border:none;padding:2px;cursor:pointer;display:flex;align-items:center;transition:color .12s;font-family:inherit}
        .issue-expand-btn:hover{color:var(--lr-text)}.issue-expand-btn svg{stroke:currentColor;fill:none;stroke-width:2;width:13px;height:13px;transition:transform .2s}.issue-expand-btn.open svg{transform:rotate(180deg)}
        .issue-fix{padding:12px 14px;border-top:1px solid var(--lr-border);background:#fff}.issue-fix-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;color:var(--lr-text-50);margin-bottom:8px}
        .issue-fix-steps{list-style:none;display:flex;flex-direction:column;gap:6px}.issue-fix-steps li{display:flex;gap:8px;align-items:flex-start}
        .issue-fix-step-num{background:var(--bcps-blue);color:#fff;border-radius:50%;width:18px;height:18px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;margin-top:1px}
        .issue-fix-step-text{font-size:11px;color:var(--lr-text-75);line-height:1.45}
        .empty-state{text-align:center;padding:40px 20px;color:var(--lr-text-50)}.empty-state svg{stroke:currentColor;fill:none;stroke-width:1.5;width:36px;height:36px;margin:0 auto 10px;display:block}.empty-state-title{font-size:13px;font-weight:700;color:var(--lr-text);margin-bottom:4px}.empty-state-text{font-size:12px}
        .info-panel{background:#fff;border:1px solid var(--lr-border);border-radius:12px;margin-bottom:14px}
        .info-section{padding:14px 16px;border-bottom:1px solid var(--lr-border)}.info-section:last-child{border-bottom:none}
        .info-section-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;color:var(--lr-text-50);margin-bottom:10px}
        .info-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:7px}.info-row:last-child{margin-bottom:0}
        .info-label{font-size:10px;font-weight:700;color:var(--lr-text-50);flex-shrink:0}.info-value{font-size:11px;font-weight:700;color:var(--lr-text);text-align:right}.info-value.unset{color:var(--lr-text-50);font-style:italic;font-weight:600}
        .info-value a{color:var(--bcps-blue);display:flex;align-items:center;gap:3px}.info-value a:hover{text-decoration:underline}
        .history-card{padding:10px 0;border-bottom:1px solid var(--lr-border);cursor:pointer}.history-card:last-child{border-bottom:none}.history-card:hover{background:rgba(22,114,167,.03)}
        .history-card-date{font-size:10px;font-weight:700;color:var(--lr-text-50);margin-bottom:6px;display:flex;align-items:center;gap:6px}
        .history-card-scores{display:flex;flex-wrap:wrap;gap:5px}
        .score-pill{display:inline-flex;align-items:center;justify-content:center;width:34px;height:20px;border-radius:4px;font-size:10px;font-weight:900}
        .score-pill.green{background:var(--score-green-bg);color:var(--score-green)}.score-pill.yellow{background:var(--score-yellow-bg);color:var(--score-yellow)}.score-pill.red{background:var(--score-red-bg);color:var(--score-red)}.score-pill.na{background:rgba(26,26,26,.06);color:var(--lr-text-50)}
        .ada-violations-list{display:flex;flex-direction:column;gap:8px}
        .ada-violation-card{border:1px solid var(--lr-border);border-radius:8px;overflow:hidden}
        .ada-violation-header{padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer;background:#fff}
        .ada-violation-impact{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;padding:2px 7px;border-radius:4px;flex-shrink:0}
        .ada-violation-impact.critical{background:var(--sev-critical-bg);color:var(--sev-critical)}.ada-violation-impact.serious{background:var(--sev-serious-bg);color:var(--sev-serious)}.ada-violation-impact.moderate{background:var(--sev-moderate-bg);color:var(--sev-moderate)}.ada-violation-impact.minor{background:var(--sev-minor-bg);color:var(--sev-minor)}
        .ada-violation-id{font-size:11px;font-weight:800;color:var(--lr-text);flex:1}.ada-violation-nodes{font-size:10px;color:var(--lr-text-50);font-weight:600;flex-shrink:0}
        .ada-violation-detail{padding:10px 14px 12px;border-top:1px solid var(--lr-border);background:#fff}
        .ada-violation-desc{font-size:11px;color:var(--lr-text-75);margin-bottom:8px}.ada-violation-fix-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.18em;color:var(--lr-text-50);margin-bottom:6px}
        .ada-violation-fix{font-size:11px;color:var(--lr-text-75);line-height:1.45}
        .ada-violation-link{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--bcps-blue);margin-top:6px}.ada-violation-link:hover{text-decoration:underline}.ada-violation-link svg{stroke:currentColor;fill:none;stroke-width:2;width:10px;height:10px}
        .queue-banner{display:inline-flex;align-items:center;gap:5px;background:#fef3e2;color:#854F0B;border:1px solid rgba(133,79,11,.2);border-radius:8px;padding:8px 14px;font-size:11px;font-weight:700;margin-bottom:16px}
        .queue-banner svg{stroke:currentColor;fill:none;stroke-width:2;width:13px;height:13px}
        .analytics-section{margin-top:24px}
        .analytics-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
        .analytics-header h2{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:var(--lr-text);margin:0}.analytics-sync-info{font-size:11px;color:var(--lr-text-50)}
        .analytics-period-bar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--lr-border)}
        .analytics-period-toggle{display:flex;background:rgba(0,0,0,.05);border-radius:7px;padding:2px;gap:2px}
        .analytics-period-btn{font-size:10px;font-weight:700;padding:5px 11px;border:none;border-radius:5px;cursor:pointer;font-family:inherit;transition:all .12s}
        .analytics-period-btn.active{background:#fff;color:var(--bcps-blue);box-shadow:0 1px 3px rgba(0,0,0,.1)}.analytics-period-btn.inactive{background:transparent;color:var(--lr-text-50)}
        .analytics-period-select{font-size:11px;font-weight:700;padding:5px 8px;border:1px solid var(--lr-border);border-radius:6px;color:var(--lr-text);background:#fff;cursor:pointer;font-family:inherit}
        .analytics-period-custom{display:flex;align-items:center;gap:6px}
        .analytics-period-date{font-size:11px;padding:5px 7px;border:1px solid var(--lr-border);border-radius:6px;font-family:inherit;color:var(--lr-text)}
        .analytics-period-apply{font-size:10px;font-weight:700;padding:5px 10px;background:var(--bcps-blue);color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit}
        .analytics-period-vs{font-size:10px;color:var(--lr-text-50);font-weight:600}
        .analytics-kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
        .analytics-kpi{background:#fff;border:1px solid var(--lr-border);border-radius:10px;padding:16px}
        .analytics-kpi-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--lr-text-50);margin-bottom:6px}
        .analytics-kpi-value{font-size:24px;font-weight:800;color:var(--lr-text);line-height:1}
        .analytics-kpi-delta{font-size:11px;font-weight:600;margin-top:4px}.analytics-kpi-delta.up{color:#1a7a3c}.analytics-kpi-delta.down{color:#b91c1c}.analytics-kpi-delta.neutral{color:var(--lr-text-50)}
        .analytics-chart-card{background:#fff;border:1px solid var(--lr-border);border-radius:10px;padding:18px;margin-bottom:20px}
        .analytics-chart-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--lr-text-50);margin-bottom:14px}
        .analytics-sparkline{width:100%;height:80px}
        .analytics-breakdowns{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
        .analytics-table-card{background:#fff;border:1px solid var(--lr-border);border-radius:10px;padding:18px}
        .analytics-table-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--lr-text-50);margin-bottom:12px}
        .analytics-table{width:100%;border-collapse:collapse}.analytics-table th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--lr-text-50);text-align:left;padding-bottom:8px;border-bottom:1px solid var(--lr-border)}
        .analytics-table td{font-size:12px;color:var(--lr-text-50);padding:7px 0;border-bottom:1px solid #f3f4f6;vertical-align:middle}.analytics-table tr:last-child td{border-bottom:none}
        .analytics-table td.num{font-weight:700;color:var(--lr-text);text-align:right}.analytics-table td.url{font-size:10.5px;color:var(--lr-text-50);font-weight:400}
        .analytics-bar-wrap{width:80px;height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:8px}
        .analytics-bar-fill{height:100%;background:var(--bcps-blue);border-radius:999px}
        .analytics-queries-card{background:#fff;border:1px solid var(--lr-border);border-radius:10px;padding:18px;margin-bottom:20px}
        .analytics-empty{text-align:center;padding:48px 20px;color:var(--lr-text-50);font-size:13px}.analytics-empty svg{width:32px;height:32px;margin:0 auto 12px;display:block;opacity:.35}
        .dept-toast{position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:12px 18px;border-radius:8px;font-size:12px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:1000;max-width:320px}
        .dept-toast.success{background:#16750C}.dept-toast.error{background:#A32D2D}
        @media(max-width:900px){.scores-row{grid-template-columns:repeat(3,1fr)}.ada-severity-row{grid-template-columns:repeat(2,1fr)}.content-cols{grid-template-columns:1fr}.analytics-kpi-row{grid-template-columns:repeat(2,1fr)}.analytics-breakdowns{grid-template-columns:1fr}}
        @media(max-width:600px){.dept-page{padding:16px}.scores-row{grid-template-columns:repeat(2,1fr)}}
      `}</style>

      <div className="dept-page">
        {/* HEADER */}
        <div className="dept-header">
          <div className="dept-header-left">
            <div className="dept-header-eyebrow">{dept.division || 'Chief of Staff'}</div>
            <div className="dept-header-name">{dept.name}</div>
            <div className="dept-header-meta">
              <span className={`health-badge ${hClass}`}>{healthLabel(dept.health_status)}</span>
              {dept.website_url && (
                <a className="dept-website-link" href={dept.website_url} target="_blank" rel="noopener">
                  Visit Finalsite Page
                  <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              )}
              {a && <span className="audited-ts">Last audited {fmtDate(a.audited_at)}</span>}
              <div style={{flex:1,minWidth:16}} />
              <a className="btn-secondary" href="/?page=departments">
                <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>Back
              </a>
              {isAdmin ? (
                <button className="btn-primary" disabled={!dept.website_url || auditRunning} onClick={runAudit}>
                  {auditRunning
                    ? <><span style={{width:13,height:13,border:'2px solid rgba(255,255,255,.4)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite'}} /> Running...</>
                    : <><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Run Audit</>
                  }
                </button>
              ) : (
                <button className="btn-primary" disabled>
                  <svg viewBox="0 0 24 24"><path d="M8 11V7a4 4 0 0 1 8 0v4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/></svg>
                  Run Audit
                </button>
              )}
            </div>
            {!isAdmin && <div style={{fontSize:11,color:'var(--lr-text-50)',marginTop:6,textAlign:'right'}}>Scheduled: 1st of each month</div>}
            {auditRunning && auditStep && (
              <div style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'8px 12px',background:'#EBF4FA',borderRadius:8,fontSize:11,fontWeight:700,color:'#1672A7'}}>
                <span style={{width:11,height:11,border:'2px solid rgba(22,114,167,.3)',borderTopColor:'#1672A7',borderRadius:'50%',display:'inline-block',animation:'spin .7s linear infinite',flexShrink:0}} />
                {auditStep}
              </div>
            )}
          </div>
        </div>

        {!a && (
          <div className="queue-banner">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            No audit on record. Click &quot;Run Audit&quot; to queue a full Phase 1 + ADA scan.
          </div>
        )}

        {/* SCORES */}
        <div className="scores-row">
          <div className="score-card overall">
            <div className="score-card-label">Overall Score</div>
            <div className="score-ring-wrap" dangerouslySetInnerHTML={{__html: buildScoreRing(overallScore) + `<div class="score-ring-num${overallScore==null?' na':''}">${overallScore!=null?overallScore:'N/A'}</div>`}} />
            <div style={{fontSize:10,fontWeight:700,color:'var(--lr-text-50)'}}>{a ? statusLabel(a.status) : 'Not audited'}</div>
          </div>
          <div dangerouslySetInnerHTML={{__html: renderCatScore('Layout', a?.layout_score??null, a ? (issues.filter(i=>i.category==='layout'&&!i.passed).length + ' issues') : null)}} />
          <div dangerouslySetInnerHTML={{__html: renderCatScore('Content', a?.content_score??null, a ? (issues.filter(i=>i.category==='content'&&!i.passed).length + ' issues') : null)}} />
          <div dangerouslySetInnerHTML={{__html: renderCatScore('Navigation', a?.nav_score??null, a ? (issues.filter(i=>i.category==='nav'&&!i.passed).length + ' issues') : null)}} />
          <div dangerouslySetInnerHTML={{__html: renderCatScore('ADA', a?.ada_score??null, adaCritical+adaSerious > 0 ? `${adaCritical+adaSerious} critical/serious` : null)}} />
        </div>

        {/* ADA SEVERITY */}
        <div className="ada-severity-row">
          {[{cls:'critical',label:'Critical',count:adaCritical},{cls:'serious',label:'Serious',count:adaSerious},{cls:'moderate',label:'Moderate',count:adaModerate},{cls:'minor',label:'Minor',count:adaMinor}].map(s => (
            <div key={s.cls} className={`sev-tile ${s.cls}`}>
              <div><div className="sev-count">{s.count}</div></div>
              <div><div className="sev-label">{s.label}</div><div className="sev-sub">ADA violations</div></div>
            </div>
          ))}
        </div>

        {/* CONTENT COLS */}
        <div className="content-cols">
          <div>
            {/* TABBED PANEL */}
            <div className="panel">
              {/* Tab bar */}
              <div className="dept-tab-bar">
                <button className={`dept-tab${activeTab==='audit'?' active':''}`} onClick={() => setActiveTab('audit')}>
                  Audit Issues
                  {a && failedCount > 0 && <span className="dept-tab-badge">{failedCount}</span>}
                </button>
                <button className={`dept-tab${activeTab==='ada'?' active':''}`} onClick={() => setActiveTab('ada')}>
                  ADA Accessibility
                  {a && (adaCritical+adaSerious) > 0 && <span className="dept-tab-badge">{adaCritical+adaSerious}</span>}
                </button>
                <button className={`dept-tab${activeTab==='analytics'?' active':''}`} onClick={() => setActiveTab('analytics')}>
                  Analytics
                </button>
              </div>

              {/* AUDIT ISSUES TAB */}
              {activeTab === 'audit' && (
                <div className="panel-body">
                  {a && issues.length > 0 ? (
                    <>
                      <div className="cat-tabs">
                        {cats.map(c => (
                          <button key={c} className={`cat-tab${activeCat===c?' active':''}`} onClick={() => setActiveCat(c)}>
                            {c === 'all' ? 'All' : catLabel(c)}
                          </button>
                        ))}
                      </div>
                      <div style={{fontSize:10,color:'var(--lr-text-50)',marginBottom:12,fontWeight:600}}>
                        {failedCount} issue{failedCount!==1?'s':''} of {visibleIssues.length} checks
                      </div>
                      <div className="issue-list">
                        {visibleIssues.map((issue, idx) => {
                          const hasSteps = !issue.passed && (issue.fix_instructions?.length ?? 0) > 0
                          const expanded = expandedIssues.has(idx)
                          return (
                            <div key={idx} className={`issue-card ${issue.passed?'passed':'failed'} severity-${(issue.severity||'medium').toLowerCase()}`}>
                              <div className="issue-card-header" onClick={() => hasSteps && setExpandedIssues(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })}>
                                <span className={`issue-check-icon ${issue.passed?'pass':'fail'}`}>
                                  {issue.passed
                                    ? <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                    : <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
                                </span>
                                <div className="issue-body">
                                  <div className="issue-label">{issue.label}</div>
                                  {issue.detail && <div className="issue-detail">{issue.detail}</div>}
                                </div>
                                {!issue.passed && <span className={`issue-sev ${(issue.severity||'medium').toLowerCase()}`}>{issue.severity||'medium'}</span>}
                                {hasSteps && <button className={`issue-expand-btn${expanded?' open':''}`} type="button" onClick={e => { e.stopPropagation(); setExpandedIssues(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n }) }}><svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg></button>}
                              </div>
                              {hasSteps && expanded && (
                                <div className="issue-fix">
                                  <div className="issue-fix-label">How to Fix in Finalsite</div>
                                  <ol className="issue-fix-steps">
                                    {(issue.fix_instructions||[]).map((s,i) => (
                                      <li key={i}><span className="issue-fix-step-num">{i+1}</span><span className="issue-fix-step-text">{s}</span></li>
                                    ))}
                                  </ol>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : a ? (
                    <div className="empty-state"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div className="empty-state-title">No issues found</div><div className="empty-state-text">All Phase 1 checks passed.</div></div>
                  ) : (
                    <div className="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div className="empty-state-title">No audit data</div><div className="empty-state-text">Run an audit to see Phase 1 checklist results with Finalsite fix instructions.</div></div>
                  )}
                </div>
              )}

              {/* ADA ACCESSIBILITY TAB */}
              {activeTab === 'ada' && (
                <div className="panel-body">
                  {adaSorted.length > 0 ? (
                    <>
                      <div className="ada-scope-row">
                        <span className="ada-scope-label">{adaScoped.length} violation{adaScoped.length!==1?'s':''}</span>
                        <div className="ada-scope-toggle">
                          <button className={`ada-scope-btn ${adaScope==='wcm'?'active':'inactive'}`} onClick={() => setAdaScope('wcm')}>
                            WCM Can Fix
                          </button>
                          <button className={`ada-scope-btn ${adaScope==='finalsite'?'active':'inactive'}`} onClick={() => setAdaScope('finalsite')}>
                            Finalsite Fix
                          </button>
                        </div>
                      </div>
                      {adaScope === 'wcm' ? (
                        <div className="ada-scope-note">These items can be resolved directly in Finalsite PageBuilder without a ticket to the web team.</div>
                      ) : (
                        <div className="ada-scope-note">These items require a WCM ticket to the Finalsite web team for a template-level or system-level fix.</div>
                      )}
                      {adaScoped.length > 0 ? (
                        <div className="ada-violations-list">
                          {adaScoped.map((v, idx) => (
                            <div key={idx} className="ada-violation-card">
                              <div className="ada-violation-header" onClick={() => setExpandedAda(prev => { const n=new Set(prev); n.has(idx)?n.delete(idx):n.add(idx); return n })}>
                                <span className={`ada-violation-impact ${v.impact||'moderate'}`}>{v.impact||'moderate'}</span>
                                <span className="ada-violation-id">{v.id}</span>
                                <span className="ada-violation-nodes">{v.nodes||1} element{(v.nodes||1)!==1?'s':''}</span>
                              </div>
                              {expandedAda.has(idx) && (
                                <div className="ada-violation-detail">
                                  {v.description && <div className="ada-violation-desc">{v.description}</div>}
                                  {v.fix_instructions && <><div className="ada-violation-fix-label">How to Fix</div><div className="ada-violation-fix">{v.fix_instructions}</div></>}
                                  {v.helpUrl && <a className="ada-violation-link" href={v.helpUrl} target="_blank" rel="noopener">More info <svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state" style={{padding:'20px 0'}}>
                          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                          <div className="empty-state-title">No {adaScope === 'wcm' ? 'WCM-fixable' : 'Finalsite-level'} violations</div>
                          <div className="empty-state-text">{adaScope === 'wcm' ? 'Switch to "Finalsite Fix" to see template-level items.' : 'Switch to "WCM Can Fix" to see PageBuilder-fixable items.'}</div>
                        </div>
                      )}
                    </>
                  ) : a ? (
                    <div className="empty-state"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><div className="empty-state-title">No ADA violations found</div><div className="empty-state-text">Passed axe-core WCAG 2.1 AA scan.</div></div>
                  ) : (
                    <div className="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg><div className="empty-state-title">No ADA scan data</div><div className="empty-state-text">Run an audit to see WCAG 2.1 AA violations with remediation steps.</div></div>
                  )}
                </div>
              )}

              {/* ANALYTICS TAB */}
              {activeTab === 'analytics' && (
                <div className="panel-body">
                  <div className="analytics-header" style={{marginBottom:12}}>
                    <span className="analytics-sync-info">{cur?.synced_at ? `GA4 data - synced ${new Date(cur.synced_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}` : 'Synced from GA4 - 1st of each month'}</span>
                  </div>
                  {/* Period selector */}
                  <div className="analytics-period-bar">
                    <div className="analytics-period-toggle">
                      {([['calendar', 'Calendar Year'], ['school', 'School Year'], ['custom', 'Custom']] as [PeriodMode, string][]).map(([m, label]) => (
                        <button key={m}
                          className={`analytics-period-btn ${periodMode === m ? 'active' : 'inactive'}`}
                          onClick={() => setPeriodMode(m)}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {periodMode === 'calendar' && (
                      <select className="analytics-period-select" value={calYear} onChange={e => setCalYear(Number(e.target.value))}>
                        {[CUR_YEAR_D, CUR_YEAR_D - 1, CUR_YEAR_D - 2].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    )}
                    {periodMode === 'school' && (
                      <select className="analytics-period-select" value={schoolStart} onChange={e => setSchoolStart(Number(e.target.value))}>
                        {[CUR_SCHOOL_START_D, CUR_SCHOOL_START_D - 1, CUR_SCHOOL_START_D - 2].map(y => (
                          <option key={y} value={y}>{y}&ndash;{String(y + 1).slice(-2)}</option>
                        ))}
                      </select>
                    )}
                    {periodMode === 'custom' && (
                      <div className="analytics-period-custom">
                        <input type="date" className="analytics-period-date" value={customFromInput} onChange={e => setCustomFromInput(e.target.value)} />
                        <span style={{fontSize:11,color:'var(--lr-text-50)'}}>to</span>
                        <input type="date" className="analytics-period-date" value={customToInput} onChange={e => setCustomToInput(e.target.value)} />
                        {customFromInput && customToInput && (
                          <button className="analytics-period-apply" onClick={() => { setCustomFrom(customFromInput); setCustomTo(customToInput) }}>
                            Apply
                          </button>
                        )}
                      </div>
                    )}
                    <span className="analytics-period-vs">
                      {periodLabel} vs {prevLabel}
                      {prevRows.length === 0 && <span style={{color:'var(--lr-border)',marginLeft:4}}>(no comparison data yet)</span>}
                    </span>
                  </div>
                  {cur ? (
                    <>
                      <div className="analytics-kpi-row">
                        {[
                          {label:'Monthly Visitors', val:fmtNum(cur.monthly_visitors), d:delta(cur.monthly_visitors, prev?.monthly_visitors, false)},
                          {label:'Avg. Time on Page', val:fmtTime(cur.avg_time_seconds), d:delta(cur.avg_time_seconds, prev?.avg_time_seconds, false)},
                          {label:'Bounce Rate', val:fmtPct(cur.bounce_rate), d:delta(cur.bounce_rate, prev?.bounce_rate, true)},
                          {label:'Mobile Traffic', val:fmtPct(cur.mobile_pct), d:delta(cur.mobile_pct, prev?.mobile_pct, false)},
                        ].map(k => (
                          <div key={k.label} className="analytics-kpi">
                            <div className="analytics-kpi-label">{k.label}</div>
                            <div className="analytics-kpi-value">{k.val}</div>
                            {k.d && <div dangerouslySetInnerHTML={{__html:k.d}} />}
                          </div>
                        ))}
                      </div>
                      <div className="analytics-chart-card">
                        <div className="analytics-chart-title">Monthly Visitors{curRows.length > 1 ? ` - ${periodLabel}` : ''}</div>
                        {sparklineHTML ? (
                          <div dangerouslySetInnerHTML={{__html:sparklineHTML}} />
                        ) : (
                          <div style={{height:80,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--lr-text-50)',fontSize:12}}>Single data point - chart requires multiple months</div>
                        )}
                      </div>
                      <div className="analytics-breakdowns">
                        <div className="analytics-table-card">
                          <div className="analytics-table-title">Top Pages</div>
                          <table className="analytics-table"><thead><tr><th>Page</th><th style={{textAlign:'right'}}>Views</th></tr></thead><tbody>
                            {parseArr<{title:string;url:string;views:number}>(cur.top_pages).length > 0
                              ? parseArr<{title:string;url:string;views:number}>(cur.top_pages).map((p,i) => <tr key={i}><td><div style={{fontWeight:600,color:'var(--lr-text)',fontSize:'11.5px'}}>{p.title}</div><div className="url">{p.url}</div></td><td className="num">{fmtNum(p.views)}<span className="analytics-bar-wrap"><span className="analytics-bar-fill" style={{width:Math.round((p.views/Math.max(...parseArr<{views:number}>(cur.top_pages).map(x=>x.views),1))*100)+'%'}} /></span></td></tr>)
                              : <tr><td colSpan={2} style={{textAlign:'center',padding:'20px 0',color:'var(--lr-text-50)',fontSize:12}}>No page data for this period</td></tr>
                            }
                          </tbody></table>
                        </div>
                        <div className="analytics-table-card">
                          <div className="analytics-table-title">Traffic Sources</div>
                          <table className="analytics-table"><thead><tr><th>Source</th><th style={{textAlign:'right'}}>Sessions</th><th style={{textAlign:'right'}}>Share</th></tr></thead><tbody>
                            {parseArr<{source:string;sessions:number|string;pct:string}>(cur.traffic_sources).length > 0
                              ? parseArr<{source:string;sessions:number|string;pct:string}>(cur.traffic_sources).map((s,i) => <tr key={i}><td style={{fontWeight:600,fontSize:'11.5px',color:'var(--lr-text)'}}>{s.source}</td><td className="num">{fmtNum(s.sessions)}<span className="analytics-bar-wrap"><span className="analytics-bar-fill" style={{width:Math.round(parseFloat(s.pct))+'%',background:'#1a7a3c'}} /></span></td><td className="num">{fmtPct(Number(s.pct))}</td></tr>)
                              : <tr><td colSpan={3} style={{textAlign:'center',padding:'20px 0',color:'var(--lr-text-50)',fontSize:12}}>No source data for this period</td></tr>
                            }
                          </tbody></table>
                        </div>
                      </div>
                      <div className="analytics-queries-card">
                        <div className="analytics-table-title">Top Search Queries</div>
                        <table className="analytics-table"><thead><tr><th>#</th><th>Query</th><th style={{textAlign:'right'}}>Clicks</th><th style={{textAlign:'right'}}>Impressions</th></tr></thead><tbody>
                          {parseArr<{query:string;clicks:number;impressions:number}>(cur.top_queries).length > 0
                            ? parseArr<{query:string;clicks:number;impressions:number}>(cur.top_queries).map((q,i) => <tr key={i}><td style={{color:'var(--lr-text-50)',fontSize:10,fontWeight:700,width:20}}>{i+1}</td><td style={{fontWeight:600,fontSize:'11.5px',color:'var(--lr-text)'}}>{q.query}</td><td className="num">{fmtNum(q.clicks)}</td><td className="num" style={{color:'var(--lr-text-50)'}}>{fmtNum(q.impressions)}</td></tr>)
                            : <tr><td colSpan={4} style={{textAlign:'center',padding:'20px 0',color:'var(--lr-text-50)',fontSize:12}}>No query data for this period</td></tr>
                          }
                        </tbody></table>
                      </div>
                    </>
                  ) : (
                    <div className="analytics-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      {analyticsRows.length === 0
                        ? 'No analytics data yet. Data syncs from GA4 on the 1st of each month.'
                        : `No data for ${periodLabel}. Try a different period.`
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDEBAR */}
          <div>
            <div className="info-panel">
              <div className="info-section">
                <div className="info-section-label">WCM Contact</div>
                <div className="info-row"><span className="info-label">Name</span><span className={`info-value${dept.wcm_name?'':' unset'}`}>{dept.wcm_name||'Unassigned'}</span></div>
                <div className="info-row"><span className="info-label">Email</span><span className={`info-value${dept.wcm_email?'':' unset'}`}>{dept.wcm_email?<a href={`mailto:${dept.wcm_email}`}>{dept.wcm_email}</a>:'Not on file'}</span></div>
              </div>
              <div className="info-section">
                <div className="info-section-label">Leadership</div>
                <div className="info-row"><span className="info-label">Director</span><span className={`info-value${dept.director_name?'':' unset'}`}>{dept.director_name||'TBD'}</span></div>
                <div className="info-row"><span className="info-label">Chief</span><span className={`info-value${dept.chief_name?'':' unset'}`}>{dept.chief_name||dept.chief_title||'TBD'}</span></div>
              </div>
              <div className="info-section">
                <div className="info-section-label">Audit Status</div>
                <div className="info-row"><span className="info-label">Status</span><span className="info-value">{dept.audit_status?.replace('_',' ')||'Not started'}</span></div>
                <div className="info-row"><span className="info-label">ADA Score</span><span className={`info-value${dept.ada_score!=null?'':' unset'}`}>{dept.ada_score!=null?dept.ada_score+' / 100':'Not assessed'}</span></div>
                <div className="info-row"><span className="info-label">Last Audit</span><span className="info-value" style={{fontSize:10}}>{a?fmtDate(a.audited_at):'Never'}</span></div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header"><span className="panel-title">Audit History</span></div>
              <div className="panel-body" style={{padding:'12px 16px'}}>
                {history.length > 0 ? (
                  <div>
                    {history.map(h => (
                      <div key={h.id} className="history-card" onClick={() => loadHistoricalAudit(h.id)} title={audit?.id===h.id?'Current audit':'Click to view this audit'}>
                        <div className="history-card-date">
                          {fmtDate(h.audited_at)}
                          {audit?.id===h.id && <span style={{background:'#EBF4FA',color:'#1672A7',borderRadius:4,padding:'1px 5px',fontSize:9,fontWeight:900}}>CURRENT</span>}
                        </div>
                        <div className="history-card-scores">
                          {([['Overall','overall_score'],['Layout','layout_score'],['Content','content_score'],['Nav','nav_score'],['ADA','ada_score']] as const).map(([label,k]) => (
                            <div key={k} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                              <span style={{fontSize:8,fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',color:'var(--lr-text-50)'}}>{label}</span>
                              <span className={`score-pill ${scoreClass(h[k])}`}>{scoreLabel(h[k])}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{padding:'20px 0'}}><div className="empty-state-text">No audit history yet.</div></div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {toast && <div className={`dept-toast${toast.type?' '+toast.type:''}`}>{toast.msg}</div>}
    </>
  )
}

export default function DepartmentPage() {
  return (
    <Suspense fallback={<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:300}}><div style={{width:32,height:32,border:'3px solid rgba(22,114,167,.15)',borderTopColor:'#1672A7',borderRadius:'50%',animation:'spin .7s linear infinite'}} /></div>}>
      <DepartmentContent />
    </Suspense>
  )
}
