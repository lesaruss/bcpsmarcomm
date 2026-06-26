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

  // ── Directory view ───────────────────────────────────────────────────
  return (
    <div style={{ padding: 32, maxWidth: 1000 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Members</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px' }}>Everyone on the BCPS web team. Click a person to view their profile.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {members.map(m => (
          <button key={m.user_id} onClick={() => go(`/bcps?page=members&member=${m.user_id}`)}
            style={{ ...card, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12 }}>
            {m.photo_url
              ? <img src={m.photo_url} alt={m.name} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <div style={{ width: 42, height: 42, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{m.initials}</div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0e4e73', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title || m.department?.name || (m.role === 'superadmin' ? 'Superadmin' : 'Team Member')}</div>
            </div>
          </button>
        ))}
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
