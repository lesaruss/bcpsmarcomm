'use client'

// Start here (Sean, 2026-11-10): a short video at the top of a guide's
// Overview, where Sean walks through the page, with its transcript. The same
// card Charlene's dashboard has. Shows nothing until the guide's video exists
// (/api/bcps/guide-video), so no guide ever shows an empty player.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
interface Video { src: string; poster: string | null; transcript: string[] }

export default function GuideStart({ slug, title }: { slug: string; title: string }) {
  const [video, setVideo] = useState<Video | null>(null)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const r = await fetch(`/api/bcps/guide-video?slug=${encodeURIComponent(slug)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (live && j.video?.src) setVideo(j.video)
      } catch { /* no video shows */ }
    })()
    return () => { live = false }
  }, [slug])
  if (!video) return null
  return (
    <div className="home-start" aria-label="Start here">
      <video controls preload="metadata" playsInline poster={video.poster ?? undefined} src={video.src} aria-label={`Video: Sean walks you through the ${title}`} />
      <div className="home-start-text">
        <h3>Start here</h3>
        <p>New to this page? Sean walks you through it in about a minute: what each part is for and where to start.</p>
        {video.transcript.length > 0 && (
          <details className="home-video-transcript">
            <summary>Read the transcript</summary>
            {video.transcript.map((line, i) => <p key={i}>{line}</p>)}
          </details>
        )}
      </div>
    </div>
  )
}
