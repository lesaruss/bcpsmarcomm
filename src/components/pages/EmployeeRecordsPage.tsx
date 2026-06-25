// @ts-nocheck
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

interface EmployeeRecord {
  id: string
  record_type: string
  title: string
  description: string | null
  school_year: string | null
  hq_url: string | null
  document_url: string | null
  metadata: Record<string, string> | null
  is_private: boolean
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  performance_appraisal: 'Performance Appraisal',
  brief: 'Meeting Brief',
  contract: 'Contract',
  certification: 'Certification',
  other: 'Document',
}

const FILTERS = [
  { key: 'all', label: 'All Records' },
  { key: 'performance_appraisal', label: 'Performance Appraisals' },
  { key: 'brief', label: 'Meeting Briefs' },
  { key: 'other', label: 'Other' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function EmployeeRecordsPage() {
  const [records, setRecords] = useState<EmployeeRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const sb = createClient()
    async function load() {
      const { data: { user } } = await sb.auth.getUser()
      if (user?.email) setUserEmail(user.email)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (sb as any)
        .from('employee_records')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) setRecords(data)
      setLoading(false)
    }
    load()
  }, [])

  const visible = filter === 'all'
    ? records
    : filter === 'other'
      ? records.filter(r => !['performance_appraisal', 'brief'].includes(r.record_type))
      : records.filter(r => r.record_type === filter)

  return (
    <div style={{ padding: '28px', maxWidth: '860px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', marginBottom: '4px' }}>
          Employee Records
        </h1>
        {userEmail && (
          <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>
            Records for {userEmail}
          </p>
        )}
      </div>

      {/* Info banner */}
      <div style={{
        background: 'rgba(22,114,167,0.07)', border: '1px solid rgba(22,114,167,0.22)',
        borderRadius: '8px', padding: '12px 16px', marginBottom: '24px',
        fontSize: '12px', color: '#374151', lineHeight: 1.65,
      }}>
        <strong style={{ color: '#0e4e73' }}>Private and secure.</strong> These records are visible only to you and are not accessible to other members.
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(0,0,0,0.09)', marginBottom: '24px' }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em',
              padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer',
              color: filter === f.key ? '#1672A7' : '#9ca3af',
              borderBottom: filter === f.key ? '3px solid #1672A7' : '3px solid transparent',
              marginBottom: '-1px', fontFamily: 'inherit', transition: 'all 0.12s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', fontWeight: 600 }}>
          Loading records...
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '10px',
          padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', fontWeight: 600,
        }}>
          No records in this category.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {visible.map(r => {
            const meta = r.metadata || {}
            const typeLabel = TYPE_LABELS[r.record_type] || 'Document'
            const isH = meta.overall_rating?.startsWith('H')

            return (
              <div key={r.id} style={{
                background: '#fff', border: '1px solid rgba(0,0,0,0.09)', borderRadius: '10px',
                padding: '22px', display: 'flex', gap: '18px', alignItems: 'flex-start',
              }}>
                {/* Icon */}
                <div style={{
                  width: 42, height: 42, minWidth: 42, borderRadius: '10px',
                  background: 'rgba(22,114,167,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1672A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#1672A7' }}>
                      {typeLabel}
                    </span>
                    {meta.overall_rating && (
                      <span style={{
                        fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em',
                        padding: '2px 7px', borderRadius: '4px',
                        background: isH ? 'rgba(22,117,12,0.10)' : 'rgba(22,114,167,0.10)',
                        border: isH ? '1px solid rgba(22,117,12,0.28)' : '1px solid rgba(22,114,167,0.28)',
                        color: isH ? '#16750C' : '#0e4e73',
                      }}>
                        {meta.overall_rating}
                      </span>
                    )}
                    <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', padding: '2px 7px', borderRadius: '4px', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.09)', color: '#9ca3af' }}>
                      Private
                    </span>
                  </div>

                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#1a1a1a', marginBottom: '6px', lineHeight: 1.3 }}>
                    {r.title}
                  </div>
                  {r.description && (
                    <div style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.65, marginBottom: '12px' }}>
                      {r.description}
                    </div>
                  )}

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {r.school_year && (
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.35)', marginBottom: '2px' }}>School Year</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{r.school_year}</div>
                      </div>
                    )}
                    {meta.supervisor && (
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.35)', marginBottom: '2px' }}>Supervisor</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{meta.supervisor}</div>
                      </div>
                    )}
                    {meta.department && (
                      <div>
                        <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.35)', marginBottom: '2px' }}>Department</div>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{meta.department}</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.18em', color: 'rgba(26,26,26,0.35)', marginBottom: '2px' }}>Added</div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280' }}>{formatDate(r.created_at)}</div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {r.hq_url && (
                      <a href={r.hq_url} target="_blank" rel="noreferrer" style={{
                        fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                        padding: '7px 14px', borderRadius: '6px', background: '#1672A7', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none',
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        View Document
                      </a>
                    )}
                    {r.document_url && r.document_url !== r.hq_url && (
                      <a href={r.document_url} target="_blank" rel="noreferrer" style={{
                        fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em',
                        padding: '7px 14px', borderRadius: '6px', background: '#fafafa',
                        border: '1px solid rgba(0,0,0,0.09)', color: '#6b7280', textDecoration: 'none',
                      }}>
                        External Link
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
