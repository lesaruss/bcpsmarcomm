import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'
import { enrollBcpsMember, resolveOrInviteAccount, SITE } from '@/lib/bcps-portal-account'
import { inviteEmail } from '@/lib/bcps-director-invite-email'
import { sendEmail, EMAIL_FROM } from '@/lib/resend'

// Director invitations (Sean, 2026-10-28): one email that lets every
// department director, and the executives over them, into BCPS MarComm.
//
// Who is on the list: every director_email and executive_emails address on
// bcps_departments, plus the leaders in EXTRA_LEADERS who oversee the platform
// without leading a department. The SuperAdmin panel previews the list, sends
// a test to one address, and sends to the people it picks.
//
// What a send does, per person:
//   - no account: creates it (the set-password link in the email), enrolls it
//     the way an approved roster submission does, and adds the Directors group.
//   - an account already: adds the Directors group only, and the email points
//     at the sign-in page. Its role is never touched, so an admin stays one.
// The Directors group is what opens the Hot Lab notes to them. Everything else
// on the director dashboard follows from bcps_departments, by email.
//
// SuperAdmin only, like beta-invite.

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BRAND = 'bcps'
const DIRECTORS_GROUP_SLUG = 'directors'
const ALLOWED_DOMAIN = 'browardschools.com'
const SIGN_IN_URL = `${SITE}/login`

// Leaders who follow the platform without a department of their own. Their
// other groups (Department Oversight, Leadership View) are already queued.
const EXTRA_LEADERS: { email: string; name: string; note: string }[] = [
  { email: 'manuel.castaneda@browardschools.com', name: 'Manuel Castaneda', note: 'Enterprise Analytics and Intelligence (Leadership View)' },
]

interface Recipient {
  email: string
  name: string
  departments: string[]
  role: 'director' | 'executive' | 'leader' | 'function_lead'
  has_account: boolean
  signed_in: boolean
  invited_at: string | null
  // The latest invitation email to them, from bcps_outbound_emails (Campaigns
  // page, 2026-10-28): sent or failed, when, and the provider's error.
  last_email: { status: string; at: string; error: string | null } | null
}

const norm = (e: string | null | undefined) => (e || '').trim().toLowerCase()

function nameFromEmail(email: string) {
  return email.split('@')[0].split(/[._]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ')
}

async function listRecipients(): Promise<Recipient[]> {
  const { data: depts } = await svc.from('bcps_departments').select('name, director_name, director_email, executive_emails').order('name')
  const byEmail = new Map<string, Recipient>()
  const add = (email: string, name: string, dept: string | null, role: Recipient['role']) => {
    const e = norm(email)
    if (!e || !e.endsWith('@' + ALLOWED_DOMAIN)) return
    const cur = byEmail.get(e) ?? { email: e, name, departments: [], role, has_account: false, signed_in: false, invited_at: null, last_email: null }
    if (dept && !cur.departments.includes(dept)) cur.departments.push(dept)
    // Executive outranks director, and both outrank a function lead, for the
    // wording of the email.
    if (role === 'executive' || (role === 'director' && cur.role === 'function_lead')) cur.role = role
    if (!cur.name || cur.name === nameFromEmail(e)) cur.name = name || cur.name
    byEmail.set(e, cur)
  }
  for (const d of depts ?? []) {
    if (d.director_email) add(d.director_email, (d.director_name as string) || nameFromEmail(norm(d.director_email)), d.name as string, 'director')
    for (const x of (d.executive_emails ?? []) as string[]) add(x, nameFromEmail(norm(x)), d.name as string, 'executive')
  }
  for (const l of EXTRA_LEADERS) if (!byEmail.has(l.email)) add(l.email, l.name, null, 'leader')
  // Function leads count as directors (Sean, 2026-10-28): the top person for
  // a program or function inside a department, whatever their title, such as
  // Deanna Greist, Coordinator, Home School Education.
  const { data: leads } = await svc.from('bcps_page_wcm_assignments').select('page_title, wcm_name, wcm_email').eq('is_lead', true)
  for (const l of leads ?? []) if (l.wcm_email) add(l.wcm_email as string, (l.wcm_name as string) || nameFromEmail(norm(l.wcm_email)), l.page_title as string, 'function_lead')

  const list = Array.from(byEmail.values())
  const emails = list.map((r) => r.email)
  // Account state from wcm_cert_users (every portal account has a row) and
  // auth sign-in times; invite history from bcps_director_invites.
  const [{ data: certs }, { data: invites }, { data: sends }] = await Promise.all([
    svc.from('wcm_cert_users').select('email, user_id, full_name').in('email', emails),
    svc.from('bcps_director_invites').select('email, sent_at').in('email', emails),
    svc.from('bcps_outbound_emails').select('to_addresses, status, last_error, created_at, sent_at')
      .eq('kind', 'director-invite').order('created_at', { ascending: false }).limit(1000),
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
    r.invited_at = (invites ?? []).find((i) => norm(i.email) === r.email)?.sent_at ?? null
    const last = (sends ?? []).find((m) => ((m.to_addresses ?? []) as string[]).some((t) => norm(t) === r.email))
    r.last_email = last ? { status: last.status as string, at: (last.sent_at || last.created_at) as string, error: (last.last_error as string) || null } : null
    const full = (certs ?? []).find((c) => norm(c.email) === r.email)?.full_name as string | undefined
    if (full && (r.role === 'executive' || !r.name)) r.name = full
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

const SUBJECT = 'Your access to BCPS MarComm'

const REPLY_TO = 'sean.russell@browardschools.com'
// Stands in for the temporary password in a preview: the real one is made at
// send time, for people who have not signed in yet.
const PREVIEW_PASSWORD = '(created when sent)'

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ ok: true, sender: { from: EMAIL_FROM, reply_to: REPLY_TO, subject: SUBJECT }, recipients: await listRecipients() })
}

// POST { action: 'preview', email } returns the email exactly as that person
//   would get it (Campaigns page spot check, 2026-10-28). Nothing is sent and
//   no account is touched; the temporary password shows as a placeholder.
// POST { action: 'test', to } sends the email as the first person on the list
//   would get it, with a sign-in link, to one District address. No accounts.
// POST { action: 'send', emails } invites the people named (only addresses on
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
      html: inviteEmail(r, isNew ? `${SITE}/set-password#their-own-link` : SIGN_IN_URL, isNew, r.signed_in ? null : PREVIEW_PASSWORD),
    })
  }

  if (body.action === 'test') {
    const to = norm(body.to)
    if (!to.endsWith('@' + ALLOWED_DOMAIN) && !to.endsWith('@lesaruss.com')) return NextResponse.json({ error: 'Send the test to a District or LESARUSS address.' }, { status: 422 })
    const sample = list.find((r) => r.role === 'director' && !r.has_account) ?? list[0]
    if (!sample) return NextResponse.json({ error: 'No directors on file.' }, { status: 404 })
    const r = await sendEmail({ to, subject: `[Test] ${SUBJECT}`, html: inviteEmail(sample, SIGN_IN_URL, true, 'Sample7Temp2'), kind: 'director-invite-test', context: { as: sample.email } })
    return r.ok ? NextResponse.json({ ok: true, as: sample.email }) : NextResponse.json({ error: r.error || 'Could not send.' }, { status: 502 })
  }

  if (body.action === 'send') {
    const wanted = new Set(((body.emails ?? []) as string[]).map(norm))
    const targets = list.filter((r) => wanted.has(r.email))
    if (!targets.length) return NextResponse.json({ error: 'Nobody on the list was selected.' }, { status: 400 })

    const { data: group } = await svc.from('acl_groups').select('id').eq('brand', BRAND).eq('slug', DIRECTORS_GROUP_SLUG).maybeSingle()
    const { data: depts } = await svc.from('bcps_departments').select('name, slug')
    const results: { email: string; ok: boolean; new_account?: boolean; error?: string }[] = []

    for (const r of targets) {
      const acct = await resolveOrInviteAccount(r.email, r.name)
      if (!acct.ok) { results.push({ email: r.email, ok: false, error: acct.error }); continue }
      const { userId, isNewAccount, actionLink, tempPassword } = acct.account
      if (isNewAccount) {
        const dept = (depts ?? []).find((d) => d.name === r.departments[0])
        const enrolled = await enrollBcpsMember({ userId, email: r.email, fullName: r.name, departmentName: dept?.name ?? null, departmentSlug: dept?.slug ?? null, addToWcmGroup: false })
        if (!enrolled.ok) { results.push({ email: r.email, ok: false, error: enrolled.error }); continue }
      } else {
        // An existing sign-in without a BCPS MarComm profile row gets one, so
        // the Hot Lab check (which looks people up there) finds them. Never
        // overwrites a row that exists, and never touches their role.
        await svc.from('wcm_cert_users').upsert(
          { user_id: userId, email: r.email, full_name: r.name, department: r.departments[0] ?? null, department_needs_review: false, is_admin: false },
          { onConflict: 'user_id', ignoreDuplicates: true },
        )
      }
      if (group?.id) await svc.from('acl_group_members').upsert({ group_id: group.id, user_id: userId }, { onConflict: 'group_id,user_id' })

      const link = isNewAccount && actionLink ? actionLink : SIGN_IN_URL
      const sent = await sendEmail({ to: r.email, subject: SUBJECT, html: inviteEmail(r, link, isNewAccount, tempPassword), replyTo: REPLY_TO, kind: 'director-invite', context: { new_account: isNewAccount } })
      if (sent.ok) {
        await svc.from('bcps_director_invites').upsert({ email: r.email, name: r.name, sent_at: new Date().toISOString(), new_account: isNewAccount, sent_by: auth.user.email ?? null }, { onConflict: 'email' })
      }
      results.push({ email: r.email, ok: sent.ok, new_account: isNewAccount, error: sent.ok ? undefined : sent.error })
    }
    return NextResponse.json({ ok: true, sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok), results })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
