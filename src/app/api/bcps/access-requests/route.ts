import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

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

  const { data: grants, error: grantsErr } = await svc.from('support_access_grants')
    .select('id, target_user_id, status, reason, requested_at, approved_at, requested_by')
    .eq('requested_by', user.id)
    .in('status', ['requested', 'approved'])
    .order('requested_at', { ascending: false })

  const { count, error: countErr } = await svc.from('support_access_grants')
    .select('id', { count: 'exact', head: true })

  const { data: allGrants, error: allErr } = await svc.from('support_access_grants').select('id, requested_by, status')

  return NextResponse.json({
    keyTail: SERVICE.slice(-8),
    urlUsed: URL,
    debugUserId: user.id,
    role,
    grantsErr: grantsErr?.message ?? null,
    grantsCode: (grantsErr as any)?.code ?? null,
    grants,
    countErr: countErr?.message ?? null,
    totalCount: count,
    allErr: allErr?.message ?? null,
    allGrants,
  })
}
