'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CalendarFields, CalendarGuidelines, CALENDAR_CSS, calendarMissing, emptyCalendar, type CalendarState } from '@/components/bcps/CalendarRequestFields'
import { CALENDAR_GUIDELINES } from '@/lib/calendar-request'
import { REQUEST_FORM_CSS as CSS } from '@/components/bcps/requestFormCss'

// MarComm Request Form (Sean, 2026-10-08): replaces the Wufoo MarComm Request
// Form and feeds MarComm Assignments directly. Open to anyone since
// 2026-10-20: signed in, the address comes from the session; signed out, the
// requester types their District email.
//
// What changed from the Wufoo form, from a review of 80 tracked requests:
// - "What are you requesting" and "Where will it be used" were open text and
//   got the same answer, so services are now checkboxes and the second
//   question is gone (the service implies the channel).
// - "Date Needed" was asked twice; it is asked once.
// - The BECON yes/no is now the "Video or BECON coverage" service.
// - A short title is required, so the tracker shows a scannable name instead
//   of the first 140 characters of the description.

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const SERVICES = [
  'Graphic design', 'Social media', 'BCPS Happenings', 'ParentLink message', 'Press release or media advisory',
  'Video or BECON coverage', 'Photography', 'Livestream', 'Website update or pop-up', 'Event support',
  'Marketing campaign', 'Writing or editing', 'Other',
]
const SERVICE_HINTS: Record<string, string> = {
  'Graphic design': 'Flyer, poster, logo, banner',
  'ParentLink message': 'Email, text or call to families',
  'Marketing campaign': 'Several channels over time',
  'Writing or editing': 'Review or polish your copy',
}
const AUDIENCES = ['Students', 'Families', 'Employees', 'Principals and school leaders', 'Community and partners', 'Media', 'School Board', 'Other']
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.heic,.mp4,.mov,.txt'

interface Dept { department_name: string }

export default function MarcommRequestPage() {
  const [email, setEmail] = useState('')
  const [signedIn, setSignedIn] = useState(false)
  const [website, setWebsite] = useState('')
  const [depts, setDepts] = useState<string[]>([])
  const [f, setF] = useState({
    requester_name: '', requester_title: '', requester_phone: '', org_type: '' as '' | 'School' | 'Department', org_name: '',
    title: '', description: '', goal: '', date_needed: '', event_date: '', calendar_needed: false,
  })
  const [services, setServices] = useState<string[]>([])
  const [audiences, setAudiences] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const [calDone, setCalDone] = useState<number | null>(null)
  // The Calendar Post Request, filled in here when the event goes on the
  // District calendar (Sean, 2026-10-20), so nobody fills out two forms.
  const [cal, setCal] = useState<CalendarState>(emptyCalendar)
  const wantCalendar = () => {
    setF(p => ({ ...p, calendar_needed: true }))
    setCal(c => ({
      ...c,
      event_name: c.event_name || f.title, event_date: c.event_date || f.event_date,
      contact_name: c.contact_name || f.requester_name, contact_email: c.contact_email || email, contact_phone: c.contact_phone || f.requester_phone,
      school_department: c.school_department || f.org_name,
      submitter_name: c.submitter_name || f.requester_name, submitter_department: c.submitter_department || f.org_name, submitter_phone: c.submitter_phone || f.requester_phone,
    }))
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) { setEmail(data.user.email); setSignedIn(true) }
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string; name?: string }
      const name = meta.full_name || meta.name
      if (name) setF(p => ({ ...p, requester_name: p.requester_name || name }))
    })
    fetch('/api/bcps/wcm-roster-departments').then(r => r.json()).then(j => {
      const names = ((j.departments ?? []) as Dept[]).map(d => d.department_name).filter(Boolean)
      setDepts(Array.from(new Set(names)))
    }).catch(() => {})
  }, [])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }))
  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!services.length) { setError('Choose at least one service.'); return }
    if (!audiences.length) { setError('Choose at least one audience.'); return }
    if (f.calendar_needed) { const m = calendarMissing(cal); if (m) { setError(m); return } }
    if (!signedIn && !/@browardschools\.com$/i.test(email.trim())) { setError('Please use your District email address (@browardschools.com).'); return }
    setBusy(true)
    try {
      let attachments: { name: string; path: string }[] = []
      if (files.length) {
        const r = await fetch('/api/bcps/marcomm-request-submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'upload_urls', requester_email: email, website, files: files.map(x => ({ name: x.name, size: x.size })) }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Could not upload your files.')
        for (let i = 0; i < j.uploads.length; i++) {
          const u = j.uploads[i]
          const { error: upErr } = await supabase.storage.from('marcomm-attachments').uploadToSignedUrl(u.path, u.token, files[i])
          if (upErr) throw new Error(`Could not upload ${u.name}.`)
          attachments.push({ name: u.name, path: u.path })
        }
      }
      const r = await fetch('/api/bcps/marcomm-request-submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ ...f, requester_email: email, website, event_date: f.event_date || null, services, audiences, attachments, calendar: f.calendar_needed ? cal : undefined }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not submit your request.')
      setDone(j.job_number); setCalDone(j.calendar_number ?? null)
      attachments = []
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mcr">
      <style dangerouslySetInnerHTML={{ __html: CSS + CALENDAR_CSS }} />
      <header className="mcr-header">
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" />
        <span className="div" aria-hidden="true" />
        <span className="ttl">Office of Communications</span>
      </header>

      <main className="mcr-main">
        {done !== null ? (
          <div className="mcr-card mcr-done">
            <h1>Request received</h1>
            <p>Thank you. Your request number is <b>#{done}</b>. The Office of Communications reviews new requests at its weekly meeting and will follow up at <b>{email}</b> if anything else is needed.{calDone ? <> Your calendar post request is <b>#{calDone}</b>; please allow five business days for it to be posted.</> : null}</p>
            <button className="mcr-btn" onClick={() => { setDone(null); setServices([]); setAudiences([]); setFiles([]); setF(p => ({ ...p, title: '', description: '', goal: '', date_needed: '', event_date: '', calendar_needed: false })); setCal(emptyCalendar()) }}>Submit another request</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate={false}>
            {/* Intro copy and paragraphs as on the District's MarComm Request page (Sean, 2026-10-20). */}
            <h1>Submit Your MarComm Request</h1>
            <p className="lede">The Office of Communications provides communications resources for District schools and departments to assist with strategic communications and marketing efforts for internal and external stakeholders. To request our services, please review the information below and complete the online form. Allow our office 10 business days to review your submission and respond. The Office of Communications does NOT guarantee consideration for any submission that does not provide sufficient notice. Submissions for services must be pre-approved by your school principal or department director.</p>
            <p className="lede"><b>Please note:</b> Approved requests are prioritized based on the details/requirements of each submission, as well as the current volume of requests received by the Office of Communications.</p>
            <p className="lede">If you have an emergency (such as a crisis situation or urgent media issue, etc.) please contact our office by phone at <a href="tel:+17543212300">754-321-2300</a>.</p>
            <p className="lede">Required fields are marked with an asterisk.</p>

            <section className="mcr-card">
              <h2>1. About you</h2>
              <div className="grid">
                <label>Your name *<input required value={f.requester_name} onChange={set('requester_name')} autoComplete="name" /></label>
                <label>Title or position<input value={f.requester_title} onChange={set('requester_title')} /></label>
                {signedIn
                  ? <label>District email<input value={email} readOnly aria-readonly="true" className="ro" /></label>
                  : <label>District email *<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@browardschools.com" /></label>}
                <label>District phone<input type="tel" value={f.requester_phone} onChange={set('requester_phone')} autoComplete="tel" /></label>
              </div>
              <fieldset>
                <legend>School or department *</legend>
                <div className="radios">
                  {(['School', 'Department'] as const).map(o => (
                    <label key={o} className="pick"><input type="radio" name="org_type" required checked={f.org_type === o} onChange={() => setF(p => ({ ...p, org_type: o }))} /> {o}</label>
                  ))}
                </div>
              </fieldset>
              <label className="full">Name of your {f.org_type ? f.org_type.toLowerCase() : 'school or department'} *
                <input required value={f.org_name} onChange={set('org_name')} list={f.org_type === 'Department' ? 'mcr-depts' : undefined} />
              </label>
              <input className="mcr-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} name="website" />
              <datalist id="mcr-depts">{depts.map(d => <option key={d} value={d} />)}</datalist>
            </section>

            <section className="mcr-card">
              <h2>2. Your request</h2>
              <label className="full">Short title *<span className="hint">For example: Fall College Fair, October 29</span>
                <input required maxLength={200} value={f.title} onChange={set('title')} />
              </label>
              <fieldset>
                <legend>What do you need? * <span className="hint">Choose all that apply</span></legend>
                <div className="checks">
                  {SERVICES.map(s => (
                    <label key={s} className={`pick box ${services.includes(s) ? 'on' : ''}`}>
                      <input type="checkbox" checked={services.includes(s)} onChange={() => toggle(services, setServices, s)} />
                      <span>{s}{SERVICE_HINTS[s] && <small>{SERVICE_HINTS[s]}</small>}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>Who needs to be reached? * <span className="hint">Choose all that apply</span></legend>
                <div className="checks">
                  {AUDIENCES.map(a => (
                    <label key={a} className={`pick box ${audiences.includes(a) ? 'on' : ''}`}>
                      <input type="checkbox" checked={audiences.includes(a)} onChange={() => toggle(audiences, setAudiences, a)} /> <span>{a}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="full">Describe the request *<span className="hint">What it is, key details (dates, times, location), and anything we should say or avoid</span>
                <textarea required rows={6} value={f.description} onChange={set('description')} />
              </label>
              <label className="full">Why is this important for your school or department? *
                <textarea required rows={3} value={f.goal} onChange={set('goal')} />
              </label>
            </section>

            <section className="mcr-card">
              <h2>3. Timing and files</h2>
              <div className="grid">
                <label>Date you need it ready to use *<input type="date" required value={f.date_needed} onChange={set('date_needed')} /><span className="hint">The day it must be finished, not the event date. Campaigns, video and print need the most lead time, so submit as early as you can.</span></label>
                <label>Event date, if there is one<input type="date" value={f.event_date} onChange={set('event_date')} /></label>
              </div>
              {/* Worded like the old form (Jennifer Hodder, 2026-10-20). A Yes opens
                  the Calendar Post Request below instead of sending people to Wufoo. */}
              <fieldset>
                <legend>Does this event need to be posted on the District&apos;s Online Calendar?</legend>
                <div className="radios">
                  <label className="pick"><input type="radio" name="cal" checked={f.calendar_needed} onChange={wantCalendar} /> Yes</label>
                  <label className="pick"><input type="radio" name="cal" checked={!f.calendar_needed} onChange={() => setF(p => ({ ...p, calendar_needed: false }))} /> No</label>
                </div>
                {f.calendar_needed && <p className="note">Please complete the calendar post request in step 4 below.</p>}
              </fieldset>
              <label className="full">Attach files <span className="hint">Up to 5 files, 25 MB each: PDF, Word, Excel, PowerPoint, images or video</span>
                <input type="file" multiple accept={ACCEPT} onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              </label>
              {files.length > 0 && <ul className="files">{files.map(x => <li key={x.name}>{x.name}</li>)}</ul>}
            </section>

            {f.calendar_needed && (
              <section className="mcr-card">
                <h2>4. District calendar post</h2>
                <p className="hint" style={{ margin: '-6px 0 14px' }}>{CALENDAR_GUIDELINES.notice}</p>
                <CalendarGuidelines ack={cal.guidelines_ack} onAck={v => setCal(c => ({ ...c, guidelines_ack: v }))} />
                {cal.guidelines_ack
                  ? <div style={{ marginTop: 18 }}><CalendarFields value={cal} onChange={setCal} /></div>
                  : <p className="note">Check the box above to fill in the calendar post.</p>}
              </section>
            )}

            {error && <p className="mcr-error" role="alert">{error}</p>}
            <button className="mcr-btn" type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</button>
          </form>
        )}
      </main>
    </div>
  )
}

