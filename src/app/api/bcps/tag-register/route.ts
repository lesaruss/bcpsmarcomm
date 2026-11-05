import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'

export const dynamic = 'force-dynamic'

// Tag register for browardschools.com (Sean, 2026-11-05): who has access to
// the District's Tag Manager container GTM-NTGC6X38, with open and close
// dates, and every tag on the site, including the ones the District does not
// own. Tables: bcps_gtm_access, bcps_gtm_tags
// (supabase/migrations/20261105_bcps_gtm_tag_register.sql). Superadmin only,
// the same as the page (src/components/pages/TagRegisterPage.tsx).

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const ACCESS_FIELDS = [
  'department_slug', 'agency', 'purpose', 'contact_name', 'contact_email', 'people', 'gtm_permission', 'workspace',
  'contract_ref', 'contract_owner', 'director_approval', 'opens_on', 'closes_on', 'status', 'intake', 'notes',
] as const
const TAG_FIELDS = [
  'container', 'name', 'platform', 'tag_type', 'ids', 'owner', 'department_slug', 'access_id', 'purpose', 'pages',
  'data_collected', 'personal_data', 'status', 'live_since', 'review_on', 'notes',
] as const

// Keeps only known columns; empty strings become null so dates and the
// access link clear cleanly.
function pick(body: any, fields: readonly string[]) {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (!(f in body)) continue
    const v = body[f]
    out[f] = typeof v === 'string' && v.trim() === '' ? null : v
  }
  return out
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const [access, tags, departments] = await Promise.all([
    svc.from('bcps_gtm_access').select('*').order('created_at'),
    svc.from('bcps_gtm_tags').select('*').order('created_at'),
    svc.from('bcps_departments').select('slug, name, director_email').order('name'),
  ])
  const error = access.error || tags.error || departments.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, access: access.data ?? [], tags: tags.data ?? [], departments: departments.data ?? [] })
}

// POST { action: 'access_save' | 'tag_save', id?, ...fields }
//      { action: 'access_delete' | 'tag_delete', id }
export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const actor = auth.user.email

  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')
  const table = action.startsWith('access_') ? 'bcps_gtm_access' : action.startsWith('tag_') ? 'bcps_gtm_tags' : null
  if (!table) return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })

  if (action.endsWith('_delete')) {
    if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const { error } = await svc.from(table).delete().eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (!action.endsWith('_save')) return NextResponse.json({ error: `Unknown action ${action}` }, { status: 400 })
  const row = pick(body, table === 'bcps_gtm_access' ? ACCESS_FIELDS : TAG_FIELDS)
  if (table === 'bcps_gtm_access' && !body.id && !row.agency) return NextResponse.json({ error: 'Agency is required' }, { status: 400 })
  if (table === 'bcps_gtm_tags' && !body.id && (!row.name || !row.container)) {
    return NextResponse.json({ error: 'Tag name and container are required' }, { status: 400 })
  }
  // Closing access without a date records today, so the register always
  // shows when access ended.
  if (table === 'bcps_gtm_access' && row.status === 'closed' && !row.closes_on) {
    const { data: cur } = body.id ? await svc.from(table).select('closes_on').eq('id', body.id).maybeSingle() : { data: null }
    if (!cur?.closes_on) row.closes_on = new Date().toISOString().slice(0, 10)
  }
  const stamped = { ...row, updated_by: actor, updated_at: new Date().toISOString() }

  const res = body.id
    ? await svc.from(table).update(stamped).eq('id', body.id).select('*').single()
    : await svc.from(table).insert(stamped).select('*').single()
  if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, row: res.data })
}
