'use client'

// The dashboard tour (Sean, 2026-11-09, for Charlene Collins): Sean walks a
// dashboard part by part, the same pattern as the BrandDesk tour in HQ
// (lesaruss-hq components/branddesk/Tour.tsx). Each step opens its dashboard
// tab, finds the part of the page marked data-tour="<target>", scrolls to it,
// outlines it and plays Sean's line. Back / Step N of M / Next, Close or
// Escape to leave. Opened by pressing Take the tour, so the audio may play at
// once; if the browser blocks it, the words are on screen.
import { useEffect, useRef, useState } from 'react'

export interface TourStep {
  key: string
  // Dashboard tab the step is on (useHomeTab ids: overview, documents, ada...).
  tab: string
  // Extra query for the tab, e.g. a document slug on the Documents tab.
  doc?: string
  target?: string
  title: string
  say: string
  audio?: string
}

export const SEAN_PORTRAIT = '/brand/sean-square.webp'

export function SiteTour({ steps, onTab, onClose }: { steps: TourStep[]; onTab: (tab: string, doc?: string) => void; onClose: () => void }) {
  const [i, setI] = useState(0)
  const [muted, setMuted] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const tabRef = useRef(onTab)
  tabRef.current = onTab
  const s = steps[i]

  useEffect(() => {
    tabRef.current(s.tab, s.doc)
    let tries = 0
    let el: Element | null = null
    let timer: ReturnType<typeof setTimeout>
    const find = () => {
      el?.removeAttribute('data-tour-on')
      el = s.target ? document.querySelector(`[data-tour="${s.target}"]`) : null
      if (el) {
        el.setAttribute('data-tour-on', '1')
        const top = (el as HTMLElement).getBoundingClientRect().top + window.scrollY - 90
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
      } else if (s.target && tries++ < 30) timer = setTimeout(find, 150)
    }
    timer = setTimeout(find, 150)
    return () => { clearTimeout(timer); document.querySelectorAll('[data-tour-on]').forEach((n) => n.removeAttribute('data-tour-on')) }
  }, [s])

  useEffect(() => {
    const a = audio.current
    if (!a) return
    a.pause()
    if (s.audio && !muted) { a.src = s.audio; a.currentTime = 0; a.play().catch(() => { /* blocked: the words are on screen */ }) }
  }, [s, muted])
  useEffect(() => () => { audio.current?.pause() }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(steps.length - 1, n + 1))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [steps.length, onClose])

  const last = i === steps.length - 1
  return (
    <div className="stour" role="dialog" aria-label="Dashboard tour with Sean">
      <audio ref={audio} preload="none" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="stour-pic" src={SEAN_PORTRAIT} alt="" />
      <div className="stour-body">
        <p className="stour-kicker"><b>Sean</b> · {s.title}</p>
        <p className="stour-say" aria-live="polite">{s.say}</p>
        <div className="stour-bar">
          <button type="button" className="stour-btn ghost" onClick={() => setI(i - 1)} disabled={i === 0}>Back</button>
          <span className="stour-count">Step {i + 1} of {steps.length}</span>
          {last
            ? <button type="button" className="stour-btn go" onClick={onClose}>Done</button>
            : <button type="button" className="stour-btn go" onClick={() => setI(i + 1)}>Next</button>}
          {s.audio && <button type="button" className="stour-btn ghost" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>{muted ? 'Voice off' : 'Voice on'}</button>}
          <button type="button" className="stour-btn ghost stour-x" onClick={onClose}>Close tour</button>
        </div>
      </div>
    </div>
  )
}
