'use client'
// The Calendar Post Request: the guidelines and the request fields from the
// Wufoo form (Sean, 2026-10-20). Used on its own at /calendar-request and
// inside the MarComm Request Form when the event goes on the District
// calendar. Styles come from the page that uses it (the .mcr form styles).

import { CALENDAR_GUIDELINES as G, CALENDAR_KINDS, type CalendarKind } from '@/lib/calendar-request'

export interface CalendarState {
  guidelines_ack: boolean
  kind: CalendarKind | ''
  event_name: string; event_date: string; start_time: string; end_time: string
  virtual_link: string; virtual_phone: string; virtual_conference_id: string
  additional_info: string
  location: string; address_street: string; address_line2: string; city: string; state: string; zip: string
  website_link: string
  contact_name: string; contact_email: string; contact_phone: string; school_department: string
  submitter_name: string; submitter_department: string; submitter_phone: string
}

export const emptyCalendar = (): CalendarState => ({
  guidelines_ack: false, kind: '', event_name: '', event_date: '', start_time: '', end_time: '',
  virtual_link: '', virtual_phone: '', virtual_conference_id: '', additional_info: '',
  location: '', address_street: '', address_line2: '', city: '', state: 'Florida', zip: '', website_link: '',
  contact_name: '', contact_email: '', contact_phone: '', school_department: '',
  submitter_name: '', submitter_department: '', submitter_phone: '',
})

// What the browser checks before sending (the server checks again).
export function calendarMissing(c: CalendarState): string | null {
  const virtual = c.kind === 'virtual_meeting'
  const missing: string[] = []
  if (!c.guidelines_ack) missing.push('that you read the calendar guidelines')
  if (!c.kind) missing.push('the type of event')
  if (!c.event_name.trim()) missing.push('the meeting or event name')
  if (!c.event_date) missing.push('the date')
  if (!c.start_time) missing.push('the start time')
  if (!c.end_time) missing.push('the end time')
  if (!virtual && !c.location.trim()) missing.push('the location')
  if (!virtual && !c.address_street.trim()) missing.push('the street address')
  if (!c.contact_name.trim()) missing.push('the contact name')
  if (!c.submitter_name.trim()) missing.push("the submitter's name")
  if (!c.submitter_department.trim()) missing.push("the submitter's department")
  if (!c.submitter_phone.trim()) missing.push("the submitter's phone number")
  if (missing.length) return `For the calendar post, please add ${missing.join(', ')}.`
  if (c.start_time && c.end_time && c.end_time <= c.start_time) return 'For the calendar post, the end time must be after the start time.'
  return null
}

export function CalendarGuidelines({ ack, onAck }: { ack: boolean; onAck: (v: boolean) => void }) {
  return (
    <div className="cal-guidelines">
      {G.intro.map(p => <p key={p}>{p}</p>)}
      <p><b>Examples of public meetings and events that will be posted:</b></p>
      <ul>{G.posted.map(x => <li key={x}>{x}</li>)}</ul>
      <p><b>Examples of public meetings and events that will not be posted:</b></p>
      <ul>{G.notPosted.map(x => <li key={x}>{x}</li>)}</ul>
      <p>{G.closing}</p>
      <label className="pick cal-ack"><input type="checkbox" checked={ack} onChange={e => onAck(e.target.checked)} /> I have read and understand these guidelines *</label>
    </div>
  )
}

export function CalendarFields({ value: c, onChange, showSubmitter = true }: { value: CalendarState; onChange: (c: CalendarState) => void; showSubmitter?: boolean }) {
  const set = (k: keyof CalendarState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...c, [k]: e.target.value })
  const virtual = c.kind === 'virtual_meeting'
  return (
    <div className="cal-fields">
      <fieldset>
        <legend>Check one *</legend>
        <div className="radios">
          {CALENDAR_KINDS.map(k => (
            <label key={k.id} className="pick"><input type="radio" name="cal_kind" checked={c.kind === k.id} onChange={() => onChange({ ...c, kind: k.id })} /> {k.label}</label>
          ))}
        </div>
      </fieldset>
      <label className="full">Meeting/Special Event Name *<input value={c.event_name} onChange={set('event_name')} maxLength={200} /></label>
      <div className="grid three">
        <label>Date *<input type="date" value={c.event_date} onChange={set('event_date')} /></label>
        <label>Start time *<input type="time" value={c.start_time} onChange={set('start_time')} /></label>
        <label>End time *<input type="time" value={c.end_time} onChange={set('end_time')} /></label>
      </div>
      {virtual && (
        <div className="grid">
          <label>Virtual meeting link<input type="url" value={c.virtual_link} onChange={set('virtual_link')} placeholder="https://" /></label>
          <label>Virtual meeting phone number<input type="tel" value={c.virtual_phone} onChange={set('virtual_phone')} /></label>
          <label>Virtual meeting conference ID<input value={c.virtual_conference_id} onChange={set('virtual_conference_id')} /></label>
        </div>
      )}
      {!virtual && <>
        <label className="full">Location *<span className="hint">For example: Kathleen C. Wright Administrative Center, Board Room</span><input value={c.location} onChange={set('location')} /></label>
        <label className="full">Street address *<input value={c.address_street} onChange={set('address_street')} autoComplete="address-line1" /></label>
        <label className="full">Address line 2<input value={c.address_line2} onChange={set('address_line2')} autoComplete="address-line2" /></label>
        <div className="grid three">
          <label>City<input value={c.city} onChange={set('city')} autoComplete="address-level2" /></label>
          <label>State<input value={c.state} onChange={set('state')} autoComplete="address-level1" /></label>
          <label>ZIP code<input value={c.zip} onChange={set('zip')} inputMode="numeric" autoComplete="postal-code" /></label>
        </div>
      </>}
      <label className="full">Additional information<span className="hint">Indicate if this event requires tickets, registration or invitation and include details.</span>
        <textarea rows={3} value={c.additional_info} onChange={set('additional_info')} />
      </label>
      <label className="full">Website link (if desired)<input type="url" value={c.website_link} onChange={set('website_link')} placeholder="https://" /></label>
      <div className="grid">
        <label>Contact name *<input value={c.contact_name} onChange={set('contact_name')} /></label>
        <label>Contact email<input type="email" value={c.contact_email} onChange={set('contact_email')} /></label>
        <label>Contact phone<input type="tel" value={c.contact_phone} onChange={set('contact_phone')} /></label>
        <label>School/Department<input value={c.school_department} onChange={set('school_department')} /></label>
      </div>
      {showSubmitter && <>
        <p className="cal-confirm">{G.confirm}</p>
        <div className="grid three">
          <label>Submitter&apos;s name *<input value={c.submitter_name} onChange={set('submitter_name')} /></label>
          <label>Department *<input value={c.submitter_department} onChange={set('submitter_department')} /></label>
          <label>Phone number *<input type="tel" value={c.submitter_phone} onChange={set('submitter_phone')} /></label>
        </div>
      </>}
    </div>
  )
}

export const CALENDAR_CSS = `
.cal-guidelines { font-size: 14px; line-height: 1.65; color: rgba(26,26,26,0.85); }
.cal-guidelines p { margin: 0 0 10px; }
.cal-guidelines ul { margin: 0 0 12px 20px; padding: 0; }
.cal-guidelines li { margin-bottom: 4px; }
.cal-ack { margin-top: 14px; padding: 12px 14px; border: 1px solid #1672A7; border-radius: 6px; background: rgba(22,114,167,0.06); }
.cal-fields .grid.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
.cal-fields .grid { margin-top: 14px; }
.cal-confirm { font-size: 14px; font-weight: 700; margin: 18px 0 0; }
@media (max-width: 640px) { .cal-fields .grid.three { grid-template-columns: minmax(0,1fr); } }
`
