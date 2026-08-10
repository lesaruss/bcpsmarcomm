'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface ViewData {
  grant: { id: string; status: string; approved_at: string | null; reason: string | null }
  profile: { full_name: string | null; email: string | null; department: string | null } | null
  cert_progress: { completed: number; total: number; pct: number }
  reports: Array<{ id: string; created_at: string; page: string | null; message: string; status: string }>
}

// Read-only diagnostic view for an approved access grant (per Sean,
// 2026-07-29). Deliberately bare-bones: identity, cert progress, and their
// own submitted reports - enough to actually diagnose the kind of issue
// that triggers a report in the first place, with room to extend later.
// No edit controls exist on this page on purpose (read-only decision).
export default function SupportAccessViewPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [data, setData] = useState<ViewData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { setError('Please sign in.'); setLoading(false); return }
    const r = await fetch(`/api/bcps/support-view/${id}`, { headers: { Authorization: `Bearer ${token}` } })
    const j = await r.json()
    if (!r.ok) { setError(j.error || 'This access is no longer available.'); setLoading(false); return }
    setData(j)
    setLoading(false)
  }

  useEffect(() => { if (id) load() }, [id])

  async function closeAccess() {
    setClosing(true)
    try {
      const supabase = createClient()
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) return
      await fetch(`/api/bcps/support-view/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'close' }),
      })
      router.push('/?page=dashboard', { scroll: false })
    } finally {
      setClosing(false)
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 12.5, fontWeight: 700, color: '#92400e' }}>
        Read-only diagnostic view - approved access, nothing here can be changed.
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        {loading ? (
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading...</p>
        ) : error ? (
          <p style={{ fontSize: 14, color: '#c0392b' }}>{error}</p>
        ) : data ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 4px' }}>{data.profile?.full_name || data.profile?.email || 'Member'}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
              {data.profile?.email}{data.profile?.department ? ` · ${data.profile.department}` : ''}
            </p>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>WCM Certification</div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: data.cert_progress.pct + '%', background: 'var(--primary)', borderRadius: 8 }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {data.cert_progress.completed} of {data.cert_progress.total} pages ({data.cert_progress.pct}%)
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Their Recent Reports</div>
              {data.reports.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No reports on file.</p>
              ) : data.reports.map(r => (
                <div key={r.id} style={{ borderBottom: '1px solid var(--border)', padding: '8px 0', fontSize: 12.5 }}>
                  <div style={{ color: 'var(--text-muted)' }}>{r.page} · {new Date(r.created_at).toLocaleDateString()}</div>
                  <div>{r.message}</div>
                </div>
              ))}
            </div>

            <button onClick={closeAccess} disabled={closing}
              style={{ padding: '10px 20px', background: '#fff', color: '#c0392b', border: '1.5px solid #c0392b', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: closing ? 0.6 : 1 }}>
              {closing ? 'Closing...' : 'Close Access'}
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
