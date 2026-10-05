import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend'
import { resolveOrInviteAccount, brandedEmail, esc, firstName, SITE } from '@/lib/bcps-portal-account'

export const dynamic = 'force-dynamic'

// WCM Banner Submission App - invite a SCHOOL Web Content Manager.
//
// Why this exists (Sean + Vanessa Deslandes, 2026-10-05): Vanessa sent the
// Banner Submissions link to a pilot group of about six school WCMs and
// there was no way for them to get an account. Every existing path is
// department-shaped (wcm-pilot-register, wcm-invite, the roster queue all
// key off bcps_departments), and /api/bcps/schools takes a temp password the
// admin has to type and pass along. This is the school version of wcm-invite:
// an Admin or Manager of this feature enters name, email and school, and the
// WCM is emailed their own set-password link. Nobody handles a password.
//
// Access model, unchanged from /api/bcps/schools: school WCMs are linked on
// bcps_schools (wcm_email / wcm_user_id, keyed by school_location_nbr = the
// bcps_school_directory loc_no) and deliberately NOT added to the district
// acl groups. They can still reach Banner Submissions because that page is
// registered public in acl_objects and every /api/banner route only needs a
// valid session.
//
// Gate: the same bcps_banner_admins table that guards the review queue
// (requireBannerAdmin in /api/banner/admins/route.ts guards admin-only;
// /api/banner/review allows admin or manager, and so does this route, since
// adding pilot WCMs is day-to-day work for Vanessa's reviewers).

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

const BANNER_PAGE = `${SITE}/?page=banner-submissions`
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function requireBannerReviewer(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  const { data: row } = await svc.from('bcps_banner_admins')
    .select('role').eq('user_id', user.id).maybeSingle()
  if (!row || (row.role !== 'admin' && row.role !== 'manager')) return null
  return user
}

function schoolWcmEmail(opts: { name: string; schoolName: string; isNewAccount: boolean; href: string }): string {
  return brandedEmail({
    heading: 'Your Banner Submissions access is ready',
    body: `
      <p>Hi ${esc(firstName(opts.name))},</p>
      <p>You have been set up to submit homepage banners for <strong>${esc(opts.schoolName)}</strong>
      on the BCPS Web Team Portal.</p>
      <p><strong>What to do</strong></p>
      <ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.7;">
        ${opts.isNewAccount
          ? `<li>Use the button below to set your password. The link is unique to you.</li>`
          : `<li>You already have a portal account, so just sign in with the button below.</li>`}
        <li>Open <a href="${BANNER_PAGE}">Banner Submissions</a>, choose your school, and upload a photo or video.
            One banner is all you need to submit; you can add up to three in a request.</li>
        <li>Every submission is reviewed by the District Web Team before it goes live, and you will get an email with the decision.</li>
      </ul>
      <p>Best regards,<br />District Web Team</p>
    `,
    ctaLabel: opts.isNewAccount ? 'Set Your Password' : 'Sign In',
    ctaHref: opts.href,
    footNote: opts.isNewAccount
      ? `After you set your password, sign-in is at ${SITE}/login. If you weren't expecting this, contact the District Web Team.`
      : `Forgot your password? Use "Forgot password?" on the sign-in screen.`,
  })
}

// GET: school WCMs already on file, for the invite panel's list.
export async function GET(req: NextRequest) {
  const user = await requireBannerReviewer(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from('bcps_schools')
    .select('name, wcm_name, wcm_email, wcm_user_id, school_location_nbr, updated_at')
    .not('wcm_email', 'is', null)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ wcms: data ?? [] })
}

// POST: { name, email, loc_no } - create (or find) the account, link it to
// the school, email the WCM. Re-running it for the same person and school
// re-sends the email, so it doubles as "resend invite".
export async function POST(req: NextRequest) {
  const user = await requireBannerReviewer(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || '').trim()
  const email = String(body?.email || '').trim().toLowerCase()
  const locNo = String(body?.loc_no || '').trim()
  if (!name) return NextResponse.json({ error: 'Enter the WCM\'s name.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  if (!locNo) return NextResponse.json({ error: 'Select a school.' }, { status: 400 })

  const { data: school, error: dirErr } = await svc.from('bcps_school_directory')
    .select('loc_no, school_name').eq('loc_no', locNo).eq('is_archived', false).maybeSingle()
  if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 500 })
  if (!school) return NextResponse.json({ error: 'That school was not recognized. Choose it again from the list.' }, { status: 400 })

  // One WCM of record per school on bcps_schools. Never silently replace a
  // different person; the reviewer has to clear it on purpose.
  const { data: existingRow } = await svc.from('bcps_schools')
    .select('id, wcm_email').eq('school_location_nbr', locNo).maybeSingle()
  const onFile = (existingRow?.wcm_email || '').trim().toLowerCase()
  if (onFile && onFile !== email) {
    return NextResponse.json(
      { error: `${school.school_name} already has ${onFile} on file as its WCM. Contact Sean to change it.` },
      { status: 409 }
    )
  }

  const resolved = await resolveOrInviteAccount(email, name)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 500 })
  const { userId, isNewAccount, actionLink } = resolved.account

  const link = existingRow
    ? await svc.from('bcps_schools')
        .update({ wcm_name: name, wcm_email: email, wcm_user_id: userId })
        .eq('id', existingRow.id)
    : await svc.from('bcps_schools')
        .insert({ name: school.school_name, school_location_nbr: locNo, wcm_name: name, wcm_email: email, wcm_user_id: userId })
  if (link.error) return NextResponse.json({ error: link.error.message }, { status: 500 })

  const emailResult = await sendEmail({
    to: email,
    subject: `Banner Submissions access for ${school.school_name}`,
    replyTo: 'sean.russell@browardschools.com',
    html: schoolWcmEmail({
      name,
      schoolName: school.school_name,
      isNewAccount,
      href: isNewAccount ? actionLink! : `${SITE}/login?next=${encodeURIComponent('/?page=banner-submissions')}`,
    }),
  })

  return NextResponse.json({
    ok: true,
    status: isNewAccount ? 'invited' : 'already_registered',
    school: school.school_name,
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? null : emailResult.error,
  })
}
