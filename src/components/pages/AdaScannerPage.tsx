'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Violation {
  id: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null
  description: string
  help: string
  helpUrl: string
  affected_elements: number | null
}

interface WaveViolation {
  category: 'error' | 'contrast' | 'alert'
  id: string
  description: string
  count: number
}

interface ScanResult {
  id: string
  page_url: string
  ada_score: number | null
  wave_score: number | null
  lighthouse_a11y_score: number | null
  ada_violations: Violation[]
  wave_violations: WaveViolation[] | null
  ada_violations_critical: number
  ada_violations_serious: number
  ada_violations_moderate: number
  ada_violations_minor: number
  audited_at: string
  status: string
}

const BLUE = '#1672A7'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  serious:  '#EA580C',
  moderate: '#D97706',
  minor:    '#6B7280',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pass:        { label: 'Passing',       color: '#059669', bg: '#ECFDF5' },
  needs_work:  { label: 'Needs Work',    color: '#D97706', bg: '#FFFBEB' },
  critical:    { label: 'Critical Issues', color: '#DC2626', bg: '#FEF2F2' },
  unknown:     { label: 'Unscored',      color: '#6B7280', bg: '#F3F4F6' },
}

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  input: { padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  btnPrimary: { padding: '10px 18px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

function scoreColor(score: number | null): string {
  if (score == null) return '#6B7280'
  if (score >= 90) return '#059669'
  if (score >= 60) return '#D97706'
  return '#DC2626'
}

export default function AdaScannerPage() {
  const supabase = createClient()
  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const r = await fetch('/api/bcps/ada-scan', { headers: { Authorization: `Bearer ${await token()}` } })
      const j = await r.json()
      if (r.ok) setHistory(j.scans ?? [])
    } finally {
      setHistoryLoading(false)
    }
  }, [token])

  useEffect(() => { loadHistory() }, [loadHistory])

  const runScan = async () => {
    if (!url.trim()) return
    setScanning(true)
    setError('')
    setResult(null)
    try {
      const r = await fetch('/api/bcps/ada-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ url: url.trim() }),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Scan failed. Please try again.'); return }
      setResult(j.result)
      loadHistory()
    } catch {
      setError('Scan failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      <div style={C.card}>
        <div style={C.sublabel}>Scan a page</div>
        <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 14px' }}>
          Paste any live page URL (a department page, a document page, anything on browardschools.com or
          browardschools.ai) and run a real accessibility check - Lighthouse, a real axe-core scan in a real
          headless browser, and WAVE (WebAIM), the same proven combination already verified live elsewhere.
          No guessing, no placeholder data.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            style={C.input}
            placeholder="https://www.browardschools.com/yourdepartment"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runScan() }}
            disabled={scanning}
          />
          <button style={{ ...C.btnPrimary, opacity: scanning ? 0.6 : 1 }} onClick={runScan} disabled={scanning}>
            {scanning ? 'Scanning…' : 'Scan Page'}
          </button>
        </div>
        {error && <div style={{ marginTop: 10, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{error}</div>}
      </div>

      {result && (
        <div style={C.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={C.sublabel}>Result</div>
              <a href={result.page_url} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 700, color: BLUE, textDecoration: 'none', wordBreak: 'break-all' }}>
                {result.page_url}
              </a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor(result.ada_score), lineHeight: 1 }}>
                  {result.ada_score ?? '—'}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>ADA Score (axe-core)</div>
              </div>
              {result.wave_score != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor(result.wave_score), lineHeight: 1 }}>
                    {result.wave_score}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>WAVE Score</div>
                </div>
              )}
              {result.lighthouse_a11y_score != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor(result.lighthouse_a11y_score), lineHeight: 1 }}>
                    {result.lighthouse_a11y_score}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Lighthouse A11y</div>
                </div>
              )}
              {(() => {
                const s = STATUS_CONFIG[result.status] ?? STATUS_CONFIG.unknown
                return (
                  <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: s.color, background: s.bg }}>
                    {s.label}
                  </span>
                )
              })()}
            </div>
          </div>

          {result.ada_violations.length === 0 ? (
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
              No failing axe-core accessibility checks found on this page. 🎉
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {(['critical', 'serious', 'moderate', 'minor'] as const).map(sev => {
                  const key = `ada_violations_${sev}` as keyof ScanResult
                  const n = result[key] as number
                  if (!n) return null
                  return (
                    <span key={sev} style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: SEVERITY_COLORS[sev] }}>
                      {n} {sev}
                    </span>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {result.ada_violations.map(v => (
                  <div key={v.id} style={{ borderLeft: `3px solid ${SEVERITY_COLORS[v.impact ?? 'minor']}`, paddingLeft: 12, paddingTop: 2, paddingBottom: 2 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{v.help}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{v.description}</div>
                    {v.affected_elements != null && (
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{v.affected_elements} element(s) affected</div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {result.wave_violations && result.wave_violations.length > 0 && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
              <div style={C.sublabel}>WAVE items ({result.wave_violations.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.wave_violations.map(v => (
                  <div key={v.id} style={{ fontSize: 12, color: '#374151' }}>
                    <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{v.category}</span>: {v.description} ({v.count}x)
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={C.card}>
        <div style={C.sublabel}>Your recent scans</div>
        {historyLoading ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9ca3af' }}>No scans yet. Run your first one above.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.map(h => (
              <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.page_url}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(h.audited_at).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: scoreColor(h.ada_score), minWidth: 32, textAlign: 'right' }}>
                  {h.ada_score ?? '—'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
