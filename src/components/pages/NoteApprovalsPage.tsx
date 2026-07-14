'use client'

import { useState, useEffect, useMemo } from 'react'

interface PulseItem {
  id: string
  page_slug: string | null
  page_url: string | null
  brand_slug: string | null
  message: string
  sender_name: string | null
  sender_email: string | null
  status: 'pending_approval' | 'approved' | 'rejected'
  is_admin_submission: boolean
  created_at: string
  resolved_at: string | null
  resolved_by: string | null
}

export default function NoteApprovalsPage() {
  const [items, setItems] = useState<PulseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/bcps/pulse?scope=queue')
      if (r.status === 403) {
        setForbidden(true)
        setLoading(false)
        return
      }
      const j = await r.json()
      setItems(j.items || [])
    } catch {
      setItems([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function act(id: string, action: 'approve' | 'reject') {
    setActing(id)
    try {
      const r = await fetch('/api/bcps/pulse', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      if (r.ok) {
        await load()
      } else {
        const j = await r.json().catch(() => ({}))
        alert(j.error || 'Could not update this note.')
      }
    } catch {
      alert('Could not update this note.')
    }
    setActing(null)
  }

  const filtered = useMemo(() => {
    return filter === 'pending' ? items.filter(i => i.status === 'pending_approval') : items
  }, [items, filter])

  const pendingCount = useMemo(() => items.filter(i => i.status === 'pending_approval').length, [items])

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  }

  return (
    <div style={{ padding: '0' }}>
      <style>{`
        .approvals-section { padding: 32px; background: #ffffff; }
        .approvals-header h1 { font-size: 32px; font-weight: 900; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: -0.02em; }
        .approvals-header p { font-size: 14px; color: rgba(26,26,26,0.55); margin: 0 0 24px 0; line-height: 1.6; }
        .approvals-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; flex-wrap: wrap; }
        .approvals-filter-btn {
          padding: 8px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #fff;
          font-size: 12px; font-weight: 700; color: #374151; cursor: pointer; font-family: inherit;
        }
        .approvals-filter-btn.active { background: #1672A7; border-color: #1672A7; color: #fff; }
        .approvals-count { font-size: 12px; color: #9ca3af; }
        .approvals-empty { padding: 60px 0; text-align: center; color: #9ca3af; font-size: 14px; }
        .approval-card {
          background: #ffffff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px;
          padding: 20px; margin-bottom: 12px;
        }
        .approval-card.is-pending { border-left: 3px solid #E8650A; }
        .approval-card.is-approved { border-left: 3px solid #16750C; }
        .approval-card.is-rejected { border-left: 3px solid #9ca3af; opacity: 0.7; }
        .approval-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
        .approval-sender { font-size: 13px; font-weight: 700; color: #1a1a1a; }
        .approval-sender-email { font-size: 11px; color: rgba(26,26,26,0.45); font-weight: 500; }
        .approval-status {
          font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em;
          padding: 4px 9px; border-radius: 4px; white-space: nowrap;
        }
        .approval-status.pending_approval { background: rgba(232,101,10,0.10); color: #C55326; }
        .approval-status.approved { background: rgba(22,117,12,0.10); color: #16750C; }
        .approval-status.rejected { background: rgba(0,0,0,0.06); color: #6b7280; }
        .approval-message { font-size: 14px; color: #1a1a1a; line-height: 1.6; margin-bottom: 12px; white-space: pre-wrap; }
        .approval-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .approval-source {
          font-size: 11px; color: rgba(26,26,26,0.45); text-decoration: none; border-bottom: 1px dotted rgba(26,26,26,0.3);
        }
        .approval-source:hover { color: #1672A7; }
        .approval-actions { display: flex; gap: 8px; }
        .approval-btn {
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
          padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; border: none;
        }
        .approval-btn.approve { background: #16750C; color: #fff; }
        .approval-btn.reject { background: #fff; color: #9ca3af; border: 1.5px solid #e5e7eb; }
        .approval-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .approval-resolved-note { font-size: 11px; color: rgba(26,26,26,0.4); }
        .approvals-forbidden { padding: 60px 0; text-align: center; color: #9ca3af; font-size: 14px; }
        @media (max-width: 600px) {
          .approvals-section { padding: 16px; }
          .approvals-header h1 { font-size: 24px; }
        }
      `}</style>

      <div className="approvals-section">
        <div className="approvals-header">
          <h1>Note Approvals</h1>
          <p>Pulse messages submitted from meeting briefs. Admin notes apply automatically; everyone else&apos;s waits here for review.</p>
        </div>

        {forbidden ? (
          <div className="approvals-forbidden">This page is restricted to admins.</div>
        ) : (
          <>
            <div className="approvals-toolbar">
              <button
                className={`approvals-filter-btn${filter === 'pending' ? ' active' : ''}`}
                onClick={() => setFilter('pending')}
              >
                Pending
              </button>
              <button
                className={`approvals-filter-btn${filter === 'all' ? ' active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <span className="approvals-count">
                {loading ? 'Loading...' : `${pendingCount} pending`}
              </span>
            </div>

            {loading ? (
              <div className="approvals-empty">Loading notes...</div>
            ) : filtered.length === 0 ? (
              <div className="approvals-empty">
                {filter === 'pending' ? 'Nothing waiting on approval.' : 'No notes yet.'}
              </div>
            ) : (
              filtered.map(item => (
                <div key={item.id} className={`approval-card is-${item.status === 'pending_approval' ? 'pending' : item.status}`}>
                  <div className="approval-top">
                    <div>
                      <div className="approval-sender">{item.sender_name || 'Unknown'}</div>
                      <div className="approval-sender-email">{item.sender_email}</div>
                    </div>
                    <span className={`approval-status ${item.status}`}>
                      {item.status === 'pending_approval' ? 'Pending' : item.status}
                    </span>
                  </div>
                  <div className="approval-message">{item.message}</div>
                  <div className="approval-meta">
                    {item.page_url ? (
                      <a href={item.page_url} target="_blank" rel="noopener noreferrer" className="approval-source">
                        {item.page_slug || item.page_url} &#8599;
                      </a>
                    ) : <span />}
                    {item.status === 'pending_approval' ? (
                      <div className="approval-actions">
                        <button
                          className="approval-btn reject"
                          disabled={acting === item.id}
                          onClick={() => act(item.id, 'reject')}
                        >
                          Reject
                        </button>
                        <button
                          className="approval-btn approve"
                          disabled={acting === item.id}
                          onClick={() => act(item.id, 'approve')}
                        >
                          Approve
                        </button>
                      </div>
                    ) : (
                      <span className="approval-resolved-note">
                        {item.status === 'approved' ? 'Approved' : 'Rejected'} by {item.resolved_by || '—'} &middot; {item.resolved_at ? formatDate(item.resolved_at) : ''}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}
