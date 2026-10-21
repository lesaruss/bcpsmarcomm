'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Update Web Team Assignments from a meeting transcript (Sean, 2026-10-21).
// Shown only to people granted the 'meeting-transcripts' page (or admins).
// Paste or upload the transcript, Claude proposes the changes, the person
// unticks anything wrong and applies. Data: /api/bcps/meeting-transcript.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const STATUS_LABELS: Record<string, string> = {
  'in-progress': 'In Progress', pending: 'Pending', ongoing: 'Ongoing', completed: 'Completed', archived: 'Archived',
}
const FIELDS: [string, string][] = [
  ['status', 'Status'], ['lead', 'Lead'], ['support', 'Support'], ['start_date', 'Start'],
  ['deadline_date', 'Deadline'], ['priority', 'Priority'], ['ooc', 'OOC'], ['description', 'Description'],
]

interface Change {
  slug: string
  note: string
  evidence: string
  current: { title: string; lead: string; support: string; status: string; deadline: string | null; priority: string | null }
  [k: string]: unknown
}
interface NewItem { title: string; description: string; lead: string | null; support: string[] | null; deadline_date: string | null; priority: string | null; ooc: boolean; note: string; evidence: string }
interface Proposal { summary: string; changes: Change[]; new_items: NewItem[] }
interface Upload { id: string; meeting_date: string; meeting_label: string; status: string; uploaded_by_name: string | null; created_at: string; result: { changed?: number; added?: number } | null }

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  return new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Teams and Zoom export WebVTT. Drop the header, cue numbers and timings, keep
// "Speaker: words", and join a speaker's consecutive cues into one line.
function cleanTranscript(raw: string): string {
  if (!/^﻿?WEBVTT/.test(raw) && !/-->/.test(raw)) return raw.trim()
  const lines: string[] = []
  let last = ''
  for (const block of raw.replace(/\r/g, '').split(/\n\n+/)) {
    // Anything above the timing line is a cue id (Teams writes a GUID there).
    const all = block.split('\n')
    const timing = all.findIndex((l) => /-->/.test(l))
    if (timing < 0) continue
    const text = all.slice(timing + 1).filter(Boolean).join(' ')
    if (!text) continue
    const m = /^<v ([^>]+)>(.*?)(<\/v>)?$/.exec(text)
    const speaker = m ? m[1].trim() : ''
    const words = (m ? m[2] : text).replace(/<[^>]+>/g, '').trim()
    if (!words) continue
    if (speaker && speaker === last) lines[lines.length - 1] += ' ' + words
    else lines.push(speaker ? `${speaker}: ${words}` : words)
    last = speaker
  }
  return lines.join('\n')
}

function show(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '-'
  if (field === 'status') return STATUS_LABELS[String(v)] ?? String(v)
  if (field === 'ooc') return v ? 'Yes' : 'No'
  if (field.endsWith('_date') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v)
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'None'
  return String(v)
}

function currentOf(c: Change, field: string): unknown {
  if (field === 'deadline_date') return c.current.deadline
  if (field === 'start_date' || field === 'ooc' || field === 'description') return undefined
  return (c.current as unknown as Record<string, unknown>)[field]
}

export default function MeetingTranscriptUpload({ onApplied }: { onApplied: () => void }) {
  const [allowed, setAllowed] = useState(false)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('District Web Team Meeting')
  const [date, setDate] = useState(today())
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState<'' | 'reading' | 'applying'>('')
  const [error, setError] = useState('')
  const [uploadId, setUploadId] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [keepChange, setKeepChange] = useState<boolean[]>([])
  const [keepNew, setKeepNew] = useState<boolean[]>([])
  const [done, setDone] = useState('')

  const loadUploads = async () => {
    const res = await fetch('/api/bcps/meeting-transcript', { headers: await authHeaders(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    setAllowed(!!j.allowed)
    setUploads(j.uploads ?? [])
  }
  useEffect(() => { loadUploads().catch(() => {}) }, [])

  if (!allowed) return null

  const reset = () => {
    setTranscript(''); setProposal(null); setUploadId(''); setError(''); setDone('')
    setKeepChange([]); setKeepNew([])
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (/\.docx$/i.test(f.name)) { setError('Word files cannot be read here. In Teams, download the transcript as .vtt, or open the Word file and paste the text.'); return }
    setError('')
    setTranscript(cleanTranscript(await f.text()))
  }

  const read = async () => {
    setBusy('reading'); setError(''); setDone('')
    try {
      const res = await fetch('/api/bcps/meeting-transcript', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'propose', transcript: cleanTranscript(transcript), meeting_date: date, meeting_label: label }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      setUploadId(j.upload_id)
      setProposal(j.proposal)
      setKeepChange(j.proposal.changes.map(() => true))
      setKeepNew(j.proposal.new_items.map(() => true))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  const apply = async () => {
    if (!proposal) return
    setBusy('applying'); setError('')
    try {
      const payload = {
        summary: proposal.summary,
        changes: proposal.changes.filter((_, i) => keepChange[i]),
        new_items: proposal.new_items.filter((_, i) => keepNew[i]),
      }
      const res = await fetch('/api/bcps/meeting-transcript', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'apply', upload_id: uploadId, payload }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      const r = j.result || {}
      setDone(`Updated ${r.changed ?? 0} row${r.changed === 1 ? '' : 's'} and added ${r.added ?? 0} new item${r.added === 1 ? '' : 's'}. Each one has a note naming this meeting.`)
      setProposal(null); setTranscript(''); setUploadId('')
      onApplied()
      loadUploads().catch(() => {})
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  const discard = async () => {
    if (uploadId) {
      await fetch('/api/bcps/meeting-transcript', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'discard', upload_id: uploadId }),
      }).catch(() => {})
    }
    reset()
    loadUploads().catch(() => {})
  }

  const kept = keepChange.filter(Boolean).length + keepNew.filter(Boolean).length

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mtu-bar">
        <span>Were you in a meeting? Update this tracker from its transcript.</span>
        <button type="button" className="mtu-btn" onClick={() => { setOpen(true); setDone('') }}>Upload meeting transcript</button>
      </div>

      {open && (
        <div className="mtu-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
          <div className="mtu-panel" role="dialog" aria-modal="true" aria-labelledby="mtu-title">
            <div className="mtu-head">
              <h2 id="mtu-title">Update from a meeting transcript</h2>
              <button type="button" className="mtu-x" aria-label="Close" disabled={!!busy} onClick={() => setOpen(false)}>&times;</button>
            </div>

            {done && <div className="mtu-done">{done}</div>}
            {error && <div className="mtu-error" role="alert">{error}</div>}

            {!proposal && (
              <>
                <p className="mtu-help">Claude reads the transcript against the tracker and proposes changes: deadlines, leads, statuses and new action items. Nothing changes until you review them and press Apply.</p>
                <div className="mtu-grid">
                  <label><span className="mtu-l">Meeting</span><input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} /></label>
                  <label><span className="mtu-l">Meeting date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                </div>
                <label className="mtu-block">
                  <span className="mtu-l">Transcript</span>
                  <textarea rows={12} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the transcript here, or choose a file below." />
                </label>
                <div className="mtu-row">
                  <label className="mtu-file">Choose a file (.vtt or .txt)<input type="file" accept=".vtt,.txt,.srt,.md,text/plain,text/vtt" onChange={(e) => onFile(e.target.files?.[0])} /></label>
                  <span className="mtu-count">{transcript ? `${transcript.length.toLocaleString()} characters` : ''}</span>
                </div>
                <div className="mtu-actions">
                  <button type="button" className="mtu-btn" disabled={!!busy || transcript.trim().length < 200} onClick={read}>
                    {busy === 'reading' ? 'Reading the transcript... (a minute or two)' : 'Read transcript'}
                  </button>
                </div>

                {uploads.length > 0 && (
                  <div className="mtu-recent">
                    <span className="mtu-l">Recent uploads</span>
                    {uploads.map((u) => (
                      <div key={u.id} className="mtu-recent-row">
                        <span>{fmtDate(u.meeting_date)} {u.meeting_label}</span>
                        <span>{u.uploaded_by_name || ''}</span>
                        <span className={`mtu-st ${u.status}`}>{u.status === 'applied' && u.result ? `Applied: ${u.result.changed ?? 0} updated, ${u.result.added ?? 0} added` : u.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {proposal && (
              <>
                <label className="mtu-block">
                  <span className="mtu-l">Meeting summary (shown at the top of the tracker)</span>
                  <textarea rows={3} value={proposal.summary} onChange={(e) => setProposal({ ...proposal, summary: e.target.value })} />
                </label>

                <h3>Changes to existing rows ({proposal.changes.length})</h3>
                {!proposal.changes.length && <p className="mtu-help">None found.</p>}
                {proposal.changes.map((c, i) => (
                  <div key={c.slug + i} className={`mtu-card${keepChange[i] ? '' : ' off'}`}>
                    <label className="mtu-check">
                      <input type="checkbox" checked={keepChange[i]} onChange={(e) => setKeepChange(keepChange.map((k, j) => (j === i ? e.target.checked : k)))} />
                      <strong>{c.current.title}</strong>
                    </label>
                    <ul className="mtu-diff">
                      {FIELDS.filter(([f]) => c[f] !== null && c[f] !== undefined).map(([f, name]) => {
                        const before = currentOf(c, f)
                        return (
                          <li key={f}><span className="mtu-l">{name}</span>{before !== undefined && <><s>{show(f, before)}</s> &rarr; </>}<b>{show(f, c[f])}</b></li>
                        )
                      })}
                    </ul>
                    <p className="mtu-note">Note: {c.note}</p>
                    <p className="mtu-ev">From the transcript: &ldquo;{c.evidence}&rdquo;</p>
                  </div>
                ))}

                <h3>New items ({proposal.new_items.length})</h3>
                {!proposal.new_items.length && <p className="mtu-help">None found.</p>}
                {proposal.new_items.map((n, i) => (
                  <div key={n.title + i} className={`mtu-card${keepNew[i] ? '' : ' off'}`}>
                    <label className="mtu-check">
                      <input type="checkbox" checked={keepNew[i]} onChange={(e) => setKeepNew(keepNew.map((k, j) => (j === i ? e.target.checked : k)))} />
                      <strong>{n.title}</strong>
                    </label>
                    <p className="mtu-desc">{n.description}</p>
                    <ul className="mtu-diff">
                      <li><span className="mtu-l">Lead</span><b>{show('lead', n.lead)}</b></li>
                      {n.support && n.support.length > 0 && <li><span className="mtu-l">Support</span><b>{show('support', n.support)}</b></li>}
                      {n.deadline_date && <li><span className="mtu-l">Deadline</span><b>{show('deadline_date', n.deadline_date)}</b></li>}
                      {n.priority && <li><span className="mtu-l">Priority</span><b>{n.priority}</b></li>}
                      <li><span className="mtu-l">OOC</span><b>{n.ooc ? 'Yes' : 'No'}</b></li>
                    </ul>
                    <p className="mtu-ev">From the transcript: &ldquo;{n.evidence}&rdquo;</p>
                  </div>
                ))}

                <div className="mtu-actions sticky">
                  <button type="button" className="mtu-btn ghost" disabled={!!busy} onClick={discard}>Discard</button>
                  <button type="button" className="mtu-btn" disabled={!!busy || (!kept && !proposal.summary.trim())} onClick={apply}>
                    {busy === 'applying' ? 'Applying...' : `Apply ${kept} change${kept === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const CSS = `
.mtu-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 20px; background: #fff; border-bottom: 1px solid rgba(0,0,0,0.09); font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; font-size: 13px; color: rgba(26,26,26,0.7); }
.mtu-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.mtu-btn.ghost { background: #fff; color: #0e4e73; }
.mtu-btn:disabled { opacity: 0.5; cursor: default; }
.mtu-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.mtu-panel { background: #fff; border-radius: 10px; width: min(860px, 100%); padding: 24px 28px; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.mtu-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.mtu-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.mtu-panel h3 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0e4e73; margin: 22px 0 10px; }
.mtu-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.mtu-help { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.7); margin: 0 0 14px; }
.mtu-l { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.mtu-grid { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr); gap: 12px; margin-bottom: 12px; }
.mtu-panel input:not([type=checkbox]):not([type=file]), .mtu-panel textarea { font: inherit; font-size: 13px; padding: 9px 12px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; width: 100%; box-sizing: border-box; background: #fff; color: #1a1a1a; }
.mtu-block { display: block; margin-bottom: 10px; }
.mtu-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.mtu-file { font-size: 12px; font-weight: 700; color: #0e4e73; cursor: pointer; }
.mtu-file input { display: block; margin-top: 6px; font-size: 12px; }
.mtu-count { font-size: 11px; color: rgba(26,26,26,0.5); }
.mtu-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.mtu-actions.sticky { position: sticky; bottom: -24px; background: #fff; padding: 14px 0 4px; border-top: 1px solid rgba(0,0,0,0.08); }
.mtu-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.mtu-done { background: rgba(22,117,12,0.08); border-left: 4px solid #16750C; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.mtu-card { border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
.mtu-card.off { opacity: 0.45; }
.mtu-check { display: flex; gap: 10px; align-items: center; font-size: 14px; cursor: pointer; }
.mtu-check input { width: 18px; height: 18px; flex: none; }
.mtu-diff { list-style: none; padding: 0; margin: 10px 0 6px 28px; display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.mtu-diff li .mtu-l { display: inline-block; min-width: 90px; margin: 0; }
.mtu-diff s { color: rgba(26,26,26,0.5); }
.mtu-desc, .mtu-note { font-size: 13px; line-height: 1.5; margin: 6px 0 0 28px; }
.mtu-ev { font-size: 12px; line-height: 1.5; color: rgba(26,26,26,0.6); font-style: italic; margin: 6px 0 0 28px; }
.mtu-recent { margin-top: 22px; border-top: 1px solid rgba(0,0,0,0.08); padding-top: 14px; }
.mtu-recent-row { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr) minmax(0,1.4fr); gap: 10px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.05); }
.mtu-st { font-weight: 700; text-transform: capitalize; }
.mtu-st.applied { color: #16750C; }
.mtu-st.failed { color: #b91c1c; }
@media (max-width: 640px) { .mtu-grid, .mtu-recent-row { grid-template-columns: 1fr; } .mtu-panel { padding: 18px 16px; } }
`
