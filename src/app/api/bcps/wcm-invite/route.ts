import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const WCM_GROUP_SLUG = 'wcm'
const SITE = 'https://bcpsmarcomm.com'

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
// New vs. already-registered is detected the same way beta-invite already
// does it for SuperAdmin invites: try to create the auth user, and treat
// "already registered" as the existing-user case rather than a failure.
// Unlike beta-invite, this never lets Supabase's own invite/recovery email
// go out - generateLink only ever returns the link, it doesn't send
// anything - so the WCM gets one BCPS-branded email either way, worded for
// whichever case they're actually in, through the same Resend sender every
// other BCPS notification already uses.
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

// bcps_departments.wcm_name and director_name originate from the PUBLIC
// roster submission form (wcm-roster-intake -> wcm-roster-queue approval
// copies submission.wcm_name onto the department row), so they are not
// admin-authored strings even though an admin approves them - a reviewer
// is checking that a submission looks legitimate, not scanning it for
// markup. Interpolating them raw into this email would let a submitted
// name inject arbitrary HTML, including a competing anchor, into a
// BCPS-branded message carrying a real "Set Up Your Account" button.
// Escaped at every interpolation site instead. Not in the original patch.
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function brandedEmail(opts: { heading: string; body: string; ctaLabel: string; ctaHref: string; footNote?: string }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
      <div style="background:#0e4e73;padding:20px 28px;border-radius:8px 8px 0 0">
        <span style="color:#fff;font-size:13px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase">
          Broward County Public Schools
        </span>
      </div>
      <div style="border:1px solid #d1d5db;border-top:none;border-radius:0 0 8px 8px;padding:28px">
        <h1 style="font-size:18px;margin:0 0 14px;color:#0e4e73">${opts.heading}</h1>
        <div style="font-size:14px;line-height:1.65;color:#333">${opts.body}</div>
        <div style="margin:26px 0 6px">
          <a href="${esc(opts.ctaHref)}" style="display:inline-block;padding:12px 26px;background:#1672A7;color:#fff;
            border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${opts.ctaLabel}</a>
        </div>
        ${opts.footNote ? `<p style="font-size:12px;color:#767676;margin-top:22px">${opts.footNote}</p>` : ''}
      </div>
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:14px">
        This is an automated message from the BCPS Web Team Portal.
      </p>
    </div>
  `
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

  let userId: string | null = null
  let isNewAccount = false
  let inviteActionLink: string | null = null

  const { data: inviteData, error: inviteErr } = await svc.auth.admin.generateLink({
    type: 'invite',
    email: wcmEmail,
    options: {
      data: { full_name: dept.wcm_name || undefined },
      redirectTo: `${SITE}/set-password`,
    },
  })

  if (!inviteErr && inviteData?.user && inviteData.properties?.action_link) {
    userId = inviteData.user.id
    inviteActionLink = inviteData.properties.action_link
    isNewAccount = true
  } else if (inviteErr && /already been registered|already registered|exists/i.test(inviteErr.message)) {
    const { data: existing, error: existingErr } = await svc.auth.admin.generateLink({
      type: 'recovery',
      email: wcmEmail,
    })
    if (existingErr || !existing?.user) {
      return NextResponse.json({ error: existingErr?.message || 'Could not look up this WCM\'s account.' }, { status: 500 })
    }
    userId = existing.user.id
    isNewAccount = false
  } else {
    return NextResponse.json({ error: inviteErr?.message || 'Could not create this WCM\'s account.' }, { status: 500 })
  }

  if (!userId) return NextResponse.json({ error: 'Could not resolve an account for this WCM.' }, { status: 500 })

  // Same enrollment wcm-pilot-register performs on self-registration, so a
  // director-invited WCM is indistinguishable from one who signed up
  // themselves. department_confirmed = true here (unlike self-registration's
  // narrower director-email-match heuristic) because a director or admin
  // explicitly picking this person for this department is itself the
  // confirmation - there's no stronger signal available.
  await svc.from('wcm_cert_users').upsert(
    {
      user_id: userId,
      email: wcmEmail,
      full_name: dept.wcm_name || wcmEmail,
      department: dept.name,
      department_needs_review: false,
      is_admin: false,
    },
    { onConflict: 'user_id' }
  )

  const { data: group } = await svc
    .from('acl_groups')
    .select('id')
    .eq('brand', BRAND)
    .eq('slug', WCM_GROUP_SLUG)
    .maybeSingle()

  const { error: roleError } = await svc.from('acl_member_roles').upsert(
    {
      user_id: userId,
      brand: BRAND,
      role: 'user',
      department_slug: departmentSlug,
      department_confirmed: true,
      department_confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,brand' }
  )
  if (roleError) return NextResponse.json({ error: roleError.message }, { status: 500 })

  if (group?.id) {
    const { error: groupError } = await svc.from('acl_group_members').upsert(
      { group_id: group.id, user_id: userId },
      { onConflict: 'group_id,user_id' }
    )
    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 })
  }

  const html = isNewAccount
    ? brandedEmail({
        heading: `You've been added as a Web Content Manager`,
        body: `
          <p>Hi ${esc(wcmName)},</p>
          <p>Your department director has added you as the Web Content Manager for
          <strong>${esc(dept.name)}</strong> on the BCPS Web Team Portal.</p>
          <p>Click below to set your password and finish setting up your account. You're already
          enrolled, this just gets you signed in.</p>
        `,
        ctaLabel: 'Set Up Your Account',
        ctaHref: inviteActionLink!,
        footNote: `This link is unique to you. If you weren't expecting this, contact Sean Russell.`,
      })
    : brandedEmail({
        heading: `You're set up as a Web Content Manager`,
        body: `
          <p>Hi ${esc(wcmName)},</p>
          <p>Your department director has confirmed you as the Web Content Manager for
          <strong>${esc(dept.name)}</strong> on the BCPS Web Team Portal. You already have an account,
          so there's nothing new to set up, just sign in below.</p>
        `,
        ctaLabel: 'Log In',
        ctaHref: `${SITE}/login`,
        footNote: `Forgot your password? Use "Forgot password?" on the sign-in screen.`,
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
