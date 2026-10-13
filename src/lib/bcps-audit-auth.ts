// lib/bcps-audit-auth.ts
//
// Who is calling the audit APIs, and what they may see. BCPS admins see and
// run everything; a department's WCM and director (director_email) see
// their department's audit, and the WCM may re-run it. Schools are
// admin-only until school WCMs are on the system.
//
// A department's WCMs (Sean, 2026-10-13) are everyone on its WCM roster
// (bcps_wcm_roster_members on a bcps_wcm_roster row whose
// matched_department_id is the department), plus the single
// bcps_departments.wcm_email kept for older records. This is the same check
// /api/bcps/home uses to show a WCM their departments, so the dashboard and
// the audit agree on who a department's WCM is.

import type { NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type AuditCaller = { ok: true; email: string; admin: boolean } | { ok: false; status: number }

export async function identifyCaller(req: NextRequest, svc: SupabaseClient): Promise<AuditCaller> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401 }
  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  )
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401 }
  const { data: roleRow } = await svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  return { ok: true, email: (user.email || '').toLowerCase(), admin: role === 'admin' || role === 'superadmin' }
}

const same = (a: string | null | undefined, b: string) => !!a && a.trim().toLowerCase() === b

/** True when email is on the department's WCM roster or is its wcm_email. */
export async function isDeptWcm(svc: SupabaseClient, email: string, dept: { id: string; wcm_email?: string | null }): Promise<boolean> {
  if (!email) return false
  if (same(dept.wcm_email, email)) return true
  const { data: rosters } = await svc.from('bcps_wcm_roster').select('id').eq('matched_department_id', dept.id)
  const ids = (rosters ?? []).map((r) => r.id as string)
  if (!ids.length) return false
  const { data: members } = await svc.from('bcps_wcm_roster_members').select('wcm_email').in('roster_id', ids)
  return (members ?? []).some((m) => same(m.wcm_email as string | null, email))
}

export function deptAccess(caller: { email: string; admin: boolean }, dept: { director_email?: string | null }, wcm: boolean) {
  return { view: caller.admin || wcm || same(dept.director_email, caller.email), run: caller.admin || wcm, admin: caller.admin, wcm }
}

/** deptAccess with the roster lookup done. */
export async function deptAccessFor(svc: SupabaseClient, caller: { email: string; admin: boolean }, dept: { id: string; wcm_email?: string | null; director_email?: string | null }) {
  return deptAccess(caller, dept, await isDeptWcm(svc, caller.email, dept))
}

/** Every department email is a WCM of: its WCM roster rows plus wcm_email. */
export async function wcmDepartmentIds(svc: SupabaseClient, email: string): Promise<string[]> {
  if (!email) return []
  // ilike for case, with its wildcards escaped so it matches this email only.
  email = email.replace(/[\\%_]/g, (c) => '\\' + c)
  const ids = new Set<string>()
  const { data: members } = await svc.from('bcps_wcm_roster_members').select('roster_id').ilike('wcm_email', email)
  const rosterIds = (members ?? []).map((m) => m.roster_id as string)
  if (rosterIds.length) {
    const { data: rosters } = await svc.from('bcps_wcm_roster').select('matched_department_id').in('id', rosterIds)
    for (const r of rosters ?? []) if (r.matched_department_id) ids.add(r.matched_department_id as string)
  }
  const { data: depts } = await svc.from('bcps_departments').select('id').ilike('wcm_email', email)
  for (const d of depts ?? []) ids.add(d.id as string)
  return Array.from(ids)
}
