'use client'

// Tracker for the Public School Impact Application widget (public embed at
// /embeds/school-impact-application.html), opened from its Edit button in the
// Widgets hub. Intergovernmental Coordination staff (Glennika D. Gordon, 2026-11-02) see
// every application, check it for completeness, and move it through
// New -> Needs info -> Accepted (30-business-day clock starts, applicant
// emailed) -> Letter sent (after the SCAD letter goes out from their own
// email, optionally attached here). Sortable, filterable, CSV export.
// API: src/app/api/bcps/school-impact-applications.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import {
  STATUS_LABEL, SLOTS, APPLICANT_SLOTS, SIA_BUCKET, SIA_REMIND_WITHIN, businessDaysBetween,
  type Status, type Slot, type Attachments,
} from '@/lib/school-impact'

interface App {
  id: string; reference: string; status: Status; submitted_at: string
  project_name: string; application_types: string[]; applicant_name: string; applicant_email: string
  applicant_phone: string | null; jurisdiction: string | null; payment_order_no: string | null
  data: Record<string, any>; attachments: Attachments
  school_board_number: string | null; staff_notes: string | null; needs_info_note: string | null
  accepted_at: string | null; due_date: string | null; letter_sent_at: string | null
  history: { at: string; status: string; by: string }[]
}

type Filter = 'open' | 'new' | 'needs_info' | 'accepted' | 'due_soon' | 'overdue' | 'letter_sent' | 'all'
const FILTERS: [Filter, string][] = [
  ['open', 'Open'], ['new', 'New'], ['needs_info', 'Needs info'], ['accepted', 'In review'],
  ['due_soon', 'Due soon'], ['overdue', 'Overdue'], ['letter_sent', 'Letter sent'], ['all', 'All'],
]
type SortKey = 'submitted_desc' | 'submitted_asc' | 'due_asc' | 'reference'

const BLUE = '#1672A7'
const STATUS_COLOR: Record<Status, [string, string]> = {
  new: ['#1e40af', '#dbeafe'], needs_info: ['#9a3412', '#ffedd5'], accepted: ['#166534', '#dcfce7'], letter_sent: ['#374151', '#e5e7eb'],
}
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 6 } as React.CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', cursor: 'pointer' } as React.CSSProperties,
  td: { padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' } as React.CSSProperties,
}

const fmt = (iso: string | null) => iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : ''
const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }

export default function SchoolImpactApplicationsPage() {
  const supabase = createClient()
  const [apps, setApps] = useState<App[]>([])
  const [today, setToday] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [sort, setSort] = useState<SortKey>('submitted_desc')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])
  const api = useCallback(async (method: string, body?: unknown) => {
    const r = await fetch('/api/bcps/school-impact-applications', {
      method, headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'Request failed')
    return j
  }, [token])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try { const j = await api('GET'); setApps(j.applications); setToday(j.today) } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }, [api])
  useEffect(() => { load() }, [load])

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }
  const replace = (a: App) => setApps(prev => prev.map(x => x.id === a.id ? a : x))
  const left = (a: App) => (a.due_date && today ? businessDaysBetween(today, a.due_date) : null)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { open: 0, new: 0, needs_info: 0, accepted: 0, due_soon: 0, overdue: 0, letter_sent: 0, all: apps.length }
    for (const a of apps) {
      c[a.status]++
      if (a.status !== 'letter_sent') c.open++
      const l = left(a)
      if (a.status === 'accepted' && l !== null) { if (l < 0) c.overdue++; else if (l <= SIA_REMIND_WITHIN) c.due_soon++ }
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, today])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = apps.filter(a => {
      const l = left(a)
      if (filter === 'open' && a.status === 'letter_sent') return false
      if (['new', 'needs_info', 'accepted', 'letter_sent'].includes(filter) && a.status !== filter) return false
      if (filter === 'due_soon' && !(a.status === 'accepted' && l !== null && l >= 0 && l <= SIA_REMIND_WITHIN)) return false
      if (filter === 'overdue' && !(a.status === 'accepted' && l !== null && l < 0)) return false
      if (!q) return true
      return [a.reference, a.project_name, a.applicant_name, a.applicant_email, a.jurisdiction, a.payment_order_no, a.school_board_number, a.data?.location?.folio]
        .some(v => String(v ?? '').toLowerCase().includes(q))
    })
    const by: Record<SortKey, (x: App, y: App) => number> = {
      submitted_desc: (x, y) => y.submitted_at.localeCompare(x.submitted_at),
      submitted_asc: (x, y) => x.submitted_at.localeCompare(y.submitted_at),
      due_asc: (x, y) => (x.due_date ?? '9999').localeCompare(y.due_date ?? '9999'),
      reference: (x, y) => x.reference.localeCompare(y.reference),
    }
    return rows.sort(by[sort])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, filter, sort, query, today])

  const exportCsv = () => {
    const head = ['Reference', 'Status', 'Submitted', 'Accepted', 'Due date', 'Letter sent', 'Project', 'Application type', 'Jurisdiction', 'Folio', 'Applicant', 'Email', 'Phone', 'Owner', 'Payment', 'Fee', 'School Board Number', 'Staff notes']
    const lines = shown.map(a => [a.reference, STATUS_LABEL[a.status], fmt(a.submitted_at), fmt(a.accepted_at), fmt(a.due_date), fmt(a.letter_sent_at), a.project_name,
      a.application_types.join('; '), a.jurisdiction, a.data?.location?.folio, a.applicant_name, a.applicant_email, a.applicant_phone, a.data?.owner?.name,
      a.payment_order_no, a.data?.payment?.fee_amount, a.school_board_number, a.staff_notes].map(csvCell).join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `school-impact-applications-${today || 'export'}.csv`; link.click()
    URL.revokeObjectURL(url)
  }

  const open = apps.find(a => a.id === openId) || null

  if (loading) return <div style={{ padding: 16 }}>Loading applications...</div>

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {toast && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>{toast}</div>}

      {open ? (
        <Detail app={open} today={today} busy={busy} setBusy={setBusy} api={api} onBack={() => setOpenId(null)}
          onSaved={(a, msg) => { replace(a); if (msg) flash(msg) }} onError={setErr} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map(([k, label]) => (
              <button key={k} style={filter === k ? C.btnPrimary : C.btn} onClick={() => setFilter(k)} aria-pressed={filter === k}>
                {label} ({counts[k]})
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <input style={{ ...C.input, maxWidth: 320 }} placeholder="Search reference, project, applicant, folio..." value={query} onChange={e => setQuery(e.target.value)} aria-label="Search applications" />
            <select style={C.sel} value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="submitted_desc">Newest first</option>
              <option value="submitted_asc">Oldest first</option>
              <option value="due_asc">Due date, soonest first</option>
              <option value="reference">Reference</option>
            </select>
            <button style={C.btn} onClick={exportCsv} disabled={!shown.length}>Export to spreadsheet (CSV)</button>
            <button style={C.btn} onClick={load}>Refresh</button>
          </div>

          {!shown.length ? (
            <div style={{ ...C.card, color: '#6b7280' }}>{apps.length ? 'No applications match.' : 'No applications yet. They appear here as soon as someone submits the form.'}</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={C.th} onClick={() => setSort('reference')}>Reference</th>
                  <th style={C.th}>Project</th>
                  <th style={C.th}>Applicant</th>
                  <th style={C.th} onClick={() => setSort(sort === 'submitted_desc' ? 'submitted_asc' : 'submitted_desc')}>Submitted</th>
                  <th style={C.th}>Status</th>
                  <th style={C.th} onClick={() => setSort('due_asc')}>Due</th>
                </tr></thead>
                <tbody>
                  {shown.map(a => {
                    const l = left(a)
                    const [fg, bg] = STATUS_COLOR[a.status]
                    return (
                      <tr key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: 'pointer' }}>
                        <td style={C.td}><button style={{ border: 0, background: 'none', padding: 0, color: BLUE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{a.reference}</button></td>
                        <td style={C.td}><div style={{ fontWeight: 600 }}>{a.project_name}</div><div style={{ fontSize: 11, color: '#6b7280' }}>{a.application_types.join(', ')}{a.jurisdiction ? ` · ${a.jurisdiction}` : ''}</div></td>
                        <td style={C.td}>{a.applicant_name}<div style={{ fontSize: 11, color: '#6b7280' }}>{a.applicant_email}</div></td>
                        <td style={C.td}>{fmt(a.submitted_at)}</td>
                        <td style={C.td}><span style={{ background: bg, color: fg, borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{STATUS_LABEL[a.status]}</span></td>
                        <td style={{ ...C.td, whiteSpace: 'nowrap' }}>
                          {a.due_date ? <>{fmt(a.due_date)}{a.status === 'accepted' && l !== null && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: l < 0 ? '#b91c1c' : l <= SIA_REMIND_WITHIN ? '#c2410c' : '#6b7280' }}>
                              {l < 0 ? `${-l} business day${l === -1 ? '' : 's'} overdue` : l === 0 ? 'Due today' : `${l} business day${l === 1 ? '' : 's'} left`}
                            </div>)}</> : <span style={{ color: '#9ca3af', fontSize: 12 }}>{a.status === 'letter_sent' ? '' : 'Starts when accepted'}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Detail({ app, today, busy, setBusy, api, onBack, onSaved, onError }: {
  app: App; today: string; busy: boolean; setBusy: (b: boolean) => void
  api: (method: string, body?: unknown) => Promise<any>; onBack: () => void
  onSaved: (a: App, msg?: string) => void; onError: (m: string) => void
}) {
  const supabase = createClient()
  const [sbn, setSbn] = useState(app.school_board_number ?? '')
  const [notes, setNotes] = useState(app.staff_notes ?? '')
  const [due, setDue] = useState(app.due_date ?? '')
  const [infoNote, setInfoNote] = useState('')
  const [askInfo, setAskInfo] = useState(false)
  const [letterFile, setLetterFile] = useState<File | null>(null)
  useEffect(() => { setSbn(app.school_board_number ?? ''); setNotes(app.staff_notes ?? ''); setDue(app.due_date ?? '') }, [app])

  const run = async (fn: () => Promise<void>) => { setBusy(true); onError(''); try { await fn() } catch (e: any) { onError(e.message) } setBusy(false) }

  const setStatus = (status: Status, extra: Record<string, unknown> = {}, msg?: string) => run(async () => {
    const j = await api('PATCH', { id: app.id, status, ...extra })
    onSaved(j.application, j.emailed === false ? `${msg ?? 'Saved'}. The email to the applicant did not send; it is queued to resend.` : msg)
  })

  const uploadStaff = async (slot: Slot, file: File) => {
    const u = await api('POST', { action: 'upload_url', id: app.id, slot, name: file.name, size: file.size })
    const { error } = await supabase.storage.from(SIA_BUCKET).uploadToSignedUrl(u.path, u.token, file, { contentType: file.type || undefined })
    if (error) throw new Error(`${file.name} did not upload.`)
    const j = await api('POST', { action: 'attach', id: app.id, slot, name: u.name, path: u.path })
    return j.application as App
  }

  const download = (path: string) => run(async () => {
    const j = await api('POST', { action: 'file_url', path })
    window.open(j.url, '_blank', 'noopener')
  })

  const d = app.data || {}
  const l = app.due_date && today ? businessDaysBetween(today, app.due_date) : null
  const row = (label: string, v: unknown) => (v === undefined || v === null || v === '' ? null : (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, fontSize: 13, padding: '3px 0' }}>
      <div style={{ color: '#6b7280' }}>{label}</div><div style={{ whiteSpace: 'pre-wrap' }}>{String(v)}</div>
    </div>
  ))
  const section = (title: string, children: React.ReactNode) => (
    <div style={C.card}><div style={C.sublabel}>{title}</div>{children}</div>
  )
  const units = d.development?.units || {}
  const unitRows = Object.entries(units as Record<string, Record<string, { built: number | null; unbuilt: number | null; proposed: number | null }>>)
    .flatMap(([t, cats]) => Object.entries(cats).map(([c, v]) => ({ t: t.replace(/_/g, ' '), c, ...v })))
  const [fg, bg] = STATUS_COLOR[app.status]

  return (
    <div>
      <button style={{ ...C.btn, marginBottom: 12 }} onClick={onBack}>← All applications</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{app.reference}: {app.project_name}</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Submitted {fmt(app.submitted_at)} by {app.applicant_name} (<a href={`mailto:${app.applicant_email}`}>{app.applicant_email}</a>)</div>
        </div>
        <span style={{ background: bg, color: fg, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>{STATUS_LABEL[app.status]}</span>
      </div>

      {section('Status', <>
        {app.status === 'new' && <p style={{ fontSize: 13, margin: '0 0 10px' }}>Check the application and files below. Accepting it starts the 30-business-day clock and emails the applicant that their application is complete.</p>}
        {app.status === 'needs_info' && <p style={{ fontSize: 13, margin: '0 0 10px' }}>Waiting on the applicant. The clock is stopped. Asked for: <em>{app.needs_info_note}</em></p>}
        {app.status === 'accepted' && <p style={{ fontSize: 13, margin: '0 0 10px' }}>Accepted {fmt(app.accepted_at)}. Due <strong>{fmt(app.due_date)}</strong>{l !== null && <> ({l < 0 ? `${-l} business days overdue` : l === 0 ? 'due today' : `${l} business days left`})</>}. Send the SCAD letter from your email, then mark it sent.</p>}
        {app.status === 'letter_sent' && <p style={{ fontSize: 13, margin: '0 0 10px' }}>SCAD letter sent {fmt(app.letter_sent_at)}. Complete.</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(app.status === 'new' || app.status === 'needs_info') && (
            <button style={C.btnPrimary} disabled={busy} onClick={() => setStatus('accepted', {}, 'Accepted. The applicant was emailed and the 30-business-day clock started')}>Accept: application complete</button>
          )}
          {app.status !== 'letter_sent' && !askInfo && (
            <button style={C.btn} disabled={busy} onClick={() => setAskInfo(true)}>Needs info</button>
          )}
          {app.status === 'needs_info' && (
            <button style={C.btn} disabled={busy} onClick={() => setStatus('new', {}, 'Moved back to New')}>Back to New</button>
          )}
          {app.status === 'letter_sent' && (
            <button style={C.btn} disabled={busy} onClick={() => setStatus('accepted', {}, 'Moved back to In review')}>Undo: back to In review</button>
          )}
        </div>

        {askInfo && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>What is missing? This is emailed to the applicant (copy to the shared inbox).
              <textarea style={{ ...C.input, minHeight: 70, marginTop: 4 }} value={infoNote} onChange={e => setInfoNote(e.target.value)} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button style={C.btnPrimary} disabled={busy || !infoNote.trim()} onClick={async () => { await setStatus('needs_info', { note: infoNote }, 'Marked Needs info and emailed the applicant'); setAskInfo(false); setInfoNote('') }}>Send and mark Needs info</button>
              <button style={C.btn} onClick={() => setAskInfo(false)}>Cancel</button>
            </div>
          </div>
        )}

        {app.status === 'accepted' && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Mark the SCAD letter sent</div>
            <label style={{ fontSize: 12, color: '#6b7280' }}>Attach the letter for the record (optional): <input type="file" onChange={e => setLetterFile(e.target.files?.[0] ?? null)} /></label>
            <div style={{ marginTop: 8 }}>
              <button style={C.btnPrimary} disabled={busy} onClick={() => run(async () => {
                if (letterFile) await uploadStaff('scad_letter', letterFile)
                const j = await api('PATCH', { id: app.id, status: 'letter_sent' })
                onSaved(j.application, 'Marked Letter sent'); setLetterFile(null)
              })}>Letter sent: mark complete</button>
            </div>
          </div>
        )}
      </>)}

      {section('Tracking', <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700 }}>School Board Number (internal)
            <input style={{ ...C.input, marginTop: 4 }} value={sbn} onChange={e => setSbn(e.target.value)} /></label>
          {(app.status === 'accepted' || app.status === 'letter_sent') && (
            <label style={{ fontSize: 12, fontWeight: 700 }}>Due date (adjust for District holidays)
              <input type="date" style={{ ...C.input, marginTop: 4 }} value={due} onChange={e => setDue(e.target.value)} /></label>
          )}
        </div>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginTop: 10 }}>Staff notes (never shown to the applicant)
          <textarea style={{ ...C.input, minHeight: 60, marginTop: 4 }} value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <button style={{ ...C.btnPrimary, marginTop: 8 }} disabled={busy || (sbn === (app.school_board_number ?? '') && notes === (app.staff_notes ?? '') && due === (app.due_date ?? ''))}
          onClick={() => run(async () => {
            const body: Record<string, unknown> = { id: app.id, school_board_number: sbn, staff_notes: notes }
            if (due && due !== app.due_date) body.due_date = due
            const j = await api('PATCH', body); onSaved(j.application, 'Saved')
          })}>Save</button>
      </>)}

      {section('Documents', <>
        {[...APPLICANT_SLOTS, 'scad_letter' as Slot].map(slot => {
          const list = app.attachments?.[slot] ?? []
          if (!list.length && (slot === 'plat_letter' || slot === 'scad_letter')) return null
          return (
            <div key={slot} style={{ padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{SLOTS[slot]}</strong>
                <label style={{ fontSize: 11, color: BLUE, cursor: 'pointer' }}>+ Add a file
                  <input type="file" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) run(async () => { onSaved(await uploadStaff(slot, f), `Added ${f.name}`) }) }} />
                </label>
              </div>
              {list.length ? list.map(f => (
                <div key={f.path}><button style={{ border: 0, background: 'none', padding: 0, color: BLUE, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textDecoration: 'underline' }} onClick={() => download(f.path)}>{f.name}</button>{f.size ? <span style={{ color: '#9ca3af', fontSize: 11 }}> ({Math.max(1, Math.round(f.size / 1024))} KB)</span> : null}</div>
              )) : <div style={{ color: '#9ca3af' }}>None</div>}
            </div>
          )
        })}
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Got a missing document by email? Add it here so the record is complete.</div>
      </>)}

      {section('Application', <>
        {row('Application type', (d.application_types || []).join(', '))}
        {row('County project number', d.project?.county_project_number)}
        {row('City project number', d.project?.city_project_number)}
        {row('Previously submitted', d.project?.previously_submitted === 'yes' ? `Yes, SBBC ${d.project?.sbbc_number}` : 'No')}
        {row('Fee', d.payment?.fee_amount)}
        {row('Payment', d.payment?.method === 'check' ? `Check ${d.payment?.check_no}` : `E-store order ${d.payment?.order_no}`)}
        <div style={{ height: 8 }} />
        {row('Folio', d.location?.folio)}
        {row('Section / Township / Range', [d.location?.section, d.location?.township, d.location?.range].filter(Boolean).join(' / '))}
        {row('General location', d.location?.general_location)}
        {row('Side of', d.location?.side_of)}
        {row('At / between', [d.location?.at_between, d.location?.and_street].filter(Boolean).join(' and '))}
        {row('Acreage', d.location?.acreage)}
        {row('Jurisdiction', d.location?.jurisdiction)}
        <div style={{ height: 8 }} />
        {row('Owner', [d.owner?.name, d.owner?.phone].filter(Boolean).join(', '))}
        {row('Owner address', [d.owner?.address, d.owner?.city, d.owner?.state, d.owner?.zip].filter(Boolean).join(', '))}
        {row('Developer / agent', d.agent?.name)}
        {row('Agent contact', [d.agent?.email, d.agent?.phone, d.agent?.fax && `Fax ${d.agent.fax}`].filter(Boolean).join(', '))}
        {row('Agent address', [d.agent?.address, d.agent?.city, d.agent?.state, d.agent?.zip].filter(Boolean).join(', '))}
        <div style={{ height: 8 }} />
        {row('Land use', [d.development?.land_use_existing && `Existing: ${d.development.land_use_existing}`, d.development?.land_use_proposed && `Proposed: ${d.development.land_use_proposed}`].filter(Boolean).join('; '))}
        {row('Zoning', [d.development?.zoning_existing && `Existing: ${d.development.zoning_existing}`, d.development?.zoning_proposed && `Proposed: ${d.development.zoning_proposed}`].filter(Boolean).join('; '))}
        {unitRows.length > 0 && (
          <table style={{ borderCollapse: 'collapse', fontSize: 12, margin: '8px 0' }}>
            <thead><tr>{['Type', 'Bedroom mix', 'Built', 'Un-built', 'Permitted total', 'Proposed'].map(h => <th key={h} style={{ ...C.th, cursor: 'default', padding: '4px 8px' }}>{h}</th>)}</tr></thead>
            <tbody>{unitRows.map(u => (
              <tr key={u.t + u.c}>{[u.t, u.c, u.built ?? '', u.unbuilt ?? '', (u.built ?? 0) + (u.unbuilt ?? 0), u.proposed ?? ''].map((v, i) => <td key={i} style={{ padding: '3px 8px', borderBottom: '1px solid #f1f5f9', textTransform: i === 0 ? 'capitalize' : undefined }}>{v}</td>)}</tr>
            ))}</tbody>
          </table>
        )}
        {row('Non-residential', d.development?.non_residential === 'yes' ? `Yes: ${d.development?.non_residential_desc}` : 'No')}
        <div style={{ height: 8 }} />
        {row('Vested / exempt amount', d.vested?.amount)}
        {row('Exemption criteria', (d.vested?.exemptions || []).join('\n'))}
        {row('Applicable statute', d.vested?.statute)}
        {row('Vesting criteria', (d.vested?.vesting || []).join('\n'))}
        {row('Associated application', d.vested?.associated_application)}
        {row('Associated plat number', d.vested?.plat_number)}
        <div style={{ height: 8 }} />
        {row('Signature', d.certification ? `${d.certification.name} (typed, certified ${fmt(d.certification.date)})` : '')}
      </>)}

      {section('History', (app.history || []).map((h, i) => (
        <div key={i} style={{ fontSize: 12, color: '#374151', padding: '2px 0' }}>{new Date(h.at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })}: {STATUS_LABEL[h.status as Status] ?? h.status} ({h.by})</div>
      )))}
    </div>
  )
}
