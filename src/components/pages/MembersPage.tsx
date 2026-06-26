'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Dept = { slug: string; name: string; division: string | null; director_name: string | null }
type Member = {
  user_id: string; name: string; email: string; role: string; initials: string; color: string
  last_sign_in_at: string | null; groups: string[]; department: Dept | null
}

export default function MembersPage() {
  const router = useRouter()
  const params = useSearchParams()
  const memberId = params.get('member')
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { setLoading(false); return }
    const r = await fetch('/api/bcps/members', { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (r.ok) setMembers(j.members)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const go = (url: string) => router.push(url, { scroll: false })

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>

  // ── Public profile view ──────────────────────────────────────────────
  if (memberId) {
    const m = members.find(x => x.user_id === memberId)
    if (!m) return <div style={{ padding: 32 }}>Member not found. <button onClick={() => go('/bcps?page=members')} style={linkBtn}>Back to Members</button></div>
    const roleLabel = m.role === 'superadmin' ? 'Superadmin' : m.role === 'admin' ? 'Administrator' : 'Team Member'
    return (
      <div style={{ padding: 32, maxWidth: 760 }}>
        <button onClick={() => go('/bcps?page=members')} style={{ ...linkBtn, marginBottom: 18 }}>&larr; All members</button>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800 }}>{m.initials}</div>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{m.name}</h1>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{roleLabel}</div>
              <a href={`mailto:${m.email}`} style={{ fontSize: 13, color: '#0e4e73', textDecoration: 'none' }}>{m.email}</a>
            </div>
          </div>

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
                <div style={{ fontSize: 12, color: '#6b7280' }}>{m.department.division || ''}{m.department.director_name ? ` &middot; ${m.department.director_name}` : ''}</div>
                <div style={{ fontSize: 12, color: '#0e4e73', marginTop: 6, fontWeight: 700 }}>View Department Profile &rarr;</div>
              </button>
            ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>Not assigned to a department yet.</span>}
          </div>
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
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: m.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, flexShrink: 0 }}>{m.initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: '#0e4e73', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.department?.name || (m.role === 'superadmin' ? 'Superadmin' : 'Team Member')}</div>
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
