'use client'

import { useState, useEffect } from 'react'
import type { UserRole } from '@/components/Sidebar'

interface PulseWidgetProps {
  role: UserRole
}

interface PulseStats {
  totalDepts: number
  healthy: number
  pendingAudits: number
  recentBriefs: number
}

export default function PulseWidget({ role }: PulseWidgetProps) {
  const [stats, setStats] = useState<PulseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (role !== 'superadmin') return
    setLoading(true)
    fetch('/api/pulse')
      .then(r => r.json())
      .then((data: PulseStats) => setStats(data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [role])

  if (role !== 'superadmin') return null

  // ── Collapsed pill ────────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          background: '#1672A7', color: 'white', height: '30px',
          display: 'flex', alignItems: 'center', paddingLeft: '20px',
          gap: '7px', cursor: 'pointer',
          fontSize: '10px', fontWeight: 800, letterSpacing: '0.14em',
          textTransform: 'uppercase', userSelect: 'none',
        }}
      >
        <span style={{
          display: 'inline-block', width: '6px', height: '6px',
          borderRadius: '50%', background: '#4ade80',
          boxShadow: '0 0 6px #4ade80',
          flexShrink: 0,
        }} />
        BCPS Pulse
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5"
          style={{ marginLeft: 'auto', marginRight: '16px' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
    )
  }

  // ── Expanded bar ──────────────────────────────────────────────────────────
  const TILES = stats
    ? [
        { label: 'Departments',   val: stats.totalDepts,    color: 'rgba(255,255,255,0.9)' },
        { label: 'Healthy',       val: stats.healthy,       color: '#4ade80' },
        { label: 'Pending Audits', val: stats.pendingAudits, color: '#fbbf24' },
        { label: 'Briefs (30d)',  val: stats.recentBriefs,  color: '#a5f3fc' },
      ]
    : []

  return (
    <div style={{
      background: '#1672A7',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      padding: '7px 20px',
      display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
    }}>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <span style={{
          display: 'inline-block', width: '7px', height: '7px',
          borderRadius: '50%', background: '#4ade80',
          boxShadow: '0 0 6px #4ade80',
        }} />
        <span style={{
          fontSize: '10px', fontWeight: 800, color: 'rgba(255,255,255,0.65)',
          textTransform: 'uppercase', letterSpacing: '0.15em',
        }}>
          BCPS Pulse
        </span>
      </div>

      {/* Stats */}
      {loading ? (
        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Loading...</span>
      ) : (
        TILES.map(tile => (
          <div key={tile.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '16px', fontWeight: 800, color: tile.color, lineHeight: 1 }}>
              {tile.val}
            </span>
            <span style={{
              fontSize: '10px', color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              {tile.label}
            </span>
          </div>
        ))
      )}

      {/* Collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        title="Collapse Pulse"
        style={{
          marginLeft: 'auto', background: 'none', border: 'none',
          cursor: 'pointer', color: 'rgba(255,255,255,0.45)',
          padding: '2px', display: 'flex', alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    </div>
  )
}
