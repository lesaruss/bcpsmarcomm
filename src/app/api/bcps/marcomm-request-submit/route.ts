import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireDistrictUser } from '@/lib/bcps-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// MarComm Request Form (Sean, 2026-10-08): replaces the Wufoo MarComm Request
// Form. Any signed-in District employee may submit (requireDistrictUser), and
// the signed-in address is recorded as the requester email - it is never
// typed, so it cannot be spoofed. Submissions land in bcps_marcomm_requests
// with the next job number, continuing the Wufoo numbering.
//
// Files go straight from the browser to the private marcomm-attachments
// bucket through signed upload URLs (action 'upload_urls'), so large PDFs and
// images never pass through this function's request body limit.

const BUCKET = 'marcomm-attachments'
const MAX_FILES = 5
const MAX_BYTES = 25 * 1024 * 1024
const ALLOWED = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|webp|heic|mp4|mov|txt)$/i

const SERVICES = [
  'Graphic design', 'Social media', 'BCPS Happenings', 'ParentLink message', 'Press release or media advisory',
  'Video or BECON coverage', 'Photography', 'Livestream', 'Website update or pop-up', 'Event support',
  'Marketing campaign', 'Writing or editing', 'Other',
]
const AUDIENCES = [
  'Students', 'Families', 'Employees', 'Principals and school leaders', 'Community and partners', 'Media', 'School Board', 'Other',
]

function clean(v: unknown, max = 500): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export async function POST(req: NextRequest) {
  const auth = await requireDistrictUser(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }

  if (body.action === 'upload_urls') {
    const files = Array.isArray(body.files) ? body.files as { name?: string; size?: number }[] : []
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Attach up to ${MAX_FILES} files.` }, { status: 400 })
    const batch = crypto.randomUUID()
    const out: { name: string; path: string; token: string }[] = []
    for (const f of files) {
      const name = String(f.name || '').replace(/[^\w.\- ]+/g, '_').slice(0, 120)
      if (!name || !ALLOWED.test(name)) return NextResponse.json({ error: `${f.name || 'A file'} is not a supported file type.` }, { status: 400 })
      if (!f.size || f.size > MAX_BYTES) return NextResponse.json({ error: `${name} is larger than 25 MB.` }, { status: 400 })
      const path = `requests/${batch}/${name}`
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return NextResponse.json({ error: 'Could not prepare the upload.' }, { status: 500 })
      out.push({ name, path, token: data.token })
    }
    return NextResponse.json({ ok: true, uploads: out })
  }

  const title = clean(body.title, 200)
  const description = clean(body.description, 8000)
  const goal = clean(body.goal, 4000)
  const orgType = body.org_type === 'School' || body.org_type === 'Department' ? body.org_type : null
  const orgName = clean(body.org_name, 200)
  const services = (Array.isArray(body.services) ? body.services : []).filter((s): s is string => typeof s === 'string' && SERVICES.includes(s))
  const audiences = (Array.isArray(body.audiences) ? body.audiences : []).filter((s): s is string => typeof s === 'string' && AUDIENCES.includes(s))

  const missing: string[] = []
  if (!clean(body.requester_name, 120)) missing.push('your name')
  if (!orgType || !orgName) missing.push('your school or department')
  if (!title) missing.push('a short title')
  if (!services.length) missing.push('at least one service')
  if (!audiences.length) missing.push('at least one audience')
  if (!description) missing.push('a description')
  if (!goal) missing.push('why it matters')
  if (!isDate(body.date_needed)) missing.push('the date you need it')
  if (missing.length) return NextResponse.json({ error: `Please add ${missing.join(', ')}.` }, { status: 400 })

  const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
    .filter((a): a is { name: string; path: string } => !!a && typeof a === 'object' && typeof (a as { path?: unknown }).path === 'string'
      && (a as { path: string }).path.startsWith('requests/'))
    .slice(0, MAX_FILES)
    .map(a => ({ name: String(a.name || a.path.split('/').pop()).slice(0, 120), path: a.path }))

  const { data: job, error: jobError } = await supabase.rpc('bcps_marcomm_next_job')
  if (jobError) return NextResponse.json({ error: 'Could not assign a job number.' }, { status: 500 })

  const { data, error } = await supabase.from('bcps_marcomm_requests').insert({
    job_number: job as number,
    source: 'form',
    title,
    requester_name: clean(body.requester_name, 120),
    requester_title: clean(body.requester_title, 120),
    requester_email: auth.user.email,
    requester_phone: clean(body.requester_phone, 40),
    org_type: orgType,
    org_name: orgName,
    services,
    audiences,
    description,
    goal,
    date_needed: body.date_needed as string,
    event_date: isDate(body.event_date) ? body.event_date : null,
    is_becon: services.includes('Video or BECON coverage'),
    calendar_needed: body.calendar_needed === true,
    attachments,
    status: 'new',
    created_by_email: auth.user.email,
  }).select('id, job_number').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: data.id, job_number: data.job_number })
}
