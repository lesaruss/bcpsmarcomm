import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function authedUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user ?? null
}

async function roleFor(userId: string) {
  const { data } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', userId).eq('brand', BRAND).maybeSingle()
  return data?.role || 'user'
}

// GET /api/bcps/widgets - the widget catalog, each entry annotated with
// whether the calling user may edit it (can_edit) and whether they may decide
// who else can (can_manage). Visibility of the catalog itself (whether this
// route is worth calling at all) is enforced by the Widgets page object in
// acl_objects + /api/bcps/my-access, same as every other BCPS page - this
// route just needs the caller to be a known BCPS user.
//
// can_manage: superadmins, plus anyone holding a 'manage' grant on that
// widget's acl_objects row (directly or through a group). Per Sean
// 2026-10-08, a widget owner such as Vanessa can add people to their own
// widget without being a BCPS superadmin. Managers get that widget's current
// grants and the people/group picker in this same response, so the Widgets
// page no longer needs the superadmin-only /api/bcps/permissions for it.
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'
  const isSuper = role === 'superadmin'

  const { data: widgets, error } = await svc.from('bcps_widgets').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const slugs = (widgets ?? []).map(w => w.slug)
  const { data: objects } = await svc.from('acl_objects')
    .select('id, slug').eq('brand', BRAND).eq('kind', 'page').in('slug', slugs.length ? slugs : ['__none__'])
  const objectBySlug = new Map((objects ?? []).map(o => [o.slug, o.id]))

  const objIds = Array.from(objectBySlug.values())
  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  const { data: allGrants } = await svc.from('acl_grants')
    .select('id, object_id, subject_type, subject_id, role').in('object_id', objIds.length ? objIds : ['__none__'])
  const mine = (allGrants ?? []).filter(g =>
    (g.subject_type === 'user' && g.subject_id === user.id) ||
    (g.subject_type === 'group' && gids.includes(g.subject_id)))
  const editableIds = new Set(mine.filter(g => ['edit', 'manage'].includes(g.role)).map(g => g.object_id))
  const managedIds = new Set(mine.filter(g => g.role === 'manage').map(g => g.object_id))

  const result = (widgets ?? []).map(w => {
    const objectId = objectBySlug.get(w.slug) ?? null
    const canManage = isSuper || (objectId ? managedIds.has(objectId) : false)
    return {
      ...w,
      object_id: objectId,
      can_edit: isAdmin || (objectId ? editableIds.has(objectId) : false),
      can_manage: canManage,
      grants: canManage && objectId ? (allGrants ?? []).filter(g => g.object_id === objectId) : [],
    }
  })

  const body: Record<string, unknown> = { ok: true, role, widgets: result }
  if (result.some(w => w.can_manage)) Object.assign(body, await peopleDirectory())

  const res = NextResponse.json(body)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

// Groups and BCPS members with display names, for the "Add group or person"
// picker. Same name resolution as /api/bcps/permissions.
async function peopleDirectory() {
  const [groups, members] = await Promise.all([
    svc.from('acl_groups').select('id, slug, name, description').eq('brand', BRAND).order('name'),
    svc.from('acl_member_roles').select('user_id, role').eq('brand', BRAND),
  ])
  const { data: authUsers } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const byId = new Map((authUsers?.users ?? []).map(u => [u.id, u]))
  const memberList = (members.data ?? []).map(m => {
    const u = byId.get(m.user_id)
    return {
      user_id: m.user_id,
      email: u?.email ?? '(unknown)',
      name: (u?.user_metadata as any)?.name || (u?.user_metadata as any)?.full_name || u?.email?.split('@')[0] || '',
      role: m.role,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
  return { groups: groups.data ?? [], members: memberList }
}

// True when this user may change who can edit the widget behind objectId.
async function canManageObject(userId: string, objectId: string) {
  if ((await roleFor(userId)) === 'superadmin') return true
  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', userId)
  const gids = (gm ?? []).map(g => g.group_id)
  const { data: grants } = await svc.from('acl_grants')
    .select('subject_type, subject_id, role').eq('object_id', objectId).eq('role', 'manage')
  return (grants ?? []).some(g =>
    (g.subject_type === 'user' && g.subject_id === userId) ||
    (g.subject_type === 'group' && gids.includes(g.subject_id)))
}

// POST /api/bcps/widgets - { action, ...fields }.
// editor_set: superadmins and the widget's own managers (see can_manage
// above) add, change or remove who can view, edit or manage that one widget.
// widget_upsert / widget_delete: admin/superadmin only.
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const role = await roleFor(user.id)

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  if (a === 'editor_set') {
    const { object_id, subject_type, subject_id, grant } = body
    const grantRole = body.role ?? 'edit'
    if (!object_id || !subject_id || !['user', 'group'].includes(subject_type) || !['view', 'edit', 'manage'].includes(grantRole)) {
      return NextResponse.json({ error: 'object_id, subject_type, subject_id and a role of view, edit or manage are required.' }, { status: 400 })
    }
    // Only widget objects are managed here, never other pages or documents.
    const { data: obj } = await svc.from('acl_objects').select('id, slug').eq('id', object_id).eq('brand', BRAND).eq('kind', 'page').maybeSingle()
    const { data: widget } = obj ? await svc.from('bcps_widgets').select('slug').eq('slug', obj.slug).maybeSingle() : { data: null }
    if (!obj || !widget) return NextResponse.json({ error: 'Not a widget.' }, { status: 404 })
    if (!(await canManageObject(user.id, object_id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (grant) {
      const { error } = await svc.from('acl_grants').upsert(
        { object_id, subject_type, subject_id, role: grantRole },
        { onConflict: 'object_id,subject_type,subject_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { error } = await svc.from('acl_grants').delete()
        .eq('object_id', object_id).eq('subject_type', subject_type).eq('subject_id', subject_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await svc.from('acl_audit').insert({ brand: BRAND, actor_id: user.id, action: 'widget_editor_set', object_id, detail: { slug: obj.slug, subject_type, subject_id, role: grantRole, grant: !!grant } })
    return NextResponse.json({ ok: true })
  }

  if (role !== 'admin' && role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    switch (a) {
      case 'widget_upsert': {
        const { slug, title, description, preview_path, editor_component, sort_order } = body
        if (!slug || !title || !preview_path) {
          return NextResponse.json({ error: 'slug, title, and preview_path required.' }, { status: 400 })
        }
        const { data, error } = await svc.from('bcps_widgets')
          .upsert({
            slug, title, description: description ?? null, preview_path,
            editor_component: editor_component ?? null, sort_order: sort_order ?? 0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'slug' }).select().single()
        if (error) throw error
        // Make sure there's an acl_objects row to hang edit grants off of.
        await svc.from('acl_objects').upsert(
          { brand: BRAND, kind: 'page', slug, title, visibility: 'restricted', sensitive: false },
          { onConflict: 'brand,kind,slug' })
        await svc.from('acl_audit').insert({ brand: BRAND, actor_id: user.id, action: 'widget_upsert', object_id: null, detail: { slug } })
        return NextResponse.json({ ok: true, widget: data })
      }
      case 'widget_delete': {
        const { slug } = body
        if (!slug) return NextResponse.json({ error: 'slug required.' }, { status: 400 })
        const { error } = await svc.from('bcps_widgets').delete().eq('slug', slug)
        if (error) throw error
        await svc.from('acl_audit').insert({ brand: BRAND, actor_id: user.id, action: 'widget_delete', object_id: null, detail: { slug } })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
