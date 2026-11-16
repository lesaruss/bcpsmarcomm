'use client'

// Admin editor for the School Financial Reports widget (public embed at
// /embeds/school-financial-reports.html). Same pattern as the District
// Software Inventory editor (src/components/pages/SoftwareInventoryPage.tsx):
// search the list, open a report, edit inline with a Save button that only
// enables once something changed, replace the PDF, delete with confirm, and
// an add form for a new school or a new school year. New and replacement
// PDFs go to the bcps-public bucket through /api/bcps/school-financial-reports.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

type Item = { id: string; location_number: string; school_name: string; school_year: string; file_url: string; file_name: string | null; is_traditional: boolean }

const BLUE = '#1672A7'
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, marginBottom: 10 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%', minWidth: 0 } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', margin: '10px 0 6px' } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, fontWeight: 600, color: '#4b5563' } as React.CSSProperties,
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 8 } as React.CSSProperties,
}
const FIELDS: [keyof Item, string][] = [['location_number', 'Location # (4 digits)'], ['school_name', 'School name'], ['school_year', 'School year (e.g. 2025-2026)']]

function readPdf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'application/pdf') return reject(new Error('Choose a PDF file.'))
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read that file.'))
    r.readAsDataURL(file)
  })
}

export default function SchoolFinancialReportsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({})
  const [files, setFiles] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string> | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/school-financial-reports', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setItems(j.items); setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/school-financial-reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json().catch(() => ({ error: 'Action failed' })); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (payload.action === 'update') {
      const id = payload.id as string
      setEdits(prev => { const n = { ...prev }; delete n[id]; return n })
      setFiles(prev => { const n = { ...prev }; delete n[id]; return n })
    }
    await load(); return j
  }, [token, load])

  const pickFile = async (key: string, f: File | undefined) => {
    if (!f) return
    try { const d = await readPdf(f); setFiles(prev => ({ ...prev, [key]: d })); setErr('') }
    catch (e: any) { setErr(e.message) }
  }

  const years = useMemo(() => Array.from(new Set(items.map(i => i.school_year))).sort(), [items])
  const schools = useMemo(() => new Set(items.map(i => i.location_number)).size, [items])
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return items
    return items.filter(i => i.location_number.includes(q) || i.school_name.toLowerCase().includes(q) || i.school_year.includes(q))
  }, [items, query])

  const val = (row: Item, f: string) => edits[row.id]?.[f] ?? String((row as any)[f] ?? '')
  const setVal = (id: string, f: string, v: string) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [f]: v } }))

  if (loading) return <div style={{ padding: 20, color: '#6b7280', fontSize: 13 }}>Loading school financial reports...</div>

  return (
    <div style={{ fontFamily: 'inherit' }}>
      {err && <div style={{ ...C.card, borderColor: '#fecaca', color: '#b91c1c', fontSize: 13 }}>{err}</div>}
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
        {schools} schools · {items.length} reports · {years.map(y => `${y}: ${items.filter(i => i.school_year === y).length}`).join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input style={{ ...C.input, flex: 1 }} placeholder="Search by school, location #, or year..." value={query}
          onChange={e => setQuery(e.target.value)} aria-label="Search reports" />
        <button style={C.btnPrimary} onClick={() => setDraft({})} disabled={!!draft}>Add report</button>
      </div>

      {draft && (
        <div style={{ ...C.card, borderColor: BLUE }}>
          <div style={C.sublabel}>New report (a new school, or a new school year for an existing one)</div>
          <div style={C.row}>
            {FIELDS.map(([f, label]) => (
              <label key={f} style={C.label}>{label}
                <input style={C.input} value={draft[f] ?? ''} onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} />
              </label>
            ))}
          </div>
          <label style={{ ...C.label, marginTop: 8 }}>Report PDF
            <input type="file" accept="application/pdf" onChange={e => pickFile('__new', e.target.files?.[0])} />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={C.btnPrimary} disabled={busy || !draft.location_number?.trim() || !draft.school_name?.trim() || !draft.school_year?.trim() || !files.__new}
              onClick={async () => {
                if (await act({ action: 'create', ...draft, file: files.__new })) { setDraft(null); setFiles(p => { const n = { ...p }; delete n.__new; return n }) }
              }}>{busy ? 'Saving...' : 'Save report'}</button>
            <button style={C.btn} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Showing {filtered.length} of {items.length}</div>
      {filtered.map(row => {
        const dirty = (!!edits[row.id] && Object.keys(edits[row.id]).length > 0) || !!files[row.id]
        const isOpen = open === row.id
        return (
          <div key={row.id} style={C.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setOpen(isOpen ? null : row.id)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{row.location_number} · {row.school_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{row.school_year}{row.is_traditional === false ? ' · hidden from the embed (not a traditional school)' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                {/* Seeded PDFs are site-relative (/financial-reports/...); uploads are full bcps-public URLs. */}
                <a href={row.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  style={{ fontSize: 12, color: BLUE, fontWeight: 700 }}>View PDF</a>
                <span style={{ fontSize: 12, color: BLUE, fontWeight: 700 }}>{isOpen ? 'Close' : 'Edit'}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ marginTop: 10 }}>
                <div style={C.row}>
                  {FIELDS.map(([f, label]) => (
                    <label key={f} style={C.label}>{label}
                      <input style={C.input} value={val(row, f)} onChange={e => setVal(row.id, f, e.target.value)} />
                    </label>
                  ))}
                </div>
                <label style={{ ...C.label, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                  <input type="checkbox" checked={val(row, 'is_traditional') !== 'false'}
                    onChange={e => setVal(row.id, 'is_traditional', String(e.target.checked))} />
                  Show on the embed (traditional district school)
                </label>
                <label style={{ ...C.label, marginTop: 8 }}>Replace PDF {files[row.id] ? '(new file ready, click Save)' : ''}
                  <input type="file" accept="application/pdf" onChange={e => pickFile(row.id, e.target.files?.[0])} />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'space-between' }}>
                  <button style={C.btnPrimary} disabled={busy || !dirty}
                    onClick={() => act({ action: 'update', id: row.id, ...edits[row.id], ...(files[row.id] ? { file: files[row.id] } : {}) })}>
                    {busy ? 'Saving...' : 'Save'}</button>
                  <button style={C.btnDanger} disabled={busy}
                    onClick={() => { if (confirm(`Delete the ${row.school_year} report for ${row.school_name}? It will disappear from the public embed.`)) act({ action: 'delete', id: row.id }) }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
