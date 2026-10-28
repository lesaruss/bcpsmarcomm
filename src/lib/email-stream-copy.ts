// Copy for the recurring emails (Campaigns Phase 2, V 2026-10-28). Pure
// template functions with no database, so scripts/render-emails.ts renders
// them into emails/approved/ and the copy Sean approves is the copy that sends.
import { brandedEmail, esc, firstName, SITE } from '@/lib/bcps-portal-account'

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'off'
export const FREQUENCY_LABEL: Record<Frequency, string> = {
  daily: 'Every weekday',
  weekly: 'Weekly, on Mondays',
  biweekly: 'Every two weeks, on Mondays',
  monthly: 'Monthly, on the first Monday',
  off: 'Off',
}

export const SETTINGS_URL = `${SITE}/email-settings`

// The line at the foot of every recurring email.
export function settingsFooter(streamName: string, frequency: Frequency): string {
  return `You get &ldquo;${esc(streamName)}&rdquo; ${frequency === 'daily' ? 'every weekday' : frequency === 'weekly' ? 'every Monday' : frequency === 'biweekly' ? 'every other Monday' : 'on the first Monday of the month'}. `
    + `<a href="${SETTINGS_URL}" style="color:#0e4e73">Change how often you get it</a>, or turn it off, after signing in.`
}

export interface CertReminder { name: string; status: 'in-progress' | 'not-started'; pct: number }

export const CERT_URL = `${SITE}/certification`

export function certReminderSubject(r: CertReminder): string {
  return r.status === 'not-started' ? 'Start your Department WCM Certification' : `Your WCM certification is ${r.pct}% done`
}

export function certReminderEmail(r: CertReminder, footer: string): string {
  const body = r.status === 'not-started'
    ? `<p>Hi ${esc(firstName(r.name))},</p>
    <p>As your department&rsquo;s Web Content Manager, you are asked to complete the <strong>Department WCM Certification</strong> in BCPS MarComm. You have not started it yet.</p>
    <p>The course walks through the District&rsquo;s website standards, accessibility and the tools you will use, and you can take it in short sittings. Your progress saves as you go.</p>
    <p>If you get stuck, bring your questions to a Hot Lab. The times are on your dashboard.</p>
    <p>Sean A. Russell<br>District Webmaster, Office of Communications</p>`
    : `<p>Hi ${esc(firstName(r.name))},</p>
    <p>You are <strong>${r.pct}%</strong> of the way through the <strong>Department WCM Certification</strong>. Pick up where you left off; your progress is saved.</p>
    <p>If something is holding you up, bring it to a Hot Lab. The times are on your dashboard.</p>
    <p>Sean A. Russell<br>District Webmaster, Office of Communications</p>`
  return brandedEmail({
    heading: r.status === 'not-started' ? 'Start your certification' : 'Finish your certification',
    body,
    ctaLabel: r.status === 'not-started' ? 'Start the certification' : 'Continue the certification',
    ctaHref: CERT_URL,
    footNote: footer,
  })
}

// Friday morning, to the people who approve: next week's emails are ready.
export function approvalNoticeEmail(weekLabel: string, streams: { name: string; count: number }[], approveUrl: string): string {
  const rows = streams.map((s) => `<li style="margin-bottom:6px"><strong>${esc(s.name)}</strong>: ${s.count} ${s.count === 1 ? 'person' : 'people'}</li>`).join('')
  return brandedEmail({
    heading: `Approve the emails for the week of ${esc(weekLabel)}`,
    body: `<p>These recurring emails are ready for next week. Open any person&rsquo;s email to spot check it, then approve each one by <strong>5 PM today</strong>.</p>
    <ul style="padding-left:20px;margin:12px 0">${rows}</ul>
    <p>Anything not approved does not go out. Each email is built from the live data on the morning it sends, so the numbers can move a little after you approve.</p>`,
    ctaLabel: 'Review and approve',
    ctaHref: approveUrl,
  })
}
