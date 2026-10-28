'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Voice dictation for notes, the same recorder as Web Team Assignments
// (public/bcps-web-team-assignments.html): Record starts the browser's speech
// recognition, restarting between pauses until Stop; the cleaned transcript
// is added to the note box to edit before Add note. Chrome and Edge only.
type SpeechRec = {
  continuous: boolean; interimResults: boolean; lang: string
  onstart: (() => void) | null
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void; stop: () => void
}
export function useDictation(onText: (text: string) => void, doneHint = 'Transcript added. Edit below and click Add note.') {
  const [recording, setRecording] = useState(false)
  const [live, setLive] = useState('Press Record to transcribe speech into a note.')
  const [active, setActive] = useState(false)
  const st = useRef({ on: false, acc: '', committed: false, rec: null as SpeechRec | null })
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const msg = (m: string, a: boolean) => { setLive(m); setActive(a) }
  const clean = (t: string) => {
    t = t.trim(); if (!t) return ''
    t = t.charAt(0).toUpperCase() + t.slice(1)
    if (t.length > 15 && !/[.!?]$/.test(t)) t += '.'
    return t
  }
  const commit = useCallback(() => {
    const s = st.current
    if (s.committed) return
    s.committed = true
    const text = s.acc.trim(); s.acc = ''
    if (!text) { msg('Nothing captured. Try speaking again.', false); return }
    onTextRef.current(text)
    msg(doneHint, false)
  }, [doneHint])
  const SR = (): (new () => SpeechRec) | null => {
    if (typeof window === 'undefined') return null
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
  }
  const runSession = useCallback(() => {
    const Ctor = SR(); const s = st.current
    if (!s.on || !Ctor) return
    const rec = new Ctor(); s.rec = rec
    rec.continuous = false; rec.interimResults = true; rec.lang = 'en-US'
    rec.onstart = () => msg('Listening...', true)
    rec.onresult = e => {
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) { const c = clean(t); if (c) s.acc += (s.acc ? ' ' : '') + c } else interim += t
      }
      if (interim) msg(interim, true)
      else if (s.acc) msg(s.acc.length > 60 ? '...' + s.acc.slice(-57) : s.acc, true)
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        s.on = false; setRecording(false)
        msg('Mic blocked. Click the lock icon in your browser address bar and allow the microphone.', false)
      } else if (e.error === 'network') {
        s.on = false; setRecording(false)
        msg('Network error. The speech service is unavailable.', false)
      }
    }
    rec.onend = () => { if (s.on) setTimeout(runSession, 100); else commit() }
    try { rec.start() } catch { setTimeout(() => { if (s.on) runSession() }, 250) }
  }, [commit])
  const start = () => {
    if (!SR()) { msg('Voice input requires Chrome or Edge.', false); return }
    const s = st.current
    s.acc = ''; s.committed = false; s.on = true
    setRecording(true); msg('Starting...', true); runSession()
  }
  const stop = useCallback(() => {
    const s = st.current
    s.on = false; s.committed = false; setRecording(false)
    try { s.rec?.stop() } catch { /* already stopped */ }
    setTimeout(() => { if (!st.current.committed) commit() }, 500)
  }, [commit])
  // Stop listening when the drawer or dialog closes.
  useEffect(() => () => { if (st.current.on) { st.current.on = false; try { st.current.rec?.stop() } catch { /* closed */ } } }, [])
  return { recording, live, active, toggle: () => (recording ? stop() : start()) }
}

// The Record button and live line, shared by the MarComm request notes and the
// trackers' Add your input (V, 2026-10-28). Styles: DICTATION_CSS.
export function DictationBar({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  return (
    <div className="recorder-bar">
      <button type="button" className={`mic-btn${dictation.recording ? ' recording' : ''}`} onClick={dictation.toggle}>
        <span className="mic-dot" />{dictation.recording ? 'Stop' : 'Record'}
      </button>
      <span className={`live-transcript${dictation.active ? ' active' : ''}`} aria-live="polite">{dictation.live}</span>
    </div>
  )
}

export const DICTATION_CSS = `
.recorder-bar { display: flex; align-items: center; gap: 10px; width: 100%; }
.mic-btn { display: inline-flex; align-items: center; gap: 7px; font-family: inherit; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.10em; padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.12); background: #fff; color: rgba(26,26,26,0.6); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.mic-btn:hover { border-color: #1672A7; color: #1672A7; }
.mic-btn.recording { background: #fef2f2; border-color: #dc2626; color: #dc2626; animation: mca-pulse-border 1.2s ease-in-out infinite; }
.mic-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.mic-btn.recording .mic-dot { animation: mca-pulse-dot 1.2s ease-in-out infinite; }
@keyframes mca-pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
@keyframes mca-pulse-border { 0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.25)} 50%{box-shadow:0 0 0 4px rgba(220,38,38,0.10)} }
.live-transcript { flex: 1; min-width: 0; font-size: 11px; color: rgba(26,26,26,0.5); font-style: italic; line-height: 1.5; }
.live-transcript.active { color: #dc2626; font-style: normal; }
`
