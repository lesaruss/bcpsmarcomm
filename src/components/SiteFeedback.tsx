'use client'

import { useEffect, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const [identity, setIdentity] = useState<{ full_name: string | null; department: string | null; email: string | null } | null>(null)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [notMe, setNotMe] = useState(false)

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

  return (
    <>
      <button
        onClick={() => { setOpen(true); setSent(false); setError('') }}
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
  launcher: {
    position: 'fixed', left: 20, bottom: 20, zIndex: 60,
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
