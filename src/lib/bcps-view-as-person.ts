import type { SupabaseClient } from '@supabase/supabase-js'

// "View as person" (Sean, 2026-10-09): the SuperAdmin sees the site exactly as
// one named person would, from that person's real data, including someone
// who has not created an account yet (their dashboard is built from their
// email and any access queued for them in bcps_pending_group_members, which
// is what they get on first sign-in). Read-only: the preview never writes as
// the person and never claims their pending access.

// Matches no row; used for a person who has no account yet.
export const NO_USER_ID = '00000000-0000-0000-0000-000000000000'

export interface PersonSubject {
  userId: string // NO_USER_ID when the person has no account
  email: string
  hasAccount: boolean
  pendingGroupIds: string[]
}

export async function isSuperadmin(svc: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await svc.from('acl_member_roles').select('role').eq('user_id', userId).eq('brand', 'bcps').maybeSingle()
  return data?.role === 'superadmin'
}

export async function resolvePerson(svc: SupabaseClient, rawEmail: string): Promise<PersonSubject | null> {
  const email = rawEmail.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return null
  const [{ data: id }, { data: pending }] = await Promise.all([
    svc.rpc('bcps_user_id_by_email', { p_email: email }),
    svc.from('bcps_pending_group_members').select('group_id').eq('email', email),
  ])
  return {
    userId: (id as string | null) ?? NO_USER_ID,
    email,
    hasAccount: !!id,
    pendingGroupIds: (pending ?? []).map((p) => p.group_id as string),
  }
}
