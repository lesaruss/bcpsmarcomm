import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'school-support-lead'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])
const SETTING_KEYS = new Set(['iiq_url', 'hot_lab_url', 'hot_lab_text'])
const LINK_SETTINGS = new Set(['iiq_url', 'hot_lab_url'])
const LEVELS = new Set(['Elementary', 'Middle', 'High', 'Center', 'Combination', 'Community'])

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit the Find Your
// District Web Team Lead widget: superadmin, brand-level admin, or anyone
// granted 'edit'/'manage' on the school-support-lead page object directly or
// through a group (same model as the Charter School Directory, see
// src/app/api/bcps/charter-schools/route.ts).
async function requireEditor(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null

  if (SUPERADMIN_EMAILS.has(user.email ?? '')) return user

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  const role = roleRow?.role || 'user'
  if (role === 'superadmin' || role === 'admin') return user

  const { data: obj } = await svc.from('acl_objects')
    .select('id').eq('brand', BRAND).eq('kind', 'page').eq('slug', PAGE_SLUG).maybeSingle()
  if (!obj) return null

  const { data: directGrant } = await svc.from('acl_grants')
    .select('role').eq('object_id', obj.id).eq('subject_type', 'user').eq('subject_id', user.id).maybeSingle()
  if (directGrant && ['edit', 'manage'].includes(directGrant.role)) return user

  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  if (gids.length) {
    const { data: groupGrants } = await svc.from('acl_grants')
      .select('role, subject_id').eq('object_id', obj.id).eq('subject_type', 'group')
    if ((groupGrants ?? []).some(g => gids.includes(g.subject_id) && ['edit', 'manage'].includes(g.role))) return user
  }

  return null
}

async function audit(actor: string, action: string, detail: unknown) {
  await svc.from('acl_audit').insert({ brand: BRAND, actor_id: actor, action, object_id: null, detail })
}

const httpsOrNull = (v: unknown) => {
  const s = String(v ?? '').trim()
  if (!s) return null
  if (!/^https:\/\//i.test(s)) throw new Error('Links must start with https://')
  return s
}

// GET /api/bcps/school-support-lead - schools, leads and settings for the editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [schools, leads, settings] = await Promise.all([
    svc.from('bcps_school_assignments').select('loc_no, display_name, school_level, region, lead_email, no_wcm').order('display_name'),
    svc.from('bcps_support_leads').select('email, full_name, title, bio, photo_url, active, sort_order').order('sort_order'),
    svc.from('bcps_support_settings').select('key, value'),
  ])
  const error = schools.error || leads.error || settings.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, schools: schools.data ?? [], leads: leads.data ?? [], settings: settings.data ?? [] })
}

// POST /api/bcps/school-support-lead - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string
  const now = new Date().toISOString()

  try {
    switch (a) {
      case 'school_update': {
        const patch: Record<string, unknown> = { updated_at: now }
        if (body.display_name !== undefined) {
          const name = String(body.display_name).trim()
          if (!name) return NextResponse.json({ error: 'School name is required.' }, { status: 400 })
          patch.display_name = name
          patch.school_name = name
        }
        if (body.lead_email !== undefined) patch.lead_email = body.lead_email
        if (body.school_level !== undefined) {
          if (!LEVELS.has(body.school_level)) return NextResponse.json({ error: 'Unknown level.' }, { status: 400 })
          patch.school_level = body.school_level
        }
        if (body.region !== undefined) patch.region = String(body.region).trim() || null
        const { error } = await svc.from('bcps_school_assignments').update(patch).eq('loc_no', body.loc_no)
        if (error) throw error
        await audit(user.id, 'school_support_school_update', { loc_no: body.loc_no, ...patch })
        return NextResponse.json({ ok: true })
      }
      case 'school_create': {
        const loc = String(body.loc_no ?? '').trim()
        const name = String(body.display_name ?? '').trim()
        if (!/^\d{4}$/.test(loc)) return NextResponse.json({ error: 'Location number must be 4 digits, for example 0131.' }, { status: 400 })
        if (!name || !body.lead_email) return NextResponse.json({ error: 'School name and District Web Team Lead are required.' }, { status: 400 })
        if (body.school_level && !LEVELS.has(body.school_level)) return NextResponse.json({ error: 'Unknown level.' }, { status: 400 })
        const { error } = await svc.from('bcps_school_assignments').insert({
          loc_no: loc, school_name: name, display_name: name, school_level: body.school_level || null,
          region: String(body.region ?? '').trim() || null, lead_email: body.lead_email,
        })
        if (error) throw error
        await audit(user.id, 'school_support_school_create', { loc_no: loc, name })
        return NextResponse.json({ ok: true })
      }
      case 'school_delete': {
        const { error } = await svc.from('bcps_school_assignments').delete().eq('loc_no', body.loc_no)
        if (error) throw error
        await audit(user.id, 'school_support_school_delete', { loc_no: body.loc_no })
        return NextResponse.json({ ok: true })
      }
      case 'lead_update': {
        const patch: Record<string, unknown> = { updated_at: now }
        if (body.full_name !== undefined) {
          const n = String(body.full_name).trim()
          if (!n) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
          patch.full_name = n
        }
        if (body.title !== undefined) patch.title = String(body.title).trim() || null
        if (body.bio !== undefined) {
          const b = String(body.bio).trim()
          if (b.length > 600) return NextResponse.json({ error: 'Bio is limited to 600 characters.' }, { status: 400 })
          patch.bio = b || null
        }
        if (body.photo_url !== undefined) patch.photo_url = httpsOrNull(body.photo_url)
        const { error } = await svc.from('bcps_support_leads').update(patch).eq('email', body.email)
        if (error) throw error
        await audit(user.id, 'school_support_lead_update', { email: body.email, fields: Object.keys(patch) })
        return NextResponse.json({ ok: true })
      }
      case 'setting_update': {
        if (!SETTING_KEYS.has(body.key)) return NextResponse.json({ error: 'Unknown setting.' }, { status: 400 })
        const value = LINK_SETTINGS.has(body.key) ? httpsOrNull(body.value) : (String(body.value ?? '').trim() || null)
        const { error } = await svc.from('bcps_support_settings')
          .upsert({ key: body.key, value, updated_at: now }, { onConflict: 'key' })
        if (error) throw error
        await audit(user.id, 'school_support_setting_update', { key: body.key })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: 500 })
  }
}
