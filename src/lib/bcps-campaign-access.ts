// src/lib/bcps-campaign-access.ts
//
// Access gate for campaign reports at /campaigns/[slug].
//
// This is DEFAULT DENY and it is deliberately NOT checkDocAccess.
// checkDocAccess (src/lib/bcps-doc-access.ts) is public-unless-recipients-exist,
// which is right for meeting docs that the District shares broadly and wrong
// here: Sean was explicit that campaign reports are not publicly viewable. A
// campaign report carries marketing performance for a live District campaign,
// so an empty grant list must mean nobody, never everybody.
//
// Who gets in, and nothing else gets in:
//   1. BCPS admins and superadmins (acl_member_roles.role for brand 'bcps'),
//      the same check requireBcpsAdmin uses everywhere else in this codebase.
//   2. Anyone in a group granted on the 'campaign-reports' acl_objects row -
//      currently the Office of Communications group only.
//   3. Anyone holding a direct user grant on that same row, which is how an
//      individual is given access without putting them in a group.
//
// Note the shape of 2 and 3: access is driven by acl_grants rows against one
// object, so widening or narrowing access is a data change, never a code
// change. Adding a person is one INSERT into acl_grants.
//
// Everyone else is denied, including the 85 users holding a plain 'user' role
// for brand 'bcps' and the 77 members of the WCM group. Measured 2026-09-22:
// this gate admits 4 people.
import { NextRequest } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const BRAND = 'bcps'
export const CAMPAIGN_REPORTS_SLUG = 'campaign-reports'

export function campaignServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.LESARUSS_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.LESARUSS_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  })
}

/** The signed-in user from the request cookies, or null. */
export async function getSessionUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) return null
    const cookieStore = await cookies()
    const supabase = createServerClient(url, anonKey, {
      cookies: { getAll() { return cookieStore.getAll() }, setAll() {} },
    })
    const { data: { user } } = await supabase.auth.getUser()
    return user ? { id: user.id, email: user.email ?? null } : null
  } catch {
    return null
  }
}

export interface CampaignAccess {
  allowed: boolean
  /** Why they got in, for the footer on the report and for support questions. */
  via: 'admin' | 'group' | 'direct' | null
}

const DENIED: CampaignAccess = { allowed: false, via: null }

export async function checkCampaignReportAccess(
  db: SupabaseClient,
  userId: string | null,
): Promise<CampaignAccess> {
  if (!userId) return DENIED

  // 1. BCPS admin or superadmin.
  const { data: roleRow } = await db
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('brand', BRAND)
    .maybeSingle()
  const role = roleRow?.role ?? 'user'
  if (role === 'admin' || role === 'superadmin') return { allowed: true, via: 'admin' }

  // The one object every campaign report hangs off. No object means no grants
  // exist, which means nobody but an admin gets in - the safe direction.
  const { data: obj } = await db
    .from('acl_objects')
    .select('id')
    .eq('brand', BRAND)
    .eq('slug', CAMPAIGN_REPORTS_SLUG)
    .maybeSingle()
  if (!obj) return DENIED

  const { data: grants } = await db
    .from('acl_grants')
    .select('subject_type, subject_id')
    .eq('object_id', obj.id)
  if (!grants || grants.length === 0) return DENIED

  // 3. Direct user grant.
  if (grants.some(g => g.subject_type === 'user' && g.subject_id === userId)) {
    return { allowed: true, via: 'direct' }
  }

  // 2. Group grant.
  const groupIds = grants.filter(g => g.subject_type === 'group').map(g => g.subject_id)
  if (groupIds.length === 0) return DENIED

  const { data: membership } = await db
    .from('acl_group_members')
    .select('group_id')
    .eq('user_id', userId)
    .in('group_id', groupIds)
  if (membership && membership.length > 0) return { allowed: true, via: 'group' }

  return DENIED
}

/** Route-handler flavor: resolves the session itself and returns a 401/403 shape. */
export async function requireCampaignReportAccess(
  _req: NextRequest,
  db: SupabaseClient,
): Promise<{ ok: true; userId: string; via: CampaignAccess['via'] } | { ok: false; status: number; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, status: 401, error: 'Sign in with your BCPS account to continue.' }
  const access = await checkCampaignReportAccess(db, user.id)
  if (!access.allowed) return { ok: false, status: 403, error: 'You do not have access to campaign reports.' }
  return { ok: true, userId: user.id, via: access.via }
}
