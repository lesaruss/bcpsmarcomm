'use client'

import { windowForDivision, formatWindowRange, windowState, type ReviewWindow } from '@/lib/review-windows'
import { WCM_DEPARTMENT_GUIDE as G, CERT_DUE, CERT_CHECK, HOT_LAB_JOIN_URL, FINALSITE_URL } from '@/lib/guides/wcm-department'
import { fmtGuideDate } from './Guide'

// The Department WCM Guide's Overview, drawn for the person reading it
// (Sean, 2026-10-29): where they are in the four steps, what to do right
// now, and the dates that matter to them. Without a viewer (a director
// reading their WCM's guide) it shows the same path with nothing marked.

export interface GuideViewer {
  name: string
  cert: { certified: boolean; done: number; total: number; pct: number }
  departments: {
    name: string
    division: string | null
    audit_status: string | null
    findings_open: number
    findings_fixed: number
    audited: boolean
  }[]
}

type Action = { title: string; body: string; href: string; label: string; external?: boolean }

const SUBMITTED = ['wcm_submitted', 'admin_review', 'complete']

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Department WCM Hot Labs run Tuesdays and Thursdays, 11:30 AM.
function nextHotLab(now: Date = new Date()): string {
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    if (d.getDay() === 2 || d.getDay() === 4) {
      if (i === 0 && now.getHours() * 60 + now.getMinutes() >= 12 * 60 + 30) continue
      return i === 0 ? 'Today, 11:30 AM' : `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}, 11:30 AM`
    }
  }
  return 'Tuesdays and Thursdays, 11:30 AM'
}

// 0 Getting Started, 1 Certification, 2 Your Audit, 3 Website Review.
function stageOf(v: GuideViewer): number {
  if (!v.cert.certified) return 1
  const d = v.departments
  if (d.length && d.every((x) => SUBMITTED.includes(x.audit_status ?? ''))) return 3
  return 2
}

function actionsFor(v: GuideViewer, w: ReviewWindow | null): Action[] {
  const t = today()
  const open = v.departments.reduce((n, d) => n + d.findings_open, 0)
  const audited = v.departments.some((d) => d.audited)
  const stage = stageOf(v)
  const out: Action[] = []
  if (stage === 1) {
    const progress = v.cert.total ? `${v.cert.done} of ${v.cert.total} pages done.` : v.cert.pct ? `${v.cert.pct}% done.` : 'You have not started yet.'
    out.push({
      title: t <= CERT_DUE ? `Finish your certification by ${fmtGuideDate(CERT_DUE, { weekday: 'long', month: 'long', day: 'numeric' })}`
        : t <= CERT_CHECK ? 'Finish your certification this week'
        : 'Finish your certification',
      body: t <= CERT_DUE
        ? `${progress} Your progress saves as you go. If anything is in the way, send us a message and we will help.`
        : `${progress} The deadline has passed. Finish as soon as you can, and send us a message if you need help.`,
      href: '/certification/departments/dashboard',
      label: v.cert.pct > 0 ? 'Continue certification' : 'Start certification',
    })
    out.push({ title: 'Stuck on a module?', body: 'Bring it to Hot Lab, or send us a message now rather than on the last day.', href: '#guide/certify/progress', label: 'Get help' })
  } else if (stage === 2) {
    if (!audited) {
      out.push({ title: 'Run your first audit', body: 'Run Audit shows your department page with every check pinned on it: green passes, red needs a fix, amber asks you to look.', href: '/?page=dashboard&tab=audit', label: 'Go to Run Audit' })
      out.push({ title: 'Check that it lists only your pages', body: 'Flag any page that belongs to another office, and add any of yours that are missing.', href: '#guide/audit/pages', label: 'How to check' })
    } else if (open > 0) {
      out.push({ title: `Fix your ${open} open audit item${open === 1 ? '' : 's'}`, body: 'Work them one at a time: find the pin, follow the steps, publish in Finalsite, leave a note, mark it done.', href: '/?page=dashboard&tab=audit', label: 'Go to Run Audit' })
      out.push({ title: 'Working an item, step by step', body: 'What Draft means, heading order, review items, and the most common red item.', href: '#guide/audit/item', label: 'Read the steps' })
    } else {
      out.push({ title: 'Submit your audit for review', body: 'Every red item is fixed. Submit it, and the District Web Team checks the fixes.', href: '/wcm-portal', label: 'Submit my audit' })
    }
    if (audited) out.push({ title: 'Get ready for your website review', body: w ? `${w.label}, ${formatWindowRange(w)}. Bring your director.` : 'Bring your director to the one-hour meeting.', href: '#guide/review/prepare', label: 'How to prepare' })
  } else {
    out.push({ title: 'Prepare for your website review', body: w ? `${w.label}, ${formatWindowRange(w)}. Search browardschools.com for every page that mentions your department.` : 'Search browardschools.com for every page that mentions your department.', href: '#guide/review/prepare', label: 'How to prepare' })
    out.push({ title: 'Start an editorial calendar', body: 'The moments your department has every year, in one spreadsheet, so your story is planned ahead.', href: '#guide/review/story', label: 'Tell your story' })
  }
  return out.slice(0, 3)
}

const STEPS = G.tabs.filter((t) => t.step).map((t) => ({ id: t.id, label: t.label, step: t.step! }))

const QUICK: { label: string; sub: string; href: string; external?: boolean }[] = [
  { label: 'Run Audit', sub: 'Your page and every check', href: '/?page=dashboard&tab=audit' },
  { label: 'Page Checklist', sub: 'What the audit checks', href: '/playbooks/wcm-department/score-100-checklist' },
  { label: 'Finalsite', sub: 'Edit your live page', href: FINALSITE_URL, external: true },
  { label: 'Certification', sub: 'Course, certificate, badge', href: '/certification/departments/dashboard' },
  { label: 'Analytics', sub: 'Your visitors and top pages', href: '/?page=dashboard&tab=analytics' },
  { label: 'Hot Lab', sub: 'Tue and Thu, 11:30 AM', href: HOT_LAB_JOIN_URL, external: true },
]

export default function WcmGuideOverview({ viewer }: { viewer?: GuideViewer | null }) {
  const stage = viewer ? stageOf(viewer) : -1
  const primary = viewer?.departments[0]
  const w = primary ? windowForDivision(primary.division) : null
  const open = viewer ? viewer.departments.reduce((n, d) => n + d.findings_open, 0) : 0
  const actions = viewer ? actionsFor(viewer, w) : []
  const latest = G.changes[0]

  const stepNote = (id: string): string => {
    if (!viewer) return ''
    if (id === 'start') return 'Done'
    if (id === 'certify') return viewer.cert.certified ? 'Done' : `${viewer.cert.pct}%`
    if (id === 'audit') return stage < 2 ? 'After certification' : stage > 2 ? 'Submitted' : viewer.departments.some((d) => d.audited) ? (open ? `${open} to fix` : 'All fixed') : 'Not run yet'
    if (id === 'review') return w ? `${w.label}${windowState(w) === 'open' ? ', open now' : ''}` : ''
    return ''
  }

  return (
    <>
      <div className="home-dept guide-sec">
        <h2 className="guide-h2">{viewer ? (viewer.name ? `Welcome, ${viewer.name}` : 'Welcome') : 'How this guide works'}</h2>
        <p className="guide-intro">
          {viewer
            ? 'Everything a Department Web Content Manager needs, in one place. Here is where you are and what to do next.'
            : 'Everything a Department Web Content Manager needs, in one place: four steps, then reference. Each WCM sees their own progress here.'}
        </p>
        <ol className="guide-path">
          {STEPS.map((s, i) => {
            const state = stage < 0 ? '' : i < stage ? 'done' : i === stage ? 'now' : ''
            return (
              <li key={s.id} className={state}>
                <a href={`#guide/${s.id}`}>
                  <span className="guide-path-num" aria-hidden="true">{state === 'done' ? '✓' : s.step}</span>
                  <b>{s.label}</b>
                  {stepNote(s.id) && <span className="guide-path-note">{state === 'now' ? <span className="sr-only">You are here. </span> : null}{stepNote(s.id)}</span>}
                </a>
              </li>
            )
          })}
        </ol>
      </div>

      {actions.length > 0 && (
        <div className="home-dept guide-sec">
          <h3 className="home-card-title">Do this now</h3>
          <ol className="home-wsteps">
            {actions.map((a, i) => (
              <li key={a.title} className={i === 0 ? 'now' : undefined}>
                <b>{a.title}</b>
                <span>{a.body}</span>
                <a className={i === 0 ? 'wcm-hub2-card-btn' : 'home-link-btn'} href={a.href} {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{a.label}</a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="guide-dates">
        <div className="home-dept">
          <div className="guide-date-label">Certification</div>
          <b>{viewer?.cert.certified ? 'Certified' : `Due ${fmtGuideDate(CERT_DUE, { month: 'short', day: 'numeric' })}`}</b>
          <span>{viewer?.cert.certified ? 'Your certificate and badge are on the course page.' : 'Stuck on a module? Bring it to Hot Lab or send us a message.'}</span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">Next Hot Lab</div>
          <b>{nextHotLab()}</b>
          <span><a href={HOT_LAB_JOIN_URL} target="_blank" rel="noopener noreferrer">Join on Teams</a></span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">{w ? 'Your website review' : 'Website reviews'}</div>
          <b>{w ? formatWindowRange(w) : 'Three windows a year'}</b>
          <span>{w ? `${w.label}, ${primary?.division}. Bring your director.` : <a href="#guide/review/windows">See the windows</a>}</span>
        </div>
      </div>

      <div className="home-dept guide-sec">
        <h3 className="home-card-title">Quick access</h3>
        <ul className="guide-links guide-quick">
          {QUICK.map((q) => (
            <li key={q.label}>
              <a href={q.href} {...(q.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}><b>{q.label}</b><span>{q.sub}</span></a>
            </li>
          ))}
        </ul>
      </div>

      <div className="home-dept guide-sec">
        <div className="home-dept-head"><h3>New this week</h3><a className="home-link-btn" href="#guide/changes">Everything that changed</a></div>
        <p className="guide-body"><b>{fmtGuideDate(latest.date)}.</b> {latest.text}</p>
        <p className="guide-body">Questions? Use the blue message button in the bottom right, or <a href="#feedback" data-msg="Feedback on the Department WCM Guide: ">tell us what this guide is missing</a>.</p>
      </div>
    </>
  )
}
