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

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>

  // ── Public profile view ──────────────────────────────────────────────
  if (memberId) {
    const m = members.find(x => x.user_id === memberId)
    if (!m) return <div style={{ padding: 32 }}>Member not found. <button onClick={() => go('/bcps?page=members')} style={linkBtn}>Back to Members</button></div>
    const isMe = m.user_id === meId
    const roleLabel = m.role === 'superadmin' ? 'Superadmin' : m.role === 'admin' ? 'Administrator' : 'Team Member'
    return (
      <div style={{ padding: 32, maxWidth: 760 }}>
        <button onClick={() => go('/bcps?page=members')} style={{ ...linkBtn, marginBottom: 18 }}>&larr; All members</button>
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
                  <button onClick={() => go(`/bcps?page=departments&dept=${m.department!.slug}`)} style={{ ...card, cursor: 'pointer', textAlign: 'left' }}>
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

  // ── Directory view (tiles, Departments look & feel) ────────────
  const fmtLogin = (iso: string | null) => iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Never signed in'
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
        .mp-meta{border-top:1px solid #eef1f5;padding-top:12px;margin-top:auto;display:flex;flex-direction:column;gap:8px}
        .mp-row{font-size:12px;color:#525252}
        .mp-row b{color:#1a1a1a;font-weight:700}
        .mp-tags{display:flex;flex-wrap:wrap;gap:5px}
        .mp-tag{font-size:10px;font-weight:700;background:#e8f1f8;color:#0e4e73;padding:2px 8px;border-radius:20px}
        @media(max-width:900px){.mp-grid{grid-template-columns:repeat(2,1fr)}}
        @media(max-width:600px){.mp-grid{grid-template-columns:1fr}}
      `}</style>
      <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Members</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px' }}>{members.length} people on the BCPS web team.</p>
      <div className="mp-grid">
        {members.map(m => {
          const roleLabel = m.role === 'superadmin' ? 'Superadmin' : m.role === 'admin' ? 'Administrator' : 'Team Member'
          return (
            <div key={m.user_id} className="mp-card">
              <div className="mp-top">
                {m.photo_url
                  ? <img src={m.photo_url} alt={m.name} style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 52, height: 52, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>{m.initials}</div>}
                <div style={{ minWidth: 0 }}>
                  <div className="mp-name">{m.name}</div>
                  <div className="mp-title">{m.title || roleLabel}</div>
                  <a className="mp-email" href={`mailto:${m.email}`}>{m.email}</a>
                </div>
              </div>
              <div className="mp-meta">
                <div className="mp-row">Department: <b>{m.department?.name || 'Unassigned'}</b></div>
                {m.groups.length > 0 && <div className="mp-tags">{m.groups.map(g => <span key={g} className="mp-tag">{g}</span>)}</div>}
                <div className="mp-row">Last login: <b>{fmtLogin(m.last_sign_in_at)}</b></div>
              </div>
            </div>
          )
        })}
      </div>
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
