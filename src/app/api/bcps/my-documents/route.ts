import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Documents the calling user may see in their Documents list:
// owned by them, OR (non-private AND (brand admin OR granted directly/by group)).
// Private docs are owner-only. Only returns docs that have a viewable URL.
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
  const isAdmin = role === 'admin' || role === 'superadmin'

  const { data: docs } = await svc.from('acl_objects')
    .select('id, slug, title, visibility, sensitive, owner_id, doc_url')
    .eq('brand', BRAND).eq('kind', 'document')
  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  const { data: grants } = await svc.from('acl_grants').select('object_id, subject_type, subject_id')

  const grantedTo = (objId: string) => (grants ?? []).some(g =>
    g.object_id === objId && (
      (g.subject_type === 'user' && g.subject_id === user.id) ||
      (g.subject_type === 'group' && gids.includes(g.subject_id))))

  const visible = (docs ?? []).filter(d => {
    if (!d.doc_url) return false
    if (d.owner_id === user.id) return true
    if (d.visibility === 'private') return false
    return isAdmin || grantedTo(d.id)
  }).map(d => ({ slug: d.slug, title: d.title, url: d.doc_url, sensitive: d.sensitive }))

  return NextResponse.json({ ok: true, documents: visible })
}
