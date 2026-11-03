'use client'

// Admin editor for the Early Childhood Programs Directory widget (public embed at
// /embeds/early-childhood-programs.html). Built to the interface defaults in
// canon-sean-interface-defaults: a list where every row looks and acts the same
// (one Edit button at the end), each school, program and the contact settings open
// in their own view under a breadcrumb, "+ New school" is a button at the top right
// that opens its own form, and the list searches and filters with counts. Statuses
// are plain-word colored tags. Unlike the II&DL editor there is no stack of open
// editors on one long page: ~90 schools are a list, not a scroll of forms.
//
// Content lives in three tables: schools (one row per school with a yes/no per
// program), programs (the four programs and the short explainers families see when
// they tap the (i) button), and one settings row (how families apply and the
// department contact). Changes go live on bcpsmarcomm.com immediately.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface School {
  id: string
  name: string
  address: string | null
  city: string | null
  zip: string | null
  phone: string | null
  early_head_start: boolean
  head_start: boolean
  vpk_free_full_day: boolean
  vpk_tuition_supported: boolean
  lat: number | string | null
  lng: number | string | null
  review_note: string | null
  sort_order: number
}

interface Program {
  slug: string
  name: string
  card_label: string
  cost_label: string
  ages_label: string
  explainer: string | null
  learn_more_url: string | null
  sort_order: number
}

interface Settings {
  apply_note?: string | null
  contact_label?: string | null
  contact_email?: string | null
  contact_url?: string | null
}

type View =
  | { name: 'list' }
  | { name: 'school'; id: string }
  | { name: 'new' }
  | { name: 'programs' }
  | { name: 'program'; slug: string }
  | { name: 'contact' }

// Each program is a yes/no column on a school row.
const FLAG: Record<string, keyof School> = {
  'early-head-start': 'early_head_start',
  'head-start': 'head_start',
  'vpk-free-full-day': 'vpk_free_full_day',
  'vpk-tuition-supported': 'vpk_tuition_supported',
}
const FLAG_KEYS = ['early_head_start', 'head_start', 'vpk_free_full_day', 'vpk_tuition_supported'] as const

const BLUE = '#1672A7'
const PAGE = 25
const EMPTY_SCHOOL = {
  name: '', address: '', city: '', zip: '', phone: '',
  early_head_start: false, head_start: false, vpk_free_full_day: false, vpk_tuition_supported: false,
  review_note: '',
}

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', width: '100%', minWidth: 0 } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', background: '#fff', minWidth: 0, maxWidth: '100%' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '6px 12px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6b7280', marginBottom: 6 } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 10, marginBottom: 10 } as React.CSSProperties,
  tag: { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, whiteSpace: 'nowrap' } as React.CSSProperties,
  row: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 4px', borderTop: '1px solid #eef0f3' } as React.CSSProperties,
}

const TAG_FREE = { ...C.tag, background: '#E0F4F5', color: '#006A74' }
const TAG_TUITION = { ...C.tag, background: '#FFF1DC', color: '#7A3E00' }
const TAG_REVIEW = { ...C.tag, background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }
const TAG_MUTED = { ...C.tag, background: '#f3f4f6', color: '#4b5563' }

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ ...C.sublabel, display: 'block' }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: 11, color: '#6b7280', marginTop: 3 }}>{hint}</span>}
    </label>
  )
}

export default function EarlyChildhoodProgramsPage() {
  const supabase = createClient()
  const [schools, setSchools] = useState<School[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [view, setView] = useState<View>({ name: 'list' })

  // list controls
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [chip, setChip] = useState('') // '' | program slug | 'review' | 'nopin'
  const [limit, setLimit] = useState(PAGE)

  // form drafts (one at a time, because only one view is open)
  const [schoolDraft, setSchoolDraft] = useState<Record<string, any>>({ ...EMPTY_SCHOOL })
  const [programDraft, setProgramDraft] = useState<Record<string, any>>({})
  const [settingsDraft, setSettingsDraft] = useState<Record<string, any>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setErr('')
    const r = await fetch('/api/bcps/early-childhood-programs', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setSchools(j.schools); setPrograms(j.programs); setSettings(j.settings ?? {})
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: Record<string, unknown>) => {
    setBusy(true); setErr(''); setOk('')
    const r = await fetch('/api/bcps/early-childhood-programs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json()
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    await load()
    return j
  }, [token, load])

  const go = (v: View) => {
    setErr(''); setOk('')
    if (v.name === 'new') setSchoolDraft({ ...EMPTY_SCHOOL })
    if (v.name === 'school') {
      const s = schools.find(x => x.id === v.id)
      if (s) setSchoolDraft({
        name: s.name, address: s.address ?? '', city: s.city ?? '', zip: s.zip ?? '', phone: s.phone ?? '',
        early_head_start: s.early_head_start, head_start: s.head_start,
        vpk_free_full_day: s.vpk_free_full_day, vpk_tuition_supported: s.vpk_tuition_supported,
        review_note: s.review_note ?? '',
      })
    }
    if (v.name === 'program') {
      const p = programs.find(x => x.slug === v.slug)
      if (p) setProgramDraft({
        name: p.name, card_label: p.card_label, cost_label: p.cost_label, ages_label: p.ages_label,
        explainer: p.explainer ?? '', learn_more_url: p.learn_more_url ?? '',
      })
    }
    if (v.name === 'contact') setSettingsDraft({
      apply_note: settings.apply_note ?? '', contact_label: settings.contact_label ?? '',
      contact_email: settings.contact_email ?? '', contact_url: settings.contact_url ?? '',
    })
    setView(v)
  }

  const cities = useMemo(() => Array.from(new Set(schools.map(s => s.city).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)), [schools])
  const hasPin = (s: School) => s.lat != null && s.lng != null
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: schools.length, review: 0, nopin: 0 }
    programs.forEach(p => { c[p.slug] = schools.filter(s => s[FLAG[p.slug]]).length })
    schools.forEach(s => { if (s.review_note) c.review++; if (!hasPin(s)) c.nopin++ })
    return c
  }, [schools, programs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return schools.filter(s => {
      if (city && s.city !== city) return false
      if (chip === 'review' && !s.review_note) return false
      if (chip === 'nopin' && hasPin(s)) return false
      if (chip && chip !== 'review' && chip !== 'nopin' && !s[FLAG[chip]]) return false
      if (!q) return true
      return [s.name, s.address, s.city, s.zip, s.phone].some(v => (v ?? '').toLowerCase().includes(q))
    })
  }, [schools, query, city, chip])

  if (loading) return <div style={{ padding: 32 }}>Loading Early Childhood Programs Directory content...</div>

  const crumb = (parts: { label: string; to?: View }[]) => (
    <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: '#6b7280', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {parts.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', gap: 6 }}>
          {p.to
            ? <button style={{ border: 0, background: 'none', color: BLUE, cursor: 'pointer', fontSize: 12, fontWeight: 700, padding: 0, fontFamily: 'inherit' }} onClick={() => go(p.to!)}>{p.label}</button>
            : <span style={{ color: '#111827', fontWeight: 700 }}>{p.label}</span>}
          {i < parts.length - 1 && <span aria-hidden="true">/</span>}
        </span>
      ))}
    </nav>
  )
  const root = { label: 'Early Childhood Programs', to: { name: 'list' } as View }

  const banners = (
    <>
      {err && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 12px' }}>{err}</div>}
      {ok && <div role="status" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '0 0 12px' }}>{ok}</div>}
    </>
  )

  const shell = (children: React.ReactNode) => (
    <div style={{ padding: 32, fontFamily: 'inherit' }}>{children}</div>
  )

  // PROGRAM CHECKBOXES (shared by edit and new)
  const flagBoxes = (
    <div>
      <div style={C.sublabel}>Programs at this school</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
        {programs.map(p => {
          const key = FLAG[p.slug] as string
          return (
            <label key={p.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={!!schoolDraft[key]} disabled={busy}
                onChange={e => setSchoolDraft(d => ({ ...d, [key]: e.target.checked }))} />
              {p.name} <span style={p.slug === 'vpk-tuition-supported' ? TAG_TUITION : TAG_FREE}>{p.cost_label}</span>
            </label>
          )
        })}
      </div>
    </div>
  )

  const schoolFields = (
    <>
      <div style={C.grid}>
        <Field label="School name *">
          <input style={C.input} value={schoolDraft.name} disabled={busy} onChange={e => setSchoolDraft(d => ({ ...d, name: e.target.value }))} />
        </Field>
        <Field label="Phone">
          <input style={C.input} value={schoolDraft.phone} disabled={busy} onChange={e => setSchoolDraft(d => ({ ...d, phone: e.target.value }))} />
        </Field>
      </div>
      <div style={C.grid}>
        <Field label="Street address" hint="Changing the address, city or ZIP re-places the map pin used by the nearest-school search.">
          <input style={C.input} value={schoolDraft.address} disabled={busy} onChange={e => setSchoolDraft(d => ({ ...d, address: e.target.value }))} />
        </Field>
        <Field label="City">
          <input style={C.input} list="ec-cities" value={schoolDraft.city} disabled={busy} onChange={e => setSchoolDraft(d => ({ ...d, city: e.target.value }))} />
          <datalist id="ec-cities">{cities.map(c => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="ZIP code">
          <input style={C.input} value={schoolDraft.zip} disabled={busy} inputMode="numeric" onChange={e => setSchoolDraft(d => ({ ...d, zip: e.target.value }))} />
        </Field>
      </div>
      <div style={{ marginBottom: 12 }}>{flagBoxes}</div>
      <Field label="Internal review note" hint="Never shown publicly. Clear it once Early Childhood Education confirms the row.">
        <textarea style={{ ...C.input, minHeight: 56, resize: 'vertical', background: '#fffdf5' }} value={schoolDraft.review_note} disabled={busy}
          onChange={e => setSchoolDraft(d => ({ ...d, review_note: e.target.value }))} />
      </Field>
    </>
  )

  // ── SCHOOL VIEW ──────────────────────────────────────────────────────────
  if (view.name === 'school') {
    const s = schools.find(x => x.id === view.id)
    if (!s) return shell(<>{crumb([root, { label: 'Not found' }])}<p style={{ fontSize: 13 }}>That school is no longer in the list.</p><button style={C.btn} onClick={() => go({ name: 'list' })}>Back to list</button></>)
    return shell(
      <>
        {crumb([root, { label: s.name }])}
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>{s.name}</h1>
        {banners}
        <div style={C.card}>
          {schoolFields}
          <div style={{ fontSize: 12, color: '#6b7280', margin: '12px 0' }}>
            Map pin: {hasPin(s) ? `set (${Number(s.lat).toFixed(4)}, ${Number(s.lng).toFixed(4)})` : 'not set. This school is skipped by the nearest-school search until the address is matched.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={C.btnPrimary} disabled={busy || !String(schoolDraft.name).trim()} onClick={async () => {
              const j = await act({ action: 'school_update', id: s.id, ...schoolDraft })
              if (j) setOk(j.school?.lat == null && schoolDraft.address ? 'Saved. The address could not be matched to a map pin.' : 'Saved. The change is live on the public page.')
            }}>Save</button>
            <button style={C.btn} disabled={busy} onClick={() => go({ name: 'list' })}>Back to list</button>
            <span style={{ flex: 1 }} />
            <button style={C.btnDanger} disabled={busy} onClick={async () => {
              if (!confirm(`Remove "${s.name}" from the directory? This cannot be undone.`)) return
              if (await act({ action: 'school_delete', id: s.id })) { go({ name: 'list' }); setOk(`Removed ${s.name}.`) }
            }}>Delete school</button>
          </div>
        </div>
      </>
    )
  }

  // ── NEW SCHOOL VIEW ──────────────────────────────────────────────────────
  if (view.name === 'new') {
    return shell(
      <>
        {crumb([root, { label: 'New school' }])}
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>New school</h1>
        {banners}
        <div style={C.card}>
          {schoolFields}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <button style={C.btnPrimary} disabled={busy || !String(schoolDraft.name).trim()} onClick={async () => {
              const nextOrder = schools.reduce((m, s) => Math.max(m, s.sort_order), 0) + 1
              const j = await act({ action: 'school_create', ...schoolDraft, sort_order: nextOrder })
              if (j?.school) {
                const s = j.school as School
                setSchoolDraft({
                  name: s.name, address: s.address ?? '', city: s.city ?? '', zip: s.zip ?? '', phone: s.phone ?? '',
                  early_head_start: s.early_head_start, head_start: s.head_start,
                  vpk_free_full_day: s.vpk_free_full_day, vpk_tuition_supported: s.vpk_tuition_supported,
                  review_note: s.review_note ?? '',
                })
                setView({ name: 'school', id: s.id })
                setOk('School added. It is live on the public page.')
              }
            }}>Add school</button>
            <button style={C.btn} disabled={busy} onClick={() => go({ name: 'list' })}>Cancel</button>
          </div>
        </div>
      </>
    )
  }

  // ── PROGRAMS LIST ────────────────────────────────────────────────────────
  if (view.name === 'programs') {
    return shell(
      <>
        {crumb([root, { label: 'Program explainers' }])}
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>Program explainers</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
          The plain-language text families see when they tap the (i) button on a program. Keep each one to a sentence or two.
        </p>
        {banners}
        <div style={C.card}>
          {programs.map((p, i) => (
            <div key={p.slug} style={{ ...C.row, borderTop: i === 0 ? 'none' : C.row.borderTop }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>{p.explainer || 'No explainer yet.'}</div>
              </div>
              <span style={p.slug === 'vpk-tuition-supported' ? TAG_TUITION : TAG_FREE}>{p.cost_label}</span>
              <span style={TAG_MUTED}>{p.ages_label}</span>
              <button style={C.btn} onClick={() => go({ name: 'program', slug: p.slug })}>Edit</button>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── PROGRAM VIEW ─────────────────────────────────────────────────────────
  if (view.name === 'program') {
    const p = programs.find(x => x.slug === view.slug)
    if (!p) return shell(<>{crumb([root, { label: 'Not found' }])}<p style={{ fontSize: 13 }}>That program is no longer in the list.</p><button style={C.btn} onClick={() => go({ name: 'programs' })}>Back</button></>)
    return shell(
      <>
        {crumb([root, { label: 'Program explainers', to: { name: 'programs' } }, { label: p.name }])}
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>{p.name}</h1>
        {banners}
        <div style={C.card}>
          <div style={C.grid}>
            <Field label="Program name *" hint="Shown on the filter button and at the top of the explainer.">
              <input style={C.input} value={programDraft.name} disabled={busy} onChange={e => setProgramDraft(d => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field label="Name on school cards *" hint="Short label, for example VPK.">
              <input style={C.input} value={programDraft.card_label} disabled={busy} onChange={e => setProgramDraft(d => ({ ...d, card_label: e.target.value }))} />
            </Field>
            <Field label="Cost label *" hint="For example Free, Free full day, Tuition-supported.">
              <input style={C.input} value={programDraft.cost_label} disabled={busy} onChange={e => setProgramDraft(d => ({ ...d, cost_label: e.target.value }))} />
            </Field>
            <Field label="Ages *" hint="For example Ages 3 to 4.">
              <input style={C.input} value={programDraft.ages_label} disabled={busy} onChange={e => setProgramDraft(d => ({ ...d, ages_label: e.target.value }))} />
            </Field>
          </div>
          <Field label="Explainer" hint="About 150 characters reads best on a phone.">
            <textarea style={{ ...C.input, minHeight: 72, resize: 'vertical' }} value={programDraft.explainer} disabled={busy}
              onChange={e => setProgramDraft(d => ({ ...d, explainer: e.target.value }))} />
          </Field>
          <div style={{ height: 10 }} />
          <Field label="Learn more link" hint="Optional. A browardschools.com page for this program. Hidden when blank.">
            <input style={C.input} value={programDraft.learn_more_url} disabled={busy} onChange={e => setProgramDraft(d => ({ ...d, learn_more_url: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button style={C.btnPrimary} disabled={busy} onClick={async () => {
              const j = await act({ action: 'program_update', slug: p.slug, ...programDraft })
              if (j) setOk('Saved. The change is live on the public page.')
            }}>Save</button>
            <button style={C.btn} disabled={busy} onClick={() => go({ name: 'programs' })}>Back</button>
          </div>
        </div>
      </>
    )
  }

  // ── CONTACT VIEW ─────────────────────────────────────────────────────────
  if (view.name === 'contact') {
    const live = !!(settings.contact_email || settings.contact_url)
    return shell(
      <>
        {crumb([root, { label: 'How to apply and contact' }])}
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px' }}>How to apply and contact</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 14px' }}>
          Shown in a banner above the school list. The contact button appears once an email address or link is added.
          The address is never printed on the page, only used when someone taps the button.
        </p>
        {banners}
        <div style={C.card}>
          <div style={{ marginBottom: 10 }}>
            <span style={live ? TAG_FREE : TAG_REVIEW}>{live ? 'Contact button is showing' : 'Contact button hidden: add an email or link'}</span>
          </div>
          <Field label="Note about applying" hint="Blank hides the whole banner when there is also no contact.">
            <textarea style={{ ...C.input, minHeight: 64, resize: 'vertical' }} value={settingsDraft.apply_note} disabled={busy}
              onChange={e => setSettingsDraft(d => ({ ...d, apply_note: e.target.value }))} />
          </Field>
          <div style={{ height: 10 }} />
          <div style={C.grid}>
            <Field label="Contact email" hint="One address, for example the department inbox.">
              <input style={C.input} value={settingsDraft.contact_email} disabled={busy} onChange={e => setSettingsDraft(d => ({ ...d, contact_email: e.target.value }))} />
            </Field>
            <Field label="Or contact link" hint="Used only when there is no email.">
              <input style={C.input} value={settingsDraft.contact_url} disabled={busy} onChange={e => setSettingsDraft(d => ({ ...d, contact_url: e.target.value }))} />
            </Field>
            <Field label="Button text">
              <input style={C.input} value={settingsDraft.contact_label} disabled={busy} onChange={e => setSettingsDraft(d => ({ ...d, contact_label: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button style={C.btnPrimary} disabled={busy} onClick={async () => {
              const j = await act({ action: 'settings_update', ...settingsDraft })
              if (j) setOk('Saved. The change is live on the public page.')
            }}>Save</button>
            <button style={C.btn} disabled={busy} onClick={() => go({ name: 'list' })}>Back to list</button>
          </div>
        </div>
      </>
    )
  }

  // ── LIST VIEW ────────────────────────────────────────────────────────────
  const chips: [string, string][] = [
    ['', 'All'],
    ...programs.map(p => [p.slug, p.name] as [string, string]),
    ['review', 'Needs review'],
    ['nopin', 'No map pin'],
  ]
  const shown = filtered.slice(0, limit)

  return shell(
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Early Childhood Programs</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
            Edit the schools, program explainers and contact banner shown in the Early Childhood Programs Directory widget.
            Changes go live on bcpsmarcomm.com immediately, no code push or deploy needed. Blank fields are hidden on the public card.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={C.btn} onClick={() => go({ name: 'programs' })}>Program explainers</button>
          <button style={C.btn} onClick={() => go({ name: 'contact' })}>How to apply and contact</button>
          <button style={C.btnPrimary} onClick={() => go({ name: 'new' })}>+ New school</button>
        </div>
      </div>

      {banners}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input style={{ ...C.input, flex: '1 1 260px', maxWidth: 420 }} placeholder={`Search ${schools.length} schools by name, address, city, ZIP or phone...`}
          aria-label="Search schools" value={query} onChange={e => { setQuery(e.target.value); setLimit(PAGE) }} />
        <select style={{ ...C.sel, flex: '0 1 200px' }} aria-label="Filter by city" value={city} onChange={e => { setCity(e.target.value); setLimit(PAGE) }}>
          <option value="">All cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Showing {Math.min(shown.length, filtered.length)} of {filtered.length}</span>
      </div>

      <div role="group" aria-label="Filter by program or status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {chips.map(([key, label]) => (
          <button key={key || 'all'} aria-pressed={chip === key}
            style={{ ...C.btn, fontWeight: 600, ...(chip === key ? { background: BLUE, borderColor: BLUE, color: '#fff' } : {}) }}
            onClick={() => { setChip(key); setLimit(PAGE) }}>
            {label} ({key === '' ? counts.all : counts[key] ?? 0})
          </button>
        ))}
      </div>

      <div style={{ ...C.card, padding: '4px 16px' }}>
        {shown.map((s, i) => (
          <div key={s.id} style={{ ...C.row, borderTop: i === 0 ? 'none' : C.row.borderTop }}>
            <div style={{ flex: '2 1 240px', minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, overflowWrap: 'anywhere' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>
                {[s.address, s.city, s.zip].filter(Boolean).join(', ') || 'No address'}
              </div>
            </div>
            <div style={{ flex: '2 1 240px', display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
              {programs.filter(p => s[FLAG[p.slug]]).map(p => (
                <span key={p.slug} style={p.slug === 'vpk-tuition-supported' ? TAG_TUITION : TAG_FREE}>{p.name}</span>
              ))}
              {FLAG_KEYS.every(k => !s[k]) && <span style={TAG_REVIEW}>No program</span>}
              {s.review_note && <span style={TAG_REVIEW} title={s.review_note}>Needs review</span>}
              {!hasPin(s) && <span style={TAG_MUTED}>No map pin</span>}
            </div>
            <button style={C.btn} onClick={() => go({ name: 'school', id: s.id })} aria-label={`Edit ${s.name}`}>Edit</button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 24, color: '#6b7280', textAlign: 'center', fontSize: 13 }}>
            {query || city || chip ? 'No schools match these filters.' : 'No schools to show.'}
          </div>
        )}
      </div>

      {filtered.length > shown.length && (
        <button style={C.btn} onClick={() => setLimit(l => l + PAGE)}>Show {Math.min(PAGE, filtered.length - shown.length)} more</button>
      )}
    </>
  )
}
