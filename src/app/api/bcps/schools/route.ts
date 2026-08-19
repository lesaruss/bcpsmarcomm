// app/api/bcps/schools/route.ts
//
// Admin management for individual BCPS schools' lightweight ADA scan
// accounts. Per V, 2026-08-19: the District Web Team's ADA Scanner
// (/?page=ada-scanner) is for DWT practice/testing - schools themselves
// don't have (and, for now, shouldn't get) the full BCPS Marcomm dashboard.
// Instead each school WCM gets a real Supabase Auth account (same login
// system as everyone else - "one BCPS Marcomm login gates every page," per
// the existing middleware.ts comment) but is only ever handed a link to
// the standalone /school-portal page, which shows just their school's
// basic info and their own ADA scan results - modeled directly on the
// existing /wcm-portal pattern (department WCMs matched by email against
// bcps_departments.wcm_email; this is the same shape against bcps_schools).
//
// Deliberately NOT wired into acl_member_roles/acl_group_members/acl_grants
// - school WCMs are not BCPS district staff and shouldn't show up in the
// Members directory, the district ACL groups, or count against any of
// that system's assumptions. Access to /school-portal and /api/bcps/
// school-scan is gated purely by "is your signed-in email listed as a
// school's wcm_email," exactly like /wcm-portal does today.
//
// GET: list all schools (admin/superadmin only) - starts empty, schools
// are added one at a time as they're onboarded (no bulk import - per V,
// 2026-08-19, there's no existing consolidated school roster to import).
// POST: create a school row AND (optionally, if wcm_email + a temp
// password are supplied) create the WCM's Supabase Auth account in the
// same call, exactly like an admin creating any other WCM account -
// must_change_password is set so they're forced to pick their own password
// on first login, mirroring the existing /set-password flow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function requireAdmin(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: roleRow } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle()
  const role = roleRow?.role || 'user'
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403, error: 'Forbidden' }
  return { ok: true, userId: user.id }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await svc
    .from('bcps_schools')
    .select('id, name, site_url, wcm_name, wcm_email, wcm_user_id, notes, created_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, schools: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const name = (body.name || '').trim()
  const siteUrl = (body.site_url || '').trim() || null
  const wcmName = (body.wcm_name || '').trim() || null
  const wcmEmail = (body.wcm_email || '').trim().toLowerCase() || null
  const tempPassword = (body.temp_password || '').trim() || null
  const notes = (body.notes || '').trim() || null

  if (!name) return NextResponse.json({ error: 'School name is required.' }, { status: 400 })

  let wcmUserId: string | null = null

  // Only create/link an auth account when both an email and a temp
  // password are supplied - a school can be added first and have its WCM
  // account created later.
  if (wcmEmail && tempPassword) {
    const { data: existing } = await svc.auth.admin.listUsers({ perPage: 1000 })
    const already = existing?.users.find(u => (u.email || '').toLowerCase() === wcmEmail)

    if (already) {
      wcmUserId = already.id
    } else {
      const { data: created, error: createErr } = await svc.auth.admin.createUser({
        email: wcmEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: wcmName || name, must_change_password: true, school_wcm: true },
      })
      if (createErr) return NextResponse.json({ error: `Could not create WCM account: ${createErr.message}` }, { status: 500 })
      wcmUserId = created.user?.id ?? null
    }
  }

  const { data: school, error: insertErr } = await svc
    .from('bcps_schools')
    .insert({
      name,
      site_url: siteUrl,
      wcm_name: wcmName,
      wcm_email: wcmEmail,
      wcm_user_id: wcmUserId,
      notes,
    })
    .select('id, name, site_url, wcm_name, wcm_email, wcm_user_id, notes, created_at')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, school })
}
