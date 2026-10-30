'use client'

import { windowForDivision, formatWindowRange, windowState, type ReviewWindow } from '@/lib/review-windows'
import { DIRECTOR_DEPARTMENT_GUIDE as G } from '@/lib/guides/director-department'
import { CERT_DUE, HOT_LAB_JOIN_URL } from '@/lib/guides/wcm-department'
import { fmtGuideDate } from './Guide'

// The Director Guide's Overview (Sean, 2026-10-29), drawn from the director's
// dashboard data: where their departments are in the four parts of the
// program, what to do now, their WCMs at a glance and the dates that matter.
// Department Oversight (every department) gets the counts without names.
// Without a viewer it shows the path with nothing marked.

export interface DirectorViewer {
  name: string
  oversight: boolean
  departments: {
    name: string
    division: string | null
    audit_status: string | null
    wcms: { name: string; certified: boolean; progress_pct: number; has_account: boolean }[]
  }[]
}

type Action = { title: string; body: string; href: string; label: string }

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

const STEPS = G.tabs.filter((t) => t.step).map((t) => ({ id: t.id, label: t.label, step: t.step! }))

export default function DirectorGuideOverview({ viewer }: { viewer?: DirectorViewer | null }) {
  const t = today()
  const depts = viewer?.departments ?? []
  const wcms = depts.flatMap((d) => d.wcms)
  const unconfirmed = depts.filter((d) => d.wcms.length === 0)
  const notCertified = wcms.filter((w) => !w.certified)
  const reviewed = depts.length > 0 && depts.every((d) => d.audit_status === 'complete')
  // 0 Your WCM, 1 Certification, 2 Website Review, 3 Telling Your Story.
  const stage = !viewer || !depts.length ? -1 : unconfirmed.length ? 0 : notCertified.length ? 1 : reviewed ? 3 : 2
  const w: ReviewWindow | null = viewer && !viewer.oversight ? (depts.map((d) => windowForDivision(d.division)).find(Boolean) ?? null) : null
  const wState = w ? windowState(w) : null

  const actions: Action[] = []
  if (viewer && depts.length) {
    if (unconfirmed.length) {
      actions.push({
        title: viewer.oversight ? `${unconfirmed.length} department${unconfirmed.length === 1 ? ' has' : 's have'} no confirmed WCM` : `Confirm your Web Content Manager${unconfirmed.length > 1 ? 's' : ''}`,
        body: viewer.oversight ? 'Each department’s director confirms one on the WCM form.' : `${unconfirmed.map((d) => d.name).join(', ')} ${unconfirmed.length === 1 ? 'has' : 'have'} no confirmed WCM yet. The form takes less than five minutes and needs no sign-in.`,
        href: '/wcm-roster-signup', label: 'Confirm a WCM',
      })
    }
    if (notCertified.length) {
      const who = viewer.oversight ? `${notCertified.length} WCM${notCertified.length === 1 ? ' has' : 's have'} not finished.` : `${notCertified.map((x) => `${x.name} (${x.has_account ? `${x.progress_pct}%` : 'not signed up'})`).join(', ')}.`
      actions.push({
        title: t <= CERT_DUE ? 'Check in on certification' : 'Help your WCM finish certification',
        body: t <= CERT_DUE
          ? `${who} Certification is due ${fmtGuideDate(CERT_DUE, { weekday: 'long', month: 'long', day: 'numeric' })}. A quick check-in helps; after the deadline the District Web Team follows up with anyone who has not finished.`
          : `${who} The District Web Team is following up with each of them. A check-in from you helps.`,
        href: '#guide/cert/help', label: 'How to help',
      })
    }
    if (!viewer.oversight) {
      actions.push(w && wState === 'open'
        ? { title: 'Book your website review', body: `${w.label} is open now, through ${fmtGuideDate(w.end, { month: 'long', day: 'numeric' })}. You and your WCM meet with us for one hour.`, href: '/?page=dashboard&tab=review', label: 'Book your meeting' }
        : { title: 'Plan your website review', body: w ? `${w.label}, ${formatWindowRange(w)}. Need help sooner? Request an earlier meeting.` : 'Request a meeting with the District Web Team any time.', href: '/?page=dashboard&tab=review', label: 'Open Website Review' })
    }
  }

  const stepNote = (id: string): string => {
    if (!viewer || !depts.length) return ''
    if (id === 'wcm') return unconfirmed.length ? `${unconfirmed.length} to confirm` : 'Done'
    if (id === 'cert') return wcms.length ? `${wcms.length - notCertified.length} of ${wcms.length} certified` : 'After your WCM is named'
    if (id === 'review') return w ? `${w.label}${wState === 'open' ? ', open now' : ''}` : viewer.oversight ? 'Three windows a year' : ''
    if (id === 'story') return reviewed ? 'Now' : 'After your review'
    return ''
  }
  const latest = G.changes[0]

  return (
    <>
      <div className="home-dept guide-sec">
        <h2 className="guide-h2">{viewer ? (viewer.name ? `Welcome, ${viewer.name}` : 'Welcome') : 'How this guide works'}</h2>
        <p className="guide-intro">
          {viewer
            ? 'What the Web Content Manager program asks of your department, and where you stand. Your WCM does the work; this is what to know and what to ask of them.'
            : 'What the Web Content Manager program asks of each department, in four parts. Each director sees their own departments here.'}
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
                <a className={i === 0 ? 'wcm-hub2-card-btn' : 'home-link-btn'} href={a.href}>{a.label}</a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="guide-dates">
        <div className="home-dept">
          <div className="guide-date-label">Certification</div>
          <b>{viewer && wcms.length && !notCertified.length ? 'All certified' : `Due ${fmtGuideDate(CERT_DUE, { month: 'short', day: 'numeric' })}`}</b>
          <span>{viewer && wcms.length ? `${wcms.length - notCertified.length} of ${wcms.length} of your WCMs certified.` : 'A quick check-in with your WCM helps them finish.'}</span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">{w ? 'Your website review' : 'Website reviews'}</div>
          <b>{w ? formatWindowRange(w) : 'Three windows a year'}</b>
          <span>{w ? `${w.label}${wState === 'open' ? ', open now' : ''}. Book it on Website Review.` : <a href="#guide/review/windows">See the windows</a>}</span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">Next Hot Lab</div>
          <b>{nextHotLab()}</b>
          <span>See what your WCMs are working on. <a href={HOT_LAB_JOIN_URL} target="_blank" rel="noopener noreferrer">Sit in on Teams</a></span>
        </div>
      </div>

      <div className="home-dept guide-sec">
        <h3 className="home-card-title">Quick access</h3>
        <ul className="guide-links guide-quick">
          <li><a href="/?page=dashboard&tab=review"><b>Website Review</b><span>Your window, and booking your meeting</span></a></li>
          <li><a href="/?page=dashboard&tab=analytics"><b>Analytics</b><span>Your visitors and top pages</span></a></li>
          <li><a href="/wcm-roster-signup"><b>Confirm or change your WCM</b><span>The WCM form, no sign-in needed</span></a></li>
          <li><a href="/?page=dashboard&tab=notes"><b>Meeting Notes</b><span>The meetings that matter to you</span></a></li>
          <li><a href="/?page=dashboard&tab=documents&doc=wcm-department"><b>Your WCM&apos;s guide</b><span>The Department WCM Guide</span></a></li>
          <li><a href="#feedback"><b>Ask the District Web Team</b><span>Straight to our team</span></a></li>
        </ul>
      </div>

      <div className="home-dept guide-sec">
        <div className="home-dept-head"><h3>New this week</h3><a className="home-link-btn" href="#guide/changes">Everything that changed</a></div>
        <p className="guide-body"><b>{fmtGuideDate(latest.date)}.</b> {latest.text}</p>
      </div>
    </>
  )
}
