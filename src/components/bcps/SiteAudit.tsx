'use client'
// SiteAudit: a whole site's audit (Sean, 2026-10-07). A department's site is
// its main page plus every page in its left menu; each page has its own audit.
// Top: the site score and the page list, each page with its score and what is
// left to fix. Below: the chosen page in the pinned viewer, then the ADA
// results from the same run. Used on the department profile (Web Review),
// the WCM and director dashboards (Run Audit) and the school audit page.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AuditViewer, { type AuditV3 } from './AuditViewer'
import AdaResults from './AdaResults'

type PageRow = {
  id: string; url: string; title: string | null; is_main: boolean
  result: { id: string; audited_at: string; overall_score: number | null; checks_failed: number | null; checks_review: number | null } | null
}
type Summary = { pages: PageRow[]; site_score: number | null; in_progress: number; can_run: boolean }

const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const scoreColor = (n: number | null | undefined) => n == null ? '#6b7280' : n >= 80 ? '#1e6b3a' : n >= 60 ? '#8a5a00' : '#a13a2f'
const pageLabel = (p: PageRow) => p.title || (p.url.replace(/^https?:\/\/[^/]+/, '') || '/')

export default function SiteAudit({ owner, adaOnly = false, isAdmin = false }: { owner: { department_id?: string; school_id?: string }; adaOnly?: boolean; isAdmin?: boolean }) {
  const qs = owner.department_id ? `department_id=${owner.department_id}` : `school_id=${owner.school_id}`
  const [sum, setSum] = useState<Summary | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<string>('')
  const [full, setFull] = useState<Record<string, AuditV3>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/bcps/site-audit?${qs}`, { headers: await auth() })
    const json = await res.json()
    if (!res.ok) { setErr(json.error || 'Could not load the audit.'); return }
    setSum(json)
    setPick((p) => p || json.pages.find((x: PageRow) => x.result)?.id || json.pages[0]?.id || '')
  }, [qs])
  useEffect(() => { load() }, [load])

  const page = sum?.pages.find((p) => p.id === pick) ?? null
  const rid = page?.result?.id
  useEffect(() => {
    if (!rid || full[rid]) return
    ;(async () => {
      const res = await fetch(`/api/bcps/site-audit?${qs}&result_id=${rid}`, { headers: await auth() })
      const json = await res.json()
      if (res.ok) setFull((f) => ({ ...f, [rid]: json.result }))
    })()
  }, [rid, qs, full])

  const queueSite = async () => {
    setBusy(true); setMsg(null)
    const res = await fetch('/api/bcps/site-audit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify(owner) })
    const json = await res.json()
    setBusy(false)
    if (!res.ok) { setMsg({ text: json.error || 'Could not start the audit.', bad: true }); return }
    setMsg({ text: json.already ? 'A full-site audit is already running. Pages fill in as they finish.' : 'Full-site audit started. Pages are checked one at a time and fill in here over the next while; refresh to see progress.' })
    load()
  }
  const recheck = async () => {
    if (!owner.department_id) return queueSite()
    setBusy(true); setMsg({ text: 'Checking this page. This takes a minute or two.' })
    try {
      const res = await fetch('/api/bcps/run-audit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify({ department_id: owner.department_id, ...(page && page.id !== 'main' ? { page_id: page.id } : {}) }) })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'The check did not finish.')
      setFull((f) => ({ ...f, [json.result.id]: json.result }))
      await load()
      setMsg({ text: 'Done. This page is up to date.' })
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : 'The check did not finish.', bad: true }) }
    finally { setBusy(false) }
  }

  if (err) return <div className="sa-box"><style>{CSS}</style><p className="sa-muted">{err}</p></div>
  if (!sum) return <div className="sa-box"><style>{CSS}</style><p className="sa-muted">Loading the audit…</p></div>

  const audited = sum.pages.filter((p) => p.result).length
  return (
    <div className="sa">
      <style>{CSS}</style>
      <div className="sa-box">
        <div className="sa-head">
          <div>
            <div className="sa-h">{adaOnly ? 'Accessibility audit' : 'Site audit'}</div>
            <div className="sa-score"><b style={{ color: scoreColor(sum.site_score) }}>{sum.site_score ?? '–'}</b><span>{adaOnly ? 'accessibility score' : 'site score'}, average of {audited} page{audited === 1 ? '' : 's'} audited{sum.pages.length > audited ? ` (${sum.pages.length - audited} not yet)` : ''}</span></div>
            {sum.in_progress > 0 && <div className="sa-progress">Audit in progress: {sum.in_progress} job{sum.in_progress === 1 ? '' : 's'} waiting. Pages fill in as they finish.</div>}
          </div>
          <div className="sa-actions">
            {sum.can_run && page && owner.department_id && <button type="button" className="sa-btn" disabled={busy} onClick={recheck}>{busy ? 'Working…' : 'Run audit on this page'}</button>}
            {isAdmin && <button type="button" className="sa-btn sa-btn-alt" disabled={busy || sum.in_progress > 0} onClick={queueSite}>Audit full site</button>}
          </div>
        </div>
        {msg && <p className="sa-msg" role="status" style={{ color: msg.bad ? '#a13a2f' : undefined }}>{msg.text}</p>}
        {sum.pages.length === 0 ? <p className="sa-muted">No pages audited yet.{isAdmin ? ' Use Audit full site to find this site’s pages and audit each one.' : ' The District Web Team runs the audit; results show here.'}</p> : (
          <div className="sa-pages" role="list">
            {sum.pages.map((p) => (
              <button key={p.id} type="button" role="listitem" className={`sa-page${p.id === pick ? ' on' : ''}`} onClick={() => { setPick(p.id); setMsg(null) }} aria-pressed={p.id === pick}>
                <span className="sa-page-score" style={{ color: scoreColor(p.result?.overall_score) }}>{p.result?.overall_score ?? '–'}</span>
                <span className="sa-page-text">
                  <span className="sa-page-title">{p.is_main ? 'Main page' : pageLabel(p)}</span>
                  <span className="sa-page-meta">{p.result ? `${p.result.checks_failed ?? 0} to fix · ${p.result.checks_review ?? 0} to review` : 'Not audited yet'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {page && !page.result && <div className="sa-box"><p className="sa-muted">This page has not been audited yet.</p></div>}
      {rid && !full[rid] && <div className="sa-box"><p className="sa-muted">Loading this page…</p></div>}
      {rid && full[rid] && <>
        <AuditViewer audit={full[rid]} showCourse={!adaOnly}
          note={adaOnly ? <>Accessibility only (WCAG 2.1 AA). Green passes, red needs a fix. Issues in the site header and footer are listed separately and do not count.</> : undefined} />
        <AdaResults violations={full[rid].ada_violations} />
      </>}
    </div>
  )
}

const CSS = `
.sa-box{background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:14px 16px;margin-bottom:14px}
.sa-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.sa-h{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#1672A7}
.sa-score{display:flex;align-items:baseline;gap:8px;margin-top:4px}.sa-score b{font-size:28px;font-weight:900}.sa-score span{font-size:12px;color:var(--lr-text-50,#666)}
.sa-progress{margin-top:6px;font-size:12px;font-weight:700;color:#8a5a00;background:#fdf3e0;border-radius:6px;padding:4px 8px;display:inline-block}
.sa-actions{display:flex;gap:8px;flex-wrap:wrap}
.sa-btn{font:inherit;font-size:12.5px;font-weight:800;border:0;border-radius:8px;padding:9px 14px;background:#1672A7;color:#fff;cursor:pointer}
.sa-btn:disabled{opacity:.55;cursor:default}
.sa-btn-alt{background:#fff;color:#0e4e73;border:1px solid #1672A7}
.sa-msg{font-size:12.5px;font-weight:700;margin:10px 0 0}
.sa-muted{font-size:13px;color:var(--lr-text-50,#666);margin:8px 0 0}
.sa-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin-top:12px;max-height:260px;overflow:auto}
.sa-page{display:flex;gap:10px;align-items:center;text-align:left;font:inherit;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.1));border-radius:8px;padding:8px 10px;cursor:pointer;min-width:0}
.sa-page:hover{border-color:#1672A7}.sa-page.on{border-color:#1672A7;box-shadow:0 0 0 2px rgba(22,114,167,.18)}
.sa-page-score{font-size:18px;font-weight:900;min-width:30px;text-align:center}
.sa-page-text{display:flex;flex-direction:column;min-width:0}
.sa-page-title{font-size:12.5px;font-weight:800;color:var(--lr-text,#1a1a1a);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-page-meta{font-size:11px;color:var(--lr-text-50,#666)}
`
