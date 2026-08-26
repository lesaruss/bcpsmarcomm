'use client'

// src/components/pages/RegistrationsPage.tsx
// SuperAdmin > Registrations. One feed for every "someone signed up /
// submitted something" flow on the site, filterable by type. Backed by
// GET /api/bcps/registrations (course + director + certification, in that
// endpoint's shape). New types should be added there and picked up here via
// TYPE_META rather than a one-off fetch.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'

type RegType = 'course' | 'director' | 'certification'

interface RegItem {
  type: RegType
  id: string
  name: string
  email: string | null
  department: string | null
  status: string
  date: string | null
  detail: Record<string, unknown> | null
}

interface Counts {
  all: number
  course: number
  director: number
  certification: number
  director_pending: number
}

const TYPE_META: Record<RegType, { label: string; color: string }> = {
  course: { label: 'Course Registration', color: '#1672A7' },
  director: { label: 'Director Submission', color: '#C55326' },
  certification: { label: 'Certification', color: '#16750C' },
}

const STATUS_COLOR: Record<string, string> = {
  certified: '#16750C',
  approved: '#16750C',
  'in-progress': '#C55326',
  pending: '#C55326',
  rejected: '#9ca3af',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function StatusPill({ status }: { status: string }) {
  const color = STATUS_COLOR[status] || '#9ca3af'
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 700, textTransform: 'capitalize',
      color, background: `${color}1a`, border: `1px solid ${color}40`,
    }}>
      {status.replace('-', ' ')}
    </span>
  )
}

export default function RegistrationsPage() {
  const [items, setItems] = useState<RegItem[]>([])
  const [counts, setCounts] = useState<Counts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'all' | RegType>('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        const res = await fetch('/api/bcps/registrations', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load registrations')
        if (!cancelled) {
          setItems(json.items || [])
          setCounts(json.counts || null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load registrations')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let list = activeTab === 'all' ? items : items.filter(i => i.type === activeTab)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        (i.email || '').toLowerCase().includes(q) ||
        (i.department || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [items, activeTab, search])

  const tabs: Array<{ id: 'all' | RegType; label: string; count: number }> = counts ? [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'course', label: 'Course Registrations', count: counts.course },
    { id: 'director', label: `Director Submissions${counts.director_pending ? ` (${counts.director_pending} pending)` : ''}`, count: counts.director },
    { id: 'certification', label: 'Certifications', count: counts.certification },
  ] : []

  return (
    <div>
      <style>{`
        .reg-header { margin-bottom: 20px; }
        .reg-header h2 { font-size: 20px; font-weight: 800; color: #1a1a1a; margin: 0 0 4px; }
        .reg-header p { font-size: 13px; color: #6b7280; margin: 0; }
        .reg-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; border-bottom: 1px solid rgba(0,0,0,0.08); padding-bottom: 12px; }
        .reg-tab { font-size: 12.5px; font-weight: 700; padding: 8px 14px; border-radius: 8px; border: 1.5px solid transparent; background: #f3f4f6; color: #4b5563; cursor: pointer; font-family: inherit; }
        .reg-tab.active { background: #0e4e73; color: #fff; }
        .reg-toolbar { margin-bottom: 14px; }
        .reg-search { width: 100%; max-width: 320px; padding: 9px 12px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; font-family: inherit; }
        .reg-table-wrap { border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; overflow: hidden; overflow-x: auto; }
        .reg-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
        .reg-table th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: rgba(26,26,26,0.45); background: #f9fafb; padding: 10px 14px; border-bottom: 1px solid rgba(0,0,0,0.08); white-space: nowrap; }
        .reg-table td { padding: 11px 14px; border-bottom: 1px solid rgba(0,0,0,0.06); vertical-align: top; }
        .reg-table tr:last-child td { border-bottom: none; }
        .reg-name { font-weight: 700; color: #1a1a1a; }
        .reg-email { font-size: 11px; color: rgba(26,26,26,0.45); }
        .reg-type-tag { font-size: 10.5px; font-weight: 700; }
        .reg-empty { padding: 40px 20px; text-align: center; color: #9ca3af; font-size: 13px; }
      `}</style>

      <div className="reg-header">
        <h2>Registrations</h2>
        <p>Every sign-up, submission, and completion across the WCM certification course and department roster, in one place.</p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#7F1D1D', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {!error && (
        <>
          <div className="reg-tabs">
            {tabs.map(t => (
              <button
                key={t.id}
                className={`reg-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          <div className="reg-toolbar">
            <input
              className="reg-search"
              placeholder="Search name, email, or department..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="reg-table-wrap">
            <table className="reg-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="reg-empty">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="reg-empty">No registrations match this view.</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id}>
                    <td>
                      <span className="reg-type-tag" style={{ color: TYPE_META[item.type].color }}>
                        {TYPE_META[item.type].label}
                      </span>
                    </td>
                    <td>
                      <div className="reg-name">{item.name}</div>
                      {item.email && <div className="reg-email">{item.email}</div>}
                    </td>
                    <td>{item.department || <span style={{ color: 'rgba(26,26,26,0.35)', fontStyle: 'italic' }}>—</span>}</td>
                    <td><StatusPill status={item.status} /></td>
                    <td style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{formatDate(item.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
