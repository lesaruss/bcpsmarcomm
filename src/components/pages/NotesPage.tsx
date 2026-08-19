'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Doc {
  id: string
  slug: string
  title: string
  description: string | null
  type: string | null
  date: string | null
  date_sort: string | null
  icon: string | null
  section: 'documents' | 'meeting-notes' | 'records'
  visibility: string
  sensitive: boolean
  doc_url: string
  is_dynamic: boolean
  can_edit: boolean
  featured: boolean
  series_id: string | null
  series_title: string | null
  effective_object_id: string
}

type Group = { id: string; slug: string; name: string }
type Member = { user_id: string; email: string; name: string }
type Grant = { id: string; object_id: string; subject_type: string; subject_id: string; role: string }
type Series = { id: string; slug: string; title: string; section: string | null }

const ROLE_OPTS = ['view', 'comment', 'edit', 'manage']
const BLUE = '#1672A7'
const A = {
  btn: { padding: '5px 10px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '5px 10px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sel: { padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}
const isExternal = (url: string) => /^https?:\/\//i.test(url)

// Meeting Notes is now the single home for meeting notes (2026-08-19, per
// Sean/V) - it used to be a stripped-down read-only list backed by
// mock_pages/brief, with a separate, fuller-featured copy living as a tab
// inside Documents (backed by acl_objects, with real Access/Edit/Request
// tooling). That duplication was the confusion Sean flagged ("I don't know
// what I'm... everything says..."). This page now IS that fuller version -
// same acl_objects-backed /api/bcps/documents source and the same
// Access/Edit/Request-an-edit tools as Documents and Records, permanently
// filtered to section='meeting-notes', still grouped by series/department
// like the old Documents tab did.
export default function NotesPage() {
  const supabase = createClient()
  const [preview, setPreview] = useState<Doc | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [role, setRole] = useState('user')
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [panel, setPanel] = useState<Record<string, 'access' | 'content' | 'request' | null>>({})
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const [contentLoading, setContentLoading] = useState<Record<string, boolean>>({})
  const [requestDraft, setRequestDraft] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [allSeries, setAllSeries] = useState<Series[]>([])
  const [seriesFilter, setSeriesFilter] = useState<string>('all')

  const isAdmin = role === 'admin' || role === 'superadmin'
  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/documents', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setDocs((j.documents ?? []).filter((d: Doc) => (d.section || 'documents') === 'meeting-notes'))
    setRole(j.role)
    setGroups(j.groups ?? []); setMembers(j.members ?? []); setGrants(j.grants ?? [])
    setAllSeries((j.all_series ?? []).filter((s: Series) => s.section === 'meeting-notes'))
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/documents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    return j
  }, [token])

  const grantsFor = (objectId: string) => grants.filter(g => g.object_id === objectId)
  const groupName = (gid: string) => groups.find(g => g.id === gid)?.name || 'Group'
  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.name || 'Unknown'

  const toggle = (slug: string, which: 'access' | 'content' | 'request') =>
    setPanel(prev => ({ ...prev, [slug]: prev[slug] === which ? null : which }))

  const submitRequest = async (d: Doc) => {
    const prompt = (requestDraft[d.slug] || '').trim()
    if (!prompt) return
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/document-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', doc_slug: d.slug, prompt }),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Could not submit request'); return }
    setRequestDraft(prev => ({ ...prev, [d.slug]: '' }))
    setPanel(prev => ({ ...prev, [d.slug]: null }))
    showToast(j.requires_approval
      ? `Request submitted - waiting for ${d.title}'s owner to approve.`
      : `Request submitted and queued for an agent to draft.`)
  }

  const openContent = async (d: Doc) => {
    toggle(d.slug, 'content')
    if (panel[d.slug] === 'content' || contentDraft[d.slug] !== undefined) return
    setContentLoading(prev => ({ ...prev, [d.slug]: true }))
    const t = await token()
    const r = await fetch(`/api/bcps/documents?content_slug=${encodeURIComponent(d.slug)}`, { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    setContentLoading(prev => ({ ...prev, [d.slug]: false }))
    if (r.ok) setContentDraft(prev => ({ ...prev, [d.slug]: j.content }))
    else setErr(j.error || 'Could not load content')
  }

  const saveContent = async (d: Doc) => {
    const j = await act({ action: 'content_save', slug: d.slug, content: contentDraft[d.slug] ?? '' })
    if (j) showToast(`${d.title} saved`)
  }

  const replacePdf = async (d: Doc, file: File) => {
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(',')[1] || ''
      const j = await act({ action: 'pdf_replace', slug: d.slug, base64, filename: file.name })
      if (j) showToast(j.note || `${d.title} file replaced`)
    }
    reader.readAsDataURL(file)
  }

  const grantAdd = (d: Doc) => async (subjectType: string, subjectId: string, roleVal: string) => {
    const j = await act({ action: 'grant_set', grant: true, slug: d.slug, subject_type: subjectType, subject_id: subjectId, role: roleVal })
    if (j) await load()
  }
  const grantRoleChange = (d: Doc, g: Grant) => async (roleVal: string) => {
    const j = await act({ action: 'grant_set', grant: true, slug: d.slug, subject_type: g.subject_type, subject_id: g.subject_id, role: roleVal })
    if (j) await load()
  }
  const grantRemove = (d: Doc, g: Grant) => async () => {
    const j = await act({ action: 'grant_set', grant: false, slug: d.slug, subject_type: g.subject_type, subject_id: g.subject_id })
    if (j) await load()
  }

  const toggleFeatured = async (d: Doc) => {
    const j = await act({ action: 'meta_update', slug: d.slug, featured: !d.featured })
    if (j) await load()
  }

  const accessBadge = (d: Doc) => {
    if (d.visibility === 'public') return { label: 'Public', icon: '\u{1F310}' }
    const n = grantsFor(d.effective_object_id).length
    return n > 0 ? { label: `${n} granted`, icon: '\u{1F512}' } : { label: 'Admins only', icon: '\u{1F512}' }
  }

  const dateVal = (d: Doc) => d.date_sort ? new Date(d.date_sort).getTime() : 0

  const filtered = useMemo(() => {
    let list = docs
    if (seriesFilter !== 'all') list = list.filter(d => d.series_id === seriesFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.title.toLowerCase().includes(q) || (d.series_title || '').toLowerCase().includes(q))
    }
    return list
  }, [docs, search, seriesFilter])

  // Default "All" view: one flat list across every meeting series, newest
  // first - per Sean/V 2026-08-19 ("sorted by ALL as a default
  // chronologically"). Picking a specific series from the filter narrows to
  // just that series' notes, still newest first.
  const chronological = useMemo(() => [...filtered].sort((a, b) => dateVal(b) - dateVal(a)), [filtered])

  // Series with zero notes yet (e.g. District Web Team Huddle, OOC Web
  // Meeting) still need to show up as filter options and as an honest empty
  // state, rather than silently disappearing because nothing's been
  // captured into them yet.
  const emptySeries = useMemo(() => {
    if (seriesFilter !== 'all') return []
    const withDocs = new Set(docs.map(d => d.series_id).filter(Boolean))
    return allSeries.filter(s => !withDocs.has(s.id))
  }, [allSeries, docs, seriesFilter])

  if (loading) return <div style={{ padding: 32 }}>Loading meeting notes...</div>

  return (
    <div style={{ padding: '0' }}>
      <style>{`
        .docs-section { padding: 32px; background: #ffffff; }
        .docs-header h1 { font-size: 32px; font-weight: 900; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: -0.02em; }
        .docs-header p { font-size: 14px; color: rgba(26,26,26,0.55); margin: 0 0 24px 0; line-height: 1.6; }
        .notes-search-wrap { position: relative; max-width: 360px; margin-bottom: 28px; }
        .notes-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .notes-search { width: 100%; padding: 9px 14px 9px 36px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-family: inherit; outline: none; background: #fff; color: #1a1a1a; }
        .docs-section-group { margin-bottom: 48px; }
        .docs-section-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #1672A7; margin: 0 0 6px 0; }
        .docs-section-divider { height: 1px; background: rgba(0,0,0,0.07); margin-bottom: 20px; }
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
        .doc-card { display: block; background: #ffffff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 24px; text-decoration: none; color: inherit; transition: all 0.2s ease; position: relative; }
        .doc-card:hover { border-color: #1672A7; box-shadow: 0 4px 16px rgba(22,114,167,0.15); }
        .doc-icon { width: 48px; height: 48px; background: rgba(22,114,167,0.08); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
        .doc-icon-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .doc-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0; line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
        .doc-description { font-size: 13px; color: rgba(26,26,26,0.55); margin: 0 0 14px 0; line-height: 1.5; }
        .doc-meta { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.09); font-size: 11px; color: rgba(26,26,26,0.35); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
        .doc-type-notes { background: rgba(22,117,12,0.08); color: #16750C; padding: 3px 8px; border-radius: 3px; }
        .doc-badge-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
        .doc-star-btn { border: none; background: none; cursor: pointer; font-size: 17px; line-height: 1; color: #9ca3af; padding: 0; }
        .doc-star-btn:hover { color: #B45309; }
        .doc-star-btn-active { color: #B45309; }
        .doc-featured-badge { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #B45309; background: rgba(180,83,9,0.12); padding: 3px 8px; border-radius: 99px; }
        .doc-actions-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
        .doc-access-badge { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; background: #f3f4f6; padding: 3px 8px; border-radius: 99px; }
        .doc-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.09); }
        .doc-series-note { font-size: 11px; color: #1672A7; background: rgba(22,114,167,0.08); border-radius: 6px; padding: 6px 10px; margin-bottom: 10px; font-weight: 700; }
        .lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: none; align-items: center; justify-content: center; padding: 24px; z-index: 1000; }
        .lightbox.active { display: flex; }
        .lightbox-content { width: 100%; max-width: 1120px; height: 88vh; background: #ffffff; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .lightbox-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.09); flex-shrink: 0; }
        .lightbox-title { font-size: 13px; font-weight: 800; color: #1a1a1a; text-transform: uppercase; letter-spacing: 0.05em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .lightbox-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .lightbox-open-btn { font-size: 11px; font-weight: 700; color: #7d4a00; text-decoration: none; border: 1px solid rgba(0,0,0,0.09); border-radius: 99px; padding: 6px 12px; text-transform: uppercase; letter-spacing: 0.05em; background: #ffffff; cursor: pointer; transition: all 0.15s; font-family: inherit; }
        .lightbox-open-btn:hover { border-color: #7d4a00; background: rgba(125,74,0,0.04); }
        .lightbox-close-btn { width: 32px; height: 32px; border-radius: 99px; border: 1px solid rgba(0,0,0,0.09); background: #ffffff; color: #1a1a1a; font-size: 18px; line-height: 1; cursor: pointer; transition: all 0.15s; flex-shrink: 0; font-family: inherit; font-weight: 400; }
        .lightbox-close-btn:hover { border-color: #1a1a1a; background: #fafafa; }
        .lightbox-iframe { flex: 1; width: 100%; border: none; }
        @media (max-width: 600px) { .docs-section { padding: 16px; } .docs-header h1 { font-size: 24px; } .docs-grid { grid-template-columns: 1fr; } .lightbox { padding: 12px; } .lightbox-content { max-width: 100%; } }
      `}</style>

      <div className="docs-section">
        <div className="docs-header">
          <h1>Meeting Notes</h1>
          <p>Notes and recaps from every recurring meeting you have access to, newest first. Use the filter to narrow to one meeting.
            {isAdmin && ' As an admin, each one also shows who has access and an Edit button to manage access or content directly here.'}
          </p>
        </div>

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 20px' }}>{err}</div>}
        {toast && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 20px' }}>{toast}</div>}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 28 }}>
          <div className="notes-search-wrap" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
            <svg className="notes-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="notes-search"
              placeholder="Search meeting notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search meeting notes"
            />
          </div>
          <select
            style={A.sel}
            value={seriesFilter}
            onChange={e => setSeriesFilter(e.target.value)}
            aria-label="Filter by meeting"
          >
            <option value="all">All meetings</option>
            {allSeries.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <p className="docs-section-label">
          {seriesFilter === 'all' ? 'All Meetings' : allSeries.find(s => s.id === seriesFilter)?.title || 'Meeting'}
        </p>
        <div className="docs-section-divider" />

        {chronological.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: emptySeries.length ? 24 : 0 }}>
            {search ? 'Nothing matches your search.' : 'No meeting notes yet for this meeting.'}
          </div>
        ) : (
            <div className="docs-grid">
              {chronological.map(doc => {
                const badge = accessBadge(doc)
                const openPanel = panel[doc.slug]
                const dgrants = grantsFor(doc.effective_object_id)
                return (
                  <div key={doc.id} className="doc-card">
                    {(isAdmin || doc.featured || isExternal(doc.doc_url)) && (
                      <div className="doc-badge-row">
                        {isAdmin && <span className="doc-access-badge">{badge.icon} {badge.label}</span>}
                        {isExternal(doc.doc_url) && <span className="doc-access-badge">&#8599; Opens on another site</span>}
                        {isAdmin && (
                          <button
                            type="button"
                            className={doc.featured ? 'doc-star-btn doc-star-btn-active' : 'doc-star-btn'}
                            onClick={() => toggleFeatured(doc)}
                            title={doc.featured ? 'Remove from featured' : 'Feature this note'}
                          >
                            {doc.featured ? '★' : '☆'}
                          </button>
                        )}
                        {!isAdmin && doc.featured && <span className="doc-featured-badge">&#9733; Featured</span>}
                      </div>
                    )}

                    <button
                      onClick={() => isExternal(doc.doc_url) ? window.open(doc.doc_url, '_blank', 'noopener,noreferrer') : setPreview(doc)}
                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}
                    >
                      <div className="doc-icon-row">
                        <div className="doc-icon">{doc.icon}</div>
                        <div>
                          <h2 className="doc-title">{doc.title}</h2>
                          {seriesFilter === 'all' && doc.series_title && (
                            <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1672A7', marginTop: 4 }}>{doc.series_title}</div>
                          )}
                        </div>
                      </div>
                      <p className="doc-description">{doc.description}</p>
                    </button>

                    <div className="doc-actions-row">
                      {isAdmin && (
                        <button style={openPanel === 'access' ? A.btnPrimary : A.btn} onClick={() => toggle(doc.slug, 'access')}>
                          Access
                        </button>
                      )}
                      {isAdmin && (
                        <button style={openPanel === 'content' ? A.btnPrimary : A.btn} onClick={() => openContent(doc)}>
                          Edit
                        </button>
                      )}
                      <button style={openPanel === 'request' ? A.btnPrimary : A.btn} onClick={() => toggle(doc.slug, 'request')}>
                        Request an edit
                      </button>
                    </div>

                    <div className="doc-meta">
                      <span className="doc-type-notes">{doc.type}</span>
                      <span>{doc.date}</span>
                    </div>

                    {openPanel === 'access' && isAdmin && (
                      <div className="doc-panel">
                        <div style={A.sublabel}>Who can access {doc.title}</div>
                        {doc.series_id && (
                          <div className="doc-series-note">
                            Part of the {doc.series_title || 'series'} series - access applies to every note in this series, including new ones created later.
                          </div>
                        )}
                        {dgrants.length === 0 && (
                          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                            {doc.visibility === 'public' ? 'Visible to everyone with a BCPS Marcomm login.' : 'No one granted yet - admins can always access it.'}
                          </div>
                        )}
                        {dgrants.map(g => (
                          <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600 }}>{g.subject_type === 'group' ? groupName(g.subject_id) : memberName(g.subject_id)}</span>
                            <span style={{ fontSize: 10, color: '#9ca3af' }}>{g.subject_type}</span>
                            <select style={A.sel} value={g.role} disabled={busy} onChange={e => grantRoleChange(doc, g)(e.target.value)}>
                              {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <button style={{ ...A.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={grantRemove(doc, g)}>Remove</button>
                          </div>
                        ))}
                        <AddPerson groups={groups} members={members} disabled={busy} onAdd={grantAdd(doc)} />
                      </div>
                    )}

                    {openPanel === 'content' && isAdmin && (
                      <div className="doc-panel">
                        <div style={A.sublabel}>Edit content</div>
                        {doc.is_dynamic ? (
                          <>
                            {contentLoading[doc.slug] ? (
                              <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading...</div>
                            ) : (
                              <>
                                <textarea
                                  value={contentDraft[doc.slug] ?? ''}
                                  onChange={e => setContentDraft(prev => ({ ...prev, [doc.slug]: e.target.value }))}
                                  style={{ width: '100%', height: 260, fontFamily: 'ui-monospace, monospace', fontSize: 11, padding: 10, border: '1px solid #d1d5db', borderRadius: 6, resize: 'vertical' }}
                                />
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                  <button style={A.btnPrimary} disabled={busy} onClick={() => saveContent(doc)}>Save</button>
                                  <a href={doc.doc_url} target="_blank" rel="noopener noreferrer" style={{ ...A.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View live &#8599;</a>
                                </div>
                              </>
                            )}
                          </>
                        ) : doc.doc_url.endsWith('.pdf') ? (
                          <div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>This is a PDF. Upload a replacement file to update it in place - the link stays the same.</div>
                            <input type="file" accept="application/pdf" disabled={busy}
                              onChange={e => { const f = e.target.files?.[0]; if (f) replacePdf(doc, f) }} />
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>This note isn&apos;t database-backed yet and can&apos;t be edited here.</div>
                        )}
                      </div>
                    )}

                    {openPanel === 'request' && (
                      <div className="doc-panel">
                        <div style={A.sublabel}>Request a change to {doc.title}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                          Describe what you&apos;d like changed, in plain language. {doc.can_edit && !doc.sensitive
                            ? 'Since you have edit access, this goes straight into the agent queue.'
                            : doc.sensitive
                              ? "This is a sensitive note, so it always goes to the owner for approval first, then into the agent queue."
                              : "This goes to the note's owner for approval, then into the agent queue."}
                        </div>
                        <textarea
                          value={requestDraft[doc.slug] ?? ''}
                          onChange={e => setRequestDraft(prev => ({ ...prev, [doc.slug]: e.target.value }))}
                          placeholder="e.g. Add the follow-up owner for the roster deadline item."
                          style={{ width: '100%', height: 90, fontFamily: 'inherit', fontSize: 12, padding: 10, border: '1px solid #d1d5db', borderRadius: 6, resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button style={A.btnPrimary} disabled={busy || !(requestDraft[doc.slug] || '').trim()} onClick={() => submitRequest(doc)}>Submit request</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
        )}

        {emptySeries.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <p className="docs-section-label">Other Meetings (No Notes Yet)</p>
            <div className="docs-section-divider" />
            <div className="docs-grid">
              {emptySeries.map(s => (
                <div key={s.id} className="doc-card" style={{ opacity: 0.6 }}>
                  <div className="doc-icon-row">
                    <div className="doc-icon">📁</div>
                    <h2 className="doc-title">{s.title}</h2>
                  </div>
                  <p className="doc-description">Nothing captured here yet.</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="lightbox active" onClick={() => setPreview(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-title">{preview.title}</span>
              <div className="lightbox-actions">
                <a href={preview.doc_url} target="_blank" rel="noopener noreferrer" className="lightbox-open-btn">Open full page &#8599;</a>
                <button className="lightbox-close-btn" onClick={() => setPreview(null)} aria-label="Close preview">&times;</button>
              </div>
            </div>
            <iframe className="lightbox-iframe" src={preview.doc_url} title={preview.title} />
          </div>
        </div>
      )}
    </div>
  )
}

function AddPerson({ groups, members, disabled, onAdd }: {
  groups: Group[]; members: Member[]; disabled: boolean; onAdd: (subjectType: string, subjectId: string, role: string) => void
}) {
  const [pick, setPick] = useState('')
  const [role, setRole] = useState('view')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <select style={A.sel} value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">Add group or person...</option>
        <optgroup label="Groups">{groups.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
        <optgroup label="People">{members.map(m => <option key={m.user_id} value={`user:${m.user_id}`}>{m.name || m.email}</option>)}</optgroup>
      </select>
      <select style={A.sel} value={role} onChange={e => setRole(e.target.value)}>
        {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <button style={{ ...A.btn, borderColor: BLUE, color: BLUE }} disabled={disabled || !pick}
        onClick={() => { const [st, sid] = pick.split(':'); onAdd(st, sid, role); setPick('') }}>
        Add
      </button>
    </div>
  )
}
