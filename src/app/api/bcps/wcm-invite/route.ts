import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { resolveOrInviteAccount, enrollBcpsMember, wcmConfirmationEmail, SITE } from '@/lib/bcps-portal-account'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Per Sean 2026-09-11: a Director filling out the public registration form
// on behalf of their WCM was the only path that existed, and it's a real
// account with a real password - the Director has to type one in, the WCM
// is never told it, and (Confirm Email being off) no email goes out at all.
// The WCM finds out they have an account only if the Director tells them
// directly.
//
// This route is the real version of that: the Director (or an admin) picks
// their department's WCM - already on file as bcps_departments.wcm_email,
// same contact shown read-only on the department page - and this both
// enrolls them (identical acl_member_roles + acl_group_members writes as
// wcm-pilot-register, so a director-invited WCM ends up indistinguishable
// from one who self-registered) and emails THEM directly, so account
// creation and notice to the actual person happen in the same step instead
// of depending on a side conversation.
//
// 2026-09-12: the invite/enroll/branded-email logic this route pioneered is
// now shared (src/lib/bcps-portal-account.ts), because wcm-roster-queue's
// approval step does the same thing automatically for both the WCM and the
// director. This route stays as the manual, on-demand version - re-sending
// an invite, or inviting a WCM whose department page contact changed
// outside the roster flow - and both call sites now share one
// implementation instead of drifting apart.
async function requireDirectorOrAdmin(
  req: NextRequest,
  departmentSlug: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Missing session.' }

  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Invalid session.' }

  const { data: roleRow } = await svc
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('brand', BRAND)
    .maybeSingle()
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin') return { ok: true }

  const { data: dept } = await svc
    .from('bcps_departments')
    .select('director_email')
    .eq('slug', departmentSlug)
    .maybeSingle()
  const callerEmail = (user.email || '').trim().toLowerCase()
  if (dept?.director_email && callerEmail && dept.director_email.trim().toLowerCase() === callerEmail) {
    return { ok: true }
  }

  return { ok: false, status: 403, error: 'Only that department\'s director or a BCPS admin can send this invite.' }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const departmentSlug = (body?.department_slug as string | undefined)?.trim()
  if (!departmentSlug) return NextResponse.json({ error: 'department_slug is required.' }, { status: 400 })

  const auth = await requireDirectorOrAdmin(req, departmentSlug)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: dept, error: deptErr } = await svc
    .from('bcps_departments')
    .select('slug, name, wcm_name, wcm_email')
    .eq('slug', departmentSlug)
    .maybeSingle()
  if (deptErr || !dept) return NextResponse.json({ error: 'Unknown department.' }, { status: 400 })

  const wcmEmail = (dept.wcm_email || '').trim().toLowerCase()
  if (!wcmEmail) {
    return NextResponse.json(
      { error: 'No WCM email on file for this department yet. Add one before sending an invite.' },
      { status: 400 }
    )
  }
  const wcmName = dept.wcm_name || 'there'

  const resolved = await resolveOrInviteAccount(wcmEmail, dept.wcm_name || undefined)
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 500 })
  const { userId, isNewAccount, actionLink } = resolved.account

  const enrolled = await enrollBcpsMember({
    userId,
    email: wcmEmail,
    fullName: dept.wcm_name || wcmEmail,
    departmentName: dept.name,
    departmentSlug,
    addToWcmGroup: true,
  })
  if (!enrolled.ok) return NextResponse.json({ error: enrolled.error }, { status: 500 })

  const html = wcmConfirmationEmail({
    wcmName,
    departmentName: dept.name,
    isNewAccount,
    failsafeHref: isNewAccount ? actionLink! : `${SITE}/login`,
  })

  const emailResult = await sendEmail({
    to: wcmEmail,
    subject: isNewAccount
      ? `You're invited: BCPS Web Content Manager for ${dept.name}`
      : `You're confirmed: BCPS Web Content Manager for ${dept.name}`,
    replyTo: 'sean.russell@browardschools.com',
    html,
  })

  return NextResponse.json({
    ok: true,
    status: isNewAccount ? 'invited' : 'already_registered',
    email_sent: emailResult.ok,
    email_error: emailResult.ok ? null : emailResult.error,
  })
}
