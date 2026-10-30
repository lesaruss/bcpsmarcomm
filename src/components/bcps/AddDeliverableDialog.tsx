'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Add a deliverable (BCPS Document System, Phase 3, V 2026-10-28). Opens from
// the Add a deliverable button in a Playbook's Deliverables Shelf, shown to
// the project's leads and the superadmin. One slot per deliverable: a name,
// an owner (someone who can open the Playbook) and an optional due date. The
// owner then turns it in with Turn in my work. Data: /api/bcps/playbook-items.

export interface Person { name: string; email: string }

export default function AddDeliverableDialog({ slug, people, onClose, onDone }: { slug: string; people: Person[]; onClose: () => void; onDone: (message: string) => void }) {
  const [title, setTitle] = useState('')
  const [owner, setOwner] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const save = async () => {
    setBusy(true); setError('')
    try {
      const token = (await createClient().auth.getSession()).data.session?.access_token
      const res = await fetch('/api/bcps/playbook-items', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: 'add_slot', slug, title, owner_email: owner, due }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      const name = people.find((p) => p.email === owner)?.name || 'The owner'
      onDone(`Added to the Deliverables Shelf. ${name} sees Turn in my work beside it; the previous version is kept.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="add-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="add-panel" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="add-head">
          <h2 id="add-title">Add a deliverable</h2>
          <button type="button" className="add-x" aria-label="Close" disabled={busy} onClick={onClose}>&times;</button>
        </div>
        <p className="add-help">One slot per thing this project has to hand over: a plan, a report, a deck, a page. The owner turns it in here before the project moves to Wrapping Up.</p>
        {error && <div className="add-error" role="alert">{error}</div>}
        <label className="add-block"><span className="add-l">Deliverable</span>
          <input value={title} maxLength={160} placeholder="For example: School Support Plan, final version" onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="add-grid">
          <label className="add-block"><span className="add-l">Owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Choose who turns it in</option>
              {sorted.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
            </select>
          </label>
          <label className="add-block"><span className="add-l">Due (optional)</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        {!people.length && <p className="add-help">Nobody is on this Playbook&apos;s access list yet, so there is no one to pick as owner.</p>}
        <div className="add-actions">
          <button type="button" className="add-btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="add-btn" disabled={busy || !title.trim() || !owner} onClick={save}>{busy ? 'Adding...' : 'Add to the Shelf'}</button>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.add-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.add-panel { background: #fff; border-radius: 10px; width: min(560px, 100%); padding: 24px 28px; font-family: 'Open Sans', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.add-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.add-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.add-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.add-help { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.75); margin: 0 0 14px; }
.add-l { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.add-block { display: block; margin-bottom: 12px; }
.add-grid { display: grid; grid-template-columns: 1fr 180px; gap: 12px; }
.add-panel input, .add-panel select { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; width: 100%; box-sizing: border-box; background: #fff; }
.add-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.add-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.add-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.add-btn.ghost { background: #fff; color: #0e4e73; }
.add-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) { .add-panel { padding: 18px 16px; } .add-grid { grid-template-columns: 1fr; } }
`
