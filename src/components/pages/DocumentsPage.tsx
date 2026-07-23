'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Doc {
  id: string
  slug: string
  title: string
  description: string | null
  type: string | null
  date: string | null
  icon: string | null
  section: 'documents' | 'meeting-notes' | 'records'
  visibility: string
  sensitive: boolean
  doc_url: string
  is_dynamic: boolean
  can_edit: boolean
}

type Group = { id: string; slug: string; name: string }
type Member = { user_id: string; email: string; name: string }
type Grant = { id: string; object_id: string; subject_type: string; subject_id: string; role: string }

const SECTIONS = [
  { key: 'documents', label: 'Documents', description: 'Plans, governance frameworks, implementation guides, and reference documents.' },
  { key: 'meeting-notes', label: 'Meeting Notes', description: 'Notes and action items from platform sessions, hot labs, and planning meetings.' },
  { key: 'records', label: 'Records', description: 'Performance appraisals and confidential employment records.' },
]

const ROLE_OPTS = ['view', 'comment', 'edit', 'manage']
const BLUE = '#1672A7'
const A = {
  btn: { padding: '5px 10px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '5px 10px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sel: { padding: '5px 7px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 11, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function DocumentsPage() {
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
  const [panel, setPanel] = useState<Record<string, 'access' | 'content' | null>>({})
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const [contentLoading, setContentLoading] = useState<Record<string, boolean>>({})

  const isAdmin = role === 'admin' || role === 'superadmin'
  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/documents', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setDocs(j.documents ?? []); setRole(j.role)
    setGroups(j.groups ?? []); setMembers(j.members ?? []); setGrants(j.grants ?? [])
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

  const toggle = (slug: string, which: 'access' | 'content') =>
    setPanel(prev => ({ ...prev, [slug]: prev[slug] === which ? null : which }))

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

  const accessBadge = (d: Doc) => {
    if (d.visibility === 'public') return { label: 'Public', icon: '🌐' }
    const n = grantsFor(d.id).length
    return n > 0 ? { label: `${n} granted`, icon: '🔒' } : { label: 'Admins only', icon: '🔒' }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading documents...</div>

  return (
    <div style={{ padding: '0' }}>
      <style>{`
        .docs-section { padding: 32px; background: #ffffff; }
        .docs-header h1 { font-size: 32px; font-weight: 900; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: -0.02em; }
        .docs-header p { font-size: 14px; color: rgba(26,26,26,0.55); margin: 0 0 32px 0; line-height: 1.6; }
        .docs-section-group { margin-bottom: 48px; }
        .docs-section-label { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.2em; color: #1672A7; margin: 0 0 6px 0; }
        .docs-section-desc { font-size: 12px; color: rgba(26,26,26,0.45); margin: 0 0 20px 0; font-weight: 600; }
        .docs-section-divider { height: 1px; background: rgba(0,0,0,0.07); margin-bottom: 20px; }
        .docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; align-items: start; }
        .doc-card { display: block; background: #ffffff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 24px; text-decoration: none; color: inherit; transition: all 0.2s ease; position: relative; }
        .doc-card:hover { border-color: #1672A7; box-shadow: 0 4px 16px rgba(22,114,167,0.15); }
        .doc-icon { width: 48px; height: 48px; background: rgba(22,114,167,0.08); border-radius: 6px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; }
        .doc-title { font-size: 16px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px 0; line-height: 1.3; }
        .doc-description { font-size: 13px; color: rgba(26,26,26,0.55); margin: 0 0 16px 0; line-height: 1.5; }
        .doc-meta { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.09); font-size: 11px; color: rgba(26,26,26,0.35); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
        .doc-type { background: rgba(22,114,167,0.10); color: #1672A7; padding: 3px 8px; border-radius: 3px; }
        .doc-type-notes { background: rgba(22,117,12,0.08); color: #16750C; padding: 3px 8px; border-radius: 3px; }
        .doc-type-record { background: rgba(197,83,38,0.07); color: #7d3018; padding: 3px 8px; border-radius: 3px; }
        .doc-admin-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
        .doc-access-badge { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; background: #f3f4f6; padding: 3px 8px; border-radius: 99px; }
        .doc-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid rgba(0,0,0,0.09); }
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
          <h1>Documents</h1>
          <p>BCPS marketing communications plans, governance documents, meeting notes, and records. Click any document to preview.
            {isAdmin && ' As an admin, each document shows who has access and an Edit button to manage access or content directly here.'}
          </p>
        </div>

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 20px' }}>{err}</div>}
        {toast && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 20px' }}>{toast}</div>}

        {SECTIONS.map(section => {
          const sectionDocs = docs.filter(d => (d.section || 'documents') === section.key)
          if (sectionDocs.length === 0) return null
          return (
            <div key={section.key} className="docs-section-group">
              <h2 className="docs-section-label">{section.label}</h2>
              <p className="docs-section-desc">{section.description}</p>
              <div className="docs-section-divider" />
              <div className="docs-grid">
                {sectionDocs.map(doc => {
                  const badge = accessBadge(doc)
                  const openPanel = panel[doc.slug]
                  const dgrants = grantsFor(doc.id)
                  return (
                    <div key={doc.id} className="doc-card">
                      {isAdmin && (
                        <div className="doc-admin-bar">
                          <span className="doc-access-badge">{badge.icon} {badge.label}</span>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={openPanel === 'access' ? A.btnPrimary : A.btn} onClick={() => toggle(doc.slug, 'access')}>
                              Access
                            </button>
                            <button style={openPanel === 'content' ? A.btnPrimary : A.btn} onClick={() => openContent(doc)}>
                              Edit
                            </button>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setPreview(doc)}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' }}
                      >
                        <div className="doc-icon">{doc.icon}</div>
                        <h2 className="doc-title">{doc.title}</h2>
                        <p className="doc-description">{doc.description}</p>
                        <div className="doc-meta">
                          <span className={
                            section.key === 'meeting-notes' ? 'doc-type-notes' :
                            section.key === 'records' ? 'doc-type-record' :
                            'doc-type'
                          }>{doc.type}</span>
                          <span>{doc.date}</span>
                        </div>
                      </button>

                      {openPanel === 'access' && isAdmin && (
                        <div className="doc-panel">
                          <div style={A.sublabel}>Who can access {doc.title}</div>
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
                                    <a href={doc.doc_url} target="_blank" rel="noopener noreferrer" style={{ ...A.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>View live ↗</a>
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
                            <div style={{ fontSize: 12, color: '#9ca3af' }}>This document isn&apos;t database-backed yet and can&apos;t be edited here.</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {preview && (
        <div className="lightbox active" onClick={() => setPreview(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-title">{preview.title}</span>
              <div className="lightbox-actions">
                <a href={preview.doc_url} target="_blank" rel="noopener noreferrer" className="lightbox-open-btn">Open full page ↗</a>
                <button className="lightbox-close-btn" onClick={() => setPreview(null)} aria-label="Close preview">x</button>
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
