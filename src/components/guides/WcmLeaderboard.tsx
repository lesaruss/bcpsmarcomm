'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// The live Department WCM leaderboard (Sean, 2026-11-03): certification tiles,
// the viewer's own standing, and the top 20 in a scroll. Data comes from
// /api/bcps/wcm-leaderboard, which scores from certification, the Meeting
// Notes attendees, the Kickoff roster and audit progress. The point chart is
// the text of the Leaderboard tab; the Overview shows the compact form.

interface Entry {
  rank: number
  name: string
  department: string
  total: number
  certification: number
  hot_labs: number
  hot_lab_points: number
  kickoff: number
  audit: number
}

interface Me extends Entry {
  in_top: boolean
  points_to_top: number
}

interface Summary {
  wcms_total: number
  certified: number
  in_progress: number
  not_started: number
  departments_total: number
  departments_complete: number
  departments_audit_started: number
}

interface Payload {
  school_year: string
  total_ranked: number
  summary: Summary
  board: Entry[]
  me: Me | null
}

export default function WcmLeaderboard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const token = (await createClient().auth.getSession()).data.session?.access_token
        const r = await fetch('/api/bcps/wcm-leaderboard', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
        const j = await r.json()
        if (!live) return
        if (!r.ok || !j.ok) setError(j.error || 'The leaderboard could not be loaded.')
        else setData(j)
      } catch {
        if (live) setError('The leaderboard could not be loaded.')
      }
    })()
    return () => { live = false }
  }, [])

  if (error) return <section className="home-dept guide-sec"><p className="guide-body">{error}</p></section>
  if (!data) return <section className="home-dept guide-sec"><p className="guide-body">Loading the leaderboard.</p></section>

  const s = data.summary
  const pct = s.wcms_total ? Math.round((s.certified / s.wcms_total) * 100) : 0
  const rows = compact ? data.board.slice(0, 3) : data.board

  return (
    <>
      <div className="home-strip">
        <div className="home-stat">
          <div className="home-stat-label">Certified</div>
          <div className="home-stat-value">{s.certified} of {s.wcms_total}</div>
          <div className="home-stat-note">{pct}% of Department WCMs</div>
        </div>
        <div className="home-stat">
          <div className="home-stat-label">Not started</div>
          <div className="home-stat-value">{s.not_started}</div>
          <div className="home-stat-note">{s.in_progress} in progress</div>
        </div>
        <div className="home-stat">
          <div className="home-stat-label">Departments at 100%</div>
          <div className="home-stat-value">{s.departments_complete} of {s.departments_total}</div>
          <div className="home-stat-note">every WCM certified</div>
        </div>
        <div className="home-stat">
          <div className="home-stat-label">Audits started</div>
          <div className="home-stat-value">{s.departments_audit_started} of {s.departments_total}</div>
          <div className="home-stat-note">departments</div>
        </div>
      </div>

      {data.me && (
        <section className="home-dept guide-sec lb-me">
          <h3 className="home-card-title">Your standing</h3>
          <p className="guide-body">
            <b>#{data.me.rank}</b> of {data.total_ranked} with <b>{data.me.total} points</b>.{' '}
            {data.me.in_top ? 'You are in the top 20.' : `${data.me.points_to_top} more points reaches the top 20 score.`}
          </p>
          <p className="guide-body lb-break">
            Certification {data.me.certification} · Hot Labs {data.me.hot_lab_points} ({data.me.hot_labs} attended) · Kickoff {data.me.kickoff} · Audit {data.me.audit}
          </p>
        </section>
      )}

      <section className="home-dept guide-sec">
        <h3 className="home-card-title">{compact ? 'Leaders' : `Top 20 for ${data.school_year}`}</h3>
        <div className={compact ? 'lb-list' : 'lb-list lb-scroll'} role="list">
          {rows.map((e) => (
            <div className={`lb-row${data.me && data.me.rank === e.rank ? ' lb-self' : ''}`} role="listitem" key={e.rank}>
              <span className="lb-rank">{e.rank}</span>
              <span className="lb-who"><b>{e.name}</b><span>{e.department}</span></span>
              <span className="lb-pts">{e.total}</span>
            </div>
          ))}
        </div>
        {compact
          ? <p className="guide-body"><a href="#guide/leaderboard">See the full leaderboard and point chart</a></p>
          : <p className="guide-body lb-note">Hot Lab points come from the people named in each posted meeting note, so someone who joins and stays quiet may be missed. Tell us if a session is missing for you.</p>}
      </section>
    </>
  )
}
