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

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { REQUEST_FORM_CSS } from '@/components/bcps/requestFormCss'
import PilotReviewResults from '@/components/bcps/PilotReviewResults'
import {
  PILOT_APPS, TRIED, SIGN_IN, TIME_SPENT, LAUNCH_READY, EASE_LABELS, emptyAnswers,
  type PilotAnswers, type PilotAppId,
} from '@/lib/pilot-review'

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type Pilot = { full_name: string; school_name: string; lead_name: string }

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

        {view === 'results' && canSeeResults ? <PilotReviewResults /> : done ? (
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
@media (max-width: 640px) {
  .pr-scale { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
  .pr-step .l { font-size: 9.5px; }
}
`
