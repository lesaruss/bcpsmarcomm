'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { MARCOMM_TEAM_GUIDE as G, MARCOMM_MEETING_DAY, MARCOMM_MEETING_START, MARCOMM_MEETING_END } from '@/lib/guides/marcomm-team'
import { MARCOMM_PATH } from '@/lib/types'
import { fmtGuideDate } from './Guide'

// The MarComm Team Guide's Overview (Sean, 2026-10-29): where the team is
// this week, the viewer's own items, the last meeting's recap and when the
// next one is. Read from the same data MarComm Assignments shows
// (/api/bcps/marcomm-requests), so the numbers always match the tracker.
// Someone without the tracker sees the guide's path and dates only.

const supabase = createClient()

interface Req {
  id: string
  job_number: number | null
  title: string | null
  status: string
  lead: string | null
  support: string | null
  date_needed: string | null
  is_ongoing: boolean | null
  overdue_dismissed: boolean | null
  merged_into: string | null
  completed_at: string | null
}
interface Snapshot { id: string; meeting_date: string; label: string; summary: string | null; created_at: string }
interface TrackerData { requests: Req[]; team: { name: string; email: string | null }[]; snapshots: Snapshot[]; me: string; can_edit: boolean }

const CLOSED = new Set(['completed', 'declined'])
const STATUS_LABEL: Record<string, string> = {
  new: 'New', needs_info: 'Needs Info', assigned: 'Assigned', in_progress: 'In Progress', in_review: 'In Review',
  scheduled: 'Scheduled', on_hold: 'On Hold', completed: 'Completed', declined: 'Declined',
}

// Wall-clock parts in Eastern time, where the meeting is scheduled.
function easternNow(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), dow: days.indexOf(get('weekday')), mins: (Number(get('hour')) % 24) * 60 + Number(get('minute')) }
}
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function nextMeeting(): { label: string; live: boolean } {
  const e = easternNow()
  const start = MARCOMM_MEETING_START.hour * 60 + MARCOMM_MEETING_START.minute
  const end = MARCOMM_MEETING_END.hour * 60 + MARCOMM_MEETING_END.minute
  if (e.dow === MARCOMM_MEETING_DAY && e.mins >= start && e.mins < end) return { label: 'Live now', live: true }
  let add = (MARCOMM_MEETING_DAY - e.dow + 7) % 7
  if (add === 0 && e.mins >= end) add = 7
  const day = new Date(e.y, e.m - 1, e.d + add)
  const when = add === 0 ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return { label: `${when}, 1:00 PM`, live: false }
}

const namesOf = (r: Req) => `${r.lead ?? ''},${r.support ?? ''}`.split(/[/,]/).map((s) => s.trim()).filter(Boolean)
const fmtDay = (d: string) => fmtGuideDate(d.slice(0, 10), { month: 'short', day: 'numeric' })

export default function MarcommGuideOverview({ name }: { name?: string }) {
  const [data, setData] = useState<TrackerData | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'none'>('loading')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const r = await fetch('/api/bcps/marcomm-requests', { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
        const j = await r.json()
        if (!live) return
        if (!r.ok || !j.ok) { setState('none'); return }
        setData({ requests: j.requests ?? [], team: j.team ?? [], snapshots: j.snapshots ?? [], me: (j.me ?? '').toLowerCase(), can_edit: !!j.can_edit })
        setState('ok')
      } catch {
        if (live) setState('none')
      }
    })()
    return () => { live = false }
  }, [])

  const e = easternNow()
  const today = iso(e.y, e.m, e.d)
  const meeting = nextMeeting()
  const latest = data ? [...data.snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] : undefined
  const reqs = data ? data.requests.filter((r) => !r.merged_into) : []
  const active = reqs.filter((r) => !CLOSED.has(r.status))
  const late = (r: Req) => !!r.date_needed && r.date_needed < today && !r.is_ongoing && !r.overdue_dismissed
  const myName = data?.team.find((m) => m.email && m.email.toLowerCase() === data.me)?.name ?? ''
  const mine = myName ? active.filter((r) => namesOf(r).includes(myName))
    .sort((a, b) => (a.date_needed ?? '9999').localeCompare(b.date_needed ?? '9999')) : []
  const closedSince = latest ? reqs.filter((r) => CLOSED.has(r.status) && r.completed_at && r.completed_at.slice(0, 10) > latest.meeting_date).length : 0
  const stats = [
    { label: 'Open requests', value: active.length, note: 'Everything not yet completed' },
    { label: 'New', value: active.filter((r) => r.status === 'new').length, note: 'Waiting for an owner' },
    { label: 'Needs Info', value: active.filter((r) => r.status === 'needs_info').length, note: 'Waiting on the requester' },
    { label: 'Overdue', value: active.filter(late).length, note: 'Past the date needed', warn: true },
  ]
  const myLate = mine.filter(late).length

  return (
    <>
      <div className="home-dept guide-sec">
        <h2 className="guide-h2">{name ? `Welcome, ${name}` : 'Where the team is this week'}</h2>
        <p className="guide-intro">
          The weekly Marcomm Meeting, MarComm Assignments and how requests reach the team, in one place.
          {state === 'ok' ? ' The numbers below are live from the tracker.' : ''}
        </p>
        {state === 'ok' && (
          <div className="guide-stats">
            {stats.map((s) => (
              <div key={s.label} className={`guide-stat${s.warn && s.value ? ' warn' : ''}`}>
                <b>{s.value}</b><span>{s.label}</span><small>{s.note}</small>
              </div>
            ))}
          </div>
        )}
        {state === 'loading' && <p className="guide-body" role="status">Loading the latest from MarComm Assignments...</p>}
      </div>

      {state === 'ok' && (
        <div className="home-dept guide-sec">
          <h3 className="home-card-title">Do this now</h3>
          <ol className="home-wsteps">
            {myName ? (
              <li className="now">
                <b>{mine.length ? `Check your ${mine.length} open item${mine.length === 1 ? '' : 's'} before ${meeting.live ? 'the meeting ends' : meeting.label.split(',')[0]}` : 'You have no open items right now'}</b>
                <span>{mine.length
                  ? `${myLate ? `${myLate} ${myLate === 1 ? 'is' : 'are'} past the date needed. ` : ''}Have a one-line update ready for each: what changed, what is next, and anything you are waiting on.`
                  : 'New requests get owners in the meeting, so check back after Wednesday.'}</span>
                <a className="wcm-hub2-card-btn" href={MARCOMM_PATH}>Open MarComm Assignments</a>
              </li>
            ) : (
              <li className="now">
                <b>Open MarComm Assignments</b>
                <span>Every request, its owners and its notes. Click My items to see the ones you lead or support.</span>
                <a className="wcm-hub2-card-btn" href={MARCOMM_PATH}>Open MarComm Assignments</a>
              </li>
            )}
            {data?.can_edit ? (
              <li>
                <b>After the meeting, save it</b>
                <span>Upload the transcript of a recorded meeting, or save a meeting snapshot by hand, so the week is kept.</span>
                <a className="home-link-btn" href="#guide/after/versions">How versions work</a>
              </li>
            ) : (
              <li>
                <b>Something changed before Wednesday?</b>
                <span>Send it to Jennifer Hodder and it goes in the tracker right away.</span>
                <a className="home-link-btn" href="#guide/before/between">Who updates the tracker</a>
              </li>
            )}
          </ol>
        </div>
      )}

      <div className="guide-dates">
        <div className="home-dept">
          <div className="guide-date-label">Next Marcomm Meeting</div>
          <b>{meeting.label}</b>
          <span>Wednesdays, 1:00 to 2:00 PM on Teams. The link is in Jennifer Hodder&apos;s invitation.</span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">Last meeting</div>
          <b>{latest ? fmtGuideDate(latest.meeting_date, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Every week is saved'}</b>
          <span>{latest ? `${closedSince} request${closedSince === 1 ? '' : 's'} closed since then.` : <a href="#guide/after/versions">How versions work</a>}</span>
        </div>
        <div className="home-dept">
          <div className="guide-date-label">Your items</div>
          <b>{state !== 'ok' ? 'In MarComm Assignments' : myName ? `${mine.length} open` : 'Not on the roster'}</b>
          <span>{state === 'ok' && !myName ? 'Ask Jennifer Hodder to add you to the team list.' : 'Requests you lead or support.'}</span>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="home-dept guide-sec">
          <div className="home-dept-head"><h3>Your open items</h3><a className="home-link-btn" href={MARCOMM_PATH}>See them all</a></div>
          <ul className="guide-items">
            {mine.slice(0, 6).map((r) => (
              <li key={r.id}>
                <a href={`${MARCOMM_PATH}?row=${encodeURIComponent(r.id)}`}>
                  <span className="guide-item-title">{r.job_number ? `#${r.job_number} ` : ''}{r.title || 'Untitled request'}</span>
                  <span className="guide-item-meta">
                    {STATUS_LABEL[r.status] ?? r.status}
                    {r.is_ongoing ? ' · Ongoing' : r.date_needed ? ` · needed ${fmtDay(r.date_needed)}` : ''}
                    {late(r) && <b className="guide-item-late"> Overdue</b>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {latest?.summary && (
        <div className="home-dept guide-sec">
          <div className="home-dept-head"><h3>From the last meeting</h3><a className="home-link-btn" href="#guide/after/versions">See any week</a></div>
          <p className="guide-body">{latest.summary}</p>
        </div>
      )}

      <div className="home-dept guide-sec">
        <h3 className="home-card-title">Quick access</h3>
        <ul className="guide-links guide-quick">
          <li><a href={MARCOMM_PATH}><b>MarComm Assignments</b><span>Every request, owner and note</span></a></li>
          <li><a href="/marcomm-request" target="_blank" rel="noopener"><b>MarComm Request Form</b><span>Send requesters here</span></a></li>
          <li><a href="/calendar-request" target="_blank" rel="noopener"><b>Calendar Post form</b><span>Events for the District calendar</span></a></li>
        </ul>
      </div>

      <div className="home-dept guide-sec">
        <div className="home-dept-head"><h3>New in this guide</h3><a className="home-link-btn" href="#guide/changes">Everything that changed</a></div>
        <p className="guide-body"><b>{fmtGuideDate(G.changes[0].date)}.</b> {G.changes[0].text}</p>
        <p className="guide-body">Questions about BCPS MarComm? Use the blue message button in the bottom right, or <a href="#feedback" data-msg="Feedback on the MarComm Team Guide: ">tell us what this guide is missing</a>.</p>
      </div>
    </>
  )
}
