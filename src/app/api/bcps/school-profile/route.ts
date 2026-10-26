// app/api/bcps/school-profile/route.ts
//
// School Profile (Sean + Vanessa Deslandes, 2026-10-23): everything one school
// needs on one page, the way a department profile works, so the audit, banners
// and Proud Points are done from the school instead of from separate tools.
//
// GET ?loc=<location number>[&batch=<scan_batch_id>]
//   The school, its WCM and District Web Team Lead, its leadership, its
//   full-site ADA audit history (one row per scan batch) and the chosen
//   batch's page-by-page detail (the latest unless &batch= names another),
//   its banner and Proud Points submissions, and, for the team, its
//   activity record.
// POST { loc, action: 'contacts', principal_name, principal_email, board_member_name, board_district }
//   District Web Team: save the school's leadership.
// POST { loc, action: 'note', subject, body }
//   District Web Team: email the school's WCM and keep it on the school's
//   activity record.
//
// Who may open it: the District Web Team (BCPS admin or SuperAdmin role, the
// District Web Team group, or a banner reviewer) sees every school; a school
// WCM (bcps_schools.wcm_email) sees their own. Only the team writes.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'

export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(SUPA_URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

// Location numbers are stored both bare ("343") and zero-padded ("0343").
const bare = (n: string | null | undefined) => (n || '').trim().replace(/^0+/, '')
const variants = (loc: string) => Array.from(new Set([bare(loc), bare(loc).padStart(4, '0'), loc.trim()])).filter(Boolean)

type Caller = { email: string; userId: string; team: boolean }

async function identify(req: NextRequest): Promise<Caller | null> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return null
  const [roleRes, gmRes, bannerRes] = await Promise.all([
    svc.from('acl_member_roles').select('role').eq('user_id', user.id).eq('brand', BRAND).maybeSingle(),
    svc.from('acl_group_members').select('group_id').eq('user_id', user.id),
    svc.from('bcps_banner_admins').select('role').eq('user_id', user.id).maybeSingle(),
  ])
  const role = roleRes.data?.role || 'user'
  let dwt = false
  const gids = (gmRes.data ?? []).map((g) => g.group_id as string)
  if (gids.length) {
    const { data: gRows } = await svc.from('acl_groups').select('name').eq('brand', BRAND).in('id', gids)
    dwt = (gRows ?? []).some((g) => g.name === 'District Web Team')
  }
  return { email: (user.email || '').toLowerCase(), userId: user.id, team: role === 'admin' || role === 'superadmin' || dwt || !!bannerRes.data }
}

type School = { id: string; name: string; site_url: string | null; wcm_name: string | null; wcm_email: string | null; school_location_nbr: string | null; audit_pilot?: boolean }

async function loadSchool(loc: string) {
  const locs = variants(loc)
  const [assignRes, schoolRes] = await Promise.all([
    svc.from('bcps_school_assignments').select('loc_no, display_name, school_level, region, lead_email, no_wcm').in('loc_no', locs).maybeSingle(),
    svc.from('bcps_schools').select('id, name, site_url, wcm_name, wcm_email, school_location_nbr, audit_pilot').in('school_location_nbr', locs).limit(1).maybeSingle(),
  ])
  return { assign: assignRes.data, school: schoolRes.data as School | null }
}

type RosterRow = { p_number: string; full_name: string | null; email: string | null; cert_status: string | null; site_access: string | null; cert_due_on: string | null; designated_by: string | null; access_end: string | null }

// The school's WCMs on the BCPS Central roster (2026-10-23).
async function loadRoster(loc: string): Promise<RosterRow[]> {
  const { data } = await svc.from('bcps_school_wcm_roster')
    .select('p_number, full_name, email, cert_status, site_access, cert_due_on, designated_by, access_end')
    .in('loc_no', variants(loc)).order('full_name')
  return (data ?? []) as RosterRow[]
}

function isSchoolWcm(caller: Caller, school: School | null, roster: RosterRow[]) {
  return (!!school?.wcm_email && school.wcm_email.trim().toLowerCase() === caller.email)
    || roster.some((r) => (r.email || '').toLowerCase() === caller.email)
}

type AuditRow = {
  scan_batch_id: string
  ada_score: number | null
  ada_violations_critical: number | null
  ada_violations_serious: number | null
  ada_violations_moderate: number | null
  ada_violations_minor: number | null
  ada_violations: unknown[] | null
  wave_violations: unknown[] | null
  page_url: string
  audited_at: string
}

export async function GET(req: NextRequest) {
  const caller = await identify(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const loc = (req.nextUrl.searchParams.get('loc') || '').trim()
  if (!loc) return NextResponse.json({ error: 'loc is required' }, { status: 400 })

  const { assign, school } = await loadSchool(loc)
  if (!assign && !school) return NextResponse.json({ error: 'School not found.' }, { status: 404 })
  const roster = await loadRoster(loc)
  const viewerWcm = isSchoolWcm(caller, school, roster)
  if (!caller.team && !viewerWcm) return NextResponse.json({ error: 'This school profile is for its WCMs and the District Web Team.' }, { status: 403 })

  const locs = variants(loc)
  const [leadRes, contactsRes, auditRes, bannerRes, ppRes, activityRes] = await Promise.all([
    assign?.lead_email
      ? svc.from('bcps_support_leads').select('email, full_name, title').eq('email', assign.lead_email.trim().toLowerCase()).maybeSingle()
      : Promise.resolve({ data: null }),
    svc.from('bcps_school_contacts').select('principal_name, principal_email, board_member_name, board_district, updated_at').in('loc_no', locs).limit(1).maybeSingle(),
    school
      ? svc.from('bcps_audit_results')
          .select('scan_batch_id, ada_score, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, ada_violations, wave_violations, page_url, audited_at')
          .eq('school_id', school.id).eq('auditor', 'wcm-ada-scanner').not('scan_batch_id', 'is', null)
          .order('audited_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [] }),
    svc.from('bcps_banner_submissions')
      .select('id, type, status, banner_title, file_name, wcm_email, rejection_reason, submitted_at, reviewed_at, posted_at, is_test')
      .in('school_location_nbr', locs).is('archived_at', null).order('submitted_at', { ascending: false }).limit(50),
    svc.from('bcps_proud_point_submissions')
      .select('id, kind, status, wcm_email, submitter_name, rejection_reason, submitted_at, created_at, reviewed_at, posted_at, is_test')
      .in('school_location_nbr', locs).is('archived_at', null).order('created_at', { ascending: false }).limit(50),
    caller.team
      ? svc.from('bcps_school_activity').select('id, kind, actor_email, subject, body, sent_to, email_sent, email_error, created_at').in('loc_no', locs).order('created_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ])

  // One history row per scan batch, newest first; rows are already newest-first.
  const rows = (auditRes.data ?? []) as AuditRow[]
  const batches = new Map<string, AuditRow[]>()
  for (const r of rows) {
    const list = batches.get(r.scan_batch_id)
    if (list) list.push(r)
    else batches.set(r.scan_batch_id, [r])
  }
  const summarize = (id: string, pages: AuditRow[]) => {
    const scored = pages.filter((p) => p.ada_score != null)
    return {
      scan_batch_id: id,
      page_count: pages.length,
      avg_ada_score: scored.length ? Math.round(scored.reduce((n, p) => n + (p.ada_score as number), 0) / scored.length) : null,
      critical_count: pages.reduce((n, p) => n + (p.ada_violations_critical ?? 0), 0),
      serious_count: pages.reduce((n, p) => n + (p.ada_violations_serious ?? 0), 0),
      moderate_count: pages.reduce((n, p) => n + (p.ada_violations_moderate ?? 0), 0),
      minor_count: pages.reduce((n, p) => n + (p.ada_violations_minor ?? 0), 0),
      last_audited_at: pages.reduce((d, p) => (p.audited_at > d ? p.audited_at : d), pages[0].audited_at),
    }
  }
  const scanHistory: (ReturnType<typeof summarize> & { to_fix?: number })[] = Array.from(batches.entries()).map(([id, pages]) => summarize(id, pages))

  // The site audit (the screenshot view on Web Review, audit v3), when the
  // school has one, is what the tiles and Audit History show (Sean,
  // 2026-10-23): one row per run, and the current score worked out the way
  // Web Review works it out, from each active page's latest result.
  const [siteRes, sitePagesRes] = school ? await Promise.all([
    svc.from('bcps_audit_results')
      .select('id, run_id, site_page_id, overall_score, checks_failed, ada_violations_critical, ada_violations_serious, ada_violations_moderate, ada_violations_minor, audited_at')
      .eq('school_id', school.id).gte('audit_version', 3).order('audited_at', { ascending: false }).limit(2000),
    svc.from('bcps_site_pages').select('id').eq('school_id', school.id).eq('active', true),
  ]) : [{ data: [] }, { data: [] }]
  type SiteRow = { id: string; run_id: string | null; site_page_id: string | null; overall_score: number | null; checks_failed: number | null; ada_violations_critical: number | null; ada_violations_serious: number | null; ada_violations_moderate: number | null; ada_violations_minor: number | null; audited_at: string }
  const siteRows = (siteRes.data ?? []) as SiteRow[]
  const sumRows = (id: string, list: SiteRow[]) => {
    const scored = list.filter((r) => r.overall_score != null)
    return {
      scan_batch_id: id,
      page_count: list.length,
      avg_ada_score: scored.length ? Math.round(scored.reduce((n, r) => n + (r.overall_score as number), 0) / scored.length) : null,
      critical_count: list.reduce((n, r) => n + (r.ada_violations_critical ?? 0), 0),
      serious_count: list.reduce((n, r) => n + (r.ada_violations_serious ?? 0), 0),
      moderate_count: list.reduce((n, r) => n + (r.ada_violations_moderate ?? 0), 0),
      minor_count: list.reduce((n, r) => n + (r.ada_violations_minor ?? 0), 0),
      to_fix: list.reduce((n, r) => n + (r.checks_failed ?? 0), 0),
      last_audited_at: list.reduce((d, r) => (r.audited_at > d ? r.audited_at : d), list[0].audited_at),
    }
  }
  let history = scanHistory
  if (siteRows.length) {
    const active = new Set((sitePagesRes.data ?? []).map((p) => p.id as string))
    const latestPerPage = new Map<string, SiteRow>()
    for (const r of siteRows) if (r.site_page_id && active.has(r.site_page_id) && !latestPerPage.has(r.site_page_id)) latestPerPage.set(r.site_page_id, r)
    const runs = new Map<string, SiteRow[]>()
    for (const r of siteRows) { const k = r.run_id || r.id; runs.set(k, [...(runs.get(k) ?? []), r]) }
    const runRows = Array.from(runs.entries()).map(([id, list]) => sumRows(id, list))
    if (latestPerPage.size) runRows[0] = { ...sumRows(runRows[0].scan_batch_id, Array.from(latestPerPage.values())), last_audited_at: runRows[0].last_audited_at }
    history = runRows
  }
  const wanted = req.nextUrl.searchParams.get('batch')
  const chosenId = wanted && batches.has(wanted) ? wanted : scanHistory[0]?.scan_batch_id
  // The chosen batch in the shape ADA Manager's SchoolAuditPages reads.
  const audit = chosenId && school ? {
    school_id: school.id,
    ...summarize(chosenId, batches.get(chosenId)!),
    latest: chosenId === scanHistory[0]?.scan_batch_id,
    pages: batches.get(chosenId)!.map((p) => ({
      page_url: p.page_url,
      ada_score: p.ada_score,
      ada_violations: p.ada_violations ?? [],
      wave_violations: p.wave_violations ?? [],
      ada_violations_critical: p.ada_violations_critical ?? 0,
      ada_violations_serious: p.ada_violations_serious ?? 0,
      ada_violations_moderate: p.ada_violations_moderate ?? 0,
      ada_violations_minor: p.ada_violations_minor ?? 0,
    })),
  } : null

  return NextResponse.json({
    ok: true,
    viewer: { team: caller.team, wcm: viewerWcm },
    // P-numbers stay on the server.
    roster: roster.map(({ p_number: _p, ...r }) => r),
    school: {
      loc_no: assign?.loc_no ?? school?.school_location_nbr ?? loc,
      name: assign?.display_name ?? school?.name ?? '',
      school_level: assign?.school_level ?? null,
      region: assign?.region ?? null,
      no_wcm: !!assign?.no_wcm,
      provisioned: !!school,
      school_id: school?.id ?? null,
      audit_pilot: !!school?.audit_pilot,
      site_url: school?.site_url ?? null,
      wcm_name: school?.wcm_name ?? null,
      wcm_email: school?.wcm_email ?? null,
    },
    lead: leadRes.data ?? (assign?.lead_email ? { email: assign.lead_email, full_name: null, title: null } : null),
    contacts: contactsRes.data ?? null,
    history,
    audit,
    banners: bannerRes.data ?? [],
    proud_points: ppRes.data ?? [],
    activity: activityRes.data ?? [],
  })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || null

export async function POST(req: NextRequest) {
  const caller = await identify(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!caller.team) return NextResponse.json({ error: 'Only the District Web Team can do that.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const loc = typeof body.loc === 'string' ? body.loc.trim() : ''
  if (!loc) return NextResponse.json({ error: 'loc is required' }, { status: 400 })
  const { assign, school } = await loadSchool(loc)
  if (!assign && !school) return NextResponse.json({ error: 'School not found.' }, { status: 404 })
  const key = assign?.loc_no ?? school?.school_location_nbr ?? loc

  if (body.action === 'contacts') {
    const row = {
      loc_no: key,
      principal_name: clean(body.principal_name),
      principal_email: clean(body.principal_email)?.toLowerCase() ?? null,
      board_member_name: clean(body.board_member_name),
      board_district: clean(body.board_district, 40),
      updated_by_email: caller.email,
      updated_at: new Date().toISOString(),
    }
    const { error } = await svc.from('bcps_school_contacts').upsert(row, { onConflict: 'loc_no' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await svc.from('bcps_school_activity').insert({ loc_no: key, kind: 'contacts', actor_email: caller.email, subject: 'Leadership updated' })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'note') {
    const subject = clean(body.subject, 160)
    const text = clean(body.body, 5000)
    if (!subject || !text) return NextResponse.json({ error: 'Add a subject and a message.' }, { status: 400 })
    const roster = await loadRoster(loc)
    const recipients = Array.from(new Set([school?.wcm_email, ...roster.map((r) => r.email)].map((e) => (e || '').trim().toLowerCase()).filter(Boolean)))
    if (!recipients.length) return NextResponse.json({ error: 'This school has no WCM on file to send to.' }, { status: 400 })
    const to = recipients.join(', ')
    const name = assign?.display_name ?? school?.name ?? 'your school'
    const origin = req.nextUrl.origin
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#262626;line-height:1.5">
<p>${esc(text).replace(/\n/g, '<br>')}</p>
<p style="color:#767676;font-size:12px;margin-top:24px">Sent by ${esc(caller.email)} of the District Web Team about ${esc(name)}. Reply to this email to answer them.<br>
<a href="${origin}/?page=dashboard" style="color:#1672A7">Open your school in BCPS MarComm</a></p></div>`
    const sent = await sendEmail({ to: recipients, subject, html, replyTo: caller.email, kind: 'school-profile-note', context: { loc_no: key } })
    const { error } = await svc.from('bcps_school_activity').insert({
      loc_no: key, kind: 'note', actor_email: caller.email, subject, body: text, sent_to: to,
      email_sent: sent.ok, email_error: sent.ok ? null : sent.error ?? 'Send failed',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!sent.ok) return NextResponse.json({ error: `Saved to the activity record, but the email did not send: ${sent.error || 'unknown error'}` }, { status: 502 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
