'use client'

// Tag Register (Sean, 2026-11-05). The District runs one Tag Manager
// container it owns, GTM-NTGC6X38. This page is the record of who has access
// to it (agencies, with open and close dates, so no one keeps access
// indefinitely) and of every tag on browardschools.com, including the ones the
// District does not own. Agencies get Edit access in their own workspace; the
// District publishes after the bcps-gtm-setup review step passes.
//
// Layout follows canon-sean-interface-defaults: a list per tab with filter
// chips, search and a New button; opening a row shows only that item under a
// breadcrumb; the address bar carries the view (?tab=&item=). The access form
// is paginated in three steps. Data: /api/bcps/tag-register (superadmin).

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Access {
  id: string
  department_slug: string | null
  agency: string
  purpose: string | null
  contact_name: string | null
  contact_email: string | null
  people: { name?: string; email?: string }[]
  gtm_permission: string
  workspace: string | null
  contract_ref: string | null
  contract_owner: string | null
  director_approval: string | null
  opens_on: string | null
  closes_on: string | null
  status: string
  intake: Record<string, string>
  notes: string | null
  updated_by: string | null
  updated_at: string
}

interface Tag {
  id: string
  container: string
  name: string
  platform: string | null
  tag_type: string | null
  ids: string | null
  owner: string | null
  department_slug: string | null
  access_id: string | null
  purpose: string | null
  pages: string | null
  data_collected: string | null
  personal_data: boolean
  status: string
  live_since: string | null
  review_on: string | null
  notes: string | null
  updated_by: string | null
  updated_at: string
}

interface Dept { slug: string; name: string; director_email: string | null }

const BLUE = '#1672A7'
const ACCESS_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  requested: { label: 'Waiting for intake', bg: '#fef3c7', fg: '#92400e' },
  open: { label: 'Open', bg: '#dcfce7', fg: '#166534' },
  closed: { label: 'Closed', bg: '#f3f4f6', fg: '#4b5563' },
  denied: { label: 'Denied', bg: '#fee2e2', fg: '#991b1b' },
}
const TAG_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  planned: { label: 'Not live yet', bg: '#fef3c7', fg: '#92400e' },
  live: { label: 'Live', bg: '#dcfce7', fg: '#166534' },
  paused: { label: 'Paused', bg: '#e0e7ff', fg: '#3730a3' },
  removed: { label: 'Removed', bg: '#f3f4f6', fg: '#4b5563' },
  not_ours: { label: 'Not ours', bg: '#fce7f3', fg: '#9d174d' },
}
const PERMISSIONS: Record<string, string> = {
  read: 'Read', edit: 'Edit (District publishes)', approve: 'Approve', publish: 'Publish', admin: 'Admin',
}
const CONTAINERS = ['GTM-NTGC6X38', 'GTM-P3BGC7', 'Site template (not in a container)']

// The intake questions sent to departments (reply to Magnet, 2026-11-05).
// Questions 1-4 (agency, people, contract, dates) are fields on the record.
const INTAKE: { key: string; label: string; hint?: string }[] = [
  { key: 'platforms', label: '5. Ad platforms and account or pixel IDs', hint: 'Google Ads, Meta, TikTok, Snapchat, programmatic...' },
  { key: 'pages', label: '6. Pages the tracking runs on', hint: 'Default: Magnet & Innovative Programs pages only' },
  { key: 'conversions', label: '7. Actions counted as conversions', hint: 'Page visits, clicks on How to Apply, video plays...' },
  { key: 'personal_info', label: '8. Personal information collected', hint: 'Must be none: no names, emails, form entries, student or family data' },
  { key: 'remarketing', label: '9. Used to build remarketing or retargeting audiences?' },
  { key: 'ga_access', label: '10. Needs Google Analytics read access, or only their ad platforms?' },
  { key: 'rules_agreed', label: '11. Agency read and agreed to the rules', hint: 'Yes, with date' },
]

const S = {
  input: { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' } as React.CSSProperties,
  btn: { padding: '7px 14px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' } as React.CSSProperties,
  primary: { padding: '7px 14px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap' } as React.CSSProperties,
  danger: { padding: '7px 14px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  label: { display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: 5 } as React.CSSProperties,
  hint: { fontSize: 12, color: '#9ca3af', marginTop: 4 } as React.CSSProperties,
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 } as React.CSSProperties,
}

const today = () => new Date().toISOString().slice(0, 10)
const daysUntil = (d: string) => Math.round((new Date(`${d}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000)
const fmt = (d: string | null) => d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

function Chip({ s }: { s: { label: string; bg: string; fg: string } }) {
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: s.bg, color: s.fg, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>{s.label}</span>
}

// How the close date reads in the list and on the record: the point of the
// register is that agency access ends, so a missing or passed date shows.
function closeNote(a: Access): { text: string; color: string } | null {
  if (a.status === 'closed' || a.status === 'denied') return a.closes_on ? { text: `Closed ${fmt(a.closes_on)}`, color: '#6b7280' } : null
  if (a.gtm_permission === 'admin' || /service account|container owner/i.test(a.agency)) return { text: 'Permanent (District)', color: '#6b7280' }
  if (!a.closes_on) return { text: 'No close date yet', color: '#b45309' }
  const n = daysUntil(a.closes_on)
  if (n < 0) return { text: `Past close date (${fmt(a.closes_on)})`, color: '#b91c1c' }
  if (n <= 14) return { text: `Closes in ${n} day${n === 1 ? '' : 's'}`, color: '#b45309' }
  return { text: `Closes ${fmt(a.closes_on)}`, color: '#374151' }
}

// Most urgent first: past close date, waiting for intake, closing soonest,
// open with no date, permanent, then closed.
function accessRank(a: Access): number {
  if (a.status === 'closed' || a.status === 'denied') return 9e9
  if (a.status === 'open' && a.closes_on && daysUntil(a.closes_on) < 0) return -1e9
  if (a.status === 'requested') return -1e8
  if (a.gtm_permission === 'admin' || /service account|container owner/i.test(a.agency)) return 8e9
  return a.closes_on ? daysUntil(a.closes_on) : 1e9
}

export default function TagRegisterPage() {
  const supabase = createClient()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const tab = params.get('tab') === 'tags' ? 'tags' : 'access'
  const item = params.get('item')

  const [access, setAccess] = useState<Access[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [depts, setDepts] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setErr('')
    const r = await fetch('/api/bcps/tag-register', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not load the register'); setLoading(false); return }
    setAccess(j.access); setTags(j.tags); setDepts(j.departments); setLoading(false)
  }, [token])
  useEffect(() => { load() }, [load])

  const go = useCallback((next: { tab?: string; item?: string | null }) => {
    const q = new URLSearchParams(params.toString())
    q.set('page', 'tag-register')
    q.set('tab', next.tab ?? tab)
    if (next.item) q.set('item', next.item); else q.delete('item')
    router.push(`${pathname}?${q.toString()}`, { scroll: false })
    window.scrollTo(0, 0)
  }, [params, pathname, router, tab])

  const save = useCallback(async (payload: any): Promise<any> => {
    setErr('')
    const r = await fetch('/api/bcps/tag-register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Could not save'); return null }
    await load()
    return j.row ?? true
  }, [token, load])

  const deptName = useCallback((slug: string | null) => depts.find(d => d.slug === slug)?.name || (slug ? slug : 'District'), [depts])

  if (loading) return <div style={{ padding: 32 }}>Loading the tag register...</div>

  const current = item && item !== 'new'
    ? (tab === 'access' ? access.find(a => a.id === item) : tags.find(t => t.id === item))
    : null
  const crumbLabel = item === 'new' ? (tab === 'access' ? 'New access request' : 'New tag') : current ? ('agency' in current ? current.agency : current.name) : null

  return (
    <div className="tagreg" style={{ padding: '28px 32px', fontFamily: 'inherit' }}>
      <style>{`
        .tagreg-row { display: grid; grid-template-columns: var(--cols); gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid #f3f4f6; }
        .tagreg-head { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #9ca3af; border-top: none; }
        .tagreg-cell-sub { font-size: 12px; color: #6b7280; margin-top: 2px; }
        .tagreg-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .tagreg-mobile { display: none; }
        @media (max-width: 860px) {
          .tagreg { padding: 20px 16px !important; }
          .tagreg-head { display: none; }
          .tagreg-row { grid-template-columns: 1fr auto; }
          .tagreg-row > .tagreg-hide { display: none; }
          .tagreg-grid2 { grid-template-columns: 1fr; }
          .tagreg-mobile { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; font-weight: 700; }
        }
      `}</style>

      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        <a onClick={() => go({ item: null })} style={{ color: BLUE, cursor: 'pointer', fontWeight: 700 }}>Tag Register</a>
        {' / '}
        <a onClick={() => go({ item: null })} style={{ color: crumbLabel ? BLUE : '#6b7280', cursor: 'pointer', fontWeight: crumbLabel ? 700 : 400 }}>
          {tab === 'access' ? 'Agency access' : 'Tags'}
        </a>
        {crumbLabel && <> {' / '} <span>{crumbLabel}</span></>}
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {!item && (
        <>
          <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Tag Register</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 18px', maxWidth: 820 }}>
            Who has access to the District&apos;s Tag Manager container (GTM-NTGC6X38) and every tag on browardschools.com.
            Agencies get Edit access in their own workspace, open and closed on set dates. The District publishes after the review step passes.
          </p>
          <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
            {(['access', 'tags'] as const).map(t => (
              <button key={t} onClick={() => go({ tab: t, item: null })}
                style={{ padding: '9px 16px', border: 'none', borderBottom: `3px solid ${tab === t ? BLUE : 'transparent'}`, background: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 13, color: tab === t ? BLUE : '#6b7280', fontFamily: 'inherit', borderRadius: '6px 6px 0 0' }}>
                {t === 'access' ? `Agency access (${access.length})` : `Tags (${tags.length})`}
              </button>
            ))}
          </div>
          {tab === 'access'
            ? <AccessList rows={access} deptName={deptName} onOpen={id => go({ item: id })} onNew={() => go({ item: 'new' })} />
            : <TagList rows={tags} onOpen={id => go({ item: id })} onNew={() => go({ item: 'new' })} />}
        </>
      )}

      {item && tab === 'access' && (item === 'new' || current) && (
        <AccessView key={item} row={(current as Access) || null} depts={depts} deptName={deptName}
          tags={tags.filter(t => current && t.access_id === current.id)}
          onSave={save} onDone={id => go({ item: id })} onOpenTag={id => go({ tab: 'tags', item: id })} onBack={() => go({ item: null })} />
      )}
      {item && tab === 'tags' && (item === 'new' || current) && (
        <TagView key={item} row={(current as Tag) || null} depts={depts} access={access}
          onSave={save} onDone={id => go({ item: id })} onBack={() => go({ item: null })} />
      )}
      {item && item !== 'new' && !current && (
        <div style={S.card}>That record no longer exists. <a onClick={() => go({ item: null })} style={{ color: BLUE, cursor: 'pointer', fontWeight: 700 }}>Back to the list</a></div>
      )}
    </div>
  )
}

function Toolbar({ chips, active, onChip, query, onQuery, placeholder, extra, onNew, newLabel }: {
  chips: { key: string; label: string; count: number }[]; active: string; onChip: (k: string) => void
  query: string; onQuery: (q: string) => void; placeholder: string; extra?: React.ReactNode; onNew: () => void; newLabel: string
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map(c => (
          <button key={c.key} onClick={() => onChip(c.key)}
            style={{ ...S.btn, borderColor: active === c.key ? BLUE : '#d1d5db', color: active === c.key ? BLUE : '#374151', background: active === c.key ? '#eff6ff' : '#fff' }}>
            {c.label} ({c.count})
          </button>
        ))}
      </div>
      <input style={{ ...S.input, width: 260, flex: '1 1 200px', maxWidth: 360 }} placeholder={placeholder} value={query} onChange={e => onQuery(e.target.value)} />
      {extra}
      <button style={{ ...S.primary, marginLeft: 'auto' }} onClick={onNew}>{newLabel}</button>
    </div>
  )
}

function AccessList({ rows, deptName, onOpen, onNew }: { rows: Access[]; deptName: (s: string | null) => string; onOpen: (id: string) => void; onNew: () => void }) {
  const [filter, setFilter] = useState('active')
  const [query, setQuery] = useState('')
  const counts = (k: string) => k === 'all' ? rows.length : k === 'active' ? rows.filter(r => r.status === 'open' || r.status === 'requested').length : rows.filter(r => r.status === k).length
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter(r => filter === 'all' || (filter === 'active' ? (r.status === 'open' || r.status === 'requested') : r.status === filter))
      .filter(r => !q || [r.agency, deptName(r.department_slug), r.contact_name, r.contact_email, r.purpose, r.workspace].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => accessRank(a) - accessRank(b))
  }, [rows, filter, query, deptName])
  const cols = '2fr 1.4fr 1fr 1.3fr 0.9fr auto'
  return (
    <>
      <Toolbar chips={['active', 'requested', 'open', 'closed', 'all'].map(k => ({ key: k, label: k === 'active' ? 'Active' : k === 'all' ? 'All' : ACCESS_STATUS[k].label, count: counts(k) }))}
        active={filter} onChip={setFilter} query={query} onQuery={setQuery} placeholder="Search agency, department, contact..." onNew={onNew} newLabel="New access request" />
      <div style={{ ...S.card, padding: 0 }}>
        <div className="tagreg-row tagreg-head" style={{ ['--cols' as any]: cols }}>
          <div>Agency</div><div className="tagreg-hide">Department</div><div className="tagreg-hide">Access</div><div className="tagreg-hide">Dates</div><div className="tagreg-hide">Status</div><div />
        </div>
        {shown.map(r => {
          const note = closeNote(r)
          return (
            <div key={r.id} className="tagreg-row" style={{ ['--cols' as any]: cols }}>
              <div><div style={{ fontWeight: 800, fontSize: 14 }}>{r.agency}</div><div className="tagreg-cell-sub">{r.contact_email || r.contact_name || ''}</div>
                <div className="tagreg-mobile"><Chip s={ACCESS_STATUS[r.status] || ACCESS_STATUS.requested} />{note && <span style={{ color: note.color }}>{note.text}</span>}</div></div>
              <div className="tagreg-hide" style={{ fontSize: 13 }}>{deptName(r.department_slug)}</div>
              <div className="tagreg-hide" style={{ fontSize: 13 }}>{PERMISSIONS[r.gtm_permission] || r.gtm_permission}<div className="tagreg-cell-sub">{r.workspace || ''}</div></div>
              <div className="tagreg-hide" style={{ fontSize: 13 }}>
                {r.opens_on ? `Opened ${fmt(r.opens_on)}` : 'Not opened'}
                {note && <div className="tagreg-cell-sub" style={{ color: note.color, fontWeight: 700 }}>{note.text}</div>}
              </div>
              <div className="tagreg-hide"><Chip s={ACCESS_STATUS[r.status] || ACCESS_STATUS.requested} /></div>
              <div><button style={S.btn} onClick={() => onOpen(r.id)}>Open</button></div>
            </div>
          )
        })}
        {!shown.length && <div style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Nothing matches.</div>}
      </div>
    </>
  )
}

function TagList({ rows, onOpen, onNew }: { rows: Tag[]; onOpen: (id: string) => void; onNew: () => void }) {
  const [filter, setFilter] = useState('all')
  const [container, setContainer] = useState('')
  const [query, setQuery] = useState('')
  const counts = (k: string) => k === 'all' ? rows.length : rows.filter(r => r.status === k).length
  const order = ['planned', 'live', 'paused', 'not_ours', 'removed']
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter(r => filter === 'all' || r.status === filter)
      .filter(r => !container || r.container === container)
      .filter(r => !q || [r.name, r.platform, r.ids, r.owner, r.pages, r.purpose].some(v => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || (a.review_on || '9').localeCompare(b.review_on || '9') || a.name.localeCompare(b.name))
  }, [rows, filter, container, query])
  const containers = Array.from(new Set(rows.map(r => r.container)))
  const cols = '2fr 1.1fr 1.2fr 1.6fr 0.9fr auto'
  return (
    <>
      <Toolbar chips={['all', ...order].map(k => ({ key: k, label: k === 'all' ? 'All' : TAG_STATUS[k].label, count: counts(k) }))}
        active={filter} onChip={setFilter} query={query} onQuery={setQuery} placeholder="Search tag, platform, ID, owner..."
        extra={<select style={{ ...S.input, width: 'auto' }} value={container} onChange={e => setContainer(e.target.value)}>
          <option value="">All containers</option>{containers.map(c => <option key={c} value={c}>{c}</option>)}
        </select>}
        onNew={onNew} newLabel="New tag" />
      <div style={{ ...S.card, padding: 0 }}>
        <div className="tagreg-row tagreg-head" style={{ ['--cols' as any]: cols }}>
          <div>Tag</div><div className="tagreg-hide">Container</div><div className="tagreg-hide">Owner</div><div className="tagreg-hide">Pages</div><div className="tagreg-hide">Status</div><div />
        </div>
        {shown.map(r => (
          <div key={r.id} className="tagreg-row" style={{ ['--cols' as any]: cols }}>
            <div><div style={{ fontWeight: 800, fontSize: 14 }}>{r.name}</div><div className="tagreg-cell-sub">{[r.platform, r.ids].filter(Boolean).join(' · ')}</div>
              <div className="tagreg-mobile"><Chip s={TAG_STATUS[r.status] || TAG_STATUS.planned} /><span style={{ color: '#6b7280' }}>{r.container}</span></div></div>
            <div className="tagreg-hide" style={{ fontSize: 13 }}>{r.container}</div>
            <div className="tagreg-hide" style={{ fontSize: 13 }}>{r.owner || ''}{r.review_on && r.status === 'live' && <div className="tagreg-cell-sub">Review {fmt(r.review_on)}</div>}</div>
            <div className="tagreg-hide"><div style={{ fontSize: 13, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.pages || ''}</div></div>
            <div className="tagreg-hide"><Chip s={TAG_STATUS[r.status] || TAG_STATUS.planned} /></div>
            <div><button style={S.btn} onClick={() => onOpen(r.id)}>Open</button></div>
          </div>
        ))}
        {!shown.length && <div style={{ padding: 20, color: '#9ca3af', fontSize: 13 }}>Nothing matches.</div>}
      </div>
    </>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><label style={S.label}>{label}</label>{children}{hint && <div style={S.hint}>{hint}</div>}</div>
}

const peopleToText = (p: Access['people']) => (p || []).map(x => [x.name, x.email].filter(Boolean).join(', ')).join('\n')
const textToPeople = (t: string) => t.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const email = (l.match(/[^\s,<>]+@[^\s,<>]+/) || [''])[0]
  const name = l.replace(email, '').replace(/[,<>]/g, ' ').replace(/\s+/g, ' ').trim()
  return { name, email }
})

const ACCESS_STEPS = ['Agency and people', 'Access and dates', 'Tracking answers']

function AccessView({ row, depts, deptName, tags, onSave, onDone, onOpenTag, onBack }: {
  row: Access | null; depts: Dept[]; deptName: (s: string | null) => string; tags: Tag[]
  onSave: (p: any) => Promise<any>; onDone: (id: string) => void; onOpenTag: (id: string) => void; onBack: () => void
}) {
  const [f, setF] = useState<any>(() => row
    ? { ...row, people_text: peopleToText(row.people), intake: row.intake || {} }
    : { agency: '', department_slug: '', gtm_permission: 'edit', status: 'requested', people_text: '', intake: {} })
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))
  const setIntake = (k: string, v: string) => setF((p: any) => ({ ...p, intake: { ...p.intake, [k]: v } }))
  const director = depts.find(d => d.slug === f.department_slug)?.director_email

  const submit = async (overrides: any = {}) => {
    setBusy(true)
    const { people_text, id, created_at, updated_at, updated_by, ...rest } = { ...f, ...overrides }
    const saved = await onSave({ action: 'access_save', id: row?.id, ...rest, people: textToPeople(people_text || '') })
    setBusy(false)
    if (saved && saved !== true) { if (!row) onDone(saved.id); else setF((p: any) => ({ ...p, ...saved, people_text: peopleToText(saved.people) })) }
  }

  const note = row ? closeNote(row) : null
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{row ? row.agency : 'New access request'}</h1>
        {row && <Chip s={ACCESS_STATUS[row.status] || ACCESS_STATUS.requested} />}
        {note && <span style={{ fontSize: 13, fontWeight: 700, color: note.color }}>{note.text}</span>}
        {row && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {row.status !== 'open' && <button style={S.btn} disabled={busy}
              onClick={() => submit({ status: 'open', opens_on: f.opens_on || today() })}>Open access</button>}
            {row.status === 'open' && <button style={S.btn} disabled={busy}
              onClick={() => { if (confirm(`Close access for ${row.agency}? Remove their users in Tag Manager and pause their tags too.`)) submit({ status: 'closed', closes_on: row.closes_on && daysUntil(row.closes_on) <= 0 ? row.closes_on : today() }) }}>Close access</button>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ACCESS_STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)}
            style={{ ...S.btn, borderColor: step === i ? BLUE : '#e5e7eb', color: step === i ? BLUE : '#6b7280', background: step === i ? '#eff6ff' : '#fff' }}>
            Step {i + 1} of {ACCESS_STEPS.length}: {s}
          </button>
        ))}
      </div>

      <div style={S.card}>
        {step === 0 && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="tagreg-grid2">
              <Field label="Agency *"><input style={S.input} value={f.agency || ''} onChange={e => set('agency', e.target.value)} /></Field>
              <Field label="Department" hint={director ? `Director on file: ${director}` : undefined}>
                <select style={S.input} value={f.department_slug || ''} onChange={e => set('department_slug', e.target.value)}>
                  <option value="">District (no department)</option>
                  {depts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Purpose"><textarea style={{ ...S.input, minHeight: 60 }} value={f.purpose || ''} onChange={e => set('purpose', e.target.value)} /></Field>
            <div className="tagreg-grid2">
              <Field label="1. Primary contact name"><input style={S.input} value={f.contact_name || ''} onChange={e => set('contact_name', e.target.value)} /></Field>
              <Field label="Contact email and phone"><input style={S.input} value={f.contact_email || ''} onChange={e => set('contact_email', e.target.value)} /></Field>
            </div>
            <Field label="2. People who get access" hint="One per line: name, work email. Each person uses their own Google account.">
              <textarea style={{ ...S.input, minHeight: 80, fontFamily: 'ui-monospace, monospace' }} value={f.people_text || ''} onChange={e => set('people_text', e.target.value)} />
            </Field>
            <div className="tagreg-grid2">
              <Field label="3. Contract or PO number"><input style={S.input} value={f.contract_ref || ''} onChange={e => set('contract_ref', e.target.value)} /></Field>
              <Field label="BCPS contract owner"><input style={S.input} value={f.contract_owner || ''} onChange={e => set('contract_owner', e.target.value)} /></Field>
            </div>
          </div>
        )}
        {step === 1 && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="tagreg-grid2">
              <Field label="Tag Manager permission" hint="Agencies get Edit. The District publishes after the review step passes.">
                <select style={S.input} value={f.gtm_permission} onChange={e => set('gtm_permission', e.target.value)}>
                  {Object.entries(PERMISSIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Their workspace" hint='Their own, for example "Magnet - Agency". Never the Default Workspace.'>
                <input style={S.input} value={f.workspace || ''} onChange={e => set('workspace', e.target.value)} />
              </Field>
            </div>
            <div className="tagreg-grid2">
              <Field label="4. Access opens"><input type="date" style={S.input} value={f.opens_on || ''} onChange={e => set('opens_on', e.target.value)} /></Field>
              <Field label="Access closes" hint="The campaign end date. Users are removed and tags paused that day.">
                <input type="date" style={S.input} value={f.closes_on || ''} onChange={e => set('closes_on', e.target.value)} />
              </Field>
            </div>
            <div className="tagreg-grid2">
              <Field label="Director approval" hint="Who approved and when.">
                <input style={S.input} value={f.director_approval || ''} onChange={e => set('director_approval', e.target.value)} />
              </Field>
              <Field label="Status">
                <select style={S.input} value={f.status} onChange={e => set('status', e.target.value)}>
                  {Object.entries(ACCESS_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes"><textarea style={{ ...S.input, minHeight: 80 }} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
          </div>
        )}
        {step === 2 && (
          <div style={{ display: 'grid', gap: 16 }}>
            {INTAKE.map(q => (
              <Field key={q.key} label={q.label} hint={q.hint}>
                <textarea style={{ ...S.input, minHeight: 44 }} value={f.intake?.[q.key] || ''} onChange={e => setIntake(q.key, e.target.value)} />
              </Field>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button style={S.btn} onClick={() => step ? setStep(step - 1) : onBack()}>{step ? 'Back' : 'Cancel'}</button>
          {step < ACCESS_STEPS.length - 1 && <button style={S.btn} disabled={!f.agency} onClick={() => setStep(step + 1)}>Next</button>}
          {(row || step === ACCESS_STEPS.length - 1) && (
            <button style={S.primary} disabled={busy || !f.agency} onClick={() => submit()}>{busy ? 'Saving...' : row ? 'Save' : 'Create'}</button>
          )}
          {row && <button style={{ ...S.danger, marginLeft: 'auto' }} disabled={busy}
            onClick={async () => { if (confirm(`Delete the record for ${row.agency}? Use Close access instead to keep the history.`)) { if (await onSave({ action: 'access_delete', id: row.id })) onBack() } }}>Delete</button>}
        </div>
        {row && <div style={{ ...S.hint, marginTop: 12 }}>Last updated {new Date(row.updated_at).toLocaleString('en-US')}{row.updated_by ? ` by ${row.updated_by}` : ''}. Department: {deptName(row.department_slug)}.</div>}
      </div>

      {row && (
        <div style={S.card}>
          <div style={{ ...S.label, marginBottom: 10 }}>Tags under this access ({tags.length})</div>
          {tags.length ? tags.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid #f3f4f6' }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</span><Chip s={TAG_STATUS[t.status] || TAG_STATUS.planned} />
              <button style={{ ...S.btn, marginLeft: 'auto' }} onClick={() => onOpenTag(t.id)}>Open</button>
            </div>
          )) : <div style={{ fontSize: 13, color: '#9ca3af' }}>No tags recorded yet. Add each tag in the Tags tab once the agency builds it, linked to this access.</div>}
        </div>
      )}
    </div>
  )
}

function TagView({ row, depts, access, onSave, onDone, onBack }: {
  row: Tag | null; depts: Dept[]; access: Access[]
  onSave: (p: any) => Promise<any>; onDone: (id: string) => void; onBack: () => void
}) {
  const [f, setF] = useState<any>(() => row ? { ...row } : { container: 'GTM-NTGC6X38', name: '', status: 'planned', personal_data: false })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  const submit = async () => {
    setBusy(true)
    const { id, created_at, updated_at, updated_by, ...rest } = f
    const saved = await onSave({ action: 'tag_save', id: row?.id, ...rest })
    setBusy(false)
    if (saved && saved !== true) { if (!row) onDone(saved.id); else setF({ ...saved }) }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>{row ? row.name : 'New tag'}</h1>
        {row && <Chip s={TAG_STATUS[row.status] || TAG_STATUS.planned} />}
      </div>
      <div style={S.card}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="tagreg-grid2">
            <Field label="Tag name *" hint='Agency tags start with the department prefix, for example "MAGNET |".'>
              <input style={S.input} value={f.name || ''} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field label="Container *">
              <select style={S.input} value={f.container} onChange={e => set('container', e.target.value)}>
                {Array.from(new Set([...CONTAINERS, f.container])).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <div className="tagreg-grid2">
            <Field label="Platform"><input style={S.input} placeholder="GA4, Google Ads, Meta..." value={f.platform || ''} onChange={e => set('platform', e.target.value)} /></Field>
            <Field label="Tag type"><input style={S.input} placeholder="GA4 event, Custom HTML, Conversion..." value={f.tag_type || ''} onChange={e => set('tag_type', e.target.value)} /></Field>
          </div>
          <div className="tagreg-grid2">
            <Field label="IDs" hint="Measurement, pixel or conversion IDs."><input style={S.input} value={f.ids || ''} onChange={e => set('ids', e.target.value)} /></Field>
            <Field label="Owner"><input style={S.input} placeholder="District Web Team, agency name, Finalsite..." value={f.owner || ''} onChange={e => set('owner', e.target.value)} /></Field>
          </div>
          <div className="tagreg-grid2">
            <Field label="Department">
              <select style={S.input} value={f.department_slug || ''} onChange={e => set('department_slug', e.target.value)}>
                <option value="">District (no department)</option>
                {depts.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Under which access">
              <select style={S.input} value={f.access_id || ''} onChange={e => set('access_id', e.target.value)}>
                <option value="">None</option>
                {access.map(a => <option key={a.id} value={a.id}>{a.agency}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Purpose"><textarea style={{ ...S.input, minHeight: 60 }} value={f.purpose || ''} onChange={e => set('purpose', e.target.value)} /></Field>
          <Field label="Pages it fires on"><input style={S.input} value={f.pages || ''} onChange={e => set('pages', e.target.value)} /></Field>
          <div className="tagreg-grid2">
            <Field label="Data collected"><textarea style={{ ...S.input, minHeight: 60 }} value={f.data_collected || ''} onChange={e => set('data_collected', e.target.value)} /></Field>
            <Field label="Personal information" hint="Should be No for every tag. Yes needs a privacy review before it goes live.">
              <select style={S.input} value={f.personal_data ? 'yes' : 'no'} onChange={e => set('personal_data', e.target.value === 'yes')}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </Field>
          </div>
          <div className="tagreg-grid2">
            <Field label="Status">
              <select style={S.input} value={f.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(TAG_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <div className="tagreg-grid2">
              <Field label="Live since"><input type="date" style={S.input} value={f.live_since || ''} onChange={e => set('live_since', e.target.value)} /></Field>
              <Field label="Next review"><input type="date" style={S.input} value={f.review_on || ''} onChange={e => set('review_on', e.target.value)} /></Field>
            </div>
          </div>
          <Field label="Notes"><textarea style={{ ...S.input, minHeight: 60 }} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button style={S.btn} onClick={onBack}>{row ? 'Back' : 'Cancel'}</button>
          <button style={S.primary} disabled={busy || !f.name || !f.container} onClick={submit}>{busy ? 'Saving...' : row ? 'Save' : 'Create'}</button>
          {row && <button style={{ ...S.danger, marginLeft: 'auto' }} disabled={busy}
            onClick={async () => { if (confirm(`Delete "${row.name}" from the register? Set it to Removed instead to keep the history.`)) { if (await onSave({ action: 'tag_delete', id: row.id })) onBack() } }}>Delete</button>}
        </div>
        {row && <div style={{ ...S.hint, marginTop: 12 }}>Last updated {new Date(row.updated_at).toLocaleString('en-US')}{row.updated_by ? ` by ${row.updated_by}` : ''}.</div>}
      </div>
    </div>
  )
}
