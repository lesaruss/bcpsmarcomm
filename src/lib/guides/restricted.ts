// Restricted guides (Sean, 2026-10-30): guides whose content is only for named
// readers, such as the Website & Platform guide with its costs and ownership
// terms. Their content lives in the database (public.bcps_guides), never in
// this repository, which is public, and is sent by /api/bcps/guides/[slug]
// only to readers who pass requireDocumentAccess. This file holds names and
// the documents each guide replaced, nothing more.

export interface RestrictedGuideMeta {
  slug: string
  title: string
  audience: string
  cadence: string
  // Documents folded into the guide, by slug, and the tab each now lives in.
  replaces: Record<string, string>
}

export const RESTRICTED_GUIDES: Record<string, RestrictedGuideMeta> = {
  'website-platform': {
    slug: 'website-platform',
    title: 'Website & Platform',
    audience: 'District web and platform leadership',
    cadence: 'updated as decisions are made',
    replaces: {
      'bcps-marcomm-launch-plan': 'plan',
      'bcps-platform-ownership-migration': 'overview',
      'google-governance-plan': 'analytics',
    },
  },
}

export function restrictedGuideForDoc(slug: string): { guide: RestrictedGuideMeta; tab: string } | null {
  if (RESTRICTED_GUIDES[slug]) return { guide: RESTRICTED_GUIDES[slug], tab: 'overview' }
  for (const guide of Object.values(RESTRICTED_GUIDES)) {
    if (guide.replaces[slug]) return { guide, tab: guide.replaces[slug] }
  }
  return null
}
