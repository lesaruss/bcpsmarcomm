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
// GET: list all schools - any signed-in BCPS Marcomm account, not just
// admin/superadmin. Per V, 2026-08-19: this is a working tool for the whole
// team, not a locked-down console - anyone with a BCPS Marcomm login should
// be able to onboard a school, same as any other page here. Starts empty,
// schools are added one at a time as they're onboarded (no bulk import -
// per V, 2026-08-19, there's no existing consolidated school roster to
// import).
// POST: create a school row AND (optionally, if wcm_email + a temp
// password are supplied) create the WCM's Supabase Auth account in the
// same call, exactly like an admin creating any other WCM account -
// must_change_password is set so they're forced to pick their own password
// on first login, mirroring the existing /set-password flow.
//
// school_location_nbr added 2026-09-04 (School Profiles step 2, Sean): a
// school onboarded here used to only get a free-text name, with no link to
// bcps_school_directory (the 227-school district roster the banner tool
// already keys everything to by loc_no). That meant ADA scan history for a
// school-portal account had no reliable join to the School Profile page -
// the one row that existed before this had to be backfilled by hand-matching
// "Silver Ridge Elementary" to loc_no 3081. Fixed at the root: a school is
// now selected from bcps_school_directory (loc_no is the real key), not
// typed freehand, so every school onboarded from here on already has the
// join key it needs.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

// Any authenticated BCPS Marcomm login - no role/tier check. The page is
// registered as public in acl_objects, so the gate here just needs to match:
// a valid session is all that's required, exactly like the pages this tool
// sits next to (ADA Scanner, Minibase, etc.).
async function requireAuth(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false, status: 401, error: 'Unauthorized' }
  const asUser = createClient(SUPA_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' }
  return { ok: true, userId: user.id }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await svc
    .from('bcps_schools')
    .select('id, name, site_url, wcm_name, wcm_email, wcm_user_id, notes, school_location_nbr, created_at')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, schools: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const schoolLocationNbr = (body.school_location_nbr || '').trim() || null
  const siteUrl = (body.site_url || '').trim() || null
  const wcmName = (body.wcm_name || '').trim() || null
  const wcmEmail = (body.wcm_email || '').trim().toLowerCase() || null
  const tempPassword = (body.temp_password || '').trim() || null
  const notes = (body.notes || '').trim() || null

  if (!schoolLocationNbr) return NextResponse.json({ error: 'Select a school from the district directory.' }, { status: 400 })

  const { data: directoryRow, error: dirErr } = await svc
    .from('bcps_school_directory')
    .select('loc_no, school_name')
    .eq('loc_no', schoolLocationNbr)
    .eq('is_archived', false)
    .maybeSingle()
  if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 500 })
  if (!directoryRow) return NextResponse.json({ error: 'Selected school was not recognized. Please choose again from the list.' }, { status: 400 })
  const name = directoryRow.school_name

  const { data: already } = await svc.from('bcps_schools').select('id').eq('school_location_nbr', schoolLocationNbr).maybeSingle()
  if (already) return NextResponse.json({ error: `${name} already has a school-portal account.` }, { status: 400 })

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
      school_location_nbr: schoolLocationNbr,
    })
    .select('id, name, site_url, wcm_name, wcm_email, wcm_user_id, notes, school_location_nbr, created_at')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, school })
}
