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
    name: 'wcm-confirmation-existing-account',
    subject: `You're confirmed: BCPS Web Content Manager for ${DEPT}`,
    html: wcmConfirmationEmail({
      wcmName: WCM, departmentName: DEPT, isNewAccount: false,
      failsafeHref: `${SITE}/login`,
    }),
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
