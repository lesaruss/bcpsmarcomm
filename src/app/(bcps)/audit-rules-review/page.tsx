'use client'
// Audit rule review (Sean, Hot Lab 2026-10-29). Every rule the audit flags
// pages for, one card each, with how often it fires and example pages. Sean
// and the District Web Team approve a rule, ask for a change, say it does not
// apply, or ask for input; everyone's decision and note shows on the card.
// Nothing here changes the audit itself: the decisions are what the audit
// settings get updated from. Access is the 'audit-rules-review' page grant
// (the API enforces it).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Decision = 'approve' | 'change' | 'not_applicable' | 'discuss'
type Example = { page_url: string; status: 'fail' | 'review'; detail: string | null; items: string[] | null; owner: string | null }
type Rule = {
  id: string; area: string; title: string; why: string | null; steps: string[] | null
  course: { moduleId: string; pageId: string; label: string } | null
  fail: number; review: number; pass: number; departments: number; pages: number; examples: Example[]
  help_url?: string | null
}
type Review = { check_id: string; reviewer_email: string; reviewer_name: string | null; decision: Decision; comment: string | null; updated_at: string }

const DECISIONS: { id: Decision; label: string; hint: string }[] = [
  { id: 'approve', label: 'Keep as is', hint: 'The rule is right and so is how it flags.' },
  { id: 'change', label: 'Change the rule', hint: 'Right idea, but it flags things it should not, or misses some.' },
  { id: 'not_applicable', label: 'Does not apply', hint: 'Drop it, or stop it counting against a page.' },
  { id: 'discuss', label: 'Need input', hint: 'Not sure. Bring it to the team.' },
]
const LABEL: Record<Decision, string> = { approve: 'Keep as is', change: 'Change the rule', not_applicable: 'Does not apply', discuss: 'Need input' }

// What was said about a rule in the Oct 29 Hot Lab, so the reviewer sees the
// real case next to the rule. Attributed to the session, not to a person.
const HOT_LAB: Record<string, string> = {
  'single-column': 'Oct 29 Hot Lab: a WCM was flagged for a two-column "Important links" block. Sean said that setup is fine. The rule is about whole pages built in two columns from top to bottom (the old school-site layout), not a two-column element. Asked for the rule to be updated so it is not flagged. Nov 3 Hot Lab: a logo beside the description was flagged too. Sean confirmed it is allowed.',
  'photo-element': 'Nov 3 Hot Lab: a WCM was flagged for a small logo at the top left, which has a transparent background and cannot have rounded corners. Sean said that is the one case where the rounded photo element is not needed, and the rule should not flag it.',
  'current-content': 'Oct 29 Hot Lab: a page about the metal detector program was flagged for 2024 and 2025 dates. Sean said he would flag it too, but that the answer can be an editorial once-over with the director, and a note that the language stays as is.',
  'pdfs-accessible': 'Oct 29 Hot Lab: a WCM said linked documents are all highlighted and some cannot be fixed by the WCM. Sean said items only Finalsite can fix should be filtered out of the WCM view.',
}
const FINALSITE_NOTE = 'Oct 29 and Nov 3 Hot Labs: Sean said items only Finalsite can fix should be filtered out of what a WCM sees, so they do not get stuck. Review whether this one belongs with the District Web Team instead.'
const hotLabNote = (id: string) => HOT_LAB[id] ?? (id.startsWith('finalsite:') || /^a11y-aria-/.test(id) || id === 'a11y-frame-title' || id.startsWith('a11y-landmark') ? FINALSITE_NOTE : null)

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

const short = (u: string) => u.replace(/^https?:\/\/(www\.)?browardschools\.com/, '') || '/'

export default function AuditRulesReviewPage() {
  const [rules, setRules] = useState<Rule[] | null>(null)
  const [finalsite, setFinalsite] = useState<Rule[]>([])
  const [view, setView] = useState<'wcm' | 'finalsite'>('wcm')
  const [reviews, setReviews] = useState<Review[]>([])
  const [me, setMe] = useState('')
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'todo' | 'done' | 'all'>('todo')
  const [area, setArea] = useState('all')

  const load = useCallback(async () => {
    const res = await fetch('/api/bcps/audit-rule-review', { headers: await authHeaders() })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(res.status === 403 ? 'This page is for the District Web Team.' : json.error || 'Could not load the rules.'); return }
    setRules(json.rules); setFinalsite(json.finalsite ?? []); setReviews(json.reviews); setMe(json.me)
  }, [])
  useEffect(() => { load() }, [load])

  const mine = useMemo(() => new Map(reviews.filter((r) => r.reviewer_email === me).map((r) => [r.check_id, r])), [reviews, me])
  const areas = useMemo(() => Array.from(new Set((rules ?? []).map((r) => r.area))).sort(), [rules])
  const inView = view === 'wcm' ? (rules ?? []) : finalsite
  const shown = useMemo(() => inView.filter((r) =>
    (view === 'finalsite' || area === 'all' || r.area === area) && (filter === 'all' || (filter === 'done') === mine.has(r.id))), [inView, view, area, filter, mine])
  const done = inView.filter((r) => mine.has(r.id)).length
  const total = inView.length

  return (
    <div className="ar">
      <style>{CSS}</style>
      <div className="ar-eyebrow">Web Review</div>
      <h1>Audit rule review</h1>
      <p className="ar-lede">Every rule the audit flags pages for, taken from the latest audit of every page. For each one, say whether to keep it, change it, drop it, or ask the team. Add a note if the rule should work differently. Nothing here changes the audit yet. These decisions are what the settings get updated from, and the page can be shared with the District Web Team for their input.</p>
      {err && <p className="ar-muted" role="alert">{err}</p>}
      {!err && !rules && <p className="ar-muted">Loading…</p>}
      {rules && (
        <>
          <div className="ar-progress" role="status">
            <div className="ar-bar" aria-hidden="true"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            <b>{done} of {total}</b> {view === 'wcm' ? 'rules' : 'Finalsite rules'} reviewed by you
          </div>
          <div className="ar-views" role="group" aria-label="Which rules">
            <button type="button" className={view === 'wcm' ? 'on' : ''} aria-pressed={view === 'wcm'} onClick={() => setView('wcm')}>On WCM lists ({rules.length})</button>
            <button type="button" className={view === 'finalsite' ? 'on' : ''} aria-pressed={view === 'finalsite'} onClick={() => setView('finalsite')}>Hidden from WCMs: only Finalsite can fix ({finalsite.length})</button>
          </div>
          {view === 'finalsite' && <p className="ar-lede">The audit already keeps these off WCM lists, because only Finalsite can fix them. They are listed here so the District Web Team can see the size of it and pass it on. Decide whether each stays hidden, and add a note for Finalsite if it should.</p>}
          <div className="ar-tools">
            <div className="ar-filters" role="group" aria-label="Show">
              {([['todo', `Waiting for me (${total - done})`], ['done', `Reviewed (${done})`], ['all', 'All']] as const).map(([f, l]) => (
                <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>
              ))}
            </div>
            {view === 'wcm' && <label className="ar-area">Area <select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="all">All areas</option>{areas.map((a) => <option key={a}>{a}</option>)}
            </select></label>}
          </div>
          {shown.length === 0 && <p className="ar-muted">{filter === 'todo' ? 'You have reviewed every rule here.' : 'Nothing here.'}</p>}
          {shown.map((r) => (
            <RuleCard key={r.id} rule={r} mine={mine.get(r.id)} others={reviews.filter((x) => x.check_id === r.id && x.reviewer_email !== me)} onSaved={load} />
          ))}
        </>
      )}
    </div>
  )
}

function RuleCard({ rule, mine, others, onSaved }: { rule: Rule; mine?: Review; others: Review[]; onSaved: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(mine?.decision ?? null)
  const [comment, setComment] = useState(mine?.comment ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const note = hotLabNote(rule.id)
  const isFs = rule.id.startsWith('finalsite:')
  const dirty = decision !== (mine?.decision ?? null) || comment.trim() !== (mine?.comment ?? '')
  const flagged = rule.fail + rule.review

  const send = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('')
    const res = await fetch('/api/bcps/audit-rule-review', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ check_id: rule.id, ...body }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(json.error || 'Could not save.'); return }
    onSaved()
  }

  return (
    <section className={`ar-card${mine ? ' reviewed' : ''}`} aria-labelledby={`h-${rule.id}`}>
      <div className="ar-head">
        <span className={`ar-kind${rule.id.startsWith('a11y-') ? ' ada' : ''}`}>{rule.area}</span>
        <h2 id={`h-${rule.id}`}>{rule.title}</h2>
        {mine && <span className={`ar-chip ${mine.decision}`}>You: {LABEL[mine.decision]}</span>}
      </div>
      <p className="ar-stats">
        Flags <b>{(isFs ? rule.pages : flagged).toLocaleString()}</b> {(isFs ? rule.pages : flagged) === 1 ? 'page' : 'pages'} across <b>{rule.departments}</b> {rule.departments === 1 ? 'department' : 'departments'}
        {rule.fail > 0 && <> · <span className="ar-fail">{rule.fail} {isFs ? 'findings' : 'fail'}</span></>}
        {rule.review > 0 && <> · <span className="ar-rev">{rule.review} needs a person to look</span></>}
        {rule.pass > 0 && <> · {rule.pass} pass</>}
        {rule.help_url && <> · <a href={rule.help_url} target="_blank" rel="noopener">About this rule</a></>}
      </p>
      {rule.why && <p className="ar-why">{rule.why}</p>}
      {note && <p className="ar-note"><b>Raised in Hot Lab.</b> {note}</p>}

      {((rule.steps && rule.steps.length > 0) || rule.course) && (
        <details className="ar-more">
          <summary>How a WCM fixes it{rule.course ? ' and where the course teaches it' : ''}</summary>
          {rule.steps && rule.steps.length > 0 && <ol>{rule.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          {rule.course && <p><a href={`/certification/departments/course/${rule.course.moduleId}/${rule.course.pageId}`} target="_blank" rel="noopener">{rule.course.label}</a></p>}
        </details>
      )}
      <details className="ar-more">
        <summary>See the pages it flagged ({Math.min(rule.examples.length, flagged)} examples)</summary>
        <ul className="ar-ex">
          {rule.examples.map((e, i) => (
            <li key={i}>
              <a href={e.page_url} target="_blank" rel="noopener">{e.owner ?? short(e.page_url)}</a> <span className="ar-path">{short(e.page_url)}</span>
              <span className={e.status === 'fail' ? 'ar-fail' : 'ar-rev'}> {e.status === 'fail' ? 'Fix' : 'Review'}</span>
              {e.detail && <div className="ar-detail">{e.detail}{e.items && e.items.length > 0 && <> Items: {e.items.slice(0, 4).join('; ')}{e.items.length > 4 ? '…' : ''}</>}</div>}
            </li>
          ))}
        </ul>
      </details>

      <fieldset className="ar-decide">
        <legend>Your decision</legend>
        <div className="ar-opts">
          {DECISIONS.map((d) => (
            <label key={d.id} className={`ar-opt ${d.id}${decision === d.id ? ' on' : ''}`} title={d.hint}>
              <input type="radio" name={`d-${rule.id}`} checked={decision === d.id} onChange={() => setDecision(d.id)} /> {d.label}
            </label>
          ))}
        </div>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} aria-label={`Note on ${rule.title}`} placeholder="Optional: what should change, or why it does not apply." />
        <div className="ar-actions">
          <button type="button" className="ar-btn" disabled={busy || !decision || !dirty} onClick={() => send({ decision, comment })}>{mine ? 'Update' : 'Save decision'}</button>
          {mine && <button type="button" className="ar-link" disabled={busy} onClick={() => { setDecision(null); setComment(''); send({ clear: true }) }}>Clear mine</button>}
          {msg && <span className="ar-err" role="alert">{msg}</span>}
        </div>
      </fieldset>

      {others.length > 0 && (
        <div className="ar-others">
          <b>Team input</b>
          {others.map((o) => (
            <p key={o.reviewer_email}><span className={`ar-chip ${o.decision}`}>{LABEL[o.decision]}</span> <b>{o.reviewer_name ?? o.reviewer_email}</b>{o.comment && <>: {o.comment}</>}</p>
          ))}
        </div>
      )}
    </section>
  )
}

const CSS = `
.ar{padding:24px 28px;max-width:1000px;margin:0 auto}
.ar-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#C55326}
.ar h1{font-size:28px;font-weight:900;margin:4px 0 6px}
.ar-lede{font-size:13.5px;color:rgba(26,26,26,.75);max-width:780px;margin:0 0 14px}
.ar-muted{font-size:13px;color:rgba(26,26,26,.7)}
.ar-progress{display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:12px;flex-wrap:wrap}
.ar-bar{flex:0 0 220px;height:8px;border-radius:99px;background:#e3eef6;overflow:hidden}.ar-bar span{display:block;height:100%;background:#16750C}
.ar-views{display:inline-flex;flex-wrap:wrap;border:1px solid rgba(0,0,0,.18);border-radius:8px;overflow:hidden;margin-bottom:12px}
.ar-views button{font:inherit;font-size:12.5px;font-weight:700;border:0;background:#fff;padding:8px 14px;cursor:pointer;color:#444}.ar-views button.on{background:#5b2d82;color:#fff}.ar-views button:first-child.on{background:#1672A7}
.ar-tools{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:16px}
.ar-filters{display:inline-flex;border:1px solid rgba(0,0,0,.18);border-radius:8px;overflow:hidden}
.ar-filters button{font:inherit;font-size:12.5px;font-weight:700;border:0;background:#fff;padding:7px 12px;cursor:pointer;color:#444}
.ar-filters button.on{background:#1672A7;color:#fff}
.ar-area{font-size:12.5px;font-weight:700;color:#444}.ar-area select{font:inherit;font-size:12.5px;margin-left:6px;padding:5px 8px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff}
.ar-card{background:#fff;border:1px solid rgba(0,0,0,.09);border-left:4px solid #1672A7;border-radius:10px;padding:14px 16px;margin-bottom:14px}
.ar-card.reviewed{border-left-color:#16750C}
.ar-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.ar-head h2{font-size:16px;font-weight:800;margin:0;flex:1;min-width:220px}
.ar-kind{font-size:9.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;padding:2px 6px;background:#e3eef6;color:#0e4e73}.ar-kind.ada{background:#efe7f6;color:#5b2d82}
.ar-chip{font-size:11px;font-weight:800;border-radius:99px;padding:2px 9px;background:#eee;color:#333}
.ar-chip.approve{background:#e4f2e2;color:#16750C}.ar-chip.change{background:#e3eef6;color:#0e4e73}.ar-chip.not_applicable{background:#f3e3dc;color:#8f3a15}.ar-chip.discuss{background:#fbf0d4;color:#7a5200}
.ar-stats{font-size:13px;margin:0 0 6px}.ar-fail{color:#a13a2f;font-weight:700}.ar-rev{color:#8a5a00;font-weight:700}
.ar-why{font-size:13px;color:rgba(26,26,26,.78);margin:0 0 8px}
.ar-note{font-size:12.5px;background:#fdf3ec;border:1px solid rgba(197,83,38,.35);border-radius:8px;padding:8px 10px;margin:0 0 8px}
.ar-more{font-size:12.5px;margin:6px 0}.ar-more summary{cursor:pointer;font-weight:700;color:#0e4e73}.ar-more ol{margin:6px 0 6px 20px}.ar-more a{color:#1672A7}
.ar-ex{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:7px}.ar-ex a{color:#1672A7;font-weight:700}.ar-path{color:#666;font-size:11.5px}
.ar-detail{font-size:12px;color:#444}
.ar-decide{border:1px solid rgba(0,0,0,.12);border-radius:8px;padding:10px 12px;margin:10px 0 0}.ar-decide legend{font-size:11.5px;font-weight:800;padding:0 6px;color:#444}
.ar-opts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.ar-opt{font-size:12.5px;font-weight:700;border:1px solid rgba(0,0,0,.2);border-radius:8px;padding:6px 10px;cursor:pointer;background:#fff}
.ar-opt.on.approve{background:#e4f2e2;border-color:#16750C}.ar-opt.on.change{background:#e3eef6;border-color:#1672A7}.ar-opt.on.not_applicable{background:#f3e3dc;border-color:#C55326}.ar-opt.on.discuss{background:#fbf0d4;border-color:#8a5a00}
.ar textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;border:1px solid rgba(0,0,0,.2);border-radius:8px;padding:8px 10px;resize:vertical}
.ar-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px}
.ar-btn{font:inherit;font-size:12.5px;font-weight:800;border:0;border-radius:8px;padding:8px 14px;background:#1672A7;color:#fff;cursor:pointer}.ar-btn:disabled{opacity:.5;cursor:default}
.ar-link{font:inherit;font-size:12.5px;font-weight:700;color:#a13a2f;background:none;border:0;cursor:pointer;text-decoration:underline}
.ar-err{color:#a13a2f;font-weight:700;font-size:12.5px}
.ar-others{border-top:1px solid rgba(0,0,0,.08);margin-top:10px;padding-top:8px;font-size:12.5px}.ar-others p{margin:4px 0}
.ar :focus-visible{outline:3px solid #1672A7;outline-offset:2px}
@media (max-width:640px){.ar{padding:16px}}
`
