'use client'

// Admin editor for the District Software Inventory widget (public embed at
// /embeds/software-inventory.html). Same pattern as the II&DL Services
// Directory editor (src/components/pages/IidlServicesPage.tsx): search the
// list, open a row, edit fields inline with a Save button that only enables
// once something changed, delete with confirm, and an add form. The
// "Internal" fields (CTC rating, agreement status, contract file, etc.) are
// never readable by the public embed.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Item = Record<string, any> & { id: string; program_name: string }

const BLUE = '#1672A7'
const PUBLIC_FIELDS: [string, string][] = [
  ['program_name', 'Program name'], ['vendor', 'Vendor'], ['subject', 'Subject'], ['department', 'Department'],
  ['grade_band', 'Grade band (e.g. K-5, 6-12)'], ['intended_use', 'Intended use'], ['bid_id', 'Bid / Agreement ID'],
  ['vendor_terms_label', 'Vendor terms label'], ['vendor_terms_url', 'Vendor terms URL'],
  ['board_agreement_url', 'School Board agreement URL'],
]
const INTERNAL_FIELDS: [string, string][] = [
  ['ctc_rating', 'CTC rating'], ['agreement_vendor', 'Agreement vendor'], ['contract_file_name', 'Contract file name'],
  ['ctc_updated', 'CTC updated'], ['software_type', 'Software type'], ['usage_type', 'Usage type'],
]

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 10 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%', minWidth: 0 } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', margin: '10px 0 6px' } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#4b5563' } as React.CSSProperties,
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 8 } as React.CSSProperties,
}

export default function SoftwareInventoryPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [draft, setDraft] = useState<Record<string, string> | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/software-inventory', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setItems(j.items); setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/software-inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (payload.action === 'update') setEdits(prev => { const n = { ...prev }; delete n[payload.id as string]; return n })
    await load(); return j
  }, [token, load])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return items
    return items.filter(i => ['program_name', 'vendor', 'subject', 'department', 'bid_id']
      .some(f => String(i[f] ?? '').toLowerCase().includes(q)))
  }, [items, query])

  const val = (row: Item, f: string) => edits[row.id]?.[f] ?? (row[f] ?? '')
  const setVal = (id: string, f: string, v: string) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [f]: v } }))

  const fieldGrid = (fields: [string, string][], get: (f: string) => string, set: (f: string, v: string) => void) => (
    <div style={C.row}>
      {fields.map(([f, label]) => (
        <label key={f} style={C.label}>{label}
          <input style={C.input} value={get(f)} onChange={e => set(f, e.target.value)} />
        </label>
      ))}
    </div>
  )

  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 13 }}>Loading software inventory...</div>

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {err && <div style={{ ...C.card, borderColor: '#fecaca', color: '#b91c1c', fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input style={{ ...C.input, flex: 1 }} placeholder={`Search ${items.length} programs...`} value={query}
          onChange={e => setQuery(e.target.value)} aria-label="Search programs" />
        <button style={C.btnPrimary} onClick={() => setDraft({})} disabled={!!draft}>Add program</button>
      </div>

      {draft && (
        <div style={{ ...C.card, borderColor: BLUE }}>
          <div style={C.sublabel}>New program</div>
          {fieldGrid(PUBLIC_FIELDS, f => draft[f] ?? '', (f, v) => setDraft(d => ({ ...d, [f]: v })))}
          <label style={{ ...C.label, marginTop: 8 }}>Description
            <textarea style={{ ...C.input, minHeight: 60 }} value={draft.description ?? ''} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} />
          </label>
          <div style={C.sublabel}>Internal (not shown on the public embed)</div>
          {fieldGrid(INTERNAL_FIELDS, f => draft[f] ?? '', (f, v) => setDraft(d => ({ ...d, [f]: v })))}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={C.btnPrimary} disabled={busy || !draft.program_name?.trim()}
              onClick={async () => { if (await act({ action: 'create', ...draft })) setDraft(null) }}>Save program</button>
            <button style={C.btn} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Showing {filtered.length} of {items.length}</div>
      {filtered.map(row => {
        const dirty = !!edits[row.id] && Object.keys(edits[row.id]).length > 0
        const isOpen = open === row.id
        return (
          <div key={row.id} style={C.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setOpen(isOpen ? null : row.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{row.program_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>
                  {[row.vendor, row.subject, row.grade_band].filter(Boolean).join(' · ') || 'No vendor, subject, or grades yet'}
                </div>
              </div>
              <span style={{ fontSize: 12, color: BLUE, fontWeight: 700, flexShrink: 0 }}>{isOpen ? 'Close' : 'Edit'}</span>
            </div>
            {isOpen && (
              <div style={{ marginTop: 10 }}>
                {fieldGrid(PUBLIC_FIELDS, f => val(row, f), (f, v) => setVal(row.id, f, v))}
                <label style={{ ...C.label, marginTop: 8 }}>Description
                  <textarea style={{ ...C.input, minHeight: 60 }} value={val(row, 'description')} onChange={e => setVal(row.id, 'description', e.target.value)} />
                </label>
                <div style={C.sublabel}>Internal (not shown on the public embed)</div>
                {fieldGrid(INTERNAL_FIELDS, f => val(row, f), (f, v) => setVal(row.id, f, v))}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
                  <button style={C.btnPrimary} disabled={busy || !dirty}
                    onClick={() => act({ action: 'update', id: row.id, ...edits[row.id] })}>Save</button>
                  <button style={C.btnDanger} disabled={busy}
                    onClick={() => { if (confirm(`Delete ${row.program_name}? It will disappear from the public embed.`)) act({ action: 'delete', id: row.id }) }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
