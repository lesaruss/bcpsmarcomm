'use client'

// components/pages/AdaScannerPage.tsx
//
// District-team, single-URL ADA spot-check tool (main app nav, "Web
// Content Managers" section - restricted via ACL to the same district
// groups as ADA Manager, confirmed 2026-09-02: this is not a school WCM
// surface, school WCMs use the school-portal's own scanner tab instead,
// which only ever shows the "You Can Fix" bucket).
//
// 2026-09-02: findings are grouped into three tabs by who owns the fix -
// "You Can Fix", "FinalSite", "Depends" - same pattern as ADA Manager's
// per-page detail, so the two district-facing surfaces read consistently.
// A "Depends" finding can be reclassified here too (lib/ada-owner-overrides.ts).

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { lookupAxeEntry, lookupWaveEntry, type GlossaryOwner } from '@/lib/ada-glossary'
import { resolveOwner, fetchOwnerOverrides, setOwnerOverride, type OwnerOverrideMap } from '@/lib/ada-owner-overrides'
import AdaGlossaryPanel from '@/components/AdaGlossaryPanel'

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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pass:        { label: 'Passing',       color: '#059669', bg: '#ECFDF5' },
  needs_work:  { label: 'Needs Work',    color: '#D97706', bg: '#FFFBEB' },
  critical:    { label: 'Critical Issues', color: '#DC2626', bg: '#FEF2F2' },
  unknown:     { label: 'Unscored',      color: '#6B7280', bg: '#F3F4F6' },
}

const OWNER_TABS: { owner: GlossaryOwner; label: string }[] = [
  { owner: 'wcm', label: 'You Can Fix' },
  { owner: 'finalsite', label: 'FinalSite' },
  { owner: 'depends', label: 'Depends' },
]

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

function OwnerBadge({ owner, entryFound }: { owner: GlossaryOwner; entryFound: boolean }) {
  if (!entryFound) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
        Not yet catalogued
      </span>
    )
  }
  const meta = owner === 'wcm'
    ? { label: 'You can fix this', color: '#fff', bg: '#16750C' }
    : owner === 'finalsite'
      ? { label: 'FinalSite issue, escalate', color: '#fff', bg: '#C55326' }
      : { label: 'Depends, see note', color: '#2b2200', bg: '#D4B106' }
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em', color: meta.color, background: meta.bg, whiteSpace: 'nowrap' }}>
      {meta.label}
    </span>
  )
}

type Bucketed = {
  key: string
  owner: GlossaryOwner
  entryFound: boolean
  title: string
  definition: string
  helpUrl?: string
  affectedElements?: number | null
  countSuffix?: string
  glossaryKey?: string
}

function bucketResult(result: ScanResult, overrides: OwnerOverrideMap): Record<GlossaryOwner, Bucketed[]> {
  const buckets: Record<GlossaryOwner, Bucketed[]> = { wcm: [], finalsite: [], depends: [] }

  result.ada_violations.forEach((v, i) => {
    const entry = lookupAxeEntry(v.id)
    const owner = resolveOwner(entry, overrides)
    buckets[owner].push({
      key: `axe-${v.id}-${i}`, owner, entryFound: !!entry,
      title: entry?.title ?? v.help, definition: entry?.definition ?? v.description,
      helpUrl: v.helpUrl, affectedElements: v.affected_elements, glossaryKey: entry?.key,
    })
  })

  ;(result.wave_violations ?? []).forEach((v, i) => {
    const entry = lookupWaveEntry(v.id, v.description)
    const owner = resolveOwner(entry, overrides)
    buckets[owner].push({
      key: `wave-${v.id}-${i}`, owner, entryFound: !!entry,
      title: entry?.title ?? v.description,
      definition: `${v.category[0].toUpperCase()}${v.category.slice(1)} finding`,
      countSuffix: ` (${v.count}x)`, glossaryKey: entry?.key,
    })
  })

  return buckets
}

function FindingCard({ f, onReclassify }: { f: Bucketed; onReclassify?: (owner: GlossaryOwner) => void }) {
  return (
    <div style={{ borderLeft: `3px solid ${f.owner === 'wcm' ? '#16750C' : f.owner === 'finalsite' ? '#C55326' : '#D4B106'}`, paddingLeft: 12, paddingTop: 2, paddingBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{f.title}{f.countSuffix}</div>
        <OwnerBadge owner={f.owner} entryFound={f.entryFound} />
      </div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{f.definition}</div>
      {f.affectedElements != null && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{f.affectedElements} element(s) affected</div>
      )}
      {!f.entryFound && f.helpUrl && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
          <a href={f.helpUrl} target="_blank" rel="noreferrer" style={{ color: BLUE }}>axe-core reference for this rule</a> (glossary entry pending)
        </div>
      )}
      {onReclassify && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={() => onReclassify('wcm')} style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, border: '1px solid #16750C', background: '#fff', color: '#16750C', cursor: 'pointer' }}>
            Mark: WCM can fix
          </button>
          <button onClick={() => onReclassify('finalsite')} style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 6, border: '1px solid #C55326', background: '#fff', color: '#C55326', cursor: 'pointer' }}>
            Mark: FinalSite
          </button>
        </div>
      )}
    </div>
  )
}

export default function AdaScannerPage() {
  const supabase = createClient()
  const [url, setUrl] = useState('')
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ScanResult | null>(null)
  const [history, setHistory] = useState<ScanResult[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [overrides, setOverrides] = useState<OwnerOverrideMap>({})
  const [tab, setTab] = useState<GlossaryOwner>('wcm')

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const t = await token()
      const [r, overridesMap] = await Promise.all([
        fetch('/api/bcps/ada-scan', { headers: { Authorization: `Bearer ${t}` } }),
        fetchOwnerOverrides(t),
      ])
      const j = await r.json()
      if (r.ok) setHistory(j.scans ?? [])
      setOverrides(overridesMap)
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
      setTab('wcm')
      loadHistory()
    } catch {
      setError('Scan failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  const reclassify = useCallback(async (glossaryKey: string, owner: GlossaryOwner) => {
    try {
      const t = await token()
      const map = await setOwnerOverride(t, glossaryKey, owner)
      setOverrides(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reclassification.')
    }
  }, [token])

  const buckets = result ? bucketResult(result, overrides) : null
  const active = buckets ? buckets[tab] : []

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

      {result && buckets && (
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

          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {OWNER_TABS.map(t => (
              <button
                key={t.owner}
                onClick={() => setTab(t.owner)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${tab === t.owner ? BLUE : '#d1d5db'}`,
                  background: tab === t.owner ? BLUE : '#fff',
                  color: tab === t.owner ? '#fff' : '#374151',
                }}
              >
                {t.label} ({buckets[t.owner].length})
              </button>
            ))}
          </div>

          {active.length === 0 ? (
            <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
              {tab === 'wcm' ? 'No fixable-by-WCM findings in this bucket. 🎉' : `No ${tab === 'finalsite' ? 'FinalSite' : 'depends'} findings on this page.`}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {active.map(f => (
                <FindingCard key={f.key} f={f} onReclassify={tab === 'depends' && f.glossaryKey ? (o) => reclassify(f.glossaryKey!, o) : undefined} />
              ))}
            </div>
          )}
        </div>
      )}

      <div style={C.card}>
        <div style={C.sublabel}>Issue glossary</div>
        <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 14px' }}>
          Every finding the scanner can surface, defined once and vetted once. Search it directly if you
          already know what the error is, no need to run a scan first.
        </p>
        <AdaGlossaryPanel />
      </div>

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
