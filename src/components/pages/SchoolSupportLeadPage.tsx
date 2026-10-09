'use client'

// Editor for the Find Your District Web Team Lead widget (public embed at
// /embeds/school-support-lead.html). Mirrors the Charter School Directory
// editor (src/components/pages/CharterSchoolsPage.tsx): inline per-row edit
// with a Save button that only enables once something changed, delete with
// confirm, and an add form at the bottom. Three parts: the support settings
// shown under the search (IIQ link, Hot Lab note), the five District Web Team
// Leads, and the school list, which is the 2026-27 split from the doc
// bcps-school-assignments-2026-27. API: src/app/api/bcps/school-support-lead.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface School { loc_no: string; display_name: string; school_level: string | null; region: string | null; lead_email: string; no_wcm: boolean }
interface Lead { email: string; full_name: string; title: string | null; bio: string | null; photo_url: string | null; active: boolean; sort_order: number }

const LEVELS = ['Elementary', 'Middle', 'High', 'Center', 'Combination', 'Community']
const REGIONS = ['North', 'Central', 'South', 'School Transformation']
const BLUE = '#1672A7'
const EMPTY_NEW = { loc_no: '', display_name: '', school_level: 'Elementary', region: 'North', lead_email: '' }

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff', width: '100%' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  h2: { fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#374151', margin: '24px 0 10px' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 6 } as React.CSSProperties,
}

export default function SchoolSupportLeadPage() {
  const supabase = createClient()
  const [schools, setSchools] = useState<School[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [leadFilter, setLeadFilter] = useState('all')
  const [showNew, setShowNew] = useState(false)
  const [newSchool, setNewSchool] = useState(EMPTY_NEW)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [leadEdits, setLeadEdits] = useState<Record<string, any>>({})
  const [settingEdits, setSettingEdits] = useState<Record<string, string>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/school-support-lead', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setSchools(j.schools); setLeads(j.leads)
    setSettings(Object.fromEntries((j.settings as { key: string; value: string | null }[]).map(s => [s.key, s.value ?? ''])))
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any, clear?: () => void) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/school-support-lead', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    clear?.()
    await load(); return j
  }, [token, load])

  const dropKey = (set: React.Dispatch<React.SetStateAction<Record<string, any>>>, key: string) =>
    () => set(prev => { const next = { ...prev }; delete next[key]; return next })

  const setEdit = (loc: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [loc]: { ...prev[loc], [field]: value } }))
  const editVal = (row: School, field: keyof School) => edits[row.loc_no]?.[field] ?? (row[field] ?? '')
  const setLeadEdit = (email: string, field: string, value: string) =>
    setLeadEdits(prev => ({ ...prev, [email]: { ...prev[email], [field]: value } }))
  const leadVal = (l: Lead, field: keyof Lead) => leadEdits[l.email]?.[field] ?? (l[field] ?? '')

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    schools.forEach(s => { m[s.lead_email] = (m[s.lead_email] || 0) + 1 })
    return m
  }, [schools])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/#/g, '')
    return schools.filter(s =>
      (leadFilter === 'all' || s.lead_email === leadFilter) &&
      (!q || s.display_name.toLowerCase().includes(q) || s.loc_no.includes(q) || s.loc_no.replace(/^0+/, '') === q))
  }, [schools, query, leadFilter])

  if (loading) return <div style={{ padding: 32 }}>Loading Find Your District Web Team Lead content...</div>

  const leadOptions = leads.map(l => <option key={l.email} value={l.email}>{l.full_name}</option>)

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Find Your District Web Team Lead</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Edit which District Web Team Lead supports each school, the leads themselves, and the support links shown in the widget.
        Changes go live on bcpsmarcomm.com immediately, no code push or deploy needed.
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      {/* SETTINGS */}
      <div style={C.h2}>Support links</div>
      {[
        { key: 'iiq_url', label: 'IIQ ticket link', placeholder: 'https://browardschools.incidentiq.com/' },
        { key: 'hot_lab_url', label: 'Hot Lab calendar link (dates and join links)', placeholder: 'https://www.browardschools.com/wcm-community/schools/calendar' },
        { key: 'hot_lab_text', label: 'Hot Lab note (shown above the school list)', placeholder: 'Hot Labs are open drop-in support sessions...' },
      ].map(f => (
        <div key={f.key} style={C.card}>
          <div style={C.sublabel}>{f.label}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={C.input} placeholder={f.placeholder} disabled={busy}
              value={settingEdits[f.key] ?? settings[f.key] ?? ''}
              onChange={e => setSettingEdits(prev => ({ ...prev, [f.key]: e.target.value }))} />
            <button style={C.btn} disabled={busy || settingEdits[f.key] === undefined}
              onClick={() => act({ action: 'setting_update', key: f.key, value: settingEdits[f.key] }, dropKey(setSettingEdits as any, f.key))}>Save</button>
          </div>
        </div>
      ))}

      {/* LEADS */}
      <div style={C.h2}>District Web Team Leads</div>
      {leads.map(l => (
        <div key={l.email} style={C.card}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input style={C.input} placeholder="Name" disabled={busy}
              value={leadVal(l, 'full_name')} onChange={e => setLeadEdit(l.email, 'full_name', e.target.value)} />
            <input style={C.input} placeholder="Title (optional)" disabled={busy}
              value={leadVal(l, 'title')} onChange={e => setLeadEdit(l.email, 'title', e.target.value)} />
            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{counts[l.email] || 0} schools</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 8, marginBottom: 8 }}>
            <textarea style={{ ...C.input, minHeight: 56, resize: 'vertical' }} placeholder="Short bio (optional, shown when a WCM finds their school)" maxLength={600} disabled={busy}
              value={leadVal(l, 'bio')} onChange={e => setLeadEdit(l.email, 'bio', e.target.value)} />
            <input style={C.input} placeholder="Photo URL (optional, https://...)" disabled={busy}
              value={leadVal(l, 'photo_url')} onChange={e => setLeadEdit(l.email, 'photo_url', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af', flex: 1 }}>{l.email}</span>
            <button style={C.btn} disabled={busy || !leadEdits[l.email]}
              onClick={() => act({ action: 'lead_update', email: l.email, ...leadEdits[l.email] }, dropKey(setLeadEdits, l.email))}>Save</button>
          </div>
        </div>
      ))}

      {/* SCHOOLS */}
      <div style={C.h2}>Schools</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input style={{ ...C.input, maxWidth: 320 }} placeholder={`Search ${schools.length} schools by name or location number...`}
          value={query} onChange={e => setQuery(e.target.value)} />
        <select style={{ ...C.sel, width: 'auto' }} value={leadFilter} onChange={e => setLeadFilter(e.target.value)}>
          <option value="all">All District Web Team Leads</option>
          {leads.map(l => <option key={l.email} value={l.email}>{l.full_name} ({counts[l.email] || 0})</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Showing {filtered.length} of {schools.length}</span>
      </div>

      {filtered.map(s => (
        <div key={s.loc_no} style={C.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr) auto auto', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{s.loc_no}</span>
            <input style={C.input} placeholder="School name" disabled={busy}
              value={editVal(s, 'display_name')} onChange={e => setEdit(s.loc_no, 'display_name', e.target.value)} />
            <select style={C.sel} disabled={busy} value={editVal(s, 'school_level') || 'Elementary'}
              onChange={e => setEdit(s.loc_no, 'school_level', e.target.value)}>
              {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select style={C.sel} disabled={busy} value={editVal(s, 'region') || 'North'}
              onChange={e => setEdit(s.loc_no, 'region', e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select style={C.sel} disabled={busy} value={editVal(s, 'lead_email')}
              onChange={e => setEdit(s.loc_no, 'lead_email', e.target.value)} aria-label={`District Web Team Lead for ${s.display_name}`}>
              {leadOptions}
            </select>
            <button style={C.btn} disabled={busy || !edits[s.loc_no]}
              onClick={() => act({ action: 'school_update', loc_no: s.loc_no, ...edits[s.loc_no] }, dropKey(setEdits, s.loc_no))}>Save</button>
            <button style={C.btnDanger} disabled={busy}
              onClick={() => { if (confirm(`Remove "${s.display_name}" from the widget?`)) act({ action: 'school_delete', loc_no: s.loc_no }) }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr)', gap: 8, marginBottom: 8 }}>
              <input style={C.input} placeholder="Loc # *" maxLength={4} value={newSchool.loc_no}
                onChange={e => setNewSchool({ ...newSchool, loc_no: e.target.value.replace(/\D/g, '') })} />
              <input style={C.input} placeholder="School name *" value={newSchool.display_name}
                onChange={e => setNewSchool({ ...newSchool, display_name: e.target.value })} />
              <select style={C.sel} value={newSchool.school_level} onChange={e => setNewSchool({ ...newSchool, school_level: e.target.value })}>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select style={C.sel} value={newSchool.region} onChange={e => setNewSchool({ ...newSchool, region: e.target.value })}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select style={C.sel} value={newSchool.lead_email} onChange={e => setNewSchool({ ...newSchool, lead_email: e.target.value })}>
                <option value="">District Web Team Lead *</option>
                {leadOptions}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={C.btnPrimary} disabled={busy || newSchool.loc_no.length !== 4 || !newSchool.display_name || !newSchool.lead_email}
                onClick={() => act({ action: 'school_create', ...newSchool }, () => { setNewSchool(EMPTY_NEW); setShowNew(false) })}>Add school</button>
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
