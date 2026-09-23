import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const SUPERADMIN_ONLY = ['permissions', 'superadmin']

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

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

  // ?preview_group=<group name> - the page set a plain member of that group
  // would get, for SuperAdmin's "View as" preview. Added 2026-09-15 (Sean):
  // the preview used to ignore the permission model entirely and render the
  // full user-tier menu, so it showed pages the previewed person cannot
  // reach (this is how the unregistered Minibase page appeared under a
  // sample Web Content Manager while it was invisible to every real
  // account, SuperAdmin included). A preview that does not match what the
  // person sees is worse than no preview - it was being used to verify
  // other people's access.
  //
  // SuperAdmin only: this reads another subject's effective access, so it
  // must never answer for a caller who is not already entitled to see it.
  const previewGroup = req.nextUrl.searchParams.get('preview_group')
  if (previewGroup) {
    if (role !== 'superadmin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { data: group } = await svc.from('acl_groups')
      .select('id').eq('brand', BRAND).eq('name', previewGroup).maybeSingle()
    if (!group) return NextResponse.json({ error: 'unknown group' }, { status: 404 })
    const { data: grants } = await svc.from('acl_grants')
      .select('object_id').eq('subject_type', 'group').eq('subject_id', group.id)
    const grantedObjIds = new Set((grants ?? []).map(g => g.object_id))
    const previewPages = all
      .filter(p => p.visibility === 'public' || grantedObjIds.has(p.id))
      .map(p => p.slug)
    const previewRes = NextResponse.json({ ok: true, role: 'user', preview_group: previewGroup, pages: previewPages, groups: [previewGroup] })
    previewRes.headers.set('Cache-Control', 'no-store')
    return previewRes
  }

  // The caller's group names, returned alongside pages (2026-09-23) so the
  // sidebar can show the District Web Team section only to District Web
  // Team members (Sean, Hot Lab 2026-09-22). Page access itself is still
  // decided by grants below; this only decides which heading a granted
  // page is listed under.
  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  let groups: string[] = []
  if (gids.length) {
    const { data: gRows } = await svc.from('acl_groups').select('name').eq('brand', BRAND).in('id', gids)
    groups = (gRows ?? []).map(g => g.name as string)
  }

  let allowed: string[]
  if (role === 'superadmin') {
    allowed = all.map(p => p.slug)
  } else if (role === 'admin') {
    allowed = all.filter(p => !SUPERADMIN_ONLY.includes(p.slug)).map(p => p.slug)
  } else {
    const { data: grants } = await svc.from('acl_grants').select('object_id, subject_type, subject_id')
    const grantedObjIds = new Set((grants ?? []).filter(g =>
      (g.subject_type === 'user' && g.subject_id === user.id) ||
      (g.subject_type === 'group' && gids.includes(g.subject_id))).map(g => g.object_id))
    allowed = all.filter(p => p.visibility === 'public' || grantedObjIds.has(p.id)).map(p => p.slug)
  }

  const res = NextResponse.json({ ok: true, role, pages: allowed, groups })
  res.headers.set('Cache-Control', 'no-store')
  return res
}
