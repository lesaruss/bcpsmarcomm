import type { SupabaseClient } from '@supabase/supabase-js'
import { buildDigests, digestHtml, digestSubject, type DigestPlaybook, type AgendaRow } from '@/lib/playbook-digest'
import { certReminderEmail, certReminderSubject, settingsFooter, type Frequency } from '@/lib/email-stream-copy'

// Recurring emails (Campaigns Phase 2, V 2026-10-28): "On Mondays it sends
// the digest email out, approved by end of day Friday... additional messages
// to people who are still not finished with their certification... a
// bi-weekly director's email... set up so I don't have to think about it, and
// it goes to the right people."
//
// Each recurring email (a stream) has an audience that is worked out from
// live data on the morning it sends, a default frequency, and copy in
// lib/email-stream-copy. A person approves each stream for a week (the Monday
// that starts it) by Friday 5 PM; nothing sends for a week without that.
// Each person picks how often they get each stream (bcps_email_prefs).

export interface StreamRecipient { email: string; name: string; subject: string; html: (frequency: Frequency) => string }
export interface Stream {
  key: string
  name: string
  description: string
  defaultFrequency: Frequency
  ready: boolean                    // false: listed as coming next, never sent
  audience?: (svc: SupabaseClient, today: string) => Promise<StreamRecipient[]>
}

const DAY = 86_400_000
const toIso = (d: Date) => d.toISOString().slice(0, 10)
const at = (iso: string) => new Date(iso + 'T12:00:00Z')

// The Monday of the week a date falls in.
export function weekStart(iso: string): string {
  const d = at(iso)
  const back = (d.getUTCDay() + 6) % 7
  return toIso(new Date(d.getTime() - back * DAY))
}
// The Monday after a date (on a Monday, the one a week later).
export const nextWeekStart = (iso: string) => toIso(new Date(at(weekStart(iso)).getTime() + 7 * DAY))

function isoWeek(iso: string): number {
  const d = at(iso)
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY)
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - jan1) / DAY + 1) / 7)
}

// Whether a person on this frequency gets the email on this date. Weekdays only.
export function dueOn(frequency: Frequency, iso: string): boolean {
  const day = at(iso).getUTCDay()
  if (day === 0 || day === 6 || frequency === 'off') return false
  if (frequency === 'daily') return true
  if (day !== 1) return false
  if (frequency === 'weekly') return true
  if (frequency === 'biweekly') return isoWeek(iso) % 2 === 0
  return at(iso).getUTCDate() <= 7
}

async function digestAudience(svc: SupabaseClient, today: string): Promise<StreamRecipient[]> {
  const { data: rows } = await svc.from('briefings').select('slug, title, content, metadata, status').eq('brand_slug', 'bcps').eq('type', 'playbook')
  const live = (rows ?? []).filter((r) => r.status !== 'archived' && r.status !== 'withdrawn')
  const { data: recs } = await svc.from('bcps_brief_recipients').select('brief_slug, attendee_name, attendee_email').in('brief_slug', live.map((r) => r.slug))
  const playbooks: DigestPlaybook[] = live.map((r) => ({
    slug: r.slug as string, title: (r.title as string) || (r.slug as string), html: String(r.content || ''), metadata: r.metadata,
    recipients: (recs ?? []).filter((x) => x.brief_slug === r.slug && x.attendee_email).map((x) => ({ name: String(x.attendee_name || ''), email: String(x.attendee_email) })),
  }))
  const { data: waiting } = await svc.from('bcps_playbook_inputs').select('playbook_slug, created_at').eq('status', 'new')
  const since = toIso(new Date(at(today).getTime() - 15 * DAY))
  const { data: agendas } = await svc.from('bcps_playbook_agendas').select('playbook_slug, meeting_date, items, outcomes').gte('meeting_date', since)
  return buildDigests(playbooks, (waiting ?? []) as { playbook_slug: string; created_at: string }[], today, (agendas ?? []) as AgendaRow[])
    .map((d) => ({ email: d.email, name: d.name, subject: digestSubject(d), html: (f: Frequency) => digestHtml(d, today, settingsFooter(STREAM_NAMES['project-digest'], f)) }))
}

// Department WCMs on the roster directors confirmed who are not certified yet.
async function certAudience(svc: SupabaseClient): Promise<StreamRecipient[]> {
  const { data: roster } = await svc.from('bcps_wcm_roster_members').select('wcm_name, wcm_email')
  const people = new Map<string, string>()
  for (const r of roster ?? []) {
    const email = String(r.wcm_email || '').trim().toLowerCase()
    if (email && !people.has(email)) people.set(email, String(r.wcm_name || ''))
  }
  const { data: status } = await svc.from('wcm_cert_status_public').select('email, status, pct').in('email', Array.from(people.keys()))
  return Array.from(people.entries()).flatMap(([email, name]) => {
    const s = (status ?? []).find((x) => x.email === email)
    if (s?.status === 'certified') return []
    const r = { name, status: (s?.status === 'in-progress' ? 'in-progress' : 'not-started') as 'in-progress' | 'not-started', pct: Number(s?.pct) || 0 }
    return [{ email, name, subject: certReminderSubject(r), html: (f: Frequency) => certReminderEmail(r, settingsFooter(STREAM_NAMES['certification-reminder'], f)) }]
  })
}

export const STREAMS: Stream[] = [
  { key: 'project-digest', name: 'Your projects this week', defaultFrequency: 'weekly', ready: true,
    description: 'To-dos and deliverables due or overdue, team input and meetings waiting on you, across the Playbooks you are on. Only people with something due or waiting get it.',
    audience: (svc, today) => digestAudience(svc, today) },
  { key: 'certification-reminder', name: 'Your WCM certification', defaultFrequency: 'weekly', ready: true,
    description: 'Department Web Content Managers on the confirmed roster who are not certified yet: where they are in the course and a link back in.',
    audience: (svc) => certAudience(svc) },
  { key: 'director-update', name: 'Director update', defaultFrequency: 'biweekly', ready: false,
    description: 'Every two weeks to directors: their department at a glance. Content to be decided with Sean before it is built.' },
  { key: 'wcm-weekly', name: 'WCM weekly', defaultFrequency: 'weekly', ready: false,
    description: 'Every week to Web Content Managers: Hot Lab times, what changed, what to fix. Content to be decided with Sean before it is built.' },
]
export const STREAM_NAMES: Record<string, string> = Object.fromEntries(STREAMS.map((s) => [s.key, s.name]))
export const streamByKey = (key: string) => STREAMS.find((s) => s.key === key)

// Each person's frequency for a stream: their choice, else the default.
export async function frequencies(svc: SupabaseClient, stream: Stream, emails: string[]): Promise<Map<string, Frequency>> {
  const out = new Map<string, Frequency>(emails.map((e) => [e, stream.defaultFrequency]))
  if (!emails.length) return out
  const { data } = await svc.from('bcps_email_prefs').select('email, frequency').eq('stream', stream.key).in('email', emails)
  for (const r of data ?? []) out.set(String(r.email), r.frequency as Frequency)
  return out
}
