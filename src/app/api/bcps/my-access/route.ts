import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const SUPERADMIN_ONLY = ['permissions', 'superadmin']

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Returns the calling user's role and the exact set of page slugs they may reach.
// Engine-driven: superadmin = all; admin = all except the permissions/superadmin consoles;
// user = public pages + any page granted directly or through a group.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  const role = roleRow?.role || 'user'

  const { data: pages } = await svc.from('acl_objects')
    .select('id, slug, visibility').eq('brand', BRAND).eq('kind', 'page')
  const all = pages ?? []

  let allowed: string[]
  if (role === 'superadmin') {
    allowed = all.map(p => p.slug)
  } else if (role === 'admin') {
    allowed = all.filter(p => !SUPERADMIN_ONLY.includes(p.slug)).map(p => p.slug)
  } else {
    const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
    const gids = (gm ?? []).map(g => g.group_id)
    const { data: grants } = await svc.from('acl_grants').select('object_id, subject_type, subject_id')
    const grantedObjIds = new Set((grants ?? []).filter(g =>
      (g.subject_type === 'user' && g.subject_id === user.id) ||
      (g.subject_type === 'group' && gids.includes(g.subject_id))).map(g => g.object_id))
    allowed = all.filter(p => p.visibility === 'public' || grantedObjIds.has(p.id)).map(p => p.slug)
  }

  return NextResponse.json({ ok: true, role, pages: allowed })
}
