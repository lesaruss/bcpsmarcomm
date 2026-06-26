import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

const COLORS = ['#1672A7', '#7B5EA7', '#2E8B57', '#D4600A', '#C0392B', '#0E7C86', '#8E44AD', '#B7791F']
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || name.slice(0, 2).toUpperCase()
}
function colorFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return COLORS[h % COLORS.length]
}

// Internal directory of BCPS team members. Any signed-in member may read it.
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const [{ data: roles }, { data: groups }, { data: gm }, { data: depts }, { data: authList }] = await Promise.all([
    svc.from('acl_member_roles').select('user_id, role, department_slug, title, bio, photo_url').eq('brand', BRAND),
    svc.from('acl_groups').select('id, name').eq('brand', BRAND),
    svc.from('acl_group_members').select('group_id, user_id'),
    svc.from('bcps_departments').select('slug, name, division, director_name'),
    svc.auth.admin.listUsers({ perPage: 1000 }),
  ])
  const byId = new Map((authList?.users ?? []).map(u => [u.id, u]))
  const groupName = new Map((groups ?? []).map(g => [g.id, g.name]))
  const deptBySlug = new Map((depts ?? []).map(d => [d.slug, d]))

  const members = (roles ?? []).map(r => {
    const u = byId.get(r.user_id)
    const name = (u?.user_metadata as Record<string, unknown>)?.name as string
      || (u?.user_metadata as Record<string, unknown>)?.full_name as string
      || (u?.email?.split('@')[0] ?? 'Member')
    const dept = r.department_slug ? deptBySlug.get(r.department_slug) : null
    return {
      user_id: r.user_id,
      name,
      email: u?.email ?? '',
      role: r.role,
      initials: initials(name),
      color: colorFor(r.user_id),
      title: r.title ?? null,
      bio: r.bio ?? null,
      photo_url: r.photo_url ?? null,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      groups: (gm ?? []).filter(x => x.user_id === r.user_id).map(x => groupName.get(x.group_id)).filter(Boolean),
      department: dept ? { slug: dept.slug, name: dept.name, division: dept.division, director_name: dept.director_name } : null,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({ ok: true, me: user.id, members })
}
