'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { HOT_LAB_JOIN_URL } from '@/lib/guides/wcm-department'
import { inPlatformDocSrc, fullPageDocHref } from '@/lib/doc-frame'

// Every Department WCM Hot Lab in one place (Sean, 2026-11-10): tiles like the
// Meeting Notes page, each with a frame from its recording, 8 to a page, and
// just two controls, sort and search. Search looks at each session's topic
// summary and the full text of its notes. A session opens in a lightbox, so
// the WCM never leaves the guide (and the page keeps one header).

interface Session {
  slug: string
  title: string
  date: string
  summary: string
  doc_url: string
  thumb: string | null
  has_recording: boolean
  text: string
}

const PER_PAGE = 8

function parts(iso: string) {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return { weekday: '', month: '', day: '', long: iso }
  return {
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    day: String(d.getDate()),
    long: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
  }
}

// Hot Lab runs Tuesdays and Thursdays, 11:30 AM to 12:30 PM Eastern.
function nextSession(now = new Date()): string {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  for (let i = 0; i < 8; i++) {
    const d = new Date(et)
    d.setDate(et.getDate() + i)
    const dow = d.getDay()
    if (dow !== 2 && dow !== 4) continue
    if (i === 0 && (et.getHours() > 12 || (et.getHours() === 12 && et.getMinutes() >= 30))) continue
    const label = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    return `${label}, 11:30 AM`
  }
  return 'Tuesdays and Thursdays, 11:30 AM'
}

function snippet(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term)
  if (i < 0) return ''
  const start = Math.max(0, i - 70)
  const end = Math.min(text.length, i + term.length + 110)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>
}

// The tile's picture: a frame from the recording when SharePoint will draw
// one, otherwise a designed cover with the date, so no tile looks empty.
function Cover({ s }: { s: Session }) {
  const [failed, setFailed] = useState(false)
  const p = parts(s.date)
  return (
    <div className="hl-cover">
      <div className="hl-cover-art" aria-hidden="true">
        <span className="hl-cover-label">Hot Lab</span>
        <span className="hl-cover-month">{p.month}</span>
        <span className="hl-cover-day">{p.day}</span>
        <span className="hl-cover-weekday">{p.weekday}</span>
      </div>
      {s.thumb && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hl-cover-img" src={s.thumb} alt="" loading="lazy" referrerPolicy="no-referrer-when-downgrade" onError={() => setFailed(true)} onLoad={(e) => { if ((e.currentTarget.naturalWidth || 0) < 40) setFailed(true) }} />
      )}
      {s.has_recording && (
        <span className="hl-play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </span>
      )}
      <span className={`hl-pill${s.has_recording ? '' : ' hl-pill-notes'}`}>{s.has_recording ? 'Recording + notes' : 'Notes'}</span>
    </div>
  )
}

export default function HotLabLibrary() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<Session | null>(null)
  const topRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await createClient().auth.getSession()).data.session?.access_token
        const r = await fetch('/api/bcps/hot-labs', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const j = await r.json()
        if (!live) return
        if (!r.ok) setError(j.error || 'The Hot Lab sessions could not be loaded.')
        else setSessions(j.sessions ?? [])
      } catch {
        if (live) setError('The Hot Lab sessions could not be loaded.')
      }
    })()
    return () => { live = false }
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1), [query])

  const results = useMemo(() => {
    if (!sessions) return []
    const list = terms.length
      ? sessions.filter((s) => terms.every((t) => `${s.title} ${s.summary} ${s.text}`.toLowerCase().includes(t)))
      : sessions
    return [...list].sort((a, b) => (order === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
  }, [sessions, terms, order])

  useEffect(() => { setPage(1) }, [query, order])

  const pages = Math.max(1, Math.ceil(results.length / PER_PAGE))
  const current = Math.min(page, pages)
  const shown = results.slice((current - 1) * PER_PAGE, current * PER_PAGE)
  const latest = sessions?.length ? [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0].slug : null

  const goPage = (n: number) => {
    setPage(n)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section ref={topRef} className="home-dept guide-sec hl-lib" id="guide-help-sessions" aria-labelledby="hl-lib-title">
      <div className="hl-next">
        <div>
          <span className="hl-next-label">Next Hot Lab</span>
          <span className="hl-next-when">{nextSession()} on Teams</span>
        </div>
        <a className="guide-btn hl-next-btn" href={HOT_LAB_JOIN_URL} target="_blank" rel="noopener noreferrer">Join on Teams</a>
      </div>

      <h3 className="home-card-title" id="hl-lib-title">Every Hot Lab</h3>
      <p className="guide-body hl-lib-sub">Missed one, or looking for where something came up? Search a topic.</p>

      <div className="hl-lib-tools">
        <select className="hl-sort" value={order} onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')} aria-label="Sort Hot Lab sessions by date">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <div className="hl-search-wrap">
          <svg className="hl-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input
            type="search"
            className="hl-search"
            placeholder="Search a topic, like headings or PDF"
            aria-label="Search Hot Lab sessions by topic"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {error ? <p className="guide-body">{error}</p>
        : !sessions ? <p className="guide-body">Loading Hot Lab sessions.</p>
        : (
          <>
            {terms.length > 0 && (
              <p className="hl-lib-count" role="status">{results.length} session{results.length === 1 ? '' : 's'} mention &ldquo;{query.trim()}&rdquo;</p>
            )}
            {results.length === 0 ? (
              <p className="guide-body">No session mentions that yet. Try another word, <a href="#feedback" data-msg={`I looked for "${query.trim()}" in the Hot Lab sessions and could not find: `}>ask the District Web Team</a>, or bring it to the next Hot Lab.</p>
            ) : (
              <div className="hl-grid">
                {shown.map((s) => {
                  const p = parts(s.date)
                  const inSummary = terms.length > 0 && terms.every((t) => `${s.title} ${s.summary}`.toLowerCase().includes(t))
                  const missing = terms.find((t) => !`${s.title} ${s.summary}`.toLowerCase().includes(t))
                  const extra = terms.length && !inSummary && missing ? snippet(s.text, missing) : ''
                  return (
                    <button key={s.slug} type="button" className="hl-tile" onClick={() => setOpen(s)} aria-label={`Open the ${p.long} Hot Lab`}>
                      <Cover s={s} />
                      <span className="hl-tile-body">
                        <span className="hl-tile-date">
                          {p.long}
                          {s.slug === latest && <span className="hl-badge">Latest</span>}
                        </span>
                        <span className="hl-tile-sum"><Mark text={s.summary || s.title} terms={terms} /></span>
                        {extra && <span className="hl-tile-hit">In the notes: <Mark text={extra} terms={terms} /></span>}
                        <span className="hl-tile-open">Open the notes &rarr;</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
            {pages > 1 && (
              <nav className="hl-pager" aria-label="Hot Lab pages">
                <button type="button" className="hl-page" disabled={current === 1} onClick={() => goPage(current - 1)}>&larr; Previous</button>
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={`hl-page${n === current ? ' on' : ''}`} aria-current={n === current ? 'page' : undefined} onClick={() => goPage(n)}>{n}</button>
                ))}
                <button type="button" className="hl-page" disabled={current === pages} onClick={() => goPage(current + 1)}>Next &rarr;</button>
              </nav>
            )}
          </>
        )}

      {open && (
        <div className="hl-lightbox" onClick={() => setOpen(null)}>
          <div className="hl-lightbox-box" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.stopPropagation()}>
            <div className="hl-lightbox-head">
              <b>{parts(open.date).long}</b>
              <span className="hl-lightbox-actions">
                <a href={fullPageDocHref(open.doc_url)} target="_blank" rel="noopener noreferrer">Open full page &#8599;</a>
                <button type="button" onClick={() => setOpen(null)} aria-label="Close">&times;</button>
              </span>
            </div>
            <iframe className="hl-lightbox-frame" src={inPlatformDocSrc(open.doc_url, open.slug)} title={open.title} />
          </div>
        </div>
      )}
    </section>
  )
}
