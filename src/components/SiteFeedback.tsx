'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Site-wide "report an issue" launcher for bcpsmarcomm.com. Started as
// WcmPilotFeedback (July 16 Hot Lab, cert pages only). Expanded per V,
// 2026-07-29, to run on every page of the site, not just certification
// and WCM Department Registration: a single mount in the root layout
// replaces the three separate WcmPilotFeedback mounts (certification
// layout, wcm-registration page, wcm-registration/register page).
//
// Stays a single free-text issue field on purpose (no category dropdown,
// per V) but now auto-identifies the sender from their signed-in
// bcpsmarcomm.com account (name, department, email) via /api/bcps/my-identity,
// so they don't have to retype who they are. A "This isn't me" toggle
// reveals a manual email field for the edge case where the account
// context is wrong or broken. Pre-login pages (roster signup, briefs,
// login) have no session, so they just see a manual email field, same
// as before.
export default function SiteFeedback() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const [identity, setIdentity] = useState<{ full_name: string | null; department: string | null; email: string | null } | null>(null)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [notMe, setNotMe] = useState(false)
  const lastPrefill = useRef('')

  useEffect(() => {
    let cancelled = false
    async function loadIdentity() {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) { if (!cancelled) setIdentityChecked(true); return }
        const res = await fetch('/api/bcps/my-identity', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (cancelled) return
        if (json.identified) {
          setIdentity({ full_name: json.full_name, department: json.department, email: json.email })
        }
      } catch {
        /* fine, treat as anonymous */
      } finally {
        if (!cancelled) setIdentityChecked(true)
      }
    }
    loadIdentity()
    return () => { cancelled = true }
  }, [])

  // Other surfaces can open this panel instead of carrying their own
  // messaging widget: in-app callers dispatch a 'bcps:open-feedback' window
  // event (WCM Hub "Ask the District Web Team" card), and briefs served in
  // the same-origin brief-raw iframe post { type: 'bcps:open-feedback' } to
  // the parent (Certification Complete page, which replaced its orange Pulse
  // widget with this one, Sean 2026-09-29).
  // A caller may pass a starting message as the event detail ({ message }),
  // e.g. the director dashboard's "Book your meeting" and "Request an earlier
  // meeting" buttons (2026-10-01). The person can still edit it before sending.
  useEffect(() => {
    const openPanel = (prefill?: unknown) => {
      setOpen(true); setSent(false); setError('')
      if (typeof prefill === 'string' && prefill.trim()) {
        lastPrefill.current = prefill
        setMessage(prefill)
      } else {
        // A plain open drops an untouched prefill but keeps anything typed.
        setMessage((m) => (m === lastPrefill.current ? '' : m))
      }
    }
    const onEvent = (e: Event) => openPanel((e as CustomEvent<{ message?: string } | null>).detail?.message)
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data && e.data.type === 'bcps:open-feedback') openPanel()
    }
    window.addEventListener('bcps:open-feedback', onEvent)
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('bcps:open-feedback', onEvent)
      window.removeEventListener('message', onMessage)
    }
  }, [])

  const whoLabel = identity
    ? [identity.full_name, identity.department].filter(Boolean).join(' · ') || identity.email
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim()) return
    setSending(true)
    setError('')
    try {
      let token: string | undefined
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        token = data.session?.access_token
      } catch {
        /* fine, pre-login pages have no session yet */
      }

      const res = await fetch('/api/bcps/wcm-pilot-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: message.trim(),
          not_me: notMe,
          contact_email: contactEmail.trim() || undefined,
          page: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
      })
      if (!res.ok) throw new Error('Could not send your report. Please try again.')
      setSent(true)
      setMessage('')
      setContactEmail('')
      setNotMe(false)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSending(false)
    }
  }

  // Not inside embeds: they live on other sites (Finalsite), and the button
  // would float over the host page.
  if (pathname?.startsWith('/embed/')) return null

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSent(false); setError(''); setMessage((m) => (m === lastPrefill.current ? '' : m)) }}
        aria-label="Report an issue"
        title="Report an issue"
        style={styles.launcher}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.35 0-2.62-.32-3.73-.9L3 21l1.9-5.77A8.5 8.5 0 1 1 21 11.5Z" />
        </svg>
      </button>

      {open && (
        <div
          style={styles.overlay}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={styles.modal}>
            <button style={styles.close} aria-label="Close" onClick={() => setOpen(false)}>×</button>
            {sent ? (
              <>
                <h2 style={styles.title}>Thanks, got it.</h2>
                <p style={styles.body}>
                  Your report goes straight to Sean. No need to also post it in Teams or email.
                </p>
                <button style={styles.btn} onClick={() => setOpen(false)}>Close</button>
              </>
            ) : (
              <>
                <h2 style={styles.title}>Report an Issue</h2>
                <p style={styles.body}>
                  Hit a bug, a confusing step, or have a suggestion for bcpsmarcomm.com? Tell us here
                  instead of Teams or email.
                </p>
                <form onSubmit={handleSubmit}>
                  <label style={styles.label}>What&apos;s going on? *</label>
                  <textarea
                    style={styles.textarea}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Describe what happened..."
                    rows={4}
                    required
                  />

                  {identity && !notMe ? (
                    <div style={styles.whoBox}>
                      <div>
                        <span style={styles.whoLabelSmall}>Reporting as</span>
                        <div style={styles.whoValue}>{whoLabel}</div>
                      </div>
                      <button type="button" style={styles.linkBtn} onClick={() => setNotMe(true)}>
                        This isn&apos;t me
                      </button>
                    </div>
                  ) : (
                    <>
                      <label style={styles.label}>Your email {identityChecked && identity ? '' : '(optional, so we can follow up)'}</label>
                      <input
                        style={styles.input}
                        type="email"
                        value={contactEmail}
                        onChange={e => setContactEmail(e.target.value)}
                        placeholder="you@browardschools.com"
                      />
                      {identity && notMe && (
                        <button type="button" style={styles.linkBtn} onClick={() => setNotMe(false)}>
                          Actually, that is me
                        </button>
                      )}
                    </>
                  )}

                  {error && <p style={styles.error}>{error}</p>}
                  <button style={styles.btn} type="submit" disabled={sending}>
                    {sending ? 'Sending...' : 'Send Report'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  // Right side only, per Sean 2026-09-10 (Fieldy feedback): the left slide-up
  // menu obstructs this launcher and collides with "view as" testing.
  launcher: {
    position: 'fixed', right: 20, bottom: 20, zIndex: 60,
    width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0e4e73', color: '#fff', border: 'none', borderRadius: '50%',
    cursor: 'pointer', boxShadow: '0 6px 20px rgba(14,78,115,0.35)',
    outlineOffset: 3,
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(15,25,35,0.5)', zIndex: 70,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  modal: {
    position: 'relative', background: '#fff', borderRadius: 12, padding: '32px 28px',
    width: '100%', maxWidth: 420, boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
    fontFamily: "'Montserrat', sans-serif",
  },
  close: {
    position: 'absolute', top: 12, right: 14, background: 'none', border: 'none',
    fontSize: 22, lineHeight: 1, color: '#999', cursor: 'pointer',
  },
  title: { fontSize: 19, fontWeight: 800, color: '#0e4e73', margin: '0 0 8px' },
  body: { fontSize: 13.5, color: '#555', lineHeight: 1.55, margin: '0 0 18px' },
  label: { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#333', margin: '14px 0 4px' },
  textarea: {
    width: '100%', border: '1px solid #d0d9e3', borderRadius: 6, padding: '10px 12px',
    fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
  },
  input: {
    width: '100%', border: '1px solid #d0d9e3', borderRadius: 6, padding: '10px 12px',
    fontSize: 14, boxSizing: 'border-box',
  },
  whoBox: {
    marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 12, background: '#f5f8fa', border: '1px solid #d0d9e3', borderRadius: 6,
    padding: '10px 12px',
  },
  whoLabelSmall: { fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7a8894' },
  whoValue: { fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', marginTop: 2 },
  linkBtn: {
    background: 'none', border: 'none', padding: 0, color: '#1672A7', fontSize: 12.5,
    fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  error: { color: '#c0392b', fontSize: 13, margin: '10px 0 0' },
  btn: {
    marginTop: 18, padding: '11px 0', width: '100%', background: '#1672A7', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  },
}
