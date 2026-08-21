'use client'

// Admin editor for the Charter School Directory widget (public embed at
// /embeds/charter-school-directory.html). Mirrors the Find It Fast editor
// pattern (src/components/pages/FindItFastPage.tsx / src/app/api/bcps/
// find-it-fast/route.ts): inline per-row edit with a Save button that only
// enables once something changed, delete with confirm, and an add-row form
// at the bottom. Unlike Find It Fast's two categories, this is a flat list
// of ~90 schools, so a search box replaces manual up/down reordering -
// reordering 90 rows one pair-swap at a time isn't a real workflow. New
// schools are appended (sort_order = max + 1); the public embed just needs
// the roster present, not a specific display order.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface School {
  id: string
  name: string
  grades: string | null
  city: string | null
  address: string | null
  phone: string | null
  principal: string | null
  website: string | null
  sort_order: number
}

const GRADE_OPTIONS = ['K-3', 'K-5', 'K-8', '6-8', '6-12', '9-12']
const BLUE = '#1672A7'
const EMPTY_NEW = { name: '', grades: 'K-8', city: '', address: '', phone: '', principal: '', website: '' }

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function CharterSchoolsPage() {
  const supabase = createClient()
  const [schools, setSchools] = useState<School[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newSchool, setNewSchool] = useState(EMPTY_NEW)
  const [edits, setEdits] = useState<Record<string, any>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/charter-schools', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setSchools(j.schools)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/charter-schools', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (payload.id && payload.action === 'school_update') {
      setEdits(prev => {
        const next = { ...prev }
        delete next[payload.id]
        return next
      })
    }
    await load(); return j
  }, [token, load])

  const setEdit = (id: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  const editVal = (row: School, field: keyof School) => edits[row.id]?.[field] ?? (row[field] ?? '')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return schools
    return schools.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.city ?? '').toLowerCase().includes(q) ||
      (s.principal ?? '').toLowerCase().includes(q))
  }, [schools, query])

  if (loading) return <div style={{ padding: 32 }}>Loading Charter School Directory content...</div>

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Charter School Directory</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Edit the charter schools shown in the Charter School Directory widget. Changes here go live
        on bcpsmarcomm.com immediately, no code push or deploy needed.
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input style={{ ...C.input, maxWidth: 320 }} placeholder={`Search ${schools.length} schools by name, city, or principal...`}
          value={query} onChange={e => setQuery(e.target.value)} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Showing {filtered.length} of {schools.length}</span>
      </div>

      {filtered.map(s => (
        <div key={s.id} style={C.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input style={C.input} placeholder="School name" disabled={busy}
              value={editVal(s, 'name')} onChange={e => setEdit(s.id, 'name', e.target.value)} />
            <select style={C.sel} disabled={busy} value={editVal(s, 'grades') || 'K-8'}
              onChange={e => setEdit(s.id, 'grades', e.target.value)}>
              {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <input style={C.input} placeholder="City" disabled={busy}
              value={editVal(s, 'city')} onChange={e => setEdit(s.id, 'city', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input style={C.input} placeholder="Address" disabled={busy}
              value={editVal(s, 'address')} onChange={e => setEdit(s.id, 'address', e.target.value)} />
            <input style={C.input} placeholder="Phone" disabled={busy}
              value={editVal(s, 'phone')} onChange={e => setEdit(s.id, 'phone', e.target.value)} />
            <input style={C.input} placeholder="Principal" disabled={busy}
              value={editVal(s, 'principal')} onChange={e => setEdit(s.id, 'principal', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input style={C.input} placeholder="Website URL" disabled={busy}
              value={editVal(s, 'website')} onChange={e => setEdit(s.id, 'website', e.target.value)} />
            <button style={C.btn} disabled={busy || !edits[s.id]}
              onClick={() => act({ action: 'school_update', id: s.id, ...edits[s.id] })}>Save</button>
            <button style={C.btnDanger} disabled={busy}
              onClick={() => { if (confirm(`Remove "${s.name}" from the directory?`)) act({ action: 'school_delete', id: s.id }) }}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ ...C.card, color: '#9ca3af', textAlign: 'center' }}>No schools match "{query}".</div>
      )}

      {/* NEW SCHOOL */}
      <div style={{ ...C.card, background: '#f9fafb' }}>
        <div style={C.sublabel}>{showNew ? 'New school' : ' '}</div>
        {showNew ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input style={C.input} placeholder="School name *" value={newSchool.name}
                onChange={e => setNewSchool({ ...newSchool, name: e.target.value })} />
              <select style={C.sel} value={newSchool.grades} onChange={e => setNewSchool({ ...newSchool, grades: e.target.value })}>
                {GRADE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <input style={C.input} placeholder="City" value={newSchool.city}
                onChange={e => setNewSchool({ ...newSchool, city: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input style={C.input} placeholder="Address" value={newSchool.address}
                onChange={e => setNewSchool({ ...newSchool, address: e.target.value })} />
              <input style={C.input} placeholder="Phone" value={newSchool.phone}
                onChange={e => setNewSchool({ ...newSchool, phone: e.target.value })} />
              <input style={C.input} placeholder="Principal" value={newSchool.principal}
                onChange={e => setNewSchool({ ...newSchool, principal: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={C.input} placeholder="Website URL" value={newSchool.website}
                onChange={e => setNewSchool({ ...newSchool, website: e.target.value })} />
              <button style={C.btnPrimary} disabled={busy || !newSchool.name}
                onClick={async () => {
                  await act({ action: 'school_create', ...newSchool, sort_order: schools.length })
                  setNewSchool(EMPTY_NEW); setShowNew(false)
                }}>Add school</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewSchool(EMPTY_NEW) }}>Cancel</button>
            </div>
          </>
        ) : (
          <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => setShowNew(true)}>+ Add school</button>
        )}
      </div>
    </div>
  )
}
