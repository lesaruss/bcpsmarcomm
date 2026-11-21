'use client'

// Shown in place of the sign-in redirect when a BCPS document has a password
// (Sean, 2026-11-10): "they could put the password in or they can log in."
// A correct password gives 24 hours of access to this one document.

import { useState } from 'react'

const BLUE = '#1672A7'
const BLUE_DARK = '#0e4e73'
const FONT = "'Open Sans', sans-serif"

export default function DocPasswordGate({ slug, title, loginHref }: { slug: string; title: string | null; loginHref: string }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) { setError('Enter the password for this document.'); return }
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/bcps/doc-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, password }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'That did not work. Try again, or sign in.'); setBusy(false); return }
      window.location.reload()
    } catch {
      setError('That did not work. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #f4f7fb 0%, #e7eef6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, padding: '24px 16px',
    }}>
      <main style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
            alt="Broward County Public Schools"
            style={{ height: 52, width: 'auto', marginBottom: 16 }}
          />
          <p style={{ color: '#5b6675', fontSize: 12, margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            BCPS MarComm
          </p>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(15,41,69,0.10)' }}>
          <h1 style={{ color: '#111827', fontSize: 19, fontWeight: 800, margin: '0 0 6px', lineHeight: 1.3 }}>
            {title || 'This document'}
          </h1>
          <p style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Enter the password you were given, or sign in with your BCPS MarComm account.
          </p>

          <form onSubmit={submit} noValidate>
            <label htmlFor="doc-password" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
              Password
            </label>
            <input
              id="doc-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'doc-password-error' : 'doc-password-note'}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 15, fontFamily: FONT,
                border: `1px solid ${error ? '#dc2626' : '#d1d5db'}`, borderRadius: 8, outlineColor: BLUE,
              }}
            />
            {error ? (
              <p id="doc-password-error" role="alert" style={{ color: '#b91c1c', fontSize: 13, margin: '8px 0 0' }}>{error}</p>
            ) : (
              <p id="doc-password-note" style={{ color: '#6b7280', fontSize: 12, margin: '8px 0 0' }}>
                Access lasts 24 hours on this device, then you enter it again.
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%', marginTop: 18, padding: '12px', borderRadius: 8, border: 'none', cursor: busy ? 'wait' : 'pointer',
                background: BLUE, color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: FONT, opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? 'Opening...' : 'Open document'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 16px', color: '#9ca3af', fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />or<span style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <a
            href={loginHref}
            style={{
              display: 'block', textAlign: 'center', padding: '11px', borderRadius: 8, border: `1px solid ${BLUE}`,
              color: BLUE_DARK, fontSize: 14, fontWeight: 700, textDecoration: 'none',
            }}
          >
            Sign in with your BCPS account
          </a>
        </div>
      </main>
    </div>
  )
}
