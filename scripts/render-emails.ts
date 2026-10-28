// Renders every outbound email from the SAME functions the app sends with,
// into emails/approved/*.html.
//
// Why this exists (Sean, 2026-09-15): "we need to do whatever we do so it
// doesn't drift the message, because then I can't approve what's drifted."
// The copy he approves and the copy that sends must be provably the same
// artifact, not two things that happen to match today.
//
//   npm run emails        - re-render the snapshots (after an intended edit)
//   npm run emails:check  - fail if the rendered copy differs from the
//                           approved snapshots. Runs in CI and before build.
//
// Any wording change therefore shows up as a diff in emails/approved/ in the
// pull request, and an UNINTENDED change cannot reach production quietly -
// the check fails first.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// The email module also creates a Supabase service client at import time, and
// that client refuses to construct without a URL. Rendering copy needs no
// database, so stand in placeholders before importing. They are never used:
// only the pure template functions are called below, and the check must run
// anywhere (a CI job, a clean clone) without production credentials.
process.env.LESARUSS_SUPABASE_URL ||= 'https://placeholder.supabase.co'
process.env.LESARUSS_SUPABASE_SERVICE_KEY ||= 'placeholder'
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://placeholder.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'placeholder'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  directorConfirmationEmail,
  wcmConfirmationEmail,
  SITE,
} = require('../src/lib/bcps-portal-account') as typeof import('../src/lib/bcps-portal-account')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { wcmAccessEmail } = require('../src/lib/bcps-wcm-access-email') as typeof import('../src/lib/bcps-wcm-access-email')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { certReminderEmail, certReminderSubject, approvalNoticeEmail, settingsFooter } = require('../src/lib/email-stream-copy') as typeof import('../src/lib/email-stream-copy')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { digestHtml, digestSubject } = require('../src/lib/playbook-digest') as typeof import('../src/lib/playbook-digest')

const OUT = join(process.cwd(), 'emails', 'approved')
const CHECK = process.argv.includes('--check')

// Fixed sample data. Never randomise, never use a real date - the snapshot
// must change only when the COPY changes.
const DEPT = 'Labor Relations'
const DIRECTOR = 'David Azzarito'
const WCM = 'Patricia Sapp'

const cases: { name: string; subject: string; html: string }[] = [
  {
    name: 'director-confirmation',
    subject: `Confirmed: BCPS Web Content Manager Roster for ${DEPT}`,
    html: directorConfirmationEmail({
      directorName: DIRECTOR, departmentName: DEPT, wcmName: WCM, wcmNotified: true,
    }),
  },
  {
    name: 'director-confirmation-wcm-not-notified',
    subject: `Confirmed: BCPS Web Content Manager Roster for ${DEPT}`,
    html: directorConfirmationEmail({
      directorName: DIRECTOR, departmentName: DEPT, wcmName: WCM, wcmNotified: false,
    }),
  },
  {
    name: 'director-confirmation-no-wcm',
    subject: `Confirmed: BCPS Web Content Manager Roster for ${DEPT}`,
    html: directorConfirmationEmail({
      directorName: DIRECTOR, departmentName: DEPT, wcmName: null, wcmNotified: false,
    }),
  },
  {
    name: 'wcm-confirmation-new-account',
    subject: `You're invited: BCPS Web Content Manager for ${DEPT}`,
    html: wcmConfirmationEmail({
      wcmName: WCM, departmentName: DEPT, isNewAccount: true,
      failsafeHref: `${SITE}/set-password#SAMPLE_ACTION_LINK`,
    }),
  },
  {
    // The temporary password under the button (2026-10-28), set on every new
    // account and on one never signed into. Fixed sample password.
    name: 'wcm-confirmation-new-account-temp-password',
    subject: `You're invited: BCPS Web Content Manager for ${DEPT}`,
    html: wcmConfirmationEmail({
      wcmName: WCM, departmentName: DEPT, isNewAccount: true,
      failsafeHref: `${SITE}/set-password#SAMPLE_ACTION_LINK`,
      tempPassword: 'SampleTemp23',
    }),
  },
  {
    name: 'wcm-confirmation-existing-account',
    subject: `You're confirmed: BCPS Web Content Manager for ${DEPT}`,
    html: wcmConfirmationEmail({
      wcmName: WCM, departmentName: DEPT, isNewAccount: false,
      failsafeHref: `${SITE}/login`,
    }),
  },
  {
    // Campaign 2 on the Campaigns tab (V, 2026-10-28): a WCM with no account
    // gets the set-password button and a temporary password.
    name: 'wcm-access-new-account',
    subject: 'Your BCPS MarComm access',
    html: wcmAccessEmail({ name: WCM, departments: [DEPT] }, `${SITE}/set-password#SAMPLE_ACTION_LINK`, true, 'SampleTemp23'),
  },
  {
    name: 'wcm-access-existing-account',
    subject: 'Your BCPS MarComm access',
    html: wcmAccessEmail({ name: WCM, departments: [DEPT] }, `${SITE}/login`, false, null),
  },
  // Recurring emails (Campaigns Phase 2, V 2026-10-28). Fixed sample data and
  // a fixed date, as above.
  {
    name: 'stream-certification-in-progress',
    subject: certReminderSubject({ name: WCM, status: 'in-progress', pct: 52 }),
    html: certReminderEmail({ name: WCM, status: 'in-progress', pct: 52 }, settingsFooter('Your WCM certification', 'weekly')),
  },
  {
    name: 'stream-certification-not-started',
    subject: certReminderSubject({ name: WCM, status: 'not-started', pct: 0 }),
    html: certReminderEmail({ name: WCM, status: 'not-started', pct: 0 }, settingsFooter('Your WCM certification', 'weekly')),
  },
  (() => {
    const d = {
      email: 'sample@browardschools.com', name: WCM,
      due: [{ slug: 'sample-playbook', playbook: 'Sample Project', text: 'Send the reminder to extension WCMs (Patricia)', kind: 'queue', due: '2026-10-07', overdue: true }],
      other: [{ slug: 'sample-playbook', playbook: 'Sample Project', text: 'Confirm the school matches (Patricia)', kind: 'queue', due: null, overdue: false }],
      reviews: [{ slug: 'sample-playbook', playbook: 'Sample Project', count: 1, handoff: false }],
      followups: [{ slug: 'sample-playbook', playbook: 'Sample Project', meeting_date: '2026-10-20', open: 2, total: 4, notes: true }],
    }
    return { name: 'stream-project-digest', subject: digestSubject(d), html: digestHtml(d, '2026-10-28', settingsFooter('Your projects this week', 'weekly')) }
  })(),
  {
    name: 'stream-approval-notice',
    subject: "Approve next week's emails by 5 PM: Your projects this week, Your WCM certification",
    html: approvalNoticeEmail('November 2, 2026', [{ name: 'Your projects this week', count: 2 }, { name: 'Your WCM certification', count: 63 }], `${SITE}/?page=superadmin&tab=campaigns`),
  },
]

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

let drifted = 0
for (const c of cases) {
  const doc = `<!-- SUBJECT: ${c.subject} -->\n${c.html}`
  const path = join(OUT, `${c.name}.html`)
  if (CHECK) {
    if (!existsSync(path)) {
      console.error(`MISSING approved copy: ${c.name}. Run "npm run emails" and review the result.`)
      drifted++
      continue
    }
    if (readFileSync(path, 'utf8') !== doc) {
      console.error(`DRIFT: ${c.name} no longer matches its approved copy.`)
      drifted++
    }
  } else {
    writeFileSync(path, doc)
    console.log(`rendered ${c.name}`)
  }
}

if (CHECK) {
  if (drifted > 0) {
    console.error(
      `\n${drifted} email(s) differ from the approved copy in emails/approved/.\n` +
      `If the change is intentional: run "npm run emails", read the diff, and commit it.\n` +
      `That diff is the approval record.`
    )
    process.exit(1)
  }
  console.log(`All ${cases.length} emails match their approved copy.`)
}
