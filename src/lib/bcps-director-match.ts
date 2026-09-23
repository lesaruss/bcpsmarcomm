// Does this signed-in district address plausibly belong to the person named
// as the department's director on file?
//
// Added 2026-09-14 (PUBLIC-REPO-HARDCODED-KEY-ESCALATED, step 4). Before this,
// "is the submitter really the director?" was answered by a checkbox the
// submitter ticked themselves - and c3a38f3 removed even that, so identity_flag
// had no honest writer left. Now the authenticated session email is compared
// against the director name of record, server-side, and the submitter cannot
// influence the result.
//
// Deliberately NOT a hard block. Tuned against all 81 live submissions: a strict
// match would reject legitimate traffic, because real directors submit as
//   - P-number mailboxes (P00010591@browardschools.com)
//   - name variants (Dr. Dildra Martin-Ogburn -> dildra.ogburn@)
//   - delegates (an office manager filing for their director)
// All three are normal here. So a miss sets identity_flag and routes the row to
// the District Web Team review queue (the gate that already exists), rather than
// turning a real director away at the door.

const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'professor'])
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv'])

function nameTokens(name: string): string[] {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !TITLES.has(t) && !SUFFIXES.has(t))
}

function emailTokens(email: string): string[] {
  return (email || '')
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1)
}

// True when both the first and last name of record appear in the mailbox.
// Middle names and initials are ignored on both sides.
export function emailMatchesName(email: string, name: string): boolean {
  const nt = nameTokens(name)
  const et = emailTokens(email)
  if (nt.length === 0 || et.length === 0) return false
  const first = nt[0]
  const last = nt[nt.length - 1]
  const has = (t: string) => et.some(e => e === t || e.startsWith(t) || t.startsWith(e))
  return has(first) && has(last)
}

export type DirectorVerdict = {
  verified: boolean
  reason: string
}

// onFileDirector is the director name of record (bcps_wcm_roster.director_name,
// falling back to bcps_departments.director_name). claimedDirector is what the
// form says. Both are checked: matching the name typed into the form is not
// enough on its own, since the form is submitter-controlled.
export function verifyDirector(opts: {
  sessionEmail: string
  onFileDirector: string | null
  claimedDirector: string | null
  onFileDirectorEmail?: string | null
}): DirectorVerdict {
  const email = (opts.sessionEmail || '').trim().toLowerCase()

  const ofEmail = (opts.onFileDirectorEmail || '').trim().toLowerCase()
  if (ofEmail && ofEmail === email) {
    return { verified: true, reason: 'Signed-in address is the director email of record.' }
  }

  if (opts.onFileDirector && emailMatchesName(email, opts.onFileDirector)) {
    return { verified: true, reason: 'Signed-in address matches the director of record.' }
  }

  if (!opts.onFileDirector) {
    // No director of record to check against (manual/unlisted department entry).
    // Cannot be verified either way - route it to review.
    return { verified: false, reason: 'No director on file for this department to verify against.' }
  }

  if (opts.claimedDirector && emailMatchesName(email, opts.claimedDirector)) {
    return {
      verified: false,
      reason: `Signed-in address matches the name entered (${opts.claimedDirector}) but not the director on file (${opts.onFileDirector}) - possible director change.`,
    }
  }

  return {
    verified: false,
    reason: `Signed-in address does not match the director on file (${opts.onFileDirector}) - submitted on the director's behalf, or a director change.`,
  }
}

// True when the first and last name of `a` both appear among the name tokens
// of `b` (titles, suffixes, middle initials ignored), e.g. "Lindsey M. Way"
// matches "Lindsey Way". Added 2026-09-23 so an approved roster confirm can
// find a WCM's address on their portal account when the roster row has none.
// Callers must still require a UNIQUE match before trusting it.
export function namesMatch(a: string, b: string): boolean {
  const at = nameTokens(a)
  const bt = nameTokens(b)
  if (at.length < 2 || bt.length < 2) return false
  return bt.includes(at[0]) && bt.includes(at[at.length - 1])
}
