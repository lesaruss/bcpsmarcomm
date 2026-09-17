'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Dept = {
  slug: string
  name: string
  division: string | null
  director_name: string | null
  director_email: string | null
}
type WcmUser = { department: string | null; email: string; full_name: string | null }

type ViewKind = 'wcm' | 'director'
type Row = { key: string; dept: string; division: string | null; person: string | null; email: string | null }

const BLUE = '#1672A7'
const BLUE_DARK = '#0e4e73'

// Loose match for department names that are free text on the wcm_cert_users
// side (whatever the registrant typed or was recorded under) against the
// canonical bcps_departments.name - lowercase, strip punctuation, collapse
// whitespace. Good enough to fold "Bilingual / ESOL" and "Bilingual/Esol"
// into one group; a genuine rename/abbreviation mismatch just falls through
// to its own raw-text group below rather than being dropped.
const normalize = (s: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default function RosterPage() {
  const supabase = createClient()
  const [departments, setDepartments] = useState<Dept[]>([])
  const [wcmUsers, setWcmUsers] = useState<WcmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [view, setView] = useState<ViewKind>('wcm')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const token = (await supabase.auth.getSession()).data.session?.access_token || ''
    const r = await fetch('/api/bcps/roster', { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load roster'); setLoading(false); return }
    setDepartments(j.departments ?? [])
    setWcmUsers(j.wcm_users ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const views: Record<ViewKind, Row[]> = useMemo(() => {
    const byNormalizedName = new Map<string, Dept>()
    departments.forEach(d => byNormalizedName.set(normalize(d.name), d))

    const matchedSlugs = new Set<string>()
    const wcmRows: Row[] = wcmUsers.map((u, i) => {
      const match = byNormalizedName.get(normalize(u.department))
      if (match) matchedSlugs.add(match.slug)
      return {
        key: `wcm|${match?.slug ?? 'unmatched'}|${u.email}|${i}`,
        dept: match?.name ?? (u.department || 'Unmatched department'),
        division: match?.division ?? null,
        person: u.full_name,
        email: u.email,
      }
    })
    // One placeholder row for any department with zero registered WCMs, so it
    // still shows up as "Not on file" instead of disappearing from the list.
    departments.forEach(d => {
      if (!matchedSlugs.has(d.slug)) {
        wcmRows.push({ key: `wcm|${d.slug}|none`, dept: d.name, division: d.division, person: null, email: null })
      }
    })
    wcmRows.sort((a, b) => a.dept.localeCompare(b.dept) || (a.person || '').localeCompare(b.person || ''))

    const directorRows: Row[] = departments.map(d => ({
      key: `dir|${d.slug}`, dept: d.name, division: d.division, person: d.director_name, email: d.director_email,
    })).sort((a, b) => a.dept.localeCompare(b.dept))

    return { wcm: wcmRows, director: directorRows }
  }, [departments, wcmUsers])

  const rows = views[view]
  const label = view === 'wcm' ? 'WCM' : 'Director'

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r => (r.dept + ' ' + (r.person || '')).toLowerCase().includes(q))
  }, [rows, query])

  const confirmedRows = rows.filter(r => !!r.email)
  const namedRows = rows.filter(r => !!r.person)
  const deptCount = new Set(rows.map(r => r.dept)).size

  const selectedEmails = rows.filter(r => selected[r.key] && r.email).map(r => r.email as string)

  const selectAllConfirmed = () => {
    const next = { ...selected }
    rows.forEach(r => { if (r.email) next[r.key] = true })
    setSelected(next)
  }
  const clearSelection = () => setSelected({})

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 1800) }

  const copyBcc = async () => {
    if (!selectedEmails.length) return
    const list = selectedEmails.join(', ')
    try {
      await navigator.clipboard.writeText(list)
      showToast(`Copied ${selectedEmails.length} emails`)
    } catch {
      window.prompt('Copy this BCC list:', list)
    }
  }

  const openMailto = () => {
    if (!selectedEmails.length) return
    window.location.href = `mailto:?bcc=${encodeURIComponent(selectedEmails.join(','))}`
  }

  const allConfirmedSelected = confirmedRows.length > 0 && confirmedRows.every(r => selected[r.key])
  const toggleSelectAll = () => {
    const next = { ...selected }
    if (allConfirmedSelected) {
      confirmedRows.forEach(r => { delete next[r.key] })
    } else {
      confirmedRows.forEach(r => { next[r.key] = true })
    }
    setSelected(next)
  }

  const btn: React.CSSProperties = { padding: '9px 14px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }
  const btnPrimary: React.CSSProperties = { ...btn, border: `1px solid ${BLUE}`, background: BLUE, color: '#fff' }
  const btnGhost: React.CSSProperties = { ...btn, border: 'none', background: 'none', color: '#6b7280' }

  if (loading) return <div style={{ padding: 32 }}>Loading roster...</div>

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af', margin: '0 0 8px' }}>BCPS &middot; MarComm &amp; WCM Program</p>
          <h1 style={{ fontSize: 28, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 6px' }}>The Roster</h1>
          <p style={{ fontSize: 14, color: '#6b7280', maxWidth: '52ch', margin: 0 }}>Every BCPS department, its Web Content Manager and its Director, in one list built for pulling a BCC batch.</p>
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{deptCount}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Departments</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{namedRows.length}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}s named</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{confirmedRows.length}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Emails confirmed</div>
          </div>
        </div>
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 16px' }}>{err}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, padding: 3, gap: 2 }}>
          {(['wcm', 'director'] as ViewKind[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: view === v ? '#fff' : 'transparent', color: view === v ? BLUE_DARK : '#6b7280',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {v === 'wcm' ? 'Department WCMs' : 'Department Directors'}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Filter by department or name..."
          style={{ flex: '1 1 220px', maxWidth: 320, padding: '9px 12px', borderRadius: 9, border: '1px solid #d1d5db', fontSize: 13.5, fontFamily: 'inherit' }}
        />

        <div style={{ flex: 1 }} />

        <button style={btn} onClick={selectAllConfirmed}>Select all confirmed emails</button>
        <button style={btnGhost} onClick={clearSelection}>Clear selection</button>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ width: 38, padding: '12px 14px 12px 16px' }}>
                  <input type="checkbox" checked={allConfirmedSelected} disabled={confirmedRows.length === 0} onChange={toggleSelectAll} aria-label="Select all rows with a confirmed email" />
                </th>
                <th style={thStyle}>Department</th>
                <th style={thStyle}>{label}</th>
                <th style={thStyle}>Email</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const checked = !!selected[row.key]
                const disabled = !row.email
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid #f1f1f1' }}>
                    <td style={{ padding: '11px 14px 11px 16px' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => setSelected(prev => {
                          const next = { ...prev }
                          if (next[row.key]) delete next[row.key]; else next[row.key] = true
                          return next
                        })}
                        aria-label={`Select ${row.person || row.dept}`}
                      />
                    </td>
                    <td style={{ padding: '11px 14px', fontWeight: 700 }}>
                      {row.dept}
                      {row.division && <div style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', marginTop: 1 }}>{row.division}</div>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {row.person
                        ? <span style={{ fontWeight: 600 }}>{row.person}</span>
                        : <span style={{ fontSize: 12, color: '#9ca3af' }}>Not on file</span>}
                    </td>
                    <td style={{ padding: '11px 14px', minWidth: 210 }}>
                      {row.email ? (
                        <>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#eaf3f9', color: BLUE_DARK }}>Confirmed</span>
                          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, marginTop: 5 }}>{row.email}</div>
                        </>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: '#fff4e7', color: '#8a5211' }}>Not on file</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13.5 }}>No rows match that filter.</div>
        )}
      </div>

      <div style={{
        position: 'sticky', bottom: 18, marginTop: 22, background: '#fff', border: '1px solid #d1d5db', borderRadius: 14,
        boxShadow: '0 8px 24px -12px rgba(0,0,0,0.18)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
      }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}><span style={{ color: BLUE_DARK }}>{selectedEmails.length}</span> selected</div>
        {toast && <span style={{ fontSize: 12.5, color: BLUE_DARK, fontWeight: 600 }}>{toast}</span>}
        <div style={{ flex: 1 }} />
        <button style={btn} disabled={!selectedEmails.length} onClick={openMailto}>Open in mail app</button>
        <button style={{ ...btnPrimary, opacity: selectedEmails.length ? 1 : 0.5 }} disabled={!selectedEmails.length} onClick={copyBcc}>Copy BCC list</button>
      </div>

      <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6, maxWidth: '66ch', marginTop: 20 }}>
        <strong style={{ color: '#6b7280' }}>Source:</strong> bcps_departments, read live. A department with no Director or WCM on file shows &quot;Not on file&quot; rather than being skipped.
      </p>
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', fontSize: 11, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 700, padding: '12px 14px' }
