'use client'
// SiteAudit: a whole site's audit (Sean, 2026-10-07). A department's site is
// its main page plus every page in its left menu; each page has its own audit.
// One summary bar carries the site score and a page picker. "All issues"
// lists every red and amber item across the site, each naming its page;
// clicking one loads that page with the item open on the screenshot. Picking
// a page shows its screenshot and steps, then the ADA results from the same
// run. Used on the department profile (Web Review), the WCM and director
// dashboards (Run Audit) and the school audit page.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AuditViewer, { type AuditV3 } from './AuditViewer'
import AdaResults from './AdaResults'

type PageRow = {
  id: string; url: string; title: string | null; is_main: boolean
  result: { id: string; audited_at: string; overall_score: number | null; checks_failed: number | null; checks_review: number | null } | null
}
type Issue = { page_id: string; result_id: string; check_id: string; area: string; title: string; detail: string; status: 'fail' | 'review' }
type Summary = { pages: PageRow[]; issues: Issue[]; site_score: number | null; in_progress: number; can_run: boolean }

const ALL = '__all'
const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const scoreColor = (n: number | null | undefined) => n == null ? '#6b7280' : n >= 80 ? '#1e6b3a' : n >= 60 ? '#8a5a00' : '#a13a2f'
const pageLabel = (p: PageRow) => p.is_main ? 'Main page' : p.title || (p.url.replace(/^https?:\/\/[^/]+/, '') || '/')
const CHIP = { fail: { label: 'Fix', bg: '#fbe9e7', fg: '#a13a2f' }, review: { label: 'Review', bg: '#fdf3e0', fg: '#8a5a00' } }

export default function SiteAudit({ owner, adaOnly = false, isAdmin = false }: { owner: { department_id?: string; school_id?: string }; adaOnly?: boolean; isAdmin?: boolean }) {
  const qs = owner.department_id ? `department_id=${owner.department_id}` : `school_id=${owner.school_id}`
  const [sum, setSum] = useState<Summary | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<string>('')
  const [focus, setFocus] = useState<string | null>(null)
  const [full, setFull] = useState<Record<string, AuditV3>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)
  const [issueFilter, setIssueFilter] = useState<'fail' | 'all'>('all')

  const load = useCallback(async () => {
    const res = await fetch(`/api/bcps/site-audit?${qs}`, { headers: await auth() })
    const json = await res.json()
    if (!res.ok) { setErr(json.error || 'Could not load the audit.'); return }
    setSum(json)
    // A one-page site opens on that page; a bigger site opens on the list.
    setPick((p) => p || (json.pages.length > 1 ? ALL : json.pages[0]?.id || ALL))
  }, [qs])
  useEffect(() => { load() }, [load])

  const page = pick === ALL ? null : sum?.pages.find((p) => p.id === pick) ?? null
  const rid = page?.result?.id
  useEffect(() => {
    if (!rid || full[rid]) return
    ;(async () => {
      const res = await fetch(`/api/bcps/site-audit?${qs}&result_id=${rid}`, { headers: await auth() })
      const json = await res.json()
      if (res.ok) setFull((f) => ({ ...f, [rid]: json.result }))
    })()
  }, [rid, qs, full])

  const choose = (id: string, check: string | null = null) => { setPick(id); setFocus(check); setMsg(null) }

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
  const issues = sum.issues ?? []
  const fixCount = issues.filter((i) => i.status === 'fail').length
  const pagesById = new Map(sum.pages.map((p) => [p.id, p]))

  // Site score and page picker: the front of the summary bar.
  const toolbar = (
    <div className="sa-tools">
      <div className="sa-score" title={`Average of ${audited} page${audited === 1 ? '' : 's'} audited`}>
        <b style={{ color: scoreColor(sum.site_score) }}>{sum.site_score ?? '–'}</b>
        <span>{adaOnly ? 'accessibility' : 'site'} score<br />{audited} page{audited === 1 ? '' : 's'}{sum.pages.length > audited ? ` (${sum.pages.length - audited} not yet)` : ''}</span>
      </div>
      {sum.pages.length > 0 && (
        <label className="sa-pick">
          <span className="sa-pick-l">Page</span>
          <select value={pick} onChange={(e) => choose(e.target.value)}>
            <option value={ALL}>All issues across the site ({issues.length})</option>
            {sum.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {pageLabel(p)} · {p.result ? `${p.result.overall_score ?? '–'} · ${p.result.checks_failed ?? 0} to fix` : 'not audited yet'}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="sa-actions">
        {sum.can_run && page && owner.department_id && <button type="button" className="sa-btn" disabled={busy} onClick={recheck}>{busy ? 'Working…' : 'Run audit on this page'}</button>}
        {isAdmin && <button type="button" className="sa-btn sa-btn-alt" disabled={busy || sum.in_progress > 0} onClick={queueSite}>Audit full site</button>}
      </div>
    </div>
  )
  const status = <>
    {sum.in_progress > 0 && <div className="sa-progress">Audit in progress: {sum.in_progress} job{sum.in_progress === 1 ? '' : 's'} waiting. Pages fill in as they finish.</div>}
    {msg && <p className="sa-msg" role="status" style={{ color: msg.bad ? '#a13a2f' : undefined }}>{msg.text}</p>}
  </>

  if (sum.pages.length === 0) return (
    <div className="sa"><style>{CSS}</style>
      <div className="sa-bar">{toolbar}</div>{status}
      <div className="sa-box"><p className="sa-muted">No pages audited yet.{isAdmin ? ' Use Audit full site to find this site’s pages and audit each one.' : ' The District Web Team runs the audit; results show here.'}</p></div>
    </div>
  )

  if (pick === ALL) {
    const shown = issues
      .filter((i) => issueFilter === 'all' || i.status === 'fail')
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'fail' ? -1 : 1))
    return (
      <div className="sa"><style>{CSS}</style>
        <div className="sa-bar">
          {toolbar}
          <span className="sa-chip" style={{ background: CHIP.fail.bg, color: CHIP.fail.fg }}>{fixCount} to fix</span>
          <span className="sa-chip" style={{ background: CHIP.review.bg, color: CHIP.review.fg }}>{issues.length - fixCount} to review</span>
        </div>
        {status}
        <div className="sa-box">
          <div className="sa-list-head">
            <span className="sa-h">Every issue on the site</span>
            <div className="sa-toggle" role="group" aria-label="Show">
              <button type="button" className={issueFilter === 'all' ? 'on' : ''} aria-pressed={issueFilter === 'all'} onClick={() => setIssueFilter('all')}>Fix and review ({issues.length})</button>
              <button type="button" className={issueFilter === 'fail' ? 'on' : ''} aria-pressed={issueFilter === 'fail'} onClick={() => setIssueFilter('fail')}>Fix only ({fixCount})</button>
            </div>
          </div>
          <p className="sa-muted sa-hint">Click an issue to open its page with the spot marked and the steps to fix it.</p>
          {shown.length === 0 ? <p className="sa-muted">Nothing to fix{issueFilter === 'all' ? ' or review' : ''}. Every audited page passes.</p> : (
            <ul className="sa-issues">
              {shown.map((i) => {
                const p = pagesById.get(i.page_id)
                const chip = CHIP[i.status]
                return (
                  <li key={`${i.result_id}-${i.check_id}`}>
                    <button type="button" className="sa-issue" onClick={() => choose(i.page_id, i.check_id)}>
                      <span className="sa-chip" style={{ background: chip.bg, color: chip.fg }}>{chip.label}</span>
                      <span className="sa-issue-text">
                        <span className="sa-issue-title">{i.title}</span>
                        <span className="sa-issue-page">{p ? pageLabel(p) : 'Page'}{p?.url ? <em> · {p.url.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/'}</em> : null}</span>
                        <span className="sa-issue-detail">{i.detail}</span>
                      </span>
                      <span className="sa-go" aria-hidden>Open &rarr;</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="sa"><style>{CSS}</style>
      {status}
      {page && !page.result && <><div className="sa-bar">{toolbar}</div><div className="sa-box"><p className="sa-muted">This page has not been audited yet.</p></div></>}
      {rid && !full[rid] && <><div className="sa-bar">{toolbar}</div><div className="sa-box"><p className="sa-muted">Loading this page…</p></div></>}
      {rid && full[rid] && <>
        <AuditViewer audit={full[rid]} showCourse={!adaOnly} toolbar={toolbar} focus={focus}
          note={adaOnly ? <>Accessibility only (WCAG 2.1 AA). Green passes, red needs a fix. Issues in the site header and footer are listed separately and do not count.</> : undefined} />
        <AdaResults violations={full[rid].ada_violations} />
      </>}
    </div>
  )
}

const CSS = `
.sa-box{background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:14px 16px;margin-bottom:14px}
.sa-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:12px 16px;margin-bottom:12px}
.sa-tools{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding-right:14px;margin-right:6px;border-right:1px solid var(--lr-border,rgba(0,0,0,.09))}
.sa-score{display:flex;align-items:center;gap:8px}.sa-score b{font-size:28px;font-weight:900;line-height:1}.sa-score span{font-size:11px;line-height:1.3;color:var(--lr-text-50,#666)}
.sa-pick{display:flex;flex-direction:column;gap:2px;min-width:0}
.sa-pick-l{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#1672A7}
.sa-pick select{font:inherit;font-size:13px;font-weight:700;border:1px solid #1672A7;border-radius:8px;padding:7px 10px;background:#fff;color:var(--lr-text,#1a1a1a);max-width:340px;min-width:220px}
.sa-h{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#1672A7}
.sa-progress{margin:0 0 10px;font-size:12px;font-weight:700;color:#8a5a00;background:#fdf3e0;border-radius:6px;padding:6px 10px}
.sa-actions{display:flex;gap:8px;flex-wrap:wrap}
.sa-btn{font:inherit;font-size:12.5px;font-weight:800;border:0;border-radius:8px;padding:9px 14px;background:#1672A7;color:#fff;cursor:pointer}
.sa-btn:disabled{opacity:.55;cursor:default}
.sa-btn-alt{background:#fff;color:#0e4e73;border:1px solid #1672A7}
.sa-msg{font-size:12.5px;font-weight:700;margin:0 0 10px}
.sa-muted{font-size:13px;color:var(--lr-text-50,#666);margin:8px 0 0}
.sa-hint{margin:2px 0 10px;font-size:12px}
.sa-chip{font-size:11px;font-weight:800;border-radius:999px;padding:3px 9px;white-space:nowrap;flex-shrink:0}
.sa-list-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.sa-toggle{display:inline-flex;border:1px solid var(--lr-border,rgba(0,0,0,.12));border-radius:8px;overflow:hidden}
.sa-toggle button{font:inherit;font-size:11.5px;font-weight:700;border:0;background:#fff;padding:5px 10px;cursor:pointer;color:var(--lr-text-50,#555)}
.sa-toggle button.on{background:#1672A7;color:#fff}
.sa-issues{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.sa-issue{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;font:inherit;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.1));border-radius:8px;padding:10px 12px;cursor:pointer}
.sa-issue:hover{border-color:#1672A7;box-shadow:0 0 0 2px rgba(22,114,167,.12)}
.sa-issue-text{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
.sa-issue-title{font-size:13px;font-weight:800;color:var(--lr-text,#1a1a1a)}
.sa-issue-page{font-size:11.5px;font-weight:700;color:#1672A7;word-break:break-word}.sa-issue-page em{font-style:normal;font-weight:500;color:var(--lr-text-50,#666)}
.sa-issue-detail{font-size:12px;color:var(--lr-text-50,#555);line-height:1.4}
.sa-go{font-size:11.5px;font-weight:800;color:#1672A7;white-space:nowrap;align-self:center}
@media (max-width:640px){.sa-tools{border-right:0;padding-right:0;margin-right:0}.sa-pick select{min-width:0;max-width:100%;width:100%}.sa-pick{flex:1 1 100%}}
`
