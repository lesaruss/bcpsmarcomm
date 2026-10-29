'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { GuideDef } from '@/lib/guides/types'

// A guide (Sean, 2026-10-29): one place per audience instead of several
// documents that overlap. Tabs down the left (the steps first, then
// reference), search across every section, and a way to leave feedback.
// The Overview is passed in, so each audience's can be drawn for the person
// reading it. The open tab is kept in the address (?gs=), so a link can
// open the guide on any tab.

export const GUIDE_OVERVIEW = 'overview'
const CHANGES = 'changes'

// Opens the site-wide message panel (SiteFeedback), as the dashboard does.
export function openFeedback(message?: string) {
  window.dispatchEvent(new CustomEvent('bcps:open-feedback', { detail: message ? { message } : null }))
}

export function fmtGuideDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts)
}

const textOf = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, ' ').trim()

type Hit = { tab: string; tabLabel: string; id: string | null; title: string; snippet: string }

function snippetOf(text: string, term: string): string {
  const i = text.toLowerCase().indexOf(term)
  if (i < 0) return text.slice(0, 160) + (text.length > 160 ? '...' : '')
  const start = Math.max(0, i - 70)
  return (start ? '...' : '') + text.slice(start, i + 110) + (i + 110 < text.length ? '...' : '')
}

function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <>{text.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p))}</>
}

export default function Guide({ def, overview, initialTab, actions }: {
  def: GuideDef
  overview: React.ReactNode
  initialTab?: string
  // Buttons for the header, such as a way back to a list.
  actions?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const topRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [target, setTarget] = useState<string | null>(null)

  const tabs = useMemo(() => [
    { id: GUIDE_OVERVIEW, label: 'Overview', step: undefined as number | undefined },
    ...def.tabs.map((t) => ({ id: t.id, label: t.label, step: t.step })),
    { id: CHANGES, label: 'What’s New', step: undefined as number | undefined },
  ], [def])
  const urlTab = search.get('gs')
  const active = urlTab && tabs.some((t) => t.id === urlTab) ? urlTab : (initialTab ?? GUIDE_OVERVIEW)
  const activeIndex = tabs.findIndex((t) => t.id === active)
  const tab = def.tabs.find((t) => t.id === active)

  const go = (id: string, section?: string) => {
    const p = new URLSearchParams(search.toString())
    p.set('gs', id)
    router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    setQuery('')
    if (section) setTarget(section)
    else topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Scroll to a section once its tab is on screen.
  useEffect(() => {
    if (!target) return
    const el = document.getElementById(`guide-${active}-${target}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('guide-flash')
    const t = setTimeout(() => el.classList.remove('guide-flash'), 1600)
    setTarget(null)
    return () => clearTimeout(t)
  }, [target, active])

  const index = useMemo(() => [
    ...def.tabs.flatMap((t) => t.sections.map((s) => ({ tab: t.id, tabLabel: t.label, id: s.id, title: s.title, text: textOf(s.html) }))),
    ...def.changes.map((c) => ({ tab: CHANGES, tabLabel: 'What’s New', id: null, title: fmtGuideDate(c.date), text: c.text })),
  ], [def])

  const terms = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  const hits: Hit[] = terms.length ? index
    .filter((e) => terms.every((t) => `${e.title} ${e.text}`.toLowerCase().includes(t)))
    .map((e) => ({ tab: e.tab, tabLabel: e.tabLabel, id: e.id, title: e.title, snippet: snippetOf(e.text, terms[0]) }))
    : []

  // Links in the content: #feedback opens the message panel, #guide/<tab>/<id>
  // moves within the guide, and dashboard links stay in the app.
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a')
    if (!a) return
    const href = a.getAttribute('href') || ''
    if (href === '#feedback') {
      e.preventDefault()
      openFeedback(a.dataset.msg)
    } else if (href.startsWith('#guide/')) {
      e.preventDefault()
      const [, t, s] = href.slice(1).split('/')
      go(t, s)
    } else if (href.startsWith('/?') && !a.target) {
      e.preventDefault()
      router.push(href, { scroll: true })
    }
  }

  const prev = activeIndex > 0 ? tabs[activeIndex - 1] : null
  const next = activeIndex < tabs.length - 1 ? tabs[activeIndex + 1] : null

  return (
    <div className="guide" ref={topRef} onClick={onClick}>
      <div className="guide-head">
        <div className="guide-head-text">
          <div className="home-hero-label">{def.eyebrow}</div>
          <h1 className="guide-title">{def.title}</h1>
          <p className="guide-meta">For {def.audience}. Updated {fmtGuideDate(def.updated)}, refreshed every Thursday.</p>
        </div>
        <div className="guide-head-tools">
          <input
            type="search"
            className="guide-search"
            placeholder="Search the guide"
            aria-label={`Search the ${def.title}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {actions}
        </div>
      </div>

      <div className="guide-cols">
        <nav className="guide-rail" aria-label={`${def.title} sections`}>
          <label className="guide-select">
            <span>Section</span>
            <select value={active} onChange={(e) => go(e.target.value)}>
              {tabs.map((t) => <option key={t.id} value={t.id}>{t.step ? `Step ${t.step}: ` : ''}{t.label}</option>)}
            </select>
          </label>
          <ul className="guide-tabs">
            {tabs.map((t) => (
              <li key={t.id}>
                <button type="button" className={`guide-tab${t.id === active && !terms.length ? ' on' : ''}`} aria-current={t.id === active ? 'page' : undefined} onClick={() => go(t.id)}>
                  {t.step && <span className="guide-step">Step {t.step}</span>}
                  {t.label}
                </button>
                {t.id === active && !terms.length && tab && (
                  <ul className="guide-subs">
                    {tab.sections.map((s) => (
                      <li key={s.id}><button type="button" onClick={() => go(t.id, s.id)}>{s.title}</button></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <button type="button" className="guide-rail-feedback" onClick={() => openFeedback(`Feedback on the ${def.title}: `)}>
            Leave feedback on this guide
          </button>
        </nav>

        <div className="guide-main">
          {terms.length ? (
            <div className="home-dept">
              <h2 className="guide-h2">{hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'} for “${query.trim()}”` : `Nothing found for “${query.trim()}”`}</h2>
              {hits.length ? (
                <ul className="guide-hits">
                  {hits.map((h, i) => (
                    <li key={`${h.tab}-${h.id ?? i}`}>
                      <button type="button" onClick={() => go(h.tab, h.id ?? undefined)}>
                        <span className="guide-hit-where">{h.tabLabel}</span>
                        <b><Highlight text={h.title} terms={terms} /></b>
                        <span className="guide-hit-text"><Highlight text={h.snippet} terms={terms} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="guide-body">Try another word, or <a href="#feedback" data-msg={`I searched the ${def.title} for "${query.trim()}" and could not find: `}>ask the District Web Team</a>. Your question helps us fill the gap.</p>
              )}
            </div>
          ) : active === GUIDE_OVERVIEW ? overview : active === CHANGES ? (
            <div className="home-dept">
              <h2 className="guide-h2">What&apos;s New</h2>
              <p className="guide-intro">Every change to this guide, newest first. A short email each Monday points here.</p>
              <ul className="guide-changes">
                {def.changes.map((c) => (
                  <li key={c.date}><b>{fmtGuideDate(c.date)}</b><span>{c.text}</span></li>
                ))}
              </ul>
            </div>
          ) : tab ? (
            <>
              <div className="guide-tab-head">
                {tab.step && <span className="guide-step">Step {tab.step} of {def.tabs.filter((t) => t.step).length}</span>}
                <h2 className="guide-h2">{tab.label}</h2>
                {tab.intro && <p className="guide-intro">{tab.intro}</p>}
              </div>
              {tab.sections.map((s) => (
                <section key={s.id} id={`guide-${tab.id}-${s.id}`} className="home-dept guide-sec">
                  <h3 className="home-card-title">{s.title}</h3>
                  <div className="guide-body" dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              ))}
            </>
          ) : null}

          {!terms.length && (
            <div className="guide-pager">
              {prev ? <button type="button" className="wcm-hub2-card-btn" onClick={() => go(prev.id)}>&larr; {prev.label}</button> : <span />}
              {next && <button type="button" className="home-btn" onClick={() => go(next.id)}>Next: {next.label} &rarr;</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
