'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Build next agenda (BCPS Document System, Phase 3, V 2026-10-28). Shown on a
// Playbook to its leads and the superadmin, beside Upload transcript. The page
// proposes up to six items from what is still open (last meeting's to-dos,
// overdue to-dos, open questions, Missing sections, team input); the lead
// edits, reorders or swaps them, then saves. Saving files the agenda as a
// Meeting Record under the Playbook and fills its Next Meeting Agenda section.
// Data: /api/bcps/playbook-agenda.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type Verb = 'Decide' | 'Assign' | 'Confirm' | 'Review'
const VERBS: Verb[] = ['Decide', 'Assign', 'Confirm', 'Review']
const MAX = 6
interface Item { key: string; source: string; verb: Verb; title: string; owner: string; minutes: number; detail: string; strikes: number }
const SOURCE: Record<string, string> = {
  standing: 'Last meeting', overdue: 'Overdue', question: 'Open question', missing: 'Missing section', input: 'Team input', lead: 'Added by you',
}

export default function AgendaBuilder({ playbook, onSaved }: { playbook: string; onSaved: () => void }) {
  const [allowed, setAllowed] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [more, setMore] = useState<Item[]>([])
  const [last, setLast] = useState<{ date: string; path: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ path: string; note: string } | null>(null)

  const load = async () => {
    const get = async () => fetch(`/api/bcps/playbook-agenda?slug=${encodeURIComponent(playbook)}`, { headers: await authHeaders(), cache: 'no-store' })
    let res = await get()
    if (res.status === 401) { await supabaseClient.auth.refreshSession().catch(() => null); res = await get() }
    const j = await res.json().catch(() => ({}))
    setAllowed(!!j.allowed)
    if (j.allowed) {
      setLabel(j.label || ''); setDate(j.date || ''); setItems(j.items ?? []); setMore(j.more ?? []); setLast(j.last ?? null)
    }
  }
  useEffect(() => {
    load().catch(() => {})
    const { data } = supabaseClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load().catch(() => {})
    })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbook])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!allowed) return null

  const start = async () => {
    setOpen(true); setDone(null); setError(''); setLoading(true)
    try { await load() } catch { setError('The agenda could not be built. Try again.') } finally { setLoading(false) }
  }
  const set = (i: number, patch: Partial<Item>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]; [next[i], next[j]] = [next[j], next[i]]; setItems(next)
  }
  const drop = (i: number) => { const it = items[i]; setItems(items.filter((_, j) => j !== i)); if (it.source !== 'lead') setMore([it, ...more]) }
  const take = (i: number) => { if (items.length >= MAX) return; setItems([...items, more[i]]); setMore(more.filter((_, j) => j !== i)) }
  const addOwn = () => {
    if (items.length >= MAX) return
    setItems([...items, { key: '', source: 'lead', verb: 'Decide', title: '', owner: '', minutes: 10, detail: '', strikes: 1 }])
  }
  const total = items.reduce((n, it) => n + (Number(it.minutes) || 0), 0)

  const save = async () => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/bcps/playbook-agenda', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'save', slug: playbook, label, date, items: items.filter((it) => it.title.trim()) }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      setDone({
        path: j.path,
        note: j.playbook_updated ? 'Saved. The agenda is filed under this Playbook, and the page now shows it under Next Meeting Agenda.'
          : j.has_section ? 'Saved and filed under this Playbook. The page changed while you worked, so Next Meeting Agenda was not updated; reload and save again to add it.'
          : 'Saved and filed under this Playbook.',
      })
      onSaved()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" className="wcm-hub2-card-btn" onClick={start}>Build next agenda</button>
      {open && (
        <div className="agb-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
          <div className="agb-panel" role="dialog" aria-modal="true" aria-labelledby="agb-title">
            <div className="agb-head">
              <h2 id="agb-title">Next meeting agenda</h2>
              <button type="button" className="agb-x" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>&times;</button>
            </div>
            {done ? (
              <div className="agb-done" role="status">{done.note} <a href={done.path} target="_top">Open the agenda</a></div>
            ) : loading ? (
              <p className="agb-help">Reading what is still open on this page...</p>
            ) : (
              <>
                <p className="agb-help">Built from what is still open on this page: last meeting&apos;s to-dos, overdue to-dos, open questions, Missing sections and team input. Six items at most. Each one ends in a decision, an owner, a confirmed date or a review. Nothing is saved until you click Save agenda.{last && <> The last agenda was for {fmt(last.date)}{last.path && <>: <a href={last.path} target="_top">open it</a></>}.</>}</p>
                {error && <div className="agb-error" role="alert">{error}</div>}
                <div className="agb-grid">
                  <label><span className="agb-l">Meeting</span><input value={label} onChange={(e) => setLabel(e.target.value)} /></label>
                  <label><span className="agb-l">Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                </div>

                <h3 className="agb-h">Agenda <span>{items.length} of {MAX} &middot; about {total} minutes</span></h3>
                {!items.length && <p className="agb-help">Nothing is open on this page right now. Add your own item, or skip the meeting.</p>}
                <ol className="agb-items">
                  {items.map((it, i) => (
                    <li key={(it.key || 'own') + i} className="agb-item">
                      <div className="agb-row">
                        <select aria-label="Outcome" value={it.verb} onChange={(e) => set(i, { verb: e.target.value as Verb })}>
                          {VERBS.map((v) => <option key={v}>{v}</option>)}
                        </select>
                        <input aria-label="Item" className="agb-title" value={it.title} placeholder="What the meeting settles" onChange={(e) => set(i, { title: e.target.value })} />
                      </div>
                      <div className="agb-row agb-sub">
                        <label><span className="agb-l">Owner</span><input value={it.owner} onChange={(e) => set(i, { owner: e.target.value })} /></label>
                        <label className="agb-min"><span className="agb-l">Minutes</span><input type="number" min={1} max={60} value={it.minutes} onChange={(e) => set(i, { minutes: Number(e.target.value) })} /></label>
                        <span className="agb-src">{SOURCE[it.source] ?? ''}</span>
                        <span className="agb-tools">
                          <button type="button" className="agb-link" disabled={i === 0} aria-label={`Move item ${i + 1} up`} onClick={() => move(i, -1)}>Up</button>
                          <button type="button" className="agb-link" disabled={i === items.length - 1} aria-label={`Move item ${i + 1} down`} onClick={() => move(i, 1)}>Down</button>
                          <button type="button" className="agb-link" aria-label={`Remove item ${i + 1}`} onClick={() => drop(i)}>Remove</button>
                        </span>
                      </div>
                      {it.detail && <p className="agb-detail">{it.detail}</p>}
                      {it.strikes >= 3 && <p className="agb-strike">Third agenda in a row. Saving adds it to Concerns to Watch for the sponsor.</p>}
                    </li>
                  ))}
                </ol>
                <button type="button" className="agb-link" disabled={items.length >= MAX} onClick={addOwn}>Add your own item</button>

                {more.length > 0 && (
                  <>
                    <h3 className="agb-h">Also open <span>not on the agenda</span></h3>
                    <ul className="agb-more">
                      {more.map((it, i) => (
                        <li key={it.key + i}>
                          <span><strong>{it.verb}:</strong> {it.title} <em>{SOURCE[it.source] ?? ''}, {it.owner}</em></span>
                          <button type="button" className="agb-link" disabled={items.length >= MAX} onClick={() => take(i)}>Add</button>
                        </li>
                      ))}
                    </ul>
                    {items.length >= MAX && <p className="agb-hint">The agenda is full. Remove an item to add one of these.</p>}
                  </>
                )}

                <div className="agb-actions">
                  <button type="button" className="agb-btn ghost" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
                  <button type="button" className="agb-btn" disabled={busy || !items.some((it) => it.title.trim()) || !date || !label.trim()} onClick={save}>{busy ? 'Saving...' : 'Save agenda'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function fmt(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const CSS = `
.agb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.agb-panel { background: #fff; border-radius: 10px; width: min(760px, 100%); padding: 24px 28px; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.agb-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.agb-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.agb-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.agb-help { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.75); margin: 0 0 14px; }
.agb-help a, .agb-done a { color: #0e4e73; font-weight: 700; }
.agb-grid { display: grid; grid-template-columns: 1fr 180px; gap: 12px; margin-bottom: 8px; }
.agb-l { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.agb-panel input, .agb-panel select { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; width: 100%; box-sizing: border-box; background: #fff; }
.agb-h { font-size: 13px; font-weight: 800; margin: 18px 0 8px; }
.agb-h span { font-weight: 600; color: rgba(26,26,26,0.55); margin-left: 6px; }
.agb-items { list-style: none; padding: 0; margin: 0 0 10px; display: flex; flex-direction: column; gap: 10px; counter-reset: agb; }
.agb-item { border: 1px solid rgba(0,0,0,0.12); border-radius: 8px; padding: 10px 12px; }
.agb-row { display: flex; gap: 8px; align-items: flex-end; flex-wrap: wrap; }
.agb-row select { width: 110px; flex: none; }
.agb-row .agb-title { flex: 1; min-width: 200px; font-weight: 700; }
.agb-sub { margin-top: 8px; }
.agb-sub label { flex: 1; min-width: 140px; }
.agb-sub .agb-min { flex: none; width: 90px; min-width: 0; }
.agb-src { font-size: 11px; font-weight: 700; color: rgba(26,26,26,0.55); padding-bottom: 9px; }
.agb-tools { display: flex; gap: 12px; padding-bottom: 9px; margin-left: auto; }
.agb-detail { font-size: 12px; line-height: 1.55; color: rgba(26,26,26,0.7); margin: 8px 0 0; }
.agb-strike { font-size: 12px; font-weight: 700; color: #8a4b00; margin: 6px 0 0; }
.agb-link { font: inherit; font-size: 12px; font-weight: 700; color: #0e4e73; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.agb-link:disabled { opacity: 0.4; cursor: default; }
.agb-more { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
.agb-more li { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; padding: 8px 12px; border: 1px dashed rgba(0,0,0,0.15); border-radius: 6px; }
.agb-more em { font-style: normal; font-size: 11px; color: rgba(26,26,26,0.55); margin-left: 6px; }
.agb-hint { font-size: 12px; color: rgba(26,26,26,0.6); margin: 6px 0 0; }
.agb-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.agb-done { background: rgba(22,117,12,0.07); border-left: 4px solid #16750C; padding: 12px 14px; border-radius: 6px; font-size: 13px; line-height: 1.6; }
.agb-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.agb-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.agb-btn.ghost { background: #fff; color: #0e4e73; }
.agb-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) { .agb-panel { padding: 18px 16px; } .agb-grid { grid-template-columns: 1fr; } .agb-tools { margin-left: 0; } }
`
