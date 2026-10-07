'use client'
// AdaResults: the full ADA scan from an audit run, split into what the WCM
// fixes and what belongs to Finalsite. Shared by the dashboard's Run Audit tab
// and the department profile's Web Review tab (Sean, 2026-10-07: the ADA scan
// runs with the audit, so it has no separate tab).

import { useState } from 'react'
import { lookupAxeEntry } from '@/lib/ada-glossary'

// The full ADA scan from the same run: what the WCM fixes in Composer, and
// what belongs to Finalsite (site header, menus, footer; reported monthly).
export default function AdaResults({ violations }: { violations: unknown }) {
  const [scope, setScope] = useState<'wcm' | 'finalsite'>('wcm')
  const all = (Array.isArray(violations) ? violations : []) as { id: string; impact?: string; nodes?: number; description?: string; helpUrl?: string; owner?: string }[]
  const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }
  const list = all.filter((v) => (scope === 'finalsite') === (v.owner === 'finalsite')).sort((a, b) => (order[a.impact || ''] ?? 4) - (order[b.impact || ''] ?? 4))
  const wcmCount = all.filter((v) => v.owner !== 'finalsite').length
  return (
    <div className="home-dept home-section">
      <div className="home-dept-head">
        <h3>ADA scan results</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className={scope === 'wcm' ? 'home-btn' : 'wcm-hub2-card-btn'} onClick={() => setScope('wcm')}>You can fix ({wcmCount})</button>
          <button type="button" className={scope === 'finalsite' ? 'home-btn' : 'wcm-hub2-card-btn'} onClick={() => setScope('finalsite')}>Finalsite fixes ({all.length - wcmCount})</button>
        </div>
      </div>
      <p className="home-card-text">{scope === 'wcm' ? 'WCAG 2.1 AA issues the scan found that you can fix in Finalsite Composer. These are also pinned on your page above, under Accessibility.' : 'Issues in the site header, menus and footer. They belong to Finalsite, are reported to them every month, and never count against your page.'}</p>
      {list.length === 0 ? <p className="home-card-text"><b>None found.</b></p> : (
        <ul className="home-tasks">
          {list.map((v) => {
            const g = lookupAxeEntry(v.id)
            return (
              <li key={v.id}>
                <details>
                  <summary className="home-task" style={{ cursor: 'pointer' }}>
                    <span className="home-task-title">{g?.title ?? v.description ?? v.id}</span>
                    <span className="home-task-meta">{(v.impact || 'moderate').replace(/^./, (c) => c.toUpperCase())} · {v.nodes ?? 1} on the page</span>
                  </summary>
                  <div className="home-card-text" style={{ padding: '6px 4px 10px' }}>
                    {g?.definition && <p style={{ margin: '0 0 6px' }}>{g.definition}</p>}
                    {scope === 'wcm' && g?.fixSteps?.length ? <ol style={{ margin: '0 0 6px', paddingLeft: 18 }}>{g.fixSteps.map((st, i) => <li key={i}>{st}</li>)}</ol> : null}
                    {scope === 'finalsite' && g?.escalationNote ? <p style={{ margin: '0 0 6px' }}>{g.escalationNote}</p> : null}
                    {v.helpUrl && <a className="home-link-btn" href={v.helpUrl} target="_blank" rel="noopener">Technical detail</a>}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

