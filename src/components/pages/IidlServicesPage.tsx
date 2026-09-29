'use client'

// Admin editor for the II&DL Services Directory widget (public embed at
// /embeds/iidl-services-directory.html). Same pattern as the Charter School
// Directory editor (src/components/pages/CharterSchoolsPage.tsx): inline
// per-row edit with a Save button that only enables once something changed,
// delete with confirm, and an add-row form at the bottom. Two things are
// specific to this widget: units are their own small table (name, the
// one-line summary the embed shows when a unit is filtered, and the unit
// page link), and every service carries an internal review_note. The embed
// never reads review_note; here it shows as a "Needs II&DL review" flag, and
// clearing the note clears the flag.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Service {
  id: string
  name: string
  unit_slug: string | null
  description: string | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  contact_phone: string | null
  booking_url: string | null
  booking_note: string | null
  review_note: string | null
  sort_order: number
}

interface Unit {
  slug: string
  name: string
  summary: string | null
  page_url: string | null
  sort_order: number
}

const BLUE = '#1672A7'
const EMPTY_NEW = {
  name: '', unit_slug: '', description: '', contact_name: '', contact_title: '', contact_email: '',
  contact_phone: '', booking_url: '', booking_note: '',
}

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%', minWidth: 0 } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff', width: '100%', minWidth: 0 } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 8 } as React.CSSProperties,
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 8, marginBottom: 8 } as React.CSSProperties,
  flag: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 7, padding: '8px 10px', fontSize: 12, marginBottom: 8 } as React.CSSProperties,
}

export default function IidlServicesPage() {
  const supabase = createClient()
  const [services, setServices] = useState<Service[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [showUnits, setShowUnits] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newService, setNewService] = useState(EMPTY_NEW)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [unitEdits, setUnitEdits] = useState<Record<string, any>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/iidl-services', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setServices(j.services); setUnits(j.units)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/iidl-services', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (payload.action === 'service_update') {
      setEdits(prev => { const next = { ...prev }; delete next[payload.id]; return next })
    }
    if (payload.action === 'unit_update') {
      setUnitEdits(prev => { const next = { ...prev }; delete next[payload.slug]; return next })
    }
    await load(); return j
  }, [token, load])

  const setEdit = (id: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  const editVal = (row: Service, field: keyof Service) => edits[row.id]?.[field] ?? (row[field] ?? '')
  const setUnitEdit = (slug: string, field: string, value: string) =>
    setUnitEdits(prev => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }))
  const unitVal = (u: Unit, field: keyof Unit) => unitEdits[u.slug]?.[field] ?? (u[field] ?? '')

  const unitName = useCallback((slug: string | null) => units.find(u => u.slug === slug)?.name ?? '', [units])
  const flaggedCount = services.filter(s => s.review_note).length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return services.filter(s => {
      if (onlyFlagged && !s.review_note) return false
      if (!q) return true
      return s.name.toLowerCase().includes(q) ||
        unitName(s.unit_slug).toLowerCase().includes(q) ||
        (s.contact_name ?? '').toLowerCase().includes(q)
    })
  }, [services, query, onlyFlagged, unitName])

  if (loading) return <div style={{ padding: 32 }}>Loading II&amp;DL Services Directory content...</div>

  const unitOptions = (
    <>
      <option value="">No unit</option>
      {units.map(u => <option key={u.slug} value={u.slug}>{u.name}</option>)}
    </>
  )

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>II&amp;DL Services Directory</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Edit the Instructional Innovation &amp; Digital Learning services shown in the directory widget. Changes here go
        live on bcpsmarcomm.com immediately, no code push or deploy needed. Blank fields are hidden on the public card.
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      {/* UNITS */}
      <div style={{ ...C.card, background: '#f9fafb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ ...C.sublabel, marginBottom: 0 }}>Units ({units.length})</div>
          <button style={C.btn} onClick={() => setShowUnits(v => !v)}>{showUnits ? 'Hide units' : 'Edit units'}</button>
        </div>
        {showUnits && units.map(u => (
          <div key={u.slug} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 10 }}>
            <div style={C.row}>
              <input style={C.input} placeholder="Unit name" aria-label="Unit name" disabled={busy}
                value={unitVal(u, 'name')} onChange={e => setUnitEdit(u.slug, 'name', e.target.value)} />
              <input style={C.input} placeholder="Unit page URL" aria-label="Unit page URL" disabled={busy}
                value={unitVal(u, 'page_url')} onChange={e => setUnitEdit(u.slug, 'page_url', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <textarea style={{ ...C.input, minHeight: 52, resize: 'vertical' }} placeholder="One-line summary shown when this unit is selected"
                aria-label="Unit summary" disabled={busy}
                value={unitVal(u, 'summary')} onChange={e => setUnitEdit(u.slug, 'summary', e.target.value)} />
              <button style={C.btn} disabled={busy || !unitEdits[u.slug]}
                onClick={() => act({ action: 'unit_update', slug: u.slug, ...unitEdits[u.slug] })}>Save</button>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              Pre-filter link: /embeds/iidl-services-directory.html?unit={u.slug}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input style={{ ...C.input, maxWidth: 320 }} placeholder={`Search ${services.length} services by name, unit, or contact...`}
          aria-label="Search services" value={query} onChange={e => setQuery(e.target.value)} />
        <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} />
          Only rows needing II&amp;DL review ({flaggedCount})
        </label>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Showing {filtered.length} of {services.length}</span>
      </div>

      {filtered.map(s => (
        <div key={s.id} style={C.card}>
          {s.review_note && (
            <div style={C.flag}><strong>Needs II&amp;DL review:</strong> {s.review_note}</div>
          )}
          <div style={C.row}>
            <input style={C.input} placeholder="Service name" aria-label="Service name" disabled={busy}
              value={editVal(s, 'name')} onChange={e => setEdit(s.id, 'name', e.target.value)} />
            <select style={C.sel} aria-label="Unit" disabled={busy} value={editVal(s, 'unit_slug')}
              onChange={e => setEdit(s.id, 'unit_slug', e.target.value)}>
              {unitOptions}
            </select>
          </div>
          <textarea style={{ ...C.input, minHeight: 52, resize: 'vertical', marginBottom: 8 }} placeholder="Service description (hidden when blank)"
            aria-label="Service description" disabled={busy}
            value={editVal(s, 'description')} onChange={e => setEdit(s.id, 'description', e.target.value)} />
          <div style={C.row}>
            <input style={C.input} placeholder="Contact name" aria-label="Contact name" disabled={busy}
              value={editVal(s, 'contact_name')} onChange={e => setEdit(s.id, 'contact_name', e.target.value)} />
            <input style={C.input} placeholder="Contact title" aria-label="Contact title" disabled={busy}
              value={editVal(s, 'contact_title')} onChange={e => setEdit(s.id, 'contact_title', e.target.value)} />
            <input style={C.input} placeholder="Contact email" aria-label="Contact email" disabled={busy}
              value={editVal(s, 'contact_email')} onChange={e => setEdit(s.id, 'contact_email', e.target.value)} />
            <input style={C.input} placeholder="Contact phone" aria-label="Contact phone" disabled={busy}
              value={editVal(s, 'contact_phone')} onChange={e => setEdit(s.id, 'contact_phone', e.target.value)} />
          </div>
          <div style={C.row}>
            <input style={C.input} placeholder="Microsoft Bookings URL (shows the Book a session button)" aria-label="Booking URL" disabled={busy}
              value={editVal(s, 'booking_url')} onChange={e => setEdit(s.id, 'booking_url', e.target.value)} />
          </div>
          <textarea style={{ ...C.input, minHeight: 44, resize: 'vertical', marginBottom: 8 }} placeholder="What the booking session covers (shown above the button)"
            aria-label="Booking note" disabled={busy}
            value={editVal(s, 'booking_note')} onChange={e => setEdit(s.id, 'booking_note', e.target.value)} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <textarea style={{ ...C.input, flex: '1 1 260px', minHeight: 36, resize: 'vertical', background: '#fffdf5' }}
              placeholder="Internal review note (never shown publicly; clear it once II&DL confirms)"
              aria-label="Internal review note" disabled={busy}
              value={editVal(s, 'review_note')} onChange={e => setEdit(s.id, 'review_note', e.target.value)} />
            <button style={C.btn} disabled={busy || !edits[s.id]}
              onClick={() => act({ action: 'service_update', id: s.id, ...edits[s.id] })}>Save</button>
            <button style={C.btnDanger} disabled={busy}
              onClick={() => { if (confirm(`Remove "${s.name}" from the directory?`)) act({ action: 'service_delete', id: s.id }) }}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ ...C.card, color: '#6b7280', textAlign: 'center' }}>
          {query ? `No services match "${query}".` : 'No services to show.'}
        </div>
      )}

      {/* NEW SERVICE */}
      <div style={{ ...C.card, background: '#f9fafb' }}>
        <div style={C.sublabel}>{showNew ? 'New service' : ' '}</div>
        {showNew ? (
          <>
            <div style={C.row}>
              <input style={C.input} placeholder="Service name *" aria-label="New service name" value={newService.name}
                onChange={e => setNewService({ ...newService, name: e.target.value })} />
              <select style={C.sel} aria-label="New service unit" value={newService.unit_slug}
                onChange={e => setNewService({ ...newService, unit_slug: e.target.value })}>
                {unitOptions}
              </select>
            </div>
            <textarea style={{ ...C.input, minHeight: 52, resize: 'vertical', marginBottom: 8 }} placeholder="Service description"
              aria-label="New service description" value={newService.description}
              onChange={e => setNewService({ ...newService, description: e.target.value })} />
            <div style={C.row}>
              <input style={C.input} placeholder="Contact name" aria-label="New contact name" value={newService.contact_name}
                onChange={e => setNewService({ ...newService, contact_name: e.target.value })} />
              <input style={C.input} placeholder="Contact title" aria-label="New contact title" value={newService.contact_title}
                onChange={e => setNewService({ ...newService, contact_title: e.target.value })} />
              <input style={C.input} placeholder="Contact email" aria-label="New contact email" value={newService.contact_email}
                onChange={e => setNewService({ ...newService, contact_email: e.target.value })} />
              <input style={C.input} placeholder="Contact phone" aria-label="New contact phone" value={newService.contact_phone}
                onChange={e => setNewService({ ...newService, contact_phone: e.target.value })} />
            </div>
            <div style={C.row}>
              <input style={C.input} placeholder="Microsoft Bookings URL" aria-label="New booking URL" value={newService.booking_url}
                onChange={e => setNewService({ ...newService, booking_url: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <textarea style={{ ...C.input, flex: '1 1 260px', minHeight: 44, resize: 'vertical' }} placeholder="What the booking session covers"
                aria-label="New booking note" value={newService.booking_note}
                onChange={e => setNewService({ ...newService, booking_note: e.target.value })} />
              <button style={C.btnPrimary} disabled={busy || !newService.name.trim()}
                onClick={async () => {
                  const nextOrder = services.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1
                  const ok = await act({ action: 'service_create', ...newService, sort_order: nextOrder })
                  if (ok) { setNewService(EMPTY_NEW); setShowNew(false) }
                }}>Add service</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewService(EMPTY_NEW) }}>Cancel</button>
            </div>
          </>
        ) : (
          <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => setShowNew(true)}>+ Add service</button>
        )}
      </div>
    </div>
  )
}
