'use client'

import { useEffect, useMemo, useState } from 'react'

interface MatchedRow {
  dept_id: string
  dept_name: string
  division: string | null
  director_name: string | null
  wcm_name: string | null
  roster_id: string
  roster_name: string
  location_number: string | null
}
interface Suggestion { dept_id: string; dept_name: string; score: number }
interface UnmatchedRosterRow {
  id: string
  department_name: string
  location_number: string | null
  suggestions: Suggestion[]
}
interface UnmatchedDeptRow {
  id: string
  name: string
  division: string | null
  director_name: string | null
  wcm_name: string | null
}
interface AuditData {
  matched: MatchedRow[]
  unmatchedRoster: UnmatchedRosterRow[]
  unmatchedDept: UnmatchedDeptRow[]
  counts: {
    departments: number
    roster: number
    matched: number
    unmatchedRoster: number
    unmatchedDept: number
  }
}

type Tab = 'matched' | 'unmatched-roster' | 'unmatched-dept'

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

const statCard: React.CSSProperties = {
  flex: '1 1 150px', padding: '14px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: '#fff',
}

export default function DepartmentAuditPage() {
  const [data, setData] = useState<AuditData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('unmatched-roster')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/bcps/department-audit')
      .then(r => r.json())
      .then(j => { if (j.error) setError(j.error); else setData(j) })
      .catch(() => setError('Could not load the audit data.'))
  }, [])

  const query = q.trim().toLowerCase()

  const filteredMatched = useMemo(() => {
    if (!data) return []
    if (!query) return data.matched
    return data.matched.filter(r =>
      r.dept_name.toLowerCase().includes(query) || r.roster_name.toLowerCase().includes(query))
  }, [data, query])

  const filteredUnmatchedRoster = useMemo(() => {
    if (!data) return []
    if (!query) return data.unmatchedRoster
    return data.unmatchedRoster.filter(r => r.department_name.toLowerCase().includes(query))
  }, [data, query])

  const filteredUnmatchedDept = useMemo(() => {
    if (!data) return []
    if (!query) return data.unmatchedDept
    return data.unmatchedDept.filter(d => d.name.toLowerCase().includes(query))
  }, [data, query])

  if (error) {
    return <div style={{ padding: 24, color: '#DC2626', fontSize: 14 }}>{error}</div>
  }
  if (!data) {
    return <div style={{ padding: 24, fontSize: 14, color: 'var(--text-secondary)' }}>Loading department audit...</div>
  }

  const { counts } = data

  return (
    <div style={{ padding: '20px 24px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
          Department Name Audit
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
          Compares the <strong>Department Profiles</strong> list (org-chart derived, drives the audit/website tool)
          against the <strong>Roster / Dropdown</strong> list (what WCMs and Directors actually pick from when
          registering). Rows that don&apos;t line up are what needs a naming decision before the intake process can
          sync them into a department profile automatically.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={statCard}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{counts.departments}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Department Profiles</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{counts.roster}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Roster / Dropdown</div>
        </div>
        <div style={{ ...statCard, borderColor: 'rgba(5,150,105,0.3)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{counts.matched}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Matched</div>
        </div>
        <div style={{ ...statCard, borderColor: 'rgba(217,119,6,0.35)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706' }}>{counts.unmatchedRoster}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Roster, No Profile</div>
        </div>
        <div style={{ ...statCard, borderColor: 'rgba(220,38,38,0.3)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626' }}>{counts.unmatchedDept}</div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Profile, No Roster</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            ['unmatched-roster', `Needs Review (${counts.unmatchedRoster})`],
            ['matched', `Matched (${counts.matched})`],
            ['unmatched-dept', `Profile, No Roster (${counts.unmatchedDept})`],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                border: tab === id ? '1.5px solid var(--blue)' : '1.5px solid var(--border)',
                background: tab === id ? 'var(--blue)' : '#fff',
                color: tab === id ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search department name..."
          style={{
            marginLeft: 'auto', padding: '8px 12px', borderRadius: 8,
            border: '1.5px solid var(--border)', fontSize: 13, minWidth: 220,
          }}
        />
      </div>

      {tab === 'unmatched-roster' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--panel, #f4f7fb)' }}>
            These roster/dropdown entries have no linked department profile, so approvals for them today do not sync
            into <code>bcps_departments</code>. For each, decide: same as an existing profile (rename/consolidate) or
            a genuinely new department that needs its own profile.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#fafbfc', textAlign: 'left' }}>
                <th style={th}>Roster / Dropdown Name</th>
                <th style={th}>Location #</th>
                <th style={th}>Possible Match in Department Profiles</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnmatchedRoster.map(r => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>{titleCase(r.department_name)}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.location_number ?? '—'}</td>
                  <td style={td}>
                    {r.suggestions.length === 0 ? (
                      <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No close match — likely new</span>
                    ) : (
                      r.suggestions.map(s => (
                        <span key={s.dept_id} style={{
                          display: 'inline-block', marginRight: 6, marginBottom: 4,
                          padding: '3px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                          background: s.score >= 0.99 ? 'rgba(220,38,38,0.1)' : 'rgba(217,119,6,0.12)',
                          color: s.score >= 0.99 ? '#DC2626' : '#D97706',
                        }}>
                          {s.dept_name}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
              {filteredUnmatchedRoster.length === 0 && (
                <tr><td style={td} colSpan={3}>No rows match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'matched' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#fafbfc', textAlign: 'left' }}>
                <th style={th}>Department Profile</th>
                <th style={th}>Division</th>
                <th style={th}>Roster / Dropdown Name</th>
                <th style={th}>Location #</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatched.map(r => (
                <tr key={r.dept_id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>{r.dept_name}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.division ?? '—'}</td>
                  <td style={td}>{titleCase(r.roster_name)}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{r.location_number ?? '—'}</td>
                </tr>
              ))}
              {filteredMatched.length === 0 && (
                <tr><td style={td} colSpan={4}>No rows match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'unmatched-dept' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)', background: 'var(--panel, #f4f7fb)' }}>
            These department profiles have no matching entry anywhere in the roster/dropdown list at all.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: '#fafbfc', textAlign: 'left' }}>
                <th style={th}>Department Profile</th>
                <th style={th}>Division</th>
                <th style={th}>Director</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnmatchedDept.map(d => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={td}>{d.name}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{d.division ?? '—'}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)' }}>{d.director_name ?? '—'}</td>
                </tr>
              ))}
              {filteredUnmatchedDept.length === 0 && (
                <tr><td style={td} colSpan={3}>No rows match your search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 16px', fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }
const td: React.CSSProperties = { padding: '10px 16px', color: 'var(--text-primary)', verticalAlign: 'top' }
