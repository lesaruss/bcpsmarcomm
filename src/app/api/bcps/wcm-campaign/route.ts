import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'
import { enrollBcpsMember, resolveOrInviteAccount, SITE } from '@/lib/bcps-portal-account'
import { wcmAccessEmail } from '@/lib/bcps-wcm-access-email'
import { sendEmail, EMAIL_FROM } from '@/lib/resend'

// Web Content Manager access email (V, 2026-10-28): Campaign 2 on the Super
// Admin Campaigns tab, the WCM counterpart of /api/bcps/director-invite and
// shaped the same way, so the page drives both with one component.
//
// Who is on the list: every WCM on the roster directors confirmed
// (bcps_wcm_roster_members), one row per person with all their departments.
//
// What a send does, per person:
//   - no account: creates it (set-password link plus a temporary password in
//     the email), enrolls it with its department, and adds the WCM group.
//   - an account already: adds the WCM group only. Its profile and role are
//     never touched, so an admin stays one.
// Send history is bcps_outbound_emails (kind 'wcm-access'); no table of its own.
//
// SuperAdmin only, like the director invitation.

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BRAND = 'bcps'
const WCM_GROUP_SLUG = 'wcm'
const ALLOWED_DOMAIN = 'browardschools.com'
const SIGN_IN_URL = `${SITE}/login`
const SUBJECT = 'Your BCPS MarComm access'
const REPLY_TO = 'sean.russell@browardschools.com'
const KIND = 'wcm-access'
// Stands in for the temporary password in a preview: the real one is made at
// send time, for people who have not signed in yet.
const PREVIEW_PASSWORD = '(created when sent)'

interface Recipient {
  email: string
  name: string
  departments: string[]
  department_slugs: (string | null)[]
  role: 'wcm'
  has_account: boolean
  signed_in: boolean
  invited_at: string | null
  last_email: { status: string; at: string; error: string | null } | null
}

const norm = (e: string | null | undefined) => (e || '').trim().toLowerCase()

async function listRecipients(): Promise<Recipient[]> {
  const [{ data: rosters }, { data: members }, { data: depts }] = await Promise.all([
    svc.from('bcps_wcm_roster').select('id, department_name, matched_department_id'),
    svc.from('bcps_wcm_roster_members').select('roster_id, wcm_name, wcm_email'),
    svc.from('bcps_departments').select('id, slug'),
  ])
  const rosterById = new Map((rosters ?? []).map((r) => [r.id as string, r]))
  const slugById = new Map((depts ?? []).map((d) => [d.id as string, d.slug as string]))
  const byEmail = new Map<string, Recipient>()
  for (const m of members ?? []) {
    const e = norm(m.wcm_email as string)
    if (!e || !e.endsWith('@' + ALLOWED_DOMAIN)) continue
    const roster = rosterById.get(m.roster_id as string)
    const dept = (roster?.department_name as string) || null
    const cur = byEmail.get(e) ?? { email: e, name: (m.wcm_name as string) || e, departments: [], department_slugs: [], role: 'wcm' as const, has_account: false, signed_in: false, invited_at: null, last_email: null }
    if (dept && !cur.departments.includes(dept)) {
      cur.departments.push(dept)
      cur.department_slugs.push(roster?.matched_department_id ? slugById.get(roster.matched_department_id as string) ?? null : null)
    }
    byEmail.set(e, cur)
  }

  const list = Array.from(byEmail.values())
  const emails = list.map((r) => r.email)
  const [{ data: certs }, { data: sends }] = await Promise.all([
    svc.from('wcm_cert_users').select('email, user_id').in('email', emails),
    svc.from('bcps_outbound_emails').select('to_addresses, status, last_error, created_at, sent_at')
      .eq('kind', KIND).order('created_at', { ascending: false }).limit(1000),
  ])
  const userIds = new Map<string, string>()
  for (const c of certs ?? []) if (c.user_id) userIds.set(norm(c.email), c.user_id as string)
  const signedIn = new Set<string>()
  for (const [e, id] of Array.from(userIds)) {
    const { data } = await svc.auth.admin.getUserById(id)
    if (data?.user?.last_sign_in_at) signedIn.add(e)
  }
  for (const r of list) {
    r.has_account = userIds.has(r.email)
    r.signed_in = signedIn.has(r.email)
    const last = (sends ?? []).find((m) => ((m.to_addresses ?? []) as string[]).some((t) => norm(t) === r.email))
    r.last_email = last ? { status: last.status as string, at: (last.sent_at || last.created_at) as string, error: (last.last_error as string) || null } : null
    r.invited_at = last?.status === 'sent' ? ((last.sent_at || last.created_at) as string) : null
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ ok: true, sender: { from: EMAIL_FROM, reply_to: REPLY_TO, subject: SUBJECT }, recipients: await listRecipients() })
}

// POST { action: 'preview', email } returns the email exactly as that person
//   would get it. Nothing is sent and no account is touched.
// POST { action: 'test', to } sends it, as a WCM without an account would get
//   it, to one District or LESARUSS address. No accounts.
// POST { action: 'send', emails } sends to the people named (only addresses on
//   the list are accepted).
export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const list = await listRecipients()

  if (body.action === 'preview') {
    const r = list.find((x) => x.email === norm(body.email))
    if (!r) return NextResponse.json({ error: 'That person is not on the list.' }, { status: 404 })
    const isNew = !r.has_account
    return NextResponse.json({
      ok: true, to: r.email, subject: SUBJECT, is_new_account: isNew, gets_temp_password: !r.signed_in,
      html: wcmAccessEmail(r, isNew ? `${SITE}/set-password#their-own-link` : SIGN_IN_URL, isNew, r.signed_in ? null : PREVIEW_PASSWORD),
    })
  }

  if (body.action === 'test') {
    const to = norm(body.to)
    if (!to.endsWith('@' + ALLOWED_DOMAIN) && !to.endsWith('@lesaruss.com')) return NextResponse.json({ error: 'Send the test to a District or LESARUSS address.' }, { status: 422 })
    const sample = list.find((r) => !r.has_account) ?? list[0]
    if (!sample) return NextResponse.json({ error: 'No Web Content Managers on the roster.' }, { status: 404 })
    const r = await sendEmail({ to, subject: `[Test] ${SUBJECT}`, html: wcmAccessEmail(sample, SIGN_IN_URL, true, 'Sample7Temp2'), kind: `${KIND}-test`, context: { as: sample.email } })
    return r.ok ? NextResponse.json({ ok: true, as: sample.email }) : NextResponse.json({ error: r.error || 'Could not send.' }, { status: 502 })
  }

  if (body.action === 'send') {
    const wanted = new Set(((body.emails ?? []) as string[]).map(norm))
    const targets = list.filter((r) => wanted.has(r.email))
    if (!targets.length) return NextResponse.json({ error: 'Nobody on the list was selected.' }, { status: 400 })
    const { data: group } = await svc.from('acl_groups').select('id').eq('brand', BRAND).eq('slug', WCM_GROUP_SLUG).maybeSingle()
    const results: { email: string; ok: boolean; new_account?: boolean; error?: string }[] = []

    for (const r of targets) {
      const acct = await resolveOrInviteAccount(r.email, r.name)
      if (!acct.ok) { results.push({ email: r.email, ok: false, error: acct.error }); continue }
      const { userId, isNewAccount, actionLink, tempPassword } = acct.account
      if (isNewAccount) {
        const enrolled = await enrollBcpsMember({ userId, email: r.email, fullName: r.name, departmentName: r.departments[0] ?? null, departmentSlug: r.department_slugs[0] ?? null, addToWcmGroup: true })
        if (!enrolled.ok) { results.push({ email: r.email, ok: false, error: enrolled.error }); continue }
      } else {
        // An existing sign-in without a BCPS MarComm profile row gets one.
        // Never overwrites a row that exists, and never touches their role.
        await svc.from('wcm_cert_users').upsert(
          { user_id: userId, email: r.email, full_name: r.name, department: r.departments[0] ?? null, department_needs_review: false, is_admin: false },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )
        if (group?.id) await svc.from('acl_group_members').upsert({ group_id: group.id, user_id: userId }, { onConflict: 'group_id,user_id' })
      }

      const link = isNewAccount && actionLink ? actionLink : SIGN_IN_URL
      const sent = await sendEmail({ to: r.email, subject: SUBJECT, html: wcmAccessEmail(r, link, isNewAccount, tempPassword), replyTo: REPLY_TO, kind: KIND, context: { new_account: isNewAccount, departments: r.departments } })
      results.push({ email: r.email, ok: sent.ok, new_account: isNewAccount, error: sent.ok ? undefined : sent.error })
    }
    return NextResponse.json({ ok: true, sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok), results })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
