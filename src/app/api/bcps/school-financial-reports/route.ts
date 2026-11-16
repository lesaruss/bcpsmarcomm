import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const PAGE_SLUG = 'school-financial-reports'
const TABLE = 'bcps_school_financial_reports'
const BUCKET = 'bcps-public'
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])
const MAX_BYTES = 4 * 1024 * 1024 // stays under the Vercel request body limit once base64-encoded
const YEAR_RE = /^\d{4}-\d{4}$/
const LOC_RE = /^\d{4}$/

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Verifies the caller's session and confirms they may edit School Financial
// Reports. Same check as the District Software Inventory
// (src/app/api/bcps/software-inventory/route.ts), pointed at the
// school-financial-reports page object: superadmin, brand-level admin, or
// anyone granted 'edit'/'manage' on that object directly or through a group.
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

// Fields an editor may set. Anything else in the request body is ignored.
// is_traditional: false keeps a row (contracted sites, programs) off the public embed.
const FIELDS = ['location_number', 'school_name', 'school_year', 'file_url', 'file_name', 'is_traditional'] as const

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const f of FIELDS) {
    if (!(f in body)) continue
    const v = body[f]
    out[f] = f === 'is_traditional' ? v === true || v === 'true' : typeof v === 'string' ? v.trim() : v
  }
  if (typeof out.school_name === 'string') out.school_name = (out.school_name as string).toUpperCase()
  return out
}

function invalid(f: Record<string, unknown>, partial: boolean): string | null {
  const need = (k: string) => !partial || k in f
  if (need('location_number') && !LOC_RE.test(String(f.location_number ?? ''))) return 'Location number must be 4 digits (for example 0011).'
  if (need('school_name') && !f.school_name) return 'School name is required.'
  if (need('school_year') && !YEAR_RE.test(String(f.school_year ?? ''))) return 'School year must look like 2024-2025.'
  if (need('file_url') && !/^(https:\/\/|\/)/.test(String(f.file_url ?? ''))) return 'Upload a PDF for this report.'
  return null
}

// Stores a PDF in the public bucket and returns its URL. Body carries the
// file as a data: URL (same shape as /api/cert/upload).
async function storePdf(loc: string, year: string, dataUrl: string) {
  const m = String(dataUrl || '').match(/^data:application\/pdf;base64,(.+)$/)
  if (!m) throw Object.assign(new Error('That file is not a PDF.'), { status: 400 })
  const buf = Buffer.from(m[1], 'base64')
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('That file is not a PDF.'), { status: 400 })
  if (buf.byteLength > MAX_BYTES) throw Object.assign(new Error('That PDF is larger than 4MB.'), { status: 400 })
  const path = `school-financial-reports/${year}/${loc}-${Date.now()}.pdf`
  const { error } = await svc.storage.from(BUCKET).upload(path, buf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
  return svc.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// GET /api/bcps/school-financial-reports - every row, for the editor
export async function GET(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await svc.from(TABLE).select('*').order('location_number').order('school_year')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [] })
}

// POST /api/bcps/school-financial-reports
//   { action: 'create', location_number, school_name, school_year, file }   file = data:application/pdf;base64,...
//   { action: 'update', id, ...fields, file? }                              file replaces the PDF
//   { action: 'delete', id }
export async function POST(req: NextRequest) {
  const user = await requireEditor(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  try {
    switch (body.action as string) {
      case 'create': {
        const fields = pick(body)
        if (body.file) fields.file_url = await storePdf(String(fields.location_number), String(fields.school_year), body.file)
        const bad = invalid(fields, false)
        if (bad) return NextResponse.json({ error: bad }, { status: 400 })
        fields.file_name = `${fields.school_year}_${fields.school_name}_${fields.location_number}.pdf`
        const { data, error } = await svc.from(TABLE).insert(fields).select().single()
        if (error) {
          if (error.code === '23505') return NextResponse.json({ error: 'That school already has a report for this year. Open it and replace the PDF instead.' }, { status: 409 })
          throw error
        }
        await audit(user.id, 'school_financial_report_create', { location_number: fields.location_number, school_year: fields.school_year })
        return NextResponse.json({ ok: true, item: data }, { status: 201 })
      }
      case 'update': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { data: cur, error: curErr } = await svc.from(TABLE).select('*').eq('id', id).single()
        if (curErr || !cur) return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
        const updates = pick(body)
        const merged = { ...cur, ...updates }
        if (body.file) updates.file_url = await storePdf(String(merged.location_number), String(merged.school_year), body.file)
        const bad = invalid(updates, true)
        if (bad) return NextResponse.json({ error: bad }, { status: 400 })
        updates.file_name = `${merged.school_year}_${merged.school_name}_${merged.location_number}.pdf`
        const { data, error } = await svc.from(TABLE)
          .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
        if (error) {
          if (error.code === '23505') return NextResponse.json({ error: 'Another report already uses that school and year.' }, { status: 409 })
          throw error
        }
        await audit(user.id, 'school_financial_report_update', { id, updates: { ...updates, file: body.file ? 'replaced' : undefined } })
        return NextResponse.json({ ok: true, item: data })
      }
      case 'delete': {
        const { id } = body
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })
        const { error } = await svc.from(TABLE).delete().eq('id', id)
        if (error) throw error
        await audit(user.id, 'school_financial_report_delete', { id })
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Error' }, { status: e.status ?? 500 })
  }
}
