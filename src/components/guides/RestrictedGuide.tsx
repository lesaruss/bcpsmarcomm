'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { GuideDef } from '@/lib/guides/types'
import type { RestrictedGuideMeta } from '@/lib/guides/restricted'
import Guide, { openFeedback } from './Guide'

// A restricted guide (Sean, 2026-10-30): its content comes from
// /api/bcps/guides/[slug], which sends it only to the guide's readers, so it
// is never in the page code. Its Overview is part of that content.

const supabase = createClient()

export default function RestrictedGuide({ meta, initialTab, actions }: { meta: RestrictedGuideMeta; initialTab?: string; actions?: React.ReactNode }) {
  const [guide, setGuide] = useState<GuideDef | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const r = await fetch(`/api/bcps/guides/${encodeURIComponent(meta.slug)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        if (!live) return
        if (r.status === 401 || r.status === 403) { setState('denied'); return }
        const j = await r.json()
        if (!r.ok || !j.guide) { setState('error'); return }
        setGuide(j.guide)
        setState('ok')
      } catch {
        if (live) setState('error')
      }
    })()
    return () => { live = false }
  }, [meta.slug])

  if (state === 'ok' && guide) {
    const overview = (
      <>
        {(guide.overview ?? []).map((s) => (
          <section key={s.id} id={`guide-overview-${s.id}`} className="home-dept guide-sec">
            <h3 className="home-card-title">{s.title}</h3>
            <div className="guide-body" dangerouslySetInnerHTML={{ __html: s.html }} />
          </section>
        ))}
      </>
    )
    return <Guide def={guide} overview={overview} initialTab={initialTab} actions={actions} />
  }

  return (
    <div className="guide">
      <div className="guide-head">
        <div className="guide-head-text">
          <div className="home-hero-label">BCPS MarComm</div>
          <h1 className="guide-title">{meta.title}</h1>
          <p className="guide-meta">For {meta.audience}.</p>
        </div>
        {actions && <div className="guide-head-tools">{actions}</div>}
      </div>
      <div className="home-dept">
        {state === 'loading' && <p className="guide-body" role="status">Loading...</p>}
        {state === 'denied' && (
          <p className="guide-body">This guide is shared with a small group of readers. If you need it, <a href="#" onClick={(e) => { e.preventDefault(); openFeedback(`Please share the ${meta.title} guide with me: `) }}>ask the District Web Team</a>.</p>
        )}
        {state === 'error' && <p className="guide-body">The guide could not load. Refresh the page, or try again in a minute.</p>}
      </div>
    </div>
  )
}
