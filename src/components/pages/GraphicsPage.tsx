'use client'

import { useState } from 'react'

type Status = 'In Review' | 'In Production' | 'Complete' | 'Pending'
type FilterTab = 'All' | Status

interface PrintRequest {
  id: string
  title: string
  department: string
  type: string
  status: Status
  due: string
  assignedTo: string
}

const SAMPLE_REQUESTS: PrintRequest[] = [
  { id: '#0041', title: 'Spring Awards Program', department: 'Margate Elementary', type: 'Print', status: 'In Production', due: 'Jun 28', assignedTo: 'FH' },
  { id: '#0040', title: 'Communications Newsletter', department: 'Office of Communications', type: 'Print & Design', status: 'In Review', due: 'Jun 25', assignedTo: 'VD' },
  { id: '#0039', title: 'Championship Banners (3)', department: 'Athletics Dept', type: 'Large Format', status: 'In Review', due: 'Jun 24', assignedTo: 'TA' },
  { id: '#0038', title: 'School Directory 2024-25', department: 'Coconut Creek High', type: 'Print', status: 'Complete', due: 'Jun 20', assignedTo: 'NA' },
  { id: '#0037', title: 'Employee Handbook Insert', department: 'HR Dept', type: 'Print & Design', status: 'Pending', due: 'Jul 2', assignedTo: '-' },
]

const STATUS_COLORS: Record<Status, { bg: string; color: string; dot: string }> = {
  'In Review':     { bg: '#EFF6FF', color: '#1D4ED8', dot: '#3B82F6' },
  'In Production': { bg: '#F0FDF4', color: '#15803D', dot: '#22C55E' },
  'Complete':      { bg: '#F3F4F6', color: '#374151', dot: '#9CA3AF' },
  'Pending':       { bg: '#FFFBEB', color: '#92400E', dot: '#F59E0B' },
}

const AVATAR_COLORS: Record<string, string> = {
  FH: '#7C3AED',
  VD: '#059669',
  TA: '#D97706',
  NA: '#0891B2',
}

export default function GraphicsPage() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All')

  const filtered = activeFilter === 'All'
    ? SAMPLE_REQUESTS
    : SAMPLE_REQUESTS.filter(r => r.status === activeFilter)

  const stats = {
    total: SAMPLE_REQUESTS.length,
    inQueue: SAMPLE_REQUESTS.filter(r => r.status === 'In Review' || r.status === 'Pending').length,
    completed: SAMPLE_REQUESTS.filter(r => r.status === 'Complete').length,
    departments: new Set(SAMPLE_REQUESTS.map(r => r.department)).size,
  }

  const FILTERS: FilterTab[] = ['All', 'In Review', 'In Production', 'Complete', 'Pending']

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Total Requests', value: stats.total, accent: '#003087' },
          { label: 'In Queue', value: stats.inQueue, accent: '#D97706' },
          { label: 'Completed', value: stats.completed, accent: '#059669' },
          { label: 'Departments', value: stats.departments, accent: '#7C3AED' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            padding: '20px 22px',
            borderTop: `3px solid ${stat.accent}`,
          }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#6B7280', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs + New Request button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeFilter === f ? '1px solid #003087' : '1px solid #E5E7EB',
                background: activeFilter === f ? '#003087' : '#fff',
                color: activeFilter === f ? '#fff' : '#374151',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <button style={{
          padding: '8px 18px',
          borderRadius: '8px',
          border: 'none',
          background: '#003087',
          color: '#fff',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Request
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
              {['#', 'Request', 'Department', 'Type', 'Status', 'Due', 'Assigned To', 'Actions'].map(h => (
                <th key={h} style={{
                  padding: '11px 16px',
                  textAlign: 'left',
                  fontWeight: 700,
                  color: '#6B7280',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((req, i) => {
              const sc = STATUS_COLORS[req.status]
              const avatarColor = AVATAR_COLORS[req.assignedTo] ?? '#94A3B8'
              return (
                <tr
                  key={req.id}
                  style={{
                    borderBottom: i < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = '' }}
                >
                  <td style={{ padding: '14px 16px', color: '#9CA3AF', fontWeight: 600, whiteSpace: 'nowrap' }}>{req.id}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: '#111827' }}>{req.title}</td>
                  <td style={{ padding: '14px 16px', color: '#374151' }}>{req.department}</td>
                  <td style={{ padding: '14px 16px', color: '#374151' }}>{req.type}</td>
                  <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '3px 10px', borderRadius: '20px',
                      background: sc.bg, color: sc.color,
                      fontSize: '11px', fontWeight: 700,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc.dot, flexShrink: 0 }} />
                      {req.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#374151', whiteSpace: 'nowrap' }}>{req.due}</td>
                  <td style={{ padding: '14px 16px' }}>
                    {req.assignedTo === '-' ? (
                      <span style={{ color: '#D1D5DB', fontSize: '13px' }}>Unassigned</span>
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: avatarColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '10px', fontWeight: 800, color: '#fff',
                      }}>
                        {req.assignedTo}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <button style={{
                      background: 'none', border: '1px solid #E5E7EB', borderRadius: '6px',
                      padding: '4px 10px', fontSize: '11px', fontWeight: 600,
                      color: '#374151', cursor: 'pointer',
                    }}>
                      View
                    </button>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>
                  No requests match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
