// Assignable "View as" tiers (Sean, 2026-09-29). A person granted View as in
// bcps_view_as_grants may preview their own tier and anything below it, never
// above. SuperAdmin previews everything and needs no grant. Tier is read from
// acl group membership (plus the acl 'admin' role, which sits at the District
// Web Team tier). Shared by /api/bcps/my-access (enforcement) and the sidebar
// (which previews to list).
export const VIEW_AS_GROUP_TIER: Record<string, number> = {
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
