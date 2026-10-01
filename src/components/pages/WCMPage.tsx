'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { MODULES, COURSE_ID } from '@/lib/cert-data'

// The roster queue moved off a shared static access key onto real admin auth
// 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED). The route now enforces
// requireBcpsAdmin server-side; this just passes the signed-in session token.
const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
const ROSTER_SIGNUP_URL = 'https://bcpsmarcomm.com/wcm-roster-signup'

interface RosterMember {
  id: string
  wcm_name: string
  wcm_personnel_number: string | null
  wcm_email: string | null
  // When the director submission designating this WCM was approved. Null for
  // rows an admin added by hand, which have no submission behind them.
  approved_at: string | null
  // Area within the department this WCM covers (e.g. Library Media
  // Services); null when they cover the whole department. Shown under the
  // name so it is clear at a glance who to contact (Sean, 2026-09-28).
  sub_department?: string | null
  // Whether the approval emails for this WCM actually went out.
  delivery?: {
    state: 'confirmed' | 'failed' | 'pending' | 'not_sent'
    at: string | null
    detail: { to: string; subject: string; status: string; error: string | null; at: string | null }[]
  } | null
}

interface RosterRow {
  id: string
  department_name: string
  location_number: string
  director_name: string | null
  // Confirmed director address on file, joined from bcps_departments - the
  // roster itself only ever stored the name. Folded in from the retired
  // standalone "Roster" BCC tool (Sean, 2026-09-18).
  director_email: string | null
  // A roster submission from this department's director has been approved.
  director_confirmed?: boolean
  // Department has no website, so no WCM or director outreach is needed
  // (bcps_wcm_roster.no_website, set by Sean 2026-09-23 and 2026-09-29).
  // These rows sit in their own collapsed section, out of the tracked
  // list, the counts and every BCC selection.
  no_website?: boolean
  no_website_note?: string | null
  updated_at: string
  wcms: RosterMember[]
}

interface RosterSubmission {
  id: string
  department_name: string
  location_number: string | null
  director_name: string
  wcm_name: string
  wcm_personnel_number: string | null
  wcm_email: string | null
  submitted_at: string
  status: 'pending' | 'approved' | 'rejected'
  reviewed_at: string | null
  reviewed_by: string | null
  submitter_email: string | null
  identity_flag: boolean
  submitter_name: string | null
  submitter_role: string | null
  action: 'add' | 'remove' | 'na' | 'confirm' | null
  raw_payload?: { identity_reason?: string } | null
}

// What approving a submission will do, stated on the card. Without it a
// removal and an addition render identically as "WCM: <name>".
const SUBMISSION_ACTION_LABEL: Record<string, string> = {
  add: 'Add WCM',
  remove: 'Remove WCM',
  na: 'No dedicated WCM this year',
  confirm: 'Confirms roster as-is',
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

/* ─── DEPARTMENT WCM ROSTER ───────────────────────────── */
function DepartmentRosterSection() {
  const [roster, setRoster] = useState<RosterRow[]>([])
  const [submissions, setSubmissions] = useState<RosterSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)
  // Web Content Managers see the roster and its outcomes but no pending queue
  // and no approve/reject controls - the API decides this and says so.
  const [readOnly, setReadOnly] = useState(false)
  // Outcome of the most recent approval, shown inline. Deliberately not an
  // alert: an alert per approval is unusable across a long queue.
  const [lastResult, setLastResult] = useState<string | null>(null)
  // The WCM whose failed-delivery detail is open in the lightbox.
  const [failureDetail, setFailureDetail] = useState<RosterMember | null>(null)
  // The WCM member row currently open for inline editing, and its draft values.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ wcm_name: '', wcm_personnel_number: '', wcm_email: '', sub_department: '' })
  const [deleting, setDeleting] = useState<string | null>(null)
  // BCC-list selection, open to every viewer (not just admins) since it only
  // reads emails already on the page - folded in from the retired
  // standalone "Roster" tool (Sean, 2026-09-18: "put the functionality of
  // selecting the emails in the existing WCM roster page"). Keyed
  // `wcm:<memberId>` or `dir:<rosterRowId>` so both kinds share one map.
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [bccToast, setBccToast] = useState('')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/bcps/wcm-roster-queue', { headers: await authHeaders() })
      const j = await r.json()
      setRoster(j.roster || [])
      setSubmissions(j.submissions || [])
      setReadOnly(!!j.read_only)
    } catch {
      setRoster([]); setSubmissions([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function decide(id: string, action: 'approve' | 'reject') {
    setActing(id)
    try {
      const r = await fetch('/api/bcps/wcm-roster-queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, action }),
      })
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        await load()
        if (action === 'approve') {
          const problems: string[] = []
          if (j.director_notice && !j.director_notice.account_ok) problems.push(`Director account: ${j.director_notice.error || 'failed'}`)
          else if (j.director_notice && !j.director_notice.email_sent) problems.push(`Director email did not send: ${j.director_notice.error || 'unknown error'}`)
          if (j.wcm_notice && !j.wcm_notice.account_ok) problems.push(`WCM account: ${j.wcm_notice.error || 'failed'}`)
          else if (j.wcm_notice && !j.wcm_notice.email_sent) problems.push(`WCM email did not send: ${j.wcm_notice.error || 'unknown error'}`)
          if (j.director_skipped) problems.push(j.director_skipped)
          if (j.wcm_skipped) problems.push(j.wcm_skipped)
          if (j.submitter_rejected) problems.push(j.submitter_rejected)
          // Provenance is an outcome, not a failure, so it never interrupts
          // with a dialog. A modal on every one of seventy approvals trains
          // you to dismiss it unread, and that is how a real failure slips by.
          const note = j.director_email_provisional ? ` ${j.director_email_provisional}` : ''
          if (problems.length > 0) {
            alert(`Approved, but: ${problems.join(' | ')}`)
          }
          if (j.emails_ok) {
            // Say it out loud rather than letting silence stand for success.
            // Working through a queue of these, "nothing happened" and "both
            // emails went out" must not look the same.
            setLastResult(`Approved. Confirmation emails accepted by the mail provider for both the director and the WCM.${note}`)
          }
        }
      } else {
        const j = await r.json().catch(() => ({}))
        alert(j.error || 'Could not update this submission.')
      }
    } catch {
      alert('Could not update this submission.')
    }
    setActing(null)
  }

  async function deleteSubmission(id: string) {
    if (!window.confirm('Delete this pending submission? This removes it entirely, it will not show as rejected.')) return
    setActing(id)
    try {
      const r = await fetch('/api/bcps/wcm-roster-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ type: 'submission', id }),
      })
      if (r.ok) await load()
      else { const j = await r.json().catch(() => ({})); alert(j.error || 'Could not delete this submission.') }
    } catch {
      alert('Could not delete this submission.')
    }
    setActing(null)
  }

  async function deleteMember(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from this department's roster? This cannot be undone.`)) return
    setDeleting(id)
    try {
      const r = await fetch('/api/bcps/wcm-roster-queue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ type: 'member', id }),
      })
      if (r.ok) await load()
      else { const j = await r.json().catch(() => ({})); alert(j.error || 'Could not remove this WCM.') }
    } catch {
      alert('Could not remove this WCM.')
    }
    setDeleting(null)
  }

  function startEdit(m: RosterMember) {
    setEditingId(m.id)
    setEditDraft({ wcm_name: m.wcm_name, wcm_personnel_number: m.wcm_personnel_number ?? '', wcm_email: m.wcm_email ?? '', sub_department: m.sub_department ?? '' })
  }

  async function saveEdit(id: string) {
    if (!editDraft.wcm_name.trim()) { alert('Name cannot be empty.'); return }
    setDeleting(id)
    try {
      const r = await fetch('/api/bcps/wcm-roster-queue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, ...editDraft }),
      })
      if (r.ok) { setEditingId(null); await load() }
      else { const j = await r.json().catch(() => ({})); alert(j.error || 'Could not save this change.') }
    } catch {
      alert('Could not save this change.')
    }
    setDeleting(null)
  }

  const pending = useMemo(() => submissions.filter(s => s.status === 'pending'), [submissions])

  // Confirmed WCMs (a real email on file) first, ahead of legacy no-email
  // placeholder rows - Sean, 2026-09-18: in Bilingual/ESOL the confirmed WCM
  // was sorting to the bottom, below three unconfirmed legacy names, just
  // because it was added to the roster later.
  const trackedRoster = useMemo(() => roster.filter(r => !r.no_website), [roster])
  const untrackedRoster = useMemo(
    () => roster.filter(r => r.no_website).sort((a, b) => a.department_name.localeCompare(b.department_name)),
    [roster]
  )

  const sortedRoster = useMemo(() => trackedRoster.map(r => ({
    ...r,
    wcms: [...r.wcms].sort((a, b) => (a.wcm_email ? 0 : 1) - (b.wcm_email ? 0 : 1)),
  })), [trackedRoster])

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedRoster
    return sortedRoster.filter(r =>
      r.department_name.toLowerCase().includes(q) ||
      (r.director_name || '').toLowerCase().includes(q) ||
      r.wcms.some(w => w.wcm_name.toLowerCase().includes(q) || (w.sub_department || '').toLowerCase().includes(q))
    )
  }, [sortedRoster, search])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  // Every selectable {key, email} across the whole roster (not just the
  // filtered/visible rows), so a BCC list built before searching stays intact
  // once the search box is cleared.
  // Each row carries its role and confirmation so the Select menu can build
  // a list as granular as Sean asked for (2026-09-28 OOC huddle): directors
  // or WCMs, confirmed or not. Unconfirmed people are the point of most
  // reminders, so they are always selectable when an email is on file. A
  // director counts as confirmed once a submission from them was approved,
  // or once any WCM they designated is approved (the grandfathered
  // old-process departments have approvals but no submission row).
  const selectableRows = useMemo(() => {
    const rows: { key: string; email: string; role: 'dir' | 'wcm'; confirmed: boolean }[] = []
    for (const r of trackedRoster) {
      const dirConfirmed = !!r.director_confirmed || r.wcms.some(w => !!w.approved_at)
      if (r.director_email) rows.push({ key: `dir:${r.id}`, email: r.director_email, role: 'dir', confirmed: dirConfirmed })
      for (const w of r.wcms) if (w.wcm_email) rows.push({ key: `wcm:${w.id}`, email: w.wcm_email, role: 'wcm', confirmed: !!w.approved_at })
    }
    return rows
  }, [trackedRoster])

  const selectedEmails = useMemo(
    () => selectableRows.filter(r => selected[r.key]).map(r => r.email),
    [selectableRows, selected]
  )

  function toggleSelect(key: string) {
    setSelected(prev => {
      const next = { ...prev }
      if (next[key]) delete next[key]; else next[key] = true
      return next
    })
  }
  // Adds a group to the current selection, so groups can be combined
  // (e.g. unconfirmed directors plus unconfirmed WCMs).
  const selectGroup = (group: string) => {
    const [role, conf] = group.split(':')
    const next = { ...selected }
    selectableRows.forEach(r => {
      if (role !== 'all' && r.role !== role) return
      if (conf === 'confirmed' && !r.confirmed) return
      if (conf === 'unconfirmed' && r.confirmed) return
      next[r.key] = true
    })
    setSelected(next)
  }
  const groupCount = (role: string, conf: string) => selectableRows.filter(r =>
    (role === 'all' || r.role === role) &&
    (conf === 'any' || (conf === 'confirmed') === r.confirmed)
  ).length
  const clearSelection = () => setSelected({})

  const showBccToast = (msg: string) => { setBccToast(msg); setTimeout(() => setBccToast(''), 1800) }
  const copyBcc = async () => {
    if (!selectedEmails.length) return
    // Semicolons, not commas: Outlook splits pasted recipients on ';' and
    // only treats ',' as a separator when its "Commas can be used to
    // separate multiple message recipients" option is on, so a comma list
    // pasted into BCC read as one long address (Sean, 2026-09-29). Gmail
    // splits on either.
    const list = selectedEmails.join('; ')
    try {
      await navigator.clipboard.writeText(list)
      showBccToast(`Copied ${selectedEmails.length} email${selectedEmails.length === 1 ? '' : 's'}`)
    } catch {
      window.prompt('Copy this BCC list:', list)
    }
  }
  const openMailto = () => {
    if (!selectedEmails.length) return
    window.location.href = `mailto:?bcc=${encodeURIComponent(selectedEmails.join(','))}`
  }

  return (
    <div className="wcm-content-section">
      <style>{`
        .roster-untracked { margin: 18px 0 4px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 12px 16px; }
        .roster-untracked summary { cursor: pointer; font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #6b7280; }
        .roster-untracked-note { font-size: 13px; color: #6b7280; margin: 10px 0 8px; }
        .roster-untracked ul { margin: 0; padding-left: 18px; font-size: 13px; color: #374151; line-height: 1.8; }
        .roster-select-group { font: inherit; font-size: 13px; font-weight: 600; color: #0e4e73; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 8px; background: #fff; cursor: pointer; max-width: 100%; }
        .wcm-member-subdept { font-size: 11.5px; color: #6b7280; margin-top: 1px; }
        .roster-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
        .roster-search { flex: 1; min-width: 220px; padding: 9px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-family: inherit; }
        .roster-count { font-size: 12px; color: #9ca3af; white-space: nowrap; }
        .roster-pending-card {
          background: #ffffff; border: 1px solid rgba(0,0,0,0.09); border-left: 3px solid #E8650A;
          border-radius: 8px; padding: 16px 18px; margin-bottom: 10px;
        }
        .roster-pending-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
        .roster-pending-dept { font-size: 14px; font-weight: 800; color: #1a1a1a; }
        .roster-pending-loc { font-size: 11px; color: rgba(26,26,26,0.45); font-weight: 600; }
        .roster-pending-detail { font-size: 12.5px; color: #374151; line-height: 1.7; }
        .roster-pending-actions { display: flex; gap: 8px; margin-top: 10px; }
        .roster-btn { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; border: none; }
        .roster-btn.approve { background: #16750C; color: #fff; }
        .roster-btn.reject { background: #fff; color: #9ca3af; border: 1.5px solid #e5e7eb; }
        .roster-btn.delete { background: #fff; color: #DC2626; border: 1.5px solid #FBCFE8; }
        .roster-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wcm-member-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05);
        }
        .wcm-member-row:last-child { border-bottom: none; }
        .wcm-member-info { min-width: 0; flex: 1 1 auto; }
        .wcm-member-name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
        .wcm-member-status { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
        .wcm-member-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
        .wcm-icon-btn {
          width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center;
          border: 1px solid #e5e7eb; background: #fff; border-radius: 6px; cursor: pointer;
          font-size: 12px; color: #6b7280; padding: 0;
        }
        .wcm-icon-btn:hover { border-color: #9ca3af; color: #1a1a1a; }
        .wcm-icon-btn.danger:hover { border-color: #FBCFE8; color: #DC2626; background: #FDF2F8; }
        .wcm-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .wcm-edit-form { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 6px 0; }
        .wcm-edit-form input {
          font: inherit; font-size: 12.5px; padding: 6px 8px; border: 1.5px solid #d1d5db; border-radius: 6px;
        }
        .wcm-edit-actions { display: flex; gap: 6px; margin-top: 2px; }
        .roster-pending-card.is-flagged { border-left-color: #DC2626; background: #FEF2F2; }
        .roster-flag-badge {
          display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.05em; color: #DC2626; background: rgba(220,38,38,0.08);
          border: 1px solid rgba(220,38,38,0.25); border-radius: 5px; padding: 3px 8px; margin-bottom: 8px;
        }
        .roster-flag-detail { font-size: 12.5px; color: #7F1D1D; line-height: 1.6; margin-bottom: 8px; }
        .roster-table-wrap { border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .roster-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .roster-table th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(26,26,26,0.45); background: #f9fafb; padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.08); }
        .roster-table td { padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.06); vertical-align: top; }
        .roster-table tr:last-child td { border-bottom: none; }
        .roster-dept-name { font-weight: 700; color: #1a1a1a; }
        .roster-loc { font-size: 11px; color: rgba(26,26,26,0.4); }
        .roster-empty-val { color: rgba(26,26,26,0.35); font-style: italic; }
        .roster-wcm-row { font-size: 12.5px; }
        .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 6px;
                font-size: 11px; font-weight: 800; letter-spacing: .2px; white-space: nowrap; border: 1px solid transparent; }
        .pill-confirmed { background: #ECFDF5; color: #065F46; border-color: #A7F3D0; }
        .pill-failed { background: #FDF2F8; color: #9D174D; border-color: #FBCFE8; cursor: pointer; }
        .pill-failed:hover { background: #FCE7F3; }
        .pill-pending { background: #FFFBEB; color: #92400E; border-color: #FDE68A; }
        .pill-none { background: #F3F4F6; color: #6B7280; border-color: #E5E7EB; }
        .pill-date { display: block; font-size: 10.5px; color: rgba(26,26,26,0.45); margin-top: 3px; font-weight: 600; }
        .lightbox-back { position: fixed; inset: 0; background: rgba(15,23,42,0.55); display: flex;
                         align-items: center; justify-content: center; padding: 20px; z-index: 200; }
        .lightbox { background: #fff; border-radius: 12px; max-width: 560px; width: 100%; max-height: 80vh;
                    overflow: auto; padding: 22px; box-shadow: 0 24px 60px rgba(0,0,0,0.3); }
        .lightbox h4 { margin: 0 0 4px; font-size: 16px; font-weight: 900; color: #9D174D; }
        .lb-sub { font-size: 12.5px; color: #6B7280; margin: 0 0 16px; }
        .lb-item { border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
        .lb-item.bad { border-color: #FBCFE8; background: #FDF2F8; }
        .lb-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: #6B7280; }
        .lb-val { font-size: 12.5px; color: #1a1a1a; margin-bottom: 8px; word-break: break-word; }
        .lb-err { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: #9D174D;
                  background: #fff; border: 1px solid #FBCFE8; border-radius: 6px; padding: 8px; white-space: pre-wrap; }
        .lb-close { margin-top: 6px; padding: 9px 16px; border-radius: 8px; border: none; background: #003087;
                    color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; font-family: inherit; }
        .roster-wcm-email { color: rgba(26,26,26,0.45); font-size: 11px; }
        .roster-link-box {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          background: #FFF7ED; border: 1px solid rgba(232,101,10,0.25); border-radius: 8px;
          padding: 14px 18px; margin: 16px 0 4px;
        }
        .roster-link-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #C55326; margin-bottom: 4px; }
        .roster-link-url { font-size: 13px; color: #1a1a1a; font-family: ui-monospace, monospace; word-break: break-all; }
        .roster-select-row { display: flex; align-items: center; gap: 6px; cursor: pointer; margin-top: 2px; }
        .roster-select-row input { margin: 0; cursor: pointer; }
        .roster-bcc-bar {
          position: sticky; bottom: 16px; margin-top: 20px; background: #fff; border: 1px solid #d1d5db;
          border-radius: 12px; box-shadow: 0 8px 24px -12px rgba(0,0,0,0.18); padding: 14px 18px;
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
        }
        .roster-bcc-count { font-weight: 700; font-size: 13.5px; }
        .roster-bcc-count strong { color: #0e4e73; }
        .roster-bcc-toast { font-size: 12px; color: #0e4e73; font-weight: 600; }
      `}</style>

      {!readOnly && (
        <div className="roster-link-box">
          <div>
            <div className="roster-link-label">Share this with Department Directors</div>
            <div className="roster-link-url">{ROSTER_SIGNUP_URL}</div>
          </div>
          <button
            className="roster-btn approve"
            onClick={() => {
              navigator.clipboard.writeText(ROSTER_SIGNUP_URL)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 2000)
            }}
          >
            {linkCopied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      )}

      {lastResult && (
        <div style={{
          fontSize: 12.5, color: '#065F46', background: '#ECFDF5',
          border: '1px solid #A7F3D0', borderRadius: 8,
          padding: '9px 12px', marginBottom: 14,
        }}>
          {lastResult}
        </div>
      )}

      {!readOnly && pending.length > 0 && (
        <>
          <h4 style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#C55326', margin: '20px 0 10px' }}>
            Pending Review ({pending.length})
          </h4>
          {pending.map(s => (
            <div key={s.id} className={`roster-pending-card${s.identity_flag ? ' is-flagged' : ''}`}>
              <div className="roster-pending-top">
                <div>
                  <div className="roster-pending-dept">{titleCase(s.department_name)}</div>
                  <div className="roster-pending-loc">Loc #{s.location_number ?? 'unmatched'} &middot; submitted {formatDate(s.submitted_at)}</div>
                </div>
              </div>
              {s.identity_flag && (
                <>
                  <div className="roster-flag-badge">&#9888; Could not verify the director</div>
                  <div className="roster-flag-detail">
                    {/* The server's own reason (2026-09-23): a flag used to always read
                        "Not the director on file", even when the only issue was that the
                        director had not signed in or no director was on file to check. */}
                    {s.raw_payload?.identity_reason && <>{s.raw_payload.identity_reason}<br /></>}
                    Submitted by {s.submitter_name ? <><strong>{s.submitter_name}</strong>{s.submitter_role ? ` (${s.submitter_role})` : ''} - </> : null}{s.submitter_email}<br />
                    Form listed director as &quot;{s.director_name}&quot;. Confirm before approving.
                  </div>
                </>
              )}
              <div className="roster-pending-detail">
                Request: <strong>{SUBMISSION_ACTION_LABEL[s.action ?? 'add']}</strong><br />
                Director: <strong>{s.director_name}</strong><br />
                WCM: <strong>{s.wcm_name}</strong>
                {s.wcm_personnel_number ? ` (#${s.wcm_personnel_number})` : ''}
                {s.wcm_email ? ` - ${s.wcm_email}` : ''}
                {!s.identity_flag && s.submitter_email && (
                  <><br />Submitted by: {s.submitter_email}</>
                )}
              </div>
              <div className="roster-pending-actions">
                <button className="roster-btn reject" disabled={acting === s.id} onClick={() => decide(s.id, 'reject')}>Reject</button>
                <button className="roster-btn approve" disabled={acting === s.id} onClick={() => decide(s.id, 'approve')}>Approve</button>
                <button className="roster-btn delete" disabled={acting === s.id} onClick={() => deleteSubmission(s.id)}>Delete</button>
              </div>
            </div>
          ))}
        </>
      )}

      <div className="roster-toolbar" style={{ marginTop: !readOnly && pending.length > 0 ? 24 : 4 }}>
        <input
          className="roster-search"
          placeholder="Search departments, directors, or WCMs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="roster-count">{loading ? 'Loading...' : `${filteredRoster.length} of ${trackedRoster.length} departments`}</span>
        <select
          className="roster-select-group"
          value=""
          onChange={e => { if (e.target.value) selectGroup(e.target.value) }}
          disabled={selectableRows.length === 0}
          aria-label="Add a group of emails to the BCC list"
        >
          <option value="">Select emails...</option>
          <option value="all:any">Everyone ({groupCount('all', 'any')})</option>
          <optgroup label="Directors">
            <option value="dir:any">All directors ({groupCount('dir', 'any')})</option>
            <option value="dir:confirmed">Confirmed directors ({groupCount('dir', 'confirmed')})</option>
            <option value="dir:unconfirmed">Unconfirmed directors ({groupCount('dir', 'unconfirmed')})</option>
          </optgroup>
          <optgroup label="Web Content Managers">
            <option value="wcm:any">All WCMs ({groupCount('wcm', 'any')})</option>
            <option value="wcm:confirmed">Confirmed WCMs ({groupCount('wcm', 'confirmed')})</option>
            <option value="wcm:unconfirmed">Unconfirmed WCMs ({groupCount('wcm', 'unconfirmed')})</option>
          </optgroup>
        </select>
        <button className="roster-btn reject" onClick={clearSelection} disabled={selectedEmails.length === 0}>Clear selection</button>
      </div>

      {failureDetail && (
        <div className="lightbox-back" onClick={() => setFailureDetail(null)}>
          <div className="lightbox" onClick={e => e.stopPropagation()}>
            <h4>Delivery failed</h4>
            <p className="lb-sub">
              {failureDetail.wcm_name} - the approval itself went through and the roster is updated.
              These are the notification emails that did not go out.
            </p>
            {(failureDetail.delivery?.detail ?? []).map((d, i) => (
              <div key={i} className={`lb-item${d.status === 'failed' ? ' bad' : ''}`}>
                <div className="lb-label">To</div>
                <div className="lb-val">{d.to}</div>
                <div className="lb-label">Subject</div>
                <div className="lb-val">{d.subject}</div>
                <div className="lb-label">Result</div>
                <div className="lb-val">
                  {d.status === 'sent' ? 'Accepted by the mail provider' : d.status}
                  {d.at ? ` - ${formatDate(d.at)}` : ''}
                </div>
                {d.error && (
                  <>
                    <div className="lb-label">Why it failed</div>
                    <div className="lb-err">{d.error}</div>
                  </>
                )}
              </div>
            ))}
            <p className="lb-sub" style={{ marginTop: 14, marginBottom: 10 }}>
              Nothing is lost. Every message is stored in full before sending, so these can be
              re-sent once the mail provider is working again.
            </p>
            <button className="lb-close" onClick={() => setFailureDetail(null)}>Close</button>
          </div>
        </div>
      )}

      {/* Scrolls sideways inside its own box on phones rather than stretching
          the page (the table needs ~760px); a deliberate scroll strip per
          canon-mobile-fit-check. */}
      <div className="roster-table-wrap" data-scroll-strip>
        <table className="roster-table">
          <thead>
            <tr>
              <th>Department</th>
              <th>Director</th>
              <th>Web Content Manager(s)</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Loading roster...</td></tr>
            ) : filteredRoster.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>No departments match that search.</td></tr>
            ) : filteredRoster.map(r => (
              <tr key={r.id}>
                <td>
                  <div className="roster-dept-name">{titleCase(r.department_name)}</div>
                  <div className="roster-loc">Loc #{r.location_number}</div>
                </td>
                <td>
                  {r.director_name ? (
                    <>
                      <div>{r.director_name}</div>
                      {r.director_email && (
                        <label className="roster-select-row">
                          <input type="checkbox" checked={!!selected[`dir:${r.id}`]} onChange={() => toggleSelect(`dir:${r.id}`)} />
                          <span className="roster-wcm-email">{r.director_email}</span>
                        </label>
                      )}
                    </>
                  ) : <span className="roster-empty-val">Not on file</span>}
                </td>
                <td>
                  {r.wcms.length === 0 ? (
                    <span className="roster-empty-val">Not assigned</span>
                  ) : r.wcms.map(w => {
                    if (editingId === w.id) {
                      return (
                        <div key={w.id} className="wcm-edit-form">
                          <input
                            value={editDraft.wcm_name}
                            onChange={e => setEditDraft(d => ({ ...d, wcm_name: e.target.value }))}
                            placeholder="Name"
                          />
                          <input
                            value={editDraft.wcm_email}
                            onChange={e => setEditDraft(d => ({ ...d, wcm_email: e.target.value }))}
                            placeholder="Email"
                          />
                          <input
                            value={editDraft.sub_department}
                            onChange={e => setEditDraft(d => ({ ...d, sub_department: e.target.value }))}
                            placeholder="Sub-department (blank = whole department)"
                          />
                          <input
                            value={editDraft.wcm_personnel_number}
                            onChange={e => setEditDraft(d => ({ ...d, wcm_personnel_number: e.target.value }))}
                            placeholder="Personnel #"
                          />
                          <div className="wcm-edit-actions">
                            <button className="roster-btn approve" disabled={deleting === w.id} onClick={() => saveEdit(w.id)}>Save</button>
                            <button className="roster-btn reject" disabled={deleting === w.id} onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </div>
                      )
                    }

                    const state = w.delivery?.state ?? 'not_sent'
                    const when = w.delivery?.at ?? w.approved_at
                    let statusEl: React.ReactNode
                    // Read-only viewers (WCMs, non-admin district users) get
                    // no delivery data at all - the GET's read-only branch
                    // never computes it, on purpose, since the outbound email
                    // log is admin detail. So every row fell through to 'No
                    // email sent', even approved ones sitting next to
                    // "Approved <date>" (Sean, Hot Lab 2026-09-22: "it's
                    // showing approved but the pill is still showing no
                    // e-mail sent"). For them the question is membership,
                    // not mail delivery: approved means Confirmed. Rows an
                    // admin added by hand (no approved_at) are still on the
                    // official roster, so they read "On roster", never a
                    // mail status. The admin view below is unchanged.
                    if (readOnly) {
                      statusEl = w.approved_at ? (
                        <>
                          <span className="pill pill-confirmed">● Confirmed</span>
                          <span className="pill-date">Approved {formatDate(w.approved_at)}</span>
                        </>
                      ) : (
                        <span className="pill pill-none">On roster</span>
                      )
                    } else if (state === 'failed') {
                      statusEl = (
                        <>
                          <button className="pill pill-failed" onClick={() => setFailureDetail(w)} title="See why this failed">● Failed</button>
                          {when && <span className="pill-date">{formatDate(when)}</span>}
                        </>
                      )
                    } else if (state === 'confirmed') {
                      statusEl = (
                        <>
                          <span className="pill pill-confirmed">● Confirmed</span>
                          {when && <span className="pill-date">{formatDate(when)}</span>}
                        </>
                      )
                    } else if (state === 'pending') {
                      statusEl = (
                        <>
                          <span className="pill pill-pending">● Sending</span>
                          {when && <span className="pill-date">{formatDate(when)}</span>}
                        </>
                      )
                    } else {
                      statusEl = (
                        <>
                          <span className="pill pill-none">No email sent</span>
                          <span className="pill-date">{w.approved_at ? `Approved ${formatDate(w.approved_at)}` : 'Added manually'}</span>
                        </>
                      )
                    }

                    return (
                      <div key={w.id} className="wcm-member-row">
                        <div className="wcm-member-info">
                          <div className="wcm-member-name">{w.wcm_name}</div>
                          {w.sub_department && <div className="wcm-member-subdept">{w.sub_department}</div>}
                          {w.wcm_email && (
                            <label className="roster-select-row">
                              <input type="checkbox" checked={!!selected[`wcm:${w.id}`]} onChange={() => toggleSelect(`wcm:${w.id}`)} />
                              <span className="roster-wcm-email">{w.wcm_email}</span>
                            </label>
                          )}
                        </div>
                        <div className="wcm-member-status">{statusEl}</div>
                        {!readOnly && (
                          <div className="wcm-member-actions">
                            <button className="wcm-icon-btn" title="Edit" onClick={() => startEdit(w)}>✎</button>
                            <button
                              className="wcm-icon-btn danger"
                              title="Remove"
                              disabled={deleting === w.id}
                              onClick={() => deleteMember(w.id, w.wcm_name)}
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </td>
                <td className="roster-loc">{r.updated_at ? formatDate(r.updated_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {untrackedRoster.length > 0 && (
        <details className="roster-untracked">
          <summary>No website, not tracked ({untrackedRoster.length})</summary>
          <p className="roster-untracked-note">These departments have no website, so they need no WCM or director outreach. They are left out of the counts and email lists above.</p>
          <ul>
            {untrackedRoster.map(r => (
              <li key={r.id}>
                <strong>{titleCase(r.department_name)}</strong>
                {r.director_name && <span> - {r.director_name}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="roster-bcc-bar">
        <div className="roster-bcc-count"><strong>{selectedEmails.length}</strong> selected</div>
        {bccToast && <span className="roster-bcc-toast">{bccToast}</span>}
        <div style={{ flex: 1 }} />
        <button className="roster-btn reject" disabled={!selectedEmails.length} onClick={openMailto}>Open in mail app</button>
        <button className="roster-btn approve" disabled={!selectedEmails.length} onClick={copyBcc}>Copy BCC list</button>
      </div>
    </div>
  )
}

/* ─── WCM COMMUNITY HUB ───────────────────────────────── */
// Rebuilt 2026-09-30 (Sean, playbook wcm-community-hub). The previous portal
// was hardcoded JSX where every "Open", "Use Template" and training button
// had no destination. Cards now come from bcps_wcm_hub_items, where the
// District Web Team adds, reorders or hides an item without a code change;
// RLS only returns rows with state 'live', and a row goes live only when its
// link opens for a Department WCM. Tabs follow the certification path, and
// a tab with no live items is not shown rather than shown empty.
//
// The retired Schools/Departments picker and School Portal (Sean,
// 2026-09-18: school WCMs are out of scope) were removed here; both are in
// git history if school support comes back.

type HubTab = 'start' | 'build' | 'maintain' | 'compliance' | 'learn'

interface HubItem {
  id: string
  tab: HubTab
  title: string
  description: string
  href: string
  link_label: string
  requires: 'certified' | null
  sort_order: number
}

const HUB_TABS: { id: HubTab; label: string; intro: string }[] = [
  { id: 'start', label: 'Start Here', intro: 'Your certification, your roster status, and the playbook that keeps you current.' },
  { id: 'build', label: 'Build Kit', intro: 'Reusable pieces so you are not building from scratch.' },
  { id: 'maintain', label: 'Maintain', intro: 'Keep your department pages accurate once they are live.' },
  { id: 'compliance', label: 'Compliance', intro: 'Accessibility and District policy requirements for department pages.' },
  { id: 'learn', label: 'Learn', intro: 'Hot Labs, recordings, and a direct line to the District Web Team.' },
]

// Department WCM certification deadline (Oct 30, 2026; Sept 30 applies to
// schools only), confirmed at the Sept 29 Hot Lab.
const DEPT_CERT_DEADLINE = 'October 30, 2026'

type CertStatus =
  | { state: 'loading' }
  | { state: 'certified'; issuedAt: string }
  | { state: 'in_progress'; pct: number }
  | { state: 'not_started' }

function HubCardAction({ item }: { item: HubItem }) {
  if (item.href === 'action:feedback') {
    return (
      <button type="button" className="wcm-hub2-card-btn" onClick={() => window.dispatchEvent(new Event('bcps:open-feedback'))}>
        {item.link_label}
      </button>
    )
  }
  if (/^https?:\/\//.test(item.href)) {
    return (
      <a className="wcm-hub2-card-btn" href={item.href} target="_blank" rel="noopener noreferrer">
        {item.link_label}<span className="sr-only"> (opens in a new tab)</span>
      </a>
    )
  }
  return <a className="wcm-hub2-card-btn" href={item.href}>{item.link_label}</a>
}

function CertStatusPanel({ status }: { status: CertStatus }) {
  if (status.state === 'loading') {
    return <div className="wcm-hub2-status"><div className="wcm-hub2-status-label">Certification</div><div className="wcm-hub2-status-value">Checking...</div></div>
  }
  if (status.state === 'certified') {
    const issued = new Date(status.issuedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    return (
      <div className="wcm-hub2-status certified">
        <div className="wcm-hub2-status-label">Certification</div>
        <div className="wcm-hub2-status-value">Certified</div>
        <div className="wcm-hub2-status-sub">Issued {issued}</div>
        <div className="wcm-hub2-status-actions">
          <a className="wcm-hub2-status-btn" href="/certification/departments/complete">View certificate</a>
          <a className="wcm-hub2-status-link" href="/briefs/bcps-wcm-cert-complete-2026-27">What&apos;s next</a>
        </div>
      </div>
    )
  }
  const inProgress = status.state === 'in_progress'
  return (
    <div className="wcm-hub2-status">
      <div className="wcm-hub2-status-label">Certification</div>
      <div className="wcm-hub2-status-value">{inProgress ? `In progress: ${status.pct}%` : 'Not started'}</div>
      {inProgress && (
        <div className="wcm-hub2-meter" role="progressbar" aria-valuenow={status.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Certification progress">
          <div style={{ width: `${status.pct}%` }} />
        </div>
      )}
      <div className="wcm-hub2-status-sub">Department deadline: {DEPT_CERT_DEADLINE}</div>
      <div className="wcm-hub2-status-actions">
        <a className="wcm-hub2-status-btn" href={inProgress ? '/certification/departments/dashboard' : '/certification/departments'}>
          {inProgress ? 'Resume certification' : 'Start certification'}
        </a>
      </div>
    </div>
  )
}

export function WcmCommunityHub() {
  const [items, setItems] = useState<HubItem[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [cert, setCert] = useState<CertStatus>({ state: 'loading' })
  const [activeTab, setActiveTab] = useState<HubTab>('start')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('bcps_wcm_hub_items')
        .select('id,tab,title,description,href,link_label,requires,sort_order')
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error) { setLoadError(true); setItems([]) } else { setItems((data || []) as HubItem[]) }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) { if (!cancelled) setCert({ state: 'not_started' }); return }
      const [certRes, progRes] = await Promise.all([
        supabase.from('wcm_certifications').select('issued_at').eq('user_id', user.id).eq('course_id', COURSE_ID).maybeSingle(),
        supabase.from('wcm_cert_progress').select('module_id,page_id,completed').eq('user_id', user.id).eq('course_id', COURSE_ID),
      ])
      if (cancelled) return
      if (certRes.data?.issued_at) { setCert({ state: 'certified', issuedAt: certRes.data.issued_at }); return }
      const done = new Set((progRes.data || []).filter((p) => p.completed).map((p) => `${p.module_id}::${p.page_id}`))
      const total = MODULES.reduce((sum, m) => sum + m.pages.length, 0)
      setCert(done.size > 0 && total > 0 ? { state: 'in_progress', pct: Math.min(99, Math.round((done.size / total) * 100)) } : { state: 'not_started' })
    }
    load()
    return () => { cancelled = true }
  }, [])

  const certified = cert.state === 'certified'
  const visible = useMemo(
    () => (items || []).filter((i) => i.requires !== 'certified' || certified),
    [items, certified]
  )
  const tabs = HUB_TABS.filter((t) => visible.some((i) => i.tab === t.id))
  const current = tabs.find((t) => t.id === activeTab) || tabs[0]

  return (
    <div className="wcm-hub2">
      <div className="wcm-hub2-hero">
        <div className="wcm-hub2-hero-text">
          <div className="wcm-eyebrow">WCM Community Hub</div>
          <h1 className="wcm-hub2-title">Everything you need as a Department WCM</h1>
          <p>Start with your certification, then use the Build Kit, Maintain and Learn tabs as you work on your department pages. Every card opens a real page or tool; if something is missing, tell the District Web Team.</p>
        </div>
        <CertStatusPanel status={cert} />
      </div>

      {items === null ? (
        <div className="wcm-hub2-empty">Loading the hub...</div>
      ) : tabs.length === 0 ? (
        <div className="wcm-hub2-empty">
          {loadError ? 'The hub could not load right now. ' : 'Nothing is posted yet. '}
          In the meantime, the <a href="/playbooks/wcm-department">Department WCM Playbook</a> has everything current.
        </div>
      ) : (
        <>
          <div className="wcm-hub2-tabs" role="tablist" aria-label="WCM Hub sections" data-scroll-strip>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`wcm-hub-tab-${t.id}`}
                aria-selected={current?.id === t.id}
                aria-controls="wcm-hub-panel"
                className={`wcm-hub2-tab${current?.id === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {current && (
            <div id="wcm-hub-panel" role="tabpanel" aria-labelledby={`wcm-hub-tab-${current.id}`}>
              <p className="wcm-hub2-intro">{current.intro}</p>
              <div className="wcm-hub2-grid">
                {visible.filter((i) => i.tab === current.id).map((item) => (
                  <div key={item.id} className="wcm-hub2-card">
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <HubCardAction item={item} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ─── STANDALONE WCM ROSTER PAGE ──────────────────────── */
// Pulled out of the Department Portal (Sean, 2026-09-18: "it's not part of
// the resources, so it doesn't make sense" to live in that tab list). Its
// own sidebar entry under District Web Team, open to every district user
// (2026-09-18) - browsing the directory and building a BCC list is
// read-only; the signup-link box, the approval queue, and editing/deleting
// entries stay admin-only inside DepartmentRosterSection via its own
// !readOnly check.
export function WcmRosterStandalonePage() {
  return (
    <div style={{ padding: 32, background: '#ffffff' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--blue)', marginBottom: 8 }}>
          District Web Team
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px' }}>WCM Roster</h1>
        <p style={{ fontSize: 14, color: 'rgba(26,26,26,0.55)', margin: 0, lineHeight: 1.6, maxWidth: 780 }}>
          Live directory of every district department, its Director, and assigned Web Content Manager(s). Search below,
          check off any names, and copy or email a BCC list from their addresses on file.
        </p>
      </div>
      <DepartmentRosterSection />
    </div>
  )
}

/* ─── ROOT ────────────────────────────────────────────── */
export default function WCMPage() {
  return <WcmCommunityHub />
}
