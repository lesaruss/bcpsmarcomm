// The certification follow-up's groups (Sean, 2026-10-29), kept apart from
// the email templates so the follow-up page can import them in the browser.

export type FollowupGroup = 'near' | 'progress' | 'not-started' | 'no-account'

export const FOLLOWUP_GROUPS: { key: FollowupGroup; label: string; who: string }[] = [
  { key: 'near', label: 'Almost done', who: '90% or more' },
  { key: 'progress', label: 'In progress', who: '1% to 89%' },
  { key: 'not-started', label: 'Not started', who: 'Has an account, 0%' },
  { key: 'no-account', label: 'No account yet', who: 'Has not registered' },
]

export function followupGroup(pct: number, hasAccount: boolean): FollowupGroup {
  if (!hasAccount) return 'no-account'
  if (pct >= 90) return 'near'
  if (pct >= 1) return 'progress'
  return 'not-started'
}
