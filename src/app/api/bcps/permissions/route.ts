import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verify the caller is the BCPS superadmin (only they may manage permissions).
async function requireSuperadmin(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  const { data } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  if (!data || data.role !== 'superadmin') return null
  return user
}

async function audit(actor: string, action: string, object_id: string | null, detail: any) {
  await svc.from('acl_audit').insert({ brand: BRAND, actor_id: actor, action, object_id, detail })
}

export async function GET(req: NextRequest) {
  const user = await requireSuperadmin(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [groups, members, pages, myDocs, grants, links] = await Promise.all([
    svc.from('acl_groups').select('*').eq('brand', BRAND).order('name'),
    svc.from('acl_member_roles').select('user_id, role').eq('brand', BRAND),
    svc.from('acl_objects').select('*').eq('brand', BRAND).eq('kind', 'page').order('title'),
    svc.from('acl_objects').select('*').eq('brand', BRAND).eq('kind', 'document').eq('owner_id', user.id).order('title'),
    svc.from('acl_grants').select('*'),
    svc.from('acl_public_links').select('*').eq('revoked', false),
  ])

  // Resolve member identities + their group memberships.
  const ids = (members.data ?? []).map(m => m.user_id)
  const { data: authUsers } = await svc.auth.admin.listUsers({ perPage: 1000 })
  const byId = new Map((authUsers?.users ?? []).map(u => [u.id, u]))
  const { data: gm } = await svc.from('acl_group_members').select('group_id, user_id')

  const memberList = (members.data ?? []).map(m => {
    const u = byId.get(m.user_id)
    return {
      user_id: m.user_id,
      email: u?.email ?? '(unknown)',
      name: (u?.user_metadata as any)?.name || (u?.user_metadata as any)?.full_name || u?.email?.split('@')[0] || '',
      role: m.role,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      groups: (gm ?? []).filter(x => x.user_id === m.user_id).map(x => x.group_id),
    }
  }).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    ok: true,
    groups: groups.data ?? [],
    members: memberList,
    pages: pages.data ?? [],
    myDocuments: myDocs.data ?? [],
    grants: grants.data ?? [],
    links: links.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const user = await requireSuperadmin(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      case 'group_create': {
        const { data, error } = await svc.from('acl_groups')
          .insert({ brand: BRAND, slug: body.slug, name: body.name, description: body.description ?? null })
          .select().single()
        if (error) throw error
        await audit(user.id, 'group_create', null, { group: data.id, name: body.name })
        return NextResponse.json({ ok: true, group: data })
      }
      case 'group_rename': {
        const { error } = await svc.from('acl_groups').update({ name: body.name, description: body.description ?? null }).eq('id', body.group_id)
        if (error) throw error
        await audit(user.id, 'group_rename', null, { group: body.group_id, name: body.name })
        return NextResponse.json({ ok: true })
      }
      case 'group_delete': {
        const { error } = await svc.from('acl_groups').delete().eq('id', body.group_id)
        if (error) throw error
        await audit(user.id, 'group_delete', null, { group: body.group_id })
        return NextResponse.json({ ok: true })
      }
      case 'member_set_role': {
        const { error } = await svc.from('acl_member_roles')
          .upsert({ user_id: body.user_id, brand: BRAND, role: body.role }, { onConflict: 'user_id,brand' })
        if (error) throw error
        await audit(user.id, 'member_set_role', null, { user: body.user_id, role: body.role })
        return NextResponse.json({ ok: true })
      }
      case 'member_set_group': {
        if (body.member) {
          const { error } = await svc.from('acl_group_members').upsert(
            { group_id: body.group_id, user_id: body.user_id }, { onConflict: 'group_id,user_id' })
          if (error) throw error
        } else {
          const { error } = await svc.from('acl_group_members').delete()
            .eq('group_id', body.group_id).eq('user_id', body.user_id)
          if (error) throw error
        }
        await audit(user.id, 'member_set_group', null, { user: body.user_id, group: body.group_id, member: body.member })
        return NextResponse.json({ ok: true })
      }
      case 'object_upsert': {
        const row: any = { brand: BRAND, kind: body.kind, slug: body.slug, title: body.title }
        if (body.visibility !== undefined) row.visibility = body.visibility
        if (body.sensitive !== undefined) row.sensitive = body.sensitive
        if (body.owner_id !== undefined) row.owner_id = body.owner_id
        const { data, error } = await svc.from('acl_objects')
          .upsert(row, { onConflict: 'brand,kind,slug' }).select().single()
        if (error) throw error
        await audit(user.id, 'object_upsert', data.id, { slug: body.slug, visibility: row.visibility, sensitive: row.sensitive })
        return NextResponse.json({ ok: true, object: data })
      }
      case 'grant_set': {
        if (body.grant) {
          const { error } = await svc.from('acl_grants').upsert(
            { object_id: body.object_id, subject_type: body.subject_type, subject_id: body.subject_id, role: body.role },
            { onConflict: 'object_id,subject_type,subject_id' })
          if (error) throw error
        } else {
          const { error } = await svc.from('acl_grants').delete()
            .eq('object_id', body.object_id).eq('subject_type', body.subject_type).eq('subject_id', body.subject_id)
          if (error) throw error
        }
        await audit(user.id, 'grant_set', body.object_id, { subject_type: body.subject_type, subject_id: body.subject_id, role: body.role, grant: body.grant })
        return NextResponse.json({ ok: true })
      }
      case 'link_create': {
        const obj = await svc.from('acl_objects').select('sensitive, visibility').eq('id', body.object_id).single()
        if (obj.data?.sensitive) return NextResponse.json({ error: 'Sensitive items cannot have public links.' }, { status: 422 })
        const token = randomBytes(18).toString('base64url')
        const { data, error } = await svc.from('acl_public_links')
          .insert({ object_id: body.object_id, token, role: body.role ?? 'view', expires_at: body.expires_at ?? null, created_by: user.id })
          .select().single()
        if (error) throw error
        await svc.from('acl_objects').update({ visibility: 'public' }).eq('id', body.object_id)
        await audit(user.id, 'link_create', body.object_id, { role: body.role })
        return NextResponse.json({ ok: true, link: data })
      }
      case 'link_revoke': {
        const { error } = await svc.from('acl_public_links').update({ revoked: true }).eq('id', body.link_id)
        if (error) throw error
        await audit(user.id, 'link_revoke', body.object_id ?? null, { link: body.link_id })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
