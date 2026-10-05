import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// School WCM self-registration (Sean, 2026-10-05). The department signup on
// /login and /wcm-registration asks for a department, and a school WCM has to
// know to leave it blank ("a little janky"). This is the school version: pick
// your school, enter name, district email and a password, and you land on the
// school home.
//
// Who can register: only the person on file as that school's WCM. The school
// list is the schools with a WCM on bcps_schools (the pilot schools today; all
// 227 directory schools later), and the account is created only when the email
// matches that school's wcm_email. Anyone else is told to contact the District
// Web Team. Same gate as /api/banner/wcm-invite and the school home in
// /api/bcps/home: bcps_schools.wcm_email.
//
// The account is created server-side with the email already confirmed, the
// same posture as the department signup (Supabase Confirm Email is off), so no
// email has to reach a district inbox before the WCM can sign in. School WCMs
// are deliberately not added to the district acl groups (see
// /api/bcps/schools); Banner Submissions is a public page for any session.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

const DOMAIN = '@browardschools.com'

// GET: the schools that can register right now. Names only, never the email
// on file.
export async function GET() {
  const { data, error } = await svc.from('bcps_schools')
    .select('name, school_location_nbr, wcm_email')
    .not('wcm_email', 'is', null)
    .not('school_location_nbr', 'is', null)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    schools: (data ?? []).map(s => ({ loc_no: s.school_location_nbr as string, name: s.name as string })),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const locNo = String(body?.loc_no || '').trim()
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const password = String(body?.password || '')

  if (!locNo) return NextResponse.json({ error: 'Select your school.' }, { status: 400 })
  if (!name) return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
  if (!email.endsWith(DOMAIN)) return NextResponse.json({ error: 'Use your @browardschools.com email address.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })

  const { data: school, error: schoolErr } = await svc.from('bcps_schools')
    .select('id, name, wcm_name, wcm_email').eq('school_location_nbr', locNo).maybeSingle()
  if (schoolErr) return NextResponse.json({ error: schoolErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'That school is not open for registration yet.' }, { status: 400 })
  if ((school.wcm_email || '').trim().toLowerCase() !== email) {
    return NextResponse.json(
      { error: `This email is not on file as the Web Content Manager for ${school.name}. Contact the District Web Team to be added.` },
      { status: 403 }
    )
  }

  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, name, school_wcm: true },
  })
  if (createErr) {
    if (/already been registered|already registered|exists/i.test(createErr.message)) {
      return NextResponse.json(
        { error: 'You already have an account. Sign in with your email and password, or use Forgot password.', already_registered: true },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: createErr.message }, { status: 500 })
  }

  const userId = created.user?.id ?? null
  await svc.from('bcps_schools')
    .update({ wcm_user_id: userId, wcm_name: school.wcm_name || name })
    .eq('id', school.id)

  return NextResponse.json({ ok: true, school: school.name })
}
