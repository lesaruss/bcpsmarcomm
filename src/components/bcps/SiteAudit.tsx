'use client'
// SiteAudit: a whole site's audit (Sean, 2026-10-07). A department's site is
// its main page plus every page in its left menu; each page has its own audit.
// The summary bar carries the site score and walks the WCM through the issues
// one at a time: Previous / Next steps through every red and amber item
// across the site, loading its page with the item open on the screenshot and
// the steps on the right. Audit items (course standards) come first, then
// ADA items (the WCAG scan), each tagged, in one list (Sean, 2026-10-08).
// The dropdown jumps straight to any issue (only pages with issues appear).
// Checklist shows every page, passing ones too. Each item has Ask a
// question, which goes to the team's question bank.
// Used on the department profile (Web Review), the WCM and director
// dashboards (Run Audit) and the school audit page.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import AuditViewer, { type AuditV3 } from './AuditViewer'
import type { CheckResult } from '@/lib/dept-standards'

type PageRow = {
  id: string; url: string; title: string | null; is_main: boolean
  result: { id: string; audited_at: string; overall_score: number | null; checks_failed: number | null; checks_review: number | null } | null
}
type Issue = { page_id: string; result_id: string; check_id: string; area: string; title: string; detail: string; status: 'fail' | 'review' }
type Summary = { pages: PageRow[]; issues: Issue[]; site_score: number | null; in_progress: number; can_run: boolean }

const CHECKLIST = '__checklist'
const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}
const scoreColor = (n: number | null | undefined) => n == null ? '#6b7280' : n >= 80 ? '#1e6b3a' : n >= 60 ? '#8a5a00' : '#a13a2f'
const pageLabel = (p: PageRow) => p.is_main ? 'Main page' : p.title || (p.url.replace(/^https?:\/\/[^/]+/, '') || '/')
const pagePath = (p: PageRow) => p.url.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/'
const isAda = (i: { area: string }) => i.area === 'Accessibility'
const kindOf = (i: { area: string }) => isAda(i) ? 'ADA' : 'Audit'

export default function SiteAudit({ owner, adaOnly = false, isAdmin = false }: { owner: { department_id?: string; school_id?: string }; adaOnly?: boolean; isAdmin?: boolean }) {
  const qs = owner.department_id ? `department_id=${owner.department_id}` : `school_id=${owner.school_id}`
  const [sum, setSum] = useState<Summary | null>(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<string>('')
  const [focus, setFocus] = useState<string | null>(null)
  const [full, setFull] = useState<Record<string, AuditV3>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  // Issues in walk order: every audit item first, then every ADA item; within
  // each, pages as listed (main first), fixes before reviews, in the order
  // the checks ran.
  const issues = useMemo(() => {
    if (!sum) return [] as Issue[]
    const order = new Map(sum.pages.map((p, i) => [p.id, i]))
    return (sum.issues ?? [])
      .map((x, i) => ({ x, i }))
      .sort((a, b) => Number(isAda(a.x)) - Number(isAda(b.x)) || (order.get(a.x.page_id) ?? 999) - (order.get(b.x.page_id) ?? 999) || (a.x.status === b.x.status ? 0 : a.x.status === 'fail' ? -1 : 1) || a.i - b.i)
      .map(({ x }) => x)
  }, [sum])

  const load = useCallback(async () => {
    const res = await fetch(`/api/bcps/site-audit?${qs}`, { headers: await auth() })
    const json = await res.json()
    if (!res.ok) { setErr(json.error || 'Could not load the audit.'); return }
    setSum(json)
  }, [qs])
  useEffect(() => { load() }, [load])

  // First visit: open the first issue; a site with none opens the checklist.
  useEffect(() => {
    if (!sum || pick) return
    if (issues.length) { setPick(issues[0].page_id); setFocus(issues[0].check_id) }
    else setPick(sum.pages.length > 1 ? CHECKLIST : sum.pages[0]?.id || CHECKLIST)
  }, [sum, issues, pick])

  const page = pick === CHECKLIST ? null : sum?.pages.find((p) => p.id === pick) ?? null
  const rid = page?.result?.id
  useEffect(() => {
    if (!rid || full[rid]) return
    ;(async () => {
      const res = await fetch(`/api/bcps/site-audit?${qs}&result_id=${rid}`, { headers: await auth() })
      const json = await res.json()
      if (res.ok) setFull((f) => ({ ...f, [rid]: json.result }))
    })()
  }, [rid, qs, full])

  const go = (i: Issue) => { setPick(i.page_id); setFocus(i.check_id); setMsg(null) }
  const openPage = (id: string) => {
    const first = issues.find((i) => i.page_id === id)
    setPick(id); setFocus(first?.check_id ?? null); setMsg(null)
  }
  const cur = issues.findIndex((i) => i.page_id === pick && i.check_id === focus)
  // Off the walk (a page opened from the checklist): Next starts at that
  // page's first issue, or the first issue after it.
  const step = (dir: 1 | -1) => {
    if (!issues.length) return
    if (cur >= 0) { const n = cur + dir; if (n >= 0 && n < issues.length) go(issues[n]); return }
    const order = sum!.pages.findIndex((p) => p.id === pick)
    const pos = (i: Issue) => sum!.pages.findIndex((p) => p.id === i.page_id)
    const next = dir === 1 ? issues.find((i) => pos(i) >= order) ?? issues[0] : [...issues].reverse().find((i) => pos(i) < order) ?? issues[issues.length - 1]
    go(next)
  }

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
  const issuePages = sum.pages.filter((p) => issues.some((i) => i.page_id === p.id))
  const countOn = (id: string) => issues.filter((i) => i.page_id === id)

  const toolbar = (
    <div className="sa-tools">
      <div className="sa-score" title={`Average of ${audited} page${audited === 1 ? '' : 's'} audited`}>
        <b style={{ color: scoreColor(sum.site_score) }}>{sum.site_score ?? '–'}</b>
        <span>{adaOnly ? 'accessibility' : 'site'} score<br />{audited} page{audited === 1 ? '' : 's'}{sum.pages.length > audited ? ` (${sum.pages.length - audited} not yet)` : ''}</span>
      </div>
      {issues.length > 0 && (
        <div className="sa-step" role="group" aria-label="Step through issues">
          <button type="button" onClick={() => step(-1)} disabled={cur === 0} aria-label="Previous issue">&lsaquo; Prev</button>
          <span>{cur >= 0 ? <>Issue <b>{cur + 1}</b> of {issues.length} · {kindOf(issues[cur])}</> : <>{issues.length} issues</>}</span>
          <button type="button" onClick={() => step(1)} disabled={cur === issues.length - 1} aria-label="Next issue">Next &rsaquo;</button>
        </div>
      )}
      {issues.length > 0 && (
        <select className="sa-jump" aria-label="Jump to an issue" value={cur >= 0 ? String(cur) : ''} onChange={(e) => { const i = issues[Number(e.target.value)]; if (i) go(i) }}>
          {cur < 0 && <option value="">Jump to an issue…</option>}
          {(['Audit', 'ADA'] as const).flatMap((k) => issuePages.filter((p) => issues.some((i) => i.page_id === p.id && kindOf(i) === k)).map((p) => (
            <optgroup key={`${k}-${p.id}`} label={`${k} · ${pageLabel(p)} (${p.result?.overall_score ?? '–'})`}>
              {issues.map((i, n) => i.page_id === p.id && kindOf(i) === k ? <option key={n} value={n}>{i.status === 'fail' ? 'Fix' : 'Review'}: {i.title}</option> : null)}
            </optgroup>
          )))}
        </select>
      )}
      <button type="button" className={`sa-link${pick === CHECKLIST ? ' on' : ''}`} onClick={() => { setPick(CHECKLIST); setFocus(null); setMsg(null) }}>
        Checklist ({sum.pages.length} page{sum.pages.length === 1 ? '' : 's'})
      </button>
      <div className="sa-actions">
        {isAdmin && <a className="sa-link" href="/audit-questions">Question bank</a>}
        {sum.can_run && page && owner.department_id && <button type="button" className="sa-btn" disabled={busy} onClick={recheck}>{busy ? 'Working…' : 'Run audit on this page'}</button>}
        {isAdmin && <button type="button" className="sa-btn sa-btn-alt" disabled={busy || sum.in_progress > 0} onClick={queueSite}>Audit full site</button>}
      </div>
    </div>
  )
  const status = <>
    {sum.in_progress > 0 && <div className="sa-progress">Audit in progress: {sum.in_progress} job{sum.in_progress === 1 ? '' : 's'} waiting. Pages fill in as they finish.</div>}
    {msg && <p className="sa-msg" role="status" style={{ color: msg.bad ? '#a13a2f' : undefined }}>{msg.text}</p>}
  </>
  const bar = <div className="sa-bar">{toolbar}</div>

  if (sum.pages.length === 0) return (
    <div className="sa"><style>{CSS}</style>
      {bar}{status}
      <div className="sa-box"><p className="sa-muted">No pages audited yet.{isAdmin ? ' Use Audit full site to find this site’s pages and audit each one.' : ' The District Web Team runs the audit; results show here.'}</p></div>
    </div>
  )

  if (pick === CHECKLIST) return (
    <div className="sa"><style>{CSS}</style>
      {bar}{status}
      <div className="sa-box">
        <span className="sa-h">Every page on the site</span>
        <ul className="sa-check">
          {sum.pages.map((p) => {
            const on = countOn(p.id)
            const fix = on.filter((i) => i.status === 'fail').length
            const done = p.result && on.length === 0
            return (
              <li key={p.id}>
                <button type="button" className="sa-check-row" onClick={() => openPage(p.id)} disabled={!p.result}>
                  <span className={`sa-tick${done ? ' ok' : p.result ? ' bad' : ''}`} aria-hidden>{done ? '✓' : p.result ? on.length : '–'}</span>
                  <span className="sa-check-text">
                    <span className="sa-check-title">{pageLabel(p)}</span>
                    <span className="sa-check-path">{pagePath(p)}</span>
                  </span>
                  <span className="sa-check-meta">
                    {!p.result ? 'Not audited yet' : done ? 'All clear' : `${fix} to fix · ${on.length - fix} to review`}
                  </span>
                  <span className="sa-check-score" style={{ color: scoreColor(p.result?.overall_score) }}>{p.result?.overall_score ?? '–'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )

  return (
    <div className="sa"><style>{CSS}</style>
      {status}
      {page && !page.result && <>{bar}<div className="sa-box"><p className="sa-muted">This page has not been audited yet.</p></div></>}
      {rid && !full[rid] && <>{bar}<div className="sa-box"><p className="sa-muted">Loading {page ? pageLabel(page) : 'this page'}…</p></div></>}
      {rid && full[rid] && <>
        <AuditViewer audit={full[rid]} showCourse={!adaOnly} toolbar={toolbar} focus={focus}
          extra={(c) => c.status === 'pass' ? null : <AskQuestion key={`${rid}-${c.id}`} check={c} ctx={{ ...owner, result_id: rid, page_url: page?.url ?? full[rid].page_url ?? null }} />}
          note={adaOnly ? <>Accessibility only (WCAG 2.1 AA). Green passes, red needs a fix. Only your page content counts; the district header, menus and footer are left out.</> : undefined} />
      </>}
    </div>
  )
}

// Ask a question: answers from the District Web Team to anyone who asked
// about this item, then the caller's own pending questions, then the box.
type QA = { id: string; created_at: string; mine: boolean; question: string; status: string; answer: string | null }
function AskQuestion({ check, ctx }: { check: CheckResult; ctx: { department_id?: string; school_id?: string; result_id: string; page_url: string | null } }) {
  const [list, setList] = useState<QA[] | null>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [state, setState] = useState<{ busy?: boolean; text?: string; bad?: boolean }>({})
  const fetchList = useCallback(async () => {
    const res = await fetch(`/api/bcps/audit-questions?check_id=${encodeURIComponent(check.id)}`, { headers: await auth() })
    const json = await res.json().catch(() => ({}))
    setList(res.ok ? json.questions ?? [] : [])
  }, [check.id])
  useEffect(() => { fetchList() }, [fetchList])
  const send = async () => {
    setState({ busy: true })
    const res = await fetch('/api/bcps/audit-questions', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify({ ...ctx, check_id: check.id, check_title: check.title, question: text }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setState({ text: json.error || 'Could not send. Try again.', bad: true }); return }
    setText(''); setOpen(false); setState({ text: 'Sent. The District Web Team will answer here, under this item.' })
    fetchList()
  }
  const answered = (list ?? []).filter((q) => q.status === 'answered')
  const waiting = (list ?? []).filter((q) => q.status !== 'answered' && q.mine)
  return (
    <div className="sa-ask">
      {answered.length > 0 && <>
        <div className="sa-ask-h">Questions other WCMs asked</div>
        {answered.map((q) => <div key={q.id} className="sa-qa"><p className="sa-q">{q.question}</p><p className="sa-a">{q.answer}</p></div>)}
      </>}
      {waiting.map((q) => <div key={q.id} className="sa-qa"><p className="sa-q">{q.question}</p><p className="sa-wait">Waiting for an answer from the District Web Team.</p></div>)}
      {open ? (
        <div className="sa-ask-form">
          <label className="sa-ask-h" htmlFor={`ask-${check.id}`}>What are you stuck on?</label>
          <textarea id={`ask-${check.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="For example: I can't find where to change this in Composer." />
          <div className="sa-ask-row">
            <button type="button" className="sa-btn" disabled={state.busy || text.trim().length < 3} onClick={send}>{state.busy ? 'Sending…' : 'Send question'}</button>
            <button type="button" className="sa-link" onClick={() => { setOpen(false); setState({}) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="sa-ask-btn" onClick={() => { setOpen(true); setState({}) }}>Still stuck? Ask the District Web Team</button>
      )}
      {state.text && <p className="sa-msg" role="status" style={{ margin: '6px 0 0', color: state.bad ? '#a13a2f' : '#1e6b3a' }}>{state.text}</p>}
    </div>
  )
}


const CSS = `
.sa-box{background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:14px 16px;margin-bottom:14px}
.sa-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.09));border-radius:10px;padding:12px 16px;margin-bottom:12px}
.sa-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex-basis:100%;padding-bottom:10px;margin-bottom:2px;border-bottom:1px solid var(--lr-border,rgba(0,0,0,.09))}
.sa-score{display:flex;align-items:center;gap:8px}.sa-score b{font-size:28px;font-weight:900;line-height:1}.sa-score span{font-size:11px;line-height:1.3;color:var(--lr-text-50,#666)}
.sa-step{display:inline-flex;align-items:center;border:1px solid #1672A7;border-radius:8px;overflow:hidden}
.sa-step button{font:inherit;font-size:12.5px;font-weight:800;border:0;background:#1672A7;color:#fff;padding:8px 12px;cursor:pointer}
.sa-step button:disabled{background:#e8eff4;color:#8aa4b5;cursor:default}
.sa-step span{font-size:12.5px;padding:0 12px;white-space:nowrap;color:var(--lr-text,#1a1a1a)}
.sa-jump{font:inherit;font-size:12.5px;font-weight:600;border:1px solid var(--lr-border,rgba(0,0,0,.18));border-radius:8px;padding:7px 8px;background:#fff;color:var(--lr-text,#1a1a1a);max-width:320px;min-width:180px}
.sa-link{font:inherit;font-size:12.5px;font-weight:800;color:#1672A7;background:none;border:0;padding:4px 2px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.sa-link.on{color:#0e4e73;text-decoration-thickness:2px}
.sa-h{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.14em;color:#1672A7}
.sa-progress{margin:0 0 10px;font-size:12px;font-weight:700;color:#8a5a00;background:#fdf3e0;border-radius:6px;padding:6px 10px}
.sa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
.sa-btn{font:inherit;font-size:12.5px;font-weight:800;border:0;border-radius:8px;padding:9px 14px;background:#1672A7;color:#fff;cursor:pointer}
.sa-btn:disabled{opacity:.55;cursor:default}
.sa-btn-alt{background:#fff;color:#0e4e73;border:1px solid #1672A7}
.sa-msg{font-size:12.5px;font-weight:700;margin:0 0 10px}
.sa-muted{font-size:13px;color:var(--lr-text-50,#666);margin:8px 0 0}
.sa-check{list-style:none;margin:10px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.sa-check-row{display:flex;align-items:center;gap:12px;width:100%;text-align:left;font:inherit;background:#fff;border:1px solid var(--lr-border,rgba(0,0,0,.1));border-radius:8px;padding:9px 12px;cursor:pointer}
.sa-check-row:hover:not(:disabled){border-color:#1672A7;box-shadow:0 0 0 2px rgba(22,114,167,.12)}
.sa-check-row:disabled{cursor:default;opacity:.7}
.sa-tick{flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:900;background:#eef0f2;color:#6b7280}
.sa-tick.ok{background:#e6f4ea;color:#1e6b3a}.sa-tick.bad{background:#fbe9e7;color:#a13a2f}
.sa-check-text{display:flex;flex-direction:column;min-width:0;flex:1}
.sa-check-title{font-size:13px;font-weight:800;color:var(--lr-text,#1a1a1a)}
.sa-check-path{font-size:11px;color:var(--lr-text-50,#666);word-break:break-all}
.sa-check-meta{font-size:11.5px;color:var(--lr-text-50,#555);white-space:nowrap}
.sa-check-score{font-size:17px;font-weight:900;min-width:30px;text-align:right}
.sa-ask{margin-top:12px;padding-top:10px;border-top:1px dashed var(--lr-border,rgba(0,0,0,.12))}
.sa-ask-h{display:block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#1672A7;margin:0 0 6px}
.sa-qa{background:#f6f9fb;border-radius:8px;padding:8px 10px;margin-bottom:6px}
.sa-q{margin:0;font-size:12.5px;font-weight:700}.sa-a{margin:4px 0 0;font-size:12.5px;line-height:1.45}.sa-wait{margin:4px 0 0;font-size:12px;color:#8a5a00}
.sa-ask-btn{font:inherit;font-size:12.5px;font-weight:800;color:#0e4e73;background:#fff;border:1px dashed #1672A7;border-radius:8px;padding:7px 12px;cursor:pointer}
.sa-ask-form textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;border:1px solid var(--lr-border,rgba(0,0,0,.18));border-radius:8px;padding:8px 10px;resize:vertical}
.sa-ask-row{display:flex;gap:10px;align-items:center;margin-top:6px}
@media (max-width:640px){.sa-jump{flex:1 1 100%;max-width:100%}.sa-actions{margin-left:0}.sa-check-meta{display:none}}
`
