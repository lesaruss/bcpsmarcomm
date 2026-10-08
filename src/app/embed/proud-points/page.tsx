'use client'

// Proud Points embed, /embed/proud-points (Sean, 2026-10-08). Vanessa places
// it on the Finalsite WCM Community page and announces it in a communique, so
// any school WCM can submit without a bcpsmarcomm.com account.
//
// Sign-in is a six-digit code emailed to a @browardschools.com address
// (/api/proud-points/embed/code and /verify), traded for a signed token that
// this page keeps in localStorage for 30 days. Inside an iframe on another
// site, browsers block the bcpsmarcomm.com login cookie, so a token the page
// holds itself is what works. Height is posted to the host page with the
// same 'bcps-widget-resize' message the other widgets use (WidgetsPage embed
// code), slug 'proud-points-embed'.

import { useEffect, useState } from 'react'
import ProudPointsWidget, { setProudPointsEmbedToken } from '@/components/bcps/ProudPointsWidget'

const KEY = 'bcps-proud-points-embed'
const SLUG = 'proud-points-embed'

function readSaved(): { token: string; email: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v?.token && v?.email ? v : null
  } catch {
    return null
  }
}

export default function ProudPointsEmbed() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<{ token: string; email: string } | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    const saved = readSaved()
    if (saved) { setProudPointsEmbedToken(saved.token); setSession(saved) }
    setReady(true)
  }, [])

  // Tell the host page how tall this is, whenever it changes.
  useEffect(() => {
    if (window.parent === window) return
    // Measure the content, not the document: the document is never shorter
    // than the frame, so it could grow the frame but never shrink it.
    const main = document.querySelector('main.ppe') as HTMLElement | null
    if (!main) return
    const post = () => window.parent.postMessage({ type: 'bcps-widget-resize', slug: SLUG, height: Math.ceil(main.getBoundingClientRect().height) }, '*')
    const ro = new ResizeObserver(post)
    ro.observe(main)
    post()
    return () => ro.disconnect()
  }, [])

  async function sendCode() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/proud-points/embed/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d.error || 'Could not send a code.' }); return }
      setStep('code')
      setMsg({ ok: true, text: `We emailed a six-digit code to ${email.trim().toLowerCase()}. It works for ${d.minutes} minutes.` })
    } catch {
      setMsg({ ok: false, text: 'Could not send a code. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/proud-points/embed/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) })
      const d = await r.json()
      if (!r.ok) { setMsg({ ok: false, text: d.error || 'That code did not work.' }); return }
      const s = { token: d.token as string, email: d.email as string }
      try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private window: signed in for this visit only */ }
      setProudPointsEmbedToken(s.token)
      setSession(s)
    } catch {
      setMsg({ ok: false, text: 'Could not sign in. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  function signOut() {
    try { localStorage.removeItem(KEY) } catch { /* nothing saved */ }
    setProudPointsEmbedToken(null)
    setSession(null); setStep('email'); setCode(''); setMsg(null)
  }

  return (
    <main className="ppe">
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: #fff !important; }
        .ppe { padding: 16px; max-width: none; box-sizing: border-box; }
        .ppe-card { max-width: 520px; border: 1px solid var(--border); border-radius: 12px; padding: 22px; background: #fff; }
        .ppe-card h1 { font-size: 22px; margin: 0 0 6px; color: #0a3764; }
        .ppe-card p { font-size: 14px; color: #4b5563; margin: 0 0 14px; line-height: 1.5; }
        .ppe-card label { display: block; font-size: 13px; font-weight: 700; margin: 0 0 6px; }
        .ppe-card .form-input { width: 100%; box-sizing: border-box; font-size: 16px; }
        .ppe-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
        .ppe-who { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; color: #4b5563; margin-bottom: 10px; }
        .ppe-link { background: none; border: 0; padding: 0; color: var(--blue); text-decoration: underline; cursor: pointer; font: inherit; }
      ` }} />
      {!ready ? null : session ? (
        <>
          <div className="ppe-who">
            <span>Signed in as <strong>{session.email}</strong></span>
            <button type="button" className="ppe-link" onClick={signOut}>Sign out</button>
          </div>
          <ProudPointsWidget embed />
        </>
      ) : (
        <div className="ppe-card">
          <h1>School Proud Points</h1>
          <p>Submit the six highlights for your school homepage, or replace one. Sign in with your district email; we will send you a code. No password needed.</p>
          {step === 'email' ? (
            <form onSubmit={e => { e.preventDefault(); sendCode() }}>
              <label htmlFor="ppe-email">District email</label>
              <input id="ppe-email" className="form-input" type="email" autoComplete="email" placeholder="name@browardschools.com" value={email} onChange={e => setEmail(e.target.value)} required />
              <div className="ppe-row">
                <button type="submit" className="btn-primary" disabled={busy || !email.trim()} style={{ padding: '9px 16px' }}>{busy ? 'Sending...' : 'Email me a code'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={e => { e.preventDefault(); verify() }}>
              <label htmlFor="ppe-code">Six-digit code</label>
              <input id="ppe-code" className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
              <div className="ppe-row">
                <button type="submit" className="btn-primary" disabled={busy || code.length !== 6} style={{ padding: '9px 16px' }}>{busy ? 'Checking...' : 'Sign in'}</button>
                <button type="button" className="ppe-link" onClick={() => { setStep('email'); setCode(''); setMsg(null) }}>Use a different email</button>
                <button type="button" className="ppe-link" disabled={busy} onClick={sendCode}>Send a new code</button>
              </div>
            </form>
          )}
          {msg && <div role="status" style={{ marginTop: 12, fontSize: 13, color: msg.ok ? '#1e6b3a' : '#a13a2f' }}>{msg.text}</div>}
        </div>
      )}
    </main>
  )
}
