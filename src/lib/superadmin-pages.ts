import type { PageId } from './types'

// Single source of truth for which pages are gated to the superadmin role
// on the client: nav visibility (Sidebar), route rendering (page.tsx), and
// the "you shouldn't be here" redirect guard + view-as bounce (BCPSShell).
//
// Before 2026-09-18 each of those three kept its own copy of this list, and
// they drifted - BCPSShell's copy never picked up 'roster'/'wcm-roster' when
// those pages were added elsewhere, so a real superadmin got bounced to the
// dashboard on click. Any new superadmin-only PageId gets added here once,
// not per file.
//
// 'roster' (the standalone "The Roster" BCC tool) and 'wcm-roster' both left
// this list on 2026-09-18: 'roster' was retired outright, its BCC-selection
// feature folded into the WCM Roster page instead, and 'wcm-roster' opened
// to every district user - the roster itself is read-only for them, and the
// page's own !readOnly check (driven by requireBcpsAdmin) still gates the
// actual admin actions (approve/reject/edit/delete).
//
// This is deliberately narrower than server-side "who gets which acl_objects
// row" logic (see api/bcps/my-access's SUPERADMIN_ONLY) - that list decides
// the admin-vs-superadmin split for acl-registered pages and has its own
// history; conflating the two would silently change what admin-tier users
// (e.g. Felicia Hicks) can already reach.
export const SUPERADMIN_PAGES: readonly PageId[] = [
  'superadmin',
  'permissions',
  'analytics',
  'marcomm',
  'graphics',
  'reports',
  'pulse-approvals',
  'registrations',
]

export const SUPERADMIN_PAGES_SET: ReadonlySet<PageId> = new Set(SUPERADMIN_PAGES)
