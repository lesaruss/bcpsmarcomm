'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import FindItFastPage from './FindItFastPage'

interface Widget {
  id: string
  slug: string
  title: string
  description: string | null
  preview_path: string
  editor_component: string | null
  object_id: string | null
  can_edit: boolean
}

type Group = { id: string; slug: string; name: string; description: string | null }
type Member = { user_id: string; email: string; name: string; role: string; groups: string[] }
type Grant = { id: string; object_id: string; subject_type: string; subject_id: string; role: string }

// Maps a widget's editor_component key to the actual editor UI to render
// inline on its card. Add an entry here whenever a new widget gets an
// in-app editor - widgets with no entry just show preview + embed.
const EDITORS: Record<string, React.ComponentType> = {
  'find-it-fast': FindItFastPage,
}

const ROLE_OPTS = ['view', 'edit', 'manage']
const BLUE = '#1672A7'
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '7px 14px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function WidgetsPage() {
  const supabase = createClient()
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [role, setRole] = useState<string>('user')
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<Record<string, 'edit' | 'access' | null>>({})
  const [toast, setToast] = useState('')

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/widgets', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setWidgets(j.widgets); setRole(j.role)

    // Editor-assignment data only matters (and is only readable) for admins.
    if (j.role === 'admin' || j.role === 'superadmin') {
      const pr = await fetch('/api/bcps/permissions', { headers: { Authorization: `Bearer ${t}` } })
      if (pr.ok) {
        const pj = await pr.json()
        setGroups(pj.groups ?? []); setMembers(pj.members ?? []); setGrants(pj.grants ?? [])
      }
    }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const isAdmin = role === 'admin' || role === 'superadmin'

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/permissions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    await load(); return j
  }, [token, load])

  const grantsFor = (objectId: string | null) => objectId ? grants.filter(g => g.object_id === objectId) : []
  const groupName = (gid: string) => groups.find(g => g.id === gid)?.name || 'Group'
  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.name || 'Unknown'

  const toggle = (slug: string, panel: 'edit' | 'access') =>
    setExpanded(prev => ({ ...prev, [slug]: prev[slug] === panel ? null : panel }))

  const copyEmbed = async (w: Widget) => {
    const src = `https://bcpsmarcomm.com${w.preview_path}`
    const snippet = `<iframe src="${src}" style="width:100%;border:0;" title="${w.title}"></iframe>`
    try {
      await navigator.clipboard.writeText(snippet)
      showToast(`Embed code for ${w.title} copied`)
    } catch {
      showToast('Could not copy automatically - select and copy the snippet below')
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading widgets...</div>

  return (
    <div style={{ padding: 32, maxWidth: 1000, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Widgets</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Every embeddable module in one place: preview it, grab the embed code, or edit it if you have access.
        {isAdmin && ' As an admin, you can also assign who is allowed to edit each one.'}
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}
      {toast && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{toast}</div>}

      {widgets.length === 0 && <div style={{ ...C.card, color: '#6b7280' }}>No widgets registered yet.</div>}

      {widgets.map(w => {
        const Editor = w.editor_component ? EDITORS[w.editor_component] : null
        const panel = expanded[w.slug]
        const wgrants = grantsFor(w.object_id)
        return (
          <div key={w.slug} style={C.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{w.title}</div>
                {w.description && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2, maxWidth: 560 }}>{w.description}</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <button style={C.btn} onClick={() => copyEmbed(w)}>Copy embed code</button>
                <a href={w.preview_path} target="_blank" rel="noopener noreferrer" style={{ ...C.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open full preview ↗</a>
                {Editor && w.can_edit && (
                  <button style={panel === 'edit' ? C.btnPrimary : C.btn} onClick={() => toggle(w.slug, 'edit')}>
                    {panel === 'edit' ? 'Close editor' : 'Edit'}
                  </button>
                )}
                {isAdmin && (
                  <button style={panel === 'access' ? C.btnPrimary : C.btn} onClick={() => toggle(w.slug, 'access')}>
                    Manage editors
                  </button>
                )}
              </div>
            </div>

            {!Editor && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 12 }}>No in-app editor yet for this widget - content changes go through GitHub.</div>
            )}

            <div style={{ border: '1px solid #f1f1f1', borderRadius: 8, overflow: 'hidden', background: '#fafafa' }}>
              <iframe src={w.preview_path} title={`${w.title} preview`} style={{ width: '100%', height: 420, border: 0, display: 'block' }} />
            </div>

            {panel === 'edit' && Editor && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f1f1' }}>
                <Editor />
              </div>
            )}

            {panel === 'access' && isAdmin && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f1f1' }}>
                <div style={C.sublabel}>Who can edit {w.title}</div>
                {!w.object_id && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Setting up access for this widget - try again in a moment.</div>}
                {wgrants.length === 0 && w.object_id && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>No one assigned yet. Admins and superadmins can always edit; add a person or group below to extend that to someone else.</div>}
                {wgrants.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{g.subject_type === 'group' ? groupName(g.subject_id) : memberName(g.subject_id)}</span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{g.subject_type}</span>
                    <select style={C.sel} value={g.role} disabled={busy}
                      onChange={e => act({ action: 'grant_set', grant: true, object_id: w.object_id, subject_type: g.subject_type, subject_id: g.subject_id, role: e.target.value })}>
                      {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button style={{ ...C.btn, padding: '3px 8px', color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy}
                      onClick={() => act({ action: 'grant_set', grant: false, object_id: w.object_id, subject_type: g.subject_type, subject_id: g.subject_id })}>Remove</button>
                  </div>
                ))}
                {w.object_id && (
                  <AddEditor groups={groups} members={members} disabled={busy}
                    onAdd={(st, sid, role) => act({ action: 'grant_set', grant: true, object_id: w.object_id, subject_type: st, subject_id: sid, role })} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddEditor({ groups, members, disabled, onAdd }: {
  groups: Group[]; members: Member[]; disabled: boolean; onAdd: (subjectType: string, subjectId: string, role: string) => void
}) {
  const [pick, setPick] = useState('')
  const [role, setRole] = useState('edit')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <select style={C.sel} value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">Add group or person...</option>
        <optgroup label="Groups">{groups.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
        <optgroup label="People">{members.map(m => <option key={m.user_id} value={`user:${m.user_id}`}>{m.name}</option>)}</optgroup>
      </select>
      <select style={C.sel} value={role} onChange={e => setRole(e.target.value)}>
        {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <button style={{ padding: '6px 12px', border: `1px solid ${BLUE}`, color: BLUE, background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}
        disabled={disabled || !pick}
        onClick={() => { const [st, sid] = pick.split(':'); onAdd(st, sid, role); setPick('') }}>
        Add
      </button>
    </div>
  )
}
