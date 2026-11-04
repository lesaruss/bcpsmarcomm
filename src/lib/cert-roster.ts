import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'

export type RosterStatus = 'confirmed' | 'on_roster' | 'unassigned'

// Verifies the caller against their own Supabase session (the same
// Authorization: Bearer pattern as /api/cert/progress).
export async function verifyCertCaller(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user
}

// Standing on the WCM Roster, matched by lowercased email (the only key the
// roster and auth share), with the same meaning as /api/bcps/members:
// 'confirmed' = on the roster with an approval date, 'on_roster' = listed but
// added by hand, 'unassigned' = not on the roster.
export async function rosterStatusForEmail(svc: SupabaseClient, email: string | null | undefined): Promise<RosterStatus> {
  const e = (email || '').trim().toLowerCase()
  if (!e) return 'unassigned'
  // ilike with the LIKE wildcards escaped is a case-insensitive exact match.
  const { data } = await svc
    .from('bcps_wcm_roster_members')
    .select('approved_at')
    .ilike('wcm_email', e.replace(/[\\%_]/g, '\\$&'))
  const rows = data ?? []
  if (rows.length === 0) return 'unassigned'
  return rows.some((r: { approved_at: string | null }) => r.approved_at) ? 'confirmed' : 'on_roster'
}
