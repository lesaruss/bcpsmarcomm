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
  // Broward Powered by AI (Sean, 2026-11-03): the site entry and the Progress
  // Tracker in one guide. Readers are the four groups that held those two
  // entries (District Web Team, Leadership View, Office of Communications,
  // Web Content Management). The two meeting briefs keep their own reader
  // lists and stay Reference links.
  'broward-powered-by-ai': {
    slug: 'broward-powered-by-ai',
    title: 'Broward Powered by AI',
    audience: 'the District web, communications and leadership teams working on browardschools.ai',
    cadence: 'refreshed as the tracker changes',
    replaces: {
      'bcps-powered-by-ai-site': 'site',
      'bcps-ai-progress-tracker': 'happened',
    },
  },
  // Department guides (Sean, 2026-11-03): one guide per department that is the
  // department's home on bcpsmarcomm.com, with its widgets, its website page and
  // its audit, for whoever on the team has been given the guide (not only a
  // Web Content Manager or director). Early Childhood Education is the first;
  // the format is locked after Sean reviews it, then repeated for other
  // departments, starting with the ones that have widgets. Readers are named by
  // grants on the guide's acl_objects row, so a department adds a person without
  // a deploy.
  'early-childhood-education': {
    slug: 'early-childhood-education',
    title: 'Early Childhood Education Guide',
    audience: 'the Early Childhood Education team',
    cadence: 'updated whenever your tools change',
    replaces: {},
  },
  // Instructional Innovation and Digital Learning (Sean, 2026-11-03): the second
  // department guide, same format as early-childhood-education. Readers are the
  // department group; content is in bcps_guides, never here.
  'instructional-innovation-digital-learning': {
    slug: 'instructional-innovation-digital-learning',
    title: 'Instructional Innovation and Digital Learning Guide',
    audience: 'the Instructional Innovation and Digital Learning team',
    cadence: 'updated whenever your tools change',
    replaces: {},
  },
  // District Web Team Guide (Sean, 2026-11-03): what the team has in
  // development and coming, for departments and for schools. Readers are the
  // District Web Team group, plus Charlene A. Collins and Luis A. Morales, who
  // Sean said get the same view as Farrah Wilson. It replaces nothing: the
  // older documents stay where they are and are linked under Reference.
  // Google Account Access (Sean, 2026-11-05): how people get into the shared
  // BCPS Google account's tools (Analytics, Tag Manager, YouTube, Drive, the
  // inbox) with their own Broward sign-in, so two-step verification stays on
  // and nobody has to call for a code. Click-through steps in place of the
  // bcps-google-account-security playbook. Sean runs it himself first; readers
  // are added by grants on its acl_objects row. Content is in bcps_guides.
  'google-account-access': {
    slug: 'google-account-access',
    title: 'Google Account Access',
    audience: 'everyone who works in the shared BCPS Google account',
    cadence: 'updated whenever the steps change',
    replaces: {},
  },
  'district-web-team': {
    slug: 'district-web-team',
    title: 'District Web Team Guide',
    audience: 'the District Web Team and the leaders who follow its work',
    cadence: 'updated before each Wednesday huddle',
    replaces: {},
  },
}

export function restrictedGuideForDoc(slug: string): { guide: RestrictedGuideMeta; tab: string } | null {
  if (RESTRICTED_GUIDES[slug]) return { guide: RESTRICTED_GUIDES[slug], tab: 'overview' }
  for (const guide of Object.values(RESTRICTED_GUIDES)) {
    if (guide.replaces[slug]) return { guide, tab: guide.replaces[slug] }
  }
  return null
}
