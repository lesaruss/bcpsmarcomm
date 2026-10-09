'use client'

// Proud Points embed, /embed/proud-points. Vanessa places it on the Finalsite
// WCM Community page like the other widgets and announces it in a
// communique.
//
// No sign-in (Sean, 2026-10-09): it opens straight to the form. On first
// visit the page asks /api/proud-points/embed/guest for a signed guest key,
// keeps it in localStorage and sends it as X-Proud-Points-Token, so this
// browser's drafts and submissions stay its own. The WCM types a name and a
// district email when sending (ProudPointsWidget, embed mode). Height is
// posted to the host page with the same 'bcps-widget-resize' message the
// other widgets use (WidgetsPage embed code), slug 'proud-points-embed'.

import { useEffect, useState } from 'react'
import ProudPointsWidget, { setProudPointsEmbedToken } from '@/components/bcps/ProudPointsWidget'

const KEY = 'bcps-proud-points-guest'
const SLUG = 'proud-points-embed'

export default function ProudPointsEmbed() {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem(KEY) } catch { /* storage blocked: a key for this visit only */ }
    if (saved) { setProudPointsEmbedToken(saved); setReady(true); return }
    fetch('/api/proud-points/embed/guest', { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (!d.token) throw new Error('no token')
        try { localStorage.setItem(KEY, d.token) } catch { /* this visit only */ }
        setProudPointsEmbedToken(d.token)
        setReady(true)
      })
      .catch(() => setFailed(true))
  }, [])

  // Tell the host page how tall the content is, whenever it changes. Measure
  // the content, not the document: the document is never shorter than the
  // frame, so it could grow the frame but never shrink it.
  useEffect(() => {
    if (window.parent === window) return
    const main = document.querySelector('main.ppe') as HTMLElement | null
    if (!main) return
    const post = () => window.parent.postMessage({ type: 'bcps-widget-resize', slug: SLUG, height: Math.ceil(main.getBoundingClientRect().height) }, '*')
    const ro = new ResizeObserver(post)
    ro.observe(main)
    post()
    return () => ro.disconnect()
  }, [])

  return (
    <main className="ppe">
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: #fff !important; }
        .ppe { padding: 16px; box-sizing: border-box; }
      ` }} />
      {failed ? (
        <p style={{ fontSize: 14, color: '#a13a2f' }}>The Proud Points form could not load. Please refresh the page.</p>
      ) : ready ? (
        <ProudPointsWidget embed />
      ) : (
        <p style={{ fontSize: 14, color: '#6b7280' }}>Loading Proud Points...</p>
      )}
    </main>
  )
}
