'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// MarComm Request Form (Sean, 2026-10-08): replaces the Wufoo MarComm Request
// Form and feeds MarComm Assignments directly. Signed-in District employees
// only (the (bcps) layout redirects anyone without a session to /login); the
// signed-in address is the requester email of record.
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
const CALENDAR_FORM = 'https://browardschools.wufoo.com/forms/pnb9q6q0udguyg/'
const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.heic,.mp4,.mov,.txt'

interface Dept { department_name: string }

export default function MarcommRequestPage() {
  const [email, setEmail] = useState('')
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
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
    setBusy(true)
    try {
      let attachments: { name: string; path: string }[] = []
      if (files.length) {
        const r = await fetch('/api/bcps/marcomm-request-submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'upload_urls', files: files.map(x => ({ name: x.name, size: x.size })) }),
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
        body: JSON.stringify({ ...f, event_date: f.event_date || null, services, audiences, attachments }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Could not submit your request.')
      setDone(j.job_number)
      attachments = []
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mcr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="mcr-header">
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" />
        <span className="div" aria-hidden="true" />
        <span className="ttl">Office of Communications</span>
      </header>

      <main className="mcr-main">
        {done !== null ? (
          <div className="mcr-card mcr-done">
            <h1>Request received</h1>
            <p>Thank you. Your request number is <b>#{done}</b>. The Office of Communications reviews new requests at its weekly meeting and will follow up at <b>{email}</b> if anything else is needed.</p>
            <button className="mcr-btn" onClick={() => { setDone(null); setServices([]); setAudiences([]); setFiles([]); setF(p => ({ ...p, title: '', description: '', goal: '', date_needed: '', event_date: '', calendar_needed: false })) }}>Submit another request</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate={false}>
            <h1>MarComm Request</h1>
            <p className="lede">Request support from the Office of Communications: design, social media, ParentLink, press, video and BECON, web and more. Required fields are marked with an asterisk.</p>

            <section className="mcr-card">
              <h2>1. About you</h2>
              <div className="grid">
                <label>Your name *<input required value={f.requester_name} onChange={set('requester_name')} autoComplete="name" /></label>
                <label>Title or position<input value={f.requester_title} onChange={set('requester_title')} /></label>
                <label>District email<input value={email} readOnly aria-readonly="true" className="ro" /></label>
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
                <label>Date you need it by *<input type="date" required value={f.date_needed} onChange={set('date_needed')} /></label>
                <label>Event date, if there is one<input type="date" value={f.event_date} onChange={set('event_date')} /></label>
              </div>
              <fieldset>
                <legend>Should this event go on the District&apos;s online calendar?</legend>
                <div className="radios">
                  <label className="pick"><input type="radio" name="cal" checked={f.calendar_needed} onChange={() => setF(p => ({ ...p, calendar_needed: true }))} /> Yes</label>
                  <label className="pick"><input type="radio" name="cal" checked={!f.calendar_needed} onChange={() => setF(p => ({ ...p, calendar_needed: false }))} /> No</label>
                </div>
                {f.calendar_needed && <p className="note">Please also complete the <a href={CALENDAR_FORM} target="_blank" rel="noopener noreferrer">Calendar Request Form</a>.</p>}
              </fieldset>
              <label className="full">Attach files <span className="hint">Up to 5 files, 25 MB each: PDF, Word, Excel, PowerPoint, images or video</span>
                <input type="file" multiple accept={ACCEPT} onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 5))} />
              </label>
              {files.length > 0 && <ul className="files">{files.map(x => <li key={x.name}>{x.name}</li>)}</ul>}
            </section>

            {error && <p className="mcr-error" role="alert">{error}</p>}
            <button className="mcr-btn" type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit request'}</button>
          </form>
        )}
      </main>
    </div>
  )
}

const CSS = `
.mcr { min-height: 100vh; background: #f5f5f5; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; }
.mcr-header { position: sticky; top: 0; z-index: 10; height: 64px; background: #fff; border-bottom: 3px solid #1672A7; display: flex; align-items: center; gap: 18px; padding: 0 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.mcr-header img { height: 42px; width: auto; }
.mcr-header .div { width: 1px; height: 32px; background: rgba(0,0,0,0.12); }
.mcr-header .ttl { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: #1672A7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mcr-main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
.mcr h1 { font-size: clamp(26px, 4vw, 36px); font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin: 0 0 8px; }
.lede { font-size: 15px; line-height: 1.7; color: rgba(26,26,26,0.75); margin: 0 0 22px; }
.mcr-card { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 22px 24px; margin-bottom: 16px; }
.mcr h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #1672A7; margin: 0 0 16px; }
.mcr label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: #1a1a1a; min-width: 0; }
.mcr label.full { margin-top: 14px; }
.mcr .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.mcr input:not([type=checkbox]):not([type=radio]), .mcr textarea, .mcr select { font: inherit; font-size: 14px; font-weight: 400; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.22); border-radius: 6px; background: #fff; color: #1a1a1a; width: 100%; box-sizing: border-box; }
.mcr input:focus-visible, .mcr textarea:focus-visible { outline: 3px solid #1672A7; outline-offset: 1px; }
.mcr input.ro { background: #f3f4f6; color: rgba(26,26,26,0.75); }
.mcr fieldset { border: none; padding: 0; margin: 16px 0 0; }
.mcr legend { font-size: 13px; font-weight: 700; margin-bottom: 8px; padding: 0; }
.hint { font-size: 12px; font-weight: 400; color: rgba(26,26,26,0.6); }
.radios { display: flex; gap: 16px; flex-wrap: wrap; }
.pick { flex-direction: row !important; align-items: center; gap: 8px !important; font-weight: 600 !important; cursor: pointer; }
.checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 8px; }
.pick.box { align-items: flex-start; border: 1px solid rgba(0,0,0,0.14); border-radius: 6px; padding: 10px 12px; background: #fafafa; }
.pick.box.on { border-color: #1672A7; background: rgba(22,114,167,0.06); }
.pick.box input { margin-top: 2px; }
.pick small { display: block; font-size: 11px; font-weight: 400; color: rgba(26,26,26,0.6); margin-top: 2px; }
.note { font-size: 13px; margin: 8px 0 0; }
.note a { color: #0e4e73; font-weight: 700; }
.files { font-size: 13px; margin: 8px 0 0 18px; }
.mcr-btn { font: inherit; font-size: 14px; font-weight: 800; padding: 13px 22px; border-radius: 6px; border: none; background: #1672A7; color: #fff; cursor: pointer; }
.mcr-btn:disabled { opacity: 0.6; cursor: default; }
.mcr-error { color: #b91c1c; font-size: 14px; font-weight: 600; }
.mcr-done p { font-size: 15px; line-height: 1.7; }
@media (max-width: 640px) {
  .mcr-header { padding: 0 16px; gap: 12px; }
  .mcr-header img { height: 34px; }
  .mcr-main { padding: 24px 16px 48px; }
  .mcr .grid { grid-template-columns: minmax(0,1fr); }
  .mcr-card { padding: 18px 16px; }
}
`
