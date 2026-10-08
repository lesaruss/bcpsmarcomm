'use client'
// Audit question bank (Sean, 2026-10-08). Questions WCMs ask from an audit or
// ADA item land here for the District Web Team. Grouped by item, most-asked
// first, so a question many people share stands out for a Hot Lab or a
// clearer write-up. An answer shows under that item for every WCM unless
// "Share with every WCM" is unticked. Admins only (the API enforces it).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useBCPSShell } from '@/components/BCPSShell'

type Q = {
  id: string; created_at: string; asked_by: string; page_url: string | null; check_id: string; check_title: string
  question: string; status: 'open' | 'answered' | 'closed'; answer: string | null; answered_by: string | null; shared: boolean
  bcps_departments: { name: string } | null; bcps_schools: { name: string } | null
}

const supabase = createClient()
async function auth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function AuditQuestionsPage() {
  const { role } = useBCPSShell()
  const [list, setList] = useState<Q[] | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<'open' | 'answered' | 'all'>('open')

  const load = useCallback(async () => {
    const res = await fetch('/api/bcps/audit-questions?all=1', { headers: await auth() })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(json.error || 'Could not load the questions.'); return }
    setList(json.questions)
  }, [])
  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const m = new Map<string, { title: string; all: Q[] }>()
    for (const q of list ?? []) {
      const g = m.get(q.check_id) ?? { title: q.check_title, all: [] }
      g.all.push(q); m.set(q.check_id, g)
    }
    return Array.from(m.entries())
      .map(([id, g]) => ({ id, ...g, shown: g.all.filter((q) => filter === 'all' || q.status === filter) }))
      .filter((g) => g.shown.length)
      .sort((a, b) => b.all.length - a.all.length)
  }, [list, filter])
  const openCount = (list ?? []).filter((q) => q.status === 'open').length

  if (role !== 'superadmin') return <p style={{ padding: 24 }}>This page is for the District Web Team.</p>
  return (
    <div className="aq">
      <style>{CSS}</style>
      <div className="aq-eyebrow">Web Review</div>
      <h1>Audit question bank</h1>
      <p className="aq-lede">Questions WCMs asked from an audit or ADA item. Your answer shows under that item for every WCM. Items many people ask about are listed first; those are the ones to cover in a Hot Lab or to explain better in the steps.</p>
      <div className="aq-filters" role="group" aria-label="Show">
        {(['open', 'answered', 'all'] as const).map((f) => (
          <button key={f} type="button" className={filter === f ? 'on' : ''} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'open' ? `Waiting (${openCount})` : f === 'answered' ? 'Answered' : 'All'}
          </button>
        ))}
      </div>
      {err && <p className="aq-muted">{err}</p>}
      {!err && !list && <p className="aq-muted">Loading…</p>}
      {list && groups.length === 0 && <p className="aq-muted">{filter === 'open' ? 'No questions waiting.' : 'Nothing here yet.'}</p>}
      {groups.map((g) => (
        <section key={g.id} className="aq-group">
          <div className="aq-group-h">
            <span className={`aq-kind${g.id.startsWith('a11y-') ? ' ada' : ''}`}>{g.id.startsWith('a11y-') ? 'ADA' : 'Audit'}</span>
            <h2>{g.title}</h2>
            <span className={`aq-count${g.all.length >= 3 ? ' hot' : ''}`}>{g.all.length} question{g.all.length === 1 ? '' : 's'}{g.all.length >= 3 ? ' · Hot Lab topic' : ''}</span>
          </div>
          {g.shown.map((q) => <Row key={q.id} q={q} onSaved={load} />)}
        </section>
      ))}
    </div>
  )
}

function Row({ q, onSaved }: { q: Q; onSaved: () => void }) {
  const [answer, setAnswer] = useState(q.answer ?? '')
  const [shared, setShared] = useState(q.shared)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const save = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg('')
    const res = await fetch('/api/bcps/audit-questions', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await auth()) }, body: JSON.stringify({ id: q.id, ...body }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg(json.error || 'Could not save.'); return }
    onSaved()
  }
  const where = q.bcps_departments?.name ?? q.bcps_schools?.name ?? ''
  return (
    <div className={`aq-row ${q.status}`}>
      <div className="aq-meta">
        <b>{q.asked_by}</b>{where && <> · {where}</>} · {new Date(q.created_at).toLocaleDateString()}
        {q.page_url && <> · <a href={q.page_url} target="_blank" rel="noopener">{q.page_url.replace(/^https?:\/\/(www\.)?[^/]+/, '') || '/'}</a></>}
        <span className="aq-status">{q.status === 'open' ? 'Waiting' : q.status === 'answered' ? 'Answered' : 'Closed'}</span>
      </div>
      <p className="aq-q">{q.question}</p>
      <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Answer for the WCM, in plain steps." aria-label="Answer" />
      <div className="aq-actions">
        <label><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Share with every WCM</label>
        <button type="button" className="aq-btn" disabled={busy || !answer.trim()} onClick={() => save({ answer, shared })}>{q.status === 'answered' ? 'Update answer' : 'Send answer'}</button>
        {q.status !== 'closed' && <button type="button" className="aq-link" disabled={busy} onClick={() => save({ status: 'closed' })}>Close without answer</button>}
        {msg && <span className="aq-err">{msg}</span>}
      </div>
    </div>
  )
}

const CSS = `
.aq{padding:24px 28px;max-width:1000px;margin:0 auto}
.aq-eyebrow{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#C55326}
.aq h1{font-size:28px;font-weight:900;margin:4px 0 6px}
.aq-lede{font-size:13.5px;color:rgba(26,26,26,.7);max-width:760px;margin:0 0 14px}
.aq-muted{font-size:13px;color:rgba(26,26,26,.6)}
.aq-filters{display:inline-flex;border:1px solid rgba(0,0,0,.12);border-radius:8px;overflow:hidden;margin-bottom:16px}
.aq-filters button{font:inherit;font-size:12.5px;font-weight:700;border:0;background:#fff;padding:7px 12px;cursor:pointer;color:#555}
.aq-filters button.on{background:#1672A7;color:#fff}
.aq-group{background:#fff;border:1px solid rgba(0,0,0,.09);border-radius:10px;padding:14px 16px;margin-bottom:14px}
.aq-group-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.aq-group-h h2{font-size:15px;font-weight:800;margin:0;flex:1;min-width:200px}
.aq-kind{font-size:9.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;border-radius:4px;padding:2px 6px;background:#e3eef6;color:#0e4e73}.aq-kind.ada{background:#efe7f6;color:#5b2d82}
.aq-count{font-size:11.5px;font-weight:800;color:#555}.aq-count.hot{color:#a13a2f}
.aq-row{border-top:1px solid rgba(0,0,0,.07);padding:10px 0}
.aq-meta{font-size:11.5px;color:#555;display:flex;flex-wrap:wrap;gap:2px 4px;align-items:center}.aq-meta a{color:#1672A7}
.aq-status{margin-left:auto;font-weight:800;font-size:11px}
.aq-row.open .aq-status{color:#8a5a00}.aq-row.answered .aq-status{color:#1e6b3a}.aq-row.closed .aq-status{color:#888}
.aq-q{font-size:13.5px;font-weight:700;margin:4px 0 8px}
.aq textarea{width:100%;box-sizing:border-box;font:inherit;font-size:13px;border:1px solid rgba(0,0,0,.18);border-radius:8px;padding:8px 10px;resize:vertical}
.aq-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:12.5px}
.aq-btn{font:inherit;font-size:12.5px;font-weight:800;border:0;border-radius:8px;padding:8px 14px;background:#1672A7;color:#fff;cursor:pointer}.aq-btn:disabled{opacity:.5;cursor:default}
.aq-link{font:inherit;font-size:12.5px;font-weight:700;color:#a13a2f;background:none;border:0;cursor:pointer;text-decoration:underline}
.aq-err{color:#a13a2f;font-weight:700}
@media (max-width:640px){.aq{padding:16px}}
`
