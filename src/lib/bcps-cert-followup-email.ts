// Certification follow-up (Sean, 2026-10-29): a supportive check-in with every
// Department WCM who has not finished the certification, in four versions by
// where they are. It comes from BCPS MarComm in Sean's name, and replies go to
// his District Outlook. The tone is "how can we help", not a warning: Sean does
// not want to switch anyone's access off, so the ask is to tell him if the deadline
// is not realistic. Pure templates, so the follow-up page previews exactly
// what sends.
import { brandedEmail, esc, firstName, SITE } from '@/lib/bcps-portal-account'

import type { FollowupGroup } from '@/lib/bcps-cert-followup-groups'
export { FOLLOWUP_GROUPS, followupGroup, type FollowupGroup } from '@/lib/bcps-cert-followup-groups'

export const FOLLOWUP_FROM_NAME = 'Sean A. Russell via BCPS MarComm'
export const FOLLOWUP_REPLY_TO = 'sean.russell@browardschools.com'
export const CERT_URL = `${SITE}/certification`
export const LAB_URL = `${SITE}/lab`
export const CERT_COMPLETE_URL = `${SITE}/certification/departments/complete`
export const GUIDE_URL = `${SITE}/playbooks/wcm-department`

export interface FollowupPerson { name: string; department: string | null; pct: number; group: FollowupGroup }

export function followupSubject(p: FollowupPerson): string {
  return {
    near: `You're almost there, ${firstName(p.name)}`,
    progress: 'More time for your WCM certification',
    'not-started': 'More time for your WCM certification: how can we help?',
    'no-account': 'More time for your WCM certification: how can we help?',
    completed: "Congratulations, you've completed the Department WCM Certification",
  }[p.group]
}

// Extended from Friday, Oct 30 (Sean, 2026-10-29). Said as more room, with no
// reason given; the two Hot Labs before it are where to get help.
const DUE = 'Thursday, November 5'
const EXTENDED = `We&rsquo;ve extended the deadline to <strong>${DUE}</strong> to give everyone a little more room.`
const HOT_LABS = '<p>Hot Lab on Tuesday, November 3 and Thursday, November 5, 11:30 AM to 12:30 PM, is also a good place to get help with any module.</p>'
const SIGN = '<p>Thank you,<br>Sean A. Russell<br>District Webmaster, Office of Communications</p>'
const help = (verb: 'finishing' | 'starting') => `<p>If anything is keeping you from ${verb}, or you don&rsquo;t think you&rsquo;ll make it by November 5, just reply to this email or message me on Teams and let me know how we can support you. We would much rather help you get there than hold anything up.</p>`

// The button sits right after what to do, ahead of the ask for help and the
// sign-off, so it is not the last thing in the email.
const button = (label: string, href: string) => `
  <div style="margin:22px 0 20px"><a href="${esc(href)}" style="display:inline-block;padding:12px 26px;background:#1672A7;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">${label}</a></div>`

// Tuesday nudge (Sean, 2026-11-03): people with an account whose progress has not
// moved since the follow-up went out. One version, short, same "how can we help"
// tone. PREVIEW ONLY until Sean approves a send; the route has no send path for it.
export const NUDGE_SUBJECT = 'A quick check-in on your WCM certification'

export function nudgeEmail(p: FollowupPerson, trackedUrl: (url: string) => string, pixel: string): string {
  const where = p.pct > 0
    ? `You&rsquo;re <strong>${p.pct}%</strong> of the way through the Department WCM Certification.`
    : 'You haven&rsquo;t had a chance to start the Department WCM Certification yet.'
  const body = `<p>Hi ${esc(firstName(p.name))},</p>
    <p>${where} The deadline is <strong>${DUE}</strong>, and I wanted to check in.</p>
    <p>The course saves your progress, so even a short sitting helps.</p>
    ${button('Continue the certification', trackedUrl(CERT_URL))}
    <p>If something is in the way, just reply or message me on Teams and tell me what would help. We would much rather help you get there than hold anything up.</p>
    ${HOT_LABS}${SIGN}`
  return brandedEmail({
    heading: 'A quick check-in',
    body: body + pixel,
    footer: 'Sent from BCPS MarComm on behalf of Sean A. Russell. Replies go to Sean&rsquo;s District email.',
  })
}

// trackedUrl wraps a link so a click is counted; pixel is the open-tracking image tag.
export function followupEmail(p: FollowupPerson, trackedUrl: (url: string) => string, pixel: string): string {
  const hi = `<p>Hi ${esc(firstName(p.name))},</p>`
  const dept = p.department ? esc(p.department) : 'your department'
  const bodies: Record<FollowupGroup, { heading: string; body: string }> = {
    near: {
      heading: 'You&rsquo;re almost there',
      body: `${hi}
        <p>You&rsquo;re <strong>${p.pct}%</strong> of the way through the Department WCM Certification, so you&rsquo;re nearly done. Thank you for the time you&rsquo;ve put in.</p>
        <p>${EXTENDED} Pick up where you left off; your progress is saved.</p>
        ${button('Finish your certification', trackedUrl(CERT_URL))}${help('finishing')}${HOT_LABS}${SIGN}`,
    },
    progress: {
      heading: 'More time for your certification',
      body: `${hi}
        <p>You&rsquo;re <strong>${p.pct}%</strong> of the way through the Department WCM Certification. Thank you for working on it.</p>
        <p>${EXTENDED} Your progress saves as you go, so short sittings work well.</p>
        ${button('Continue the certification', trackedUrl(CERT_URL))}
        <p>If you don&rsquo;t think you&rsquo;ll finish by November 5, reply and tell me what would help: a quick one-on-one, help with a module, or a little more time. We&rsquo;ll work it out together.</p>
        ${HOT_LABS}${SIGN}`,
    },
    'not-started': {
      heading: 'How can we help?',
      body: `${hi}
        <p>As ${dept}&rsquo;s Web Content Manager, you&rsquo;re asked to complete the Department WCM Certification. It looks like you haven&rsquo;t started yet, and that&rsquo;s okay. We know this is a busy time of year.</p>
        <p>${EXTENDED} The course is self-paced and saves your progress, so you can take it in short sittings.</p>
        ${button('Start the certification', trackedUrl(CERT_URL))}${help('starting')}${HOT_LABS}${SIGN}`,
    },
    'no-account': {
      heading: 'How can we help?',
      body: `${hi}
        <p>As ${dept}&rsquo;s Web Content Manager, you&rsquo;re asked to complete the Department WCM Certification. It looks like you haven&rsquo;t registered yet, and that&rsquo;s okay. We know this is a busy time of year.</p>
        <p>The first step is registering through LAB, so the hours count toward your PD credit. LAB then gives you the link to create your BCPS MarComm account and start. The course is self-paced.</p>
        <p>${EXTENDED}</p>
        ${button('Register and start', trackedUrl(LAB_URL))}${help('starting')}${HOT_LABS}${SIGN}`,
    },
    completed: {
      heading: 'Congratulations',
      body: `${hi}
        <p>Congratulations on completing the Department WCM Certification. Thank you for the time and care you put into it. This email is your official confirmation of completion.</p>
        <p>We will confirm your completion in LAB after the end of this week, so you can receive your credit there.</p>
        <p>Hot Lab is tomorrow, Tuesday, November 3, and again on Thursday, November 5, 11:30 AM to 12:30 PM. Tomorrow we&rsquo;ll focus on the audits and a few other important updates. We look forward to seeing you there.</p>
        ${button('View your certificate and badge', trackedUrl(CERT_COMPLETE_URL))}
        <p>We also want you to have the new Department WCM Guide. It replaces the old Department WCM Playbook and brings together everything you need to know in one place: how to run your department&rsquo;s site, the audit and checklist, the certification, and the Hot Lab notes. Take a look at <a href="${GUIDE_URL}">the Department WCM Guide</a> (you&rsquo;ll be asked to sign in first). New this week: a five-step walkthrough of the audit, at the start of Your Audit.</p>
        <p>If anything in the guide is unclear or you have questions about it, reply to this email and tell me. We&rsquo;ll use your feedback to make it better.</p>${SIGN}`,
    },
  }
  const v = bodies[p.group]
  return brandedEmail({
    heading: v.heading,
    body: v.body + pixel,
    footer: 'Sent from BCPS MarComm on behalf of Sean A. Russell. Replies go to Sean&rsquo;s District email.',
  })
}
