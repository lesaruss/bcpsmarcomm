import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import {
  SIA_BUCKET, SIA_TABLE, SIA_INBOX, SIA_FROM_NAME, SIA_TRACKER_URL, APPLICATION_TYPES, APPLICANT_SLOTS, SLOTS,
  MAX_FILES_PER_SLOT, MAX_BYTES, ALLOWED_FILE, type Attachments, type Slot, esc, todayEastern, receivedEmail,
  isTestProject, TEST_SUBJECT_PREFIX,
} from '@/lib/school-impact'

export const dynamic = 'force-dynamic'

// Public School Impact Application, public intake (Sean + Glennika D. Gordon,
// 2026-11-02). Open to anyone: applicants are developers, attorneys,
// engineers and the public. Embed: public/embeds/school-impact-application.html.
//
// Two calls. action 'upload_urls' hands back signed upload URLs into the
// private school-impact-applications bucket under applications/<batch>/<slot>/,
// so large site plans never pass through this function. The submit call then
// reads the files back from storage (the bucket listing is the source of
// truth, not the browser's list) and refuses the submission if a required
// slot is empty. A hidden field catches bots, and one email address can
// submit RATE_LIMIT applications an hour.

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const RATE_LIMIT = 5
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const s = (v: unknown, max = 300): string => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' && isFinite(v) ? String(v) : '')
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})
const list = (v: unknown, allowed: readonly string[]) => (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === 'string' && allowed.includes(x))
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1_000_000) : null }

const UNIT_TYPES: Record<string, string[]> = {
  single_family: ['3 BR or less', '4 BR or more'],
  townhouse: ['2 BR or less', '3 BR or more'],
  garden: ['1 BR or less', '2 BR', '3 BR or more'],
  mid_rise: ['1 BR or less', '2 BR or more'],
  high_rise: ['1 BR or less', '2 BR or more'],
  mobile_home: ['2 BR or less', '3 BR or more'],
}
const EXEMPTIONS = ['Generates less than one student', 'Age restricted to persons 18 and over', 'Statutory exemption', 'Site plan located within a plat with a valid final SCAD letter']
const VESTING = [
  'Located within previously approved plan amendment or rezoning with a valid mitigation agreement (executed and recorded DRC or Tri-Party)',
  'Obtained site plan final approval prior to February 1, 2008',
  'Site plan located within a plat for which school impacts have been satisfied',
]

const pick = <K extends string>(src: Record<string, unknown>, keys: readonly K[], max = 300) =>
  Object.fromEntries(keys.map(k => [k, s(src[k], max)])) as Record<K, string>

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (s(body.website)) return NextResponse.json({ ok: true, reference: 'PSIA-0000' })

  if (body.action === 'upload_urls') {
    const batch = s(body.batch, 40)
    if (!UUID.test(batch)) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
    const files = Array.isArray(body.files) ? body.files as { slot?: string; name?: string; size?: number }[] : []
    if (!files.length || files.length > MAX_FILES_PER_SLOT * APPLICANT_SLOTS.length) return NextResponse.json({ error: 'Too many files.' }, { status: 400 })
    const out: { slot: string; name: string; path: string; token: string }[] = []
    for (const f of files) {
      const slot = String(f.slot || '') as Slot
      if (!APPLICANT_SLOTS.includes(slot)) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
      const name = String(f.name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      if (!name || !ALLOWED_FILE.test(name)) return NextResponse.json({ error: `${f.name || 'A file'} is not a supported file type. Use PDF, an image, Word, Excel, DWG or ZIP.` }, { status: 400 })
      if (!f.size || f.size > MAX_BYTES) return NextResponse.json({ error: `${name} is larger than 50 MB.` }, { status: 400 })
      const path = `applications/${batch}/${slot}/${name}`
      const { data, error } = await supabase.storage.from(SIA_BUCKET).createSignedUploadUrl(path, { upsert: true })
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload. Please try again.' }, { status: 500 })
      out.push({ slot, name, path, token: data.token })
    }
    return NextResponse.json({ ok: true, uploads: out })
  }

  // ---- Submit ----
  const project = obj(body.project), payment = obj(body.payment), location = obj(body.location)
  const owner = obj(body.owner), agent = obj(body.agent), dev = obj(body.development)
  const vested = obj(body.vested), cert = obj(body.certification)
  const types = list(body.application_types, APPLICATION_TYPES)
  const agentEmail = s(agent.email, 200).toLowerCase()

  const unitsIn = obj(dev.units)
  const units: Record<string, Record<string, { built: number | null; unbuilt: number | null; proposed: number | null }>> = {}
  for (const [type, cats] of Object.entries(UNIT_TYPES)) {
    const t = obj(unitsIn[type])
    for (const cat of cats) {
      const c = obj(t[cat])
      const row = { built: num(c.built), unbuilt: num(c.unbuilt), proposed: num(c.proposed) }
      if (row.built !== null || row.unbuilt !== null || row.proposed !== null) (units[type] ??= {})[cat] = row
    }
  }
  const exemptions = list(vested.exemptions, EXEMPTIONS)
  const vesting = list(vested.vesting, VESTING)

  const data = {
    application_types: types,
    project: pick(project, ['county_project_number', 'city_project_number', 'project_name', 'previously_submitted', 'sbbc_number']),
    payment: pick(payment, ['fee_amount', 'method', 'order_no', 'check_no']),
    location: pick(location, ['folio', 'section', 'township', 'range', 'general_location', 'side_of', 'at_between', 'and_street', 'acreage', 'jurisdiction']),
    owner: pick(owner, ['name', 'phone', 'address', 'city', 'state', 'zip']),
    agent: { ...pick(agent, ['name', 'address', 'city', 'state', 'zip', 'phone', 'fax']), email: agentEmail },
    development: {
      ...pick(dev, ['land_use_existing', 'land_use_proposed', 'zoning_existing', 'zoning_proposed', 'non_residential']),
      non_residential_desc: s(dev.non_residential_desc, 4000),
      units,
    },
    vested: { amount: s(vested.amount, 4000), exemptions, statute: s(vested.statute), vesting, plat_number: s(vested.plat_number), associated_application: s(vested.associated_application) },
    certification: { name: s(cert.name, 200), agreed: cert.agreed === true, date: todayEastern() },
  }

  const missing: string[] = []
  if (!types.length) missing.push('the application type')
  if (!data.project.project_name) missing.push('the project name')
  if (data.project.previously_submitted !== 'yes' && data.project.previously_submitted !== 'no') missing.push('whether the project was previously submitted')
  if (data.project.previously_submitted === 'yes' && !data.project.sbbc_number) missing.push('the SBBC number of the previous submission')
  if (!data.payment.fee_amount) missing.push('the application fee amount')
  if (data.payment.method === 'online' ? !data.payment.order_no : data.payment.method === 'check' ? !data.payment.check_no : true) missing.push('the e-store order number or check number')
  if (!data.location.folio) missing.push('the folio number')
  if (!data.location.general_location) missing.push('the general location')
  if (!data.location.jurisdiction) missing.push('the jurisdiction')
  if (!data.owner.name) missing.push("the owner's name")
  if (!data.agent.name) missing.push('the developer or agent name')
  if (!data.agent.phone) missing.push("the agent's phone")
  if (!EMAIL.test(agentEmail)) missing.push("a valid agent email")
  if (data.development.non_residential !== 'yes' && data.development.non_residential !== 'no') missing.push('whether the project includes non-residential development')
  if (data.development.non_residential === 'yes' && !data.development.non_residential_desc) missing.push('a description of the non-residential uses')
  if (data.vested.exemptions.includes('Statutory exemption') && !data.vested.statute) missing.push('the applicable statute')
  if (!data.certification.name || !data.certification.agreed) missing.push('your typed-name signature and certification')

  // Files: read what actually landed in storage for this batch.
  const batch = s(body.upload_batch, 40)
  if (!UUID.test(batch)) missing.push('the required files')
  const attachments: Attachments = {}
  if (UUID.test(batch)) {
    for (const slot of APPLICANT_SLOTS) {
      const { data: files } = await supabase.storage.from(SIA_BUCKET).list(`applications/${batch}/${slot}`, { limit: 50 })
      const got = (files ?? []).filter(f => f.id && f.name).slice(0, MAX_FILES_PER_SLOT)
        .map(f => ({ name: f.name, path: `applications/${batch}/${slot}/${f.name}`, size: (f.metadata as { size?: number } | null)?.size }))
      if (got.length) attachments[slot] = got
    }
  }
  const needFile = (slot: Slot, when = true) => { if (when && !attachments[slot]?.length) missing.push(`the ${SLOTS[slot].toLowerCase()}`) }
  needFile('receipt'); needFile('site_plan'); needFile('survey')
  needFile('plat_letter', types.includes('Plat'))
  needFile('supporting', exemptions.length + vesting.length > 0)
  if (missing.length) return NextResponse.json({ error: `Please add ${missing.join(', ')}.` }, { status: 400 })

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await supabase.from(SIA_TABLE).select('id', { count: 'exact', head: true })
    .ilike('applicant_email', agentEmail).gte('submitted_at', since)
  if ((count ?? 0) >= RATE_LIMIT) return NextResponse.json({ error: 'Too many applications from this email in the last hour. Please try again later.' }, { status: 429 })

  // A project name starting with TEST is a practice run (see lib/school-impact).
  const isTest = isTestProject(data.project.project_name)

  const { data: ref, error: refError } = await supabase.rpc('bcps_school_impact_next_ref')
  if (refError || !ref) return NextResponse.json({ error: 'Could not assign a reference number. Please try again.' }, { status: 500 })

  const { data: row, error } = await supabase.from(SIA_TABLE).insert({
    reference: ref as string,
    project_name: data.project.project_name,
    application_types: types,
    applicant_name: data.agent.name,
    applicant_email: agentEmail,
    applicant_phone: data.agent.phone,
    jurisdiction: data.location.jurisdiction,
    payment_order_no: data.payment.method === 'online' ? data.payment.order_no : `Check ${data.payment.check_no}`,
    data,
    attachments,
    history: [{ at: new Date().toISOString(), status: 'new', by: 'applicant' }],
    is_test: isTest,
  }).select('id, reference, submitted_at').single()
  if (error || !row) return NextResponse.json({ error: 'Your application could not be saved. Please try again.' }, { status: 500 })

  // Saved either way; failed emails stay in bcps_outbound_emails to resend.
  const submitted = todayEastern()
  const mail = receivedEmail({ reference: row.reference, applicant_name: data.agent.name, project_name: data.project.project_name, submitted })
  await sendEmail({
    to: agentEmail, ...(isTest ? {} : { cc: SIA_INBOX }), replyTo: SIA_INBOX, fromName: SIA_FROM_NAME,
    subject: (isTest ? TEST_SUBJECT_PREFIX : '') + mail.subject, html: mail.html,
    kind: 'school-impact-received', context: { application_id: row.id, reference: row.reference },
  })

  // A practice run never alerts the shared inbox.
  if (isTest) return NextResponse.json({ ok: true, reference: row.reference, submitted_at: row.submitted_at })

  const fileList = APPLICANT_SLOTS.filter(k => attachments[k]?.length)
    .map(k => `<li>${esc(SLOTS[k])}: ${esc(attachments[k]!.map(f => f.name).join(', '))}</li>`).join('')
  await sendEmail({
    to: SIA_INBOX, replyTo: agentEmail,
    subject: `New Public School Impact Application ${row.reference}: ${data.project.project_name}`,
    kind: 'school-impact-new', context: { application_id: row.id, reference: row.reference },
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">
<p>A new Public School Impact Application came in through bcpsmarcomm.com.</p>
<table style="border-collapse:collapse">
<tr><td style="padding:3px 12px 3px 0;color:#555">Reference</td><td><strong>${esc(row.reference)}</strong></td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#555">Project</td><td>${esc(data.project.project_name)}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#555">Type</td><td>${esc(types.join(', '))}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#555">Jurisdiction</td><td>${esc(data.location.jurisdiction)}</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#555">Applicant</td><td>${esc(data.agent.name)} (<a href="mailto:${esc(agentEmail)}">${esc(agentEmail)}</a>, ${esc(data.agent.phone)})</td></tr>
<tr><td style="padding:3px 12px 3px 0;color:#555">Payment</td><td>${esc(data.payment.method === 'online' ? `E-store order ${data.payment.order_no}` : `Check ${data.payment.check_no}`)}, ${esc(data.payment.fee_amount)}</td></tr>
</table>
<p style="margin:12px 0 4px"><strong>Files</strong></p><ul style="margin:0">${fileList}</ul>
<p style="margin:16px 0 0">Status: <strong>New</strong>. <a href="${SIA_TRACKER_URL}">Open the tracker</a> (Widgets, Public School Impact Application, Edit) to check it for completeness and mark it Accepted, which starts the 30-business-day clock and emails the applicant. Reply to this email to reach the applicant.</p>
</div>`,
  })

  return NextResponse.json({ ok: true, reference: row.reference, submitted_at: row.submitted_at })
}
