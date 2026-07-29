'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface GrantInfo {
  status: string
  reason: string | null
  requested_by_email: string | null
  requested_at: string
  approved_at: string | null
  closed_at: string | null
}

// Member-facing approval screen for the access-request flow (per Sean,
// 2026-07-29). Reached only via the link emailed after an admin clicks
// "Request Access" on a specific report - never a standing button, and
// never visible unless someone already reported an issue. Sits inside the
// normal /bcps auth gate on purpose: signing in here is what proves it's
// really the target member approving, not whoever happened to open the
// email. Access is read-only on the admin's side regardless of what's
// approved here.
export default function AccessRequestPage() {
  const params = useParams()
  const token = params?.token as string
  const [grant, setGrant] = useState<GrantInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [acting, setActing] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const authToken = (await supabase.auth.getSession()).data.session?.access_token
    if (!authToken) { setError('Please sign in to view this request.'); setLoading(false); return }
    const r = await fetch(`/api/bcps/access-request/${token}`, { headers: { Authorization: `Bearer ${authToken}` } })
    const j = await r.json()
    if (!r.ok) { setError(j.error || 'Could not load this request.'); setLoading(false); return }
    setGrant(j)
    setLoading(false)
  }

  useEffect(() => { if (token) load() }, [token])

  async function act(action: 'approve' | 'deny' | 'revoke') {
    setActing(true)
    try {
      const supabase = createClient()
      const authToken = (await supabase.auth.getSession()).data.session?.access_token
      if (!authToken) return
      const r = await fetch(`/api/bcps/access-request/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Something went wrong.')
      await load()
    } catch (e: any) {
      setError(e.message || 'Something went wrong.')
    } finally {
      setActing(false)
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: '0 20px' }}>
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 28 }}>
        <h1 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 6px' }}>Access Request</h1>
        {loading ? (
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading...</p>
        ) : error ? (
          <p style={{ fontSize: 14, color: '#c0392b' }}>{error}</p>
        ) : grant ? (
          <>
            {grant.status === 'requested' && (
              <>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
                  <strong>{grant.requested_by_email}</strong> has requested temporary, read-only access to your
                  bcpsmarcomm.com account to help with what you reported:
                </p>
                <p style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: '#555', background: 'var(--bg, #f5f5f5)', borderRadius: 8, padding: '12px 14px', margin: '10px 0 20px' }}>
                  {grant.reason}
                </p>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 20 }}>
                  They can look, but can&apos;t change anything on your account. You can revoke this at any time.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => act('approve')} disabled={acting}
                    style={{ padding: '10px 20px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                    Approve
                  </button>
                  <button onClick={() => act('deny')} disabled={acting}
                    style={{ padding: '10px 20px', background: '#fff', color: '#c0392b', border: '1.5px solid #c0392b', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                    Deny
                  </button>
                </div>
              </>
            )}
            {grant.status === 'approved' && (
              <>
                <p style={{ fontSize: 14, lineHeight: 1.7 }}>
                  Access is <strong style={{ color: '#16750C' }}>active</strong> (read-only), approved for{' '}
                  {grant.requested_by_email}. You can revoke it any time.
                </p>
                <button onClick={() => act('revoke')} disabled={acting}
                  style={{ marginTop: 14, padding: '10px 20px', background: '#fff', color: '#c0392b', border: '1.5px solid #c0392b', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: acting ? 0.6 : 1 }}>
                  Revoke Access
                </button>
              </>
            )}
            {grant.status === 'denied' && (
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>You denied this request.</p>
            )}
            {grant.status === 'closed' && (
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>This access has been closed.</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
