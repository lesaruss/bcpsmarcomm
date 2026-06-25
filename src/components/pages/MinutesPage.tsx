'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function MinutesPage() {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function handleSubmit() {
    if (!title.trim() || !notes.trim()) return
    setSubmitting(true)
    const supabase = createClient()
    const slug = `bcps-minutes-${Date.now()}`
    await supabase.from('studio_projects').insert({
      slug,
      name: title.trim(),
      brand_slug: 'bcps',
      status: 'draft',
      scope: notes.trim().slice(0, 400),
    })
    setDone(title.trim())
    setCreating(false)
    setTitle('')
    setNotes('')
    setSubmitting(false)
  }

  // ── Confirmation state ───────────────────────────────────────────────────
  if (done) {
    return (
      <div style={{ padding: '48px 28px', maxWidth: '560px' }}>
        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '12px', padding: '24px',
          display: 'flex', gap: '14px', alignItems: 'flex-start',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '1px' }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803d', marginBottom: '4px' }}>Minutes submitted</div>
            <div style={{ fontSize: '13px', color: '#166534' }}>
              &ldquo;{done}&rdquo; has been saved as a draft. A brief will be published to Meeting Notes shortly.
            </div>
          </div>
        </div>
        <button
          onClick={() => setDone(null)}
          style={{
            marginTop: '20px', background: 'none', border: '1.5px solid #e5e7eb',
            borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', color: '#374151', fontFamily: 'inherit',
          }}
        >
          Create another
        </button>
      </div>
    )
  }

  // ── Landing prompt ───────────────────────────────────────────────────────
  if (!creating) {
    return (
      <div style={{ padding: '80px 28px', maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: 'rgba(22,114,167,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1672A7" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#111827', margin: '0 0 10px' }}>
          Minutes Console
        </h2>
        <p style={{ fontSize: '14px', color: '#6b7280', lineHeight: 1.65, margin: '0 0 32px' }}>
          Capture meeting notes, key decisions, and action items. Each submission becomes a published brief in Meeting Notes.
        </p>

        <button
          onClick={() => setCreating(true)}
          style={{
            background: '#1672A7', color: 'white', border: 'none', borderRadius: '8px',
            padding: '12px 28px', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create New Minutes
        </button>
      </div>
    )
  }

  // ── Creation form ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px', maxWidth: '660px' }}>
      <button
        onClick={() => { setCreating(false); setTitle(''); setNotes('') }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '6px',
          color: '#6b7280', fontSize: '13px', fontWeight: 600,
          fontFamily: 'inherit', marginBottom: '24px', padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>

      <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#111827', margin: '0 0 24px' }}>
        New Meeting Minutes
      </h2>

      <label style={{ display: 'block', marginBottom: '16px' }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: '#6b7280', display: 'block', marginBottom: '6px',
        }}>
          Meeting Title
        </span>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. WCM Hot Lab - June 16, 2026"
          style={{
            width: '100%', padding: '10px 14px',
            border: '1.5px solid #e5e7eb', borderRadius: '8px',
            fontSize: '14px', fontFamily: 'inherit', outline: 'none',
            color: '#111827', background: '#fff',
          }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: '24px' }}>
        <span style={{
          fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.12em', color: '#6b7280', display: 'block', marginBottom: '6px',
        }}>
          Notes / Transcript
        </span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Paste your meeting notes, transcript, or key discussion points here..."
          rows={14}
          style={{
            width: '100%', padding: '12px 14px',
            border: '1.5px solid #e5e7eb', borderRadius: '8px',
            fontSize: '13px', fontFamily: 'inherit', outline: 'none',
            color: '#111827', background: '#fff',
            resize: 'vertical', lineHeight: 1.65,
          }}
        />
      </label>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !notes.trim() || submitting}
          style={{
            background: (!title.trim() || !notes.trim() || submitting) ? '#9ca3af' : '#1672A7',
            color: 'white', border: 'none', borderRadius: '8px',
            padding: '11px 24px', fontSize: '13px', fontWeight: 700,
            cursor: (!title.trim() || !notes.trim() || submitting) ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {submitting ? 'Saving...' : 'Submit Minutes'}
        </button>
        <button
          onClick={() => { setCreating(false); setTitle(''); setNotes('') }}
          style={{
            background: 'none', border: '1.5px solid #e5e7eb', borderRadius: '8px',
            padding: '11px 20px', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', color: '#374151', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
