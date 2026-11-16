import type { SupabaseClient } from '@supabase/supabase-js'

// The District Web Team Guide's two sides (Sean, 2026-11-16): the department
// work and the school work. Each reader opens on the side they work on, so
// the school side (Application Services, who support the schools) does not
// sort through the department material, and the department side does not
// sort through the school material. Only the SuperAdmin gets the toggle
// between them. Shared items (This Week, meetings, assignments, Members,
// Calendar, Reference) show on both.
//
// School side: a member of the Application Services department, or a District
// Web Team member who is not in the Office of Communications and not an admin.
// That is the same split /api/bcps/home makes between 'appsvc' and 'comms'.
export type GuideSide = 'departments' | 'schools'
export type GuideSideInfo = { side: GuideSide; toggle: boolean }

export const SIDED_GUIDES = new Set(['district-web-team'])

export async function guideSideFor(db: SupabaseClient, userId: string, opts: { superadmin: boolean }): Promise<GuideSideInfo> {
  if (opts.superadmin) return { side: 'departments', toggle: true }
  const [{ data: role }, { data: gm }] = await Promise.all([
    db.from('acl_member_roles').select('role, department_slug').eq('user_id', userId).eq('brand', 'bcps').maybeSingle(),
    db.from('acl_group_members').select('acl_groups(name)').eq('user_id', userId),
  ])
  const groups = new Set(((gm ?? []) as unknown as { acl_groups: { name: string } | null }[]).map((g) => g.acl_groups?.name).filter(Boolean) as string[])
  const appsvc = role?.department_slug === 'application-services'
    || (groups.has('District Web Team') && !groups.has('Office of Communications') && role?.role !== 'admin' && role?.role !== 'superadmin')
  return { side: appsvc ? 'schools' : 'departments', toggle: false }
}
