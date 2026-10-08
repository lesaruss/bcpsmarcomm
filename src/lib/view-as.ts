// Assignable "View as" tiers (Sean, 2026-09-29). A person granted View as in
// bcps_view_as_grants may preview their own tier and anything below it, never
// above. SuperAdmin previews everything and needs no grant. Tier is read from
// acl group membership (plus the acl 'admin' role, which sits at the District
// Web Team tier). Shared by /api/bcps/my-access (enforcement) and the sidebar
// (which previews to list).
//
// 'Director' is not an acl group: directors are recognized by
// bcps_departments.director_email and hold no group, so their preview is the
// public page set (my-access answers it without a group lookup). It sits
// below every group, so anyone granted View as may preview it.
export const DIRECTOR_PREVIEW = 'Director'
// 'School WCM' is not an acl group either: school WCMs are recognized by
// bcps_schools.wcm_email. Their preview is the public pages plus
// SCHOOL_WCM_PAGES (lib/school-wcm-pages.ts), what a real school WCM gets.
export const SCHOOL_WCM_PREVIEW = 'School WCM'
export const VIEW_AS_GROUP_TIER: Record<string, number> = {
  [DIRECTOR_PREVIEW]: 0,
  [SCHOOL_WCM_PREVIEW]: 1,
  'Web Content Management': 1,
  'District Web Team': 2,
}

export function viewAsTier(role: string, groups: string[]): number {
  if (role === 'superadmin') return Number.POSITIVE_INFINITY
  let tier = role === 'admin' ? VIEW_AS_GROUP_TIER['District Web Team'] : 0
  for (const g of groups) tier = Math.max(tier, VIEW_AS_GROUP_TIER[g] ?? 0)
  return tier
}

// Group names this caller may preview, lowest tier first.
export function previewableGroups(role: string, groups: string[]): string[] {
  const tier = viewAsTier(role, groups)
  return Object.entries(VIEW_AS_GROUP_TIER)
    .filter(([, t]) => t <= tier)
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name)
}
