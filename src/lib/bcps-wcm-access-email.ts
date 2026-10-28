// The Web Content Manager access email (V, 2026-10-28), Campaign 2 on the
// Super Admin Campaigns tab, sent by /api/bcps/wcm-campaign to every
// department Web Content Manager on the roster. The WCM counterpart of the
// director invitation (lib/bcps-director-invite-email), in the same voice. Its
// own module so the copy can be rendered and approved without sending
// anything (scripts/render-emails.ts).
import { brandedEmail, esc, firstName, tempPasswordHtml, WCM_PLAYBOOK_URL } from '@/lib/bcps-portal-account'

export interface WcmRecipient {
  name: string
  departments: string[]
}

// tempPassword: set by resolveOrInviteAccount on a new account or one never
// signed into; shown under the button. See ResolvedAccount.
export function wcmAccessEmail(r: WcmRecipient, link: string, isNew: boolean, tempPassword?: string | null) {
  const scope = r.departments.length > 1
    ? `${r.departments.length} departments (${r.departments.map(esc).join(', ')})`
    : r.departments[0] ? esc(r.departments[0]) : 'your department'
  const body = `
    <p>Hi ${esc(firstName(r.name))},</p>
    <p>You are on record as the Web Content Manager for <strong>${scope}</strong>, and your access to
    <strong>BCPS MarComm</strong>, the District Web Team&rsquo;s platform for the people who keep our department websites current, is ready. Signed in, you will find:</p>
    <ul style="padding-left:20px;margin:12px 0">
      <li style="margin-bottom:6px"><strong>Your department&rsquo;s website review</strong>: where the audit stands and what to update.</li>
      <li style="margin-bottom:6px"><strong>Analytics</strong>: how many families and staff visit your pages and which ones they use most.</li>
      <li style="margin-bottom:6px"><strong>Hot Labs</strong>: the recordings and notes from our twice-weekly sessions with Web Content Managers, and the times to join.</li>
      <li style="margin-bottom:6px"><strong>Your certification</strong>: the Department WCM Certification and where you are in it.</li>
      <li style="margin-bottom:6px"><strong>Your playbook</strong>: the standards, responsibilities and tools for your role.</li>
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
    heading: 'Your BCPS MarComm access',
    body,
    ctaLabel: isNew ? 'Set your password' : 'Sign in to BCPS MarComm',
    ctaHref: link,
    footNote: `${isNew ? 'This link works once. If it has expired, use the temporary password above or choose &ldquo;Forgot password&rdquo; on the sign-in page. ' : ''}Your playbook is at <a href="${WCM_PLAYBOOK_URL}" style="color:#0e4e73">${WCM_PLAYBOOK_URL.replace('https://', '')}</a>.`,
  })
}
