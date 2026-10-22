'use client'

// Schools (Sean, 2026-10-22): the District Web Team's schools laid out the
// way Departments is, as tiles. Application Services works on schools, so
// this is their Schools tab; it takes over what My Schools and the school
// side of ADA Manager showed. It opens on the signed-in lead's own schools;
// a chip per District Web Team Lead (or All) shows anyone else's, A to Z.
// Each tile names the school's WCM with its District Web Team Lead under
// it, and the latest full-site ADA score where one exists. The ADA detail
// and the full-site scan stay in ADA Manager (?page=ada-manager&school=),
// where the scan is limited to named people for now.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { downloadSchoolsCsv, csvDateStamp } from '@/lib/school-list-csv'
import { SchoolAuditPages, type SchoolScore } from './ADAManagerPage'

interface Row {
  loc_no: string
  display_name: string
  school_level: string | null
  region: string | null
  lead_email: string | null
  no_wcm: boolean
}
interface Provisioned { id: string; school_location_nbr: string | null; site_url: string | null; wcm_name: string | null; wcm_email: string | null }
type Score = SchoolScore

const key = (n: string | null | undefined) => (n || '').replace(/^0+/, '')

function scoreColor(n?: number | null) {
  if (n == null) return '#9ca3af'
  if (n >= 80) return '#16a34a'
  if (n >= 65) return '#c97a1b'
  return '#dc2626'
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  const r = 20, circ = 2 * Math.PI * r
  const pct = score != null ? Math.max(0, Math.min(100, score)) / 100 : 0
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 26 26)" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color }}>{score != null ? score : '–'}</span>
      </div>
    </div>
  )
}

export default function SchoolsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [leads, setLeads] = useState<{ email: string; full_name: string }[]>([])
  const [provisioned, setProvisioned] = useState<Provisioned[]>([])
  const [scores, setScores] = useState<Score[]>([])
  const [me, setMe] = useState('')
  const [lead, setLead] = useState('')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  // Run Audit on a school is the full-site scan, named people only for now
  // (Sean, 2026-10-22: Vanessa); /api/bcps/school-sitemap enforces it too.
  const [canScan, setCanScan] = useState(false)
  const [scanning, setScanning] = useState<{ loc: string; current: number; total: number } | null>(null)
  const [openAudit, setOpenAudit] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const authHeader = async (): Promise<Record<string, string>> => {
    const t = (await createClient().auth.getSession()).data.session?.access_token
    return t ? { Authorization: `Bearer ${t}` } : {}
  }
  const reloadScores = async () => {
    const r = await fetch('/api/bcps/school-scores', { headers: await authHeader(), cache: 'no-store' })
    const j = r.ok ? await r.json().catch(() => ({})) : {}
    setScores((j as { scores?: Score[] }).scores ?? [])
  }
  useEffect(() => {
    (async () => {
      const r = await fetch('/api/bcps/school-sitemap?check=1', { headers: await authHeader(), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      setCanScan(!!j.allowed)
    })().catch(() => {})
  }, [])
  // Same steps as ADA Manager's Scan Full Site: discover the pages, then scan
  // each one into one batch so the school gets one averaged score.
  const runAudit = async (loc: string, schoolId: string) => {
    setNotice('')
    const headers = await authHeader()
    const sm = await fetch(`/api/bcps/school-sitemap?school_id=${encodeURIComponent(schoolId)}`, { headers })
    const smj = await sm.json().catch(() => ({}))
    if (!sm.ok) { setNotice(smj.error || "Could not find this school's pages."); return }
    const urls: string[] = smj.urls ?? []
    if (!urls.length) { setNotice('No pages were found to scan.'); return }
    const batch = crypto.randomUUID()
    for (let i = 0; i < urls.length; i++) {
      setScanning({ loc, current: i + 1, total: urls.length })
      try {
        await fetch('/api/bcps/ada-scan', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ url: urls[i], school_id: schoolId, scan_batch_id: batch }),
        })
      } catch { /* one page failing does not stop the batch */ }
    }
    setScanning(null)
    await reloadScores()
    setOpenAudit(loc)
  }

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user.email?.toLowerCase() || ''
      const [a, l, p, sc] = await Promise.all([
        supabase.from('bcps_school_assignments').select('loc_no, display_name, school_level, region, lead_email, no_wcm').order('display_name'),
        supabase.from('bcps_support_leads').select('email, full_name').order('full_name'),
        // bcps_schools is server-only; /api/bcps/schools serves it to any signed-in account.
        fetch('/api/bcps/schools', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
          .then((r) => (r.ok ? r.json() : { schools: [] })).catch(() => ({ schools: [] })),
        fetch('/api/bcps/school-scores', { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} })
          .then((r) => (r.ok ? r.json() : { scores: [] })).catch(() => ({ scores: [] })),
      ])
      if (a.error) { setError('Could not load the schools.'); setRows([]); return }
      const leadList = (l.data ?? []) as { email: string; full_name: string }[]
      setLeads(leadList)
      setProvisioned(((p as { schools?: Provisioned[] }).schools ?? []))
      setScores(((sc as { scores?: Score[] }).scores ?? []))
      setMe(email)
      setLead(leadList.some((x) => x.email.toLowerCase() === email) ? email : 'all')
      setRows((a.data ?? []) as Row[])
    })().catch(() => { setError('Could not load the schools.'); setRows([]) })
  }, [])

  const byLoc = useMemo(() => new Map(provisioned.map((p) => [key(p.school_location_nbr), p])), [provisioned])
  const scoreBy = useMemo(() => new Map(scores.map((s) => [s.school_id, s])), [scores])
  const leadName = useMemo(() => new Map(leads.map((x) => [x.email.toLowerCase(), x.full_name])), [leads])
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const r of rows ?? []) if (r.lead_email) c[r.lead_email.toLowerCase()] = (c[r.lead_email.toLowerCase()] || 0) + 1
    return c
  }, [rows])

  if (rows === null) return <div style={{ padding: 32 }}>Loading schools...</div>

  const q = query.trim().toLowerCase()
  const list = rows
    .filter((r) => lead === 'all' || (r.lead_email || '').toLowerCase() === lead)
    .map((r) => {
      const p = byLoc.get(key(r.loc_no))
      return { ...r, p, score: p ? scoreBy.get(p.id) : undefined, leadName: leadName.get((r.lead_email || '').toLowerCase()) || '' }
    })
    .filter((r) => !q || [r.display_name, r.loc_no, r.region, r.school_level, r.p?.wcm_name, r.leadName].some((v) => (v || '').toLowerCase().includes(q)))
  const scored = list.filter((r) => r.score?.avg_ada_score != null)
  const avg = scored.length ? Math.round(scored.reduce((n, r) => n + (r.score!.avg_ada_score as number), 0) / scored.length) : null
  const label = lead === 'all' ? 'All schools' : lead === me ? 'My schools' : `${leadName.get(lead) || lead}'s schools`
  const exportCsv = () => downloadSchoolsCsv(
    list.map((r) => ({ loc_no: r.loc_no, display_name: r.display_name, school_level: r.school_level, region: r.region, no_wcm: r.no_wcm, lead_name: r.leadName, wcm_name: r.p?.wcm_name ?? null, wcm_email: r.p?.wcm_email ?? null })),
    `schools-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${csvDateStamp()}.csv`,
  )

  return (
    <>
      <style>{CSS}</style>
      <div className="sv-root">
        <div className="sv-stats">
          <div className="sv-tile"><div className="sv-tile-label">{label}</div><div className="sv-tile-val">{list.length}</div></div>
          <div className="sv-tile"><div className="sv-tile-label">Full-site scanned</div><div className="sv-tile-val">{scored.length}</div></div>
          <div className="sv-tile"><div className="sv-tile-label">Avg ADA score</div><div className="sv-tile-val" style={{ color: scoreColor(avg) }}>{avg ?? '–'}</div></div>
          <div className="sv-tile"><div className="sv-tile-label">No WCM on file</div><div className="sv-tile-val">{list.filter((r) => r.no_wcm).length}</div></div>
        </div>

        <div className="sv-chips" role="group" aria-label="District Web Team Lead">
          {me && counts[me] !== undefined && (
            <button type="button" className={`sv-chip${lead === me ? ' on' : ''}`} aria-pressed={lead === me} onClick={() => setLead(me)}>My schools ({counts[me]})</button>
          )}
          {leads.filter((x) => x.email.toLowerCase() !== me).map((x) => (
            <button key={x.email} type="button" className={`sv-chip${lead === x.email.toLowerCase() ? ' on' : ''}`} aria-pressed={lead === x.email.toLowerCase()} onClick={() => setLead(x.email.toLowerCase())}>
              {x.full_name.split(/\s+/)[0]} ({counts[x.email.toLowerCase()] || 0})
            </button>
          ))}
          <button type="button" className={`sv-chip${lead === 'all' ? ' on' : ''}`} aria-pressed={lead === 'all'} onClick={() => setLead('all')}>All ({rows.length})</button>
        </div>

        <div className="sv-filters">
          <input type="search" className="sv-search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by school, location number, region, WCM or District Web Team Lead" aria-label="Search schools" />
          <button type="button" className="sv-btn" onClick={exportCsv} disabled={!list.length}>Export to CSV</button>
          <span className="sv-count">{list.length} of {rows.length} schools</span>
        </div>

        {error && <div className="sv-empty">{error}</div>}
        {notice && <div className="sv-notice" role="status">{notice}</div>}
        {!list.length ? <div className="sv-empty">{q ? `No school matches "${query}".` : 'No schools here yet.'}</div> : (
          <div className="sv-grid">
            {list.map((r) => (
              <article key={r.loc_no} className={`sv-card${openAudit === r.loc_no ? ' wide' : ''}`}>
                <div className="sv-card-header">
                  <div>
                    <div className="sv-name">{r.display_name}</div>
                    <div className="sv-meta">{r.loc_no}{r.school_level ? ` · ${r.school_level}` : ''}{r.region ? ` · ${r.region}` : ''}</div>
                  </div>
                  <div className="sv-ring-col"><ScoreRing score={r.score?.avg_ada_score} /><span className="sv-ring-label">ADA</span></div>
                </div>
                <div className="sv-people">
                  <div><span className="sv-label">WCM</span>{r.no_wcm ? <span className="sv-chip-late">No WCM</span>
                    : r.p?.wcm_name ? (r.p.wcm_email ? <a href={`mailto:${r.p.wcm_email}`}>{r.p.wcm_name}</a> : r.p.wcm_name)
                    : <span className="sv-muted">In BCPS Central</span>}</div>
                  <div><span className="sv-label">District Web Team</span>{r.leadName || <span className="sv-muted">Not assigned</span>}</div>
                </div>
                <div className="sv-links">
                  <a className="sv-link green" href={`/?page=school-profiles&loc=${encodeURIComponent(r.loc_no)}`}>Visit profile</a>
                  {r.p?.site_url && <a className="sv-link" href={r.p.site_url} target="_blank" rel="noopener noreferrer">Visit website</a>}
                  <span className={`sv-status${r.score ? ' done' : ''}`}>{r.score ? 'Audited' : r.p ? 'Not audited' : 'Not set up'}</span>
                </div>
                <div className="sv-audit">
                  <div className="sv-audit-nums">
                    <span><b>{r.score ? r.score.critical_count + r.score.serious_count : '–'}</b> serious issues</span>
                    <span><b>{r.score ? r.score.page_count : '–'}</b> pages</span>
                    <span>Last audit <b>{r.score ? new Date(r.score.last_audited_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '–'}</b></span>
                  </div>
                  <div className="sv-audit-actions">
                    {r.score && <button type="button" className="sv-action ghost" onClick={() => setOpenAudit(openAudit === r.loc_no ? null : r.loc_no)}>{openAudit === r.loc_no ? 'Hide audit results' : 'View audit results'}</button>}
                    {canScan && r.p?.site_url && (
                      <button type="button" className="sv-action" disabled={!!scanning} onClick={() => runAudit(r.loc_no, r.p!.id)}>
                        {scanning?.loc === r.loc_no ? `Auditing ${scanning.current}/${scanning.total}…` : r.score ? 'Re-run audit' : 'Run audit'}
                      </button>
                    )}
                    {canScan && !r.p?.site_url && <a className="sv-link" href="/?page=ada-manager">{r.p ? 'Add its website in ADA Manager' : 'Set up in ADA Manager'}</a>}
                  </div>
                  {scanning?.loc === r.loc_no && (
                    <div className="sv-progress"><div style={{ width: `${(scanning.current / scanning.total) * 100}%` }} /></div>
                  )}
                  {openAudit === r.loc_no && r.score && r.p && (
                    <div className="sv-results"><SchoolAuditPages schoolId={r.p.id} score={r.score} onChanged={reloadScores} /></div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

const CSS = `
.sv-root{--sv-blue:#1672A7;--sv-text:#262626;--sv-text-s:#525252;--sv-text-m:#767676;--sv-card:#fff;--sv-border:#dde3ea;font-family:'Open Sans',sans-serif}
.sv-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}
.sv-tile{background:var(--sv-card);border-radius:10px;padding:16px;border:1.5px solid var(--sv-border)}
.sv-tile-label{font-size:10px;font-weight:700;color:var(--sv-text-m);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.sv-tile-val{font-size:24px;font-weight:800;color:var(--sv-text)}
.sv-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.sv-chip{font:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;border:1px solid rgba(22,114,167,.3);background:#fff;color:#0e4e73;cursor:pointer}
.sv-chip.on{background:var(--sv-blue);border-color:var(--sv-blue);color:#fff}
.sv-filters{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
.sv-search{flex:1;min-width:220px;border:1.5px solid var(--sv-border);border-radius:8px;padding:9px 14px;font-size:13px;font-family:inherit;background:#fff;color:var(--sv-text)}
.sv-btn{font:inherit;font-size:12px;font-weight:800;padding:9px 14px;border-radius:8px;border:1px solid var(--sv-blue);background:var(--sv-blue);color:#fff;cursor:pointer}
.sv-btn:disabled{opacity:.5;cursor:default}
.sv-count{font-size:12px;color:var(--sv-text-m);font-weight:600;margin-left:auto;white-space:nowrap}
.sv-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.sv-card{background:var(--sv-card);border:1px solid var(--sv-border);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:10px;transition:box-shadow .15s,border-color .15s}
.sv-card.wide{grid-column:1/-1}
.sv-card:hover{box-shadow:0 4px 20px rgba(22,114,167,.13);border-color:var(--sv-blue)}
.sv-card-header{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}
.sv-name{font-size:13.5px;font-weight:800;color:var(--sv-text);line-height:1.3}
.sv-meta{font-size:10.5px;font-weight:700;color:var(--sv-blue);text-transform:uppercase;letter-spacing:.6px;margin-top:3px}
.sv-people{display:grid;gap:4px;font-size:12.5px;color:var(--sv-text-s)}
.sv-people a{color:var(--sv-blue);font-weight:700}
.sv-label{display:inline-block;min-width:118px;font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--sv-text-m)}
.sv-muted{color:var(--sv-text-m)}
.sv-chip-late{font-size:9.5px;font-weight:800;text-transform:uppercase;color:#c2410c;background:#fff7ed;padding:2px 7px;border-radius:99px}
.sv-links{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:auto;border-top:1px solid var(--sv-border);padding-top:10px}
.sv-link{font-size:10.5px;font-weight:700;color:var(--sv-blue);text-transform:uppercase;letter-spacing:.1em;text-decoration:none}
.sv-link.green{color:#1a7a3c}
.sv-link:hover{text-decoration:underline}
.sv-scan{font-size:10.5px;color:var(--sv-text-m);margin-left:auto}
.sv-empty{text-align:center;padding:48px 20px;color:var(--sv-text-m)}
.sv-notice{background:#fff7ed;border-left:4px solid #c2410c;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:14px}
.sv-ring-col{display:flex;flex-direction:column;align-items:center;gap:3px}
.sv-ring-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--sv-text-m)}
.sv-status{margin-left:auto;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:2px 7px;border-radius:999px;background:#f3f4f6;color:var(--sv-text-m)}
.sv-status.done{background:#dcfce7;color:#16a34a}
.sv-audit{border-top:1px solid var(--sv-border);padding-top:10px;display:grid;gap:8px}
.sv-audit-nums{display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--sv-text-m)}
.sv-audit-nums b{color:var(--sv-text);font-weight:800}
.sv-audit-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.sv-action{font:inherit;font-size:10.5px;font-weight:700;padding:5px 10px;border-radius:6px;border:1px solid var(--sv-blue);background:var(--sv-blue);color:#fff;cursor:pointer}
.sv-action.ghost{background:#fff;color:var(--sv-blue)}
.sv-action:disabled{opacity:.5;cursor:default}
.sv-progress{height:6px;background:#f3f4f6;border-radius:999px;overflow:hidden}
.sv-progress div{height:100%;background:var(--sv-blue);transition:width .3s}
.sv-results{border-top:1px solid #f3f4f6;padding-top:8px;max-height:420px;overflow:auto}
@media(max-width:900px){.sv-grid{grid-template-columns:repeat(2,1fr)}.sv-stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.sv-grid{grid-template-columns:1fr}.sv-label{min-width:0;margin-right:6px}}
`
