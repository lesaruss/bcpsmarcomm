'use client'

// components/ada/FixWalkthrough.tsx
//
// Built 2026-09-02 per Sean, direct instruction: a list of fixSteps read as
// a wall of text to a WCM who "just got started," and he asked for the
// experience to be a walkthrough - "even if it's a link that takes them
// to... a lightbox that they can walk through." This is that lightbox: one
// step per screen, Back/Next, a source link back to FinalSite's own
// documentation when the step content was sourced from one (see
// lib/ada-glossary.ts's sourceUrl field).
//
// Shared by ADAManagerPage, AdaScannerPage, and the school-portal scanner -
// all three render findings against the same glossary, so they get the
// same walkthrough for free instead of three separate implementations.

import { useState } from 'react'

const BLUE = '#1672A7'

export default function FixWalkthrough({
  title, steps, sourceUrl, onClose,
}: {
  title: string
  steps: string[]
  sourceUrl?: string
  onClose: () => void
}) {
  const [i, setI] = useState(0)
  const last = i === steps.length - 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`How to fix: ${title}`}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 14, maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: 3 }}>
              How to fix it, step {i + 1} of {steps.length}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111827' }}>{title}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', color: '#9ca3af', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: '22px', minHeight: 110 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
            {steps.map((_, si) => (
              <div key={si} style={{ height: 4, flex: 1, borderRadius: 999, background: si <= i ? BLUE : '#e5e7eb' }} />
            ))}
          </div>
          <div style={{ fontSize: 14, color: '#1f2937', lineHeight: 1.6 }}>{steps[i]}</div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#9ca3af' }}>
                Sourced from FinalSite&apos;s own help docs ↗
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setI(v => Math.max(0, v - 1))}
              disabled={i === 0}
              style={{
                padding: '8px 14px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff',
                color: i === 0 ? '#d1d5db' : '#374151', fontSize: 12.5, fontWeight: 700, cursor: i === 0 ? 'default' : 'pointer',
              }}
            >
              Back
            </button>
            <button
              onClick={() => (last ? onClose() : setI(v => v + 1))}
              style={{
                padding: '8px 16px', borderRadius: 8, border: `1px solid ${BLUE}`, background: BLUE,
                color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
