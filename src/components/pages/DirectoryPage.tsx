'use client'

// Editor for the Department & Program Directory widget (public embed at
// /embeds/department-program-directory.html). Two tabs:
//   - Search insights: what people search for, which searches found nothing,
//     and which pages they open (bcps_directory_events via the
//     bcps_directory_insights function). A search that found nothing can be
//     added as a tag to the page it should have found, in one click; that is
//     the loop that keeps the tags matching how people actually search.
//   - Pages: every department and program entry. Same inline-edit pattern as
//     the II&DL and Charter School editors: a Save button that only enables
//     once something changed, delete with confirm, and an add form. Rows stay
//     collapsed until opened, since there are 150 of them.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Entry {
  id: string
  kind: 'department' | 'program'
  name: string
  url: string
  context: string | null
  description: string | null
  topic: string
  audiences: string
  tags: string[]
  includes: string[]
  demand_rank: number | null
  popular_label: string | null
  popular_rank: number | null
  active: boolean
  review_note: string | null
  sort_order: number
}

interface Insights {
  days: number
  sessions: number
  searches: number
  zero_result_searches: number
  clicks: number
  search_sessions: number
  search_sessions_with_click: number
  top_searches: { query: string; searches: number; avg_results: number; clicks: number }[]
  zero_result: { query: string; searches: number; last_seen: string }[]
  top_clicked: { id: string; name: string; kind: string; clicks: number; from_browsing: number }[]
}

const TOPICS: Record<string, string> = {
  enroll: 'Enrollment & School Choice',
  hr: 'Employees & Careers',
  ops: 'Buses, Meals & Facilities',
  support: 'Student Support & Health',
  acad: 'Academics & Learning',
  family: 'Families & Community',
  safety: 'Safety & Emergencies',
  activities: 'Arts, Athletics & Activities',
  money: 'Finance & Business',
  tech: 'Technology',
  gov: 'News, Board & Governance',
}
const AUDIENCES: [string, string][] = [['F', 'Families'], ['S', 'Students'], ['E', 'Employees'], ['C', 'Community & business']]

const BLUE = '#1672A7'
const TEAL = '#00838F'
const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%', minWidth: 0 } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff', minWidth: 0 } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 8 } as React.CSSProperties,
  row: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 8, marginBottom: 8 } as React.CSSProperties,
  flag: { background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 7, padding: '8px 10px', fontSize: 12, marginBottom: 8 } as React.CSSProperties,
  th: { textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', borderBottom: '1px solid #e5e7eb' } as React.CSSProperties,
  td: { fontSize: 13, padding: '8px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' } as React.CSSProperties,
  num: { fontVariantNumeric: 'tabular-nums', textAlign: 'right' } as React.CSSProperties,
}
const EMPTY_NEW = { kind: 'program', name: '', url: 'https://www.browardschools.com/', topic: 'acad', description: '', tags: '' }

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-')
const badge = (kind: string) => (
  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 6px', borderRadius: 4,
    background: kind === 'department' ? '#EBF1F8' : '#E0F4F5', color: kind === 'department' ? '#0E4E73' : '#006A74' }}>
    {kind === 'department' ? 'Department' : 'Program'}
  </span>
)

export default function DirectoryPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'insights' | 'pages'>('insights')
  const [entries, setEntries] = useState<Entry[]>([])
  const [insights, setInsights] = useState<Insights | null>(null)
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, any>>({})
  const [tagTarget, setTagTarget] = useState<Record<string, string>>({})
  const [showNew, setShowNew] = useState(false)
  const [newEntry, setNewEntry] = useState(EMPTY_NEW)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const loadEntries = useCallback(async () => {
    const r = await fetch('/api/bcps/directory', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); return }
    setEntries(j.entries)
  }, [token])

  const loadInsights = useCallback(async (d: number) => {
    const r = await fetch(`/api/bcps/directory?view=insights&days=${d}`, { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load insights'); return }
    setInsights(j.insights)
  }, [token])

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([loadEntries(), loadInsights(days)]); setLoading(false) })()
  }, [loadEntries, loadInsights, days])

  const act = useCallback(async (payload: any) => {
    setBusy(true); setErr(''); setNote('')
    const r = await fetch('/api/bcps/directory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (payload.action === 'entry_update') setEdits(prev => { const next = { ...prev }; delete next[payload.id]; return next })
    await loadEntries(); return j
  }, [token, loadEntries])

  const setEdit = (id: string, field: string, value: any) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  const val = (e: Entry, field: keyof Entry) => {
    const v = edits[e.id]?.[field] ?? e[field]
    return Array.isArray(v) ? v.join(', ') : (v ?? '')
  }

  const byName = useMemo(() => [...entries].sort((a, b) => a.name.localeCompare(b.name)), [entries])
  const flaggedCount = entries.filter(e => e.review_note).length
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return byName.filter(e => {
      if (kindFilter && e.kind !== kindFilter) return false
      if (onlyFlagged && !e.review_note) return false
      if (!q) return true
      return e.name.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q)) || (e.context ?? '').toLowerCase().includes(q)
    })
  }, [byName, query, kindFilter, onlyFlagged])

  if (loading) return <div style={{ padding: 32 }}>Loading the Department &amp; Program Directory...</div>

  const tabBtn = (id: 'insights' | 'pages', label: string) => (
    <button style={tab === id ? C.btnPrimary : C.btn} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>
  )

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Department &amp; Program Directory</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px', maxWidth: '75ch' }}>
        One search across every department page and every program and service on browardschools.com. Changes here go live in the
        widget immediately, no code push needed. Tags are the words people search with; the insights tab shows which ones are missing.
      </p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {tabBtn('insights', 'Search insights')}
        {tabBtn('pages', `Pages (${entries.length})`)}
        <a href="/embeds/department-program-directory.html" target="_blank" rel="noopener noreferrer"
          style={{ ...C.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open the widget ↗</a>
      </div>

      {err && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}
      {note && <div role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{note}</div>}

      {tab === 'insights' && insights && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <label htmlFor="dir-days" style={{ fontSize: 12, color: '#374151', fontWeight: 700 }}>Period</label>
            <select id="dir-days" style={C.sel} value={days} onChange={e => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button style={C.btn} disabled={busy} onClick={() => loadInsights(days)}>Refresh</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Searches', value: insights.searches.toLocaleString(), sub: `${insights.sessions.toLocaleString()} visits to the widget` },
              { label: 'Found nothing', value: pct(insights.zero_result_searches, insights.searches),
                sub: `${insights.zero_result_searches.toLocaleString()} searches. Target: under 10%`,
                warn: insights.searches > 0 && insights.zero_result_searches / insights.searches > 0.1 },
              { label: 'Search led to a page', value: pct(insights.search_sessions_with_click, insights.search_sessions),
                sub: 'Visits where a search ended in a click. Target: 60%+',
                warn: insights.search_sessions > 0 && insights.search_sessions_with_click / insights.search_sessions < 0.6 },
              { label: 'Pages opened', value: insights.clicks.toLocaleString(), sub: 'From search and browsing' },
            ].map(s => (
              <div key={s.label} style={{ ...C.card, marginBottom: 0, borderTop: `3px solid ${s.warn ? '#d97706' : TEAL}` }}>
                <div style={C.sublabel}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {insights.searches === 0 && (
            <div style={{ ...C.card, color: '#374151', fontSize: 13 }}>
              No searches recorded in this period yet. Every search in the widget shows up here within a few seconds;
              try one in <a href="/embeds/department-program-directory.html" target="_blank" rel="noopener noreferrer" style={{ color: BLUE, fontWeight: 700 }}>the widget</a> and press Refresh.
            </div>
          )}

          <div style={C.card}>
            <div style={C.sublabel}>Searches that found nothing ({insights.zero_result.length})</div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 8px' }}>
              Each of these is a word people use that no page carries yet. Pick the page it should have found and add it as a tag.
            </p>
            {insights.zero_result.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6b7280' }}>None in this period.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr><th style={C.th}>Search</th><th style={{ ...C.th, ...C.num }}>Times</th><th style={C.th}>Add as a tag to</th></tr></thead>
                  <tbody>
                    {insights.zero_result.map(z => (
                      <tr key={z.query}>
                        <td style={{ ...C.td, fontWeight: 700 }}>{z.query}</td>
                        <td style={{ ...C.td, ...C.num }}>{z.searches}</td>
                        <td style={C.td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <select style={{ ...C.sel, maxWidth: 320 }} aria-label={`Page for "${z.query}"`}
                              value={tagTarget[z.query] ?? ''} onChange={e => setTagTarget(p => ({ ...p, [z.query]: e.target.value }))}>
                              <option value="">Choose a page...</option>
                              {byName.filter(e => e.active).map(e => (
                                <option key={e.id} value={e.id}>{e.name} ({e.kind === 'department' ? 'dept' : 'program'})</option>
                              ))}
                            </select>
                            <button style={C.btnPrimary} disabled={busy || !tagTarget[z.query]}
                              onClick={async () => {
                                const target = entries.find(e => e.id === tagTarget[z.query])
                                const ok = await act({ action: 'entry_add_tag', id: tagTarget[z.query], tag: z.query })
                                if (ok) setNote(`Added "${z.query}" as a tag on ${target?.name}. The widget finds it now.`)
                              }}>Add tag</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 12 }}>
            <div style={{ ...C.card, marginBottom: 0 }}>
              <div style={C.sublabel}>Top searches</div>
              {insights.top_searches.length === 0 ? <div style={{ fontSize: 13, color: '#6b7280' }}>None yet.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={C.th}>Search</th><th style={{ ...C.th, ...C.num }}>Times</th><th style={{ ...C.th, ...C.num }}>Results</th><th style={{ ...C.th, ...C.num }}>Clicks</th></tr></thead>
                    <tbody>
                      {insights.top_searches.map(t => (
                        <tr key={t.query}>
                          <td style={C.td}>{t.query}</td>
                          <td style={{ ...C.td, ...C.num }}>{t.searches}</td>
                          <td style={{ ...C.td, ...C.num, color: Number(t.avg_results) === 0 ? '#b91c1c' : undefined }}>{t.avg_results}</td>
                          <td style={{ ...C.td, ...C.num }}>{t.clicks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div style={{ ...C.card, marginBottom: 0 }}>
              <div style={C.sublabel}>Most-opened pages</div>
              {insights.top_clicked.length === 0 ? <div style={{ fontSize: 13, color: '#6b7280' }}>None yet.</div> : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={C.th}>Page</th><th style={{ ...C.th, ...C.num }}>Opened</th><th style={{ ...C.th, ...C.num }}>From browsing</th></tr></thead>
                    <tbody>
                      {insights.top_clicked.map(t => (
                        <tr key={t.id}>
                          <td style={C.td}><span style={{ marginRight: 6 }}>{badge(t.kind)}</span>{t.name}</td>
                          <td style={{ ...C.td, ...C.num }}>{t.clicks}</td>
                          <td style={{ ...C.td, ...C.num }}>{t.from_browsing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 12 }}>
            The log keeps no names, accounts, or IP addresses. Searches that look like an email address or an ID number are stored as
            &quot;(personal detail removed)&quot;.
          </p>
        </>
      )}

      {tab === 'pages' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            <input style={{ ...C.input, maxWidth: 320 }} placeholder="Find a page by name, tag, or division..." aria-label="Find a page"
              value={query} onChange={e => setQuery(e.target.value)} />
            <select style={C.sel} aria-label="Type" value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
              <option value="">Departments and programs</option>
              <option value="department">Departments</option>
              <option value="program">Programs &amp; services</option>
            </select>
            <label style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={onlyFlagged} onChange={e => setOnlyFlagged(e.target.checked)} />
              Needs review ({flaggedCount})
            </label>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Showing {filtered.length} of {entries.length}</span>
          </div>

          {filtered.map(e => {
            const isOpen = open === e.id
            const aud = String(val(e, 'audiences'))
            return (
              <div key={e.id} style={{ ...C.card, padding: isOpen ? 16 : '10px 16px', opacity: e.active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {badge(e.kind)}
                  <strong style={{ fontSize: 14 }}>{e.name}</strong>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>{TOPICS[e.topic]} · {e.tags.length} tags</span>
                  {e.popular_label && <span style={{ fontSize: 11, color: TEAL, fontWeight: 700 }}>Most visited #{e.popular_rank}</span>}
                  {!e.active && <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>Hidden</span>}
                  {e.review_note && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700 }}>Needs review</span>}
                  <button style={{ ...C.btn, marginLeft: 'auto' }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>{isOpen ? 'Close' : 'Edit'}</button>
                </div>
                {isOpen && (
                  <div style={{ marginTop: 12 }}>
                    {e.review_note && <div style={C.flag}><strong>Needs review:</strong> {e.review_note}</div>}
                    <div style={C.row}>
                      <input style={C.input} aria-label="Name" placeholder="Name" disabled={busy} value={val(e, 'name')} onChange={ev => setEdit(e.id, 'name', ev.target.value)} />
                      <input style={C.input} aria-label="Page link" placeholder="https://www.browardschools.com/..." disabled={busy} value={val(e, 'url')} onChange={ev => setEdit(e.id, 'url', ev.target.value)} />
                    </div>
                    <div style={C.row}>
                      <select style={C.sel} aria-label="Type" disabled={busy} value={val(e, 'kind')} onChange={ev => setEdit(e.id, 'kind', ev.target.value)}>
                        <option value="department">Department</option>
                        <option value="program">Program or service</option>
                      </select>
                      <select style={C.sel} aria-label="Topic" disabled={busy} value={val(e, 'topic')} onChange={ev => setEdit(e.id, 'topic', ev.target.value)}>
                        {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input style={C.input} aria-label={e.kind === 'department' ? 'Division' : 'Part of (department)'} disabled={busy}
                        placeholder={e.kind === 'department' ? 'Division' : 'Part of (department), hidden when blank'}
                        value={val(e, 'context')} onChange={ev => setEdit(e.id, 'context', ev.target.value)} />
                    </div>
                    <textarea style={{ ...C.input, minHeight: 52, resize: 'vertical', marginBottom: 8 }} aria-label="Description" placeholder="One or two plain sentences shown on the card"
                      disabled={busy} value={val(e, 'description')} onChange={ev => setEdit(e.id, 'description', ev.target.value)} />
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                      Tags <span style={{ fontWeight: 400, color: '#6b7280' }}>(comma separated: the words people search with)</span>
                    </label>
                    <textarea style={{ ...C.input, minHeight: 44, resize: 'vertical', marginBottom: 8 }} aria-label="Tags" disabled={busy}
                      value={val(e, 'tags')} onChange={ev => setEdit(e.id, 'tags', ev.target.value)} />
                    <input style={{ ...C.input, marginBottom: 8 }} aria-label="Includes" disabled={busy}
                      placeholder="Sub-units on this same page, comma separated (shown as Includes:)"
                      value={val(e, 'includes')} onChange={ev => setEdit(e.id, 'includes', ev.target.value)} />
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8, fontSize: 12 }}>
                      {AUDIENCES.map(([k, label]) => (
                        <label key={k} style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                          <input type="checkbox" disabled={busy} checked={aud.includes(k)}
                            onChange={ev => setEdit(e.id, 'audiences', ev.target.checked ? aud + k : aud.replace(k, ''))} />
                          {label}
                        </label>
                      ))}
                      <label style={{ display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                        <input type="checkbox" disabled={busy} checked={Boolean(edits[e.id]?.active ?? e.active)}
                          onChange={ev => setEdit(e.id, 'active', ev.target.checked)} />
                        Show in the widget
                      </label>
                    </div>
                    <div style={C.row}>
                      <input style={C.input} aria-label="Demand rank" placeholder="Order in its topic (1 = first, blank = A to Z)" disabled={busy}
                        value={val(e, 'demand_rank')} onChange={ev => setEdit(e.id, 'demand_rank', ev.target.value)} />
                      <input style={C.input} aria-label="Most visited label" placeholder="Most visited link text (blank = not in that row)" disabled={busy}
                        value={val(e, 'popular_label')} onChange={ev => setEdit(e.id, 'popular_label', ev.target.value)} />
                      <input style={C.input} aria-label="Most visited position" placeholder="Most visited position" disabled={busy}
                        value={val(e, 'popular_rank')} onChange={ev => setEdit(e.id, 'popular_rank', ev.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <textarea style={{ ...C.input, flex: '1 1 260px', minHeight: 36, resize: 'vertical', background: '#fffdf5' }}
                        placeholder="Internal review note (never shown publicly; clear it once confirmed)" aria-label="Internal review note" disabled={busy}
                        value={val(e, 'review_note')} onChange={ev => setEdit(e.id, 'review_note', ev.target.value)} />
                      <button style={C.btnPrimary} disabled={busy || !edits[e.id]}
                        onClick={async () => { if (await act({ action: 'entry_update', id: e.id, ...edits[e.id] })) setNote(`Saved ${e.name}.`) }}>Save</button>
                      <button style={C.btnDanger} disabled={busy}
                        onClick={() => { if (confirm(`Remove "${e.name}" from the directory? To keep it but hide it, untick "Show in the widget" instead.`)) act({ action: 'entry_delete', id: e.id }) }}>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ ...C.card, background: '#f9fafb' }}>
            {showNew ? (
              <>
                <div style={C.sublabel}>New page</div>
                <div style={C.row}>
                  <input style={C.input} placeholder="Name *" aria-label="New page name" value={newEntry.name} onChange={e => setNewEntry({ ...newEntry, name: e.target.value })} />
                  <input style={C.input} placeholder="Page link *" aria-label="New page link" value={newEntry.url} onChange={e => setNewEntry({ ...newEntry, url: e.target.value })} />
                </div>
                <div style={C.row}>
                  <select style={C.sel} aria-label="New page type" value={newEntry.kind} onChange={e => setNewEntry({ ...newEntry, kind: e.target.value })}>
                    <option value="department">Department</option>
                    <option value="program">Program or service</option>
                  </select>
                  <select style={C.sel} aria-label="New page topic" value={newEntry.topic} onChange={e => setNewEntry({ ...newEntry, topic: e.target.value })}>
                    {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <textarea style={{ ...C.input, minHeight: 52, resize: 'vertical', marginBottom: 8 }} placeholder="Description" aria-label="New page description"
                  value={newEntry.description} onChange={e => setNewEntry({ ...newEntry, description: e.target.value })} />
                <input style={{ ...C.input, marginBottom: 8 }} placeholder="Tags, comma separated" aria-label="New page tags"
                  value={newEntry.tags} onChange={e => setNewEntry({ ...newEntry, tags: e.target.value })} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={C.btnPrimary} disabled={busy || !newEntry.name.trim()}
                    onClick={async () => {
                      const sort_order = entries.reduce((m, e) => Math.max(m, e.sort_order), 0) + 1
                      if (await act({ action: 'entry_create', ...newEntry, sort_order })) { setNewEntry(EMPTY_NEW); setShowNew(false); setNote('Page added.') }
                    }}>Add page</button>
                  <button style={C.btn} onClick={() => { setShowNew(false); setNewEntry(EMPTY_NEW) }}>Cancel</button>
                </div>
              </>
            ) : (
              <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => setShowNew(true)}>+ Add page</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
