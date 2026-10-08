'use client'

// Your Submissions, /?page=my-submissions (Vanessa Deslandes, 2026-10-08):
// every submission a school WCM has sent, of every type, in one list. Today
// that is homepage banners and Proud Points; a new submission type adds a
// loader here. Each row opens the item in its own tool.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Row {
  id: string
  type: 'Banner' | 'Proud Points'
  title: string
  school: string | null
  status: 'draft' | 'pending' | 'approved' | 'live' | 'rejected'
  date: string
  reason: string | null
  href: string
}

const STATUS: Record<Row['status'], { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: '#eef2f6', fg: '#3c4a5a' },
  pending: { label: 'Waiting for review', bg: '#fdf3e0', fg: '#8a5a00' },
  approved: { label: 'Approved', bg: '#e6f4ea', fg: '#1e6b3a' },
  live: { label: 'Live on your site', bg: '#e0f2f1', fg: '#0f766e' },
  rejected: { label: 'Not approved', bg: '#fbe9e7', fg: '#a13a2f' },
}

async function authedGet(path: string) {
  const token = (await createClient().auth.getSession()).data.session?.access_token
  const r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return r.ok ? r.json() : {}
}

export default function MySubmissionsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<'All' | Row['type']>('All')
  const [status, setStatus] = useState<'All' | Row['status']>('All')
  const [q, setQ] = useState('')

  useEffect(() => {
    ;(async () => {
      const [b, p] = await Promise.all([authedGet('/api/banner/mine'), authedGet('/api/proud-points/mine')])
      const banners: Row[] = (b.submissions ?? []).map((m: any) => ({
        id: m.id, type: 'Banner',
        title: m.type === 'upload' ? (m.banner_title || m.file_name || 'Banner') : `Removal request: ${(m.removal_description || '').slice(0, 60)}`,
        school: null,
        status: m.status === 'approved' && m.posted_at ? 'live' : m.status,
        date: m.submitted_at, reason: m.rejection_reason, href: '/?page=banner-submissions&tab=mine',
      }))
      const proud: Row[] = (p.submissions ?? []).map((m: any) => ({
        id: m.id, type: 'Proud Points',
        title: m.kind === 'initial' ? 'Six Proud Points' : `Replace a Proud Point: ${[m.points?.[0]?.stat, m.points?.[0]?.heading].filter(Boolean).join(' ')}`,
        school: m.school_name,
        status: m.status === 'approved' && m.posted_at ? 'live' : m.status,
        date: m.submitted_at || m.updated_at, reason: m.rejection_reason, href: '/?page=proud-points&tab=mine',
      }))
      setRows([...banners, ...proud].sort((x, y) => (y.date || '').localeCompare(x.date || '')))
      setLoading(false)
    })()
  }, [])

  const s = q.trim().toLowerCase()
  const byType = rows.filter(r => type === 'All' || r.type === type)
  const shown = byType.filter(r => (status === 'All' || r.status === status) && (!s || `${r.title} ${r.school ?? ''}`.toLowerCase().includes(s)))
  const statuses = useMemo(() => (Object.keys(STATUS) as Row['status'][]).filter(k => byType.some(r => r.status === k)), [byType])

  return (
    <div style={{ padding: 32, width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Your Submissions</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 18px' }}>Everything you have sent to the District Web Team, where it stands, and the reason if something was not approved.</p>
      <div className="dash-panel">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }} role="group" aria-label="Type">
          {(['All', 'Banner', 'Proud Points'] as const).map(t => (
            <button key={t} type="button" aria-pressed={type === t} className={type === t ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11.5, padding: '4px 10px' }}
              onClick={() => { setType(t); setStatus('All') }}>
              {t === 'All' ? 'All types' : t === 'Banner' ? 'Banners' : t} ({t === 'All' ? rows.length : rows.filter(r => r.type === t).length})
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }} role="group" aria-label="Status">
          <button type="button" aria-pressed={status === 'All'} className={status === 'All' ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => setStatus('All')}>Any status</button>
          {statuses.map(k => (
            <button key={k} type="button" aria-pressed={status === k} className={status === k ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => setStatus(k)}>
              {STATUS[k].label} ({byType.filter(r => r.status === k).length})
            </button>
          ))}
          <input aria-label="Search submissions" className="form-input" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} style={{ flex: '1 1 180px', minWidth: 0, maxWidth: 320 }} />
        </div>
        <div className="note-list">
          {loading ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            : shown.length === 0 ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>{rows.length ? 'Nothing matches.' : 'No submissions yet.'}</div>
            : shown.map(r => (
              <div key={`${r.type}-${r.id}`} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.type}{r.school ? ` · ${r.school}` : ''}{r.date ? ` · ${new Date(r.date).toLocaleDateString()}` : ''}</div>
                  {r.status === 'rejected' && r.reason && <div style={{ fontSize: 12, color: '#a13a2f', marginTop: 6, background: '#fbe9e7', padding: '6px 10px', borderRadius: 5 }}>{r.reason}</div>}
                </div>
                <span style={{ background: STATUS[r.status].bg, color: STATUS[r.status].fg, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{STATUS[r.status].label}</span>
                <a className="btn-outline" href={r.href} style={{ fontSize: 12, padding: '5px 10px', textDecoration: 'none', borderRadius: 8 }}>Open</a>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
