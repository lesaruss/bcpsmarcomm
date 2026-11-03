'use client'

import { useEffect, useState } from 'react'
import type { GuideStepper as Stepper } from '@/lib/guides/types'

// One step at a time (Sean, 2026-11-03, Patricia Sapp's Hot Lab feedback):
// the instructions on the left, an example on the right, Back and Next, and
// progress shown, like the certification course. Where a person left off is
// kept in this browser. If the section has a video, the reader chooses to
// watch it or follow the written steps.

type Saved = { step: number; done: number[] }

export default function GuideStepper({ storageKey, stepper }: { storageKey: string; stepper: Stepper }) {
  const { steps, videoUrl } = stepper
  const key = `bcps-guide-steps:${storageKey}`
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<number[]>([])
  const [mode, setMode] = useState<'steps' | 'video'>('steps')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key)
      if (raw) {
        const saved = JSON.parse(raw) as Saved
        if (Number.isInteger(saved.step) && saved.step >= 0 && saved.step < steps.length) setStep(saved.step)
        if (Array.isArray(saved.done)) setDone(saved.done.filter((n) => Number.isInteger(n) && n >= 0 && n < steps.length))
      }
    } catch { /* storage can be blocked; the stepper still works */ }
    setReady(true)
  }, [key, steps.length])

  useEffect(() => {
    if (!ready) return
    try { window.localStorage.setItem(key, JSON.stringify({ step, done } satisfies Saved)) } catch { /* ignore */ }
  }, [key, step, done, ready])

  const finished = done.length === steps.length
  const cur = steps[step]
  const markDone = (i: number) => setDone((d) => (d.includes(i) ? d : [...d, i]))
  const next = () => { markDone(step); if (step < steps.length - 1) setStep(step + 1) }
  const restart = () => { setDone([]); setStep(0) }
  const pct = Math.round((done.length / steps.length) * 100)

  return (
    <div className="gst">
      {videoUrl && (
        <div className="gst-choice" role="group" aria-label="How to follow this walkthrough">
          <button type="button" className={mode === 'video' ? 'on' : ''} aria-pressed={mode === 'video'} onClick={() => setMode('video')}>Watch the short video</button>
          <button type="button" className={mode === 'steps' ? 'on' : ''} aria-pressed={mode === 'steps'} onClick={() => setMode('steps')}>Follow the steps</button>
        </div>
      )}
      {videoUrl && mode === 'video' ? (
        <div className="gst-video">
          <iframe src={videoUrl} title="Audit walkthrough video" allowFullScreen loading="lazy" />
        </div>
      ) : (
        <>
          <div className="gst-progress">
            <div className="gst-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Walkthrough progress"><span style={{ width: `${pct}%` }} /></div>
            <span className="gst-count">{finished ? 'All steps done' : `Step ${step + 1} of ${steps.length}`}</span>
          </div>
          <ol className="gst-dots" aria-label="Steps">
            {steps.map((st, i) => (
              <li key={i}>
                <button type="button" className={`${i === step ? 'on' : ''}${done.includes(i) ? ' done' : ''}`} aria-current={i === step ? 'step' : undefined} aria-label={`Step ${i + 1}: ${st.title}${done.includes(i) ? ', done' : ''}`} onClick={() => setStep(i)}>
                  {done.includes(i) ? '✓' : i + 1}
                </button>
              </li>
            ))}
          </ol>
          <div className="gst-card" aria-live="polite">
            <div className="gst-text">
              <h4>Step {step + 1}. {cur.title}</h4>
              <div className="guide-body" dangerouslySetInnerHTML={{ __html: cur.html }} />
            </div>
            <div className="gst-example" role="group" aria-label={`Example for step ${step + 1}`}>
              <span className="gst-tag">Example</span>
              <div dangerouslySetInnerHTML={{ __html: cur.example }} />
            </div>
          </div>
          <div className="gst-nav">
            <button type="button" className="wcm-hub2-card-btn" disabled={step === 0} onClick={() => setStep(step - 1)}>&larr; Back</button>
            {step < steps.length - 1
              ? <button type="button" className="home-btn" onClick={next}>Next step &rarr;</button>
              : <button type="button" className="home-btn" onClick={() => markDone(step)}>{done.includes(step) ? 'Done' : 'I finished the last step'}</button>}
            {done.length > 0 && <button type="button" className="gst-restart" onClick={restart}>Start over</button>}
          </div>
          {finished && <p className="gst-finish">That is the whole walkthrough. Open Run Audit and start with your first red pin.</p>}
        </>
      )}
    </div>
  )
}
