'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Dept = { slug: string; name: string; division: string | null; director_name: string | null }
type Member = {
  user_id: string; name: string; email: string; role: string; initials: string; color: string
  title: string | null; bio: string | null; photo_url: string | null
  last_sign_in_at: string | null; groups: string[]; department: Dept | null
}
type DeptOption = { slug: string; name: string; division: string | null }

type SortCol = 'name' | 'department' | 'division' | 'groups' | 'login' | 'unsorted'
type SortDir = 'asc' | 'desc'
type ViewMode = 'tiles' | 'table'

export default function MembersPage() {
  const router = useRouter()
  const params = useSearchParams()
  const memberId = params.get('member')
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [meId, setMeId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ title: '', bio: '', photo_url: '' })
  const [saving, setSaving] = useState(false)

  // ── Directory view controls (search / division filter / sort / view toggle) ──
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [view, setView] = useState<ViewMode>('tiles')

  // Full department list (every BCPS department, not just ones with a member
  // assigned yet) - powers the division filter options and the department
  // reassignment dropdown, per V's ask that "all of the divisions" show up
  // as choices, not just whatever the currently-loaded members happen to have.
  const [allDepartments, setAllDepartments] = useState<DeptOption[]>([])
  const [editingDeptFor, setEditingDeptFor] = useState<string | null>(null)
  const [savingDeptFor, setSavingDeptFor] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    const t = await token()
    if (!t) { setLoading(false); return }
    const r = await fetch('/api/bcps/members', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (r.ok) { setMembers(j.members); setMeId(j.me) }
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    supabase.from('bcps_departments').select('slug,name,division').order('name')
      .then(({ data }) => { if (data) setAllDepartments(data) })
  }, [supabase])

  const go = (url: string) => router.push(url, { scroll: false })

  async function saveProfile() {
    setSaving(true)
    const t = await token()
    await fetch('/api/bcps/my-profile', {
      method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false); setEditing(false); load()
  }

  // Reassign a member's department from the directory. Admin/superadmin only -
  // enforced server-side in /api/bcps/admin-set-department, this is just the
  // affordance. Optimistic update with rollback on failure.
  async function assignDepartment(userId: string, slug: string) {
    const prevMembers = members
    const next = slug ? allDepartments.find(d => d.slug === slug) : null
    setMembers(ms => ms.map(m => m.user_id === userId
      ? { ...m, department: next ? { slug: next.slug, name: next.name, division: next.division, director_name: null } : null }
      : m))
    setEditingDeptFor(null)
    setSavingDeptFor(userId)
    const t = await token()
    const r = await fetch('/api/bcps/admin-set-department', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, department_slug: slug || null }),
    })
    setSavingDeptFor(null)
    if (!r.ok) {
      setMembers(prevMembers)
      alert('Could not update that department assignment. Please try again.')
    }
  }

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>

  // ── Public profile view ──────────────────────────────────────────────
  if (memberId) {
    const m = members.find(x => x.user_id === memberId)
    if (!m) return <div style={{ padding: 32 }}>Member not found. <button onClick={() => go('/?page=members')} style={linkBtn}>Back to Members</button></div>
    const isMe = m.user_id === meId
    const roleLabel = m.role === 'superadmin' ? 'Superadmin' : m.role === 'admin' ? 'Administrator' : 'Team Member'
    return (
      <div style={{ padding: 32, maxWidth: 760 }}>
        <button onClick={() => go('/?page=members')} style={{ ...linkBtn, marginBottom: 18 }}>&larr; All members</button>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {m.photo_url
              ? <img src={m.photo_url} alt={m.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 72, height: 72, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>{m.initials}</div>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{m.name}</h1>
              <div style={{ fontSize: 13, color: '#374151', marginTop: 2, fontWeight: 600 }}>{m.title || roleLabel}</div>
              <a href={`mailto:${m.email}`} style={{ fontSize: 13, color: '#0e4e73', textDecoration: 'none' }}>{m.email}</a>
            </div>
            {isMe && !editing && (
              <button onClick={() => { setForm({ title: m.title || '', bio: m.bio || '', photo_url: m.photo_url || '' }); setEditing(true) }} style={btn}>Edit profile</button>
            )}
          </div>

          {isMe && editing ? (
            <div style={{ marginTop: 22, display: 'grid', gap: 10 }}>
              <label style={lbl}>Title<input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Web Content Manager" /></label>
              <label style={lbl}>Photo URL<input style={inp} value={form.photo_url} onChange={e => setForm(f => ({ ...f, photo_url: e.target.value }))} placeholder="https://..." /></label>
              <label style={lbl}>Bio<textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} placeholder="A short bio" /></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveProfile} disabled={saving} style={{ ...btn, borderColor: '#1672A7', color: '#fff', background: '#1672A7' }}>{saving ? 'Saving...' : 'Save'}</button>
                <button onClick={() => setEditing(false)} style={btn}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {m.bio && (
                <div style={{ marginTop: 22 }}>
                  <div style={sub}>About</div>
                  <p style={{ fontSize: 14, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{m.bio}</p>
                </div>
              )}
              <div style={{ marginTop: 22 }}>
                <div style={sub}>Groups</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {m.groups.length ? m.groups.map(g => <span key={g} style={tag}>{g}</span>) : <span style={{ fontSize: 13, color: '#9ca3af' }}>No groups</span>}
                </div>
              </div>
              <div style={{ marginTop: 22 }}>
                <div style={sub}>Department</div>
                {m.department ? (
                  <button onClick={() => go(`/?page=departments&dept=${m.department!.slug}`)} style={{ ...card, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{m.department.name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{m.department.division || ''}</div>
                    <div style={{ fontSize: 12, color: '#0e4e73', marginTop: 6, fontWeight: 700 }}>View Department Profile &rarr;</div>
                  </button>
                ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>Not assigned to a department yet.</span>}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Directory view (tiles + table, Departments look & feel) ────────────
  const fmtLogin = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never signed in'
  const roleLabelFor = (m: Member) => m.role === 'superadmin' ? 'Superadmin' : m.role === 'admin' ? 'Administrator' : 'Team Member'

  // Admin/superadmin can reassign a member's department inline from this page.
  // Raw role comes straight off the /api/bcps/members payload for the viewer's
  // own row (that endpoint returns the real acl_member_roles.role, not the
  // two-tier 'user'/'superadmin' UserRole the shell context collapses to).
  const myRole = members.find(m => m.user_id === meId)?.role
  const canEditDept = myRole === 'admin' || myRole === 'superadmin'

  // Division filter uses every real BCPS division, not just ones a currently
  // loaded member happens to belong to.
  const divisions = Array.from(new Set(allDepartments.map(d => d.division).filter(Boolean))).sort() as string[]
  const departmentsByDivision = allDepartments.reduce<Record<string, DeptOption[]>>((acc, d) => {
    const key = d.division || 'Other'
    ;(acc[key] = acc[key] || []).push(d)
    return acc
  }, {})

  const filtered = members.filter(m => {
    if (divisionFilter && m.department?.division !== divisionFilter) return false
    const q = search.trim().toLowerCase()
    if (!q) return true
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q)
  })

  function compare(a: Member, b: Member): number {
    switch (sortCol) {
      case 'name': return a.name.localeCompare(b.name)
      case 'department': return (a.department?.name || '').localeCompare(b.department?.name || '') || a.name.localeCompare(b.name)
      case 'division': return (a.department?.division || '').localeCompare(b.department?.division || '') || a.name.localeCompare(b.name)
      case 'groups': return [...a.groups].sort().join(', ').localeCompare([...b.groups].sort().join(', ')) || a.name.localeCompare(b.name)
      case 'login': return new Date(a.last_sign_in_at || 0).getTime() - new Date(b.last_sign_in_at || 0).getTime()
      default: return 0
    }
  }

  const sorted = [...filtered]
  if (sortCol !== 'unsorted') {
    sorted.sort((a, b) => compare(a, b) * (sortDir === 'asc' ? 1 : -1))
  }

  // Clicking a header sorts ascending (or newest-first for Last Login) the
  // first time, and reverses on every click after that.
  function clickHeader(col: SortCol) {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortCol(col)
    setSortDir(col === 'login' ? 'desc' : 'asc')
  }

  function pickSort(col: SortCol) {
    setSortCol(col)
    setSortDir(col === 'login' ? 'desc' : 'asc')
  }

  function sortArrow(col: SortCol) {
    if (sortCol !== col) return null
    return <span aria-hidden="true" style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const deptSelect = (m: Member) => (
    <select
      className="mp-dept-select"
      autoFocus
      defaultValue={m.department?.slug || ''}
      disabled={savingDeptFor === m.user_id}
      onChange={e => assignDepartment(m.user_id, e.target.value)}
      onBlur={() => setEditingDeptFor(null)}
    >
      <option value="">Unassigned</option>
      {Object.entries(departmentsByDivision).map(([div, depts]) => (
        <optgroup key={div} label={div}>
          {depts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
        </optgroup>
      ))}
    </select>
  )

  const tile = (m: Member) => (
    <div key={m.user_id} className="mp-card">
      <div className="mp-top">
        {m.photo_url
          ? <img src={m.photo_url} alt={m.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 52, height: 52, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>{m.initials}</div>}
        <div style={{ minWidth: 0 }}>
          <div className="mp-name">{m.name}</div>
          <div className="mp-title">{m.title || roleLabelFor(m)}</div>
          <a className="mp-email" href={`mailto:${m.email}`}>{m.email}</a>
        </div>
      </div>
      {m.department?.division && <div className="mp-division">{m.department.division}</div>}
      <div className="mp-meta">
        <div className="mp-row">
          Department:{' '}
          {editingDeptFor === m.user_id
            ? deptSelect(m)
            : canEditDept
              ? <button type="button" className="mp-editable" onClick={() => setEditingDeptFor(m.user_id)}>
                  <b>{m.department?.name || 'Unassigned'}</b>
                </button>
              : <b>{m.department?.name || 'Unassigned'}</b>}
        </div>
        {m.groups.length > 0 && <div className="mp-tags">{m.groups.map(g => <span key={g} className="mp-tag">{g}</span>)}</div>}
        <div className="mp-row">Last login: <b>{fmtLogin(m.last_sign_in_at)}</b></div>
      </div>
    </div>
  )

  const tilesView = () => {
    if (!sorted.length) return null
    if (sortCol === 'division') {
      const byDiv = new Map<string, Member[]>()
      sorted.forEach(m => {
        const key = m.department?.division || 'Unassigned'
        if (!byDiv.has(key)) byDiv.set(key, [])
        byDiv.get(key)!.push(m)
      })
      return Array.from(byDiv.entries()).map(([div, ms]) => (
        <div key={div}>
          <div className="mp-div-header">{div}</div>
          <div className="mp-grid" style={{ marginBottom: 16 }}>{ms.map(tile)}</div>
        </div>
      ))
    }
    return <div className="mp-grid">{sorted.map(tile)}</div>
  }

  const row = (m: Member) => (
    <tr key={m.user_id}>
      <td>
        <div className="mp-t-name">{m.name}</div>
        <div className="mp-t-email">{m.email}</div>
      </td>
      <td>
        {editingDeptFor === m.user_id
          ? deptSelect(m)
          : canEditDept
            ? <button type="button" className="mp-editable" onClick={() => setEditingDeptFor(m.user_id)}>{m.department?.name || 'Unassigned'}</button>
            : (m.department?.name || 'Unassigned')}
      </td>
      <td>{m.department?.division ? <span className="mp-pill">{m.department.division}</span> : '—'}</td>
      <td>{m.groups.length ? m.groups.join(', ') : '—'}</td>
      <td>{fmtLogin(m.last_sign_in_at)}</td>
    </tr>
  )

  const memberCard = (m: Member) => {
    const cardRow = (l: string, v: React.ReactNode) => (
      <div className="mp-mc-row"><span>{l}</span><span>{v}</span></div>
    )
    return (
      <div key={m.user_id} className="mp-mc">
        <div className="mp-mc-top">
          <div>
            <div className="mp-t-name">{m.name}</div>
            <div className="mp-t-email">{m.email}</div>
          </div>
          {m.department?.division && <span className="mp-pill">{m.department.division}</span>}
        </div>
        {cardRow('Department', editingDeptFor === m.user_id
          ? deptSelect(m)
          : canEditDept
            ? <button type="button" className="mp-editable" onClick={() => setEditingDeptFor(m.user_id)}>{m.department?.name || 'Unassigned'}</button>
            : (m.department?.name || 'Unassigned'))}
        {cardRow('Groups', m.groups.length ? m.groups.join(', ') : '—')}
        {cardRow('Last login', fmtLogin(m.last_sign_in_at))}
      </div>
    )
  }

  const Th = ({ col, label }: { col: SortCol; label: string }) => (
    <th onClick={() => clickHeader(col)} aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      {label}{sortArrow(col)}
    </th>
  )

  const tableView = () => (
    <div className="mp-table-wrap">
      <table className="mp-native-table">
        <thead>
          <tr>
            <Th col="name" label="Name" />
            <Th col="department" label="Department" />
            <Th col="division" label="Division" />
            <Th col="groups" label="Groups" />
            <Th col="login" label="Last Login" />
          </tr>
        </thead>
        <tbody>{sorted.map(row)}</tbody>
      </table>
      <div className="mp-cards">{sorted.map(memberCard)}</div>
    </div>
  )

  return (
    <div className="mp-root">
      <style>{`
        .mp-root{max-width:1120px}
        .mp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
        .mp-card{background:#fff;border:1px solid #dde3ea;border-radius:12px;padding:20px;display:flex;flex-direction:column;transition:box-shadow .15s,border-color .15s;min-height:190px}
        .mp-card:hover{box-shadow:0 4px 20px rgba(22,114,167,.13);border-color:#1672A7}
        .mp-top{display:flex;align-items:center;gap:14px;margin-bottom:14px}
        .mp-name{font-size:16px;font-weight:800;color:#1a1a1a;line-height:1.2}
        .mp-title{font-size:12px;color:#525252;font-weight:600;margin-top:2px}
        .mp-email{font-size:12px;color:#0e4e73;text-decoration:none}
        .mp-division{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:#1672A7;margin-bottom:8px}
        .mp-meta{border-top:1px solid #eef1f5;padding-top:12px;margin-top:auto;display:flex;flex-direction:column;gap:8px}
        .mp-row{font-size:12px;color:#525252}
        .mp-row b{color:#1a1a1a;font-weight:700}
        .mp-tags{display:flex;flex-wrap:wrap;gap:5px}
        .mp-tag{font-size:10px;font-weight:700;background:#e8f1f8;color:#0e4e73;padding:2px 8px;border-radius:20px}
        @media(max-width:900px){.mp-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:600px){.mp-grid{grid-template-columns:1fr}}

        .mp-div-header{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0e4e73;padding:14px 2px 2px;border-top:1px solid #dde3ea;margin-top:4px}
        .mp-div-header:first-child{border-top:none;margin-top:0;padding-top:0}

        .mp-controls{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
        .mp-search{flex:1;min-width:220px;border:1.5px solid #dde3ea;border-radius:8px;padding:9px 14px;font-size:13px;font-family:inherit;outline:none;background:#fff;color:#1a1a1a}
        .mp-search:focus{border-color:#1672A7}
        .mp-select{border:1.5px solid #dde3ea;border-radius:8px;padding:8px 34px 8px 14px;font-size:12px;font-family:inherit;font-weight:700;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E") no-repeat right 10px center;-webkit-appearance:none;appearance:none;color:#1a1a1a;cursor:pointer}
        .mp-select:focus{border-color:#1672A7}
        .mp-count{font-size:12px;color:#6b7280;font-weight:700;margin-left:auto;white-space:nowrap}
        .mp-view-toggle{display:flex;border:1.5px solid #dde3ea;border-radius:8px;overflow:hidden}
        .mp-view-toggle button{font-family:inherit;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;border:none;background:#fff;color:#6b7280;cursor:pointer}
        .mp-view-toggle button+button{border-left:1.5px solid #dde3ea}
        .mp-view-toggle button[aria-pressed="true"]{background:#1672A7;color:#fff}

        .mp-table-wrap{display:block}
        .mp-native-table{width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #dde3ea;border-radius:10px;overflow:hidden}
        .mp-native-table thead th{text-align:left;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;padding:12px;border-bottom:1.5px solid #dde3ea;white-space:nowrap;cursor:pointer;user-select:none}
        .mp-native-table thead th:hover{color:#1672A7}
        .mp-native-table tbody td{padding:12px;border-bottom:1px solid #dde3ea;vertical-align:middle}
        .mp-native-table tbody tr:hover{background:#f6fafd}
        .mp-t-name{font-weight:700;font-size:13px;color:#1a1a1a}
        .mp-t-email{font-size:12px;color:#6b7280}
        .mp-pill{display:inline-block;font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:3px 9px;border-radius:100px;background:#e8f1f8;color:#0e4e73;white-space:nowrap}

        .mp-editable{background:none;border:none;padding:0;margin:0;font:inherit;color:#0e4e73;font-weight:700;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px}
        .mp-editable:hover{color:#1672A7}
        .mp-dept-select{font-family:inherit;font-size:12px;font-weight:700;padding:5px 8px;border:1.5px solid #1672A7;border-radius:6px;background:#fff;color:#1a1a1a;max-width:220px}

        .mp-cards{display:none}
        .mp-mc{border:1.5px solid #dde3ea;border-radius:10px;padding:14px 16px;margin-bottom:10px;background:#fff}
        .mp-mc-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px}
        .mp-mc-row{font-size:12px;color:#525252;display:flex;justify-content:space-between;gap:12px;padding:3px 0;align-items:center}
        .mp-mc-row span:first-child{color:#6b7280;font-weight:700;font-size:10px;letter-spacing:.07em;text-transform:uppercase}
        @media(max-width:860px){.mp-table-wrap .mp-native-table{display:none}.mp-table-wrap .mp-cards{display:block}}

        .mp-empty{padding:50px 20px;text-align:center;color:#6b7280;font-size:13px}
      `}</style>
      <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Members</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px' }}>{members.length} people on the BCPS web team.</p>

      <div className="mp-controls">
        <input
          className="mp-search"
          type="search"
          placeholder="Search name, email, or title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search members"
        />
        <select className="mp-select" value={divisionFilter} onChange={e => setDivisionFilter(e.target.value)} aria-label="Filter by division">
          <option value="">All Divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="mp-select"
          value={sortCol}
          onChange={e => pickSort(e.target.value as SortCol)}
          aria-label="Sort members"
        >
          <option value="name">Name A&ndash;Z</option>
          <option value="department">Department</option>
          <option value="division">Division</option>
          <option value="groups">Groups</option>
          <option value="login">Most recently active</option>
          <option value="unsorted">Unsorted</option>
        </select>
        <div className="mp-view-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === 'tiles'} onClick={() => setView('tiles')}>Tiles</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>Table</button>
        </div>
        <p className="mp-count">{sorted.length} shown</p>
      </div>

      {sorted.length === 0
        ? <div className="mp-empty">No members match that filter.</div>
        : (view === 'tiles' ? tilesView() : tableView())}
    </div>
  )
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#0e4e73', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', padding: 0 }
const sub: React.CSSProperties = { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 }
const tag: React.CSSProperties = { fontSize: 11, fontWeight: 700, background: '#e8f1f8', color: '#0e4e73', padding: '3px 10px', borderRadius: 20 }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, width: '100%', fontFamily: 'inherit' }
const btn: React.CSSProperties = { padding: '7px 14px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal', color: '#111827' }
