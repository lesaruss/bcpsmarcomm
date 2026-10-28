// The director invitation email (Sean, 2026-10-28), sent by
// /api/bcps/director-invite. Its own module so the copy can be rendered and
// read without sending anything.
import { brandedEmail, esc, firstName, tempPasswordHtml, DIRECTOR_PLAYBOOK_URL } from '@/lib/bcps-portal-account'

export interface InviteRecipient {
  name: string
  departments: string[]
  role: 'director' | 'executive' | 'leader' | 'function_lead'
}

// A function lead (a Coordinator who runs a program inside a department) keeps
// that program's page, so their list is about the page rather than a team.
function functionLeadItems(page: string) {
  return `
      <li style="margin-bottom:6px"><strong>Your ${esc(page)} page</strong>: where it stands with the website review and what to update.</li>
      <li style="margin-bottom:6px"><strong>Analytics</strong>: how many families and staff visit your department&rsquo;s pages and which ones they use most.</li>
      <li style="margin-bottom:6px"><strong>Hot Labs</strong>: the recordings and notes from our twice-weekly sessions with Web Content Managers, and the times to join.</li>
      <li style="margin-bottom:6px"><strong>Your certification</strong>: the Department WCM Certification and where you are in it.</li>`
}

// tempPassword (2026-10-28): set by resolveOrInviteAccount on a new account or
// one never signed into; shown under the button. See ResolvedAccount.
export function inviteEmail(r: InviteRecipient, link: string, isNew: boolean, tempPassword?: string | null) {
  const lead = r.role === 'function_lead'
  const scope = lead
    ? `${esc(r.departments[0] ?? 'your program')}`
    : r.role === 'leader'
    ? 'every department’s website'
    : r.departments.length > 1
      ? `the ${r.departments.length} departments you oversee (${r.departments.map(esc).join(', ')})`
      : r.departments[0] ? `${esc(r.departments[0])}` : 'your department'
  const body = `
    <p>Hi ${esc(firstName(r.name))},</p>
    <p>You now have access to <strong>BCPS MarComm</strong>, the District Web Team&rsquo;s platform for the people who keep
    our department websites current. Your dashboard covers ${scope}:</p>
    <ul style="padding-left:20px;margin:12px 0">${lead ? functionLeadItems(r.departments[0] ?? 'program') : `
      <li style="margin-bottom:6px"><strong>Your Web Content Managers</strong>: who they are and where each one stands with certification.</li>
      <li style="margin-bottom:6px"><strong>Analytics</strong>: how many families and staff use your pages, your most visited pages, and a department report with where visitors come from, links to fix and marketing ideas.</li>
      <li style="margin-bottom:6px"><strong>Website review</strong>: where your department&rsquo;s audit stands and what it found.</li>
      <li style="margin-bottom:6px"><strong>Hot Labs</strong>: the recordings and notes from our twice-weekly sessions with WCMs, so you can see what we are working on together.</li>
      <li style="margin-bottom:6px"><strong>Meeting notes</strong> from your department&rsquo;s review meetings, and the Director Playbook.</li>
`}
    </ul>
    <p>${isNew
      ? 'Use the button below to set your password. After that, sign in at bcpsmarcomm.com with your District email.'
      : tempPassword
        ? 'Your account is ready.'
        : 'You already have an account, so just sign in with your District email and password.'}</p>
    ${tempPassword ? tempPasswordHtml(tempPassword, !isNew) : ''}
    <p>If you have a question, reply to this email or use the feedback button once you are signed in.</p>
    <p>Sean A. Russell<br>District Webmaster, Office of Communications</p>`
  return brandedEmail({
    heading: 'Welcome to BCPS MarComm',
    body,
    ctaLabel: isNew ? 'Set your password' : 'Sign in to BCPS MarComm',
    ctaHref: link,
    footNote: `${isNew ? 'This link works once. If it has expired, choose &ldquo;Forgot password&rdquo; on the sign-in page. ' : ''}The Director Playbook is at <a href="${DIRECTOR_PLAYBOOK_URL}" style="color:#0e4e73">${DIRECTOR_PLAYBOOK_URL.replace('https://', '')}</a>.`,
  })
}

