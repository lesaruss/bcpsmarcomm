'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Category {
  id: string
  slug: string
  label: string
  icon_key: string
  sort_order: number
}

interface Link {
  id: string
  category_slug: string
  title: string
  url: string
  blurb: string | null
  sort_order: number
}

const ICON_OPTIONS = ['enroll', 'calendar', 'forms', 'support', 'portal', 'transport', 'none']
const BLUE = '#1672A7'

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function FindItFastPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [newCat, setNewCat] = useState({ slug: '', label: '', icon_key: 'none' })
  const [newLinkFor, setNewLinkFor] = useState<string | null>(null)
  const [newLink, setNewLink] = useState({ title: '', url: '', blurb: '' })
  const [edits, setEdits] = useState<Record<string, any>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/find-it-fast', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setCategories(j.categories); setLinks(j.links)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/find-it-fast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    // Clear the saved row's pending edits so its Save button goes back to
    // disabled once the write succeeds, instead of staying active forever
    // and making a successful save look like it did nothing.
    if (payload.id && (payload.action === 'category_update' || payload.action === 'link_update')) {
      setEdits(prev => {
        const next = { ...prev }
        delete next[payload.id]
        return next
      })
    }
    await load(); return j
  }, [token, load])

  if (loading) return <div style={{ padding: 32 }}>Loading Find It Fast content...</div>

  const linksFor = (slug: string) => links.filter(l => l.category_slug === slug).sort((a, b) => a.sort_order - b.sort_order)
  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  const setEdit = (id: string, field: string, value: string) =>
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  const editVal = (row: Category | Link, field: string) => edits[row.id]?.[field] ?? (row as any)[field]

  const move = (list: (Category | Link)[], id: string, dir: -1 | 1, table: 'category' | 'link') => {
    const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order)
    const idx = sorted.findIndex(x => x.id === id)
    const swapIdx = idx + dir
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return
    const a = sorted[idx], b = sorted[swapIdx]
    act({ action: 'reorder', items: [{ table, id: a.id, sort_order: b.sort_order }, { table, id: b.id, sort_order: a.sort_order }] })
  }

  return (
    <div style={{ padding: 32, maxWidth: 1000, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Find It Fast</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Edit the categories and resource links shown in the Find It Fast widget on the Back to School page.
        Changes here go live on browardschools.com immediately, no code push or deploy needed.
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      {/* CATEGORIES */}
      <div style={C.sublabel}>Categories ({sortedCats.length})</div>
      {sortedCats.map((cat, i) => (
        <div key={cat.id} style={C.card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input style={{ ...C.input, maxWidth: 220 }} disabled={busy}
              value={editVal(cat, 'label')} onChange={e => setEdit(cat.id, 'label', e.target.value)} />
            <select style={C.sel} disabled={busy} value={editVal(cat, 'icon_key')}
              onChange={e => setEdit(cat.id, 'icon_key', e.target.value)}>
              {ICON_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button style={C.btn} disabled={busy || !edits[cat.id]}
              onClick={() => act({ action: 'category_update', id: cat.id, ...edits[cat.id] })}>Save</button>
            <button style={C.btn} disabled={busy || i === 0} onClick={() => move(categories, cat.id, -1, 'category')}>↑</button>
            <button style={C.btn} disabled={busy || i === sortedCats.length - 1} onClick={() => move(categories, cat.id, 1, 'category')}>↓</button>
            <span style={{ fontSize: 11, color: '#9ca3af', flex: 1 }}>{linksFor(cat.slug).length} link{linksFor(cat.slug).length === 1 ? '' : 's'} · slug: {cat.slug}</span>
            <button style={C.btnDanger} disabled={busy}
              onClick={() => { if (confirm(`Delete category "${cat.label}"? Its links will be removed too.`)) act({ action: 'category_delete', id: cat.id }) }}>
              Delete category
            </button>
          </div>

          {/* Links in this category */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f1f1' }}>
            {linksFor(cat.slug).map((link, li) => {
              const list = linksFor(cat.slug)
              return (
                <div key={link.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap' }}>
                  <input style={{ ...C.input, maxWidth: 200 }} disabled={busy} placeholder="Title"
                    value={editVal(link, 'title')} onChange={e => setEdit(link.id, 'title', e.target.value)} />
                  <input style={{ ...C.input, maxWidth: 260 }} disabled={busy} placeholder="URL"
                    value={editVal(link, 'url')} onChange={e => setEdit(link.id, 'url', e.target.value)} />
                  <input style={{ ...C.input, maxWidth: 260 }} disabled={busy} placeholder="Blurb"
                    value={editVal(link, 'blurb') ?? ''} onChange={e => setEdit(link.id, 'blurb', e.target.value)} />
                  <button style={C.btn} disabled={busy || !edits[link.id]}
                    onClick={() => act({ action: 'link_update', id: link.id, ...edits[link.id] })}>Save</button>
                  <button style={C.btn} disabled={busy || li === 0} onClick={() => move(list, link.id, -1, 'link')}>↑</button>
                  <button style={C.btn} disabled={busy || li === list.length - 1} onClick={() => move(list, link.id, 1, 'link')}>↓</button>
                  <button style={C.btnDanger} disabled={busy}
                    onClick={() => { if (confirm(`Delete link "${link.title}"?`)) act({ action: 'link_delete', id: link.id }) }}>Delete</button>
                </div>
              )
            })}

            {newLinkFor === cat.slug ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 4 }}>
                <input style={{ ...C.input, maxWidth: 200 }} placeholder="Title" value={newLink.title}
                  onChange={e => setNewLink({ ...newLink, title: e.target.value })} />
                <input style={{ ...C.input, maxWidth: 260 }} placeholder="URL" value={newLink.url}
                  onChange={e => setNewLink({ ...newLink, url: e.target.value })} />
                <input style={{ ...C.input, maxWidth: 260 }} placeholder="Blurb" value={newLink.blurb}
                  onChange={e => setNewLink({ ...newLink, blurb: e.target.value })} />
                <button style={C.btnPrimary} disabled={busy || !newLink.title || !newLink.url}
                  onClick={async () => {
                    await act({ action: 'link_create', category_slug: cat.slug, ...newLink, sort_order: linksFor(cat.slug).length + 1 })
                    setNewLink({ title: '', url: '', blurb: '' }); setNewLinkFor(null)
                  }}>Add</button>
                <button style={C.btn} onClick={() => { setNewLinkFor(null); setNewLink({ title: '', url: '', blurb: '' }) }}>Cancel</button>
              </div>
            ) : (
              <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => setNewLinkFor(cat.slug)}>+ Add link</button>
            )}
          </div>
        </div>
      ))}

      {/* NEW CATEGORY */}
      <div style={{ ...C.card, background: '#f9fafb' }}>
        <div style={C.sublabel}>New category</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input style={{ ...C.input, maxWidth: 160 }} placeholder="slug (e.g. safety)" value={newCat.slug}
            onChange={e => setNewCat({ ...newCat, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} />
          <input style={{ ...C.input, maxWidth: 220 }} placeholder="Label" value={newCat.label}
            onChange={e => setNewCat({ ...newCat, label: e.target.value })} />
          <select style={C.sel} value={newCat.icon_key} onChange={e => setNewCat({ ...newCat, icon_key: e.target.value })}>
            {ICON_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button style={C.btnPrimary} disabled={busy || !newCat.slug || !newCat.label}
            onClick={async () => {
              await act({ action: 'category_create', ...newCat, sort_order: categories.length + 1 })
              setNewCat({ slug: '', label: '', icon_key: 'none' })
            }}>Add category</button>
        </div>
      </div>

      <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 8 }}>
        Icon key controls which icon shows on the public widget (enroll, calendar, forms, support, portal, transport, or none).
      </p>
    </div>
  )
}
