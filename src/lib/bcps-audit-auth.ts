// lib/bcps-audit-auth.ts
//
// Who is calling the audit APIs, and what they may see. BCPS admins see and
// run everything; a department's WCM (bcps_departments.wcm_email) and
// director (director_email) see their department's audit, and the WCM may
// re-run it. Schools are admin-only until school WCMs are on the system.

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

export function deptAccess(caller: { email: string; admin: boolean }, dept: { wcm_email?: string | null; director_email?: string | null }) {
  const wcm = same(dept.wcm_email, caller.email)
  return { view: caller.admin || wcm || same(dept.director_email, caller.email), run: caller.admin || wcm, admin: caller.admin, wcm }
}
