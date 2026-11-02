// Public School Impact Application widget: constants, business-day math and
// the emails, shared by the public submit route, the tracker route and the
// due-soon reminder. See supabase/migrations/20261102_bcps_school_impact_applications.sql.

export const SIA_SLUG = 'school-impact-application'
export const SIA_BUCKET = 'school-impact-applications'
export const SIA_TABLE = 'bcps_school_impact_applications'

// Glennika (2026-11-02): every notification goes to the shared inbox only,
// not to her or Raymellow individually.
export const SIA_INBOX = 'prm_growthmanagement@browardschools.com'
export const SIA_PHONE = '754-321-2177'
export const SIA_FROM_NAME = 'Intergovernmental Coordination via BCPS MarComm'
export const SIA_REVIEW_DAYS = 30
export const SIA_REMIND_WITHIN = 5
export const SIA_ESTORE_URL = 'https://osp.osmsinc.com/BrowardFL/BVModules/CategoryTemplates/Detailed%20List%20with%20Properties/Category.aspx?categoryid=B0008'
export const SIA_TRACKER_URL = 'https://bcpsmarcomm.com/widgets'

export const APPLICATION_TYPES = ['Land Use', 'DRI', 'Rezoning', 'Flex/Reserve Allocation', 'Plat', 'Site Plan'] as const

// Applicant upload slots. plat_letter is required for Plat applications and
// supporting for any exemption or vesting claim (the form: "Supporting
// documentation is required"). scad_letter is staff-only.
export const SLOTS = {
  receipt: 'Payment confirmation',
  site_plan: 'Site plan',
  survey: 'Survey of the project site',
  plat_letter: 'Plat approval letter',
  supporting: 'Supporting documents',
  scad_letter: 'SCAD letter',
} as const
export type Slot = keyof typeof SLOTS
export const APPLICANT_SLOTS: Slot[] = ['receipt', 'site_plan', 'survey', 'plat_letter', 'supporting']

export const MAX_FILES_PER_SLOT = 5
export const MAX_BYTES = 50 * 1024 * 1024
export const ALLOWED_FILE = /\.(pdf|jpe?g|png|gif|webp|heic|tiff?|docx?|xlsx?|dwg|zip)$/i

export type Attachment = { name: string; path: string; size?: number }
export type Attachments = Partial<Record<Slot, Attachment[]>>

export type Status = 'new' | 'needs_info' | 'accepted' | 'letter_sent'
export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  needs_info: 'Needs info',
  accepted: 'Accepted (in review)',
  letter_sent: 'Letter sent',
}

export const todayEastern = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

// Business days skip Saturdays, Sundays and the days District offices are
// closed (Sean + Glennika D. Gordon, 2026-11-03). The closed days are the
// yellow "Schools and Administrative Offices Closed" days on the Broward
// County Public Schools 2026/27 school calendar. Days when only schools are
// closed (green: part of Thanksgiving week, winter break, Mar 10, spring
// break) are business days, because the offices are open, and so are
// employee planning days. The calendar ends June 30, 2027: until the
// 2027/28 calendar is added below, later closed days are not counted out and
// staff can still change a due date in the tracker.
export const SIA_CLOSED_DATES: readonly string[] = [
  '2026-09-07', '2026-09-21', '2026-11-11', '2026-11-25', '2026-11-26', '2026-11-27',
  '2026-12-23', '2026-12-24', '2026-12-25', '2026-12-30', '2026-12-31',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
]
export const SIA_CALENDAR_THROUGH = '2027-06-30'
const CLOSED = new Set(SIA_CLOSED_DATES)

function isBusinessDay(d: Date): boolean {
  const wd = d.getUTCDay()
  return wd !== 0 && wd !== 6 && !CLOSED.has(d.toISOString().slice(0, 10))
}

export function addBusinessDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isBusinessDay(d)) left--
  }
  return d.toISOString().slice(0, 10)
}

export function businessDaysBetween(fromIso: string, toIso: string): number {
  if (toIso <= fromIso) {
    if (toIso === fromIso) return 0
    return -businessDaysBetween(toIso, fromIso)
  }
  const d = new Date(`${fromIso}T12:00:00Z`)
  const end = new Date(`${toIso}T12:00:00Z`)
  let n = 0
  while (d < end) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (isBusinessDay(d)) n++
  }
  return n
}

export const esc = (t: unknown) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
export const longDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''

const SIGN_OFF = `<p style="margin:24px 0 0">Best regards,<br>Intergovernmental Coordination Section<br>Facility Planning and Real Estate Department<br>Broward County Public Schools<br><a href="mailto:${SIA_INBOX}">${SIA_INBOX}</a> | ${SIA_PHONE}</p>`
const wrap = (body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:640px">${body}${SIGN_OFF}</div>`

// 1. Sent the moment an application is submitted (copy to the shared inbox).
export function receivedEmail(a: { reference: string; applicant_name: string; project_name: string; submitted: string }) {
  return {
    subject: `Received: Public School Impact Application ${a.reference} (${a.project_name})`,
    html: wrap(`<p>Hello ${esc(a.applicant_name)},</p>
<p>Thank you. We received your Public School Impact Application for <strong>${esc(a.project_name)}</strong> on ${esc(longDate(a.submitted))}.</p>
<p>Your reference number is <strong>${esc(a.reference)}</strong>. Please include it in any message about this application.</p>
<p>School District staff will now review your application for completeness. The 30-business-day review period begins once your application is determined complete, and we will email you when that happens. If anything is missing, we will contact you.</p>`),
  }
}

// 2. Sent when staff mark the application Accepted. Glennika's existing
// completeness email (2026-11-02), with "four weeks (30 days)" changed to
// 30 business days so it matches the review clock.
export function acceptedEmail(a: { reference: string; applicant_name: string; project_name: string }) {
  return {
    subject: `Application complete: ${a.reference} (${a.project_name})`,
    html: wrap(`<p>Hello ${esc(a.applicant_name)},</p>
<p>Thank you for submitting your application and supporting documents. We have successfully received your materials for <strong>${esc(a.project_name)}</strong> (reference ${esc(a.reference)}).</p>
<p>Please note that <strong>processing and retrieval of your letter may take up to 30 business days</strong>. We appreciate your patience during this period. We will contact you if any additional information is required.</p>
<p>If you have any questions in the meantime, feel free to reach out to us using the contact information below.</p>`),
  }
}

// 3. Sent when staff mark Needs info, with their note.
export function needsInfoEmail(a: { reference: string; applicant_name: string; project_name: string; note: string }) {
  return {
    subject: `More information needed: ${a.reference} (${a.project_name})`,
    html: wrap(`<p>Hello ${esc(a.applicant_name)},</p>
<p>Thank you for your Public School Impact Application for <strong>${esc(a.project_name)}</strong> (reference ${esc(a.reference)}). Before we can determine it complete, we need the following:</p>
<p style="white-space:pre-wrap;background:#f4f6f8;border-left:3px solid #167287;padding:10px 14px">${esc(a.note)}</p>
<p>Please reply to this email with the information or documents. The 30-business-day review period begins once the application is complete.</p>`),
  }
}
