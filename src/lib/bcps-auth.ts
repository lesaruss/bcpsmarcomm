import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

// Shared BCPS request auth. Extracted 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED)
// when the WCM Roster intake/queue pair moved off the shared static ACCESS_KEY
// (value withheld) - that key shipped in the client bundle AND in a
// PUBLIC GitHub repo (lesaruss/bcpsmarcomm, verified private:false), so it was
// never an auth boundary at all.
//
// Per canon-gate-new-surfaces-on-the-same-check: these are the checks that
// already guard BCPS data elsewhere, named here once instead of being
// re-derived per route.
//   - requireDistrictUser mirrors the enrollment gate in
//     src/app/api/bcps/wcm-pilot-register/route.ts (POST): a valid Supabase
//     session whose email ends in @browardschools.com, OR an address already
//     holding an acl_member_roles row for brand 'bcps' (QA/service accounts
//     that predate the district-domain rule keep working).
//   - requireBcpsAdmin is the same check used by admin-set-department,
//     admin-reset-password, admin-decision and run-audit: acl_member_roles.role
//     in ('admin','superadmin') for brand 'bcps'.

const service = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

const BRAND = 'bcps'
export const DISTRICT_DOMAIN = '@browardschools.com'

export function isDistrictEmail(email: string | null | undefined): boolean {
  return (email || '').trim().toLowerCase().endsWith(DISTRICT_DOMAIN)
}

type AuthUser = { userId: string; email: string }
export type AuthResult =
  | { ok: true; user: AuthUser }
  | { ok: false; status: number; error: string }

// Accepts either an explicit bearer token or the app's own session cookie.
//
// The cookie path was added 2026-09-14 when the second batch of shared-key
// endpoints (ooc-queue, dcr, marketing-queue) moved onto real auth. This app
// signs users in with @supabase/ssr, which keeps the session in cookies on
// this origin - so any same-origin caller is already carrying a verified
// identity, whether or not it can build an Authorization header. That matters
// for public/marketing-specialist.html, a plain static page with no bundler
// and no Supabase client of its own: with the cookie path it authenticates as
// the signed-in staff member with no rewrite, instead of needing a shared key.
// React callers still send a bearer token explicitly; both routes end at the
// same verified user.
async function userFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')

  // Both paths are wrapped: a malformed or truncated auth cookie makes
  // @supabase/ssr throw out of its own cookie parsing rather than return a null
  // user. Unwrapped that still ends in a 401 (the caller treats null as denied),
  // but it logs a TypeError on every junk request. Denying quietly is the
  // correct behavior for an unauthenticated caller, so catch and return null.
  if (token) {
    try {
      const asUser = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }
      )
      const { data: { user } } = await asUser.auth.getUser()
      if (user) return { userId: user.id, email: (user.email || '').trim().toLowerCase() }
    } catch { /* fall through to denied */ }
    return null
  }

  try {
    const fromCookies = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return req.cookies.getAll() },
          setAll() { /* read-only: this never refreshes or writes a session */ },
        },
      }
    )
    const { data: { user } } = await fromCookies.auth.getUser()
    if (user) return { userId: user.id, email: (user.email || '').trim().toLowerCase() }
  } catch { /* fall through to denied */ }
  return null
}

// A signed-in district user. This is the door for anything a real BCPS
// employee does for themselves (submitting their own department's roster),
// as opposed to anything done ABOUT another user, which needs requireBcpsAdmin.
export async function requireDistrictUser(req: NextRequest): Promise<AuthResult> {
  const user = await userFromRequest(req)
  if (!user) return { ok: false, status: 401, error: 'Sign in with your BCPS account to continue.' }

  if (!isDistrictEmail(user.email)) {
    const { data: existingRole } = await service
      .from('acl_member_roles')
      .select('user_id')
      .eq('user_id', user.userId)
      .eq('brand', BRAND)
      .maybeSingle()
    if (!existingRole) {
      return { ok: false, status: 403, error: `BCPS access is restricted to ${DISTRICT_DOMAIN} email addresses.` }
    }
  }
  return { ok: true, user }
}

// Superadmin only. Sidebar.tsx gates a handful of pages on
// effectiveRole === 'superadmin' (its SUPERADMIN_PAGES set), which is STRICTER
// than requireBcpsAdmin's admin-or-superadmin. Routes backing those pages use
// this instead, so the server matches the UI rather than quietly accepting a
// tier the page itself would not show - per canon-gate-new-surfaces-on-the-same-check.
export async function requireBcpsSuperAdmin(req: NextRequest): Promise<AuthResult> {
  const user = await userFromRequest(req)
  if (!user) return { ok: false, status: 401, error: 'Sign in with your BCPS account to continue.' }

  const { data: roleRow } = await service
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', user.userId)
    .eq('brand', BRAND)
    .maybeSingle()
  if ((roleRow?.role || 'user') !== 'superadmin') {
    return { ok: false, status: 403, error: 'Forbidden - superadmin access required' }
  }
  return { ok: true, user }
}

// True when this user holds admin or superadmin for BCPS. Used where a route
// is primarily self-service but staff need to act on someone else's behalf.
export async function isBcpsAdmin(userId: string): Promise<boolean> {
  const { data: roleRow } = await service
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('brand', BRAND)
    .maybeSingle()
  const role = roleRow?.role || 'user'
  return role === 'admin' || role === 'superadmin'
}

export async function requireBcpsAdmin(req: NextRequest): Promise<AuthResult> {
  const user = await userFromRequest(req)
  if (!user) return { ok: false, status: 401, error: 'Sign in with your BCPS account to continue.' }

  const { data: roleRow } = await service
    .from('acl_member_roles')
    .select('role')
    .eq('user_id', user.userId)
    .eq('brand', BRAND)
    .maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') {
    return { ok: false, status: 403, error: 'Forbidden - admin access required' }
  }
  return { ok: true, user }
}
