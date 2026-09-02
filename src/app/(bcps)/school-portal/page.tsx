'use client'

// Standalone page for individual school WCMs - modeled directly on
// /wcm-portal (department audit checklist), but for the ADA scan tool
// instead. Per V, 2026-08-19: schools don't have (and for now shouldn't
// get) the full BCPS Marcomm dashboard, so this page has no Sidebar/
// BCPSShell chrome at all - it is a school WCM's entire experience of this
// system. They're never routed here automatically; they're handed this
// URL directly once their account and school row exist (see
// /api/bcps/schools). Everything scoped to the scanner tab is scoped to
// the signed-in user's own school via /api/bcps/school-scan, which
// matches by email against bcps_schools.wcm_email - completely separate
// from the district ACL system used everywhere else in this app.
//
// Left-hand "ADA Management" zone added 2026-09-02 per Sean: a school WCM's
// only job here is ADA, so their nav should say that plainly - ADA Scanner
// (run a real scan, see history) and ADA Glossary (look up what a finding
// means and how to fix it), the same glossary the district team sees,
// reused as-is (components/AdaGlossaryPanel.tsx).

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import AdaGlossaryPanel from '@/components/AdaGlossaryPanel'
import { lookupAxeEntry, lookupWaveEntry } from '@/lib/ada-glossary'
import { resolveOwner, fetchOwnerOverrides, type OwnerOverrideMap } from '@/lib/ada-owner-overrides'
import FixWalkthrough from '@/components/ada/FixWalkthrough'

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

interface School {
  id: string
  name: string
  site_url: string | null
  wcm_email: string | null
}

type Tab = 'scanner' | 'glossary'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pass:        { label: 'Passing',         color: '#059669', bg: '#ECFDF5' },
  needs_work:  { label: 'Needs Work',      color: '#D97706', bg: '#FFFBEB' },
  critical:    { label: 'Critical Issues', color: '#DC2626', bg: '#FEF2F2' },
  unknown:     { label: 'Unscored',        color: '#6B7280', bg: '#F3F4F6' },
}

// One WCM-fixable finding. Sean, direct instruction, 2026-09-02: a plain
// list of fixSteps read as a wall of text to a WCM who "just got started" -
// he wants the walkthrough experience itself visible here, not just a
// glossary definition. Keeps the short step list inline for scanning, adds
// a lightbox walkthrough (components/ada/FixWalkthrough.tsx) for the
// step-by-step version.
function FixableFindingCard({ f }: {
  f: { key: string; title: string; definition: string; fixSteps?: string[]; sourceUrl?: string; affectedElements?: number | null; countSuffix?: string }
}) {
  const [walkthroughOpen, setWalkthroughOpen] = useState(false)
  return (
    <div style={{ borderLeft: '3px solid #16750C', paddingLeft: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{f.title}{f.countSuffix}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{f.definition}</div>
      {f.affectedElements != null && (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{f.affectedElements} element(s) affected</div>
      )}
      {f.fixSteps && f.fixSteps.length > 0 && (
        <>
          <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#374151' }}>
            {f.fixSteps.map((s, si) => <li key={si} style={{ marginBottom: 3 }}>{s}</li>)}
          </ol>
          <button
            onClick={() => setWalkthroughOpen(true)}
            style={{ marginTop: 8, fontSize: 11.5, fontWeight: 700, padding: '5px 11px', borderRadius: 6, border: '1px solid #2B5F8F', background: '#fff', color: '#2B5F8F', cursor: 'pointer' }}
          >
            Walk me through it →
          </button>
        </>
      )}
      {walkthroughOpen && f.fixSteps && (
        <FixWalkthrough title={f.title} steps={f.fixSteps} sourceUrl={f.sourceUrl} onClose={() => setWalkthroughOpen(false)} />
      )}
    </div>
  )
}

// Lower is more urgent - Sean, BOSS gut-check 2026-09-02: a WCM should see
// critical/serious findings first, same pattern applied district-side in
// ADAManagerPage/AdaScannerPage.
const IMPACT_RANK: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }
function impactRank(impact: string | null | undefined): number {
  return impact != null && impact in IMPACT_RANK ? IMPACT_RANK[impact] : 4
}

function scoreColor(score: number | null): string {
  if (score == null) return '#6B7280'
  if (score >= 90) return '#059669'
  if (score >= 60) return '#D97706'
  return '#DC2626'
}

const NAV_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
  </svg>
)
const GLOSSARY_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

export default function SchoolPortalPage() {
  const supabase = createClient()

  const [tab, setTab]             = useState<Tab>('scanner')
  const [loading, setLoading]     = useState(true)
  const [school, setSchool]       = useState<School | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [scanning, setScanning]   = useState(false)
  const [scanError, setScanError] = useState('')
  const [result, setResult]       = useState<ScanResult | null>(null)
  const [history, setHistory]     = useState<ScanResult[]>([])
  const [overrides, setOverrides] = useState<OwnerOverrideMap>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setError('Not signed in.'); setLoading(false); return }
      setUserEmail(user.email)

      const t = await token()
      const [r, overridesMap] = await Promise.all([
        fetch('/api/bcps/school-scan', { headers: { Authorization: `Bearer ${t}` } }),
        fetchOwnerOverrides(t),
      ])
      const j = await r.json()
      if (!r.ok) {
        setError(j.error || "We couldn't find a school account for your email. Contact the District Web Team if this is a mistake.")
        setLoading(false)
        return
      }
      setSchool(j.school)
      setHistory(j.scans ?? [])
      setOverrides(overridesMap)
    } catch {
      setError('Failed to load your portal. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [supabase, token])

  useEffect(() => { load() }, [load])

  const runScan = async () => {
    setScanning(true)
    setScanError('')
    setResult(null)
    try {
      const r = await fetch('/api/bcps/school-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      })
      const j = await r.json()
      if (!r.ok) { setScanError(j.error || 'Scan failed. Please try again.'); return }
      setResult(j.result)
      load()
    } catch {
      setScanError('Scan failed. Please try again.')
    } finally {
      setScanning(false)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#2B5F8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
          <p style={{ color: '#64748B', fontFamily: 'Montserrat, sans-serif' }}>Loading your ADA scan portal...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, background: '#fff', borderRadius: 12, padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" style={{ margin: '0 auto' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Access Error</h2>
          <p style={{ fontFamily: 'Montserrat, sans-serif', color: '#64748B', lineHeight: 1.6 }}>{error}</p>
          <a href="mailto:webmaster@bcps.net" style={{ display: 'inline-block', marginTop: 24, padding: '10px 20px', background: '#2B5F8F', color: '#fff', borderRadius: 8, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14 }}>
            Contact Web Team
          </a>
        </div>
      </div>
    )
  }

  const navBtnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, fontWeight: 700, textAlign: 'left',
    background: active ? 'rgba(43,95,143,0.1)' : 'transparent',
    color: active ? '#2B5F8F' : '#475569',
  })

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Montserrat, sans-serif' }}>

      {/* Top bar */}
      <header style={{ background: '#2B5F8F', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: '#F4A300', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#2B5F8F' }}>K</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Broward County Public Schools</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>School ADA Portal</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{userEmail}</span>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto' }}>

        {/* Left zone nav */}
        <aside style={{ width: 220, flexShrink: 0, padding: '32px 16px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', padding: '0 12px', marginBottom: 8 }}>
            ADA Management
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button style={navBtnStyle(tab === 'scanner')} onClick={() => setTab('scanner')}>
              <span style={{ display: 'flex', color: tab === 'scanner' ? '#2B5F8F' : '#94A3B8' }}>{NAV_ICON}</span>
              ADA Scanner
            </button>
            <button style={navBtnStyle(tab === 'glossary')} onClick={() => setTab('glossary')}>
              <span style={{ display: 'flex', color: tab === 'glossary' ? '#2B5F8F' : '#94A3B8' }}>{GLOSSARY_ICON}</span>
              ADA Glossary
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, padding: '32px 24px 32px 0' }}>

          {tab === 'scanner' && (
            <>
              {/* School header */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADA Website Accessibility Scan</div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>{school?.name}</h1>
                {school?.site_url && (
                  <a href={school.site_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#2B5F8F', textDecoration: 'none', fontWeight: 600, wordBreak: 'break-all' }}>
                    {school.site_url}
                  </a>
                )}
              </div>

              {/* Scan trigger */}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: '#4b5563', margin: '0 0 14px' }}>
                  Run a real accessibility check on your school&apos;s website - Lighthouse, a real axe-core scan, and WAVE
                  (WebAIM), the same combination used by the district. No guessing, no placeholder data.
                </p>
                <button
                  onClick={runScan}
                  disabled={scanning || !school?.site_url}
                  style={{
                    padding: '12px 24px',
                    background: scanning || !school?.site_url ? '#E2E8F0' : '#2B5F8F',
                    color: scanning || !school?.site_url ? '#94A3B8' : '#fff',
                    border: 'none', borderRadius: 10, cursor: scanning ? 'default' : 'pointer',
                    fontWeight: 800, fontSize: 14, fontFamily: 'Montserrat, sans-serif',
                  }}
                >
                  {scanning ? 'Scanning…' : 'Run ADA Scan'}
                </button>
                {scanError && <div style={{ marginTop: 10, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{scanError}</div>}
              </div>

              {/* Latest result */}
              {result && (
                <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Latest Result</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(result.ada_score), lineHeight: 1 }}>{result.ada_score ?? '—'}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>ADA Score</div>
                      </div>
                      {result.wave_score != null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(result.wave_score), lineHeight: 1 }}>{result.wave_score}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>WAVE Score</div>
                        </div>
                      )}
                      {result.lighthouse_a11y_score != null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: scoreColor(result.lighthouse_a11y_score), lineHeight: 1 }}>{result.lighthouse_a11y_score}</div>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Lighthouse</div>
                        </div>
                      )}
                      {(() => {
                        const s = STATUS_CONFIG[result.status] ?? STATUS_CONFIG.unknown
                        return <span style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: s.color, background: s.bg }}>{s.label}</span>
                      })()}
                    </div>
                  </div>

                  {(() => {
                    // WCMs only ever see the things they themselves can fix -
                    // per Sean, direct instruction, 2026-09-02: FinalSite
                    // issues and "depends" items are a district-team concern
                    // (see ADA Manager / AdaScannerPage), not something a
                    // school WCM needs to see or act on here.
                    type Fixable = { key: string; title: string; definition: string; fixSteps?: string[]; sourceUrl?: string; affectedElements?: number | null; countSuffix?: string; rank: number }
                    const fixable: Fixable[] = []
                    result.ada_violations.forEach((v, i) => {
                      const entry = lookupAxeEntry(v.id)
                      if (resolveOwner(entry, overrides) !== 'wcm') return
                      fixable.push({
                        key: `axe-${v.id}-${i}`,
                        title: entry?.title ?? v.help,
                        definition: entry?.definition ?? v.description,
                        fixSteps: entry?.fixSteps,
                        sourceUrl: entry?.sourceUrl,
                        affectedElements: v.affected_elements,
                        rank: impactRank(v.impact),
                      })
                    })
                    ;(result.wave_violations ?? []).forEach((v, i) => {
                      const entry = lookupWaveEntry(v.id, v.description)
                      if (resolveOwner(entry, overrides) !== 'wcm') return
                      fixable.push({
                        key: `wave-${v.id}-${i}`,
                        title: entry?.title ?? v.description,
                        definition: `${v.category[0].toUpperCase()}${v.category.slice(1)} finding`,
                        fixSteps: entry?.fixSteps,
                        sourceUrl: entry?.sourceUrl,
                        countSuffix: ` (${v.count}x)`,
                        rank: 4,
                      })
                    })
                    fixable.sort((a, b) => a.rank - b.rank)

                    if (fixable.length === 0) {
                      return <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>Nothing on your plate here. 🎉</div>
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {fixable.map(f => <FixableFindingCard key={f.key} f={f} />)}
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* History */}
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 12 }}>Your Scan History</div>
                {history.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#9ca3af' }}>No scans yet. Run your first one above.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {history.map(h => (
                      <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f3f4f6', gap: 10 }}>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{new Date(h.audited_at).toLocaleString()}</div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: scoreColor(h.ada_score) }}>{h.ada_score ?? '—'}</span>
                          {h.wave_score != null && <span style={{ fontSize: 13, color: '#9ca3af' }}>WAVE {h.wave_score}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {tab === 'glossary' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ADA Management</div>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>ADA Glossary</h1>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0, maxWidth: 640 }}>
                  Look up what a scan finding means and how to fix it, even when you&apos;re not looking at a scan
                  result. Same glossary the district web team uses.
                </p>
              </div>
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 24 }}>
                <AdaGlossaryPanel />
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  )
}
