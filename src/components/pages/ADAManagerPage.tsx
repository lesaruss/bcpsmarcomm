'use client'

// components/pages/ADAManagerPage.tsx
//
// District-facing ADA oversight and management surface. Replaces the two
// separate pages this used to be split across (School ADA Accounts +
// Schools ADA): onboarding a school and tracking its accessibility score
// are one job, not two pages, so they're one page now.
//
// Built 2026-09-02 per Sean, direct instruction: schools are provisioned
// by the district team here, never self-service - a school WCM never
// creates their own school record, they just get handed a login once the
// team has set the school up. This page is where the team does that
// setup, and where they oversee every school's real accessibility score
// afterward - modeled on the Departments section's list-then-drill-in
// pattern (see DepartmentsPage.tsx), same as SchoolsAdaPage was before
// this merge.
//
// "Scan Full Site" discovers a school's pages via sitemap.xml (capped,
// see lib/sitemap-crawl.ts), then scans each one through the proven
// /api/bcps/ada-scan pipeline (axe-core + WAVE + Lighthouse, no LLM
// involved), tagging every page with a shared scan_batch_id so
// /api/bcps/school-scores can average them into one school-level score.
//
// 2026-09-02, same day: added real per-page issue detail under "View
// pages" - each finding is resolved against the same glossary the
// standalone ADA Scanner uses (lib/ada-glossary.ts), not just a raw
// score.
//
// 2026-09-02, same day, second pass: findings are now grouped into three
// tabs by who owns the fix - "You Can Fix", "FinalSite", "Depends" - per
// Sean, direct instruction. This is the district view, so all three tabs
// show (the school-portal WCM view only ever shows the "You Can Fix"
// bucket - see AdaScannerPage.tsx's WCM-mode rendering). A "Depends"
// finding can be reclassified here by an admin (lib/ada-owner-overrides.ts)
// - until it is, it counts as not the school's responsibility.

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { lookupAxeEntry, lookupWaveEntry, type GlossaryOwner } from '@/lib/ada-glossary'
import { resolveOwner, fetchOwnerOverrides, setOwnerOverride, type OwnerOverrideMap } from '@/lib/ada-owner-overrides'

interface School {
  id: string
  name: string
  site_url: string | null
  wcm_name: string | null
  wcm_email: string | null
  wcm_user_id: string | null
  notes: string | null
  created_at: string
}

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

interface SchoolPage {
  page_url: string
  ada_score: number | null
  ada_violations: Violation[]
  wave_violations: WaveViolation[]
  ada_violations_critical: number
  ada_violations_serious: number
  ada_violations_moderate: number
  ada_violations_minor: number
}

interface SchoolScore {
  school_id: string
  scan_batch_id: string
  page_count: number
  avg_ada_score: number | null
  critical_count: number
  serious_count: number
  last_audited_at: string
  pages: SchoolPage[]
}

const BLUE = '#1672A7'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  serious:  '#EA580C',
  moderate: '#D97706',
  minor:    '#6B7280',
}

const OWNER_TABS: { owner: GlossaryOwner; label: string }[] = [
  { owner: 'wcm', label: 'You Can Fix' },
  { owner: 'finalsite', label: 'FinalSite' },
  { owner: 'depends', label: 'Depends' },
]

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 } as React.CSSProperties,
  input: { padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 4 } as React.CSSProperties,
  btnPrimary: { padding: '9px 16px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' } as React.CSSProperties,
  btnSecondary: { padding: '9px 16px', border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
}

function scoreColor(n?: number | null) {
  if (n == null) return '#9ca3af'
  if (n >= 80) return '#16a34a'
  if (n >= 65) return '#c97a1b'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  const r = 20, circ = 2 * Math.PI * r
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  const offset = circ * (1 - pct)
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 26 26)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color }}>{score != null ? score : '–'}</span>
      </div>
    </div>
  )
}

// One finding, resolved against the glossary + any admin override. Shared
// by the axe and WAVE branches below (they carry slightly different raw
// shapes, so the caller passes in the already-looked-up entry + owner).
function FindingCard({
  title, definition, helpUrl, ownerLabel, owner, entryFound, affectedElements, countSuffix,
  onReclassify,
}: {
  title: string
  definition: string
  helpUrl?: string
  ownerLabel: React.ReactNode
  owner: GlossaryOwner
  entryFound: boolean
  affectedElements?: number | null
  countSuffix?: string
  onReclassify?: (owner: GlossaryOwner) => void
}) {
  return (
    <div style={{ borderLeft: `3px solid ${owner === 'wcm' ? '#16750C' : owner === 'finalsite' ? '#C55326' : '#D4B106'}`, paddingLeft: 10, paddingTop: 1, paddingBottom: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#111827' }}>{title}{countSuffix}</div>
        {ownerLabel}
      </div>
      <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>{definition}</div>
      {affectedElements != null && (
        <div style={{ fontSize: 10.5, color: '#9ca3af', marginTop: 2 }}>{affectedElements} element(s) affected</div>
      )}
      {!entryFound && helpUrl && (
        <div style={{ marginTop: 4, fontSize: 10.5, color: '#9ca3af' }}>
          <a href={helpUrl} target="_blank" rel="noreferrer" style={{ color: BLUE }}>axe-core reference for this rule</a> (glossary entry pending)
        </div>
      )}
      {onReclassify && (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={() => onReclassify('wcm')}
            style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #16750C', background: '#fff', color: '#16750C', cursor: 'pointer' }}
          >
            Mark: WCM can fix
          </button>
          <button
            onClick={() => onReclassify('finalsite')}
            style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, border: '1px solid #C55326', background: '#fff', color: '#C55326', cursor: 'pointer' }}
          >
            Mark: FinalSite
          </button>
        </div>
      )}
    </div>
  )
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

function bucketPage(page: SchoolPage, overrides: OwnerOverrideMap): Record<GlossaryOwner, Bucketed[]> {
  const buckets: Record<GlossaryOwner, Bucketed[]> = { wcm: [], finalsite: [], depends: [] }

  page.ada_violations.forEach((v, i) => {
    const entry = lookupAxeEntry(v.id)
    const owner = resolveOwner(entry, overrides)
    buckets[owner].push({
      key: `axe-${v.id}-${i}`,
      owner,
      entryFound: !!entry,
      title: entry?.title ?? v.help,
      definition: entry?.definition ?? v.description,
      helpUrl: v.helpUrl,
      affectedElements: v.affected_elements,
      glossaryKey: entry?.key,
    })
  })

  ;(page.wave_violations ?? []).forEach((v, i) => {
    const entry = lookupWaveEntry(v.id, v.description)
    const owner = resolveOwner(entry, overrides)
    buckets[owner].push({
      key: `wave-${v.id}-${i}`,
      owner,
      entryFound: !!entry,
      title: entry?.title ?? v.description,
      definition: `${v.category[0].toUpperCase()}${v.category.slice(1)} finding`,
      countSuffix: ` (${v.count}x)`,
      glossaryKey: entry?.key,
    })
  })

  return buckets
}

function PageIssueDetail({ page, overrides, onReclassify }: {
  page: SchoolPage
  overrides: OwnerOverrideMap
  onReclassify: (glossaryKey: string, owner: GlossaryOwner) => void
}) {
  const [tab, setTab] = useState<GlossaryOwner>('wcm')
  const buckets = bucketPage(page, overrides)
  const active = buckets[tab]

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e5e7eb' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {OWNER_TABS.map(t => (
          <button
            key={t.owner}
            onClick={() => setTab(t.owner)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
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
        <div style={{ fontSize: 12.5, color: '#059669', fontWeight: 600 }}>
          {tab === 'wcm' ? 'No fixable-by-WCM findings in this bucket. 🎉' : `No ${tab === 'finalsite' ? 'FinalSite' : 'depends'} findings on this page.`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {active.map(f => (
            <FindingCard
              key={f.key}
              title={f.title}
              definition={f.definition}
              helpUrl={f.helpUrl}
              affectedElements={f.affectedElements}
              countSuffix={f.countSuffix}
              owner={f.owner}
              entryFound={f.entryFound}
              ownerLabel={<OwnerBadge owner={f.owner} entryFound={f.entryFound} />}
              onReclassify={tab === 'depends' && f.glossaryKey ? (o) => onReclassify(f.glossaryKey!, o) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type ScanProgress = { schoolId: string; current: number; total: number; url: string } | null

export default function ADAManagerPage() {
  const supabase = createClient()
  const [schools, setSchools] = useState<School[]>([])
  const [scores, setScores] = useState<Record<string, SchoolScore>>({})
  const [overrides, setOverrides] = useState<OwnerOverrideMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<ScanProgress>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedPage, setExpandedPage] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', site_url: '', wcm_name: '', wcm_email: '', temp_password: '', notes: '' })

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const t = await token()
      const [schoolsRes, scoresRes, overridesMap] = await Promise.all([
        fetch('/api/bcps/schools', { headers: { Authorization: `Bearer ${t}` } }),
        fetch('/api/bcps/school-scores', { headers: { Authorization: `Bearer ${t}` } }),
        fetchOwnerOverrides(t),
      ])
      const schoolsJson = await schoolsRes.json()
      const scoresJson = await scoresRes.json()
      if (!schoolsRes.ok) throw new Error(schoolsJson.error || 'Failed to load schools.')
      setSchools(schoolsJson.schools ?? [])
      setOverrides(overridesMap)
      if (scoresRes.ok) {
        const map: Record<string, SchoolScore> = {}
        for (const s of (scoresJson.scores ?? []) as SchoolScore[]) map[s.school_id] = s
        setScores(map)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { loadAll() }, [loadAll])

  const reclassify = useCallback(async (glossaryKey: string, owner: GlossaryOwner) => {
    try {
      const t = await token()
      const map = await setOwnerOverride(t, glossaryKey, owner)
      setOverrides(map)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reclassification.')
    }
  }, [token])

  const addSchool = async () => {
    if (!form.name.trim()) { setError('School name is required.'); return }
    setSaving(true)
    setError('')
    try {
      const t = await token()
      const r = await fetch('/api/bcps/schools', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!r.ok) { setError(j.error || 'Could not add school.'); return }
      setForm({ name: '', site_url: '', wcm_name: '', wcm_email: '', temp_password: '', notes: '' })
      setShowForm(false)
      loadAll()
    } finally {
      setSaving(false)
    }
  }

  const scanFullSite = async (school: School) => {
    if (!school.site_url) { setError(`${school.name} has no website URL on file. Add one below first.`); return }
    setError('')
    const t = await token()

    const sitemapRes = await fetch(`/api/bcps/school-sitemap?school_id=${school.id}`, { headers: { Authorization: `Bearer ${t}` } })
    const sitemapJson = await sitemapRes.json()
    if (!sitemapRes.ok) { setError(sitemapJson.error || "Could not discover this school's pages."); return }

    const urls: string[] = sitemapJson.urls ?? []
    if (urls.length === 0) { setError('No pages found to scan.'); return }

    const batchId = crypto.randomUUID()
    for (let i = 0; i < urls.length; i++) {
      setProgress({ schoolId: school.id, current: i + 1, total: urls.length, url: urls[i] })
      try {
        await fetch('/api/bcps/ada-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ url: urls[i], school_id: school.id, scan_batch_id: batchId }),
        })
      } catch {
        // one page failing shouldn't stop the batch; the page just won't
        // contribute a score
      }
    }
    setProgress(null)
    loadAll()
  }

  return (
    <div>
      <div style={C.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={C.sublabel}>ADA Manager</div>
            <p style={{ fontSize: 13, color: '#4b5563', margin: 0, maxWidth: 640 }}>
              Onboard a school and oversee its real accessibility score in one place. Schools are set up here by
              the district team, a school&apos;s WCM never creates their own record. Once a school exists here,
              they&apos;re handed a login that opens their own scan portal, scoped to just their site.
            </p>
          </div>
          <button style={{ ...C.btnPrimary, whiteSpace: 'nowrap' }} onClick={() => setShowForm(v => !v)}>
            {showForm ? 'Cancel' : '+ Add School'}
          </button>
        </div>

        {showForm && (
          <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>School Name *</span>
                <input style={C.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Silver Ridge Elementary" />
              </label>
              <label>
                <span style={C.label}>Website URL</span>
                <input style={C.input} value={form.site_url} onChange={e => setForm(f => ({ ...f, site_url: e.target.value }))} placeholder="https://silverridge.browardschools.com/" />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>WCM Name</span>
                <input style={C.input} value={form.wcm_name} onChange={e => setForm(f => ({ ...f, wcm_name: e.target.value }))} placeholder="Jane Doe" />
              </label>
              <label>
                <span style={C.label}>WCM Email</span>
                <input style={C.input} value={form.wcm_email} onChange={e => setForm(f => ({ ...f, wcm_email: e.target.value }))} placeholder="jane.doe@browardschools.com" />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <span style={C.label}>Temporary Password</span>
                <input style={C.input} value={form.temp_password} onChange={e => setForm(f => ({ ...f, temp_password: e.target.value }))} placeholder="Leave blank to add school without creating a login yet" />
              </label>
              <label>
                <span style={C.label}>Notes</span>
                <input style={C.input} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
              </label>
            </div>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: 0 }}>
              If a WCM email + temporary password are both filled in, a real login is created immediately (the WCM
              sets their own password on first sign-in). Leave the password blank to add the school now and create
              the login later.
            </p>
            <div>
              <button style={{ ...C.btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={addSchool} disabled={saving}>
                {saving ? 'Saving…' : 'Save School'}
              </button>
            </div>
          </div>
        )}

        {error && <div style={{ marginTop: 14, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{error}</div>}
      </div>

      {loading ? (
        <div style={C.card}><div style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</div></div>
      ) : schools.length === 0 ? (
        <div style={C.card}>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>No schools onboarded yet. Use &ldquo;+ Add School&rdquo; above to set up the first one.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {schools.map(school => {
            const score = scores[school.id]
            const isScanning = progress?.schoolId === school.id
            const isExpanded = expanded === school.id
            return (
              <div key={school.id} style={C.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <ScoreRing score={score?.avg_ada_score} />
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>{school.name}</div>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
                        background: school.wcm_user_id ? '#e6f6ea' : '#fff4e0',
                        color: school.wcm_user_id ? '#1a7f37' : '#9a6700',
                      }}>
                        {school.wcm_user_id ? 'Login active' : 'No login yet'}
                      </span>
                    </div>
                    {school.site_url && (
                      <div style={{ fontSize: 11.5, color: '#9ca3af', wordBreak: 'break-all' }}>{school.site_url}</div>
                    )}
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {school.wcm_name || 'No WCM name on file'} {school.wcm_email ? `· ${school.wcm_email}` : ''}
                    </div>
                    {score ? (
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        {score.page_count} page{score.page_count === 1 ? '' : 's'} scanned · last full scan {new Date(score.last_audited_at).toLocaleDateString()}
                        {score.critical_count > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}> · {score.critical_count} critical across site</span>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>No full-site scan yet.</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {score && (
                      <button style={C.btnSecondary} onClick={() => { setExpanded(isExpanded ? null : school.id); setExpandedPage(null) }}>
                        {isExpanded ? 'Hide pages' : 'View pages'}
                      </button>
                    )}
                    <button style={{ ...C.btnPrimary, opacity: isScanning ? 0.6 : 1 }} onClick={() => scanFullSite(school)} disabled={isScanning || !!progress}>
                      {isScanning ? `Scanning ${progress!.current}/${progress!.total}…` : 'Scan Full Site'}
                    </button>
                  </div>
                </div>

                {isScanning && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
                    <div style={{ height: 6, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(progress!.current / progress!.total) * 100}%`, background: BLUE, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, wordBreak: 'break-all' }}>{progress!.url}</div>
                  </div>
                )}

                {isExpanded && score && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {score.pages.map(p => {
                      // Every page is listed, even ones with zero findings -
                      // Sean, direct instruction: show all pages, a clean
                      // page just shows zero.
                      const totalIssues = p.ada_violations_critical + p.ada_violations_serious + p.ada_violations_moderate + p.ada_violations_minor + (p.wave_violations?.length ?? 0)
                      const isPageOpen = expandedPage === p.page_url
                      return (
                        <div key={p.page_url} style={{ padding: '4px 0' }}>
                          <div
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: 12, cursor: 'pointer' }}
                            onClick={() => setExpandedPage(isPageOpen ? null : p.page_url)}
                          >
                            <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: '#9ca3af', transform: isPageOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▸</span>
                              {p.page_url}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, color: totalIssues > 0 ? '#6b7280' : '#16a34a' }}>
                                {totalIssues} issue{totalIssues === 1 ? '' : 's'}
                              </span>
                              <span style={{ fontWeight: 800, color: scoreColor(p.ada_score) }}>{p.ada_score ?? '—'}</span>
                            </span>
                          </div>
                          {isPageOpen && <PageIssueDetail page={p} overrides={overrides} onReclassify={reclassify} />}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
