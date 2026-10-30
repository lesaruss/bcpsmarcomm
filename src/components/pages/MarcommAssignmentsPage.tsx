'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import MeetingTranscriptUpload from '@/components/bcps/MeetingTranscriptUpload'
import TrackerItemDialog from '@/components/bcps/TrackerItemDialog'
import { useDictation, DictationBar } from '@/components/bcps/Dictation'

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

// path: a file in the private bucket. url: a Wufoo file that could not be
// copied over, opened where it is.
interface Attachment { name: string; path?: string; url?: string }
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
  calendar_form_submitted: boolean | null
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
  merged_into: string | null
}
type Priority = 'high' | 'medium' | 'low'
interface Note {
  id: string; request_id: string; body: string; author: string | null; created_at: string
  source: 'typed' | 'dictated' | 'meeting' | 'system'; meeting_label: string | null
  edited_at?: string | null; edited_by?: string | null
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
const MARCOMM_HOME = '/marcomm-assignments'
const ATTACH_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.heic,.mp4,.mov,.txt'
// The team logs work by MarComm job number (Marcomm Meeting, Oct 14, 2026), so
// it has its own column and sorts either way; team items have no number and
// always sort last.
// Submitted date sorts (Jennifer Hodder, 2026-10-21): requests from one day
// share a date, so ties go by job number and the numbers stay in order.
type Sort = 'needed' | 'newest' | 'sub_desc' | 'sub_asc' | 'job_desc' | 'job_asc'
const byJob = (a: { job_number: number | null }, b: { job_number: number | null }, dir: 1 | -1) =>
  a.job_number == null ? (b.job_number == null ? 0 : 1) : b.job_number == null ? -1 : (a.job_number - b.job_number) * dir
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
// Toolbar (V, 2026-10-28): the trackers' row from Web Team Assignments, in the
// same order. All documents shows where there is a list to go back to (onBack);
// Edit this page adds a team item; Upload transcript is the transcript bar as a
// button; Add your input adds a note to a request. Edit, upload and input are
// for the editors only, as every change here is (Sean, 2026-10-21).
export default function MarcommAssignmentsPage({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
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
  const [tab, setTab] = useState<'active' | 'completed' | 'calendar'>('active')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [leadFilter, setLeadFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('needed')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [inputting, setInputting] = useState(false)
  const [toolbarNote, setToolbarNote] = useState('')
  // A sign-in that has expired still shows the list from before, but every
  // save fails (Jennifer Hodder, 2026-10-21: "I am locked out and can't add
  // anything"). Say so, with a way back in.
  const [expired, setExpired] = useState(false)
  // Editors (Sean, 2026-10-21): Jennifer Hodder, Sean, Felicia Hicks and
  // Farrah Wilson change things; everyone else views, for the meetings. The
  // server enforces it ('marcomm-edit'); this only hides the controls.
  const [canEdit, setCanEdit] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/bcps/marcomm-requests', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (r.status === 401) setExpired(true)
      if (!r.ok) throw new Error(j.error || 'Could not load requests.')
      setRequests(j.requests); setNotes(j.notes); setTeam(j.team ?? []); setSnapshots(j.snapshots ?? []); setMe((j.me ?? '').toLowerCase()); setCanEdit(!!j.can_edit); setError('')
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
  // A combined duplicate (merged_into) leaves the tracker; its notes and
  // files are on the request it was combined into.
  const liveRows = useMemo(() => requests.filter(r => !r.merged_into), [requests])
  const rowsSource: (Req | SnapshotRow)[] = viewing ? (versionRows ?? []) : liveRows
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
      if (sort === 'job_desc' || sort === 'job_asc') return byJob(a, b, sort === 'job_asc' ? 1 : -1)
      if (sort === 'sub_desc' || sort === 'sub_asc') {
        const dir = sort === 'sub_asc' ? 1 : -1
        return (a.submitted_at.slice(0, 10).localeCompare(b.submitted_at.slice(0, 10)) * dir) || byJob(a, b, dir as 1 | -1) || a.submitted_at.localeCompare(b.submitted_at) * dir
      }
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
    if (r.status === 401) { setExpired(true); throw new Error('Your sign-in has expired. Sign in again, then try once more.') }
    if (!r.ok) throw new Error(j.error || 'Could not save.')
    await load()
    return j
  }, [load])

  const open = requests.find(r => r.id === openId) ?? null

  return (
    <div className={`mca${embedded ? ' embedded' : ''}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="doc-toolbar">
        {onBack && <button type="button" className="wcm-hub2-card-btn" onClick={onBack}>All documents</button>}
        <a className="wcm-hub2-card-btn" href={MARCOMM_HOME} target="_blank" rel="noopener noreferrer">Open full page</a>
        {!viewing && canEdit && <button type="button" className="wcm-hub2-card-btn" onClick={() => { setToolbarNote(''); setAdding(true) }}>Edit this page</button>}
        {/* Update the tracker from a Marcomm Meeting transcript (Sean, 2026-10-21),
            for the MarComm Assignments editors ('marcomm-edit'); hidden for everyone else. */}
        {!viewing && <MeetingTranscriptUpload tracker="marcomm" variant="button" onApplied={() => { load() }} />}
        {!viewing && canEdit && <button type="button" className="wcm-hub2-card-btn" onClick={() => { setToolbarNote(''); setInputting(true) }}>Add your input</button>}
      </div>
      {toolbarNote && <p className="home-hint doc-toolbar-note" role="status">{toolbarNote}</p>}
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
            {canEdit ? <>
              <button className="mca-btn ghost" onClick={() => setSavingSnapshot(true)}>Save meeting snapshot</button>
            </> : !loading && <span className="mca-viewonly" title="Jennifer Hodder updates the tracker during the Marcomm Meeting">View only</span>}
          </>}
        </div>
      </div>

      {expired && (
        <div className="mca-banner expired">
          <b>Your sign-in has expired.</b> You can still read the list, but notes and changes will not save until you sign in again.{' '}
          <a className="mca-btn small" href={`/login?next=${encodeURIComponent(typeof window === 'undefined' ? MARCOMM_HOME : window.location.pathname + window.location.search)}`}>Sign in again</a>
        </div>
      )}

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
        {!viewing && <button role="tab" aria-selected={tab === 'calendar'} onClick={() => { setTab('calendar'); setOpenId(null) }}>Calendar posts</button>}
      </div>

      {tab === 'calendar' && !viewing ? <CalendarPosts canEdit={canEdit} /> : <>

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
          <label><span className="fl">Sort</span>
            <select value={tab === 'completed' && sort === 'needed' ? 'newest' : tab === 'active' && sort === 'newest' ? 'sub_desc' : sort} onChange={e => setSort(e.target.value as Sort)}>
              {tab === 'active' && <option value="needed">Most urgent first</option>}
              {tab === 'completed' && <option value="newest">Recently closed</option>}
              <option value="sub_desc">Submitted, newest first</option>
              <option value="sub_asc">Submitted, oldest first</option>
              <option value="job_desc">Job number, high to low</option>
              <option value="job_asc">Job number, low to high</option>
            </select>
          </label>
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
            <button type="button" className="col-sort" onClick={() => setSort(sort === 'job_desc' ? 'job_asc' : 'job_desc')}
              title="Sort by job number" aria-label="Sort by job number">
              Job #{sort === 'job_desc' ? ' \u2193' : sort === 'job_asc' ? ' \u2191' : ''}
            </button>
            <span>Request</span><span>Lead / Support</span><span>Submitted</span><span>{tab === 'active' ? 'Date Needed' : 'Closed'}</span><span>Status</span><span>Notes</span>
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
              <div key={r.id} className={`mca-row${viewing ? ' ro' : ''}${r.status === 'new' ? ' is-new' : ''}`} role={viewing ? undefined : 'button'} tabIndex={viewing ? undefined : 0} onClick={openRow}
                onKeyDown={e => { if (openRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRow() } }}>
                <div className="c-job">
                  {r.job_number ? <span className="r-job">{r.job_number}</span> : <span className="r-job team">Team item</span>}
                </div>
                <div className="c-req">
                  <div className="r-top">
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
                <div className="c-date" data-label="Date Submitted"><span className="date sub">{fmtDate(r.start_date ?? (r.submitted_at ? r.submitted_at.slice(0, 10) : null))}</span></div>
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

      </>}

      {open && !viewing && <Drawer req={open} canEdit={canEdit} team={team} notes={notesFor.get(open.id) ?? []} onClose={() => setOpenId(null)} post={post}
        others={liveRows.filter(r => r.id !== open.id)} combined={requests.filter(r => r.merged_into === open.id)} />}
      {savingSnapshot && <SaveSnapshot onClose={() => setSavingSnapshot(false)} post={post} />}
      {adding && <AddItem team={team} defaultLead={myName} onClose={() => setAdding(false)} post={post} />}
      {inputting && <TrackerItemDialog mode="input" noun="request"
        rows={liveRows.filter(r => !CLOSED.has(r.status)).concat(liveRows.filter(r => CLOSED.has(r.status)))
          .map(r => ({ slug: r.id, title: `${r.job_number ? `#${r.job_number} ` : ''}${r.title}`, desc: r.description ?? '', status: r.status }))}
        submitInput={async (id, text, dictated) => { await post({ action: 'add_note', id, body: text, source: dictated ? 'dictated' : 'typed' }) }}
        onClose={() => setInputting(false)} onDone={(message) => { setInputting(false); setToolbarNote(message) }} />}
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

function Drawer({ req, canEdit, team, notes, onClose, post, others, combined }: {
  req: Req; canEdit: boolean; team: Member[]; notes: Note[]; onClose: () => void; post: (p: Record<string, unknown>) => Promise<unknown>
  others: Req[]; combined: Req[]
}) {
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [combineWith, setCombineWith] = useState('')
  const [lead, setLead] = useState(req.lead ?? '')
  const [support, setSupport] = useState(req.support ?? '')
  const [dateNeeded, setDateNeeded] = useState(req.date_needed ?? '')
  const [startDate, setStartDate] = useState(req.start_date ?? '')
  const [link, setLink] = useState(req.link_url ?? '')
  const [title, setTitle] = useState(req.title)
  const [editingTitle, setEditingTitle] = useState(false)
  // Full screen for presenting in the Marcomm Meeting: the request fills the
  // window like a document, with bigger type. The choice is remembered on
  // this browser.
  const [large, setLarge] = useState(() => { try { return localStorage.getItem('mca-drawer-large') === '1' } catch { return false } })
  const toggleLarge = () => setLarge(v => { try { localStorage.setItem('mca-drawer-large', v ? '0' : '1') } catch {} return !v })
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

  const run = async (p: Record<string, unknown>, ok: string): Promise<boolean> => {
    setBusy(true); setMsg('')
    try { await post(p); setMsg(ok); return true } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not save.'); return false } finally { setBusy(false) }
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
      <aside className={`mca-drawer${large ? ' large' : ''}`} role="dialog" aria-modal="true" aria-label={req.title} onClick={e => e.stopPropagation()}>
        <div className="d-head">
          <div>
            <div className="d-crumb">MarComm Assignments</div>
            <div className="d-job">{req.job_number ? <>Job <b>{req.job_number}</b></> : 'Team item'}</div>
            {editingTitle ? (
              <div className="d-title-edit">
                <input value={title} onChange={e => setTitle(e.target.value)} autoFocus aria-label="Title"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget.nextElementSibling as HTMLButtonElement)?.click() } }} />
                <button className="mca-btn small" disabled={busy || !title.trim()}
                  onClick={async () => { await run({ action: 'update', id: req.id, title }, 'Title saved.'); setEditingTitle(false) }}>Save</button>
                <button className="mca-btn small ghost" onClick={() => { setTitle(req.title); setEditingTitle(false) }}>Cancel</button>
              </div>
            ) : (
              <h2>{req.title} {canEdit && <button className="d-edit" onClick={() => setEditingTitle(true)} aria-label="Edit title" title="Edit title">&#9998;</button>}</h2>
            )}
          </div>
          <div className="d-head-actions">
            <button className="mca-btn small ghost" onClick={toggleLarge} aria-pressed={large}>{large ? 'Exit full screen' : 'Full screen'}</button>
            <button className="d-close" onClick={onClose} aria-label="Close">&times;</button>
          </div>
        </div>

        {/* Viewers see every field, locked (Sean, 2026-10-21). */}
        <fieldset className="d-fields" disabled={!canEdit}>
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
          <label><span className="fl">Date submitted</span>
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
        <label className="d-link"><span className="fl">Link to the work</span>
          <span className="hint">Where the team can open the piece itself: a proof sent for approval, a draft in progress, or the final version.</span>
          <span className="d-link-row">
            <input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://" />
            {req.link_url && <a className="mca-btn small ghost" href={req.link_url} target="_blank" rel="noopener noreferrer">Open</a>}
          </span>
        </label>
        {dirty && <button className="mca-btn small" disabled={busy}
          onClick={() => run({ action: 'update', id: req.id, lead, support, date_needed: dateNeeded || null, start_date: startDate || null, link_url: link }, 'Saved.')}>Save changes</button>}
        </fieldset>
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
            {req.calendar_needed && <p className="d-text"><b>District calendar:</b> Requested{req.calendar_form_submitted === true ? ', details in Calendar posts' : req.calendar_form_submitted === false ? ', Calendar Request Form not submitted yet' : ''}</p>}
          </section>
        )}

        <EditableText label="Request" value={req.description} busy={busy} canEdit={canEdit} formatted
          onSave={v => run({ action: 'update', id: req.id, description: v }, 'Request saved.')} />
        <EditableText label="Why it matters" value={req.goal} busy={busy} canEdit={canEdit}
          onSave={v => run({ action: 'update', id: req.id, goal: v }, 'Saved.')} />

        <section>
          <h3>Attachments</h3>
          {req.attachments.length > 0
            ? <ul className="d-files">{req.attachments.map(a => <li key={a.path ?? a.url}>{a.path
                ? <button onClick={() => openAttachment(a.path!)}>{a.name}</button>
                : <a href={a.url} target="_blank" rel="noopener noreferrer">{a.name} (opens on Wufoo)</a>}</li>)}</ul>
            : <p className="muted">No files yet.</p>}
          {/* The team adds files too (Jennifer Hodder, 2026-10-21), the same
              way the request form does: straight to storage by signed link. */}
          {canEdit && <>
          <label className="d-addfiles">
            <span className="mca-btn small ghost">{busy ? 'Working...' : 'Add files'}</span>
            <input type="file" multiple accept={ATTACH_ACCEPT} disabled={busy} onChange={async e => {
              const picked = Array.from(e.target.files ?? []).slice(0, 5)
              e.target.value = ''
              if (!picked.length) return
              setBusy(true); setMsg('')
              try {
                const j = await post({ action: 'upload_urls', id: req.id, files: picked.map(x => ({ name: x.name, size: x.size })) }) as { uploads: { name: string; path: string; token: string }[] }
                const done: { name: string; path: string }[] = []
                for (let i = 0; i < j.uploads.length; i++) {
                  const u = j.uploads[i]
                  const { error } = await supabaseClient.storage.from('marcomm-attachments').uploadToSignedUrl(u.path, u.token, picked[i])
                  if (error) throw new Error(`Could not upload ${u.name}.`)
                  done.push({ name: u.name, path: u.path })
                }
                await post({ action: 'add_attachments', id: req.id, files: done })
                setMsg(`${done.length} file${done.length === 1 ? '' : 's'} added.`)
              } catch (err) { setMsg(err instanceof Error ? err.message : 'Could not add the files.') } finally { setBusy(false) }
            }} />
          </label>
          <span className="muted small"> Up to 5 files at a time, 25 MB each.</span>
          </>}
        </section>

        {canEdit && <section>
          <h3>Combine records</h3>
          {combined.length > 0 && <p className="d-text">Combined into this: {combined.map(c => `${c.job_number ? `#${c.job_number}` : 'Team item'} ${c.title}`).join('; ')}</p>}
          <p className="muted">Is another row the same request? Combine it into this one: its notes and files move here and it leaves the list. Nothing is deleted.</p>
          <div className="d-combine">
            <select value={combineWith} onChange={e => setCombineWith(e.target.value)} aria-label="Request to combine into this one">
              <option value="">Pick the duplicate...</option>
              {[...others].sort((a, b) => byJob(a, b, -1)).map(o => (
                <option key={o.id} value={o.id}>{o.job_number ? `#${o.job_number}` : 'Team item'}: {o.title}{o.requester_name ? ` (${o.requester_name})` : ''}</option>
              ))}
            </select>
            <button className="mca-btn small" disabled={busy || !combineWith} onClick={async () => {
              const o = others.find(x => x.id === combineWith)
              if (!o || !window.confirm(`Combine ${o.job_number ? `#${o.job_number}` : 'this team item'} (${o.title}) into this request? Its notes and files move here and it leaves the list.`)) return
              await run({ action: 'combine', id: req.id, other_id: o.id }, 'Combined.')
              setCombineWith('')
            }}>Combine</button>
          </div>
        </section>}

        <section>
          <h3>Notes</h3>
          {canEdit && <div className="d-add">
            <DictationBar dictation={dictation} />
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Type a note, or use Record above to speak it..."
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); addNote() } }} />
            <button className="mca-btn small" disabled={busy || !note.trim()} onClick={addNote}>Add note</button>
          </div>}
          {notes.length === 0 && <p className="muted">{canEdit ? 'No notes yet. Add the first one above.' : 'No notes yet.'}</p>}
          <ul className="d-notes">
            {notes.map(n => (
              <li key={n.id} className={`src-${n.source}`}>
                <div className="n-meta">
                  {fmtStamp(n.created_at)} · {n.source === 'meeting' ? (n.meeting_label ? `From the ${n.meeting_label}` : 'From a meeting') : nameOf(n.author)}
                  {n.source === 'dictated' && <span className="n-tag">Dictated</span>}
                  {n.source === 'meeting' && <span className="n-tag meeting">Meeting</span>}
                  {n.edited_at && <span className="n-tag" title={`Edited ${fmtStamp(n.edited_at)}${n.edited_by ? ` by ${nameOf(n.edited_by)}` : ''}`}>Edited</span>}
                  {canEdit && n.source !== 'system' && editingNote !== n.id && (
                    <button className="n-edit-btn" onClick={() => { setEditingNote(n.id); setNoteDraft(n.body) }} aria-label="Edit note">Edit</button>
                  )}
                  {/* Delete a note, editors only (Sean, 2026-10-21). */}
                  {canEdit && editingNote !== n.id && (
                    <button className="n-edit-btn danger" disabled={busy} aria-label="Delete note" onClick={() => {
                      if (window.confirm(`Delete this note? This cannot be undone.\n\n"${n.body.length > 160 ? n.body.slice(0, 160) + '...' : n.body}"`))
                        run({ action: 'delete_note', note_id: n.id }, 'Note deleted.')
                    }}>Delete</button>
                  )}
                </div>
                {editingNote === n.id ? (
                  <div className="n-edit">
                    <textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} rows={3} aria-label="Edit note" autoFocus />
                    <div className="n-edit-row">
                      <button className="mca-btn small" disabled={busy || !noteDraft.trim()} onClick={async () => {
                        await run({ action: 'edit_note', note_id: n.id, body: noteDraft }, 'Note saved.')
                        setEditingNote(null)
                      }}>Save</button>
                      <button className="mca-btn small ghost" onClick={() => setEditingNote(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="n-body pre">{n.body}</div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

// A Wufoo answer is saved as "Question: answer" on its own line. The
// examples in a question ("(e.g., a flyer, a social media post...)") are
// longer than most answers, so they are dropped (Jennifer Hodder,
// 2026-10-22).
const stripExamples = (label: string) => label.replace(/\s*\((?:e\.g\.|i\.e\.|for example)[^)]*\)/gi, '').trim()
const QA = /^([^:\n]{3,200}?):\s+(.+)$/
function RequestText({ text }: { text: string }) {
  const paras = text.replace(/\r/g, '').split(/\n{2,}/)
  return <div className="d-request">{paras.map((para, i) => {
    const lines = para.split('\n')
    const qa = lines.every(l => QA.test(l) && !/^https?$/i.test(l.split(':')[0]))
    // Each "who, what, where" answer on its own, the question as a heading.
    if (qa) return lines.map((l, j) => { const m = l.match(QA)!; return (
      <div key={`${i}-${j}`} className="d-qa"><span className="d-qa-q">{stripExamples(m[1])}</span><span className="d-qa-a">{m[2]}</span></div>
    ) })
    return <p key={i} className="d-text pre">{para.trim()}</p>
  })}</div>
}

// Edit the request text in place, the same way as the title (Jennifer
// Hodder, 2026-10-22).
function EditableText({ label, value, busy, canEdit, formatted = false, onSave }: { label: string; value: string | null; busy: boolean; canEdit: boolean; formatted?: boolean; onSave: (v: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  useEffect(() => { if (!editing) setDraft(value ?? '') }, [value, editing])
  return (
    <section>
      <h3>{label} {canEdit && !editing && <button className="d-edit" onClick={() => setEditing(true)} aria-label={`Edit ${label}`} title={`Edit ${label}`}>&#9998;</button>}</h3>
      {editing ? (
        <div className="n-edit">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={Math.min(18, Math.max(4, draft.split('\n').length + 1))} aria-label={label} autoFocus />
          <div className="n-edit-row">
            <button className="mca-btn small" disabled={busy} onClick={async () => { if (await onSave(draft)) setEditing(false) }}>Save</button>
            <button className="mca-btn small ghost" onClick={() => { setDraft(value ?? ''); setEditing(false) }}>Cancel</button>
          </div>
        </div>
      ) : value
        ? (formatted ? <RequestText text={value} /> : <p className="d-text pre">{value}</p>)
        : <p className="muted">Nothing here yet.</p>}
    </section>
  )
}

// Calendar posts (Sean, 2026-10-20): Calendar Post Requests from
// /calendar-request and from MarComm requests whose event goes on the
// District calendar. The team posts each one and marks it Posted (with the
// calendar link) or Declined. Data: /api/bcps/calendar-requests.
interface CalReq {
  id: string; request_number: number; created_at: string; kind: string; event_name: string; event_date: string; start_time: string; end_time: string
  virtual_link: string | null; virtual_phone: string | null; virtual_conference_id: string | null; additional_info: string | null
  location: string | null; address_street: string | null; address_line2: string | null; city: string | null; state: string | null; zip: string | null
  website_link: string | null; contact_name: string; contact_email: string | null; contact_phone: string | null; school_department: string | null
  submitter_name: string; submitter_department: string; submitter_phone: string; requester_email: string
  status: 'new' | 'posted' | 'declined'; posted_url: string | null; status_note: string | null; status_by: string | null; status_at: string | null
  bcps_marcomm_requests: { job_number: number | null; title: string } | null
}
const CAL_KIND: Record<string, string> = { meeting: 'Meeting', special_event: 'Special Event', virtual_meeting: 'Virtual Meeting' }
const CAL_STATUS: Record<CalReq['status'], { label: string; cls: string }> = {
  new: { label: 'New', cls: 'st-new' }, posted: { label: 'Posted', cls: 'st-done' }, declined: { label: 'Declined', cls: 'st-hold' },
}
const time12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }

function CalendarPosts({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<CalReq[] | null>(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'new' | 'posted' | 'declined' | 'all'>('new')
  const [openId, setOpenId] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const r = await fetch('/api/bcps/calendar-requests', { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError(j.error || 'Could not load calendar posts.'); return }
    setRows(j.requests); setError('')
  }, [])
  useEffect(() => { load() }, [load])
  const save = async (id: string, status: CalReq['status']) => {
    setBusy(true)
    try {
      const r = await fetch('/api/bcps/calendar-requests', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ id, status, posted_url: url, note }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not save.')
      await load(); setOpenId(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save.') } finally { setBusy(false) }
  }
  if (error && !rows) return <p className="mca-error">{error}</p>
  if (!rows) return <p className="muted">Loading calendar posts...</p>
  const count = (st: string) => rows.filter(r => st === 'all' || r.status === st).length
  const list = rows.filter(r => filter === 'all' || r.status === filter)
  return (
    <div className="cal-posts">
      <div className="mca-filters">
        <div className="mca-chips">
          <span className="fl">Status</span>
          {(['new', 'posted', 'declined', 'all'] as const).map(st => (
            <button key={st} className={`chip ${filter === st ? 'on' : ''}`} onClick={() => setFilter(st)}>{st === 'all' ? 'All' : CAL_STATUS[st].label} <b>{count(st)}</b></button>
          ))}
        </div>
        <a className="mca-btn ghost small" href="/calendar-request" target="_blank" rel="noopener">Open calendar request form</a>
      </div>
      {error && <p className="mca-error">{error}</p>}
      <div className="mca-table">
        {list.length === 0 && <p className="mca-empty">No calendar posts here.</p>}
        {list.map(r => {
          const isOpen = openId === r.id
          const where = r.kind === 'virtual_meeting' ? 'Virtual' : [r.location, r.city].filter(Boolean).join(', ')
          return (
            <div key={r.id} className={`cal-row${r.status === 'new' ? ' is-new' : ''}`}>
              <button type="button" className="cal-row-head" aria-expanded={isOpen} onClick={() => { setOpenId(isOpen ? null : r.id); setUrl(r.posted_url ?? ''); setNote(r.status_note ?? '') }}>
                <span className="r-job">{fmtDate(r.event_date)}</span>
                <span className="cal-main">
                  <span className="r-title">{r.event_name}</span>
                  <span className="r-who">{CAL_KIND[r.kind] ?? r.kind} · {time12(r.start_time)} to {time12(r.end_time)}{where ? ` · ${where}` : ''}</span>
                  <span className="r-who">{r.school_department || r.submitter_department} · {r.contact_name}{r.bcps_marcomm_requests ? ` · with MarComm request #${r.bcps_marcomm_requests.job_number ?? ''}` : ''}</span>
                </span>
                <span className={`badge ${CAL_STATUS[r.status].cls}`}>{CAL_STATUS[r.status].label}</span>
              </button>
              {isOpen && (
                <div className="cal-detail">
                  <p className="d-text"><b>Calendar post #{r.request_number}</b>, sent {fmtStamp(r.created_at)} by <a href={`mailto:${r.requester_email}`}>{r.requester_email}</a></p>
                  {r.kind !== 'virtual_meeting' && <p className="d-text"><b>Address:</b> {[r.address_street, r.address_line2, [r.city, r.state, r.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}</p>}
                  {r.virtual_link && <p className="d-text"><b>Virtual link:</b> <a href={r.virtual_link} target="_blank" rel="noopener noreferrer">{r.virtual_link}</a></p>}
                  {(r.virtual_phone || r.virtual_conference_id) && <p className="d-text"><b>Dial in:</b> {[r.virtual_phone, r.virtual_conference_id && `ID ${r.virtual_conference_id}`].filter(Boolean).join(', ')}</p>}
                  {r.website_link && <p className="d-text"><b>Website:</b> <a href={r.website_link} target="_blank" rel="noopener noreferrer">{r.website_link}</a></p>}
                  <p className="d-text"><b>Contact:</b> {[r.contact_name, r.contact_email, r.contact_phone].filter(Boolean).join(', ')}</p>
                  {r.additional_info && <p className="d-text pre"><b>Additional information:</b> {r.additional_info}</p>}
                  <p className="d-text"><b>Submitted by:</b> {[r.submitter_name, r.submitter_department, r.submitter_phone].filter(Boolean).join(', ')}</p>
                  {r.status !== 'new' && <p className="d-text muted">{CAL_STATUS[r.status].label} {r.status_at ? fmtStamp(r.status_at) : ''}{r.status_by ? ` by ${r.status_by}` : ''}{r.status_note ? `: ${r.status_note}` : ''}{r.posted_url ? <> · <a href={r.posted_url} target="_blank" rel="noopener noreferrer">View on the calendar</a></> : null}</p>}
                  {canEdit && <div className="cal-actions">
                    <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="Calendar link, once posted (https://)" aria-label="Calendar link" />
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional, required to decline)" aria-label="Note" />
                    <button className="mca-btn small" disabled={busy} onClick={() => save(r.id, 'posted')}>Mark posted</button>
                    <button className="mca-btn small ghost" disabled={busy || !note.trim()} onClick={() => save(r.id, 'declined')}>Decline</button>
                    {r.status !== 'new' && <button className="mca-btn small ghost" disabled={busy} onClick={() => save(r.id, 'new')}>Reopen</button>}
                  </div>}
                </div>
              )}
            </div>
          )
        })}
      </div>
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
.mca { padding: 28px 32px 60px; background: #f5f5f5; min-height: calc(100vh - 64px); font-family: 'Open Sans', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; }
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
.mca-row { display: grid; grid-template-columns: 92px minmax(0,1fr) 170px 110px 140px 120px 80px; gap: 12px; padding: 14px 20px; border-bottom: 1px solid rgba(0,0,0,0.07); align-items: start; cursor: pointer; }
.mca-row:hover { background: rgba(22,114,167,0.04); }
.mca-row:focus-visible { outline: 3px solid #1672A7; outline-offset: -3px; }
.mca-colhead { background: #fafafa; cursor: default; padding-top: 10px; padding-bottom: 10px; }
.mca-colhead:hover { background: #fafafa; }
.mca-colhead span { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(26,26,26,0.5); }
.r-top { display: flex; gap: 8px; align-items: baseline; min-width: 0; }
.r-job { font-size: 20px; font-weight: 900; color: #0e4e73; line-height: 1.1; letter-spacing: -0.01em; white-space: nowrap; font-variant-numeric: tabular-nums; }
.r-job.team { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(26,26,26,0.5); white-space: normal; }
.col-sort { font: inherit; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: #0e4e73; background: none; border: 0; padding: 0; text-align: left; cursor: pointer; }
.col-sort:hover { text-decoration: underline; }
.r-title { font-size: 13px; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* Only new requests are bold, like unread mail (Marketing meeting, 2026-10-20). */
.mca-row.is-new .r-title { font-weight: 800; }
.r-who { font-size: 11px; color: rgba(26,26,26,0.6); margin-top: 3px; }
.r-sub { font-size: 11px; color: rgba(26,26,26,0.5); margin-top: 2px; }
.r-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.r-tags span { font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: rgba(22,114,167,0.08); color: #0e4e73; }
.lead { font-size: 12px; font-weight: 700; }
.support { font-size: 11px; color: rgba(26,26,26,0.6); }
.none { color: rgba(26,26,26,0.45); font-weight: 400; }
.date { font-size: 12px; font-weight: 700; color: #C55326; }
.date.late { color: #b91c1c; }
.date.none { color: rgba(26,26,26,0.5); font-weight: 400; }
.date.sub { color: rgba(26,26,26,0.75); }
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
.d-link .hint { font-size: 12px; line-height: 1.45; color: rgba(26,26,26,0.6); }
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
/* Request window: a centered lightbox over a dark backdrop, the way Web Team
   Assignments opens its notes (Sean, 2026-10-20); Full screen fills the window. */
.mca-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 300; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
.mca-drawer { width: min(760px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; background: #fff; padding: 24px 28px 36px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); box-sizing: border-box; }
.mca-drawer.narrow { width: min(520px, 100%); }
.d-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 16px; }
.d-crumb { font-size: 11px; font-weight: 700; color: #0e4e73; margin-bottom: 6px; }
.d-job { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(26,26,26,0.55); margin-bottom: 6px; }
.d-job b { font-size: 30px; font-weight: 900; color: #0e4e73; letter-spacing: -0.01em; margin-left: 4px; font-variant-numeric: tabular-nums; }
.d-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.mca-drawer.large { position: fixed; inset: 0; width: auto; max-height: none; border-radius: 0; padding: 32px max(40px, calc((100vw - 1100px) / 2)) 56px; }
.mca-drawer.large h2 { font-size: 26px; }
.mca-drawer.large .d-job b { font-size: 44px; }
.mca-drawer.large h3 { font-size: 12px; }
.mca-drawer.large .d-text, .mca-drawer.large .n-body { font-size: 17px; }
.mca-drawer.large .n-meta { font-size: 12px; }
.mca-drawer.large select, .mca-drawer.large input, .mca-drawer.large textarea { font-size: 15px; }
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
.cal-posts .mca-filters { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.cal-row { border-bottom: 1px solid rgba(0,0,0,0.07); }
.cal-row-head { display: grid; grid-template-columns: 130px minmax(0,1fr) auto; gap: 14px; align-items: start; width: 100%; text-align: left; font: inherit; background: none; border: 0; padding: 14px 20px; cursor: pointer; }
.cal-row-head:hover { background: rgba(22,114,167,0.04); }
.cal-row-head .r-job { font-size: 15px; }
.cal-main { display: flex; flex-direction: column; min-width: 0; }
.cal-row.is-new .r-title { font-weight: 800; }
.cal-detail { padding: 4px 20px 16px 164px; }
.cal-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.cal-actions input { flex: 1 1 220px; min-width: 0; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; }
@media (max-width: 640px) { .cal-row-head { grid-template-columns: minmax(0,1fr) auto; } .cal-row-head .r-job { grid-column: 1 / -1; } .cal-detail { padding: 4px 16px 16px; } }
.mca-banner.expired { background: #FFF4E5; border-color: #C55326; color: #7a2e0e; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.d-addfiles { display: inline-block; margin-top: 8px; cursor: pointer; }
.d-addfiles input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.d-addfiles:focus-within .mca-btn { outline: 3px solid #1672A7; outline-offset: 2px; }
.d-request .d-text { margin-bottom: 12px; }
.d-qa { display: flex; flex-direction: column; gap: 3px; margin: 0 0 14px; padding: 10px 12px; border-left: 3px solid #1672A7; background: rgba(22,114,167,0.04); border-radius: 0 6px 6px 0; }
.d-qa-q { font-size: 13px; font-weight: 800; line-height: 1.4; color: #1a1a1a; }
.d-qa-a { font-size: 14px; font-weight: 400; line-height: 1.55; color: rgba(26,26,26,0.85); overflow-wrap: anywhere; }
.d-combine { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.d-combine select { flex: 1 1 260px; min-width: 0; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; background: #fff; }
.n-edit-btn.danger { color: #b3261e; }
.n-edit-btn:disabled { opacity: 0.5; cursor: default; }
.d-fields { border: 0; margin: 0; padding: 0; min-width: 0; }
.d-fields:disabled select, .d-fields:disabled input { background: #f6f7f8; color: #1a1a1a; cursor: default; }
.mca-viewonly { font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #0e4e73; background: rgba(22,114,167,0.08); border: 1px solid rgba(22,114,167,0.3); border-radius: 6px; padding: 8px 12px; }
.n-edit-btn { font: inherit; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #0e4e73; background: none; border: 0; padding: 0; margin-left: 8px; cursor: pointer; text-decoration: underline; }
.n-edit textarea { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; }
.n-edit-row { display: flex; gap: 8px; margin-top: 6px; }
.d-notes { list-style: none; padding: 0; margin: 0; }
.d-notes li { padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
.n-meta { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.n-body { font-size: 13px; line-height: 1.6; }
@media (max-width: 900px) {
  .mca { padding: 20px 16px 48px; }
  .mca-meta { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .mca-colhead { display: none; }
  .mca-row { grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
  .mca-row .c-req, .mca-row .c-job { grid-column: 1 / -1; }
  .mca-row [data-label]::before { content: attr(data-label); display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.14em; color: rgba(26,26,26,0.5); margin-bottom: 3px; }
  .mca-controls label { min-width: 0; flex: 1 1 100%; }
  .d-grid { grid-template-columns: minmax(0,1fr); }
  .mca-overlay { padding: 0; }
  .mca-drawer, .mca-drawer.narrow { width: 100%; max-height: none; height: 100%; border-radius: 0; }
}
`
