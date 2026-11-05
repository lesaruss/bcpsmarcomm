// The certification follow-up's groups (Sean, 2026-10-29), kept apart from
// the email templates so the follow-up page can import them in the browser.

export type FollowupGroup = 'near' | 'progress' | 'not-started' | 'no-account' | 'completed'

export const FOLLOWUP_GROUPS: { key: FollowupGroup; label: string; who: string }[] = [
  { key: 'near', label: 'Almost done', who: '90% or more' },
  { key: 'progress', label: 'In progress', who: '1% to 89%' },
  { key: 'not-started', label: 'Not started', who: 'Has an account, 0%' },
  { key: 'no-account', label: 'No account yet', who: 'Has not registered' },
  { key: 'completed', label: 'Completed', who: 'Certified: congratulations' },
]

export function followupGroup(pct: number, hasAccount: boolean, certified = false): FollowupGroup {
  if (certified) return 'completed'
  if (!hasAccount) return 'no-account'
  if (pct >= 90) return 'near'
  if (pct >= 1) return 'progress'
  return 'not-started'
}

// Campaigns that send one message to every Department WCM on the roster,
// certified or not, instead of a version per group (Sean, 2026-11-05: the
// certification wrap-up and LAB note, sent Friday, Nov 6 at 9 AM).
export const ALL_WCM_CAMPAIGNS = ['cert-update-2026-11-06']
export const isAllWcmCampaign = (c: string | null | undefined) => !!c && ALL_WCM_CAMPAIGNS.includes(c)
