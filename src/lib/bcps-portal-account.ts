import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const WCM_GROUP_SLUG = 'wcm'
export const SITE = 'https://bcpsmarcomm.com'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Shared by wcm-invite (manual "Send Portal Invite" button) and
// wcm-roster-queue (automatic invite on admin approval, added 2026-09-12
// per Sean: approving a roster submission should be the one action that
// both confirms the record AND gets the real person - director and WCM -
// into a working account, instead of that being a separate manual step.
// Pulled out of wcm-invite/route.ts so both call sites share one
// implementation rather than drifting apart.

export function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ctaLabel/ctaHref are optional as a pair - omit both for a confirmation
// email that isn't asking the reader to click through to anything yet
// (the director's account-created-but-not-invited email, added 2026-09-12).
export function brandedEmail(opts: { heading: string; body: string; ctaLabel?: string; ctaHref?: string; footNote?: string }) {
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
        ${opts.ctaLabel && opts.ctaHref ? `
        <div style="margin:26px 0 6px">
          <a href="${esc(opts.ctaHref)}" style="display:inline-block;padding:12px 26px;background:#1672A7;color:#fff;
            border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${opts.ctaLabel}</a>
        </div>` : ''}
        ${opts.footNote ? `<p style="font-size:12px;color:#767676;margin-top:22px">${opts.footNote}</p>` : ''}
      </div>
      <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:14px">
        This is an automated message from the BCPS Web Team Portal.
      </p>
    </div>
  `
}

export type ResolvedAccount = { userId: string; isNewAccount: boolean; actionLink: string | null }

// Try to create the account (this IS the invite email link when new); on
// "already registered", fall back to a recovery link purely to get back
// the existing user's id - never sends Supabase's own email either way,
// generateLink only returns the link. Same detection pattern beta-invite
// established for inviteUserByEmail, reused here for generateLink.
export async function resolveOrInviteAccount(email: string, fullName?: string): Promise<
  | { ok: true; account: ResolvedAccount }
  | { ok: false; error: string }
> {
  const { data: inviteData, error: inviteErr } = await svc.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: { full_name: fullName || undefined },
      redirectTo: `${SITE}/set-password`,
    },
  })

  if (!inviteErr && inviteData?.user && inviteData.properties?.action_link) {
    return {
      ok: true,
      account: { userId: inviteData.user.id, isNewAccount: true, actionLink: inviteData.properties.action_link },
    }
  }

  if (inviteErr && /already been registered|already registered|exists/i.test(inviteErr.message)) {
    const { data: existing, error: existingErr } = await svc.auth.admin.generateLink({ type: 'recovery', email })
    if (existingErr || !existing?.user) {
      return { ok: false, error: existingErr?.message || "Could not look up this account." }
    }
    return { ok: true, account: { userId: existing.user.id, isNewAccount: false, actionLink: null } }
  }

  return { ok: false, error: inviteErr?.message || 'Could not create this account.' }
}

// Same enrollment wcm-pilot-register performs on self-registration:
// wcm_cert_users + acl_member_roles (brand membership, department,
// department_confirmed) + optionally the 'wcm' group. department_confirmed
// is always true here - an admin approving a roster submission, or a
// director/admin explicitly inviting someone, is itself the confirmation.
export async function enrollBcpsMember(opts: {
  userId: string
  email: string
  fullName: string
  departmentName?: string | null
  departmentSlug?: string | null
  addToWcmGroup: boolean
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await svc.from('wcm_cert_users').upsert(
    {
      user_id: opts.userId,
      email: opts.email,
      full_name: opts.fullName || opts.email,
      department: opts.departmentName || null,
      department_needs_review: false,
      is_admin: false,
    },
    { onConflict: 'user_id' }
  )

  const { error: roleError } = await svc.from('acl_member_roles').upsert(
    {
      user_id: opts.userId,
      brand: BRAND,
      role: 'user',
      department_slug: opts.departmentSlug || null,
      department_confirmed: true,
      department_confirmed_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,brand' }
  )
  if (roleError) return { ok: false, error: roleError.message }

  if (opts.addToWcmGroup) {
    const { data: group } = await svc
      .from('acl_groups')
      .select('id')
      .eq('brand', BRAND)
      .eq('slug', WCM_GROUP_SLUG)
      .maybeSingle()
    if (group?.id) {
      const { error: groupError } = await svc.from('acl_group_members').upsert(
        { group_id: group.id, user_id: opts.userId },
        { onConflict: 'group_id,user_id' }
      )
      if (groupError) return { ok: false, error: groupError.message }
    }
  }

  return { ok: true }
}
