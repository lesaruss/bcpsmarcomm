'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CalendarFields, CalendarGuidelines, CALENDAR_CSS, calendarMissing, emptyCalendar, type CalendarState } from '@/components/bcps/CalendarRequestFields'
import { CALENDAR_GUIDELINES } from '@/lib/calendar-request'
import { REQUEST_FORM_CSS } from '@/components/bcps/requestFormCss'

// Calendar Post Guidelines & Request Form (Sean, 2026-10-20): the Wufoo form
// on bcpsmarcomm.com, so the District can stop using Wufoo. Two steps like
// the original: the guidelines, then the request. Open to anyone with the
// link, like the MarComm Request Form: signed in, the address comes from the
// session; signed out, the requester types their District email. The same
// fields open inside the MarComm Request Form when its event goes on the
// calendar.

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function CalendarRequestPage() {
  const [email, setEmail] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [website, setWebsite] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [cal, setCal] = useState<CalendarState>(emptyCalendar)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user?.email) return
      setEmail(data.user.email); setSignedIn(true)
      const meta = (data.user.user_metadata ?? {}) as { full_name?: string; name?: string }
      const name = meta.full_name || meta.name || ''
      setCal(c => ({ ...c, contact_email: c.contact_email || data.user!.email!, contact_name: c.contact_name || name, submitter_name: c.submitter_name || name }))
    })
  }, [])

  const next = () => {
    if (!cal.guidelines_ack) { setError('Check the box to confirm you read the guidelines.'); return }
    setError(''); setStep(2); window.scrollTo({ top: 0 })
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!signedIn && !/@browardschools\.com$/i.test(email.trim())) { setError('Please use your District email address (@browardschools.com).'); return }
    const m = calendarMissing(cal)
    if (m) { setError(m.replace('For the calendar post, please', 'Please')); return }
    setBusy(true)
    try {
      const r = await fetch('/api/bcps/calendar-request-submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ requester_email: email, website, calendar: cal }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not submit your request.')
      setDone(j.request_number)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mcr">
      <style dangerouslySetInnerHTML={{ __html: REQUEST_FORM_CSS + CALENDAR_CSS + CSS }} />
      <header className="mcr-header">
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" />
        <span className="div" aria-hidden="true" />
        <span className="ttl">Office of Communications</span>
      </header>

      <main className="mcr-main">
        {done !== null ? (
          <div className="mcr-card mcr-done">
            <h1>Request received</h1>
            <p>Thank you. Your calendar post request number is <b>#{done}</b>. Please allow five business days for our office to upload your calendar submission. We will follow up at <b>{email}</b> if anything else is needed.</p>
            <button className="mcr-btn" onClick={() => { setDone(null); setStep(1); setCal(c => ({ ...emptyCalendar(), contact_name: c.contact_name, contact_email: c.contact_email, contact_phone: c.contact_phone, school_department: c.school_department, submitter_name: c.submitter_name, submitter_department: c.submitter_department, submitter_phone: c.submitter_phone })) }}>Submit another request</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h1>Calendar Post Guidelines &amp; Request Form</h1>
            <p className="lede">({CALENDAR_GUIDELINES.notice})</p>
            <ol className="cal-steps" aria-label="Steps">
              <li className={step === 1 ? 'on' : 'done'}><span>1</span> Calendar post guidelines</li>
              <li className={step === 2 ? 'on' : ''}><span>2</span> Calendar post request form</li>
            </ol>

            {step === 1 ? (
              <section className="mcr-card">
                <CalendarGuidelines ack={cal.guidelines_ack} onAck={v => setCal(c => ({ ...c, guidelines_ack: v }))} />
                {error && <p className="mcr-error" role="alert">{error}</p>}
                <div className="cal-nav"><span /> <span className="hint">Step 1 of 2</span><button type="button" className="mcr-btn" onClick={next}>Next</button></div>
              </section>
            ) : (
              <section className="mcr-card">
                {!signedIn && (
                  <label className="full" style={{ marginTop: 0, marginBottom: 14 }}>Your District email *
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@browardschools.com" />
                  </label>
                )}
                <input className="mcr-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} name="website" />
                <CalendarFields value={cal} onChange={setCal} />
                {error && <p className="mcr-error" role="alert">{error}</p>}
                <div className="cal-nav">
                  <button type="button" className="mcr-btn ghost" onClick={() => { setStep(1); setError('') }}>Back</button>
                  <span className="hint">Step 2 of 2</span>
                  <button className="mcr-btn" type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit'}</button>
                </div>
              </section>
            )}
          </form>
        )}
      </main>
    </div>
  )
}

const CSS = `
.cal-steps { list-style: none; display: flex; gap: 24px; flex-wrap: wrap; padding: 12px 0; margin: 0 0 16px; border-top: 1px dotted rgba(0,0,0,0.2); border-bottom: 1px dotted rgba(0,0,0,0.2); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(26,26,26,0.55); }
.cal-steps li { display: flex; align-items: center; gap: 8px; }
.cal-steps li span { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.25); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
.cal-steps li.on { color: #1a1a1a; }
.cal-steps li.on span { background: #1672A7; border-color: #1672A7; color: #fff; }
.cal-steps li.done span { background: rgba(22,114,167,0.12); border-color: #1672A7; color: #0e4e73; }
.cal-nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 20px; }
.mcr-btn.ghost { background: #fff; color: #0e4e73; border: 1px solid #1672A7; }
`
