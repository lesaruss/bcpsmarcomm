import type { GuideAudio as Audio } from '@/lib/guides/types'

// An audio overview (Sean, 2026-11-05): a short narration beside the written
// steps, for anyone who would rather listen. Nothing renders until the
// recording exists, so a guide can be written first and voiced later.
export default function GuideAudio({ audio, label = 'Listen' }: { audio?: Audio; label?: string }) {
  if (!audio?.url) return null
  return (
    <div className="gaudio" role="group" aria-label={`${label}${audio.title ? `: ${audio.title}` : ''}`}>
      <span className="gaudio-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14v-3a9 9 0 0 1 18 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>
      </span>
      <span className="gaudio-text"><b>{label}</b>{audio.title && <span>{audio.title}</span>}</span>
      <audio controls preload="none" src={audio.url} />
    </div>
  )
}
