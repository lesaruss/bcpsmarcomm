// Calendar Post Requests (Sean, 2026-10-20): the Wufoo "Calendar Post
// Guidelines & Request Form" on bcpsmarcomm.com. Shared by the form on its
// own (/api/bcps/calendar-request-submit) and the MarComm Request Form, which
// carries the same fields when the event goes on the District calendar
// (/api/bcps/marcomm-request-submit). Table: bcps_calendar_requests.

export const CALENDAR_KINDS = [
  { id: 'meeting', label: 'Meeting' },
  { id: 'special_event', label: 'Special Event' },
  { id: 'virtual_meeting', label: 'Virtual Meeting' },
] as const
export type CalendarKind = typeof CALENDAR_KINDS[number]['id']
export const kindLabel = (k: string) => CALENDAR_KINDS.find(x => x.id === k)?.label ?? k

// The guidelines, word for word from the Wufoo form's first page.
export const CALENDAR_GUIDELINES = {
  intro: [
    'The BCPS Calendar is available for public viewers who are interested in public meetings and events that occur during the school year.',
    'A calendar post does not satisfy a public notice requirement.',
    'The BCPS Calendar Post Request Form must be approved by the department head and appropriate Senior Leadership Team member. It is required to complete all information about the meeting or event, including date, start and end times, location, and contact person.',
  ],
  posted: [
    'All School Board meetings/workshops',
    'District community meetings/forums/public hearings',
    'Districtwide special events (i.e.) Teacher of the Year, Community Involvement Awards, College Fair and Gifted & Talented Symposium',
    'Advisory/committee meetings and events',
  ],
  notPosted: [
    'Regularly scheduled division or department meetings',
    'Ad hoc committee meetings',
    'Standard, internal operational meetings',
    'Individual school events',
  ],
  closing: 'Please check the BCPS Calendar frequently for updates and changes.',
  notice: 'Please allow five business days for our office to upload your calendar submission.',
  confirm: 'By submitting this request you are confirming that the information above is accurate and approved by senior leadership.',
}

function clean(v: unknown, max = 500): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isTime = (v: unknown): v is string => typeof v === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(v)
const isUrl = (v: string | null) => !v || /^https?:\/\/\S+$/i.test(v)

// Checks the calendar fields and returns the row to insert (without who sent
// it), or what is missing.
export function calendarRow(c: Record<string, unknown> | null | undefined): { row: Record<string, unknown> } | { error: string } {
  if (!c || typeof c !== 'object') return { error: 'Please add the calendar details.' }
  const kind = CALENDAR_KINDS.some(k => k.id === c.kind) ? c.kind as CalendarKind : null
  const virtual = kind === 'virtual_meeting'
  const missing: string[] = []
  if (c.guidelines_ack !== true) missing.push('that you read the calendar guidelines')
  if (!kind) missing.push('the type of event')
  if (!clean(c.event_name, 200)) missing.push('the meeting or event name')
  if (!isDate(c.event_date)) missing.push('the date of the meeting or event')
  if (!isTime(c.start_time)) missing.push('the start time')
  if (!isTime(c.end_time)) missing.push('the end time')
  if (!virtual && !clean(c.location, 200)) missing.push('the location')
  if (!virtual && !clean(c.address_street, 200)) missing.push('the street address')
  if (!clean(c.contact_name, 120)) missing.push('the contact name')
  if (!clean(c.submitter_name, 120)) missing.push("the submitter's name")
  if (!clean(c.submitter_department, 200)) missing.push("the submitter's department")
  if (!clean(c.submitter_phone, 40)) missing.push("the submitter's phone number")
  if (missing.length) return { error: `For the calendar post, please add ${missing.join(', ')}.` }
  if (isTime(c.start_time) && isTime(c.end_time) && c.end_time <= c.start_time) return { error: 'For the calendar post, the end time must be after the start time.' }
  const virtualLink = clean(c.virtual_link, 500)
  const website = clean(c.website_link, 500)
  if (!isUrl(virtualLink) || !isUrl(website)) return { error: 'For the calendar post, links must start with https://' }
  return {
    row: {
      kind, event_name: clean(c.event_name, 200), event_date: c.event_date, start_time: c.start_time, end_time: c.end_time,
      virtual_link: virtualLink, virtual_phone: clean(c.virtual_phone, 40), virtual_conference_id: clean(c.virtual_conference_id, 120),
      additional_info: clean(c.additional_info, 4000),
      location: virtual ? clean(c.location, 200) ?? 'Virtual' : clean(c.location, 200),
      address_street: clean(c.address_street, 200), address_line2: clean(c.address_line2, 200),
      city: clean(c.city, 120), state: clean(c.state, 80), zip: clean(c.zip, 20),
      website_link: website, contact_name: clean(c.contact_name, 120), contact_email: clean(c.contact_email, 200),
      contact_phone: clean(c.contact_phone, 40), school_department: clean(c.school_department, 200),
      submitter_name: clean(c.submitter_name, 120), submitter_department: clean(c.submitter_department, 200),
      submitter_phone: clean(c.submitter_phone, 40), guidelines_ack: true,
    },
  }
}

const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!))
const time12 = (t: unknown) => {
  if (typeof t !== 'string' || !isTime(t)) return ''
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const longDate = (d: unknown) => isDate(d) ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''

// The calendar part of a notification email, as table rows.
export function calendarEmailRows(r: Record<string, unknown>): string {
  const row = (label: string, value: string) => value ? `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:4px 0">${value}</td></tr>` : ''
  const address = [r.address_street, r.address_line2, [r.city, r.state, r.zip].filter(Boolean).join(', ')].filter(Boolean).map(esc).join('<br>')
  const link = (u: unknown) => u ? `<a href="${esc(u)}">${esc(u)}</a>` : ''
  return [
    row('Type', esc(kindLabel(String(r.kind)))),
    row('Event', esc(r.event_name)),
    row('Date', esc(longDate(r.event_date))),
    row('Time', `${time12(r.start_time)} to ${time12(r.end_time)}`),
    row('Location', esc(r.location)),
    row('Address', address),
    row('Virtual link', link(r.virtual_link)),
    row('Virtual phone', esc(r.virtual_phone)),
    row('Conference ID', esc(r.virtual_conference_id)),
    row('Website', link(r.website_link)),
    row('Contact', [r.contact_name, r.contact_email, r.contact_phone].filter(Boolean).map(esc).join(', ')),
    row('School or department', esc(r.school_department)),
    row('Additional information', esc(r.additional_info)),
    row('Submitted by', [r.submitter_name, r.submitter_department, r.submitter_phone].filter(Boolean).map(esc).join(', ')),
  ].join('\n')
}

// Who hears about each new MarComm or calendar request (Sean, 2026-10-20).
export const OOC_NOTIFY = [
  'jennifer.hodder@browardschools.com',
  'BCPS.PIO@browardschools.com',
  'farrah.wilson@browardschools.com',
  'iviani.figueroa@browardschools.com',
  'chuck.griffin@browardschools.com',
  'mkaye@browardschools.com',
]
