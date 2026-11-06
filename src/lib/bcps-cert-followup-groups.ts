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

// Campaigns set up ahead of a send (Sean, 2026-11-06): each shows in the
// Campaign menu as Ready to send before anything has gone out, with a plain
// label, so picking it loads the list and the Send button is ready.
// allWcm: one message to every Department WCM on the roster, certified or
// not, instead of a version per group (the certification wrap-up and LAB
// note, Friday, Nov 6).
export const READY_CAMPAIGNS: { id: string; label: string; allWcm: boolean }[] = [
  { id: 'cert-update-2026-11-06', label: 'Certification wrap-up and LAB note (Nov 6, every WCM)', allWcm: true },
]
export const ALL_WCM_CAMPAIGNS = READY_CAMPAIGNS.filter((c) => c.allWcm).map((c) => c.id)
export const isAllWcmCampaign = (c: string | null | undefined) => !!c && ALL_WCM_CAMPAIGNS.includes(c)
export const campaignLabel = (c: string) => READY_CAMPAIGNS.find((x) => x.id === c)?.label ?? null
