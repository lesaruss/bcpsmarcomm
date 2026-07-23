'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Ticket {
  id: string
  title: string
  description: string
  from_agent: string
  to_agent: string
  status: string
  result: string | null
  created_at: string
  completed_at: string | null
  completed_by: string | null
  can_act: boolean
  metadata: {
    slug?: string
    request_state?: string
    requested_by_email?: string
    approved_by?: string
    rejected_by?: string
    rejection_reason?: string
    published_by?: string
  }
}

const STATE_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  pending_approval: { label: 'Awaiting approval', bg: '#fef3c7', fg: '#92400e' },
  ready_for_agent: { label: 'Queued for an agent', bg: '#dbeafe', fg: '#1e40af' },
  draft_ready: { label: 'Draft ready to review', bg: '#ede9fe', fg: '#5b21b6' },
  published: { label: 'Published', bg: '#dcfce7', fg: '#166534' },
  rejected: { label: 'Rejected', bg: '#fee2e2', fg: '#991b1b' },
}

const BLUE = '#1672A7'
const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }
const btnPrimary: React.CSSProperties = { ...btn, border: `1px solid ${BLUE}`, background: BLUE, color: '#fff' }
const btnDanger: React.CSSProperties = { ...btn, color: '#b91c1c', borderColor: '#fecaca' }

export default function RequestsPage() {
  const supabase = createClient()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')
  const [openDraft, setOpenDraft] = useState<Record<string, boolean>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2800) }

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const t = await token()
    const r = await fetch('/api/bcps/document-requests', { headers: { Authorization: `Bearer ${t}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setTickets(j.tickets ?? [])
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/document-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return }
    await load()
    return j
  }

  const approve = (t: Ticket) => act({ action: 'approve', id: t.id }).then(() => showToast('Request approved and queued'))
  const reject = (t: Ticket) => {
    const reason = window.prompt('Reason for rejecting this request (optional):') || ''
    act({ action: 'reject', id: t.id, reason }).then(() => showToast('Request rejected'))
  }
  const publish = (t: Ticket) => act({ action: 'publish', id: t.id }).then(() => showToast(`${t.title} published`))

  if (loading) return <div style={{ padding: 32 }}>Loading requests...</div>

  return (
    <div style={{ padding: 32, maxWidth: 1000, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Requests</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Every document change request you&apos;ve submitted, or that&apos;s waiting on you to approve, review, or publish.
      </p>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}
      {toast && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{toast}</div>}

      {tickets.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, color: '#6b7280', fontSize: 13 }}>
          No requests yet. Use the &quot;Request an edit&quot; button on any document in Documents to submit one.
        </div>
      )}

      {tickets.map(t => {
        const state = t.metadata?.request_state || 'pending_approval'
        const style = STATE_LABEL[state] || { label: state, bg: '#f3f4f6', fg: '#374151' }
        const showDraft = openDraft[t.id]
        return (
          <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{t.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  Requested by {t.metadata?.requested_by_email || t.from_agent} - {new Date(t.created_at).toLocaleString()}
                </div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: style.bg, color: style.fg, padding: '4px 10px', borderRadius: 99, height: 'fit-content' }}>
                {style.label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: '#374151', background: '#fafafa', border: '1px solid #f1f1f1', borderRadius: 8, padding: 12, marginBottom: 12 }}>
              &ldquo;{t.description}&rdquo;
            </div>

            {state === 'rejected' && t.metadata?.rejection_reason && (
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 12 }}>Reason: {t.metadata.rejection_reason}</div>
            )}

            {state === 'ready_for_agent' && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Approved and waiting for an agent session to draft this change.</div>
            )}

            {state === 'pending_approval' && t.can_act && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btnPrimary} disabled={busy} onClick={() => approve(t)}>Approve</button>
                <button style={btnDanger} disabled={busy} onClick={() => reject(t)}>Reject</button>
              </div>
            )}
            {state === 'pending_approval' && !t.can_act && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Waiting on {t.to_agent} to approve.</div>
            )}

            {state === 'draft_ready' && (
              <div>
                <button style={btn} onClick={() => setOpenDraft(prev => ({ ...prev, [t.id]: !prev[t.id] }))}>
                  {showDraft ? 'Hide draft' : 'View draft'}
                </button>
                {t.can_act && (
                  <button style={{ ...btnPrimary, marginLeft: 8 }} disabled={busy} onClick={() => publish(t)}>Publish</button>
                )}
                {!t.can_act && <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 8 }}>Waiting on the document owner to publish.</span>}
                {showDraft && (
                  <textarea readOnly value={t.result ?? ''} style={{ width: '100%', height: 220, marginTop: 10, fontFamily: 'ui-monospace, monospace', fontSize: 11, padding: 10, border: '1px solid #d1d5db', borderRadius: 6 }} />
                )}
              </div>
            )}

            {state === 'published' && (
              <div style={{ fontSize: 12, color: '#166534' }}>Published by {t.metadata?.published_by || t.completed_by} on {t.completed_at && new Date(t.completed_at).toLocaleString()}.</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
