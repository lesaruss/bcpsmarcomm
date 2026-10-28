// Who runs a Playbook (BCPS Document System, Phase 3, V 2026-10-28).
// metadata.transcript_admins are the project's leads (they upload meeting
// transcripts, build agendas, review team input). metadata.backup_leads are
// the backup: anything waiting on the leads for five business days goes to
// the backup too, so a project never stalls on one person ("A backup lead on
// every project").

export const HANDOFF_BUSINESS_DAYS = 5

const emails = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((e): e is string => typeof e === 'string' && e.includes('@')).map((e) => e.toLowerCase()) : []

export const leadsOf = (metadata: unknown) => emails((metadata as Record<string, unknown> | null)?.transcript_admins)
export const backupsOf = (metadata: unknown) => emails((metadata as Record<string, unknown> | null)?.backup_leads)

// Weekdays from `from` to `to` (dates as YYYY-MM-DD or ISO), not counting the
// start day. Holidays are not known here, so a long weekend counts its weekday.
export function businessDaysBetween(from: string, to: string): number {
  const start = new Date(from.slice(0, 10) + 'T12:00:00Z')
  const end = new Date(to.slice(0, 10) + 'T12:00:00Z')
  let n = 0
  for (const d = new Date(start); d < end;) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6 && d <= end) n++
  }
  return n
}

// Eastern date, YYYY-MM-DD.
export const easternDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

// True once something created at `createdAt` has waited long enough to go to the backup lead.
export const handedOff = (createdAt: string, today = easternDate()) =>
  businessDaysBetween(easternDate(new Date(createdAt)), today) >= HANDOFF_BUSINESS_DAYS
