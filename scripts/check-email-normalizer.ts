// Guards normalizeDistrictEmail (src/lib/bcps-auth.ts).
//
// Runs inside npm run build, same as the email drift check, so a change that
// breaks the rule fails the build rather than waiting for someone to notice a
// bounced WCM invitation weeks later. Added 2026-09-15 after four pending
// roster submissions were found carrying mistyped district domains.
//
// Two rules are under test. A mangled district domain resolves to the
// canonical staff domain. A genuinely different domain is returned exactly as
// typed, because that is a different person to make a decision about.

import { normalizeDistrictEmail } from '../src/lib/bcps-auth'

const D = '@browardschools.com'

const cases: [string | null | undefined, string | null][] = [
  // The four found in the pending queue on 2026-09-15.
  ['allan.llanos@broardschools.com', 'allan.llanos' + D],
  ['andrea.barton@browardschool.scom', 'andrea.barton' + D],
  ['jackson.dorisca@browardschools.coms.com', 'jackson.dorisca' + D],
  ['belinda.daise@browatdschools.com', 'belinda.daise' + D],

  // Already correct. Casing and surrounding whitespace are normalized too.
  ['diana.agenor@browardschools.com', 'diana.agenor' + D],
  ['  Diana.Agenor@BrowardSchools.COM  ', 'Diana.Agenor' + D],

  // Other manglings of the same domain.
  ['x@browardschools.con', 'x' + D],
  ['x@browardschools.com.com', 'x' + D],
  ['x@browardschool.com', 'x' + D],

  // Any browardschools.* variant resolves to the canonical staff domain.
  ['someone@browardschools.net', 'someone' + D],
  ['someone@browardschools.edu', 'someone' + D],

  // The student subdomain is a real, different mailbox. Left alone.
  ['student@my.browardschools.com', 'student@my.browardschools.com'],

  // Genuinely different domains are never rewritten.
  ['someone@comcast.com', 'someone@comcast.com'],
  ['someone@gmail.com', 'someone@gmail.com'],
  ['vendor@finalsite.com', 'vendor@finalsite.com'],

  // Nothing to work with.
  [null, null],
  ['', null],
  ['   ', null],
  ['notanemail', 'notanemail'],
  ['trailing@', 'trailing@'],
]

let failed = 0
for (const [input, expected] of cases) {
  const got = normalizeDistrictEmail(input)
  if (got !== expected) {
    failed++
    console.error(
      `FAIL  ${JSON.stringify(input)} -> ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${cases.length} email normalizer cases failed.`)
  process.exit(1)
}
console.log(`All ${cases.length} email normalizer cases pass.`)
