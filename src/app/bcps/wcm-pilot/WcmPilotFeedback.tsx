'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

// Floating feedback launcher for the WCM Pilot Program. Lets testers report
// bugs, confusing steps, or suggestions straight to Sean instead of Teams or
// email, per the July 16 Hot Lab for Department WCMs request. Self-contained
// (inline styles) so it renders consistently whether mounted on the public
// pre-login pilot pages or inside the certification course shell.
export default function WcmPilotFeedback() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

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
          contact_email: contactEmail.trim() || undefined,
          page: typeof window !== 'undefined' ? window.location.pathname : '',
        }),
      })
      if (!res.ok) throw new Error('Could not send feedback. Please try again.')
      setSent(true)
      setMessage('')
      setContactEmail('')
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
        aria-label="Send feedback"
        style={styles.launcher}
      >
        Feedback
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
                  Your feedback goes straight to Sean. No need to also post it in Teams or email.
                </p>
                <button style={styles.btn} onClick={() => setOpen(false)}>Close</button>
              </>
            ) : (
              <>
                <h2 style={styles.title}>Send Feedback</h2>
                <p style={styles.body}>
                  Hit a bug, a confusing step, or have a suggestion for the WCM Pilot Program? Tell us here
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
                  <label style={styles.label}>Your email (optional, so we can follow up)</label>
                  <input
                    style={styles.input}
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="you@browardschools.com"
                  />
                  {error && <p style={styles.error}>{error}</p>}
                  <button style={styles.btn} type="submit" disabled={sending}>
                    {sending ? 'Sending...' : 'Send Feedback'}
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
    position: 'fixed', right: 20, bottom: 20, zIndex: 60,
    background: '#0e4e73', color: '#fff', border: 'none', borderRadius: 999,
    padding: '12px 20px', fontWeight: 800, fontSize: 13.5, cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(14,78,115,0.35)', fontFamily: "'Montserrat', sans-serif",
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
  error: { color: '#c0392b', fontSize: 13, margin: '10px 0 0' },
  btn: {
    marginTop: 18, padding: '11px 0', width: '100%', background: '#1672A7', color: '#fff',
    border: 'none', borderRadius: 6, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
  },
}
