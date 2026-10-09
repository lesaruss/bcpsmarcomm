'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

// MarComm Assignments (Sean, 2026-10-08). The Office of Communications request
// tracker, modeled on Web Team Assignments and replacing the MarComm
// Spreadsheet: one row per request, lead and support, date needed, a real
// status (the spreadsheet used its Status column as a running log), and the
// dated notes log underneath. Requests arrive from /marcomm-request; the team
// can also add its own work. Data: /api/bcps/marcomm-requests, gated on the
// 'marcomm-assignments' page grant.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Attachment { name: string; path: string }
interface Req {
  id: string
  job_number: number | null
  source: 'form' | 'wufoo' | 'internal'
  title: string
  requester_name: string | null
  requester_title: string | null
  requester_email: string | null
  requester_phone: string | null
  org_type: string | null
  org_name: string | null
  services: string[]
  audiences: string[]
  description: string | null
  goal: string | null
  date_needed: string | null
  event_date: string | null
  is_becon: boolean
  calendar_needed: boolean
  attachments: Attachment[]
  lead: string | null
  support: string | null
  status: string
  priority: Priority | null
  start_date: string | null
  is_ongoing: boolean
  overdue_dismissed: boolean
  link_url: string | null
  submitted_at: string
  completed_at: string | null
}
type Priority = 'high' | 'medium' | 'low'
interface Note {
  id: string; request_id: string; body: string; author: string | null; created_at: string
  source: 'typed' | 'dictated' | 'meeting' | 'system'; meeting_label: string | null
}
// A saved version of the tracker, taken after each Marcomm Meeting (from its
// transcript when the meeting was recorded, or saved by hand when it was not).
interface SnapshotMeta { id: string; meeting_date: string; label: string; summary: string | null; source: 'manual' | 'transcript' | 'import'; created_at: string }
type SnapshotRow = Pick<Req, 'id' | 'job_number' | 'source' | 'title' | 'requester_name' | 'org_name' | 'services' | 'lead' | 'support' | 'status' | 'priority' | 'date_needed' | 'start_date' | 'is_ongoing' | 'submitted_at' | 'completed_at'> & { note_count: number }
const PRIORITY_LABEL: Record<Priority, string> = { high: 'H', medium: 'M', low: 'L' }
const PRIORITY_NAME: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' }
interface Member { name: string; email: string | null; kind: 'person' | 'team' }

// Lead holds one name; Support holds a comma-separated list. Rows imported from
// the spreadsheet may still carry names that are not on the roster (former
// staff), so splitting tolerates both separators.
const namesIn = (r: Pick<Req, 'lead' | 'support'>) =>
  `${r.lead ?? ''},${r.support ?? ''}`.split(/[\/,]/).map(s => s.trim()).filter(Boolean)

const STATUSES: { id: string; label: string; cls: string }[] = [
  { id: 'new',         label: 'New',         cls: 'st-new' },
  { id: 'needs_info',  label: 'Needs Info',  cls: 'st-pending' },
  { id: 'assigned',    label: 'Assigned',    cls: 'st-progress' },
  { id: 'in_progress', label: 'In Progress', cls: 'st-progress' },
  { id: 'in_review',   label: 'In Review',   cls: 'st-progress' },
  { id: 'scheduled',   label: 'Scheduled',   cls: 'st-ongoing' },
  { id: 'on_hold',     label: 'On Hold',     cls: 'st-hold' },
  { id: 'completed',   label: 'Completed',   cls: 'st-done' },
  { id: 'declined',    label: 'Declined',    cls: 'st-hold' },
]
const CLOSED = new Set(['completed', 'declined'])
const statusOf = (id: string) => STATUSES.find(s => s.id === id) ?? STATUSES[0]

function fmtDate(d: string | null): string {
  if (!d) return 'Not set'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtStamp(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
// Past its date needed, unless it is ongoing or the team cleared the flag.
function isLate(r: Pick<Req, 'date_needed' | 'is_ongoing'> & { overdue_dismissed?: boolean }, today: string): boolean {
  return !!r.date_needed && r.date_needed < today && !r.is_ongoing && !r.overdue_dismissed
}

function todayIso(): string {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

// embedded: shown as a dashboard tab (SuperAdmin and the Office of
// Communications side of the web team), so the page drops its own frame.
export default function MarcommAssignmentsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const [requests, setRequests] = useState<Req[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [team, setTeam] = useState<Member[]>([])
  const [me, setMe] = useState('')
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([])
  const [version, setVersion] = useState<string>('live')
  const [versionRows, setVersionRows] = useState<SnapshotRow[] | null>(null)
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'active' | 'completed'>('active')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [leadFilter, setLeadFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'needed' | 'newest'>('needed')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bcps/marcomm-requests', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not load requests.')
      setRequests(j.requests); setNotes(j.notes); setTeam(j.team ?? []); setSnapshots(j.snapshots ?? []); setMe((j.me ?? '').toLowerCase()); setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // "View as of": load the chosen meeting's version of the tracker.
  useEffect(() => {
    if (version === 'live') { setVersionRows(null); return }
    let cancelled = false
    ;(async () => {
      const r = await fetch(`/api/bcps/marcomm-requests?snapshot=${encodeURIComponent(version)}`, { headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      if (!cancelled) setVersionRows(r.ok ? (j.snapshot?.data ?? []) : [])
    })()
    return () => { cancelled = true }
  }, [version])

  // ?row=<id> opens a request directly, like Web Team Assignments.
  useEffect(() => {
    const row = new URLSearchParams(window.location.search).get('row')
    if (row) setOpenId(row)
  }, [])

  const notesFor = useMemo(() => {
    const m = new Map<string, Note[]>()
    for (const n of notes) { const list = m.get(n.request_id) ?? []; list.push(n); m.set(n.request_id, list) }
    return m
  }, [notes])

  // In a past version the rows come from that meeting's snapshot, read only.
  const viewing = version === 'live' ? null : snapshots.find(sn => sn.id === version) ?? null
  const rowsSource: (Req | SnapshotRow)[] = viewing ? (versionRows ?? []) : requests
  const active = rowsSource.filter(r => !CLOSED.has(r.status))
  const done = rowsSource.filter(r => CLOSED.has(r.status))
  const today = viewing ? viewing.meeting_date : todayIso()
  const overdue = active.filter(r => isLate(r as Req, today)).length
  const newCount = active.filter(r => r.status === 'new').length

  // The viewer's own roster name, for "My items".
  const myName = team.find(m => m.email && m.email.toLowerCase() === me)?.name ?? ''
  // Filter options: roster people and teams, plus any older names still on
  // imported rows, each with its count of active items.
  const activeCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of active) for (const n of namesIn(r)) m.set(n, (m.get(n) ?? 0) + 1)
    return m
  }, [active])
  const otherNames = useMemo(() => {
    const roster = new Set(team.map(m => m.name))
    const set = new Set<string>()
    for (const r of rowsSource) for (const n of namesIn(r)) if (!roster.has(n)) set.add(n)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rowsSource, team])
  const optLabel = (n: string) => `${n}${activeCount.get(n) ? ` (${activeCount.get(n)})` : ''}`

  const list = useMemo(() => {
    const base = tab === 'active' ? active : done
    const q = query.trim().toLowerCase()
    const rows = base.filter(r => {
      if (tab === 'active' && statusFilter !== 'all' && r.status !== statusFilter) return false
      if (leadFilter !== 'all') {
        if (!namesIn(r).some(n => n.toLowerCase() === leadFilter.toLowerCase())) return false
      }
      if (!q) return true
      return [r.title, r.requester_name, r.org_name, 'description' in r ? r.description : null, r.lead, String(r.job_number ?? '')]
        .some(v => (v ?? '').toLowerCase().includes(q))
    })
    return rows.sort((a, b) => {
      if (tab === 'completed' || sort === 'newest') return (b.completed_at ?? b.submitted_at).localeCompare(a.completed_at ?? a.submitted_at)
      // Most urgent first: new requests waiting for triage, then high priority,
      // then nearest date needed, then undated.
      if ((a.status === 'new') !== (b.status === 'new')) return a.status === 'new' ? -1 : 1
      if ((a.priority === 'high') !== (b.priority === 'high')) return a.priority === 'high' ? -1 : 1
      if (a.date_needed && b.date_needed) return a.date_needed.localeCompare(b.date_needed)
      if (a.date_needed) return -1
      if (b.date_needed) return 1
      return b.submitted_at.localeCompare(a.submitted_at)
    })
  }, [tab, active, done, statusFilter, leadFilter, query, sort])

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/bcps/marcomm-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(payload),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Could not save.')
    await load()
    return j
  }, [load])

  const open = requests.find(r => r.id === openId) ?? null

  return (
    <div className={`mca${embedded ? ' embedded' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mca-head">
        <div>
          <h1>MarComm Assignments</h1>
          <p className="mca-sub">Office of Communications requests. Filter by status or person, click any row for the full request and notes.</p>
        </div>
        <div className="mca-head-actions">
          <label className="mca-asof"><span className="fl">View as of</span>
            <select value={version} onChange={e => { setVersion(e.target.value); setOpenId(null) }} title="A new version is saved after each Marcomm Meeting">
              <option value="live">Today (live)</option>
              {snapshots.map(sn => <option key={sn.id} value={sn.id}>{sn.label}</option>)}
            </select>
          </label>
          {!viewing && <>
            <a className="mca-btn ghost" href="/marcomm-request" target="_blank" rel="noopener">Open request form</a>
            <button className="mca-btn ghost" onClick={() => setSavingSnapshot(true)}>Save meeting snapshot</button>
            <button className="mca-btn" onClick={() => setAdding(true)}>Add team item</button>
          </>}
        </div>
      </div>

      {viewing ? (
        <div className="mca-banner past">
          <b>Viewing {viewing.label}.</b> This is how the tracker stood after that meeting. It is read only.{' '}
          <button className="link" onClick={() => setVersion('live')}>Back to today</button>
          {viewing.summary && <p>{viewing.summary}</p>}
        </div>
      ) : snapshots[0] && (
        <div className="mca-banner">
          <b>Last updated from {snapshots[0].label}.</b>{snapshots[0].summary ? ` ${snapshots[0].summary}` : ''}{' '}
          Click any row to view the full notes trail.
        </div>
      )}

      <div className="mca-meta">
        <div><span className="ml">Active</span><span className="mv">{active.length}</span></div>
        <div><span className="ml">New, waiting for triage</span><span className="mv">{newCount}</span></div>
        <div><span className="ml">Past date needed</span><span className={`mv ${overdue ? 'warn' : ''}`}>{overdue}</span></div>
        <div><span className="ml">Completed</span><span className="mv">{done.length}</span></div>
      </div>

      <div className="mca-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>Active <span>{active.length}</span></button>
        <button role="tab" aria-selected={tab === 'completed'} onClick={() => setTab('completed')}>Completed <span>{done.length}</span></button>
      </div>

      <div className="mca-filters">
        {tab === 'active' && (
          <div className="mca-chips">
            <span className="fl">Status</span>
            {[{ id: 'all', label: 'All' }, ...STATUSES.filter(s => !CLOSED.has(s.id))].map(s => {
              const n = s.id === 'all' ? active.length : active.filter(r => r.status === s.id).length
              if (s.id !== 'all' && !n) return null
              return <button key={s.id} className={`chip ${statusFilter === s.id ? 'on' : ''}`} onClick={() => setStatusFilter(s.id)}>{s.label} <b>{n}</b></button>
            })}
          </div>
        )}
        <div className="mca-controls">
          {myName && (
            <button className={`chip mine ${leadFilter === myName ? 'on' : ''}`}
              onClick={() => setLeadFilter(leadFilter === myName ? 'all' : myName)}>
              My items <b>{activeCount.get(myName) ?? 0}</b>
            </button>
          )}
          <label><span className="fl">Person or team</span>
            <select value={leadFilter} onChange={e => setLeadFilter(e.target.value)}>
              <option value="all">Everyone</option>
              <optgroup label="People">
                {team.filter(m => m.kind === 'person').map(m => <option key={m.name} value={m.name}>{optLabel(m.name)}</option>)}
              </optgroup>
              <optgroup label="Teams">
                {team.filter(m => m.kind === 'team').map(m => <option key={m.name} value={m.name}>{optLabel(m.name)}</option>)}
              </optgroup>
              {otherNames.length > 0 && (
                <optgroup label="Older entries">
                  {otherNames.map(n => <option key={n} value={n}>{optLabel(n)}</option>)}
                </optgroup>
              )}
            </select>
          </label>
          {tab === 'active' && (
            <label><span className="fl">Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value as 'needed' | 'newest')}>
                <option value="needed">Most urgent first</option>
                <option value="newest">Newest first</option>
              </select>
            </label>
          )}
          <label className="grow"><span className="fl">Search</span>
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Title, requester, department or job number" />
          </label>
        </div>
      </div>

      {loading && <p className="mca-empty">Loading requests...</p>}
      {error && <p className="mca-error">{error}</p>}

      {!loading && !error && (
        <div className="mca-table">
          <div className="mca-row mca-colhead">
            <span>Request</span><span>Lead / Support</span><span>{tab === 'active' ? 'Date Needed' : 'Closed'}</span><span>Status</span><span>Notes</span>
          </div>
          {list.length === 0 && <p className="mca-empty">No requests match these filters.</p>}
          {list.map(r => {
            const st = statusOf(r.status)
            const late = tab === 'active' && isLate(r as Req, today)
            const n = 'note_count' in r ? r.note_count : notesFor.get(r.id)?.length ?? 0
            const link = 'link_url' in r ? r.link_url : null
            // Past versions are read only, so their rows do not open.
            const openRow = viewing ? undefined : () => setOpenId(r.id)
            return (
              <div key={r.id} className={`mca-row${viewing ? ' ro' : ''}`} role={viewing ? undefined : 'button'} tabIndex={viewing ? undefined : 0} onClick={openRow}
                onKeyDown={e => { if (openRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRow() } }}>
                <div className="c-req">
                  <div className="r-top">
                    <span className="r-job">{r.job_number ? `#${r.job_number}` : 'Team item'}</span>
                    {r.priority && <span className={`prio p-${r.priority}`} title={`${PRIORITY_NAME[r.priority]} priority`}>{PRIORITY_LABEL[r.priority]}</span>}
                    <span className="r-title">{r.title}</span>
                  </div>
                  <div className="r-who">{[r.requester_name, r.org_name].filter(Boolean).join(' · ') || 'Office of Communications'}</div>
                  {r.services.length > 0 && <div className="r-tags">{r.services.map(s => <span key={s}>{s}</span>)}</div>}
                  {link && <a className="r-link" href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Open link</a>}
                </div>
                <div className="c-lead" data-label="Lead / Support">
                  <div className="lead">{r.lead || <span className="none">Unassigned</span>}</div>
                  {r.support && <div className="support">{r.support}</div>}
                </div>
                <div className="c-date" data-label={tab === 'active' ? 'Date Needed' : 'Closed'}>
                  {tab === 'active'
                    ? r.is_ongoing && !r.date_needed
                      ? <span className="date none">Ongoing</span>
                      : <span className={`date ${late ? 'late' : ''} ${r.date_needed ? '' : 'none'}`}>{fmtDate(r.date_needed)}{late ? ' · Overdue' : r.is_ongoing ? ' · Ongoing' : ''}</span>
                    : <span className="date none">{r.completed_at ? fmtStamp(r.completed_at) : 'Not recorded'}</span>}
                </div>
                <div className="c-status" data-label="Status"><span className={`badge ${st.cls}`}>{st.label}</span></div>
                <div className="c-notes" data-label="Notes"><span className="notes-pill">Notes {n > 0 && <b>{n}</b>}</span></div>
              </div>
            )
          })}
        </div>
      )}

      {open && !viewing && <Drawer req={open} team={team} notes={notesFor.get(open.id) ?? []} onClose={() => setOpenId(null)} post={post} />}
      {savingSnapshot && <SaveSnapshot onClose={() => setSavingSnapshot(false)} post={post} />}
      {adding && <AddItem team={team} defaultLead={myName} onClose={() => setAdding(false)} post={post} />}
    </div>
  )
}

// Lead dropdown: roster people, then teams. A value not on the roster (an
// older spreadsheet entry) stays selectable so opening a row never drops it.
function LeadSelect({ team, value, onChange }: { team: Member[]; value: string; onChange: (v: string) => void }) {
  const known = !value || team.some(m => m.name === value)
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Unassigned</option>
      <optgroup label="People">{team.filter(m => m.kind === 'person').map(m => <option key={m.name} value={m.name}>{m.name}</option>)}</optgroup>
      <optgroup label="Teams">{team.filter(m => m.kind === 'team').map(m => <option key={m.name} value={m.name}>{m.name}</option>)}</optgroup>
      {!known && <option value={value}>{value}</option>}
    </select>
  )
}

// Support picker: toggle chips for everyone on the roster except the lead.
function SupportPicker({ team, lead, value, onChange }: { team: Member[]; lead: string; value: string; onChange: (v: string) => void }) {
  const picked = value.split(',').map(s => s.trim()).filter(Boolean)
  const toggle = (n: string) => onChange((picked.includes(n) ? picked.filter(p => p !== n) : [...picked, n]).join(', '))
  const extra = picked.filter(p => !team.some(m => m.name === p))
  return (
    <div className="pick-chips">
      {[...team.map(m => m.name), ...extra].filter(n => n !== lead).map(n => (
        <button type="button" key={n} className={`chip ${picked.includes(n) ? 'on' : ''}`} aria-pressed={picked.includes(n)} onClick={() => toggle(n)}>{n}</button>
      ))}
    </div>
  )
}

// Voice dictation for notes, the same recorder as Web Team Assignments
// (public/bcps-web-team-assignments.html): Record starts the browser's speech
// recognition, restarting between pauses until Stop; the cleaned transcript
// is added to the note box to edit before Add note. Chrome and Edge only.
type SpeechRec = {
  continuous: boolean; interimResults: boolean; lang: string
  onstart: (() => void) | null
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void; stop: () => void
}
function useDictation(onText: (text: string) => void) {
  const [recording, setRecording] = useState(false)
  const [live, setLive] = useState('Press Record to transcribe speech into a note.')
  const [active, setActive] = useState(false)
  const st = useRef({ on: false, acc: '', committed: false, rec: null as SpeechRec | null })
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const msg = (m: string, a: boolean) => { setLive(m); setActive(a) }
  const clean = (t: string) => {
    t = t.trim(); if (!t) return ''
    t = t.charAt(0).toUpperCase() + t.slice(1)
    if (t.length > 15 && !/[.!?]$/.test(t)) t += '.'
    return t
  }
  const commit = useCallback(() => {
    const s = st.current
    if (s.committed) return
    s.committed = true
    const text = s.acc.trim(); s.acc = ''
    if (!text) { msg('Nothing captured. Try speaking again.', false); return }
    onTextRef.current(text)
    msg('Transcript added. Edit below and click Add note.', false)
  }, [])
  const SR = (): (new () => SpeechRec) | null => {
    if (typeof window === 'undefined') return null
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  }
  const runSession = useCallback(() => {
    const Ctor = SR(); const s = st.current
    if (!s.on || !Ctor) return
    const rec = new Ctor(); s.rec = rec
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US'
    rec.onstart = () => msg('Listening...', true)
    rec.onresult = e => {
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) { const c = clean(t); if (c) s.acc += (s.acc ? ' ' : '') + c } else interim += t
      }
      if (interim) msg(interim, true)
      else if (s.acc) msg(s.acc.length > 60 ? '...' + s.acc.slice(-57) : s.acc, true)
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        s.on = false; setRecording(false)
        msg('Mic blocked. Click the lock icon in your browser address bar and allow the microphone.', false)
      } else if (e.error === 'network') {
        s.on = false; setRecording(false)
        msg('Network error. The speech service is unavailable.', false)
      }
    }
    rec.onend = () => { if (s.on) setTimeout(runSession, 100); else commit() }
    try { rec.start() } catch { setTimeout(() => { if (s.on) runSession() }, 250) }
  }, [commit])
  const start = () => {
    if (!SR()) { msg('Voice input requires Chrome or Edge.', false); return }
    const s = st.current
    s.acc = ''; s.committed = false; s.on = true
    setRecording(true); msg('Starting...', true); runSession()
  }
  const stop = useCallback(() => {
    const s = st.current
    s.on = false; s.committed = false; setRecording(false)
    try { s.rec?.stop() } catch { /* already stopped */ }
    setTimeout(() => { if (!st.current.committed) commit() }, 500)
  }, [commit])
  // Stop listening when the drawer closes.
  useEffect(() => () => { if (st.current.on) { st.current.on = false; try { st.current.rec?.stop() } catch { /* closed */ } } }, [])
  return { recording, live, active, toggle: () => (recording ? stop() : start()) }
}

function Drawer({ req, team, notes, onClose, post }: {
  req: Req; team: Member[]; notes: Note[]; onClose: () => void; post: (p: Record<string, unknown>) => Promise<unknown>
}) {
  const [lead, setLead] = useState(req.lead ?? '')
  const [support, setSupport] = useState(req.support ?? '')
  const [dateNeeded, setDateNeeded] = useState(req.date_needed ?? '')
  const [startDate, setStartDate] = useState(req.start_date ?? '')
  const [link, setLink] = useState(req.link_url ?? '')
  const [title, setTitle] = useState(req.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [note, setNote] = useState('')
  const [dictated, setDictated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dictation = useDictation(text => {
    setNote(prev => (prev.trimEnd() ? `${prev.trimEnd()} ${text}` : text))
    setDictated(true)
  })

  useEffect(() => {
    setLead(req.lead ?? ''); setSupport(req.support ?? ''); setDateNeeded(req.date_needed ?? '')
    setStartDate(req.start_date ?? ''); setLink(req.link_url ?? ''); setTitle(req.title); setMsg('')
  }, [req.id, req.lead, req.support, req.date_needed, req.start_date, req.link_url, req.title])

  const nameOf = (author: string | null) => {
    if (!author) return 'Team'
    return team.find(m => m.email && m.email.toLowerCase() === author.toLowerCase())?.name ?? author
  }
  const addNote = async () => {
    if (!note.trim() || busy) return
    await run({ action: 'add_note', id: req.id, body: note, source: dictated ? 'dictated' : 'typed' }, 'Note added.')
    setNote(''); setDictated(false)
  }
  const late = isLate(req, todayIso())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (p: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg('')
    try { await post(p); setMsg(ok) } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  const openAttachment = async (path: string) => {
    const r = await fetch(`/api/bcps/marcomm-requests?attachment=${encodeURIComponent(path)}`, { headers: await authHeaders() })
    const j = await r.json()
    if (j.url) window.open(j.url, '_blank', 'noopener')
  }
  const dirty = lead !== (req.lead ?? '') || support !== (req.support ?? '') || dateNeeded !== (req.date_needed ?? '')
    || startDate !== (req.start_date ?? '') || link !== (req.link_url ?? '')

  return (
    <div className="mca-overlay" onClick={onClose}>
      <aside className="mca-drawer" role="dialog" aria-modal="true" aria-label={req.title} onClick={e => e.stopPropagation()}>
        <div className="d-head">
          <div>
            <div className="d-crumb">MarComm Assignments / {req.job_number ? `#${req.job_number}` : 'Team item'}</div>
            {editingTitle ? (
              <div className="d-title-edit">
                <input value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-label="Title"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click() } }} />
                <button className="mca-btn small" disabled={busy || !title.trim()}
                  onClick={async () => { await run({ action: 'update', id: req.id, title }, 'Title saved.'); setEditingTitle(false) }}>Save</button>
                <button className="mca-btn small ghost" onClick={() => { setTitle(req.title); setEditingTitle(false) }}>Cancel</button>
              </div>
            ) : (
              <h2>{req.title} <button className="d-edit" onClick={() => setEditingTitle(true)} aria-label="Edit title" title="Edit title">&#9998;</button></h2>
            )}
          </div>
          <button className="d-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="d-grid">
          <label><span className="fl">Status</span>
            <select value={req.status} disabled={busy} onChange={e => {
              const next = e.target.value
              if ((next === 'completed' || next === 'declined') && !window.confirm(`Mark this request ${next === 'completed' ? 'Completed' : 'Declined'}? It moves to the Completed tab.`)) return
              run({ action: 'update', id: req.id, status: next }, 'Status updated.')
            }}>
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <div className="d-prio">
            <span className="fl">Priority</span>
            <div className="pick-chips">
              {(['high', 'medium', 'low'] as Priority[]).map(pr => (
                <button key={pr} type="button" className={`chip prio-chip p-${pr} ${req.priority === pr ? 'on' : ''}`} aria-pressed={req.priority === pr} disabled={busy}
                  onClick={() => run({ action: 'update', id: req.id, priority: req.priority === pr ? null : pr }, 'Priority saved.')}>{PRIORITY_NAME[pr]}</button>
              ))}
            </div>
          </div>
          <label><span className="fl">Start date</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </label>
          <label><span className="fl">Date needed</span>
            <input type="date" value={dateNeeded} onChange={e => setDateNeeded(e.target.value)} />
          </label>
          <label><span className="fl">Lead</span>
            <LeadSelect team={team} value={lead} onChange={v => {
              setLead(v)
              // The lead is never also listed as support.
              setSupport(support.split(',').map(s => s.trim()).filter(s => s && s !== v).join(', '))
            }} />
          </label>
        </div>
        <div className="d-support">
          <span className="fl">Support</span>
          <SupportPicker team={team} lead={lead} value={support} onChange={setSupport} />
        </div>
        <div className="d-flags">
          <label className="check"><input type="checkbox" checked={req.is_ongoing} disabled={busy}
            onChange={e => run({ action: 'update', id: req.id, is_ongoing: e.target.checked }, 'Saved.')} /> Ongoing (no end date)</label>
          {late && <button className="mca-btn small ghost" disabled={busy}
            onClick={() => run({ action: 'update', id: req.id, overdue_dismissed: true }, 'Overdue flag cleared.')}>Clear overdue flag</button>}
        </div>
        <label className="d-link"><span className="fl">Link (proof, draft or final)</span>
          <span className="d-link-row">
            <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" />
            {req.link_url && <a className="mca-btn small ghost" href={req.link_url} target="_blank" rel="noopener noreferrer">Open</a>}
          </span>
        </label>
        {dirty && <button className="mca-btn small" disabled={busy}
          onClick={() => run({ action: 'update', id: req.id, lead, support, date_needed: dateNeeded || null, start_date: startDate || null, link_url: link }, 'Saved.')}>Save changes</button>}
        {msg && <p className="d-msg">{msg}</p>}

        <section>
          <h3>Requested by</h3>
          <p className="d-text">
            {[req.requester_name, req.requester_title].filter(Boolean).join(', ') || 'Office of Communications'}
            {req.org_name && <><br />{req.org_type ? `${req.org_type}: ` : ''}{req.org_name}</>}
            {(req.requester_email || req.requester_phone) && <><br />
              {req.requester_email && <a href={`mailto:${req.requester_email}`}>{req.requester_email}</a>}
              {req.requester_email && req.requester_phone && ' · '}{req.requester_phone}</>}
            <br /><span className="muted">Submitted {fmtStamp(req.submitted_at)}{req.source === 'wufoo' ? ' (from the Wufoo form)' : req.source === 'internal' ? ' (team item)' : ''}</span>
          </p>
        </section>

        {(req.services.length > 0 || req.audiences.length > 0 || req.event_date || req.is_becon || req.calendar_needed) && (
          <section>
            <h3>At a glance</h3>
            {req.services.length > 0 && <p className="d-text"><b>Services:</b> {req.services.join(', ')}</p>}
            {req.audiences.length > 0 && <p className="d-text"><b>Audience:</b> {req.audiences.join(', ')}</p>}
            {req.event_date && <p className="d-text"><b>Event date:</b> {fmtDate(req.event_date)}</p>}
            {req.is_becon && <p className="d-text"><b>BECON:</b> Yes</p>}
            {req.calendar_needed && <p className="d-text"><b>District calendar:</b> Requested</p>}
          </section>
        )}

        {req.description && <section><h3>Request</h3><p className="d-text pre">{req.description}</p></section>}
        {req.goal && <section><h3>Why it matters</h3><p className="d-text pre">{req.goal}</p></section>}

        {req.attachments.length > 0 && (
          <section>
            <h3>Attachments</h3>
            <ul className="d-files">{req.attachments.map(a => <li key={a.path}><button onClick={() => openAttachment(a.path)}>{a.name}</button></li>)}</ul>
          </section>
        )}

        <section>
          <h3>Notes</h3>
          <div className="d-add">
            <div className="recorder-bar">
              <button type="button" className={`mic-btn${dictation.recording ? ' recording' : ''}`} onClick={dictation.toggle}>
                <span className="mic-dot" />{dictation.recording ? 'Stop' : 'Record'}
              </button>
              <span className={`live-transcript${dictation.active ? ' active' : ''}`} aria-live="polite">{dictation.live}</span>
            </div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Type a note, or use Record above to speak it..."
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }} />
            <button className="mca-btn small" disabled={busy || !note.trim()} onClick={addNote}>Add note</button>
          </div>
          {notes.length === 0 && <p className="muted">No notes yet. Add the first one above.</p>}
          <ul className="d-notes">
            {notes.map(n => (
              <li key={n.id} className={`src-${n.source}`}>
                <div className="n-meta">
                  {fmtStamp(n.created_at)} · {n.source === 'meeting' ? (n.meeting_label ? `From the ${n.meeting_label}` : 'From a meeting') : nameOf(n.author)}
                  {n.source === 'dictated' && <span className="n-tag">Dictated</span>}
                  {n.source === 'meeting' && <span className="n-tag meeting">Meeting</span>}
                </div>
                <div className="n-body pre">{n.body}</div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

// For meetings that were not recorded: after the team updates the rows by
// hand, this saves the tracker under the meeting date for "View as of".
function SaveSnapshot({ onClose, post }: { onClose: () => void; post: (p: Record<string, unknown>) => Promise<unknown> }) {
  const [date, setDate] = useState(todayIso())
  const [label, setLabel] = useState('Marcomm Meeting')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="mca-overlay" onClick={onClose}>
      <aside className="mca-drawer narrow" role="dialog" aria-modal="true" aria-label="Save meeting snapshot" onClick={e => e.stopPropagation()}>
        <div className="d-head">
          <div><div className="d-crumb">MarComm Assignments / Versions</div><h2>Save meeting snapshot</h2></div>
          <button className="d-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <p className="muted">Saves every request as it stands right now under this meeting date, so anyone can view the tracker as of that meeting later. Recorded Marcomm Meetings are saved automatically when the transcript is applied; use this when a meeting was not recorded.</p>
        <div className="d-grid one">
          <label><span className="fl">Meeting date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span className="fl">Meeting</span><input value={label} onChange={e => setLabel(e.target.value)} /></label>
          <label><span className="fl">What changed (optional)</span><textarea rows={4} value={summary} onChange={e => setSummary(e.target.value)} placeholder="New requests, moved deadlines, reassignments" /></label>
        </div>
        <button className="mca-btn" disabled={busy || !date} onClick={async () => {
          setBusy(true); setMsg('')
          try { await post({ action: 'snapshot', meeting_date: date, label, summary }); onClose() }
          catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
        }}>Save snapshot</button>
        {msg && <p className="d-msg">{msg}</p>}
      </aside>
    </div>
  )
}

function AddItem({ team, defaultLead, onClose, post }: {
  team: Member[]; defaultLead: string; onClose: () => void; post: (p: Record<string, unknown>) => Promise<unknown>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lead, setLead] = useState(defaultLead)
  const [dateNeeded, setDateNeeded] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return (
    <div className="mca-overlay" onClick={onClose}>
      <aside className="mca-drawer narrow" role="dialog" aria-modal="true" aria-label="Add team item" onClick={e => e.stopPropagation()}>
        <div className="d-head">
          <div><div className="d-crumb">MarComm Assignments / New</div><h2>Add team item</h2></div>
          <button className="d-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <p className="muted">For work the team starts itself. District employees use the request form.</p>
        <div className="d-grid one">
          <label><span className="fl">Title</span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
          <label><span className="fl">Details</span><textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} /></label>
          <label><span className="fl">Lead</span><LeadSelect team={team} value={lead} onChange={setLead} /></label>
          <label><span className="fl">Date needed</span><input type="date" value={dateNeeded} onChange={e => setDateNeeded(e.target.value)} /></label>
        </div>
        <button className="mca-btn" disabled={busy || !title.trim()} onClick={async () => {
          setBusy(true); setMsg('')
          try { await post({ action: 'create_internal', title, description, lead, date_needed: dateNeeded || null }); onClose() }
          catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
        }}>Add item</button>
        {msg && <p className="d-msg">{msg}</p>}
      </aside>
    </div>
  )
}

const CSS = `
.mca { padding: 28px 32px 60px; background: #f5f5f5; min-height: calc(100vh - 64px); font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; }
.mca.embedded { padding: 8px 0 40px; background: transparent; min-height: 0; }
.mca h1 { font-size: 30px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin: 0 0 6px; }
.mca-sub { font-size: 13px; color: rgba(26,26,26,0.62); margin: 0; }
.mca-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.mca-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mca-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 10px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; text-decoration: none; display: inline-block; }
.mca-btn.ghost { background: #fff; color: #0e4e73; }
.mca-btn.small { padding: 8px 12px; font-size: 11px; }
.mca-btn:disabled { opacity: 0.5; cursor: default; }
.mca-meta { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin-bottom: 20px; }
.mca-meta > div { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 14px 16px; min-width: 0; }
.ml, .fl { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.mv { font-size: 24px; font-weight: 900; color: #0e4e73; }
.mv.warn { color: #b91c1c; }
.mca-tabs { display: flex; gap: 6px; border-bottom: 2px solid rgba(0,0,0,0.09); margin-bottom: 14px; }
.mca-tabs button { font: inherit; font-size: 14px; font-weight: 700; background: none; border: none; border-bottom: 3px solid transparent; margin-bottom: -2px; padding: 10px 14px; color: rgba(26,26,26,0.55); cursor: pointer; }
.mca-tabs button[aria-selected="true"] { color: #0e4e73; border-bottom-color: #1672A7; }
.mca-tabs button span { font-size: 11px; font-weight: 800; background: rgba(0,0,0,0.07); border-radius: 99px; padding: 1px 8px; margin-left: 4px; }
.mca-filters { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 14px 18px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 12px; }
.mca-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.mca-chips .fl { margin: 0 6px 0 0; }
.chip { font: inherit; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 12px; border-radius: 20px; border: 1px solid rgba(0,0,0,0.12); background: #fafafa; color: rgba(26,26,26,0.7); cursor: pointer; }
.chip b { margin-left: 4px; }
.chip.on { background: #1672A7; border-color: #1672A7; color: #fff; }
.mca-controls { display: flex; flex-wrap: wrap; gap: 12px; }
.chip.mine { align-self: flex-end; padding: 10px 14px; font-size: 11px; }
.d-support { margin-bottom: 12px; }
.d-support .fl { display: block; margin-bottom: 6px; }
.pick-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pick-chips .chip { text-transform: none; letter-spacing: 0; font-size: 12px; font-weight: 600; padding: 5px 10px; }
.mca-controls label { display: flex; flex-direction: column; min-width: 180px; }
.mca-controls label.grow { flex: 1; min-width: min(260px, 100%); }
.mca select, .mca input, .mca textarea { font: inherit; font-size: 13px; padding: 9px 12px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; background-color: #fff; color: #1a1a1a; width: 100%; box-sizing: border-box; }
.mca-table { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; overflow: hidden; }
.mca-row { display: grid; grid-template-columns: minmax(0,1fr) 170px 140px 120px 80px; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.07); align-items: start; cursor: pointer; }
.mca-row:hover { background: rgba(22,114,167,0.04); }
.mca-row:focus-visible { outline: 3px solid #1672A7; outline-offset: -3px; }
.mca-colhead { background: #fafafa; cursor: default; padding-top: 10px; padding-bottom: 10px; }
.mca-colhead:hover { background: #fafafa; }
.mca-colhead span { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(26,26,26,0.5); }
.r-top { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.r-job { font-size: 10px; font-weight: 800; color: #0e4e73; white-space: nowrap; }
.r-title { font-size: 13px; font-weight: 700; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.r-who { font-size: 11px; color: rgba(26,26,26,0.6); margin-top: 3px; }
.r-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.r-tags span { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(22,114,167,0.08); color: #0e4e73; }
.lead { font-size: 12px; font-weight: 700; }
.support { font-size: 11px; color: rgba(26,26,26,0.6); }
.none { color: rgba(26,26,26,0.45); font-weight: 400; }
.date { font-size: 12px; font-weight: 700; color: #C55326; }
.date.late { color: #b91c1c; }
.date.none { color: rgba(26,26,26,0.5); font-weight: 400; }
.badge { display: inline-flex; align-items: center; gap: 5px; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px; border-radius: 20px; white-space: nowrap; border: 1px solid transparent; }
.badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.st-new { background: rgba(197,83,38,0.08); border-color: rgba(197,83,38,0.28); color: #a5441f; }
.st-pending { background: rgba(197,83,38,0.08); border-color: rgba(197,83,38,0.28); color: #a5441f; }
.st-progress { background: rgba(22,114,167,0.10); border-color: rgba(22,114,167,0.25); color: #0e4e73; }
.st-ongoing { background: rgba(22,114,167,0.06); border-color: rgba(22,114,167,0.18); color: #1672A7; }
.st-hold { background: rgba(26,26,26,0.06); border-color: rgba(26,26,26,0.15); color: rgba(26,26,26,0.7); }
.st-done { background: rgba(22,117,12,0.10); border-color: rgba(22,117,12,0.28); color: #16750C; }
.mca-asof { display: flex; flex-direction: column; gap: 4px; }
.mca-asof select { font: inherit; font-size: 12px; font-weight: 700; padding: 9px 10px; border: 1px solid rgba(22,114,167,0.35); border-radius: 6px; background: #fff; color: #0e4e73; max-width: 320px; }
.mca-head-actions { align-items: flex-end; }
.mca-banner { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-left: 4px solid #1672A7; border-radius: 6px; padding: 12px 16px; font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.8); margin-bottom: 18px; }
.mca-banner.past { border-left-color: #C55326; background: #FFF8F2; }
.mca-banner p { margin: 6px 0 0; }
.mca-banner .link { font: inherit; font-weight: 700; color: #1672A7; background: none; border: 0; padding: 0; cursor: pointer; text-decoration: underline; }
.mca-row.ro { cursor: default; }
.mca-row.ro:hover { background: transparent; }
.prio { font-size: 9px; font-weight: 800; border-radius: 4px; padding: 2px 6px; flex-shrink: 0; }
.prio.p-high, .prio-chip.p-high.on { background: #b91c1c; color: #fff; border-color: #b91c1c; }
.prio.p-medium, .prio-chip.p-medium.on { background: #C55326; color: #fff; border-color: #C55326; }
.prio.p-low, .prio-chip.p-low.on { background: #6b7280; color: #fff; border-color: #6b7280; }
.r-link { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 700; color: #1672A7; }
.d-edit { font: inherit; font-size: 14px; background: none; border: 0; color: rgba(26,26,26,0.4); cursor: pointer; padding: 0 4px; }
.d-edit:hover { color: #1672A7; }
.d-title-edit { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.d-title-edit input { flex: 1 1 220px; min-width: 0; font: inherit; font-size: 15px; font-weight: 700; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; }
.d-prio { grid-column: 1 / -1; }
.d-prio .fl { display: block; margin-bottom: 6px; }
.d-flags { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 12px; }
.mca .check, .mca-drawer .check { display: inline-flex; flex-direction: row; align-items: center; gap: 8px; font-size: 13px; text-transform: none; letter-spacing: 0; font-weight: 600; cursor: pointer; white-space: nowrap; }
.check input { width: 16px; height: 16px; margin: 0; flex: none; }
.d-link { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.d-link-row { display: flex; gap: 6px; }
.d-link-row input { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 9px 10px; border: 1px solid rgba(0,0,0,0.15); border-radius: 6px; }
.recorder-bar { display: flex; align-items: center; gap: 10px; width: 100%; }
.mic-btn { display: inline-flex; align-items: center; gap: 7px; font-family: inherit; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.10em; padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); background: #fff; color: rgba(26,26,26,0.6); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.mic-btn:hover { border-color: #1672A7; color: #1672A7; }
.mic-btn.recording { background: #fef2f2; border-color: #dc2626; color: #dc2626; animation: mca-pulse-border 1.2s ease-in-out infinite; }
.mic-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.mic-btn.recording .mic-dot { animation: mca-pulse-dot 1.2s ease-in-out infinite; }
@keyframes mca-pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
@keyframes mca-pulse-border { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.25)} 50%{box-shadow:0 0 0 4px rgba(220,38,38,0.10)} }
.live-transcript { flex: 1; min-width: 0; font-size: 11px; color: rgba(26,26,26,0.5); font-style: italic; line-height: 1.5; }
.live-transcript.active { color: #dc2626; font-style: normal; }
.d-add textarea { width: 100%; }
.n-tag { display: inline-block; margin-left: 8px; font-size: 9px; padding: 1px 6px; border-radius: 4px; background: rgba(22,114,167,0.1); color: #0e4e73; }
.n-tag.meeting { background: rgba(197,83,38,0.12); color: #8a3a1a; }
.d-notes li.src-system .n-body { color: rgba(26,26,26,0.6); font-size: 12px; }
.notes-pill { font-size: 11px; font-weight: 700; color: #0e4e73; }
.notes-pill b { font-size: 10px; background: #1672A7; color: #fff; border-radius: 99px; padding: 1px 7px; margin-left: 3px; }
.mca-empty, .mca-error { padding: 20px; font-size: 13px; color: rgba(26,26,26,0.6); margin: 0; }
.mca-error { color: #b91c1c; }
.mca-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.32); z-index: 300; display: flex; justify-content: flex-end; }
.mca-drawer { width: min(640px, 100%); height: 100%; overflow-y: auto; background: #fff; padding: 22px 26px 40px; box-shadow: -8px 0 30px rgba(0,0,0,0.15); box-sizing: border-box; }
.mca-drawer.narrow { width: min(480px, 100%); }
.d-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.d-crumb { font-size: 11px; font-weight: 700; color: #0e4e73; margin-bottom: 6px; }
.mca-drawer h2 { font-size: 18px; font-weight: 800; margin: 0; line-height: 1.35; }
.d-close { font-size: 26px; line-height: 1; background: none; border: none; cursor: pointer; color: rgba(26,26,26,0.6); }
.d-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; margin-bottom: 12px; }
.d-grid.one { grid-template-columns: minmax(0,1fr); }
.d-grid label { display: flex; flex-direction: column; min-width: 0; }
.d-msg { font-size: 12px; color: #16750C; margin: 8px 0 0; }
.mca-drawer section { border-top: 1px solid rgba(0,0,0,0.08); margin-top: 18px; padding-top: 14px; }
.mca-drawer h3 { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: #1672A7; margin: 0 0 8px; }
.d-text { font-size: 13px; line-height: 1.65; margin: 0 0 6px; color: rgba(26,26,26,0.85); }
.d-text a { color: #0e4e73; font-weight: 700; }
.pre { white-space: pre-wrap; word-break: break-word; }
.muted { font-size: 12px; color: rgba(26,26,26,0.6); }
.d-files { list-style: none; padding: 0; margin: 0; }
.d-files button { font: inherit; font-size: 13px; font-weight: 700; color: #0e4e73; background: none; border: none; text-decoration: underline; cursor: pointer; padding: 3px 0; }
.d-add { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; margin-bottom: 14px; }
.d-notes { list-style: none; padding: 0; margin: 0; }
.d-notes li { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
.n-meta { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.n-body { font-size: 13px; line-height: 1.6; }
@media (max-width: 900px) {
  .mca { padding: 20px 16px 48px; }
  .mca-meta { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .mca-colhead { display: none; }
  .mca-row { grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
  .mca-row .c-req { grid-column: 1 / -1; }
  .mca-row [data-label]::before { content: attr(data-label); display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(26,26,26,0.5); margin-bottom: 3px; }
  .mca-controls label { min-width: 0; flex: 1 1 100%; }
  .d-grid { grid-template-columns: minmax(0,1fr); }
}
`
