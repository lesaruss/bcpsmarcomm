'use client'

// WCM Pilot Review responses (Sean, 2026-11-16): who of the fifteen pilot
// WCMs has answered, whether they have an account yet, the averages per app,
// launch readiness, and every comment. Shown on /pilot-review for the District
// Web Team and inside the District Web Team Guide on the Schools side. The
// API answers 403 to anyone else, so it never draws for them.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { PILOT_APPS, TRIED, SIGN_IN, TIME_SPENT, LAUNCH_READY, EASE_LABELS, labelOf, type PilotAnswers } from '@/lib/pilot-review'

const supabase = createClient()

type RosterRow = { email: string; full_name: string; school_name: string; loc_no: string | null; lead_name: string; has_account: boolean; last_sign_in_at: string | null; responded: boolean }
type Response = {
  id: string; created_at: string; email: string; full_name: string; school_name: string; is_pilot_member: boolean
  overall_rating: number | null; launch_ready: string | null; follow_up_ok: boolean; answers: PilotAnswers
}

export default function PilotReviewResults({ showTitle = true }: { showTitle?: boolean }) {
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [err, setErr] = useState('')
  const [lead, setLead] = useState('')

  const load = useCallback(async () => {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const r = await fetch('/api/bcps/pilot-review?results=1', { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.roster) { setErr(r.status === 403 ? 'The pilot responses are for the District Web Team.' : 'Could not load the responses.'); return }
    setRoster(j.roster); setResponses(j.responses)
  }, [])
  useEffect(() => { load() }, [load])

  const leads = useMemo(() => Array.from(new Set((roster ?? []).map(r => r.lead_name))).sort(), [roster])
  const shownRoster = (roster ?? []).filter(r => !lead || r.lead_name === lead)
  const shownEmails = new Set(shownRoster.map(r => r.email))
  const shownResponses = lead ? responses.filter(r => shownEmails.has((r.email || '').toLowerCase())) : responses

  const stats = useMemo(() => PILOT_APPS.map(app => {
    const used = shownResponses.map(r => r.answers?.apps?.[app.id]).filter(Boolean)
    const eases = used.map(x => x!.ease).filter((n): n is number => typeof n === 'number')
    return {
      app,
      avg: eases.length ? eases.reduce((s, n) => s + n, 0) / eases.length : null,
      finished: used.filter(x => x!.tried === 'done').length,
      blocked: used.filter(x => x!.tried === 'blocked').length,
    }
  }), [shownResponses])

  if (err) return <p className="prr-note">{err}</p>
  if (!roster) return <p className="prr-note">Loading responses...</p>

  const answered = shownRoster.filter(r => r.responded).length
  const accounts = shownRoster.filter(r => r.has_account).length
  const overall = shownResponses.map(r => r.overall_rating).filter((n): n is number => typeof n === 'number')
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="prr">
      <style>{CSS}</style>
      {showTitle && <h1 className="prr-h1">Pilot Review responses</h1>}
      <div className="prr-bar">
        <p className="prr-lede"><b>{answered} of {shownRoster.length}</b> have sent feedback. <b>{accounts} of {shownRoster.length}</b> have an account. The form: <a href="/pilot-review" target="_blank" rel="noopener noreferrer">bcpsmarcomm.com/pilot-review</a></p>
        <select className="prr-select" value={lead} onChange={e => setLead(e.target.value)} aria-label="Show schools for">
          <option value="">Every lead</option>
          {leads.map(l => <option key={l} value={l}>{l}&rsquo;s schools</option>)}
        </select>
      </div>

      <div className="prr-tiles">
        <div className="prr-tile"><span>Overall</span><b>{overall.length ? (overall.reduce((s, n) => s + n, 0) / overall.length).toFixed(1) : '—'}</b><small>out of 5</small></div>
        {stats.map(s => (
          <div className="prr-tile" key={s.app.id}><span>{s.app.label}</span><b>{s.avg != null ? s.avg.toFixed(1) : '—'}</b><small>ease out of 5 · {s.finished} finished{s.blocked ? ` · ${s.blocked} could not get to it` : ''}</small></div>
        ))}
        <div className="prr-tile"><span>Ready for every school</span><b>{shownResponses.filter(r => r.launch_ready === 'yes').length}</b><small>{shownResponses.filter(r => r.launch_ready === 'after_fixes').length} after fixes · {shownResponses.filter(r => r.launch_ready === 'not_yet').length} not yet</small></div>
      </div>

      <section className="prr-card">
        <h2 className="prr-h2">The pilot WCMs</h2>
        <div className="prr-table-wrap">
          <table className="prr-table">
            <thead><tr><th>WCM</th><th>School</th><th>Lead</th><th>Account</th><th>Feedback</th></tr></thead>
            <tbody>
              {shownRoster.map(r => (
                <tr key={r.email}>
                  <td><b>{r.full_name}</b><br /><a href={`mailto:${r.email}`}>Email</a></td>
                  <td>{r.school_name}</td>
                  <td>{r.lead_name}</td>
                  <td>{r.has_account ? (r.last_sign_in_at ? <span className="prr-ok">Signed in</span> : <span className="prr-mid">Not signed in yet</span>) : <span className="prr-no">No account</span>}</td>
                  <td>{r.responded ? <span className="prr-ok">Sent</span> : <span className="prr-no">Waiting</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {shownResponses.length === 0
        ? <section className="prr-card"><p className="prr-note" style={{ margin: 0 }}>No feedback yet.</p></section>
        : shownResponses.map(r => (
          <section className="prr-card prr-resp" key={r.id}>
            <div className="prr-resp-head">
              <div><b>{r.full_name}</b> · {r.school_name}{!r.is_pilot_member && <span className="prr-mid"> not on the pilot list</span>}</div>
              <span className="prr-when">{fmt(r.created_at)}</span>
            </div>
            <dl>
              <dt>Overall</dt><dd>{r.overall_rating ?? '—'} of 5 · {labelOf(LAUNCH_READY, r.launch_ready)}</dd>
              <dt>Signing in</dt><dd>{labelOf(SIGN_IN, r.answers?.sign_in)}{r.answers?.sign_in_notes ? <q>{r.answers.sign_in_notes}</q> : null}</dd>
              {PILOT_APPS.map(app => {
                const x = r.answers?.apps?.[app.id]
                if (!x) return null
                return (
                  <div key={app.id} style={{ display: 'contents' }}>
                    <dt>{app.label}</dt>
                    <dd>
                      {labelOf(TRIED, x.tried)}{x.ease ? ` · ${EASE_LABELS[x.ease - 1]}` : ''}
                      {x.confusing && <q>{x.confusing}</q>}
                      {x.better && <q className="better">{x.better}</q>}
                    </dd>
                  </div>
                )
              })}
              <dt>Time</dt><dd>{labelOf(TIME_SPENT, r.answers?.time_spent)}</dd>
              {r.answers?.top_fix && <><dt>Fix first</dt><dd><q>{r.answers.top_fix}</q></dd></>}
              {r.answers?.anything_else && <><dt>Anything else</dt><dd><q>{r.answers.anything_else}</q></dd></>}
              <dt>Follow up</dt><dd>{r.follow_up_ok ? <a href={`mailto:${r.email}`}>Yes, {r.email}</a> : 'No'}</dd>
            </dl>
          </section>
        ))}
    </div>
  )
}

const CSS = `
.prr { text-align: left; }
.prr-h1 { font-size: clamp(22px, 3vw, 30px); font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin: 0 0 8px; }
.prr-h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #1672A7; margin: 0 0 14px; }
.prr-bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 14px; }
.prr-lede { font-size: 14px; line-height: 1.6; color: rgba(26,26,26,0.8); margin: 0; }
.prr-lede a, .prr-table a, .prr-resp a { color: #0e4e73; font-weight: 700; }
.prr-select { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.22); border-radius: 6px; background: #fff; }
.prr-note { font-size: 14px; color: rgba(26,26,26,0.7); }
.prr-card { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 18px 20px; margin-bottom: 14px; }
.prr-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)); gap: 12px; margin-bottom: 14px; }
.prr-tile { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.prr-tile span { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #1672A7; }
.prr-tile b { font-size: 28px; font-weight: 900; }
.prr-tile small { font-size: 12px; color: rgba(26,26,26,0.6); }
.prr-table-wrap { overflow-x: auto; }
.prr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.prr-table th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; padding: 6px 10px 6px 0; border-bottom: 1px solid #e5e7eb; }
.prr-table td { padding: 8px 10px 8px 0; border-bottom: 1px solid #f0f2f5; vertical-align: top; }
.prr-ok, .prr-mid, .prr-no { display: inline-block; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.prr-ok { background: #e6f6ea; color: #1a7f37; }
.prr-mid { background: #fff4d6; color: #8a5a00; }
.prr-no { background: #f3f4f6; color: #6b7280; }
.prr-resp-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; font-size: 15px; }
.prr-when { font-size: 12px; color: rgba(26,26,26,0.6); }
.prr-resp dl { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 6px 14px; margin: 0; font-size: 14px; }
.prr-resp dt { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; padding-top: 2px; }
.prr-resp dd { margin: 0; }
.prr-resp q { display: block; quotes: none; margin-top: 4px; padding: 6px 10px; background: #f7f9fb; border-left: 3px solid #1672A7; border-radius: 0 4px 4px 0; white-space: pre-wrap; }
.prr-resp q.better { border-left-color: #2E8B57; }
@media (max-width: 640px) {
  .prr-resp dl { grid-template-columns: minmax(0, 1fr); }
  .prr-resp dt { padding-top: 8px; }
}
`
