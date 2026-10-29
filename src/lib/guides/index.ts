import type { GuideDef } from './types'
import { WCM_DEPARTMENT_GUIDE } from './wcm-department'
import { MARCOMM_TEAM_GUIDE } from './marcomm-team'
import { DIRECTOR_DEPARTMENT_GUIDE } from './director-department'
import { RESTRICTED_GUIDES } from './restricted'

// Every guide, by the document slug it stands in for. Opening that slug, or
// one of the documents it replaces, in the dashboard opens the guide.
export const GUIDES: Record<string, GuideDef> = {
  [WCM_DEPARTMENT_GUIDE.slug]: WCM_DEPARTMENT_GUIDE,
  [MARCOMM_TEAM_GUIDE.slug]: MARCOMM_TEAM_GUIDE,
  [DIRECTOR_DEPARTMENT_GUIDE.slug]: DIRECTOR_DEPARTMENT_GUIDE,
}

export function guideForDoc(slug: string): { guide: GuideDef; tab: string } | null {
  if (GUIDES[slug]) return { guide: GUIDES[slug], tab: 'overview' }
  for (const guide of Object.values(GUIDES)) {
    if (guide.replaces[slug]) return { guide, tab: guide.replaces[slug] }
  }
  return null
}

// Documents a guide replaced, left out of the Documents list so each topic
// has one home. Their addresses still work and open the guide.
export const REPLACED_DOCS = new Set([
  ...Object.values(GUIDES).flatMap((g) => Object.keys(g.replaces)),
  ...Object.values(RESTRICTED_GUIDES).flatMap((g) => Object.keys(g.replaces)),
])
