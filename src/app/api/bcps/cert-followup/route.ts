import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'
import { sendEmail } from '@/lib/resend'
import { SITE } from '@/lib/bcps-portal-account'
import {
  followupEmail, followupGroup, followupSubject, FOLLOWUP_FROM_NAME, FOLLOWUP_REPLY_TO,
  type FollowupGroup,
} from '@/lib/bcps-cert-followup-email'

// Certification follow-up (Sean, 2026-10-29): every Department WCM on the
// roster who has not finished the certification, live, with their progress,
// the last time they worked on it, and what happened to the follow-up email
// (sent, opened, clicked, progress since). The District Web Team (acl group
// dwt) is left out: they run the program and do not take the course. A person
// is left out if ANY of their accounts is in the District Web Team or has
// certified (Sean, 2026-11-02: Felicia Hicks has two accounts).
// Each send belongs to a campaign ID (default cert-followup-2026-10), so
// several sends can be tracked separately.
//   GET  ?campaign=<id>                   the list for that campaign, plus every campaign's totals
//   POST { action: 'preview', email, campaign }   the exact email that person gets
//   POST { action: 'test', to, group }    one sample of a version to a District or LESARUSS address
//   POST { action: 'send', emails, campaign }     sends to the people named (only people on the list,
//                                         and not anyone already emailed in that campaign)
// SuperAdmin only.

export const dynamic = 'force-dynamic'

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const CAMPAIGN = 'cert-followup-2026-10'
const KIND = 'cert-followup'
const CAMPAIGN_RE = /^[a-z0-9][a-z0-9-]{2,59}$/
const norm = (e: string | null | undefined) => (e || '').trim().toLowerCase()

// A campaign ID is lowercase letters, numbers and dashes. Missing means the default.
function campaignFrom(value: unknown): string | null {
  if (value == null || value === '') return CAMPAIGN
  const v = String(value).trim().toLowerCase()
  return CAMPAIGN_RE.test(v) ? v : null
}

interface Person {
  email: string
  name: string
  department: string | null
  pct: number
  has_account: boolean
  last_active: string | null
  group: FollowupGroup
  email_status: {
    sent_at: string; opened_at: string | null; open_count: number; clicked_at: string | null; click_count: number; pct_at_send: number | null
  } | null
  failed: string | null
}

interface CampaignSummary {
  campaign: string
  sent: number
  people: number
  opened: number
  clicked: number
  first_sent: string
  last_sent: string
}

// Totals for every campaign that has sent anything, newest first.
async function campaignSummaries(): Promise<CampaignSummary[]> {
  const { data } = await svc.from('bcps_email_tracking').select('campaign, email, sent_at, opened_at, clicked_at').limit(50000)
  const by = new Map<string, CampaignSummary & { emails: Set<string> }>()
  for (const t of data ?? []) {
    const c = t.campaign as string
    const cur = by.get(c) ?? { campaign: c, sent: 0, people: 0, opened: 0, clicked: 0, first_sent: t.sent_at as string, last_sent: t.sent_at as string, emails: new Set<string>() }
    cur.sent += 1
    if (t.opened_at) cur.opened += 1
    if (t.clicked_at) cur.clicked += 1
    cur.emails.add(norm(t.email as string))
    if ((t.sent_at as string) < cur.first_sent) cur.first_sent = t.sent_at as string
    if ((t.sent_at as string) > cur.last_sent) cur.last_sent = t.sent_at as string
    by.set(c, cur)
  }
  return Array.from(by.values())
    .map(({ emails, ...rest }) => ({ ...rest, people: emails.size }))
    .sort((a, b) => b.last_sent.localeCompare(a.last_sent))
}

async function listPeople(campaign: string): Promise<Person[]> {
  const [{ data: rosters }, { data: members }, { data: dwt }, { data: depts }] = await Promise.all([
    svc.from('bcps_wcm_roster').select('id, department_name, matched_department_id, no_website'),
    svc.from('bcps_wcm_roster_members').select('roster_id, wcm_name, wcm_email'),
    svc.from('acl_groups').select('id').eq('brand', 'bcps').eq('slug', 'dwt').maybeSingle(),
    svc.from('bcps_departments').select('id, name'),
  ])
  const deptName = new Map((depts ?? []).map((d) => [d.id as string, d.name as string]))
  const { data: dwtMembers } = dwt ? await svc.from('acl_group_members').select('user_id').eq('group_id', dwt.id) : { data: [] }
  const dwtUsers = new Set((dwtMembers ?? []).map((m) => m.user_id as string))
  const rosterById = new Map((rosters ?? []).map((r) => [r.id as string, r]))

  const byEmail = new Map<string, { name: string; department: string | null }>()
  for (const m of members ?? []) {
    const e = norm(m.wcm_email as string)
    const roster = rosterById.get(m.roster_id as string)
    if (!e || !roster || roster.no_website) continue
    // The department's own name ("HR Operations"); the roster's is in capitals.
    const department = deptName.get(roster.matched_department_id as string) ?? titleCase(roster.department_name as string)
    if (!byEmail.has(e)) byEmail.set(e, { name: (m.wcm_name as string) || e, department })
  }
  const emails = Array.from(byEmail.keys())
  if (!emails.length) return []

  // Accounts, certificates, progress and activity, matched by email in code
  // because wcm_cert_users.email is not always stored lowercase.
  const [{ data: accounts }, { data: status }, { data: certs }] = await Promise.all([
    svc.from('wcm_cert_users').select('user_id, email').limit(5000),
    svc.from('wcm_cert_status_public').select('email, status, pct').limit(5000),
    svc.from('wcm_certifications').select('user_id').limit(5000),
  ])
  // Every account per email, not just the first one.
  const uidsOf = new Map<string, string[]>()
  for (const a of accounts ?? []) {
    const e = norm(a.email as string)
    if (!a.user_id || !byEmail.has(e)) continue
    uidsOf.set(e, [...(uidsOf.get(e) ?? []), a.user_id as string])
  }
  const certified = new Set((certs ?? []).map((c) => c.user_id as string))
  const pctOf = new Map<string, number>()
  for (const s of status ?? []) {
    const e = norm(s.email as string)
    if (byEmail.has(e)) pctOf.set(e, Math.max(pctOf.get(e) ?? 0, Number(s.pct) || 0))
  }
  const uids = Array.from(new Set(Array.from(uidsOf.values()).flat()))
  const [{ data: activity }, { data: tracks }, { data: outbound }] = await Promise.all([
    uids.length ? svc.from('bcps_cert_last_activity').select('user_id, last_active').in('user_id', uids) : Promise.resolve({ data: [] }),
    svc.from('bcps_email_tracking').select('email, sent_at, opened_at, open_count, clicked_at, click_count, pct_at_send').eq('campaign', campaign).order('sent_at', { ascending: false }),
    svc.from('bcps_outbound_emails').select('to_addresses, status, last_error, created_at').eq('kind', KIND).order('created_at', { ascending: false }).limit(500),
  ])
  const activeOf = new Map((activity ?? []).map((a) => [a.user_id as string, a.last_active as string | null]))

  const people: Person[] = []
  for (const [email, info] of Array.from(byEmail)) {
    const ids = uidsOf.get(email) ?? []
    if (ids.some((id) => certified.has(id) || dwtUsers.has(id))) continue
    const uid = ids[0]
    const pct = pctOf.get(email) ?? 0
    if (pct >= 100) continue
    const track = (tracks ?? []).find((t) => norm(t.email as string) === email)
    const lastOut = (outbound ?? []).find((o) => ((o.to_addresses ?? []) as string[]).some((t) => norm(t) === email))
    people.push({
      email, name: info.name, department: info.department, pct, has_account: !!uid,
      last_active: uid ? (ids.map((id) => activeOf.get(id) ?? null).filter(Boolean).sort().pop() ?? null) : null,
      group: followupGroup(pct, !!uid),
      email_status: track ? {
        sent_at: track.sent_at as string, opened_at: track.opened_at as string | null, open_count: track.open_count as number,
        clicked_at: track.clicked_at as string | null, click_count: track.click_count as number, pct_at_send: track.pct_at_send as number | null,
      } : null,
      failed: lastOut && lastOut.status !== 'sent' ? ((lastOut.last_error as string) || 'Not sent') : null,
    })
  }
  return people.sort((a, b) => b.pct - a.pct || a.name.localeCompare(b.name))
}

// Roster department names are stored in capitals ("SCHOOL COUNSELING").
function titleCase(s: string | null): string | null {
  if (!s) return null
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(And|Of|The|For|&)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase())
}

function render(p: Person, token: string | null) {
  const tracked = (url: string) => token ? `${SITE}/api/t/c/${token}?to=${encodeURIComponent(url.replace(SITE, '') || '/')}` : url
  const pixel = token ? `<img src="${SITE}/api/t/o/${token}" width="1" height="1" alt="" style="border:0;width:1px;height:1px">` : ''
  return { subject: followupSubject(p), html: followupEmail(p, tracked, pixel) }
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const campaign = campaignFrom(req.nextUrl.searchParams.get('campaign'))
  if (!campaign) return NextResponse.json({ error: 'Campaign IDs use lowercase letters, numbers and dashes (3 to 60 characters).' }, { status: 400 })
  return NextResponse.json({
    ok: true, campaign,
    campaigns: await campaignSummaries(),
    sender: { from: `${FOLLOWUP_FROM_NAME} <notifications@bcpsmarcomm.com>`, reply_to: FOLLOWUP_REPLY_TO },
    people: await listPeople(campaign), as_of: new Date().toISOString(),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => ({}))
  const campaign = campaignFrom(body.campaign)
  if (!campaign) return NextResponse.json({ error: 'Campaign IDs use lowercase letters, numbers and dashes (3 to 60 characters).' }, { status: 422 })
  const people = await listPeople(campaign)

  if (body.action === 'preview') {
    const p = people.find((x) => x.email === norm(body.email))
    if (!p) return NextResponse.json({ error: 'That person is not on the list.' }, { status: 404 })
    return NextResponse.json({ ok: true, to: p.email, ...render(p, null) })
  }

  if (body.action === 'test') {
    const to = norm(body.to)
    if (!to.endsWith('@browardschools.com') && !to.endsWith('@lesaruss.com')) return NextResponse.json({ error: 'Send the test to a District or LESARUSS address.' }, { status: 422 })
    const sample = people.find((p) => p.group === body.group) ?? people[0]
    if (!sample) return NextResponse.json({ error: 'Nobody is left to certify.' }, { status: 404 })
    const { subject, html } = render(sample, null)
    const r = await sendEmail({ to, subject: `[Test] ${subject}`, html, replyTo: FOLLOWUP_REPLY_TO, fromName: FOLLOWUP_FROM_NAME, kind: `${KIND}-test`, context: { as: sample.email, group: sample.group } })
    return r.ok ? NextResponse.json({ ok: true, as: sample.name }) : NextResponse.json({ error: r.error || 'Could not send.' }, { status: 502 })
  }

  if (body.action === 'send') {
    const wanted = new Set(((body.emails ?? []) as string[]).map(norm))
    const chosen = people.filter((p) => wanted.has(p.email))
    if (!chosen.length) return NextResponse.json({ error: 'Nobody on the list was selected.' }, { status: 400 })
    // Never email the same person twice in one campaign.
    const { data: prior } = await svc.from('bcps_email_tracking').select('email').eq('campaign', campaign)
    const priorSet = new Set((prior ?? []).map((t) => norm(t.email as string)))
    const skipped = chosen.filter((p) => priorSet.has(p.email)).map((p) => p.email)
    const targets = chosen.filter((p) => !priorSet.has(p.email))
    const results: { email: string; ok: boolean; error?: string }[] = []
    for (const p of targets) {
      const token = randomBytes(18).toString('hex')
      const { subject, html } = render(p, token)
      const sent = await sendEmail({ to: p.email, subject, html, replyTo: FOLLOWUP_REPLY_TO, fromName: FOLLOWUP_FROM_NAME, kind: KIND, context: { campaign, group: p.group, pct: p.pct } })
      if (sent.ok) {
        await svc.from('bcps_email_tracking').insert({ token, outbound_id: sent.logged_id ?? null, campaign, email: p.email, group_key: p.group, pct_at_send: p.pct })
      }
      results.push({ email: p.email, ok: sent.ok, error: sent.ok ? undefined : sent.error })
    }
    return NextResponse.json({ ok: true, campaign, sent: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok), skipped, results })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
