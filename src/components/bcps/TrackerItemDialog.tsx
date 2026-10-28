'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CSS } from '@/components/bcps/CompleteItemDialog'

// The Edit this page and Add your input dialogs on a tracker (V, 2026-10-28),
// in the same panel as a Playbook's. Edit adds an assignment or rewrites one's
// description; input is a note on an assignment, signed with the person's name.
// Data: /api/bcps/web-team-assignments-edit.

export interface TrackerRow { slug: string; title: string; desc: string; status: string }
type Mode = 'edit' | 'input'

const NEW = '__new'
const STATUS_OPTIONS: [string, string][] = [['pending', 'Pending'], ['in-progress', 'In Progress'], ['ongoing', 'Ongoing'], ['completed', 'Completed']]
const FIELD_CSS = `.cid-panel input, .cid-panel select { font: inherit; font-size: 13px; padding: 9px 12px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; width: 100%; box-sizing: border-box; background: #fff; } .tid-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } @media (max-width: 640px) { .tid-grid { grid-template-columns: 1fr; } }`

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function TrackerItemDialog({ mode, rows, onClose, onDone }: { mode: Mode; rows: TrackerRow[]; onClose: () => void; onDone: (message: string) => void }) {
  const isEdit = mode === 'edit'
  // Only rows still in the active list take a new description; input goes on any row.
  const choices = isEdit ? rows.filter((r) => r.status !== 'completed' && r.status !== 'archived') : rows
  const [slug, setSlug] = useState(isEdit ? NEW : '')
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [lead, setLead] = useState('')
  const [support, setSupport] = useState('')
  const [status, setStatus] = useState('pending')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const adding = isEdit && slug === NEW

  const pick = (s: string) => {
    setSlug(s)
    if (isEdit && s !== NEW) setDesc(rows.find((r) => r.slug === s)?.desc ?? '')
    if (isEdit && s === NEW) setDesc('')
  }

  const ready = isEdit ? (adding ? !!title.trim() : !!slug && !!desc.trim()) : !!slug && !!note.trim()

  const save = async () => {
    setBusy(true); setError('')
    try {
      const body = !isEdit ? { action: 'input', slug, text: note }
        : adding ? { action: 'add', title, description: desc, lead, support, status }
        : { action: 'describe', slug, description: desc }
      const res = await fetch('/api/bcps/web-team-assignments-edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Nothing was saved.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      const name = rows.find((r) => r.slug === slug)?.title ?? title
      onDone(!isEdit ? `Your input was added to the notes on ${name}.` : adding ? `${title} was added to the tracker.` : `The description of ${name} was updated.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="cid-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <style dangerouslySetInnerHTML={{ __html: CSS + FIELD_CSS }} />
      <div className="cid-panel" role="dialog" aria-modal="true" aria-labelledby="tid-title">
        <div className="cid-head">
          <h2 id="tid-title">{isEdit ? 'Edit this page' : 'Add your input'}</h2>
          <button type="button" className="cid-x" aria-label="Close" disabled={busy} onClick={onClose}>&times;</button>
        </div>
        <p className="cid-prompt">
          {isEdit
            ? 'Add a new assignment, or rewrite the description of one already on the tracker. To change a title, lead, date or status, click it on the row itself.'
            : 'Share an update, a question or an idea on an assignment. It is added to that assignment’s notes with your name, where the team sees it.'}
        </p>
        {error && <div className="cid-error" role="alert">{error}</div>}

        <label className="cid-block">
          <span className="cid-l">Assignment</span>
          <select value={slug} onChange={(e) => pick(e.target.value)} disabled={busy}>
            {isEdit ? <option value={NEW}>New assignment</option> : <option value="" disabled>Choose an assignment</option>}
            {choices.map((r) => <option key={r.slug} value={r.slug}>{r.title}</option>)}
          </select>
        </label>

        {adding && (
          <label className="cid-block">
            <span className="cid-l">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={busy} />
          </label>
        )}

        {isEdit ? (
          <label className="cid-block">
            <span className="cid-l">Description</span>
            <textarea rows={5} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} disabled={busy}
              placeholder="What the assignment is, where it stands, and what comes next." />
          </label>
        ) : (
          <label className="cid-block">
            <span className="cid-l">Your input</span>
            <textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} disabled={busy} />
          </label>
        )}

        {adding && (
          <div className="tid-grid">
            <label className="cid-block"><span className="cid-l">Lead</span><input value={lead} onChange={(e) => setLead(e.target.value)} maxLength={120} disabled={busy} /></label>
            <label className="cid-block"><span className="cid-l">Support (comma separated)</span><input value={support} onChange={(e) => setSupport(e.target.value)} disabled={busy} /></label>
            <label className="cid-block"><span className="cid-l">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
                {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="cid-actions">
          <button type="button" className="cid-btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="cid-btn" disabled={busy || !ready} onClick={save}>
            {busy ? 'Saving...' : !isEdit ? 'Share my input' : adding ? 'Add assignment' : 'Save description'}
          </button>
        </div>
      </div>
    </div>
  )
}
