'use client'

// School Profile - built 2026-09-03 per Sean: a per-school page, modeled on
// the department profile pattern, collecting every automated module
// (banners, ADA, and whatever comes after) into one place per school.
// Step one (2026-09-03) shipped Banners only. Step two (2026-09-04) wires up
// ADA: bcps_audit_results now carries school_location_nbr, backfilled for
// the one existing school-portal account and stamped on every new scan going
// forward, so it joins in by the same loc_no key Banners already uses. ADA
// history is read-only here (archive/test-flag controls are a banner-only
// concept for now - ADA scans aren't submissions awaiting review).
//
// Access: District Web Team only (bcps_banner_admins admin/manager), same
// gate as the Review Queue - enforced server-side in
// /api/banner/school-profile, this component just hides itself if the caller
// isn't cleared.
//
// Retention: nothing is ever hard-deleted here. "Delete" archives a row
// (archived_at) and hides it from the default list; it can be brought back.
// A row marked as a test run cannot be archived at all - unmark it as a
// test first. This is a deliberate policy, not a bug: it keeps a WCM or
// reviewer from being able to make a test submission quietly disappear from
// the record.

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type SubmissionStatus = 'pending' | 'approved' | 'rejected'

interface ProfileSubmission {
  id: string
  type: 'upload' | 'removal'
  status: SubmissionStatus
  file_name: string | null
  file_type: 'image' | 'video' | null
  banner_title: string | null
  wcm_email: string | null
  removal_description: string | null
  rejection_reason: string | null
  content_scan: { no_overlays_pass?: boolean; nav_clearance_pass?: boolean; nav_clearance_note?: string; reasons?: string[]; skipped?: boolean } | null
  submitted_at: string
  archived_at: string | null
  is_test: boolean
  signed_url: string | null
}

interface School {
  loc_no: string
  school_name: string
  school_level: string | null
  region: string | null
}

interface AdaScan {
  id: string
  page_url: string
  ada_score: number | null
  wave_score: number | null
  lighthouse_a11y_score: number | null
  status: string
  ada_violations_critical: number
  ada_violations_serious: number
  ada_violations_moderate: number
  ada_violations_minor: number
  audited_at: string
}

// Same status palette as /school-portal's ADA tile (STATUS_CONFIG there) -
// kept in sync deliberately so a score reads the same color everywhere.
const ADA_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pass:       { label: 'Passing',         color: '#059669', bg: '#ECFDF5' },
  needs_work: { label: 'Needs Work',      color: '#D97706', bg: '#FFFBEB' },
  critical:   { label: 'Critical Issues', color: '#DC2626', bg: '#FEF2F2' },
  unknown:    { label: 'Unscored',        color: '#6B7280', bg: '#F3F4F6' },
}

function statusBadge(status: SubmissionStatus) {
  const map: Record<SubmissionStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: '#fdf3e0', fg: '#8a5a00', label: 'Pending' },
    approved: { bg: '#e6f4ea', fg: '#1e6b3a', label: 'Approved' },
    rejected: { bg: '#fbe9e7', fg: '#a13a2f', label: 'Rejected' },
  }
  const s = map[status]
  return (
    <span style={{ background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999 }}>
      {s.label}
    </span>
  )
}

function pill(bg: string, fg: string, label: string) {
  return (
    <span style={{ background: bg, color: fg, fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999 }}>
      {label}
    </span>
  )
}

export default function SchoolProfile() {
  const [myRole, setMyRole] = useState<'admin' | 'manager' | null>(null)
  const [roleLoading, setRoleLoading] = useState(true)

  const [schools, setSchools] = useState<Array<{ loc_no: string; school_name: string }>>([])
  const [schoolsLoading, setSchoolsLoading] = useState(true)
  const [selectedLocNo, setSelectedLocNo] = useState('')

  const [school, setSchool] = useState<School | null>(null)
  const [submissions, setSubmissions] = useState<ProfileSubmission[]>([])
  const [adaScans, setAdaScans] = useState<AdaScan[]>([])
  const [summary, setSummary] = useState<{ total: number; pending: number; approved: number; rejected: number; test_runs: number } | null>(null)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function authedFetch(path: string, init?: RequestInit) {
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as any) }
    if (token) headers.Authorization = `Bearer ${token}`
    return fetch(path, { ...init, headers })
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/banner/admins')
        const data = await res.json()
        setMyRole(data.my_role || null)
      } catch {
        setMyRole(null)
      } finally {
        setRoleLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/banner/schools')
        const data = await res.json()
        setSchools(data.schools || [])
      } catch {
        // best-effort
      } finally {
        setSchoolsLoading(false)
      }
    })()
  }, [])

  const loadProfile = useCallback(async (locNo: string, withArchived: boolean) => {
    if (!locNo) return
    setLoading(true)
    setError(null)
    try {
      const res = await authedFetch(`/api/banner/school-profile?loc_no=${encodeURIComponent(locNo)}${withArchived ? '&include_archived=1' : ''}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not load this school.'); setSchool(null); setSubmissions([]); setAdaScans([]); setSummary(null); return }
      setSchool(data.school)
      setSubmissions(data.submissions || [])
      setAdaScans(data.ada_scans || [])
      setSummary(data.summary || null)
    } catch {
      setError('Could not load this school.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedLocNo) loadProfile(selectedLocNo, includeArchived)
  }, [selectedLocNo, includeArchived, loadProfile])

  async function runAction(id: string, action: 'archive' | 'unarchive' | 'mark_test' | 'unmark_test') {
    setBusyId(id)
    setNotice(null)
    try {
      const res = await authedFetch('/api/banner/school-profile', { method: 'POST', body: JSON.stringify({ id, action }) })
      const data = await res.json()
      if (!res.ok) { setNotice(data.error || 'That action failed.'); return }
      await loadProfile(selectedLocNo, includeArchived)
    } catch {
      setNotice('That action failed.')
    } finally {
      setBusyId(null)
    }
  }

  if (roleLoading) return <div style={{ padding: 24, fontSize: 13, color: '#6b7280' }}>Checking access...</div>

  if (myRole !== 'admin' && myRole !== 'manager') {
    return (
      <div style={{ padding: 24, fontSize: 13, color: '#a13a2f', background: '#fbe9e7', borderRadius: 8 }}>
        School Profiles is limited to the District Web Team. If you believe you should have access, contact your Banner Submissions administrator.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>School</label>
        <select
          value={selectedLocNo}
          onChange={e => setSelectedLocNo(e.target.value)}
          disabled={schoolsLoading}
          style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', minWidth: 280 }}
        >
          <option value="">{schoolsLoading ? 'Loading schools...' : 'Select a school...'}</option>
          {schools.map(s => <option key={s.loc_no} value={s.loc_no}>{s.school_name}</option>)}
        </select>
        <label style={{ fontSize: 12.5, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
          <input type="checkbox" checked={includeArchived} onChange={e => setIncludeArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      {!selectedLocNo && (
        <div style={{ fontSize: 13, color: '#6b7280' }}>Pick a school above to see its profile.</div>
      )}

      {error && <div style={{ fontSize: 13, color: '#a13a2f', background: '#fbe9e7', padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
      {notice && <div style={{ fontSize: 12.5, color: '#8a5a00', background: '#fdf3e0', padding: '8px 12px', borderRadius: 8 }}>{notice}</div>}

      {selectedLocNo && !error && school && (
        <>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{school.school_name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              {[school.school_level, school.region, `Loc# ${school.loc_no}`].filter(Boolean).join(' · ')}
            </div>
            {summary && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12.5, color: '#374151' }}>
                <span>{summary.total} active</span>
                <span>{summary.pending} pending</span>
                <span>{summary.approved} approved</span>
                <span>{summary.rejected} rejected</span>
                {summary.test_runs > 0 && <span style={{ color: '#8a5a00' }}>{summary.test_runs} test run{summary.test_runs === 1 ? '' : 's'}</span>}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#374151', marginBottom: 10 }}>
              Banners
            </div>
            {loading ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>Loading...</div>
            ) : submissions.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>No banner activity on record for this school{includeArchived ? '' : ' (not counting archived records)'}.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {submissions.map(s => (
                  <div key={s.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px', opacity: s.archived_at ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                          {s.type === 'upload' ? (s.banner_title || s.file_name || 'Untitled banner') : `Removal request${s.removal_description ? `: ${s.removal_description}` : ''}`}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>
                          {s.wcm_email || 'unknown submitter'} &middot; {new Date(s.submitted_at).toLocaleString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {statusBadge(s.status)}
                        {s.is_test && pill('#e0edff', '#1d4ed8', 'Test run')}
                        {s.archived_at && pill('#f3f4f6', '#6b7280', 'Archived')}
                      </div>
                    </div>

                    {s.type === 'upload' && s.content_scan && (
                      <div style={{ marginTop: 8, fontSize: 11.5, color: s.content_scan.reasons?.length ? '#a13a2f' : '#1e6b3a' }}>
                        {s.content_scan.skipped
                          ? 'Automated content scan unavailable for this submission - flagged for manual review.'
                          : s.content_scan.reasons?.length
                            ? `Automated scan flagged: ${s.content_scan.reasons.join('; ')}`
                            : 'Automated content scan passed.'}
                        {s.content_scan.nav_clearance_note && (
                          <div style={{ color: '#8a5a00', marginTop: 2 }}>{s.content_scan.nav_clearance_note}</div>
                        )}
                      </div>
                    )}

                    {s.rejection_reason && (
                      <div style={{ marginTop: 6, fontSize: 11.5, color: '#a13a2f' }}>Rejection reason: {s.rejection_reason}</div>
                    )}

                    {s.signed_url && (
                      <div style={{ marginTop: 8 }}>
                        {s.file_type === 'video'
                          ? <video src={s.signed_url} controls style={{ maxWidth: 280, borderRadius: 6 }} />
                          : <img src={s.signed_url} alt={s.banner_title || 'Banner submission'} style={{ maxWidth: 280, borderRadius: 6 }} />}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {s.archived_at ? (
                        <button onClick={() => runAction(s.id, 'unarchive')} disabled={busyId === s.id}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                          Restore
                        </button>
                      ) : (
                        <button onClick={() => runAction(s.id, 'archive')} disabled={busyId === s.id || s.is_test}
                          title={s.is_test ? 'Test runs cannot be archived - unmark it as a test first.' : undefined}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: s.is_test ? '#f3f4f6' : '#fff', color: s.is_test ? '#9ca3af' : '#111827', cursor: s.is_test ? 'not-allowed' : 'pointer' }}>
                          Archive
                        </button>
                      )}
                      {s.is_test ? (
                        <button onClick={() => runAction(s.id, 'unmark_test')} disabled={busyId === s.id}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                          Unmark as test
                        </button>
                      ) : (
                        <button onClick={() => runAction(s.id, 'mark_test')} disabled={busyId === s.id}
                          style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}>
                          Mark as test
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', color: '#374151', marginBottom: 10 }}>
              ADA
            </div>
            {adaScans.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                No ADA scan on record for this school yet. This school needs a school-portal account (Schools admin)
                and a scan run from there before history appears here.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {adaScans.map(scan => {
                  const s = ADA_STATUS[scan.status] || ADA_STATUS.unknown
                  const totalViolations = scan.ada_violations_critical + scan.ada_violations_serious + scan.ada_violations_moderate + scan.ada_violations_minor
                  return (
                    <div key={scan.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, wordBreak: 'break-all' }}>{scan.page_url}</div>
                          <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{new Date(scan.audited_at).toLocaleString()}</div>
                        </div>
                        <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                          {s.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#374151', flexWrap: 'wrap' }}>
                        {scan.ada_score != null && <span>axe-core: {scan.ada_score}</span>}
                        {scan.wave_score != null && <span>WAVE: {scan.wave_score}</span>}
                        {scan.lighthouse_a11y_score != null && <span>Lighthouse: {scan.lighthouse_a11y_score}</span>}
                        <span>{totalViolations} violation{totalViolations === 1 ? '' : 's'}
                          {scan.ada_violations_critical > 0 && ` (${scan.ada_violations_critical} critical)`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
