'use client'

// School Profile (Sean + Vanessa Deslandes, 2026-10-23): one page per school,
// laid out like the department profile, so everything a school does here is
// in one place instead of in Run Audit and ADA Manager.
//
// The same page serves two people. A school WCM sees it as their dashboard
// (SchoolWcmHome renders it with embedded): their ADA audit, their banners
// and Proud Points, and who to call. The District Web Team opens it from a
// Schools tile (/school?loc=) and sees what the WCM sees, so they can support
// them, plus what only the team does: run the audit, keep the school's
// leadership on file, send the WCM a note, and the Activity record.
//
// Tabs: Overview | Web Review (the full-site ADA audit, page by page; ?tab=review
// opens on it) | Activity (team only). Audit History lists every full-site scan;
// picking one shows that scan on Web Review.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { SchoolAuditPages, type SchoolScore } from '@/components/pages/ADAManagerPage'

interface BatchSummary {
  scan_batch_id: string
  page_count: number
  avg_ada_score: number | null
  critical_count: number
  serious_count: number
  moderate_count: number
  minor_count: number
  last_audited_at: string
}
type Audit = SchoolScore & BatchSummary & { latest: boolean }
interface Submission { id: string; type?: string; kind?: string; status: string; banner_title?: string | null; file_name?: string | null; wcm_email?: string | null; submitter_name?: string | null; rejection_reason?: string | null; submitted_at?: string | null; created_at?: string; reviewed_at?: string | null; posted_at?: string | null; is_test?: boolean }
interface Activity { id: string; kind: string; actor_email: string | null; subject: string | null; body: string | null; sent_to: string | null; email_sent: boolean | null; email_error: string | null; created_at: string }
interface RosterWcm { full_name: string | null; email: string | null; cert_status: string | null; site_access: string | null; cert_due_on: string | null; designated_by: string | null; access_end: string | null }

// Where a WCM stands in BCPS Central: certified, overdue (not certified and
// past their due date) or still in the course.
export function wcmStanding(r: { cert_status: string | null; cert_due_on: string | null }): { label: string; tone: string } {
  if (r.cert_status === 'Certified') return { label: 'Certified', tone: 'green' }
  if (r.cert_due_on && r.cert_due_on < new Date().toISOString().slice(0, 10)) return { label: 'Overdue', tone: 'red' }
  return { label: r.cert_status || 'Not registered', tone: 'yellow' }
}

interface Profile {
  viewer: { team: boolean; wcm: boolean }
  school: { loc_no: string; name: string; school_level: string | null; region: string | null; no_wcm: boolean; provisioned: boolean; school_id: string | null; site_url: string | null; wcm_name: string | null; wcm_email: string | null }
  lead: { email: string; full_name: string | null; title: string | null } | null
  contacts: { principal_name: string | null; principal_email: string | null; board_member_name: string | null; board_district: string | null; updated_at: string } | null
  history: BatchSummary[]
  audit: Audit | null
  banners: Submission[]
  proud_points: Submission[]
  activity: Activity[]
  roster: RosterWcm[]
}

const fmtDate = (ts?: string | null) => ts ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never'
const fmtDateTime = (ts?: string | null) => ts ? `${fmtDate(ts)} ${new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''
const scoreTone = (n?: number | null) => n == null ? 'na' : n >= 80 ? 'green' : n >= 65 ? 'yellow' : 'red'
const scoreStatus = (n?: number | null) => n == null ? 'Not audited' : n >= 80 ? 'Passing' : n >= 65 ? 'Needs Work' : 'Critical Issues'

// Where a banner or Proud Points submission stands, in the words Your
// Submissions uses.
function subStatus(s: Submission): { label: string; tone: string } {
  if (s.status === 'approved') return s.posted_at ? { label: 'Live', tone: 'green' } : { label: 'Approved', tone: 'blue' }
  if (s.status === 'rejected') return { label: 'Not approved', tone: 'red' }
  if (s.status === 'draft') return { label: 'Draft', tone: 'na' }
  return { label: 'Waiting for review', tone: 'yellow' }
}

function ScoreRing({ score, size = 100 }: { score: number | null | undefined; size?: number }) {
  const r = size / 2 - 8, circ = 2 * Math.PI * r
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  return (
    <div className="sp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="sp-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className={`sp-ring-fill ${scoreTone(score)}`} strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className={`sp-ring-num${score == null ? ' na' : ''}`}>{score ?? 'N/A'}</span>
    </div>
  )
}

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function SchoolProfileView({ loc, embedded = false }: { loc: string; embedded?: boolean }) {
  const [data, setData] = useState<Profile | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'overview' | 'review' | 'activity'>('overview')
  const [batch, setBatch] = useState<string | null>(null)
  const [canScan, setCanScan] = useState(false)
  const [scanning, setScanning] = useState<{ current: number; total: number } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type?: string } | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [myEmail, setMyEmail] = useState('')
  useEffect(() => { createClient().auth.getUser().then(({ data: u }) => setMyEmail((u.user?.email || '').toLowerCase())).catch(() => {}) }, [])
  const [note, setNote] = useState({ subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [editContacts, setEditContacts] = useState(false)
  const [contacts, setContacts] = useState({ principal_name: '', principal_email: '', board_member_name: '', board_district: '' })

  useEffect(() => { if (new URLSearchParams(window.location.search).get('tab') === 'review') setTab('review') }, [])

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const t = (await createClient().auth.getSession()).data.session?.access_token
    return t ? { Authorization: `Bearer ${t}` } : {}
  }, [])
  const showToast = (msg: string, type?: string) => { setToast({ msg, type }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async (b: string | null) => {
    const r = await fetch(`/api/bcps/school-profile?loc=${encodeURIComponent(loc)}${b ? `&batch=${encodeURIComponent(b)}` : ''}`, { headers: await authHeader(), cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setError((j as { error?: string }).error || 'Could not load this school.'); return }
    const p = j as Profile
    setData(p)
    if (typeof document !== 'undefined' && !embedded) document.title = `${p.school.name} - School Profile | Broward County Public Schools`
  }, [loc, authHeader, embedded])
  useEffect(() => { load(null).catch(() => setError('Could not load this school.')) }, [load])
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/bcps/school-sitemap?check=1', { headers: await authHeader(), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      setCanScan(!!j.allowed)
    })().catch(() => {})
  }, [authHeader])

  const openBatch = (id: string) => { setBatch(id); setTab('review'); load(id).catch(() => {}) }

  // Same steps as the Schools tile's Run audit: discover the pages, then scan
  // each one into one batch so the school gets one averaged score.
  const runAudit = async () => {
    if (!data?.school.school_id) return
    const headers = await authHeader()
    const sm = await fetch(`/api/bcps/school-sitemap?school_id=${encodeURIComponent(data.school.school_id)}`, { headers })
    const smj = await sm.json().catch(() => ({}))
    if (!sm.ok) { showToast(smj.error || "Could not find this school's pages.", 'error'); return }
    const urls: string[] = smj.urls ?? []
    if (!urls.length) { showToast('No pages were found to scan.', 'error'); return }
    const id = crypto.randomUUID()
    for (let i = 0; i < urls.length; i++) {
      setScanning({ current: i + 1, total: urls.length })
      try {
        await fetch('/api/bcps/ada-scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ url: urls[i], school_id: data.school.school_id, scan_batch_id: id }),
        })
      } catch { /* one page failing does not stop the batch */ }
    }
    setScanning(null)
    setBatch(null)
    await load(null)
    setTab('review')
    showToast('Audit complete.', 'success')
  }

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/bcps/school-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeader()) }, body: JSON.stringify({ loc, ...body }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error((j as { error?: string }).error || 'That did not save.')
  }
  const sendNote = async () => {
    setSending(true)
    try {
      await post({ action: 'note', ...note })
      setNote({ subject: '', body: '' }); setNoteOpen(false)
      showToast('Sent.', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not send.', 'error') }
    finally { setSending(false); load(batch).catch(() => {}) }
  }
  const saveContacts = async () => {
    try {
      await post({ action: 'contacts', ...contacts })
      setEditContacts(false)
      showToast('Leadership saved.', 'success')
      await load(batch)
    } catch (e) { showToast(e instanceof Error ? e.message : 'Could not save.', 'error') }
  }

  if (error) return <div className="sp-empty-page">{error}{!embedded && <> <a href="/?page=dashboard&tab=schools">Return to schools</a></>}</div>
  if (!data) return <div className="sp-empty-page">Loading the school profile...</div>

  const { school, audit, viewer } = data
  const team = viewer.team
  // The roster's WCMs, plus the one stored on the school if it is not on the roster.
  const wcms: RosterWcm[] = [...data.roster]
  if (school.wcm_email && !wcms.some((w) => w.email === school.wcm_email!.toLowerCase())) {
    wcms.unshift({ full_name: school.wcm_name || school.wcm_email, email: school.wcm_email.toLowerCase(), cert_status: null, site_access: null, cert_due_on: null, designated_by: null, access_end: null })
  }
  const recipients = Array.from(new Set(wcms.map((w) => w.email).filter((e): e is string => !!e)))
  const copyEmails = () => { navigator.clipboard?.writeText(recipients.join('; ')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {}) }
  const latest = data.history[0] ?? null
  const subs = [...data.banners.map((s) => ({ ...s, what: s.type === 'removal' ? 'Banner removal' : 'Banner' })), ...data.proud_points.map((s) => ({ ...s, what: 'Proud Points' }))]
    .filter((s) => s.status !== 'draft')
    .sort((a, b) => (b.submitted_at || b.created_at || '').localeCompare(a.submitted_at || a.created_at || ''))
  const waiting = subs.filter((s) => s.status === 'pending').length
  const live = subs.filter((s) => s.status === 'approved' && s.posted_at).length
  const ppDrafts = data.proud_points.filter((s) => s.status === 'draft').length

  // The Activity report: the team's notes and edits, every audit, and every
  // submission's steps, newest first.
  const events: { at: string; what: string; detail: string; who: string }[] = [
    ...data.activity.map((a) => ({
      at: a.created_at,
      what: a.kind === 'note' ? 'Note to WCM' : a.kind === 'contacts' ? 'Leadership updated' : a.kind,
      detail: a.kind === 'note' ? `${a.subject || ''}${a.body ? `: ${a.body}` : ''}${a.email_sent === false ? ` (email not sent: ${a.email_error || 'error'})` : a.sent_to ? ` (sent to ${a.sent_to})` : ''}` : a.subject || '',
      who: a.actor_email || '',
    })),
    ...data.history.map((h) => ({ at: h.last_audited_at, what: 'ADA audit', detail: `Score ${h.avg_ada_score ?? 'N/A'} across ${h.page_count} pages, ${h.critical_count + h.serious_count} serious issues`, who: '' })),
    ...subs.flatMap((s) => {
      const title = s.banner_title || s.file_name || ''
      const out = [{ at: s.submitted_at || s.created_at || '', what: `${s.what} submitted`, detail: title, who: s.wcm_email || s.submitter_name || '' }]
      if (s.reviewed_at) out.push({ at: s.reviewed_at, what: `${s.what} ${s.status === 'rejected' ? 'not approved' : 'approved'}`, detail: s.rejection_reason || title, who: '' })
      if (s.posted_at) out.push({ at: s.posted_at, what: `${s.what} live`, detail: title, who: '' })
      return out
    }),
  ].filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at))
  const exportActivity = () => {
    const lines = [['Date', 'Activity', 'Detail', 'By'], ...events.map((e) => [fmtDateTime(e.at), e.what, e.detail, e.who])].map((r) => r.map(csvCell).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${school.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-activity-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const runButton = canScan && school.site_url && school.school_id && (
    <button type="button" className="sp-btn-primary" disabled={!!scanning} onClick={runAudit}>
      {scanning ? `Auditing ${scanning.current}/${scanning.total}…` : latest ? 'Re-run audit' : 'Run audit'}
    </button>
  )

  return (
    <>
      <style>{CSS}</style>
      <div className={`sp-page${embedded ? ' embedded' : ''}`}>
        {/* HEADER */}
        <div className="sp-header">
          <div className="sp-header-left">
            <div className="sp-eyebrow">{[school.school_level, school.region ? `${school.region} Region` : null, `Location ${school.loc_no}`].filter(Boolean).join(' · ')}</div>
            <div className="sp-name">{school.name}</div>
            <div className="sp-meta">
              <span className={`sp-badge ${scoreTone(latest?.avg_ada_score)}`}>{scoreStatus(latest?.avg_ada_score)}</span>
              {school.site_url && <a className="sp-site-link" href={school.site_url} target="_blank" rel="noopener noreferrer">Visit website ↗</a>}
              {latest && <span className="sp-ts">Last audited {fmtDate(latest.last_audited_at)}</span>}
              <div style={{ flex: 1, minWidth: 16 }} />
              {!embedded && <a className="sp-btn-secondary" href="/?page=dashboard&tab=schools">‹ Back</a>}
              {runButton}
            </div>
            {scanning && <div className="sp-progress" role="progressbar" aria-valuenow={scanning.current} aria-valuemax={scanning.total}><div style={{ width: `${(scanning.current / scanning.total) * 100}%` }} /></div>}
          </div>
        </div>

        {/* TILES */}
        <div className="sp-scores">
          <div className="sp-score-card overall">
            <div className="sp-score-label">ADA Score</div>
            <ScoreRing score={latest?.avg_ada_score} />
            <div className="sp-score-sub">{latest ? `${latest.page_count} pages, full site` : 'Not audited yet'}</div>
          </div>
          <div className="sp-score-card"><div className="sp-score-label">Serious Issues</div><div className="sp-score-num red">{latest ? latest.critical_count + latest.serious_count : '–'}</div><div className="sp-score-sub">critical and serious</div></div>
          <div className="sp-score-card"><div className="sp-score-label">Pages Audited</div><div className="sp-score-num">{latest?.page_count ?? '–'}</div><div className="sp-score-sub">{latest ? fmtDate(latest.last_audited_at) : 'No audit yet'}</div></div>
          <div className="sp-score-card"><div className="sp-score-label">Waiting for Review</div><div className="sp-score-num yellow">{waiting}</div><div className="sp-score-sub">banners and Proud Points</div></div>
          <div className="sp-score-card"><div className="sp-score-label">Live on Site</div><div className="sp-score-num green">{live}</div><div className="sp-score-sub">banners and Proud Points</div></div>
        </div>

        {/* TABS */}
        <div className="sp-panel" style={{ marginBottom: 16 }}>
          <div className="sp-tab-bar" role="tablist">
            <button role="tab" aria-selected={tab === 'overview'} className={`sp-tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button role="tab" aria-selected={tab === 'review'} className={`sp-tab${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>
              Web Review {latest && latest.critical_count + latest.serious_count > 0 && <span className="sp-tab-badge">{latest.critical_count + latest.serious_count}</span>}
            </button>
            {team && <button role="tab" aria-selected={tab === 'activity'} className={`sp-tab${tab === 'activity' ? ' active' : ''}`} onClick={() => setTab('activity')}>Activity</button>}
          </div>
        </div>

        {tab === 'overview' && (
          <div className="sp-cols">
            <div>
              <div className="sp-panel">
                <div className="sp-panel-header"><span className="sp-panel-title">Homepage Banners &amp; Proud Points</span><span className="sp-panel-count">{subs.length} submitted</span></div>
                <div className="sp-panel-body">
                  <div className="sp-actions">
                    {viewer.wcm ? <>
                      <a className="sp-btn-primary" href="/?page=banner-submissions">Submit a banner</a>
                      <a className="sp-btn-primary" href="/?page=proud-points">{ppDrafts ? 'Continue Proud Points draft' : 'Submit Proud Points'}</a>
                      <a className="sp-btn-secondary" href="/?page=my-submissions">All my submissions</a>
                    </> : <>
                      <a className="sp-btn-secondary" href="/?page=banner-submissions">Open banner review</a>
                      <a className="sp-btn-secondary" href="/?page=proud-points">Open Proud Points</a>
                    </>}
                  </div>
                  {!subs.length ? <div className="sp-empty">No banners or Proud Points submitted yet.</div> : (
                    <table className="sp-table">
                      <thead><tr><th>Submission</th><th>Submitted</th><th>Status</th></tr></thead>
                      <tbody>
                        {subs.slice(0, 8).map((s) => {
                          const st = subStatus(s)
                          return (
                            <tr key={`${s.what}-${s.id}`}>
                              <td><b>{s.what}</b>{(s.banner_title || s.file_name) && <div className="sp-sub">{s.banner_title || s.file_name}</div>}{s.status === 'rejected' && s.rejection_reason && <div className="sp-sub red">{s.rejection_reason}</div>}</td>
                              <td>{fmtDate(s.submitted_at || s.created_at)}</td>
                              <td><span className={`sp-pill ${st.tone}`}>{st.label}</span>{s.is_test && <span className="sp-pill na" style={{ marginLeft: 4 }}>Test</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="sp-panel" style={{ marginTop: 16 }}>
                <div className="sp-panel-header"><span className="sp-panel-title">Audit History</span><span className="sp-panel-count">{data.history.length} full-site {data.history.length === 1 ? 'audit' : 'audits'}</span></div>
                <div className="sp-panel-body">
                  {!data.history.length ? <div className="sp-empty">No full-site audit yet. {canScan ? 'Use Run audit above.' : 'The District Web Team runs it.'}</div> : data.history.map((h) => (
                    <button key={h.scan_batch_id} type="button" className="sp-history" onClick={() => openBatch(h.scan_batch_id)}>
                      <span className="sp-history-date">{fmtDateTime(h.last_audited_at)}</span>
                      <span className={`sp-pill ${scoreTone(h.avg_ada_score)}`}>{h.avg_ada_score ?? 'N/A'}</span>
                      <span className="sp-history-meta">{h.page_count} pages · {h.critical_count + h.serious_count} serious · {h.moderate_count} moderate · {h.minor_count} minor</span>
                      <span className="sp-history-go">View ›</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT SIDEBAR */}
            <div>
              <div className="sp-info">
                <div className="sp-info-section">
                  <div className="sp-info-label">WCM Contact{data.roster.length > 0 && <button type="button" className="sp-edit" onClick={() => copyEmails()}>{copied ? 'Copied' : 'Copy emails'}</button>}</div>
                  {wcms.length ? wcms.map((w) => {
                    const st = wcmStanding(w)
                    return (
                      <div key={w.email || w.full_name || ''} className="sp-wcm">
                        <div className="sp-wcm-top"><b>{w.full_name}</b><span className={`sp-pill ${st.tone}`}>{st.label}</span></div>
                        {w.email && <a href={`mailto:${w.email}`}>{w.email}</a>}
                        <div className="sp-sub">{w.site_access === 'School Website' ? 'Live site access' : w.site_access === 'Sandbox Only' ? 'Sandbox only' : 'No site access yet'}{w.designated_by ? ` · Designated by ${w.designated_by}` : ''}</div>
                      </div>
                    )
                  }) : <div className="sp-info-row"><span>WCM</span><b className="unset">{school.no_wcm ? 'No WCM' : 'Not on file'}</b></div>}
                  {viewer.wcm && !team && data.roster.some((w) => w.email === myEmail && w.cert_status !== 'Certified') && (
                    <div className="sp-notice" style={{ marginTop: 10 }}>Finish the WCM Certification course to get access to edit your school website in Finalsite. Everything on this page is open to you now.</div>
                  )}
                  {team && (recipients.length
                    ? <button type="button" className="sp-btn-block" onClick={() => setNoteOpen((o) => !o)}>{noteOpen ? 'Close' : `Send a note to ${recipients.length > 1 ? `all ${recipients.length} WCMs` : 'the WCM'}`}</button>
                    : <div className="sp-hint">No WCM on file to send notes to.</div>)}
                  {team && noteOpen && (
                    <div className="sp-form">
                      <label>Subject<input value={note.subject} maxLength={160} onChange={(e) => setNote({ ...note, subject: e.target.value })} /></label>
                      <label>Message<textarea rows={5} value={note.body} maxLength={5000} onChange={(e) => setNote({ ...note, body: e.target.value })} /></label>
                      <button type="button" className="sp-btn-primary" disabled={sending || !note.subject.trim() || !note.body.trim()} onClick={sendNote}>{sending ? 'Sending...' : 'Send'}</button>
                      <div className="sp-hint">Emailed from BCPS MarComm with your address as the reply-to, and kept on this school&apos;s Activity record.</div>
                    </div>
                  )}
                </div>
                <div className="sp-info-section">
                  <div className="sp-info-label">Leadership{team && !editContacts && (
                    <button type="button" className="sp-edit" onClick={() => { setContacts({ principal_name: data.contacts?.principal_name || '', principal_email: data.contacts?.principal_email || '', board_member_name: data.contacts?.board_member_name || '', board_district: data.contacts?.board_district || '' }); setEditContacts(true) }}>Edit</button>
                  )}</div>
                  {editContacts ? (
                    <div className="sp-form">
                      <label>Principal<input value={contacts.principal_name} onChange={(e) => setContacts({ ...contacts, principal_name: e.target.value })} /></label>
                      <label>Principal email<input type="email" value={contacts.principal_email} onChange={(e) => setContacts({ ...contacts, principal_email: e.target.value })} /></label>
                      <label>School Board member<input value={contacts.board_member_name} onChange={(e) => setContacts({ ...contacts, board_member_name: e.target.value })} /></label>
                      <label>Board district<input value={contacts.board_district} onChange={(e) => setContacts({ ...contacts, board_district: e.target.value })} /></label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="sp-btn-primary" onClick={saveContacts}>Save</button>
                        <button type="button" className="sp-btn-secondary" onClick={() => setEditContacts(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : <>
                    <div className="sp-info-row"><span>Principal</span><b className={data.contacts?.principal_name ? '' : 'unset'}>{data.contacts?.principal_name ? (data.contacts.principal_email ? <a href={`mailto:${data.contacts.principal_email}`}>{data.contacts.principal_name}</a> : data.contacts.principal_name) : 'Not on file'}</b></div>
                    <div className="sp-info-row"><span>Board Member</span><b className={data.contacts?.board_member_name ? '' : 'unset'}>{data.contacts?.board_member_name ? `${data.contacts.board_member_name}${data.contacts.board_district ? `, District ${data.contacts.board_district}` : ''}` : 'Not on file'}</b></div>
                  </>}
                </div>
                <div className="sp-info-section">
                  <div className="sp-info-label">District Web Team</div>
                  <div className="sp-info-row"><span>Lead</span><b className={data.lead ? '' : 'unset'}>{data.lead ? <a href={`mailto:${data.lead.email}`}>{data.lead.full_name || data.lead.email}</a> : 'Not assigned'}</b></div>
                  {data.lead?.title && <div className="sp-info-row"><span>Title</span><b>{data.lead.title}</b></div>}
                </div>
                <div className="sp-info-section">
                  <div className="sp-info-label">Audit Status</div>
                  <div className="sp-info-row"><span>Status</span><b>{scoreStatus(latest?.avg_ada_score)}</b></div>
                  <div className="sp-info-row"><span>ADA Score</span><b className={latest?.avg_ada_score != null ? '' : 'unset'}>{latest?.avg_ada_score != null ? `${latest.avg_ada_score} / 100` : 'Not assessed'}</b></div>
                  <div className="sp-info-row"><span>Last Audit</span><b>{latest ? fmtDateTime(latest.last_audited_at) : 'Never'}</b></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'review' && (
          <div className="sp-panel">
            <div className="sp-panel-header">
              <span className="sp-panel-title">ADA Accessibility, Full Site</span>
              {audit && <span className="sp-panel-count">{fmtDateTime(audit.last_audited_at)} · {audit.page_count} pages</span>}
            </div>
            <div className="sp-panel-body">
              {audit ? <>
                {!audit.latest && (
                  <div className="sp-notice">Viewing an earlier audit. <button type="button" className="sp-link-btn" onClick={() => { setBatch(null); load(null).catch(() => {}) }}>Show the latest</button></div>
                )}
                <div className="sp-sev">
                  {([['critical', 'Critical', audit.critical_count], ['serious', 'Serious', audit.serious_count], ['moderate', 'Moderate', audit.moderate_count], ['minor', 'Minor', audit.minor_count]] as const).map(([cls, label, n]) => (
                    <div key={cls} className={`sp-sev-tile ${cls}`}><b>{n}</b><span>{label}</span></div>
                  ))}
                </div>
                <SchoolAuditPages schoolId={audit.school_id} score={audit} canReclassify={team} onChanged={() => { load(batch).catch(() => {}) }} />
              </> : (
                <div className="sp-empty">
                  {school.site_url ? 'No full-site audit on record yet.' : 'This school has no website on file yet.'} {canScan && school.site_url ? 'Use Run audit above.' : 'The District Web Team runs the audit.'}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'activity' && team && (
          <div className="sp-panel">
            <div className="sp-panel-header">
              <span className="sp-panel-title">Activity Report</span>
              <button type="button" className="sp-btn-secondary" disabled={!events.length} onClick={exportActivity}>Export to CSV</button>
            </div>
            <div className="sp-panel-body">
              {!events.length ? <div className="sp-empty">Nothing on record yet.</div> : (
                <table className="sp-table">
                  <thead><tr><th>Date</th><th>Activity</th><th>Detail</th><th>By</th></tr></thead>
                  <tbody>
                    {events.map((e, i) => (
                      <tr key={i}><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td><td><b>{e.what}</b></td><td className="sp-detail">{e.detail}</td><td>{e.who}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
      {toast && <div className={`sp-toast ${toast.type || ''}`} role="status">{toast.msg}</div>}
    </>
  )
}

const CSS = `
.sp-page{--bcps-blue:#1672A7;--bcps-blue-dark:#125e8a;--lr-border:#dde3ea;--lr-text:#262626;--lr-text-75:#525252;--lr-text-50:#767676;padding:28px;font-family:'Open Sans',sans-serif;color:var(--lr-text);box-sizing:border-box;width:100%}
.sp-page.embedded,.page-content .sp-page{padding:0}
.sp-empty-page{padding:48px 20px;text-align:center;color:#767676;font-size:13px}
.sp-empty-page a{color:#1672A7}
.sp-header{background:#fff;border:1px solid var(--lr-border);border-radius:12px;padding:20px 24px;margin-bottom:20px}
.sp-eyebrow{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:var(--bcps-blue);margin-bottom:4px}
.sp-name{font-size:20px;font-weight:900;line-height:1.2;margin-bottom:10px}
.sp-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.sp-badge{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border-radius:20px}
.sp-badge.green{background:#edf7ea;color:#16750C}.sp-badge.yellow{background:#fef3e2;color:#854F0B}.sp-badge.red{background:#fdf0f0;color:#A32D2D}.sp-badge.na{background:rgba(26,26,26,.06);color:var(--lr-text-50)}
.sp-site-link{font-size:9px;font-weight:800;color:var(--bcps-blue);text-transform:uppercase;letter-spacing:.1em;padding:3px 10px;border:1.5px solid var(--bcps-blue);border-radius:20px;text-decoration:none}
.sp-site-link:hover{background:#f0f7fd}
.sp-ts{font-size:10px;color:var(--lr-text-50);font-weight:600}
.sp-btn-primary{background:var(--bcps-blue);color:#fff;border:none;border-radius:8px;padding:9px 16px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center}
.sp-btn-primary:hover{background:var(--bcps-blue-dark)}.sp-btn-primary:disabled{opacity:.5;cursor:default}
.sp-btn-secondary{background:#fff;color:var(--lr-text);border:1px solid var(--lr-border);border-radius:8px;padding:9px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;cursor:pointer;font-family:inherit;text-decoration:none;display:inline-flex;align-items:center}
.sp-btn-secondary:hover{border-color:var(--bcps-blue);background:#f0f7fd}.sp-btn-secondary:disabled{opacity:.5;cursor:default}
.sp-progress{height:6px;background:#f3f4f6;border-radius:999px;overflow:hidden;margin-top:12px}
.sp-progress div{height:100%;background:var(--bcps-blue);transition:width .3s}
.sp-scores{display:grid;grid-template-columns:180px repeat(4,1fr);gap:14px;margin-bottom:20px}
.sp-score-card{background:#fff;border:1px solid var(--lr-border);border-radius:12px;padding:20px 18px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
.sp-score-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:var(--lr-text-50);margin-bottom:12px}
.sp-score-num{font-size:32px;font-weight:900;line-height:1;margin-bottom:6px}
.sp-score-num.red{color:#A32D2D}.sp-score-num.yellow{color:#854F0B}.sp-score-num.green{color:#16750C}
.sp-score-sub{font-size:10px;font-weight:600;color:var(--lr-text-50);margin-top:4px}
.sp-ring{position:relative;margin:0 auto 4px}
.sp-ring-track{fill:none;stroke:rgba(26,26,26,.08);stroke-width:8}
.sp-ring-fill{fill:none;stroke-width:8;stroke-linecap:round;transition:stroke-dashoffset .8s}
.sp-ring-fill.green{stroke:#16750C}.sp-ring-fill.yellow{stroke:#C97A1B}.sp-ring-fill.red{stroke:#A32D2D}.sp-ring-fill.na{stroke:rgba(26,26,26,.15)}
.sp-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900}
.sp-ring-num.na{font-size:14px;color:var(--lr-text-50)}
.sp-panel{background:#fff;border:1px solid var(--lr-border);border-radius:12px}
.sp-panel-header{padding:16px 20px 12px;border-bottom:1px solid var(--lr-border);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.sp-panel-title{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.14em}
.sp-panel-count{font-size:10px;font-weight:700;color:var(--lr-text-50)}
.sp-panel-body{padding:16px 20px}
.sp-tab-bar{display:flex;gap:0;padding:0 4px;overflow-x:auto}
.sp-tab{background:none;border:none;border-bottom:2px solid transparent;padding:12px 16px;font-size:11px;font-weight:700;color:var(--lr-text-50);cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;white-space:nowrap}
.sp-tab:hover{color:var(--lr-text)}.sp-tab.active{color:var(--bcps-blue);border-bottom-color:var(--bcps-blue)}
.sp-tab-badge{background:#fce8e8;color:#7C0E0E;font-size:9px;font-weight:900;padding:1px 5px;border-radius:10px}
.sp-cols{display:grid;grid-template-columns:1fr 340px;gap:16px}
.sp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.sp-table{width:100%;border-collapse:collapse;font-size:12px}
.sp-table th{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--lr-text-50);text-align:left;padding:0 8px 8px 0;border-bottom:1px solid var(--lr-border)}
.sp-table td{padding:9px 8px 9px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;color:var(--lr-text-75)}
.sp-table tr:last-child td{border-bottom:none}
.sp-table b{color:var(--lr-text)}
.sp-sub{font-size:11px;color:var(--lr-text-50);margin-top:2px}.sp-sub.red{color:#A32D2D}
.sp-detail{max-width:420px;white-space:pre-wrap;word-break:break-word}
.sp-pill{display:inline-block;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;padding:2px 8px;border-radius:999px;white-space:nowrap}
.sp-pill.green{background:#edf7ea;color:#16750C}.sp-pill.yellow{background:#fef3e2;color:#854F0B}.sp-pill.red{background:#fdf0f0;color:#A32D2D}.sp-pill.blue{background:#e8f1f8;color:#1a5276}.sp-pill.na{background:rgba(26,26,26,.06);color:var(--lr-text-50)}
.sp-empty{text-align:center;padding:28px 12px;color:var(--lr-text-50);font-size:12.5px}
.sp-history{display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;border-bottom:1px solid var(--lr-border);padding:10px 4px;cursor:pointer;font-family:inherit;text-align:left;flex-wrap:wrap}
.sp-history:last-child{border-bottom:none}.sp-history:hover{background:rgba(22,114,167,.04)}
.sp-history-date{font-size:11px;font-weight:700;color:var(--lr-text);min-width:150px}
.sp-history-meta{font-size:11px;color:var(--lr-text-50);flex:1}
.sp-history-go{font-size:10.5px;font-weight:800;color:var(--bcps-blue);text-transform:uppercase;letter-spacing:.08em}
.sp-info{background:#fff;border:1px solid var(--lr-border);border-radius:12px}
.sp-info-section{padding:14px 16px;border-bottom:1px solid var(--lr-border)}.sp-info-section:last-child{border-bottom:none}
.sp-info-label{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.2em;color:var(--lr-text-50);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.sp-info-row{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px;font-size:11px}
.sp-info-row span{font-size:10px;font-weight:700;color:var(--lr-text-50);flex-shrink:0}
.sp-info-row b{text-align:right;word-break:break-word}.sp-info-row b.unset{color:var(--lr-text-50);font-style:italic;font-weight:600}
.sp-info-row a{color:var(--bcps-blue)}
.sp-edit{background:none;border:none;color:var(--bcps-blue);font:inherit;font-size:9px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;cursor:pointer}
.sp-wcm{padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:11.5px;display:grid;gap:2px}.sp-wcm:last-of-type{border-bottom:none}
.sp-wcm-top{display:flex;justify-content:space-between;gap:6px;align-items:center}
.sp-wcm a{color:var(--bcps-blue);word-break:break-all}
.sp-btn-block{margin-top:10px;width:100%;padding:9px;border-radius:8px;border:1px solid var(--lr-border);background:#fff;color:#0e4e73;font-size:12.5px;font-weight:700;cursor:pointer;font-family:inherit}
.sp-btn-block:hover{border-color:var(--bcps-blue)}
.sp-hint{font-size:10.5px;color:var(--lr-text-50);margin-top:8px;line-height:1.4}
.sp-form{display:grid;gap:8px;margin-top:10px}
.sp-form label{display:grid;gap:3px;font-size:10px;font-weight:700;color:var(--lr-text-50)}
.sp-form input,.sp-form textarea{font:inherit;font-size:12px;color:var(--lr-text);border:1px solid var(--lr-border);border-radius:6px;padding:7px 9px;resize:vertical}
.sp-notice{background:#FFF7E6;border:1px solid #F5D28A;border-radius:8px;padding:8px 12px;font-size:11.5px;color:#7A4B00;margin-bottom:12px}
.sp-link-btn{background:none;border:none;color:var(--bcps-blue);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline;padding:0}
.sp-sev{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.sp-sev-tile{border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:10px}
.sp-sev-tile b{font-size:24px;font-weight:900;line-height:1}
.sp-sev-tile span{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}
.sp-sev-tile.critical{background:#fce8e8;color:#7C0E0E}.sp-sev-tile.serious{background:#fdf0f0;color:#A32D2D}.sp-sev-tile.moderate{background:#fef3e2;color:#854F0B}.sp-sev-tile.minor{background:#e8f1f8;color:#1a5276}
.sp-toast{position:fixed;bottom:24px;right:24px;background:#1a1a1a;color:#fff;padding:12px 18px;border-radius:8px;font-size:12px;font-weight:700;box-shadow:0 4px 20px rgba(0,0,0,.3);z-index:1000;max-width:340px}
.sp-toast.success{background:#16750C}.sp-toast.error{background:#A32D2D}
@media(max-width:900px){.sp-scores{grid-template-columns:repeat(3,1fr)}.sp-cols{grid-template-columns:1fr}.sp-sev{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.sp-page{padding:16px}.sp-page.embedded{padding:0}.sp-scores{grid-template-columns:repeat(2,1fr)}.sp-header{padding:16px}}
`
