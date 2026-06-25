'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Group = { id: string; slug: string; name: string; description: string | null }
type Member = { user_id: string; email: string; name: string; role: string; last_sign_in_at: string | null; groups: string[] }
type Obj = { id: string; kind: string; slug: string; title: string; owner_id: string | null; visibility: string; sensitive: boolean }
type Grant = { id: string; object_id: string; subject_type: string; subject_id: string; role: string }
type Link = { id: string; object_id: string; token: string; role: string; expires_at: string | null }

const ROLE_OPTS = ['view', 'comment', 'edit', 'manage']
const BLUE = '#1672A7'
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 14 } as React.CSSProperties,
  h2: { fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', margin: '28px 0 12px' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  chip: (on: boolean): React.CSSProperties => ({ padding: '4px 10px', border: on ? `1.5px solid ${BLUE}` : '1px solid #d1d5db', background: on ? BLUE : '#fff', color: on ? '#fff' : '#374151', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }),
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
}

export default function PermissionsPanel() {
  const supabase = createClient()
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [objects, setObjects] = useState<Obj[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const token = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/permissions', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setGroups(j.groups); setMembers(j.members); setObjects(j.objects); setGrants(j.grants); setLinks(j.links)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  async function act(payload: any) {
    setBusy(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/permissions', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    await load()
    return j
  }

  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.name || 'Unknown'
  const groupName = (gid: string) => groups.find(g => g.id === gid)?.name || 'Group'

  if (loading) return <div style={{ padding: 32 }}>Loading permissions...</div>

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Permissions Console</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>Manage who belongs to which group, who is an administrator, and what each group or person can access. Deny-by-default: nothing is shared unless granted here.</p>
      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      {/* MEMBERS */}
      <h2 style={C.h2}>People ({members.length})</h2>
      {members.map(m => (
        <div key={m.user_id} style={C.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{m.name} {m.role === 'superadmin' && <span style={{ fontSize: 10, color: BLUE }}>SUPERADMIN</span>}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{m.email}{m.last_sign_in_at ? '' : ' (never signed in)'}</div>
            </div>
            {m.role !== 'superadmin' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={busy} style={C.chip(m.role === 'admin')} onClick={() => act({ action: 'member_set_role', user_id: m.user_id, role: m.role === 'admin' ? 'user' : 'admin' })}>
                  {m.role === 'admin' ? 'Administrator' : 'Make administrator'}
                </button>
              </div>
            )}
          </div>
          {m.role !== 'superadmin' && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginRight: 4 }}>Groups</span>
              {groups.map(g => {
                const on = m.groups.includes(g.id)
                return <button key={g.id} disabled={busy} style={C.chip(on)} onClick={() => act({ action: 'member_set_group', user_id: m.user_id, group_id: g.id, member: !on })}>{g.name}</button>
              })}
            </div>
          )}
        </div>
      ))}

      {/* GROUPS */}
      <h2 style={C.h2}>Groups ({groups.length})</h2>
      <div style={C.card}>
        {groups.map(g => (
          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f1f1' }}>
            <div><span style={{ fontWeight: 700, fontSize: 13 }}>{g.name}</span> <span style={{ fontSize: 11, color: '#9ca3af' }}>{g.slug}</span></div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={C.btn} disabled={busy} onClick={() => { const n = prompt('Rename group', g.name); if (n) act({ action: 'group_rename', group_id: g.id, name: n }) }}>Rename</button>
              <button style={{ ...C.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={() => { if (confirm(`Delete group "${g.name}"? Members lose access granted via this group.`)) act({ action: 'group_delete', group_id: g.id }) }}>Delete</button>
            </div>
          </div>
        ))}
        <button style={{ ...C.btn, marginTop: 10, borderColor: BLUE, color: BLUE }} disabled={busy}
          onClick={() => { const name = prompt('New group name'); if (!name) return; const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); act({ action: 'group_create', name, slug }) }}>
          + New group
        </button>
      </div>

      {/* OBJECTS & SHARING */}
      <h2 style={C.h2}>Pages &amp; Documents ({objects.length})</h2>
      {objects.length === 0 && <div style={{ ...C.card, color: '#6b7280', fontSize: 13 }}>No items registered yet. Sensitive documents and pages appear here as they are added to the engine.</div>}
      {objects.map(o => {
        const og = grants.filter(g => g.object_id === o.id)
        const link = links.find(l => l.object_id === o.id)
        return (
          <div key={o.id} style={C.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{o.title || o.slug} {o.sensitive && <span style={{ fontSize: 10, color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: '1px 7px' }}>SENSITIVE</span>}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.kind} &middot; {o.slug} &middot; owner {o.owner_id ? memberName(o.owner_id) : 'none'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: 11, color: '#6b7280' }}>Visibility</label>
                <select style={C.sel} value={o.visibility} disabled={busy}
                  onChange={e => act({ action: 'object_upsert', kind: o.kind, slug: o.slug, title: o.title, visibility: e.target.value })}>
                  <option value="private">Private (owner only)</option>
                  <option value="restricted">Restricted (granted)</option>
                  <option value="public" disabled={o.sensitive}>Public link</option>
                </select>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={o.sensitive} disabled={busy}
                    onChange={e => act({ action: 'object_upsert', kind: o.kind, slug: o.slug, title: o.title, sensitive: e.target.checked })} /> Sensitive
                </label>
              </div>
            </div>

            {o.visibility === 'restricted' && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f1f1' }}>
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 }}>Shared with</div>
                {og.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>No one yet. Add a group or person below.</div>}
                {og.map(g => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{g.subject_type === 'group' ? groupName(g.subject_id) : memberName(g.subject_id)}</span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{g.subject_type}</span>
                    <select style={C.sel} value={g.role} disabled={busy}
                      onChange={e => act({ action: 'grant_set', grant: true, object_id: o.id, subject_type: g.subject_type, subject_id: g.subject_id, role: e.target.value })}>
                      {ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button style={{ ...C.btn, padding: '3px 8px', color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy}
                      onClick={() => act({ action: 'grant_set', grant: false, object_id: o.id, subject_type: g.subject_type, subject_id: g.subject_id })}>Remove</button>
                  </div>
                ))}
                <AddGrant groups={groups} members={members} disabled={busy}
                  onAdd={(subject_type, subject_id, role) => act({ action: 'grant_set', grant: true, object_id: o.id, subject_type, subject_id, role })} />
              </div>
            )}

            {o.visibility === 'public' && !o.sensitive && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f1f1' }}>
                {link ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <code style={{ fontSize: 12, background: '#f3f4f6', padding: '4px 8px', borderRadius: 6 }}>{`https://bcpsmarcomm.com/share/${link.token}`}</code>
                    <button style={{ ...C.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={() => act({ action: 'link_revoke', link_id: link.id, object_id: o.id })}>Revoke link</button>
                  </div>
                ) : (
                  <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => act({ action: 'link_create', object_id: o.id, role: 'view' })}>Create public link</button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddGrant({ groups, members, disabled, onAdd }: { groups: Group[]; members: Member[]; disabled: boolean; onAdd: (st: string, sid: string, role: string) => void }) {
  const [pick, setPick] = useState('')
  const [role, setRole] = useState('view')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <select style={C.sel} value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">Add group or person...</option>
        <optgroup label="Groups">{groups.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name}</option>)}</optgroup>
        <optgroup label="People">{members.map(m => <option key={m.user_id} value={`user:${m.user_id}`}>{m.name}</option>)}</optgroup>
      </select>
      <select style={C.sel} value={role} onChange={e => setRole(e.target.value)}>{ROLE_OPTS.map(r => <option key={r} value={r}>{r}</option>)}</select>
      <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={disabled || !pick}
        onClick={() => { const [st, sid] = pick.split(':'); onAdd(st, sid, role); setPick('') }}>Add</button>
    </div>
  )
}
