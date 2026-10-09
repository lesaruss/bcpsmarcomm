'use client'

// Proud Points Submission App widget (Vanessa Deslandes + Rudy Carril,
// 2026-10-08). Replaces the Microsoft Form "School Proud Points for Website"
// and follows BannerWidget: WCM tabs (Submit, Ideas, My Submissions) and,
// for the District Web Team, a gold Review Queue and Schools tab.
//
// - A school without six points on record fills in all six; the form saves a
//   draft as they go and sends only when all six are complete.
// - A school with six picks the point to replace and fills in one. There is
//   no separate remove step.
// - Each point: data point, heading, caption, background photo + alt text,
//   with character counts and a live homepage preview.
// - Ideas: past points from the old form, by theme, labeled by school level.
// Rules and limits live in lib/proudPoints.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useBCPSShell } from '@/components/BCPSShell'
import { SAMPLE_SUPERADMIN_ID } from '@/components/Sidebar'
import {
  STAT_MAX, HEADING_MAX, CAPTION_MAX, POINT_COUNT, PHOTO_MIN_WIDTH, PHOTO_MIN_HEIGHT, PHOTO_MAX_BYTES,
  PHOTO_ALLOWED_MIME, PHOTO_RULES_PENDING, FIXED_REJECT_REASONS,
} from '@/lib/proudPoints'

const GUIDELINES_URL = 'https://www.browardschools.com/wcm-community/schools/standards-guidelines/website-guidelines/homepage/proud-points'
const GOLD = '#F4C436'
const GOLD_TEXT = '#5c4300'

type Tab = 'submit' | 'ideas' | 'mine' | 'review' | 'schools'
type Status = 'draft' | 'pending' | 'approved' | 'rejected'

interface FormPoint {
  stat: string
  heading: string
  caption: string
  alt_text: string
  photo_path: string | null
  photo_name: string | null
  photo_url: string | null
  photo_busy: boolean
  photo_error: string | null
  text_detected: boolean
}

interface CurrentPoint {
  slot: number
  source: 'app' | 'legacy'
  stat?: string
  heading?: string
  caption?: string
  text?: string
  photo_url?: string | null
}

interface SchoolState {
  school: { loc_no: string; name: string; level: string | null }
  mode: 'initial' | 'replace'
  has_six: boolean
  override: boolean | null
  current: CurrentPoint[]
  current_source: 'app' | 'legacy' | 'none'
  legacy_points: { text: string; submitted_at: string | null }[]
  legacy_count: number
  draft: { id: string; points: (Partial<FormPoint> & { slot: number })[]; updated_at: string } | null
  waiting: { id: string; kind: string; submitted_at: string; mine: boolean } | null
}

interface SavedPoint {
  slot: number
  stat: string
  heading: string
  caption: string
  alt_text: string
  photo_path: string | null
  photo_name: string | null
  photo_url?: string | null
  download_url?: string | null
  width?: number | null
  height?: number | null
  text_detected?: boolean
}

interface Submission {
  id: string
  kind: 'initial' | 'replace'
  status: Status
  school_name: string | null
  school_location_nbr: string
  points: SavedPoint[]
  replace_slot: number | null
  replaced_text: string | null
  rejection_reason: string | null
  submitted_at: string | null
  reviewed_at: string | null
  posted_at: string | null
  updated_at: string
  is_test: boolean
  wcm_email?: string | null
  posted_by_email?: string | null
}

interface Idea { id: string; theme: string; school_level: string; text: string; hidden: boolean }

const emptyPoint = (): FormPoint => ({
  stat: '', heading: '', caption: '', alt_text: '', photo_path: null, photo_name: null, photo_url: null,
  photo_busy: false, photo_error: null, text_detected: false,
})

const pointDone = (p: FormPoint) => !!(p.stat.trim() && p.heading.trim() && p.caption.trim() && p.photo_path && p.alt_text.trim())

const CHECKLIST = [
  { key: 'media_release', label: 'Every student pictured has a media release on file, and I have my administrator\'s approval to submit these photos.' },
  { key: 'faces_visible', label: 'No faces are blurred, erased, or covered. If a face should not appear, I chose a different photo.' },
  { key: 'final_ack', label: 'Each data point is accurate and current, and I can name its source if the web team asks.' },
] as const

function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length
  return <div style={{ fontSize: 11, marginTop: 3, textAlign: 'right', color: n >= max ? '#a13a2f' : 'var(--text-muted)' }}>{n}/{max} characters</div>
}

function StatusTag({ s, posted }: { s: Status; posted?: boolean }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    draft: { bg: '#eef2f6', fg: '#3c4a5a', label: 'Draft' },
    pending: { bg: '#fdf3e0', fg: '#8a5a00', label: 'Waiting for review' },
    approved: { bg: '#e6f4ea', fg: '#1e6b3a', label: 'Approved' },
    live: { bg: '#e0f2f1', fg: '#0f766e', label: 'Live on your site' },
    rejected: { bg: '#fbe9e7', fg: '#a13a2f', label: 'Not approved' },
  }
  const v = map[s === 'approved' && posted ? 'live' : s]
  return <span style={{ background: v.bg, color: v.fg, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{v.label}</span>
}

// The homepage band, approximately: six photo tiles with the data point,
// heading and caption over a darkened photo. The real layout is built by the
// District Web Team in Finalsite; this lets a WCM see length and photo choice.
type Tile = { slot: number; stat?: string; heading?: string; caption?: string; text?: string; photo_url?: string | null; highlight?: boolean }

// Styles are injected raw (dangerouslySetInnerHTML): React escapes quotes in
// <style> text on the server, which breaks hydration for content: and [attr="x"].
export function ProudPointsPreview({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="ppw-frame">
      <style dangerouslySetInnerHTML={{ __html: `
        .ppw-frame { container-type: inline-size; container-name: ppw; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: #fff; }
        .ppw-head { background: #0a3764; color: #fff; padding: 10px 14px; font-weight: 800; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
        .ppw-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 6px; background: #f3f5f8; }
        @container ppw (max-width: 620px) { .ppw-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @container ppw (max-width: 240px) { .ppw-grid { grid-template-columns: minmax(0, 1fr); } }
        .ppw-tile { position: relative; aspect-ratio: 4 / 3; min-width: 0; border-radius: 4px; overflow: hidden; background: #5b6b7d; color: #fff; display: flex; flex-direction: column; justify-content: flex-end; padding: 10px; text-align: center; }
        .ppw-tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
        .ppw-tile::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,25,45,.88), rgba(10,25,45,.35)); }
        .ppw-tile > div { position: relative; z-index: 1; min-width: 0; overflow-wrap: anywhere; }
        .ppw-stat { font-size: clamp(18px, 7cqw, 40px); font-weight: 900; line-height: 1; }
        .ppw-heading { font-size: clamp(11px, 2.3cqw, 15px); font-weight: 800; text-transform: uppercase; margin-top: 6px; line-height: 1.2; }
        .ppw-caption { font-size: clamp(10px, 1.9cqw, 13px); margin-top: 4px; line-height: 1.3; opacity: .95; }
        .ppw-legacy { font-size: clamp(10px, 1.9cqw, 13px); line-height: 1.3; }
        .ppw-hl { outline: 3px solid ${GOLD}; outline-offset: -3px; }
        .ppw-empty { color: #dfe6ee; font-size: 12px; }
      ` }} />
      <div className="ppw-head">Proud Points</div>
      <div className="ppw-grid">
        {tiles.map(t => {
          const empty = !t.stat && !t.heading && !t.caption && !t.text
          return (
            <div key={t.slot} className={`ppw-tile${t.highlight ? ' ppw-hl' : ''}`}>
              {t.photo_url && <img src={t.photo_url} alt="" />}
              <div>
                {empty ? <div className="ppw-empty">Point {t.slot}</div> : t.text ? (
                  <div className="ppw-legacy">{t.text}</div>
                ) : (
                  <>
                    {t.stat && <div className="ppw-stat">{t.stat}</div>}
                    {t.heading && <div className="ppw-heading">{t.heading}</div>}
                    {t.caption && <div className="ppw-caption">{t.caption}</div>}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// In the embed (/embed/proud-points) there is no bcpsmarcomm.com session: the
// person signed in with an emailed code and holds a signed token instead.
let embedToken: string | null = null
export function setProudPointsEmbedToken(t: string | null) { embedToken = t }

async function authedFetch(path: string, init?: RequestInit) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string>) }
  if (embedToken) {
    headers['X-Proud-Points-Token'] = embedToken
  } else {
    const token = (await createClient().auth.getSession()).data.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return fetch(path, { ...init, headers })
}

function readDims(file: File): Promise<{ w: number; h: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url) }
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url) }
    img.src = url
  })
}

export default function ProudPointsWidget({ embed = false }: { embed?: boolean } = {}) {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === 'undefined') return 'submit'
    const t = new URLSearchParams(window.location.search).get('tab')
    return t === 'mine' || t === 'ideas' || t === 'review' ? t : 'submit'
  })
  const { viewAs } = useBCPSShell()
  const previewingWcm = !!viewAs && viewAs.id !== SAMPLE_SUPERADMIN_ID
  const [role, setRole] = useState<'admin' | 'manager' | null>(null)
  const canReview = !previewingWcm && !!role

  // ---- School ----
  const [schools, setSchools] = useState<Array<{ loc_no: string; school_name: string }>>([])
  const [loc, setLoc] = useState('')
  const [st, setSt] = useState<SchoolState | null>(null)
  const [stLoading, setStLoading] = useState(false)

  // ---- First six ----
  const [points, setPoints] = useState<FormPoint[]>(() => Array.from({ length: POINT_COUNT }, emptyPoint))
  const [active, setActive] = useState(0)
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null)
  const [draftDirty, setDraftDirty] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)

  // ---- Replace one ----
  const [replaceSlot, setReplaceSlot] = useState<number | 'other' | null>(null)
  const [replacedText, setReplacedText] = useState('')
  const [one, setOne] = useState<FormPoint>(emptyPoint)

  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [previewWidth, setPreviewWidth] = useState<number | null>(null)

  // ---- Lists ----
  const [mine, setMine] = useState<Submission[]>([])
  const [mineLoading, setMineLoading] = useState(true)
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [canHide, setCanHide] = useState(false)
  const [themeFilter, setThemeFilter] = useState('All')
  const [levelFilter, setLevelFilter] = useState('All')
  const [ideaSearch, setIdeaSearch] = useState('')

  const loadMine = useCallback(async () => {
    setMineLoading(true)
    try { const r = await authedFetch('/api/proud-points/mine'); const d = await r.json(); setMine(d.submissions || []) } catch { /* best effort */ }
    setMineLoading(false)
  }, [])

  const loadIdeas = useCallback(async () => {
    try { const r = await authedFetch('/api/proud-points/ideas'); const d = await r.json(); setIdeas(d.ideas || []); setCanHide(!!d.can_hide) } catch { /* best effort */ }
  }, [])

  const loadState = useCallback(async (l: string, opts?: { keepForm?: boolean }) => {
    if (!l) { setSt(null); return }
    setStLoading(true)
    try {
      const r = await authedFetch(`/api/proud-points/state?loc=${encodeURIComponent(l)}`)
      const d = await r.json()
      if (!r.ok) { setNotice({ ok: false, text: d.error || 'Could not load this school.' }); setSt(null); return }
      setSt(d)
      if (!opts?.keepForm) {
        const fresh = Array.from({ length: POINT_COUNT }, emptyPoint)
        for (const p of d.draft?.points ?? []) {
          const i = (p.slot ?? 0) - 1
          if (i >= 0 && i < POINT_COUNT) fresh[i] = { ...emptyPoint(), ...p, photo_busy: false, photo_error: null, text_detected: false } as FormPoint
        }
        setPoints(fresh)
        setDraftSavedAt(d.draft?.updated_at ?? null)
        setDraftDirty(false)
        setOne(emptyPoint())
        setReplaceSlot(null)
        setReplacedText('')
        setChecks({})
        setActive(0)
      }
    } catch {
      setNotice({ ok: false, text: 'Could not load this school.' })
    } finally {
      setStLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMine()
    loadIdeas()
    ;(async () => {
      try {
        // The review tools need a bcpsmarcomm.com sign-in, so the embed never
        // asks for a reviewer role.
        const [sr, mr, ar] = await Promise.all([
          authedFetch('/api/proud-points/schools'), authedFetch('/api/proud-points/state'), embed ? null : authedFetch('/api/banner/admins'),
        ])
        const sd = await sr.json(); const md = await mr.json(); const ad = ar ? await ar.json() : {}
        setSchools(sd.schools || [])
        setRole(ad.my_role || null)
        const first = (md.my_schools || [])[0]
        if (first) { setLoc(first); loadState(first) }
      } catch { /* best effort */ }
    })()
  }, [loadMine, loadIdeas, loadState, embed])

  useEffect(() => {
    if (previewingWcm && (tab === 'review' || tab === 'schools')) setTab('submit')
  }, [previewingWcm, tab])

  // ---- Draft autosave (first six only) ----
  const pointsRef = useRef(points)
  pointsRef.current = points
  const saveDraft = useCallback(async (quiet = false) => {
    if (!loc) return
    setDraftBusy(true)
    try {
      const payload = pointsRef.current.map(({ photo_busy, photo_error, text_detected, photo_url, ...rest }) => rest)
      const r = await authedFetch('/api/proud-points/draft', { method: 'PUT', body: JSON.stringify({ loc, points: payload }) })
      const d = await r.json()
      if (!r.ok) { if (!quiet) setNotice({ ok: false, text: d.error || 'Could not save the draft.' }); return }
      setDraftSavedAt(d.saved_at)
      setDraftDirty(false)
      if (!quiet) setNotice({ ok: true, text: 'Draft saved. Come back any time to finish.' })
    } catch {
      if (!quiet) setNotice({ ok: false, text: 'Could not save the draft.' })
    } finally {
      setDraftBusy(false)
    }
  }, [loc])

  useEffect(() => {
    if (!draftDirty || st?.mode !== 'initial' || points.some(p => p.photo_busy)) return
    const t = setTimeout(() => { saveDraft(true) }, 1500)
    return () => clearTimeout(t)
  }, [draftDirty, points, st?.mode, saveDraft])

  const updatePoint = (i: number, patch: Partial<FormPoint>) => {
    setPoints(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
    setDraftDirty(true)
  }

  // ---- Photo attach: size check here for speed, then the server checks the
  // stored file (pixel size + content scan) and is the real gate. ----
  async function attachPhoto(file: File, set: (patch: Partial<FormPoint>) => void) {
    set({ photo_error: null })
    if (!PHOTO_ALLOWED_MIME[file.type]) { set({ photo_error: 'Use a PNG or JPG photo.' }); return }
    if (file.size > PHOTO_MAX_BYTES) { set({ photo_error: `Photo is over ${Math.round(PHOTO_MAX_BYTES / 1024 / 1024)}MB.` }); return }
    const dims = await readDims(file)
    if (dims && (dims.w < PHOTO_MIN_WIDTH || dims.h < PHOTO_MIN_HEIGHT)) {
      set({ photo_error: `This photo is ${dims.w} x ${dims.h}. It needs to be at least ${PHOTO_MIN_WIDTH} x ${PHOTO_MIN_HEIGHT} pixels.` })
      return
    }
    const localUrl = URL.createObjectURL(file)
    set({ photo_busy: true, photo_url: localUrl, photo_name: file.name, photo_path: null })
    try {
      const r1 = await authedFetch('/api/proud-points/upload-url', { method: 'POST', body: JSON.stringify({ file_name: file.name, mime_type: file.type, size: file.size }) })
      const slot = await r1.json()
      if (!r1.ok) throw new Error(slot.error || 'Could not start the upload.')
      const { error } = await createClient().storage.from('bcps-client').uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type })
      if (error) throw new Error('The upload did not finish. Please try again.')
      const r2 = await authedFetch('/api/proud-points/photo', { method: 'POST', body: JSON.stringify({ file_path: slot.path, mime_type: file.type }) })
      const v = await r2.json()
      if (!r2.ok || !v.ok) throw new Error(v.error || 'This photo was not accepted.')
      set({ photo_busy: false, photo_path: slot.path, text_detected: !!v.text_detected })
    } catch (e) {
      set({ photo_busy: false, photo_path: null, photo_url: null, photo_error: (e as Error).message })
    }
  }

  // ---- Send ----
  async function send() {
    if (!st) return
    setNotice(null)
    if (!CHECKLIST.every(c => checks[c.key])) { setNotice({ ok: false, text: 'Check every box in the checklist first.' }); return }
    const strip = ({ photo_busy, photo_error, text_detected, photo_url, ...rest }: FormPoint) => rest
    let body: Record<string, unknown>
    if (st.mode === 'initial') {
      const missing = points.findIndex(p => !pointDone(p))
      if (missing >= 0) { setActive(missing); setNotice({ ok: false, text: `Point ${missing + 1} is not finished yet. Your draft is saved.` }); return }
      body = { loc, kind: 'initial', points: points.map(strip) }
    } else {
      if (!replaceSlot) { setNotice({ ok: false, text: 'Choose which Proud Point this replaces.' }); return }
      if (replaceSlot === 'other' && !replacedText.trim()) { setNotice({ ok: false, text: 'Type the heading of the Proud Point this replaces.' }); return }
      if (!pointDone(one)) { setNotice({ ok: false, text: 'Fill in the data point, heading, caption, photo and photo description.' }); return }
      body = { loc, kind: 'replace', point: strip(one), replace_slot: replaceSlot === 'other' ? null : replaceSlot, replaced_text: replaceSlot === 'other' ? replacedText : undefined }
    }
    setSending(true)
    try {
      const r = await authedFetch('/api/proud-points/submit', { method: 'POST', body: JSON.stringify({ ...body, checklist_ack: checks }) })
      const d = await r.json()
      if (!r.ok) { setNotice({ ok: false, text: d.error || 'Could not send.' }); return }
      setNotice({ ok: true, text: `Sent to the District Web Team. You'll get an email when it is reviewed, and another when it is live.${d.test ? ' (Test build: marked as a test.)' : ''}` })
      await loadState(loc)
      loadMine()
    } catch {
      setNotice({ ok: false, text: 'Could not send. Please try again.' })
    } finally {
      setSending(false)
    }
  }

  async function discardDraft() {
    if (!loc || !confirm('Discard this draft? Everything you entered for these six points is removed.')) return
    await authedFetch(`/api/proud-points/draft?loc=${encodeURIComponent(loc)}`, { method: 'DELETE' })
    await loadState(loc)
    loadMine()
  }

  // Edit and resend a rejected submission: its points go back into the form.
  async function editAndResend(s: Submission) {
    setTab('submit')
    setLoc(s.school_location_nbr)
    await loadState(s.school_location_nbr)
    const fill = (p: SavedPoint): FormPoint => ({ ...emptyPoint(), stat: p.stat, heading: p.heading, caption: p.caption, alt_text: p.alt_text, photo_path: p.photo_path, photo_name: p.photo_name, photo_url: p.photo_url ?? null })
    if (s.kind === 'initial') {
      const fresh = Array.from({ length: POINT_COUNT }, emptyPoint)
      for (const p of s.points) if (p.slot >= 1 && p.slot <= POINT_COUNT) fresh[p.slot - 1] = fill(p)
      setPoints(fresh)
      setDraftDirty(true)
    } else if (s.points[0]) {
      setOne(fill(s.points[0]))
      if (s.replace_slot) setReplaceSlot(s.replace_slot)
      else { setReplaceSlot('other'); setReplacedText(s.replaced_text || '') }
    }
    setNotice({ ok: true, text: 'Your earlier submission is back in the form. Make the change and send it again.' })
  }

  async function continueDraft(s: Submission) {
    setTab('submit')
    setLoc(s.school_location_nbr)
    await loadState(s.school_location_nbr)
  }

  function applyIdea(text: string) {
    setTab('submit')
    const caption = text.length > CAPTION_MAX ? text.slice(0, CAPTION_MAX - 1).trimEnd() + '…' : text
    if (st?.mode === 'replace') setOne(p => ({ ...p, caption }))
    else updatePoint(active, { caption })
    setNotice({ ok: true, text: `Added to the caption${st?.mode === 'replace' ? '' : ` of point ${active + 1}`}. Make it your school's own: swap in your numbers and details.` })
  }

  // ---- Preview tiles ----
  const tiles: Tile[] = useMemo(() => {
    if (!st) return []
    if (st.mode === 'initial') {
      return points.map((p, i) => ({ slot: i + 1, stat: p.stat, heading: p.heading, caption: p.caption, photo_url: p.photo_url, highlight: i === active }))
    }
    const base: Tile[] = Array.from({ length: POINT_COUNT }, (_, i) => {
      const c = st.current.find(x => x.slot === i + 1)
      return c ? { slot: i + 1, stat: c.stat, heading: c.heading, caption: c.caption, text: c.text, photo_url: c.photo_url } : { slot: i + 1 }
    })
    if (typeof replaceSlot === 'number') {
      base[replaceSlot - 1] = { slot: replaceSlot, stat: one.stat, heading: one.heading, caption: one.caption, photo_url: one.photo_url, highlight: true }
    }
    return base
  }, [st, points, active, one, replaceSlot])

  const doneCount = points.filter(pointDone).length

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'submit', label: st?.mode === 'replace' ? 'Replace a Point' : 'Submit Proud Points' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'mine', label: 'My Submissions' },
  ]
  const internalTabs: Array<{ id: Tab; label: string }> = canReview ? [{ id: 'review', label: 'Review Queue' }, { id: 'schools', label: 'Schools' }] : []

  return (
    <div className="dash-panel">
      <div className="dash-panel-header"><h3>Proud Points</h3></div>

      {previewingWcm && (
        <div style={{ fontSize: 12, background: '#fffaeb', color: GOLD_TEXT, border: `1px solid ${GOLD}`, borderRadius: 6, padding: '8px 12px', marginBottom: 12 }}>
          <strong>Viewing as {viewAs!.roleLabel.replace(' (Sample)', '')}.</strong> You see what they see. Anything you send here is a real submission from your own account.
        </div>
      )}

      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 12, padding: '6px 12px' }}>{t.label}</button>
        ))}
        {internalTabs.length > 0 && (
          <>
            <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)', margin: '0 6px' }} />
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: GOLD_TEXT }}>District Web Team</span>
            {internalTabs.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="btn-outline"
                style={{ fontSize: 12, padding: '6px 12px', fontWeight: 700, background: tab === t.id ? GOLD : '#fffaeb', borderColor: GOLD, color: GOLD_TEXT }}>{t.label}</button>
            ))}
          </>
        )}
      </div>

      {notice && (
        <div role="status" style={{ fontSize: 12.5, marginBottom: 12, padding: '8px 12px', borderRadius: 6, background: notice.ok ? '#e6f4ea' : '#fbe9e7', color: notice.ok ? '#1e6b3a' : '#a13a2f' }}>
          {notice.text}
        </div>
      )}

      {tab === 'submit' && (
        <div>
          <style dangerouslySetInnerHTML={{ __html: `
            .ppw-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
            @media (min-width: 980px) { .ppw-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
            .ppw-slots { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
            @media (max-width: 480px) { .ppw-slots { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
            .ppw-slot { font-size: 12px; padding: 7px 4px; border-radius: 6px; border: 1px solid var(--border); background: #fff; cursor: pointer; font-weight: 700; }
            .ppw-slot[aria-pressed="true"] { border-color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue); }
            .ppw-field label { display: block; font-size: 12px; font-weight: 700; margin: 10px 0 4px; }
            .ppw-field .form-input { width: 100%; box-sizing: border-box; }
            .ppw-hint { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
          ` }} />

          <div className="ppw-field" style={{ maxWidth: 520 }}>
            <label htmlFor="ppw-school">School</label>
            <select id="ppw-school" className="form-select" style={{ width: '100%' }} value={loc}
              onChange={e => { setLoc(e.target.value); setNotice(null); loadState(e.target.value) }}>
              <option value="">Choose your school...</option>
              {schools.map(s => <option key={s.loc_no} value={s.loc_no}>{s.school_name}</option>)}
            </select>
          </div>

          {stLoading && <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>}

          {st && !stLoading && (
            <>
              <div style={{ margin: '14px 0', padding: '10px 14px', borderRadius: 6, background: '#f3f7fb', border: '1px solid #d6e4f0', fontSize: 13 }}>
                {st.mode === 'initial' ? (
                  <><strong>{st.school.name} needs all six Proud Points.</strong> Fill in each one; your work saves as a draft automatically, so you can come back and finish later. You can send once all six are complete.</>
                ) : (
                  <><strong>{st.school.name} already has six Proud Points.</strong> Choose the one you want to replace and fill in the new one. The web team swaps it on your homepage.</>
                )}
                {' '}<a href={GUIDELINES_URL} target="_blank" rel="noopener noreferrer">Proud Points guidelines<span className="sr-only"> (opens in a new tab)</span> ↗</a>
              </div>

              {st.waiting && (
                <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, background: '#fdf3e0', color: '#8a5a00', fontSize: 13 }}>
                  {st.waiting.mine ? 'Your' : 'A'} Proud Points submission for this school is waiting for review (sent {new Date(st.waiting.submitted_at).toLocaleDateString()}). You can send another once it is reviewed.
                </div>
              )}

              <div className="ppw-layout">
                <div>
                  {st.mode === 'initial' ? (
                    <>
                      <div className="ppw-slots" role="group" aria-label="Choose a point to edit">
                        {points.map((p, i) => (
                          <button key={i} type="button" className="ppw-slot" aria-pressed={active === i} onClick={() => setActive(i)}>
                            {pointDone(p) ? '✓ ' : ''}Point {i + 1}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                        {doneCount} of {POINT_COUNT} complete
                        {draftBusy ? ' · Saving...' : draftSavedAt ? ` · Draft saved ${new Date(draftSavedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </div>
                      <PointFields n={active + 1} p={points[active]} set={patch => updatePoint(active, patch)} onPhoto={f => attachPhoto(f, patch => updatePoint(active, patch))} />
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        {active > 0 && <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setActive(active - 1)}>Previous point</button>}
                        {active < POINT_COUNT - 1 && <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setActive(active + 1)}>Next point</button>}
                        <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} disabled={draftBusy} onClick={() => saveDraft(false)}>Save draft</button>
                        {st.draft && <button type="button" className="btn-outline" onClick={discardDraft} style={{ fontSize: 12, padding: '6px 12px', color: '#a13a2f' }}>Discard draft</button>}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="ppw-field">
                        <label htmlFor="ppw-replace">Which Proud Point does this replace?</label>
                        <select id="ppw-replace" className="form-select" style={{ width: '100%' }} value={replaceSlot ?? ''}
                          onChange={e => setReplaceSlot(e.target.value === '' ? null : e.target.value === 'other' ? 'other' : Number(e.target.value))}>
                          <option value="">Choose one...</option>
                          {st.current.map(c => (
                            <option key={c.slot} value={c.slot}>
                              {c.slot}. {(c.text || [c.stat, c.heading].filter(Boolean).join(' ') || '').slice(0, 80)}
                            </option>
                          ))}
                          <option value="other">{st.current.length ? 'A different one (type its heading)' : 'Type the heading of the point to replace'}</option>
                        </select>
                        {st.current_source === 'legacy' && (
                          <div className="ppw-hint">From the last full set your school sent on the old form. If your homepage shows something different, choose the last option and type it.</div>
                        )}
                      </div>
                      {replaceSlot === 'other' && (
                        <div className="ppw-field">
                          <label htmlFor="ppw-replaced">Heading of the Proud Point to replace</label>
                          <input id="ppw-replaced" className="form-input" value={replacedText} maxLength={200} onChange={e => setReplacedText(e.target.value)} placeholder="As it reads on your homepage" />
                        </div>
                      )}
                      <PointFields n={typeof replaceSlot === 'number' ? replaceSlot : 0} p={one} set={patch => setOne(o => ({ ...o, ...patch }))} onPhoto={f => attachPhoto(f, patch => setOne(o => ({ ...o, ...patch })))} />
                    </>
                  )}

                  <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', marginTop: 16 }}>
                    <legend style={{ fontSize: 12, fontWeight: 800, padding: '0 4px' }}>Before you send</legend>
                    {CHECKLIST.map(c => (
                      <label key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, margin: '6px 0' }}>
                        <input type="checkbox" checked={!!checks[c.key]} onChange={e => setChecks(x => ({ ...x, [c.key]: e.target.checked }))} style={{ marginTop: 2 }} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </fieldset>
                  <button type="button" className="btn-primary" style={{ marginTop: 12 }} disabled={sending || !!st.waiting || (st.mode === 'initial' && doneCount < POINT_COUNT)} onClick={send}>
                    {sending ? 'Sending...' : st.mode === 'initial' ? (doneCount < POINT_COUNT ? `Send (${doneCount} of ${POINT_COUNT} complete)` : 'Send all six for review') : 'Send for review'}
                  </button>

                  {st.legacy_points.length > 0 && (
                    <details style={{ marginTop: 18 }}>
                      <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>What your school sent on the old form ({st.legacy_points.length})</summary>
                      <ul style={{ fontSize: 12.5, paddingLeft: 18, marginTop: 8, lineHeight: 1.5 }}>
                        {st.legacy_points.map((l, i) => <li key={i}>{l.text}</li>)}
                      </ul>
                    </details>
                  )}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800 }}>Homepage preview</span>
                    {([['Desktop', null], ['Tablet', 600], ['Phone', 340]] as const).map(([label, w]) => (
                      <button key={label} type="button" className={previewWidth === w ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setPreviewWidth(w)}>{label}</button>
                    ))}
                  </div>
                  <div style={{ width: previewWidth ? `min(${previewWidth}px, 100%)` : '100%' }}>
                    <ProudPointsPreview tiles={tiles} />
                  </div>
                  <div className="ppw-hint" style={{ marginTop: 6 }}>An approximate look. The District Web Team builds the final version in Finalsite.</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'ideas' && (
        <IdeasGallery ideas={ideas} canHide={canHide && !previewingWcm} theme={themeFilter} setTheme={setThemeFilter} level={levelFilter} setLevel={setLevelFilter}
          search={ideaSearch} setSearch={setIdeaSearch} onUse={applyIdea} reload={loadIdeas} />
      )}

      {tab === 'mine' && (
        <div className="note-list">
          {mineLoading ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
            : mine.length === 0 ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>No Proud Points submissions yet.</div>
            : mine.map(m => (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>
                    {m.kind === 'initial' ? 'Six Proud Points' : `Replace point${m.replace_slot ? ` ${m.replace_slot}` : ''}: ${m.points[0]?.stat ?? ''} ${m.points[0]?.heading ?? ''}`}
                    {m.is_test && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: GOLD_TEXT }}>TEST</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {m.school_name} · {m.status === 'draft' ? `saved ${new Date(m.updated_at).toLocaleDateString()} (${m.points.filter(p => p.stat && p.heading && p.caption && p.photo_path).length} of ${POINT_COUNT} complete)` : `sent ${m.submitted_at ? new Date(m.submitted_at).toLocaleDateString() : ''}`}
                  </div>
                  {m.status === 'rejected' && m.rejection_reason && (
                    <div style={{ fontSize: 12, color: '#a13a2f', marginTop: 6, background: '#fbe9e7', padding: '6px 10px', borderRadius: 5 }}>{m.rejection_reason}</div>
                  )}
                </div>
                <StatusTag s={m.status} posted={!!m.posted_at} />
                {m.status === 'draft' && <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => continueDraft(m)}>Continue</button>}
                {m.status === 'rejected' && <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => editAndResend(m)}>Edit and resend</button>}
              </div>
            ))}
        </div>
      )}

      {tab === 'review' && canReview && <ReviewQueue />}
      {tab === 'schools' && canReview && <SchoolsPanel schools={schools} />}
    </div>
  )
}

function PointFields({ n, p, set, onPhoto }: { n: number; p: FormPoint; set: (patch: Partial<FormPoint>) => void; onPhoto: (f: File) => void }) {
  const id = `ppw-${n}`
  return (
    <div className="ppw-field">
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 4 }}>{n ? `Point ${n}` : 'New Proud Point'}</div>
      <label htmlFor={`${id}-stat`}>Data point</label>
      <input id={`${id}-stat`} className="form-input" value={p.stat} maxLength={STAT_MAX} placeholder="98%, #1, 20+, A" onChange={e => set({ stat: e.target.value })} />
      <div className="ppw-hint">The big number or grade. Keep it short and something you can back up.</div>
      <CharCount value={p.stat} max={STAT_MAX} />
      <label htmlFor={`${id}-heading`}>Heading</label>
      <input id={`${id}-heading`} className="form-input" value={p.heading} maxLength={HEADING_MAX} placeholder="Graduation rate" onChange={e => set({ heading: e.target.value })} />
      <CharCount value={p.heading} max={HEADING_MAX} />
      <label htmlFor={`${id}-caption`}>Caption</label>
      <textarea id={`${id}-caption`} className="form-input" rows={2} value={p.caption} maxLength={CAPTION_MAX} placeholder="One sentence on what it means for families." onChange={e => set({ caption: e.target.value })} />
      <CharCount value={p.caption} max={CAPTION_MAX} />
      <label htmlFor={`${id}-photo`}>Background photo</label>
      <input id={`${id}-photo`} type="file" accept="image/png,image/jpeg" disabled={p.photo_busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />
      <div className="ppw-hint">
        PNG or JPG, horizontal, at least {PHOTO_MIN_WIDTH} x {PHOTO_MIN_HEIGHT} pixels, no text or graphics on it.
        {PHOTO_RULES_PENDING && ' (Same rules as homepage banners until the District confirms the Proud Points size.)'}
      </div>
      {p.photo_busy && <div style={{ fontSize: 12, marginTop: 4 }}>Checking the photo...</div>}
      {p.photo_path && !p.photo_busy && <div style={{ fontSize: 12, marginTop: 4, color: '#1e6b3a' }}>✓ {p.photo_name || 'Photo'} accepted</div>}
      {p.text_detected && <div style={{ fontSize: 12, marginTop: 4, color: '#8a5a00' }}>Text was found in this photo. If it is a sign in the scene that is fine; the web team will check.</div>}
      {p.photo_error && <div role="alert" style={{ fontSize: 12, marginTop: 4, color: '#a13a2f' }}>{p.photo_error}</div>}
      <label htmlFor={`${id}-alt`}>Photo description (alt text)</label>
      <input id={`${id}-alt`} className="form-input" value={p.alt_text} maxLength={250} placeholder="Students in lab coats testing a water sample" onChange={e => set({ alt_text: e.target.value })} />
      <div className="ppw-hint">What the photo shows, for visitors who use a screen reader.</div>
    </div>
  )
}

function IdeasGallery({ ideas, canHide, theme, setTheme, level, setLevel, search, setSearch, onUse, reload }: {
  ideas: Idea[]; canHide: boolean; theme: string; setTheme: (s: string) => void; level: string; setLevel: (s: string) => void
  search: string; setSearch: (s: string) => void; onUse: (text: string) => void; reload: () => void
}) {
  const themes = useMemo(() => Array.from(new Set(ideas.map(i => i.theme))).sort(), [ideas])
  const levels = ['Elementary', 'Middle', 'High', 'Center or other']
  const q = search.trim().toLowerCase()
  const shown = ideas.filter(i => (level === 'All' || i.school_level === level) && (!q || i.text.toLowerCase().includes(q)))
  const groups = (theme === 'All' ? themes : [theme]).map(t => ({ t, items: shown.filter(i => i.theme === t) })).filter(g => g.items.length)

  async function toggleHide(i: Idea) {
    await authedFetch('/api/proud-points/ideas', { method: 'POST', body: JSON.stringify({ id: i.id, hidden: !i.hidden }) })
    reload()
  }

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        .ppi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
        @media (max-width: 1200px) { .ppi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 860px) { .ppi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 520px) { .ppi-grid { grid-template-columns: minmax(0, 1fr); } }
        .ppi-card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #fff; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .ppi-card p { margin: 0; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
        .ppi-tag { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: #eef2f6; color: #3c4a5a; }
      ` }} />
      <p style={{ fontSize: 13, margin: '0 0 12px' }}>
        Proud Points other schools have used, grouped by theme. School names are removed; each idea shows only the school level.
        Use one as a starting point, then make it yours with your own numbers.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }} role="group" aria-label="Theme">
        {['All', ...themes].map(t => {
          const n = t === 'All' ? shown.length : shown.filter(i => i.theme === t).length
          return <button key={t} type="button" aria-pressed={theme === t} className={theme === t ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => setTheme(t)}>{t} ({n})</button>
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <select aria-label="School level" className="form-select" value={level} onChange={e => setLevel(e.target.value)} style={{ minWidth: 0 }}>
          <option value="All">All school levels</option>
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input aria-label="Search ideas" className="form-input" placeholder="Search ideas" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: '1 1 200px', minWidth: 0 }} />
      </div>
      {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No ideas match.</div>}
      {groups.map(g => (
        <section key={g.t} style={{ marginBottom: 18 }}>
          <h4 style={{ fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--blue)' }}>{g.t}</h4>
          <div className="ppi-grid">
            {g.items.map(i => (
              <div key={i.id} className="ppi-card" style={i.hidden ? { opacity: 0.55 } : undefined}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span className="ppi-tag">{i.school_level}</span>
                  {i.hidden && <span className="ppi-tag" style={{ background: '#fbe9e7', color: '#a13a2f' }}>Hidden from WCMs</span>}
                </div>
                <p>{i.text}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button type="button" className="btn-outline" style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => onUse(i.text)}>Use as a starting point</button>
                  {canHide && <button type="button" className="btn-outline" style={{ fontSize: 11.5, padding: '4px 10px', borderColor: GOLD, color: GOLD_TEXT }} onClick={() => toggleHide(i)}>{i.hidden ? 'Show' : 'Hide'}</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

type ReviewFilter = 'pending' | 'ready' | 'posted' | 'rejected' | 'all'

function ReviewQueue() {
  const [rows, setRows] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<ReviewFilter>('pending')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const r = await authedFetch('/api/proud-points/review'); const d = await r.json(); if (r.ok) setRows(d.submissions || []) } catch { /* best effort */ }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const match = (r: Submission, f: ReviewFilter) =>
    f === 'all' ? true : f === 'pending' ? r.status === 'pending' : f === 'rejected' ? r.status === 'rejected'
      : f === 'ready' ? r.status === 'approved' && !r.posted_at : r.status === 'approved' && !!r.posted_at

  async function act(id: string, action: string, rejection_reason?: string) {
    setBusy(id)
    setMsg(null)
    try {
      const r = await authedFetch('/api/proud-points/review', { method: 'POST', body: JSON.stringify({ id, action, rejection_reason }) })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d.error || 'Could not save.' }); return }
      const done = action === 'approve' ? 'Approved' : action === 'reject' ? 'Rejected' : action === 'mark_posted' ? 'Marked posted' : 'Moved back to Ready to post'
      setMsg({ ok: !d.warning, text: `${done}.${d.emailed ? ' The WCM was emailed.' : ''}${d.warning ? ` ${d.warning}` : ''}` })
      setRejectingId(null); setReason(''); setOther('')
      load()
    } finally {
      setBusy(null)
    }
  }

  const list = rows.filter(r => match(r, filter))
  return (
    <div>
      {msg && <div role="status" style={{ fontSize: 12.5, marginBottom: 10, color: msg.ok ? '#1e6b3a' : '#a13a2f' }}>{msg.text}</div>}
      <div role="group" aria-label="Filter by status" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {([['pending', 'Pending'], ['ready', 'Ready to post'], ['posted', 'Posted'], ['rejected', 'Rejected'], ['all', 'All']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} className={filter === id ? 'btn-primary' : 'btn-outline'} style={{ fontSize: 11.5, padding: '4px 10px' }} onClick={() => setFilter(id)}>
            {label} ({rows.filter(r => match(r, id)).length})
          </button>
        ))}
      </div>
      {filter === 'ready' && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>Approved and not on the school site yet. Download the photos, post in Finalsite, then click Mark posted. The WCM gets an email that it is live.</div>}
      <div className="note-list">
        {loading ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Loading...</div>
          : list.length === 0 ? <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: 13 }}>Nothing here right now.</div>
          : list.map(r => (
            <div key={r.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 13.5 }}>
                    {r.school_name} · {r.kind === 'initial' ? 'Six Proud Points' : `Replace point${r.replace_slot ? ` ${r.replace_slot}` : ''}`}
                    {r.is_test && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, background: GOLD, color: GOLD_TEXT, padding: '2px 6px', borderRadius: 4 }}>TEST</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{r.wcm_email} · sent {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : ''}</div>
                </div>
                <StatusTag s={r.status} posted={!!r.posted_at} />
              </div>
              {r.kind === 'replace' && r.replaced_text && (
                <div style={{ fontSize: 12.5, marginTop: 8, background: '#f3f7fb', padding: '6px 10px', borderRadius: 5 }}><strong>Replaces:</strong> {r.replaced_text}</div>
              )}
              <div style={{ marginTop: 10, maxWidth: 760 }}>
                <ProudPointsPreview tiles={r.points.map(p => ({ slot: p.slot, stat: p.stat, heading: p.heading, caption: p.caption, photo_url: p.photo_url }))} />
              </div>
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Text, photo details and downloads</summary>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))', gap: 8, marginTop: 8 }}>
                  {r.points.map(p => (
                    <div key={p.slot} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, fontSize: 12, minWidth: 0, overflowWrap: 'anywhere' }}>
                      <div style={{ fontWeight: 800 }}>Point {p.slot}</div>
                      <div><strong>Data point:</strong> {p.stat}</div>
                      <div><strong>Heading:</strong> {p.heading}</div>
                      <div><strong>Caption:</strong> {p.caption}</div>
                      <div><strong>Alt text:</strong> {p.alt_text}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{p.width && p.height ? `${p.width} x ${p.height}` : ''}</div>
                      {p.text_detected && <div style={{ color: '#8a5a00' }}>Text detected in the photo. Check it is part of the scene.</div>}
                      {p.download_url && <a href={p.download_url} className="btn-outline" style={{ display: 'inline-flex', fontSize: 11.5, padding: '3px 8px', marginTop: 4, textDecoration: 'none', borderRadius: 6 }}>Download photo</a>}
                    </div>
                  ))}
                </div>
              </details>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 10 }}>
                {r.status === 'pending' && (
                  <>
                    <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} disabled={busy === r.id} onClick={() => act(r.id, 'approve')}>Approve</button>
                    {rejectingId === r.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 260px', minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select aria-label="Reason" className="form-select" value={reason} onChange={e => setReason(e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                            <option value="">Select a reason...</option>
                            {[...FIXED_REJECT_REASONS, 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} disabled={!reason || (reason === 'Other' && !other.trim()) || busy === r.id}
                            onClick={() => act(r.id, 'reject', reason === 'Other' ? `Other: ${other.trim()}` : reason)}>Send</button>
                        </div>
                        {reason === 'Other' && <input className="form-input" placeholder="Comment (required, sent to the WCM by email)" value={other} onChange={e => setOther(e.target.value)} style={{ fontSize: 12 }} />}
                      </div>
                    ) : (
                      <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => { setRejectingId(r.id); setReason(''); setOther('') }}>Reject...</button>
                    )}
                  </>
                )}
                {r.status === 'approved' && (r.posted_at ? (
                  <>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Posted {new Date(r.posted_at).toLocaleDateString()}{r.posted_by_email ? ` by ${r.posted_by_email}` : ''}</span>
                    <button type="button" className="btn-outline" style={{ fontSize: 11.5, padding: '4px 8px' }} disabled={busy === r.id} onClick={() => act(r.id, 'unmark_posted')}>Undo</button>
                  </>
                ) : (
                  <button type="button" className="btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} disabled={busy === r.id} onClick={() => act(r.id, 'mark_posted')}>
                    {busy === r.id ? 'Saving...' : 'Mark posted and email the WCM'}
                  </button>
                ))}
                {r.status === 'rejected' && r.rejection_reason && (
                  <div style={{ fontSize: 12, color: '#a13a2f', background: '#fbe9e7', padding: '6px 10px', borderRadius: 5 }}>{r.rejection_reason}</div>
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}

// Override for schools the old sheet gets wrong: some schools' last rows were
// never read, and some show six on their site with fewer on record.
function SchoolsPanel({ schools }: { schools: Array<{ loc_no: string; school_name: string }> }) {
  const [loc, setLoc] = useState('')
  const [info, setInfo] = useState<{ has_six: boolean; override: boolean | null; legacy_count: number; current_source: string } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load(l: string) {
    setInfo(null); setMsg(null)
    if (!l) return
    const r = await authedFetch(`/api/proud-points/state?loc=${encodeURIComponent(l)}`)
    const d = await r.json()
    if (r.ok) setInfo({ has_six: d.has_six, override: d.override, legacy_count: d.legacy_count, current_source: d.current_source })
  }
  async function set(has_six: boolean | null) {
    const r = await authedFetch('/api/proud-points/review', { method: 'POST', body: JSON.stringify({ action: 'set_school', loc, has_six }) })
    const d = await r.json()
    setMsg(r.ok ? 'Saved.' : d.error || 'Could not save.')
    load(loc)
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <p style={{ fontSize: 13, marginTop: 0 }}>
        Whether a school sends all six or replaces one comes from its record: approved submissions here, or the old form&apos;s spreadsheet.
        If a school&apos;s homepage already shows six but the record says otherwise (or the reverse), set it here.
      </p>
      <select aria-label="School" className="form-select" value={loc} onChange={e => { setLoc(e.target.value); load(e.target.value) }} style={{ width: '100%' }}>
        <option value="">Choose a school...</option>
        {schools.map(s => <option key={s.loc_no} value={s.loc_no}>{s.school_name}</option>)}
      </select>
      {info && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div>On record: {info.legacy_count} point{info.legacy_count === 1 ? '' : 's'} from the old form{info.current_source === 'app' ? ', plus approved submissions here' : ''}.</div>
          <div style={{ marginTop: 4 }}><strong>{info.has_six ? 'Replaces one at a time' : 'Needs all six'}</strong>{info.override !== null ? ' (set by the web team)' : ' (from the record)'}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => set(true)}>Has six: replace one at a time</button>
            <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => set(false)}>Needs all six</button>
            {info.override !== null && <button type="button" className="btn-outline" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => set(null)}>Use the record</button>}
          </div>
          {msg && <div role="status" style={{ fontSize: 12, marginTop: 8 }}>{msg}</div>}
        </div>
      )}
    </div>
  )
}
