'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { GuideDef, GuideSection } from '@/lib/guides/types'
import type { RestrictedGuideMeta } from '@/lib/guides/restricted'
import type { GuideDepartment } from '@/lib/guides/department'
import Guide, { openFeedback, fmtGuideDate } from './Guide'
import AssignmentsPage from '@/components/pages/AssignmentsPage'
import GuideAudio from './GuideAudio'
import TeamMeetings from './TeamMeetings'
import MembersPage from '@/components/pages/MembersPage'
import BannerSubmissionsPage from '@/components/pages/BannerSubmissionsPage'
import ProudPointsPage from '@/components/pages/ProudPointsPage'
import SchoolsPage from '@/components/pages/SchoolsPage'
import SchoolSupportLeadPage from '@/components/pages/SchoolSupportLeadPage'
import PilotReviewResults from '@/components/bcps/PilotReviewResults'
import type { GuideSide, GuideSideInfo } from '@/lib/guides/team-side'

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
// `check` is an endpoint the reader must pass (any 2xx) for the tab to show,
// for a tab narrower than the guide's own readers.
type LiveTab = {
  id: string; label: string; intro: string
  // The tab it follows; with a list, the first one present (a gated tab
  // may be hidden for this reader).
  after: string | string[]
  check?: string
  // District Web Team Guide (Sean, 2026-11-16): which side the tab is on.
  // Left out, it shows on both.
  side?: GuideSide
  render: (ctx: { side: GuideSide }) => React.ReactNode
}
const LIVE_TABS: Record<string, LiveTab[]> = {
  'district-web-team': [{
    // Web Team Meetings (Sean, 2026-11-06): agendas that become notes, for
    // Sean, Farrah and Felicia only (named grants on 'web-team-meetings').
    id: 'meetings',
    label: 'Web Team Meetings',
    intro: 'Each Web Team Meeting in one place: the agenda before, and after it the recap, what happened to each item, action items and the recording.',
    after: 'week',
    check: '/api/bcps/team-meetings',
    render: () => <TeamMeetings />,
  }, {
    id: 'assignments',
    label: 'Web Team Assignments',
    intro: 'The team’s tracker, live. Open an item for its notes, add your input, or upload a meeting transcript. It is the same page as before, now inside the guide.',
    after: 'week',
    render: () => <AssignmentsPage embedded />,
  }, {
    // Members (Sean, 2026-11-16): both sides need it, opening on their own
    // side's pill (Departments or Schools), one click from the other.
    id: 'members',
    label: 'Members',
    intro: 'Everyone with a BCPS MarComm account. Switch between Departments and Schools with the pill beside the title.',
    after: ['meetings', 'assignments'],
    render: ({ side }) => <MembersPage defaultDivision="" defaultScope={side} embedded />,
  }, {
    // The school side's working tools (Sean, 2026-11-16): everything the
    // school-side team administers, in the menu, so nobody hunts for it.
    id: 'pilot-review',
    label: 'Pilot Review',
    intro: 'The WCM Pilot Review: which of the fifteen pilot WCMs have an account and have sent feedback, and what they said about the WCM Dashboard, Banner Submission and Proud Points.',
    after: ['school-now', 'schools'],
    side: 'schools',
    check: '/api/bcps/pilot-review?results=1',
    render: () => <PilotReviewResults showTitle={false} />,
  }, {
    id: 'banner-review',
    label: 'Banner Review',
    intro: 'Homepage banners schools have sent: review, approve or reject with a reason, and mark as posted.',
    after: ['pilot-review', 'school-now', 'schools'],
    side: 'schools',
    render: () => <BannerSubmissionsPage review />,
  }, {
    id: 'proud-points-review',
    label: 'Proud Points Review',
    intro: 'Proud Points schools have sent: review, approve or reject with a reason, and mark as posted.',
    after: ['banner-review', 'pilot-review', 'school-now', 'schools'],
    side: 'schools',
    render: () => <ProudPointsPage review />,
  }, {
    id: 'school-list',
    label: 'School List',
    intro: 'Every school with its District Web Team lead, its WCM and its scores. It opens on your own schools if you are a lead.',
    after: ['proud-points-review', 'banner-review', 'pilot-review', 'school-now', 'schools'],
    side: 'schools',
    render: () => <SchoolsPage />,
  }, {
    id: 'school-leads',
    label: 'School Lead Assignments',
    intro: 'Which District Web Team lead supports each school. This is what Find Your District Web Team Lead shows to school WCMs.',
    after: ['school-list', 'proud-points-review', 'banner-review', 'pilot-review', 'school-now', 'schools'],
    side: 'schools',
    render: () => <SchoolSupportLeadPage />,
  }],
}

// Stored tabs and sections on a sided guide (Sean, 2026-11-16), by id: the
// side each belongs to. Anything not listed is shared.
const SIDED: Record<string, { tabs: Record<string, GuideSide>; sections: Record<string, Record<string, GuideSide>> }> = {
  'district-web-team': {
    // The school side's own tabs (second draft, 2026-11-16, from the BOSS):
    // Needs You Now, School Projects, How It Works, School Dates.
    tabs: { departments: 'departments', schools: 'schools', 'school-now': 'schools', 'school-projects': 'schools', 'school-how': 'schools', 'school-dates': 'schools' },
    sections: { reference: { departments: 'departments', schools: 'schools' } },
  },
}

function sideOf(guide: GuideDef, slug: string, side: GuideSide): GuideDef {
  const map = SIDED[slug]
  if (!map) return guide
  const on = (s: GuideSide | undefined) => !s || s === side
  return {
    ...guide,
    tabs: guide.tabs
      .filter((t) => on(map.tabs[t.id]))
      .map((t) => ({ ...t, sections: t.sections.filter((x) => on(map.sections[t.id]?.[x.id])) })),
  }
}

// Departments or Schools, for the one reader who gets to switch (the
// SuperAdmin). Remembered in this browser only.
const SIDE_KEY = 'bcps-guide-side'
function SideToggle({ side, onChange }: { side: GuideSide; onChange: (s: GuideSide) => void }) {
  return (
    <div className="guide-side" role="group" aria-label="Show the department or school side">
      <button type="button" aria-pressed={side === 'departments'} onClick={() => onChange('departments')}>Departments</button>
      <button type="button" aria-pressed={side === 'schools'} onClick={() => onChange('schools')}>Schools</button>
      <style>{`.guide-side{display:inline-flex;border:1.5px solid #dde3ea;border-radius:8px;overflow:hidden;background:#fff;flex-shrink:0}
.guide-side button{font-family:inherit;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;border:none;background:#fff;color:#6b7280;cursor:pointer}
.guide-side button+button{border-left:1.5px solid #dde3ea}
.guide-side button[aria-pressed="true"]{background:#1672A7;color:#fff}`}</style>
    </div>
  )
}

const body = (s: GuideSection) => <><GuideAudio audio={s.audio} /><div className="guide-body" dangerouslySetInnerHTML={{ __html: s.html }} /></>

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
  const [passed, setPassed] = useState<Record<string, boolean>>({})
  const [sideInfo, setSideInfo] = useState<GuideSideInfo | null>(null)
  const [side, setSide] = useState<GuideSide>('departments')
  const pickSide = (s: GuideSide) => {
    setSide(s)
    try { localStorage.setItem(SIDE_KEY, s) } catch { /* this browser only */ }
  }

  useEffect(() => {
    let live = true
    const gated = (LIVE_TABS[meta.slug] ?? []).filter((t) => t.check)
    if (!gated.length) return
    ;(async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      for (const t of gated) {
        try {
          const r = await fetch(t.check!, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
          if (live && r.ok) setPassed((p) => ({ ...p, [t.id]: true }))
        } catch { /* the tab stays hidden */ }
      }
    })()
    return () => { live = false }
  }, [meta.slug])

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
        const si = (j.side ?? null) as GuideSideInfo | null
        setSideInfo(si)
        if (si) {
          let saved: string | null = null
          if (si.toggle) { try { saved = localStorage.getItem(SIDE_KEY) } catch { /* none */ } }
          setSide(saved === 'schools' || saved === 'departments' ? saved : si.side)
        }
        setState('ok')
      } catch {
        if (live) setState('error')
      }
    })()
    return () => { live = false }
  }, [meta.slug, asEmail])

  if (state === 'ok' && guide) {
    const shown = sideInfo ? sideOf(guide, meta.slug, side) : guide
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
    const live = (LIVE_TABS[meta.slug] ?? []).filter((t) => !guide.tabs.some((x) => x.id === t.id) && (!t.check || passed[t.id])
      && (!t.side || !sideInfo || t.side === side))
    const def = live.length
      ? { ...shown, tabs: live.reduce((tabs, t) => {
          const anchors = Array.isArray(t.after) ? t.after : [t.after]
          const anchor = anchors.find((a) => tabs.some((x) => x.id === a))
          const at = anchor ? tabs.findIndex((x) => x.id === anchor) : -1
          const tab = { id: t.id, label: t.label, intro: t.intro, sections: [] }
          return at < 0 ? [...tabs, tab] : [...tabs.slice(0, at + 1), tab, ...tabs.slice(at + 1)]
        }, shown.tabs) }
      : shown
    const tabExtras: Record<string, React.ReactNode> = { ...(department && renderAnalytics ? { analytics: renderAnalytics(department) } : {}) }
    for (const t of live) tabExtras[t.id] = t.render({ side })
    const allActions = sideInfo?.toggle ? <><SideToggle side={side} onChange={pickSide} />{actions}</> : actions
    return <Guide key={side} def={def} overview={overview} initialTab={initialTab} actions={allActions} tabExtras={tabExtras} />
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
