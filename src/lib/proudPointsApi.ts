import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase-admin'

// Server-only plumbing shared by /api/proud-points/*: the same caller check
// and service-role client every /api/banner route builds for itself.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const svc = createServiceClient(URL, SERVICE)

export async function caller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

export async function schoolByLoc(locNo: string | undefined | null) {
  if (!locNo) return null
  const { data } = await svc.from('bcps_school_directory')
    .select('loc_no, school_name, school_level').eq('loc_no', locNo).eq('is_archived', false).maybeSingle()
  return data
}

// The same rule that decides who sees the Proud Points pages
// (lib/school-wcm-pages.ts + /api/bcps/my-access): BCPS admins and
// superadmins, District Web Team members, and school WCMs on file in
// bcps_schools.wcm_email. Every /api/proud-points route checks it, so the
// data is no wider than the page.
export async function requireProudPointsAccess(req: NextRequest) {
  const user = await caller(req)
  if (!user) return { user: null, status: 401 as const }
  const [{ data: roleRow }, { data: gm }] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle(),
    svc.from('acl_group_members').select('group_id, acl_groups!inner(name, brand)').eq('user_id', user.id)
      .eq('acl_groups.brand', 'bcps').eq('acl_groups.name', 'District Web Team'),
  ])
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin' || (gm ?? []).length > 0) return { user, status: 200 as const }
  const email = (user.email || '').trim().toLowerCase()
  if (email) {
    const { data: schools } = await svc.from('bcps_schools').select('wcm_email').not('wcm_email', 'is', null)
    if ((schools ?? []).some(r => (r.wcm_email || '').trim().toLowerCase() === email)) return { user, status: 200 as const }
  }
  return { user: null, status: 403 as const }
}
