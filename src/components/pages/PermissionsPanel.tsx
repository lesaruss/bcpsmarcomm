'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

type Group = { id: string; slug: string; name: string; description: string | null }
type Member = { user_id: string; email: string; name: string; role: string; last_sign_in_at: string | null; groups: string[] }
type Obj = { id: string; kind: string; slug: string; title: string; owner_id: string | null; visibility: string; sensitive: boolean }
type Grant = { id: string; object_id: string; subject_type: string; subject_id: string; role: string }
type Link = { id: string; object_id: string; token: string; role: string; expires_at: string | null }
type Tab = 'people' | 'groups' | 'pages' | 'docs'

const ROLE_OPTS = ['view', 'comment', 'edit', 'manage']
const BLUE = '#1672A7'
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 12 } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  chip: (on: boolean): React.CSSProperties => ({ padding: '4px 10px', border: on ? `1.5px solid ${BLUE}` : '1px solid #d1d5db', background: on ? BLUE : '#fff', color: on ? '#fff' : '#374151', borderRadius: 20, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }),
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

export default function PermissionsPanel() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('people')
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [pages, setPages] = useState<Obj[]>([])
  const [myDocuments, setMyDocuments] = useState<Obj[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/permissions', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setGroups(j.groups); setMembers(j.members); setPages(j.pages); setMyDocuments(j.myDocuments); setGrants(j.grants); setLinks(j.links)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/permissions', { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    await load(); return j
  }, [token, load])

  const groupName = (gid: string) => groups.find(g => g.id === gid)?.name || 'Group'
  const memberName = (uid: string) => members.find(m => m.user_id === uid)?.name || 'Unknown'
  const grantsFor = (oid: string) => grants.filter(g => g.object_id === oid)

  // Subject lens: which pages a member can reach
  const pagesForMember = (m: Member) => {
    if (m.role === 'superadmin' || m.role === 'admin') return pages
    return pages.filter(p => p.visibility === 'public' || grantsFor(p.id).some(g =>
      (g.subject_type === 'user' && g.subject_id === m.user_id) ||
      (g.subject_type === 'group' && m.groups.includes(g.subject_id))))
  }
  const pagesForGroup = (gid: string) => pages.filter(p => grantsFor(p.id).some(g => g.subject_type === 'group' && g.subject_id === gid))

  if (loading) return <div style={{ padding: 32 }}>Loading permissions...</div>

  const TABS: { id: Tab; label: string }[] = [
    { id: 'people', label: `People (${members.length})` },
    { id: 'groups', label: `Groups (${groups.length})` },
    { id: 'pages', label: `Pages (${pages.length})` },
    { id: 'docs', label: `My Documents (${myDocuments.length})` },
  ]

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Permissions Console</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Manage access three ways: by person, by group, or by page. Deny-by-default: nothing is shared unless granted. Document sharing is handled by each document&rsquo;s owner.</p>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e5e7eb', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 800, fontFamily: 'inherit',
            color: tab === t.id ? BLUE : '#6b7280',
            borderBottom: tab === t.id ? `2px solid ${BLUE}` : '2px solid transparent', marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      {/* PEOPLE LENS */}
      {tab === 'people' && members.map(m => {
        const reach = pagesForMember(m)
        const isSA = m.role === 'superadmin'
        return (
          <div key={m.user_id} style={C.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{m.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{m.email}{m.last_sign_in_at ? '' : ' (never signed in)'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ ...C.sublabel, margin: 0 }}>Role</span>
                {isSA
                  ? <span style={{ fontSize: 11, fontWeight: 800, color: BLUE, border: `1px solid ${BLUE}`, borderRadius: 20, padding: '3px 10px' }}>Superadmin</span>
                  : <select style={C.sel} value={m.role} disabled={busy} onChange={e => act({ action: 'member_set_role', user_id: m.user_id, role: e.target.value })}>
                      <option value="user">User</option>
                      <option value="admin">Administrator</option>
                    </select>}
              </div>
            </div>
            {!isSA && (
              <div style={{ marginTop: 12 }}>
                <div style={C.sublabel}>Groups</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {groups.map(g => {
                    const on = m.groups.includes(g.id)
                    return <button key={g.id} disabled={busy} style={C.chip(on)} onClick={() => act({ action: 'member_set_group', user_id: m.user_id, group_id: g.id, member: !on })}>{g.name}</button>
                  })}
                </div>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={C.sublabel}>Can reach {isSA || m.role === 'admin' ? '(all pages, ' + m.role + ')' : `(${reach.length} pages)`}</div>
              <div style={{ fontSize: 12, color: '#374151' }}>{reach.map(p => p.title).join(', ') || 'No pages yet'}</div>
            </div>
          </div>
        )
      })}

      {/* GROUPS LENS */}
      {tab === 'groups' && (
        <>
          <button style={{ ...C.btn, borderColor: BLUE, color: BLUE, marginBottom: 12 }} disabled={busy}
            onClick={() => { const name = prompt('New group name'); if (!name) return; const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); act({ action: 'group_create', name, slug }) }}>+ New group</button>
          {groups.map(g => {
            const gmembers = members.filter(m => m.groups.includes(g.id))
            const gpages = pagesForGroup(g.id)
            return (
              <div key={g.id} style={C.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div><span style={{ fontWeight: 800, fontSize: 14 }}>{g.name}</span> <span style={{ fontSize: 11, color: '#9ca3af' }}>{g.slug}</span></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={C.btn} disabled={busy} onClick={() => { const n = prompt('Rename group', g.name); if (n) act({ action: 'group_rename', group_id: g.id, name: n }) }}>Rename</button>
                    <button style={{ ...C.btn, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy} onClick={() => { if (confirm(`Delete group "${g.name}"?`)) act({ action: 'group_delete', group_id: g.id }) }}>Delete</button>
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={C.sublabel}>Members ({gmembers.length})</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {members.filter(m => m.role !== 'superadmin').map(m => {
                      const on = m.groups.includes(g.id)
                      return <button key={m.user_id} disabled={busy} style={C.chip(on)} onClick={() => act({ action: 'member_set_group', user_id: m.user_id, group_id: g.id, member: !on })}>{m.name}</button>
                    })}
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <div style={C.sublabel}>Can access these pages</div>
                  {gpages.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>None yet.</div>}
                  {gpages.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.title}</span>
                      <button style={{ ...C.btn, padding: '3px 8px', color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy}
                        onClick={() => act({ action: 'grant_set', grant: false, object_id: p.id, subject_type: 'group', subject_id: g.id })}>Remove</button>
                    </div>
                  ))}
                  <AddTarget label="Grant a page" options={pages.filter(p => !gpages.some(x => x.id === p.id)).map(p => ({ value: p.id, label: p.title }))} disabled={busy}
                    onAdd={(pid) => act({ action: 'grant_set', grant: true, object_id: pid, subject_type: 'group', subject_id: g.id, role: 'view' })} />
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* PAGES LENS */}
      {tab === 'pages' && pages.map(o => (
        <ObjectRow key={o.id} o={o} kind="page" grants={grantsFor(o.id)} link={undefined}
          groups={groups} members={members} busy={busy} act={act} groupName={groupName} memberName={memberName} />
      ))}

      {/* MY DOCUMENTS */}
      {tab === 'docs' && (
        <>
          <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 12px' }}>Documents you own. Everyone manages sharing for their own documents from the document itself; yours are mirrored here.</p>
          {myDocuments.length === 0 && <div style={{ ...C.card, color: '#6b7280', fontSize: 13 }}>You have not created any documents yet.</div>}
          {myDocuments.map(o => (
            <ObjectRow key={o.id} o={o} kind="document" grants={grantsFor(o.id)} link={links.find(l => l.object_id === o.id)}
              groups={groups} members={members} busy={busy} act={act} groupName={groupName} memberName={memberName} />
          ))}
        </>
      )}
    </div>
  )
}

function ObjectRow({ o, kind, grants, link, groups, members, busy, act, groupName, memberName }: {
  o: Obj; kind: 'page' | 'document'; grants: Grant[]; link: Link | undefined; groups: Group[]; members: Member[]; busy: boolean
  act: (p: any) => Promise<any>; groupName: (id: string) => string; memberName: (id: string) => string
}) {
  return (
    <div style={C.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{o.title || o.slug} {o.sensitive && <span style={{ fontSize: 10, color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 12, padding: '1px 7px' }}>SENSITIVE</span>}</div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{o.slug}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ ...C.sublabel, margin: 0 }}>Access</span>
          {kind === 'page' ? (
            <select style={C.sel} value={o.visibility === 'private' ? 'restricted' : o.visibility} disabled={busy}
              onChange={e => act({ action: 'object_upsert', kind: 'page', slug: o.slug, title: o.title, visibility: e.target.value })}>
              <option value="public">All members</option>
              <option value="restricted">Restricted</option>
            </select>
          ) : (
            <>
              <select style={C.sel} value={o.visibility} disabled={busy}
                onChange={e => act({ action: 'object_upsert', kind: 'document', slug: o.slug, title: o.title, visibility: e.target.value })}>
                <option value="private">Private (only me)</option>
                <option value="restricted">Restricted (granted)</option>
                <option value="public" disabled={o.sensitive}>Public link</option>
              </select>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={o.sensitive} disabled={busy}
                  onChange={e => act({ action: 'object_upsert', kind: 'document', slug: o.slug, title: o.title, sensitive: e.target.checked })} /> Sensitive
              </label>
            </>
          )}
        </div>
      </div>

      {o.visibility === 'restricted' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f1f1' }}>
          <div style={C.sublabel}>Shared with</div>
          {grants.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>No one yet. Add a group or person below.</div>}
          {grants.map(g => (
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
            onAdd={(st, sid, role) => act({ action: 'grant_set', grant: true, object_id: o.id, subject_type: st, subject_id: sid, role })} />
        </div>
      )}

      {kind === 'document' && o.visibility === 'public' && !o.sensitive && (
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

function AddTarget({ label, options, disabled, onAdd }: { label: string; options: { value: string; label: string }[]; disabled: boolean; onAdd: (v: string) => void }) {
  const [pick, setPick] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <select style={C.sel} value={pick} onChange={e => setPick(e.target.value)}>
        <option value="">{label}...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={disabled || !pick} onClick={() => { onAdd(pick); setPick('') }}>Add</button>
    </div>
  )
}
