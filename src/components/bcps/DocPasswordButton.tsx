'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// Password button (Sean, 2026-11-10) on an open guide, Playbook or doc, for
// admins. A guide has no Documents card (and a document a guide replaced is
// not listed), so the Access panel cannot reach it; this button can. Anyone
// with the password opens the page for 24 hours without signing in. The
// password is never shown again after saving. Data: /api/bcps/doc-password.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function DocPasswordButton({ slug, sharePath, onSaved }: { slug: string; sharePath: string; onSaved?: (message: string) => void }) {
  const [allowed, setAllowed] = useState(false)
  const [setAt, setSetAt] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/bcps/doc-password?slug=${encodeURIComponent(slug)}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    setAllowed(!!j.allowed)
    setSetAt(j.set_at ?? null)
  }
  useEffect(() => {
    load().catch(() => {})
    const { data } = supabaseClient.auth.onAuthStateChange((event) => { if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load().catch(() => {}) })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy])

  if (!allowed) return null

  const on = !!setAt
  const link = typeof window !== 'undefined' ? `${window.location.origin}${sharePath}` : sharePath
  const when = setAt ? new Date(setAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  const save = async (password: string | null) => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/bcps/doc-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ slug, password }),
      })
      const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!res.ok) throw new Error(j.error || 'Something went wrong.')
      setSetAt(j.set_at ?? null); setValue('')
      onSaved?.(password === null ? 'Password turned off. Only signed-in readers can open this page now.' : 'Password saved. Share the link and the password.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* the link stays selectable */ }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" className="wcm-hub2-card-btn" onClick={() => { setError(''); setOpen(true); load().catch(() => {}) }}>
        {on ? 'Password: on' : 'Password'}
      </button>
      {open && (
        <div className="dpw-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false) }}>
          <div className="dpw-panel" role="dialog" aria-modal="true" aria-labelledby="dpw-title">
            <div className="dpw-head">
              <h2 id="dpw-title">Password access</h2>
              <button type="button" className="dpw-x" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>&times;</button>
            </div>
            <p className="dpw-help">
              {on
                ? <>On since {when}. Anyone with the link and the password can open this page for 24 hours without signing in. Saving a new password, or turning it off, ends every open pass.</>
                : <>Off. Set a password to let someone without a BCPS MarComm account open this page for 24 hours. Signed-in readers are not affected.</>}
            </p>
            {error && <div className="dpw-error" role="alert">{error}</div>}
            <form onSubmit={(e) => { e.preventDefault(); if (value.length >= 8) save(value) }}>
              <label className="dpw-label" htmlFor="dpw-input">{on ? 'New password' : 'Password'}</label>
              <div className="dpw-row">
                <input id="dpw-input" type="password" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="8 or more characters" />
                <button type="submit" className="dpw-btn" disabled={busy || value.length < 8}>{busy ? 'Saving...' : on ? 'Change' : 'Turn on'}</button>
              </div>
            </form>
            <label className="dpw-label" htmlFor="dpw-link">Link to share</label>
            <div className="dpw-row">
              <input id="dpw-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className="dpw-btn ghost" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
            </div>
            <div className="dpw-actions">
              {on && <button type="button" className="dpw-btn danger" disabled={busy} onClick={() => save(null)}>Turn off</button>}
              <button type="button" className="dpw-btn ghost" disabled={busy} onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const CSS = `
.dpw-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.dpw-panel { background: #fff; border-radius: 10px; width: min(520px, 100%); padding: 24px 28px; font-family: 'Open Sans', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.dpw-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.dpw-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.dpw-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.dpw-help { font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.75); margin: 0 0 14px; }
.dpw-label { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.55); margin: 12px 0 6px; }
.dpw-row { display: flex; gap: 8px; flex-wrap: wrap; }
.dpw-row input { flex: 1; min-width: 200px; font: inherit; font-size: 13px; padding: 9px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
.dpw-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.dpw-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.dpw-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.dpw-btn.ghost { background: #fff; color: #0e4e73; }
.dpw-btn.danger { background: #fff; color: #b91c1c; border-color: #fecaca; }
.dpw-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) { .dpw-panel { padding: 18px 16px; } }
`
