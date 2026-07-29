import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Lists the calling admin's own outstanding/active access requests, for
// the small Dashboard indicator (per Sean, 2026-07-29) so a pending or
// approved grant doesn't get lost in email. Scoped to requested_by = the
// caller - one admin never sees another admin's requests through this
// endpoint.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 401 })
  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', 'bcps').maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: grants } = await svc.from('support_access_grants')
    .select('id, target_user_id, status, reason, requested_at, approved_at')
    .eq('requested_by', user.id)
    .in('status', ['requested', 'approved'])
    .order('requested_at', { ascending: false })

  const targetIds = [...new Set((grants ?? []).map(g => g.target_user_id))]
  const { data: profiles } = targetIds.length
    ? await svc.from('wcm_cert_users').select('user_id, full_name, email').in('user_id', targetIds)
    : { data: [] }
  const byId = new Map((profiles ?? []).map(p => [p.user_id, p]))

  const requests = (grants ?? []).map(g => ({
    ...g,
    target_name: byId.get(g.target_user_id)?.full_name || byId.get(g.target_user_id)?.email || 'Member',
  }))

  return NextResponse.json({ requests })
}
