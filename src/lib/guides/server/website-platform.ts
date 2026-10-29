import 'server-only'
import type { GuideDef } from '../types'

// The Website & Platform guide (Sean, 2026-10-30): the Launch Plan, the
// Platform Ownership Migration and the Google Governance Plan in one place,
// for their readers only. Content in progress.
export const WEBSITE_PLATFORM_GUIDE: GuideDef = {
  slug: 'website-platform',
  eyebrow: 'BCPS MarComm',
  title: 'Website & Platform',
  audience: 'District web and platform leadership',
  updated: '2026-10-30',
  cadence: 'updated as decisions are made',
  replaces: {
    'bcps-marcomm-launch-plan': 'plan',
    'bcps-platform-ownership-migration': 'overview',
    'google-governance-plan': 'analytics',
  },
  overview: [],
  tabs: [],
  changes: [],
}
