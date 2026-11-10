'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Every Department WCM Hot Lab in one place (Sean, 2026-11-10): sortable by
// date and searchable by topic, so a WCM can find the session where something
// was covered instead of scrolling through notes. Search looks at each
// session's topic summary and the full text of its notes. Sessions open inside
// the platform (Documents tab), so the page keeps a single header.

interface Session {
  slug: string
  title: string
  date: string
  summary: string
  href: string
  has_recording: boolean
  text: string
}

// Quick picks for the topics WCMs ask about most. Each one just fills the
// search box, so it finds the same sessions typing the word would.
const TOPICS = ['Audit', 'Certification', 'Accessibility', 'Links', 'PDF', 'Headings', 'Images', 'Navigation', 'Widgets', 'Analytics', 'Directors']
const PAGE = 8

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function snippet(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term)
  if (i < 0) return ''
  const start = Math.max(0, i - 90)
  const end = Math.min(text.length, i + term.length + 140)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

function Mark({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}</>
}

export default function HotLabLibrary() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')
  const [shown, setShown] = useState(PAGE)

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

  const terms = useMemo(() => query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1), [query])

  const results = useMemo(() => {
    if (!sessions) return []
    const list = terms.length
      ? sessions.filter((s) => {
          const hay = `${s.title} ${s.summary} ${s.text}`.toLowerCase()
          return terms.every((t) => hay.includes(t))
        })
      : sessions
    return [...list].sort((a, b) => (order === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)))
  }, [sessions, terms, order])

  useEffect(() => { setShown(PAGE) }, [query, order])

  const open = (s: Session) => router.push(s.href, { scroll: true })

  return (
    <section className="home-dept guide-sec hl-lib" id="guide-help-sessions" aria-labelledby="hl-lib-title">
      <div className="hl-lib-head">
        <div>
          <h3 className="home-card-title" id="hl-lib-title">Every Hot Lab</h3>
          <p className="guide-body hl-lib-sub">Search for a topic to find the session where it came up. Every session has notes; most have a recording.</p>
        </div>
        <div className="hl-lib-tools">
          <input
            type="search"
            className="guide-search hl-lib-search"
            placeholder="Search a topic, like headings or PDF"
            aria-label="Search Hot Lab sessions by topic"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="hl-lib-sort">
            <span>Sort</span>
            <select value={order} onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')} aria-label="Sort sessions by date">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
      </div>

      <div className="hl-lib-topics" role="group" aria-label="Popular topics">
        {TOPICS.map((t) => {
          const on = query.trim().toLowerCase() === t.toLowerCase()
          return (
            <button key={t} type="button" className={`hl-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setQuery(on ? '' : t)}>{t}</button>
          )
        })}
      </div>

      {error ? <p className="guide-body">{error}</p>
        : !sessions ? <p className="guide-body">Loading Hot Lab sessions.</p>
        : (
          <>
            <p className="hl-lib-count" role="status">
              {terms.length
                ? `${results.length} session${results.length === 1 ? '' : 's'} mention “${query.trim()}”`
                : `${sessions.length} sessions, ${order === 'newest' ? 'newest' : 'oldest'} first`}
            </p>
            {results.length === 0 ? (
              <p className="guide-body">No session mentions that yet. Try another word, or <a href="#feedback" data-msg={`I looked for "${query.trim()}" in the Hot Lab sessions and could not find: `}>ask the District Web Team</a>, or bring it to the next Hot Lab.</p>
            ) : (
              <ul className="hl-list">
                {results.slice(0, shown).map((s, i) => {
                  const inSummary = terms.length && terms.every((t) => `${s.title} ${s.summary}`.toLowerCase().includes(t))
                  const extra = terms.length && !inSummary ? snippet(s.text, terms.find((t) => !`${s.title} ${s.summary}`.toLowerCase().includes(t)) ?? terms[0]) : ''
                  return (
                    <li key={s.slug} className="hl-item">
                      <button type="button" className="hl-item-btn" onClick={() => open(s)}>
                        <span className="hl-item-date">
                          {longDate(s.date)}
                          {!terms.length && order === 'newest' && i === 0 && <span className="hl-badge">Latest</span>}
                          {s.has_recording && <span className="hl-badge hl-badge-rec">Recording</span>}
                        </span>
                        <span className="hl-item-sum"><Mark text={s.summary || s.title} terms={terms} /></span>
                        {extra && <span className="hl-item-hit">In the notes: <Mark text={extra} terms={terms} /></span>}
                        <span className="hl-item-open">Open the notes &rarr;</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {results.length > shown && (
              <button type="button" className="wcm-hub2-card-btn hl-more" onClick={() => setShown(results.length)}>
                Show all {results.length} sessions
              </button>
            )}
          </>
        )}
    </section>
  )
}
