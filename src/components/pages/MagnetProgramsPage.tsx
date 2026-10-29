'use client'

// Admin editor for the Magnet Program Explorer widget (public embed at
// /embeds/magnet-program-explorer.html, API at /api/bcps/magnet-programs).
// Same conventions as the Charter School Directory editor
// (CharterSchoolsPage.tsx): inline per-row edit with a Save button that only
// enables once something changed, delete with confirm, and an add form at the
// bottom. The data is four linked tables, so it is split into tabs: Programs
// (with the schools that offer each one, and each school's pathways), Schools
// and Themes. Pathways/academies are edited one per line. Events (2026-10-29)
// holds the upcoming events the widget counts down to, and the School Choice
// window that switches the widget's School Choice banner on and off by date.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase'

interface Theme { slug: string; name: string; kind: 'magnet' | 'innovative'; description: string | null; sort_order: number }
interface School {
  loc_nbr: string; name: string; site_url: string | null; logo_url: string | null; address: string | null; city: string | null
  zip: string | null; grades: string | null; levels: string[]; region: string | null
  lat: number | null; lng: number | null; sort_order: number
}
interface Program { slug: string; theme_slug: string; name: string; grades_note: string | null; description: string | null; sort_order: number }
interface Offering { id: string; program_slug: string; school_loc: string; tracks: string[]; note: string | null; sort_order: number }
interface MagnetEvent {
  id: string; title: string; starts_at: string; all_day: boolean; location: string | null; url: string | null
  description: string | null; school_loc: string | null; featured: boolean
}
interface SchoolChoice { opens: string | null; closes: string | null; apply_url: string | null; message: string | null }

type Tab = 'programs' | 'schools' | 'themes' | 'events'
const LEVELS = ['Elementary', 'Middle', 'High']
const BLUE = '#1672A7'
const EMPTY_PROGRAM = { name: '', theme_slug: '', grades_note: '', description: '' }
const EMPTY_SCHOOL = { loc_nbr: '', name: '', grades: '', address: '', city: '', zip: '', site_url: '', levels: [] as string[] }
const EMPTY_THEME = { name: '', kind: 'magnet', description: '' }
const EMPTY_EVENT = { title: '', date: '', time: '', location: '', url: '', description: '', school_loc: '', featured: false }
const EMPTY_CHOICE: SchoolChoice = { opens: null, closes: null, apply_url: null, message: null }

// Event times are entered and shown in Eastern time, whatever the editor's own
// time zone, and stored as an instant.
const TZ = 'America/New_York'
function easternParts(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(/^24/, '00')
  return { date, time }
}
function easternToIso(date: string, time: string) {
  const t = time || '00:00'
  for (const off of ['-05:00', '-04:00']) {
    const d = new Date(`${date}T${t}:00${off}`)
    if (easternParts(d.toISOString()).time === t) return d.toISOString()
  }
  return new Date(`${date}T${t}:00-05:00`).toISOString()
}

const C = {
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 } as React.CSSProperties,
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%' } as React.CSSProperties,
  area: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', width: '100%', resize: 'vertical' } as React.CSSProperties,
  sel: { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', background: '#fff' } as React.CSSProperties,
  btn: { padding: '6px 12px', border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnPrimary: { padding: '6px 12px', border: `1px solid ${BLUE}`, background: BLUE, color: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  btnDanger: { padding: '5px 10px', border: '1px solid #fecaca', color: '#b91c1c', background: '#fff', borderRadius: 7, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' } as React.CSSProperties,
  sublabel: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9ca3af', marginBottom: 8 } as React.CSSProperties,
  tab: (on: boolean) => ({ padding: '8px 14px', border: 'none', borderBottom: `3px solid ${on ? BLUE : 'transparent'}`, background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: on ? BLUE : '#6b7280', fontFamily: 'inherit' }) as React.CSSProperties,
  row3: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 } as React.CSSProperties,
}

const lines = (v: string) => v.split('\n').map(s => s.trim()).filter(Boolean)

export default function MagnetProgramsPage() {
  const supabase = createClient()
  const [themes, setThemes] = useState<Theme[]>([])
  const [schools, setSchools] = useState<School[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [offerings, setOfferings] = useState<Offering[]>([])
  const [events, setEvents] = useState<MagnetEvent[]>([])
  const [choice, setChoice] = useState<SchoolChoice>(EMPTY_CHOICE)
  const [choiceEdit, setChoiceEdit] = useState<SchoolChoice | null>(null)
  const [newEvent, setNewEvent] = useState(EMPTY_EVENT)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<Tab>('programs')
  const [query, setQuery] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM)
  const [newSchool, setNewSchool] = useState(EMPTY_SCHOOL)
  const [newTheme, setNewTheme] = useState(EMPTY_THEME)
  const [addSchoolTo, setAddSchoolTo] = useState<Record<string, string>>({})
  // Pending edits keyed "kind:key" (e.g. "program:stem-museum", "offering:<id>").
  const [edits, setEdits] = useState<Record<string, any>>({})

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token || '', [supabase])

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch('/api/bcps/magnet-programs', { headers: { Authorization: `Bearer ${await token()}` } })
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Failed to load'); setLoading(false); return }
    setThemes(j.themes); setSchools(j.schools); setPrograms(j.programs); setOfferings(j.offerings)
    setEvents(j.events ?? []); setChoice(j.school_choice ?? EMPTY_CHOICE)
    setLoading(false)
  }, [token])

  useEffect(() => { load() }, [load])

  const act = useCallback(async (payload: any, editKey?: string) => {
    setBusy(true); setErr('')
    const r = await fetch('/api/bcps/magnet-programs', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json(); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Action failed'); return null }
    if (editKey) setEdits(prev => { const next = { ...prev }; delete next[editKey]; return next })
    await load(); return j
  }, [token, load])

  const setEdit = (k: string, field: string, value: any) =>
    setEdits(prev => ({ ...prev, [k]: { ...prev[k], [field]: value } }))
  const val = (k: string, row: any, field: string) => edits[k]?.[field] ?? (row[field] ?? '')
  // Tracks edit as newline text, saved as an array.
  const tracksVal = (o: Offering) => edits['offering:' + o.id]?.tracks ?? o.tracks.join('\n')

  const themeBySlug = useMemo(() => Object.fromEntries(themes.map(t => [t.slug, t])), [themes])
  const schoolByLoc = useMemo(() => Object.fromEntries(schools.map(s => [s.loc_nbr, s])), [schools])
  const offeringsFor = (slug: string) => offerings.filter(o => o.program_slug === slug)
    .sort((a, b) => (schoolByLoc[a.school_loc]?.name ?? '').localeCompare(schoolByLoc[b.school_loc]?.name ?? ''))
  const programCount = (loc: string) => offerings.filter(o => o.school_loc === loc).length
  const magnetThemes = themes.filter(t => t.kind === 'magnet')

  const q = query.trim().toLowerCase()
  const shownPrograms = programs.filter(p => !q || p.name.toLowerCase().includes(q) ||
    (themeBySlug[p.theme_slug]?.name ?? '').toLowerCase().includes(q) ||
    offeringsFor(p.slug).some(o => (schoolByLoc[o.school_loc]?.name ?? '').toLowerCase().includes(q)))
  const shownSchools = schools.filter(s => !q || s.name.toLowerCase().includes(q) || (s.city ?? '').toLowerCase().includes(q) || s.loc_nbr.includes(q))
  const shownThemes = themes.filter(t => !q || t.name.toLowerCase().includes(q))
  const shownEvents = events.filter(ev => !q || ev.title.toLowerCase().includes(q) || (ev.location ?? '').toLowerCase().includes(q))
  const choiceVal = choiceEdit ?? choice

  const switchTab = (t: Tab) => { setTab(t); setQuery(''); setShowNew(false) }

  if (loading) return <div style={{ padding: 32 }}>Loading Magnet Program Explorer content...</div>

  const total = { programs: programs.length, schools: schools.length, themes: themes.length, events: events.length }[tab]
  const shown = { programs: shownPrograms.length, schools: shownSchools.length, themes: shownThemes.length, events: shownEvents.length }[tab]
  const noun = { programs: 'program', schools: 'school', themes: 'theme', events: 'event' }[tab]
  // An event's Save sends its date and time as one starts_at.
  const eventPayload = (ev: MagnetEvent, e: any) => {
    const { date, time, ...rest } = e
    const cur = easternParts(ev.starts_at)
    const allDay = rest.all_day ?? ev.all_day
    return (date !== undefined || time !== undefined || rest.all_day !== undefined)
      ? { ...rest, starts_at: easternToIso(date ?? cur.date, allDay ? '' : (time ?? cur.time)) }
      : rest
  }

  return (
    <div style={{ padding: 32, maxWidth: 1100, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>Magnet Program Explorer</h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>
        Edit the programs, schools, themes and events shown in the Magnet Program Explorer widget. Changes here go live
        on bcpsmarcomm.com immediately, no code push or deploy needed.
      </p>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', marginBottom: 14 }} role="tablist">
        {(['programs', 'schools', 'themes', 'events'] as Tab[]).map(t => (
          <button key={t} role="tab" aria-selected={tab === t} style={C.tab(tab === t)} onClick={() => switchTab(t)}>
            {{ programs: `Programs (${programs.length})`, schools: `Schools (${schools.length})`, themes: `Themes (${themes.length})`, events: `Events & School Choice (${events.length})` }[t]}
          </button>
        ))}
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', fontSize: 13, margin: '12px 0' }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input style={{ ...C.input, maxWidth: 360 }} value={query} onChange={e => setQuery(e.target.value)}
          placeholder={{ programs: 'Search programs by name, theme, or school...', schools: 'Search schools by name, city, or location number...', themes: 'Search themes...', events: 'Search events...' }[tab]} />
        <span style={{ fontSize: 12, color: '#9ca3af' }}>Showing {shown} of {total}</span>
      </div>

      {/* PROGRAMS */}
      {tab === 'programs' && shownPrograms.map(p => {
        const k = 'program:' + p.slug
        const offs = offeringsFor(p.slug)
        const available = schools.filter(s => !offs.some(o => o.school_loc === s.loc_nbr))
        return (
          <div key={p.slug} style={C.card}>
            <div style={C.row3}>
              <input style={C.input} placeholder="Program name" disabled={busy}
                value={val(k, p, 'name')} onChange={e => setEdit(k, 'name', e.target.value)} />
              <select style={C.sel} disabled={busy} value={val(k, p, 'theme_slug')} onChange={e => setEdit(k, 'theme_slug', e.target.value)}>
                {magnetThemes.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <input style={C.input} placeholder="Grades note (e.g. Grades 6-8)" disabled={busy}
                value={val(k, p, 'grades_note')} onChange={e => setEdit(k, 'grades_note', e.target.value)} />
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={3} disabled={busy}
              placeholder="Description (leave blank to use the theme's description)"
              value={val(k, p, 'description')} onChange={e => setEdit(k, 'description', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={C.btn} disabled={busy || !edits[k]} onClick={() => act({ action: 'program_update', slug: p.slug, ...edits[k] }, k)}>Save</button>
              <button style={C.btnDanger} disabled={busy}
                onClick={() => { if (confirm(`Remove "${p.name}" and its ${offs.length} school link${offs.length === 1 ? '' : 's'}?`)) act({ action: 'program_delete', slug: p.slug }) }}>
                Delete
              </button>
            </div>

            <div style={C.sublabel}>Offered at {offs.length} school{offs.length === 1 ? '' : 's'}</div>
            {offs.map(o => {
              const ok = 'offering:' + o.id
              return (
                <div key={o.id} style={{ border: '1px solid #f3f4f6', background: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{schoolByLoc[o.school_loc]?.name ?? o.school_loc}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
                    <textarea style={C.area} rows={3} disabled={busy} placeholder="Pathways or academies at this school, one per line (optional)"
                      value={tracksVal(o)} onChange={e => setEdit(ok, 'tracks', e.target.value)} />
                    <textarea style={C.area} rows={3} disabled={busy} placeholder="Note shown for this school (optional)"
                      value={val(ok, o, 'note')} onChange={e => setEdit(ok, 'note', e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={C.btn} disabled={busy || !edits[ok]}
                      onClick={() => {
                        const e = edits[ok]
                        act({ action: 'offering_update', id: o.id, ...e, ...(e.tracks !== undefined ? { tracks: lines(e.tracks) } : {}) }, ok)
                      }}>Save</button>
                    <button style={C.btnDanger} disabled={busy}
                      onClick={() => { if (confirm(`Remove ${schoolByLoc[o.school_loc]?.name ?? 'this school'} from "${p.name}"?`)) act({ action: 'offering_delete', id: o.id }) }}>
                      Remove school
                    </button>
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ ...C.sel, minWidth: 260 }} disabled={busy} value={addSchoolTo[p.slug] ?? ''}
                onChange={e => setAddSchoolTo(prev => ({ ...prev, [p.slug]: e.target.value }))}>
                <option value="">Add a school to this program...</option>
                {available.map(s => <option key={s.loc_nbr} value={s.loc_nbr}>{s.name}</option>)}
              </select>
              <button style={C.btn} disabled={busy || !addSchoolTo[p.slug]}
                onClick={async () => {
                  await act({ action: 'offering_create', program_slug: p.slug, school_loc: addSchoolTo[p.slug], sort_order: offs.length + 1 })
                  setAddSchoolTo(prev => ({ ...prev, [p.slug]: '' }))
                }}>Add</button>
            </div>
          </div>
        )
      })}

      {/* SCHOOLS */}
      {tab === 'schools' && shownSchools.map(s => {
        const k = 'school:' + s.loc_nbr
        const levels: string[] = edits[k]?.levels ?? s.levels
        const n = programCount(s.loc_nbr)
        return (
          <div key={s.loc_nbr} style={C.card}>
            <div style={C.row3}>
              <input style={C.input} placeholder="School name" disabled={busy}
                value={val(k, s, 'name')} onChange={e => setEdit(k, 'name', e.target.value)} />
              <input style={C.input} placeholder="Grades label (e.g. Middle, Grades 6-12)" disabled={busy}
                value={val(k, s, 'grades')} onChange={e => setEdit(k, 'grades', e.target.value)} />
              <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>Location {s.loc_nbr} · in {n} program{n === 1 ? '' : 's'}</div>
            </div>
            <div style={C.row3}>
              <input style={C.input} placeholder="Street address" disabled={busy}
                value={val(k, s, 'address')} onChange={e => setEdit(k, 'address', e.target.value)} />
              <input style={C.input} placeholder="City" disabled={busy}
                value={val(k, s, 'city')} onChange={e => setEdit(k, 'city', e.target.value)} />
              <input style={C.input} placeholder="ZIP" disabled={busy}
                value={val(k, s, 'zip')} onChange={e => setEdit(k, 'zip', e.target.value)} />
            </div>
            <div style={{ ...C.row3, alignItems: 'center' }}>
              <input style={C.input} placeholder="Map latitude" inputMode="decimal" disabled={busy}
                value={val(k, s, 'lat')} onChange={e => setEdit(k, 'lat', e.target.value)} />
              <input style={C.input} placeholder="Map longitude" inputMode="decimal" disabled={busy}
                value={val(k, s, 'lng')} onChange={e => setEdit(k, 'lng', e.target.value)} />
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {s.lat == null || s.lng == null ? 'Not on the map yet. ' : ''}Filled from the address when it changes; type here only to move the pin.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              {val(k, s, 'logo_url')
                ? <img src={val(k, s, 'logo_url')} alt="" style={{ width: 36, height: 36, objectFit: 'contain', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff' }} />
                : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#EBF1F8', color: '#0E4E73', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{s.name.slice(0, 2).toUpperCase()}</div>}
              <input style={{ ...C.input, flex: 1 }} placeholder="Logo image URL (square works best; blank shows the school's initials)" disabled={busy}
                value={val(k, s, 'logo_url')} onChange={e => setEdit(k, 'logo_url', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...C.input, flex: 1, minWidth: 240 }} placeholder="School website URL" disabled={busy}
                value={val(k, s, 'site_url')} onChange={e => setEdit(k, 'site_url', e.target.value)} />
              <span style={{ fontSize: 12, color: '#6b7280' }}>Level filter:</span>
              {LEVELS.map(l => (
                <label key={l} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" disabled={busy} checked={levels.includes(l)}
                    onChange={e => setEdit(k, 'levels', e.target.checked ? [...levels, l] : levels.filter(x => x !== l))} /> {l}
                </label>
              ))}
              <button style={C.btn} disabled={busy || !edits[k]} onClick={() => act({ action: 'school_update', loc_nbr: s.loc_nbr, ...edits[k] }, k)}>Save</button>
              <button style={C.btnDanger} disabled={busy}
                onClick={() => { if (confirm(`Remove "${s.name}" and its ${n} program link${n === 1 ? '' : 's'}?`)) act({ action: 'school_delete', loc_nbr: s.loc_nbr }) }}>
                Delete
              </button>
            </div>
          </div>
        )
      })}

      {/* THEMES */}
      {tab === 'themes' && shownThemes.map(t => {
        const k = 'theme:' + t.slug
        const n = programs.filter(p => p.theme_slug === t.slug).length
        return (
          <div key={t.slug} style={C.card}>
            <div style={C.row3}>
              <input style={C.input} placeholder="Theme name" disabled={busy}
                value={val(k, t, 'name')} onChange={e => setEdit(k, 'name', e.target.value)} />
              <select style={C.sel} disabled={busy} value={val(k, t, 'kind')} onChange={e => setEdit(k, 'kind', e.target.value)}>
                <option value="magnet">Magnet theme</option>
                <option value="innovative">Innovative theme (listed in the footer)</option>
              </select>
              <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>{n} program{n === 1 ? '' : 's'}</div>
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={2} disabled={busy} placeholder="Description (used by programs that have none of their own)"
              value={val(k, t, 'description')} onChange={e => setEdit(k, 'description', e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={C.btn} disabled={busy || !edits[k]} onClick={() => act({ action: 'theme_update', slug: t.slug, ...edits[k] }, k)}>Save</button>
              <button style={C.btnDanger} disabled={busy || n > 0} title={n > 0 ? 'Move or delete its programs first' : undefined}
                onClick={() => { if (confirm(`Remove the theme "${t.name}"?`)) act({ action: 'theme_delete', slug: t.slug }) }}>
                Delete
              </button>
            </div>
          </div>
        )
      })}

      {/* EVENTS & SCHOOL CHOICE */}
      {tab === 'events' && (
        <div style={{ ...C.card, borderColor: '#bfd4e6' }}>
          <div style={C.sublabel}>School Choice window</div>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>
            Between these dates the widget shows a School Choice banner with the days left to apply. Outside them it is hidden.
            {' '}Preview it any time by adding <code>?preview=school-choice</code> to the widget address.
          </p>
          <div style={C.row3}>
            <label style={{ fontSize: 12 }}>Opens<input type="date" style={C.input} disabled={busy} value={choiceVal.opens ?? ''}
              onChange={e => setChoiceEdit({ ...choiceVal, opens: e.target.value || null })} /></label>
            <label style={{ fontSize: 12 }}>Closes<input type="date" style={C.input} disabled={busy} value={choiceVal.closes ?? ''}
              onChange={e => setChoiceEdit({ ...choiceVal, closes: e.target.value || null })} /></label>
            <div style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
              {choice.opens && choice.closes ? `Set: ${choice.opens} to ${choice.closes}` : 'Not set, so the banner is hidden.'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input style={C.input} placeholder="Banner message" disabled={busy} value={choiceVal.message ?? ''}
              onChange={e => setChoiceEdit({ ...choiceVal, message: e.target.value })} />
            <input style={C.input} placeholder="Apply link" disabled={busy} value={choiceVal.apply_url ?? ''}
              onChange={e => setChoiceEdit({ ...choiceVal, apply_url: e.target.value })} />
          </div>
          <button style={C.btn} disabled={busy || !choiceEdit}
            onClick={async () => { if (await act({ action: 'school_choice_update', ...choiceEdit })) setChoiceEdit(null) }}>Save</button>
        </div>
      )}
      {tab === 'events' && shownEvents.map(ev => {
        const k = 'event:' + ev.id
        const cur = easternParts(ev.starts_at)
        const allDay = edits[k]?.all_day ?? ev.all_day
        const past = new Date(ev.starts_at).getTime() < Date.now() - 864e5
        return (
          <div key={ev.id} style={{ ...C.card, opacity: past ? 0.6 : 1 }}>
            <div style={C.row3}>
              <input style={C.input} placeholder="Event title" disabled={busy}
                value={val(k, ev, 'title')} onChange={e => setEdit(k, 'title', e.target.value)} />
              <input type="date" style={C.input} disabled={busy} value={edits[k]?.date ?? cur.date} onChange={e => setEdit(k, 'date', e.target.value)} />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="time" style={C.input} disabled={busy || allDay} value={allDay ? '' : (edits[k]?.time ?? cur.time)} onChange={e => setEdit(k, 'time', e.target.value)} />
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" disabled={busy} checked={allDay} onChange={e => setEdit(k, 'all_day', e.target.checked)} /> All day
                </label>
              </div>
            </div>
            <div style={C.row3}>
              <input style={C.input} placeholder="Location (optional)" disabled={busy} value={val(k, ev, 'location')} onChange={e => setEdit(k, 'location', e.target.value)} />
              <input style={C.input} placeholder="Link for details or RSVP (optional)" disabled={busy} value={val(k, ev, 'url')} onChange={e => setEdit(k, 'url', e.target.value)} />
              <select style={C.sel} disabled={busy} value={val(k, ev, 'school_loc')} onChange={e => setEdit(k, 'school_loc', e.target.value)}>
                <option value="">District-wide event</option>
                {schools.map(sc => <option key={sc.loc_nbr} value={sc.loc_nbr}>At {sc.name}</option>)}
              </select>
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={2} disabled={busy} placeholder="Short description (optional)"
              value={val(k, ev, 'description')} onChange={e => setEdit(k, 'description', e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" disabled={busy} checked={edits[k]?.featured ?? ev.featured} onChange={e => setEdit(k, 'featured', e.target.checked)} />
                Featured: count down to it at the top of the widget
              </label>
              <span style={{ flex: 1 }} />
              {past && <span style={{ fontSize: 11, color: '#6b7280' }}>Past events are hidden from the widget.</span>}
              <button style={C.btn} disabled={busy || !edits[k]} onClick={() => act({ action: 'event_update', id: ev.id, ...eventPayload(ev, edits[k]) }, k)}>Save</button>
              <button style={C.btnDanger} disabled={busy} onClick={() => { if (confirm(`Remove "${ev.title}"?`)) act({ action: 'event_delete', id: ev.id }) }}>Delete</button>
            </div>
          </div>
        )
      })}

      {shown === 0 && (
        <div style={{ ...C.card, color: '#9ca3af', textAlign: 'center' }}>Nothing matches "{query}".</div>
      )}

      {/* ADD NEW */}
      <div style={{ ...C.card, background: '#f9fafb' }}>
        <div style={C.sublabel}>{showNew ? `New ${noun}` : ' '}</div>
        {!showNew && (
          <button style={{ ...C.btn, borderColor: BLUE, color: BLUE }} disabled={busy} onClick={() => setShowNew(true)}>
            + Add {noun}
          </button>
        )}
        {showNew && tab === 'events' && (
          <>
            <div style={C.row3}>
              <input style={C.input} placeholder="Event title *" value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} />
              <input type="date" style={C.input} aria-label="Date *" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
              <input type="time" style={C.input} aria-label="Time (blank = all day)" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} />
            </div>
            <div style={C.row3}>
              <input style={C.input} placeholder="Location" value={newEvent.location} onChange={e => setNewEvent({ ...newEvent, location: e.target.value })} />
              <input style={C.input} placeholder="Link for details or RSVP" value={newEvent.url} onChange={e => setNewEvent({ ...newEvent, url: e.target.value })} />
              <select style={C.sel} value={newEvent.school_loc} onChange={e => setNewEvent({ ...newEvent, school_loc: e.target.value })}>
                <option value="">District-wide event</option>
                {schools.map(sc => <option key={sc.loc_nbr} value={sc.loc_nbr}>At {sc.name}</option>)}
              </select>
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={2} placeholder="Short description" value={newEvent.description}
              onChange={e => setNewEvent({ ...newEvent, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={newEvent.featured} onChange={e => setNewEvent({ ...newEvent, featured: e.target.checked })} /> Featured
              </label>
              <button style={C.btnPrimary} disabled={busy || !newEvent.title || !newEvent.date}
                onClick={async () => {
                  const { date, time, ...rest } = newEvent
                  if (await act({ action: 'event_create', ...rest, all_day: !time, starts_at: easternToIso(date, time) })) { setNewEvent(EMPTY_EVENT); setShowNew(false) }
                }}>Add event</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewEvent(EMPTY_EVENT) }}>Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Times are Eastern. Leave the time blank for an all-day event. An event at a school also shows on that school&apos;s page.</p>
          </>
        )}
        {showNew && tab === 'programs' && (
          <>
            <div style={C.row3}>
              <input style={C.input} placeholder="Program name *" value={newProgram.name}
                onChange={e => setNewProgram({ ...newProgram, name: e.target.value })} />
              <select style={C.sel} value={newProgram.theme_slug} onChange={e => setNewProgram({ ...newProgram, theme_slug: e.target.value })}>
                <option value="">Theme *</option>
                {magnetThemes.map(t => <option key={t.slug} value={t.slug}>{t.name}</option>)}
              </select>
              <input style={C.input} placeholder="Grades note" value={newProgram.grades_note}
                onChange={e => setNewProgram({ ...newProgram, grades_note: e.target.value })} />
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={3} placeholder="Description" value={newProgram.description}
              onChange={e => setNewProgram({ ...newProgram, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={C.btnPrimary} disabled={busy || !newProgram.name || !newProgram.theme_slug}
                onClick={async () => {
                  if (await act({ action: 'program_create', ...newProgram, sort_order: programs.length + 1 })) { setNewProgram(EMPTY_PROGRAM); setShowNew(false) }
                }}>Add program</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewProgram(EMPTY_PROGRAM) }}>Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>Then add its schools from the program card. Programs with no schools are hidden from the widget.</p>
          </>
        )}
        {showNew && tab === 'schools' && (
          <>
            <div style={C.row3}>
              <input style={C.input} placeholder="Location number * (4 digits)" value={newSchool.loc_nbr}
                onChange={e => setNewSchool({ ...newSchool, loc_nbr: e.target.value })} />
              <input style={C.input} placeholder="Name (blank = district name)" value={newSchool.name}
                onChange={e => setNewSchool({ ...newSchool, name: e.target.value })} />
              <input style={C.input} placeholder="Grades label" value={newSchool.grades}
                onChange={e => setNewSchool({ ...newSchool, grades: e.target.value })} />
            </div>
            <div style={C.row3}>
              <input style={C.input} placeholder="Street address" value={newSchool.address}
                onChange={e => setNewSchool({ ...newSchool, address: e.target.value })} />
              <input style={C.input} placeholder="City" value={newSchool.city}
                onChange={e => setNewSchool({ ...newSchool, city: e.target.value })} />
              <input style={C.input} placeholder="ZIP" value={newSchool.zip}
                onChange={e => setNewSchool({ ...newSchool, zip: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input style={{ ...C.input, flex: 1, minWidth: 240 }} placeholder="Website (blank = district site URL)" value={newSchool.site_url}
                onChange={e => setNewSchool({ ...newSchool, site_url: e.target.value })} />
              {LEVELS.map(l => (
                <label key={l} style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={newSchool.levels.includes(l)}
                    onChange={e => setNewSchool({ ...newSchool, levels: e.target.checked ? [...newSchool.levels, l] : newSchool.levels.filter(x => x !== l) })} /> {l}
                </label>
              ))}
              <button style={C.btnPrimary} disabled={busy || !newSchool.loc_nbr}
                onClick={async () => {
                  if (await act({ action: 'school_create', ...newSchool })) { setNewSchool(EMPTY_SCHOOL); setShowNew(false) }
                }}>Add school</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewSchool(EMPTY_SCHOOL) }}>Cancel</button>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>The name, website and region fill in from the district school record when left blank. The map pin is placed from the address. Then add the school to its programs from the Programs tab.</p>
          </>
        )}
        {showNew && tab === 'themes' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 8 }}>
              <input style={C.input} placeholder="Theme name *" value={newTheme.name}
                onChange={e => setNewTheme({ ...newTheme, name: e.target.value })} />
              <select style={C.sel} value={newTheme.kind} onChange={e => setNewTheme({ ...newTheme, kind: e.target.value })}>
                <option value="magnet">Magnet theme</option>
                <option value="innovative">Innovative theme</option>
              </select>
            </div>
            <textarea style={{ ...C.area, marginBottom: 8 }} rows={2} placeholder="Description" value={newTheme.description}
              onChange={e => setNewTheme({ ...newTheme, description: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={C.btnPrimary} disabled={busy || !newTheme.name}
                onClick={async () => {
                  const base = newTheme.kind === 'innovative' ? 100 : 0
                  const order = base + themes.filter(t => t.kind === newTheme.kind).length + 1
                  if (await act({ action: 'theme_create', ...newTheme, sort_order: order })) { setNewTheme(EMPTY_THEME); setShowNew(false) }
                }}>Add theme</button>
              <button style={C.btn} onClick={() => { setShowNew(false); setNewTheme(EMPTY_THEME) }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
