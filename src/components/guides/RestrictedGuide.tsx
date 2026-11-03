'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { GuideDef, GuideSection } from '@/lib/guides/types'
import type { RestrictedGuideMeta } from '@/lib/guides/restricted'
import type { GuideDepartment } from '@/lib/guides/department'
import Guide, { openFeedback, fmtGuideDate } from './Guide'
import AssignmentsPage from '@/components/pages/AssignmentsPage'

// A restricted guide (Sean, 2026-10-30): its content comes from
// /api/bcps/guides/[slug], which sends it only to the guide's readers, so it
// is never in the page code. Its Overview is part of that content.
//
// A department guide (Sean, 2026-11-03) is a mini home page. Its Overview marks
// sections as a hero (text beside the department's page), tiles (a row of
// three) or wide (full width under them), and the API also sends the
// department's live side: its page image, an audit snapshot for its WCMs and
// analytics for its WCMs and director. A guide that marks nothing keeps the
// plain stacked Overview it always had.

const supabase = createClient()

const PAGE_HOST = /^https:\/\/www\.browardschools\.com\//

function AuditSnapshot({ a }: { a: NonNullable<GuideDepartment['audit']> }) {
  // The same bands as the department portal: 80 and up good, 60 and up needs work.
  const tone = a.avg_score === null ? '' : a.avg_score >= 80 ? 'ok' : a.avg_score >= 60 ? 'warn' : 'bad'
  return (
    <div className="guide-audit" role="group" aria-label="Audit snapshot">
      <div className={`guide-audit-score ${tone}`}><b>{a.avg_score ?? '-'}</b><span>average page score</span></div>
      <dl className="guide-audit-facts">
        <div><dt>Pages audited</dt><dd>{a.pages}</dd></div>
        <div><dt>To fix</dt><dd>{a.to_fix}</dd></div>
        <div><dt>To review</dt><dd>{a.to_review}</dd></div>
      </dl>
      <p className="guide-audit-note">The latest audit of each page, {fmtGuideDate(a.audited_at.slice(0, 10), { month: 'short', day: 'numeric' })}.</p>
    </div>
  )
}

// Live tabs (Sean, 2026-11-03): a tab that is a working page, not written
// content, so it never goes stale and keeps the structure it has. They are
// added here, in code, because the page carries its own access; the guide's
// stored content stays text only. `after` is the tab it follows.
const LIVE_TABS: Record<string, { id: string; label: string; intro: string; after: string; render: () => React.ReactNode }[]> = {
  'district-web-team': [{
    id: 'assignments',
    label: 'Web Team Assignments',
    intro: 'The team’s tracker, live. Open an item for its notes, add your input, or upload a meeting transcript. It is the same page as before, now inside the guide.',
    after: 'week',
    render: () => <AssignmentsPage embedded />,
  }],
}

const body = (s: GuideSection) => <div className="guide-body" dangerouslySetInnerHTML={{ __html: s.html }} />

// asEmail: a SuperAdmin viewing as a person sees the guide as that person
// would (the server ignores it for anyone else). renderAnalytics draws the
// department's Analytics tab; the dashboard supplies it so the guide shows the
// same Analytics view as the Director and WCM dashboards.
export default function RestrictedGuide({ meta, initialTab, actions, asEmail, renderAnalytics }: {
  meta: RestrictedGuideMeta
  initialTab?: string
  actions?: React.ReactNode
  asEmail?: string | null
  renderAnalytics?: (d: GuideDepartment) => React.ReactNode
}) {
  const [guide, setGuide] = useState<GuideDef | null>(null)
  const [department, setDepartment] = useState<GuideDepartment | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const r = await fetch(`/api/bcps/guides/${encodeURIComponent(meta.slug)}${asEmail ? `?as=${encodeURIComponent(asEmail)}` : ''}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        if (!live) return
        if (r.status === 401 || r.status === 403) { setState('denied'); return }
        const j = await r.json()
        if (!r.ok || !j.guide) { setState('error'); return }
        setGuide(j.guide)
        setDepartment(j.department ?? null)
        setState('ok')
      } catch {
        if (live) setState('error')
      }
    })()
    return () => { live = false }
  }, [meta.slug, asEmail])

  if (state === 'ok' && guide) {
    const sections = guide.overview ?? []
    const hero = sections.find((s) => s.layout === 'hero')
    const tiles = sections.filter((s) => s.layout === 'tile')
    const rest = sections.filter((s) => s !== hero && !tiles.includes(s))
    const shot = department?.hero
    const pageUrl = shot && PAGE_HOST.test(shot.page_url) ? shot.page_url : department?.website_url && PAGE_HOST.test(department.website_url) ? department.website_url : null

    const overview = (
      <>
        {hero && (
          <section id={`guide-overview-${hero.id}`} className={`home-dept guide-sec guide-hero${shot ? '' : ' no-shot'}`}>
            <div className="guide-hero-text">
              <h2 className="guide-h2">{hero.title}</h2>
              {body(hero)}
            </div>
            {shot && (
              <a className="guide-hero-shot" href={pageUrl ?? undefined} target="_blank" rel="noopener noreferrer"
                aria-label={`Open the ${department?.name ?? 'department'} page on browardschools.com (opens in a new tab)`}>
                <img src={shot.image} alt={`The top of the ${department?.name ?? 'department'} page on browardschools.com`} loading="lazy" />
                <span className="guide-hero-cap">Your page, as of {fmtGuideDate(shot.audited_at.slice(0, 10), { month: 'short', day: 'numeric' })}</span>
              </a>
            )}
          </section>
        )}
        {tiles.length > 0 && (
          <div className="guide-tiles">
            {tiles.map((s) => (
              <section key={s.id} id={`guide-overview-${s.id}`} className="home-dept guide-sec guide-tile">
                <h3 className="home-card-title">{s.title}</h3>
                {s.id === 'wcm-tools' && department?.audit && <AuditSnapshot a={department.audit} />}
                {body(s)}
              </section>
            ))}
          </div>
        )}
        {rest.map((s) => (
          <section key={s.id} id={`guide-overview-${s.id}`} className="home-dept guide-sec">
            <h3 className="home-card-title">{s.title}</h3>
            {body(s)}
          </section>
        ))}
      </>
    )
    const live = (LIVE_TABS[meta.slug] ?? []).filter((t) => !guide.tabs.some((x) => x.id === t.id))
    const def = live.length
      ? { ...guide, tabs: live.reduce((tabs, t) => {
          const at = tabs.findIndex((x) => x.id === t.after)
          const tab = { id: t.id, label: t.label, intro: t.intro, sections: [] }
          return at < 0 ? [...tabs, tab] : [...tabs.slice(0, at + 1), tab, ...tabs.slice(at + 1)]
        }, guide.tabs) }
      : guide
    const tabExtras: Record<string, React.ReactNode> = { ...(department && renderAnalytics ? { analytics: renderAnalytics(department) } : {}) }
    for (const t of live) tabExtras[t.id] = t.render()
    return <Guide def={def} overview={overview} initialTab={initialTab} actions={actions} tabExtras={tabExtras} />
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
