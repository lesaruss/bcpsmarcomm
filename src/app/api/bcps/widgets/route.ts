import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

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
// whether the calling user may edit it. Visibility of the catalog itself
// (whether this route is worth calling at all) is enforced by the Widgets
// page object in acl_objects + /api/bcps/my-access, same as every other
// BCPS page - this route just needs the caller to be a known BCPS user.
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'

  const { data: widgets, error } = await svc.from('bcps_widgets').select('*').order('sort_order')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const slugs = (widgets ?? []).map(w => w.slug)
  const { data: objects } = await svc.from('acl_objects')
    .select('id, slug').eq('brand', BRAND).eq('kind', 'page').in('slug', slugs.length ? slugs : ['__none__'])
  const objectBySlug = new Map((objects ?? []).map(o => [o.slug, o.id]))

  let editableIds = new Set<string>()
  if (!isAdmin) {
    const objIds = Array.from(objectBySlug.values())
    const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
    const gids = (gm ?? []).map(g => g.group_id)
    const { data: grants } = await svc.from('acl_grants')
      .select('object_id, subject_type, subject_id, role').in('object_id', objIds.length ? objIds : ['__none__'])
    editableIds = new Set((grants ?? []).filter(g =>
      ['edit', 'manage'].includes(g.role) && (
        (g.subject_type === 'user' && g.subject_id === user.id) ||
        (g.subject_type === 'group' && gids.includes(g.subject_id))
      )).map(g => g.object_id))
  }

  const result = (widgets ?? []).map(w => {
    const objectId = objectBySlug.get(w.slug) ?? null
    return {
      ...w,
      object_id: objectId,
      can_edit: isAdmin || (objectId ? editableIds.has(objectId) : false),
    }
  })

  return NextResponse.json({ ok: true, role, widgets: result })
}

// POST /api/bcps/widgets - { action, ...fields }. Admin/superadmin only.
// Registering a new widget (slug/title/preview_path/editor_component) is a
// separate concern from assigning editors - that reuses the existing
// grant_set action in /api/bcps/permissions against the widget's own
// acl_objects row, so it isn't duplicated here.
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const role = await roleFor(user.id)
  if (role !== 'admin' && role !== 'superadmin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

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
