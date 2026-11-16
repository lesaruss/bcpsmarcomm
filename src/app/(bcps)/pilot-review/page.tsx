'use client'

// WCM Pilot Review feedback form (Sean, 2026-11-16). The "You've Been
// Selected" letter asks fifteen school WCMs to spend about 30 minutes in the
// WCM Dashboard, Banner Submission and Proud Points Submission, then tell us
// how it went before launch. This is where they tell us. Open like the
// Calendar Post Request Form, so a WCM who could not sign in can still say
// so: signed in, their name and school fill in from the pilot list; signed
// out, they type their District email. The District Web Team (and admins)
// also get a Responses view here: who has answered out of the fifteen, the
// averages per app, and every comment.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { REQUEST_FORM_CSS } from '@/components/bcps/requestFormCss'
import {
  PILOT_APPS, TRIED, SIGN_IN, TIME_SPENT, LAUNCH_READY, EASE_LABELS, emptyAnswers, labelOf,
  type PilotAnswers, type PilotAppId,
} from '@/lib/pilot-review'

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type Pilot = { full_name: string; school_name: string; lead_name: string }
type RosterRow = { email: string; full_name: string; school_name: string; loc_no: string | null; lead_name: string; has_account: boolean; last_sign_in_at: string | null; responded: boolean }
type Response = {
  id: string; created_at: string; email: string; full_name: string; school_name: string; is_pilot_member: boolean
  overall_rating: number | null; launch_ready: string | null; follow_up_ok: boolean; answers: PilotAnswers
}

export default function PilotReviewPage() {
  return <Suspense fallback={null}><PilotReview /></Suspense>
}

function PilotReview() {
  const params = useSearchParams()
  const [signedIn, setSignedIn] = useState(false)
  const [canSeeResults, setCanSeeResults] = useState(false)
  const [alreadySent, setAlreadySent] = useState(false)
  const [view, setView] = useState<'form' | 'results'>(params.get('view') === 'results' ? 'results' : 'form')

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [website, setWebsite] = useState('')
  const [answers, setAnswers] = useState<PilotAnswers>(emptyAnswers)
  const [rating, setRating] = useState<number | null>(null)
  const [launch, setLaunch] = useState('')
  const [followUp, setFollowUp] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      const h = await authHeaders()
      if (!h.Authorization) return
      const r = await fetch('/api/bcps/pilot-review', { headers: h })
      const j = await r.json().catch(() => ({}))
      if (!j.signed_in) return
      setSignedIn(true); setEmail(j.email || '')
      setCanSeeResults(!!j.can_see_results); setAlreadySent(!!j.already_sent)
      const p = j.pilot as Pilot | null
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string; name?: string }
      setName(n => n || p?.full_name || meta.full_name || meta.name || '')
      setSchool(s => s || p?.school_name || '')
    })()
  }, [])

  const setApp = (id: PilotAppId, patch: Partial<PilotAnswers['apps'][PilotAppId]>) =>
    setAnswers(a => ({ ...a, apps: { ...a.apps, [id]: { ...a.apps[id], ...patch } } }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!signedIn && !/@browardschools\.com$/i.test(email.trim())) { setError('Please use your District email address (@browardschools.com).'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bcps/pilot-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ email, full_name: name, school_name: school, website, answers, overall_rating: rating, launch_ready: launch, follow_up_ok: followUp }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not send your feedback.')
      setDone(true); window.scrollTo({ top: 0 })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your feedback.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mcr">
      <style dangerouslySetInnerHTML={{ __html: REQUEST_FORM_CSS + CSS }} />
      <header className="mcr-header">
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" />
        <span className="div" aria-hidden="true" />
        <span className="ttl">District Web Team</span>
      </header>

      <main className="mcr-main">
        {canSeeResults && (
          <div className="pr-switch" role="group" aria-label="Show">
            <button type="button" aria-pressed={view === 'form'} onClick={() => setView('form')}>Form</button>
            <button type="button" aria-pressed={view === 'results'} onClick={() => setView('results')}>Responses</button>
          </div>
        )}

        {view === 'results' && canSeeResults ? <Results /> : done ? (
          <div className="mcr-card mcr-done">
            <h1>Thank you!</h1>
            <p>Your feedback is with the District Web Team. It goes straight into what we fix before every school gets these apps.</p>
            <p>If something else comes to mind, you can send this form again.</p>
            <button className="mcr-btn" onClick={() => { setDone(false); setAnswers(emptyAnswers()); setRating(null); setLaunch('') }}>Send more feedback</button>
          </div>
        ) : (
          <>
            <h1>WCM Pilot Review</h1>
            <p className="lede">Thank you for testing the new BCPS MarComm apps before launch. Tell us what worked and what got in your way. It takes about 5 minutes. There are no wrong answers: if something confused you, it will confuse other WCMs too.</p>
            {alreadySent && <p className="note pr-sent">You already sent feedback. Thank you! You can send more below.</p>}

            <form onSubmit={submit} noValidate>
              <section className="mcr-card">
                <h2>About you</h2>
                <div className="grid">
                  <label>Your name *
                    <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required />
                  </label>
                  <label>Your school *
                    <input value={school} onChange={e => setSchool(e.target.value)} required />
                  </label>
                </div>
                {signedIn
                  ? <p className="note">Signed in as <b>{email}</b>.</p>
                  : <label className="full">Your District email *
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@browardschools.com" required />
                    </label>}
                <input className="mcr-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} name="website" />
              </section>

              <section className="mcr-card">
                <h2>Signing in</h2>
                <Choice legend="How did signing in to BCPS MarComm go? *" name="sign_in" options={SIGN_IN} value={answers.sign_in} onChange={v => setAnswers(a => ({ ...a, sign_in: v }))} />
                {answers.sign_in && answers.sign_in !== 'smooth' && (
                  <label className="full">What happened?
                    <textarea rows={3} value={answers.sign_in_notes} onChange={e => setAnswers(a => ({ ...a, sign_in_notes: e.target.value }))} placeholder="For example: the email never came, the link expired, the password did not work." />
                  </label>
                )}
              </section>

              {PILOT_APPS.map(app => {
                const x = answers.apps[app.id]
                const used = x.tried === 'done' || x.tried === 'partly'
                return (
                  <section className="mcr-card" key={app.id}>
                    <h2>{app.label}</h2>
                    <p className="hint pr-help">{app.help}</p>
                    <Choice legend={`Did you try ${app.label}? *`} name={`tried_${app.id}`} options={TRIED} value={x.tried} onChange={v => setApp(app.id, { tried: v })} />
                    {used && (
                      <fieldset>
                        <legend>How easy was it? *</legend>
                        <Scale name={`ease_${app.id}`} value={x.ease} onChange={v => setApp(app.id, { ease: v })} labels={EASE_LABELS} />
                      </fieldset>
                    )}
                    {x.tried && (
                      <>
                        <label className="full">{x.tried === 'blocked' ? 'What stopped you?' : 'Was anything confusing, or did anything not work?'}
                          <textarea rows={3} value={x.confusing} onChange={e => setApp(app.id, { confusing: e.target.value })} />
                        </label>
                        <label className="full">What would make it better?
                          <textarea rows={2} value={x.better} onChange={e => setApp(app.id, { better: e.target.value })} />
                        </label>
                      </>
                    )}
                  </section>
                )
              })}

              <section className="mcr-card">
                <h2>Overall</h2>
                <fieldset style={{ marginTop: 0 }}>
                  <legend>Overall, how was your experience? *</legend>
                  <Scale name="overall" value={rating} onChange={setRating} labels={['Poor', 'Fair', 'Good', 'Very good', 'Excellent']} />
                </fieldset>
                <Choice legend="About how long did the review take? *" name="time_spent" options={TIME_SPENT} value={answers.time_spent} onChange={v => setAnswers(a => ({ ...a, time_spent: v }))} />
                <Choice legend="Are these apps ready for every school WCM? *" name="launch" options={LAUNCH_READY} value={launch} onChange={setLaunch} />
                <label className="full">If we could fix one thing before launch, what should it be?
                  <textarea rows={3} value={answers.top_fix} onChange={e => setAnswers(a => ({ ...a, top_fix: e.target.value }))} />
                </label>
                <label className="full">Anything else you want us to know?
                  <textarea rows={3} value={answers.anything_else} onChange={e => setAnswers(a => ({ ...a, anything_else: e.target.value }))} />
                </label>
                <label className="pick full">
                  <input type="checkbox" checked={followUp} onChange={e => setFollowUp(e.target.checked)} />
                  The District Web Team may contact me about my answers.
                </label>
              </section>

              {error && <p className="mcr-error" role="alert">{error}</p>}
              <button className="mcr-btn" type="submit" disabled={busy}>{busy ? 'Sending...' : 'Send feedback'}</button>
            </form>
          </>
        )}
      </main>
    </div>
  )
}

function Choice({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: readonly { id: string; label: string }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className={`pr-choices${options.length === 4 ? ' four' : ''}`}>
        {options.map(o => (
          <label key={o.id} className={`pick box${value === o.id ? ' on' : ''}`}>
            <input type="radio" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Scale({ name, value, onChange, labels }: { name: string; value: number | null; onChange: (v: number) => void; labels: readonly string[] }) {
  return (
    <div className="pr-scale">
      {labels.map((l, i) => (
        <label key={l} className={`pr-step${value === i + 1 ? ' on' : ''}`}>
          <input type="radio" name={name} checked={value === i + 1} onChange={() => onChange(i + 1)} />
          <span className="n">{i + 1}</span>
          <span className="l">{l}</span>
        </label>
      ))}
    </div>
  )
}

// ── Responses (District Web Team, admins, SuperAdmin) ──
function Results() {
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [responses, setResponses] = useState<Response[]>([])
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/bcps/pilot-review?results=1', { headers: await authHeaders() })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.roster) { setErr('Could not load the responses.'); return }
    setRoster(j.roster); setResponses(j.responses)
  }, [])
  useEffect(() => { load() }, [load])

  const stats = useMemo(() => PILOT_APPS.map(app => {
    const used = responses.map(r => r.answers?.apps?.[app.id]).filter(Boolean)
    const eases = used.map(x => x!.ease).filter((n): n is number => typeof n === 'number')
    return {
      app,
      avg: eases.length ? (eases.reduce((s, n) => s + n, 0) / eases.length) : null,
      finished: used.filter(x => x!.tried === 'done').length,
      blocked: used.filter(x => x!.tried === 'blocked').length,
    }
  }), [responses])

  if (err) return <p className="mcr-error">{err}</p>
  if (!roster) return <p className="lede">Loading responses...</p>

  const answered = roster.filter(r => r.responded).length
  const overall = responses.map(r => r.overall_rating).filter((n): n is number => typeof n === 'number')
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <>
      <h1>Pilot Review responses</h1>
      <p className="lede">{answered} of {roster.length} pilot WCMs have sent feedback{responses.length > answered ? `, plus ${responses.length - answered} more response${responses.length - answered === 1 ? '' : 's'} (repeat sends or people not on the pilot list)` : ''}. Share this form link with the pilot WCMs: <b>bcpsmarcomm.com/pilot-review</b></p>

      <div className="pr-tiles">
        <div className="pr-tile"><span>Overall</span><b>{overall.length ? (overall.reduce((s, n) => s + n, 0) / overall.length).toFixed(1) : '—'}</b><small>out of 5</small></div>
        {stats.map(s => (
          <div className="pr-tile" key={s.app.id}><span>{s.app.label}</span><b>{s.avg != null ? s.avg.toFixed(1) : '—'}</b><small>ease of 5 · {s.finished} finished{s.blocked ? ` · ${s.blocked} could not get to it` : ''}</small></div>
        ))}
        <div className="pr-tile"><span>Ready for every school</span><b>{responses.filter(r => r.launch_ready === 'yes').length}</b><small>{responses.filter(r => r.launch_ready === 'after_fixes').length} after fixes · {responses.filter(r => r.launch_ready === 'not_yet').length} not yet</small></div>
      </div>

      <section className="mcr-card">
        <h2>The fifteen pilot WCMs</h2>
        <div className="pr-table-wrap">
          <table className="pr-table">
            <thead><tr><th>WCM</th><th>School</th><th>Lead</th><th>Account</th><th>Feedback</th></tr></thead>
            <tbody>
              {roster.map(r => (
                <tr key={r.email}>
                  <td><b>{r.full_name}</b><br /><a href={`mailto:${r.email}`}>Email</a></td>
                  <td>{r.school_name}</td>
                  <td>{r.lead_name}</td>
                  <td>{r.has_account ? (r.last_sign_in_at ? <span className="pr-ok">Signed in</span> : <span className="pr-mid">Not signed in yet</span>) : <span className="pr-no">No account</span>}</td>
                  <td>{r.responded ? <span className="pr-ok">Sent</span> : <span className="pr-no">Waiting</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {responses.length === 0
        ? <section className="mcr-card"><p className="note" style={{ margin: 0 }}>No feedback yet.</p></section>
        : responses.map(r => (
          <section className="mcr-card pr-resp" key={r.id}>
            <div className="pr-resp-head">
              <div><b>{r.full_name}</b> · {r.school_name}{!r.is_pilot_member && <span className="pr-mid"> not on the pilot list</span>}</div>
              <span className="hint">{fmt(r.created_at)}</span>
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
    </>
  )
}

const CSS = `
.pr-switch { display: inline-flex; border: 1.5px solid #dde3ea; border-radius: 8px; overflow: hidden; margin-bottom: 20px; background: #fff; }
.pr-switch button { font: inherit; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; padding: 8px 14px; border: none; background: #fff; color: #6b7280; cursor: pointer; }
.pr-switch button + button { border-left: 1.5px solid #dde3ea; }
.pr-switch button[aria-pressed="true"] { background: #1672A7; color: #fff; }
.pr-sent { background: #e6f6ea; color: #1a7f37; padding: 10px 14px; border-radius: 6px; margin: 0 0 16px; }
.pr-help { margin: -8px 0 4px; }
.pr-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 8px; }
.pr-choices.four { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 640px) { .pr-choices.four { grid-template-columns: minmax(0, 1fr); } }
.pr-scale { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.pr-step { flex-direction: column !important; align-items: center; gap: 2px !important; border: 1px solid rgba(0,0,0,0.14); border-radius: 6px; padding: 10px 4px; background: #fafafa; cursor: pointer; text-align: center; }
.pr-step input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.pr-step .n { font-size: 18px; font-weight: 900; color: #1a1a1a; }
.pr-step .l { font-size: 11px; font-weight: 600; color: rgba(26,26,26,0.65); }
.pr-step.on { border-color: #1672A7; background: #1672A7; }
.pr-step.on .n, .pr-step.on .l { color: #fff; }
.pr-step:focus-within { outline: 3px solid #1672A7; outline-offset: 1px; }
.mcr form > .mcr-btn { margin-top: 4px; }
.pr-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 12px; margin-bottom: 16px; }
.pr-tile { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.pr-tile span { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .1em; color: #1672A7; }
.pr-tile b { font-size: 28px; font-weight: 900; }
.pr-tile small { font-size: 12px; color: rgba(26,26,26,0.6); }
.pr-table-wrap { overflow-x: auto; }
.pr-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.pr-table th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; padding: 6px 10px 6px 0; border-bottom: 1px solid #e5e7eb; }
.pr-table td { padding: 8px 10px 8px 0; border-bottom: 1px solid #f0f2f5; vertical-align: top; }
.pr-table a, .pr-resp a { color: #0e4e73; font-weight: 700; }
.pr-ok, .pr-mid, .pr-no { display: inline-block; font-size: 11px; font-weight: 800; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
.pr-ok { background: #e6f6ea; color: #1a7f37; }
.pr-mid { background: #fff4d6; color: #8a5a00; }
.pr-no { background: #f3f4f6; color: #6b7280; }
.pr-resp-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; font-size: 15px; }
.pr-resp dl { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: 6px 14px; margin: 0; font-size: 14px; }
.pr-resp dt { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; padding-top: 2px; }
.pr-resp dd { margin: 0; }
.pr-resp q { display: block; quotes: none; margin-top: 4px; padding: 6px 10px; background: #f7f9fb; border-left: 3px solid #1672A7; border-radius: 0 4px 4px 0; white-space: pre-wrap; }
.pr-resp q.better { border-left-color: #2E8B57; }
@media (max-width: 640px) {
  .pr-scale { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
  .pr-step .l { font-size: 9.5px; }
  .pr-resp dl { grid-template-columns: minmax(0, 1fr); }
  .pr-resp dt { padding-top: 8px; }
}
`
