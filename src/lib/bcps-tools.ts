import type { PageId } from './types'

// Every tool in the left menu (src/components/Sidebar.tsx SECTIONS), for the
// dashboard's Tools tab (Sean, 2026-10-01, mock v3). Each person sees six
// big tiles for the tools their role uses most, a search box, and the full
// list folded away, so nothing from the menu is lost and nothing is shown
// all at once. A tool is listed only when it opens for that person: `gate`
// is the page id whose access decides it, the same rule the menu uses.
// Keep this in step with the menu when a tool is added or removed.

export interface Tool {
  label: string
  desc: string
  group: 'Daily work' | 'Content' | 'Websites' | 'Accessibility' | 'WCM program' | 'Me' | 'SuperAdmin'
  page?: PageId
  href?: string
  gate: PageId
  // Key into the left menu's icon set (Sidebar Icons); defaults to page/gate.
  icon?: string
  superadmin?: boolean
}

export const TOOLS: Tool[] = [
  { label: 'Web Team Assignments', desc: 'Every project, who leads it, and its notes.', group: 'Daily work', page: 'bcps-assignments', gate: 'bcps-assignments' },
  { label: 'Queue', desc: 'Requests waiting on the team.', group: 'Daily work', page: 'queue', gate: 'queue' },
  { label: 'Task Tracker', desc: 'Community Relations tasks.', group: 'Daily work', page: 'community-relations', gate: 'community-relations' },
  { label: 'Banner Submissions', desc: 'Review WCM banners for school sites.', group: 'Daily work', page: 'banner-submissions', gate: 'banner-submissions' },
  { label: 'Proud Points', desc: 'Review school homepage Proud Points.', group: 'Daily work', page: 'proud-points', gate: 'proud-points', icon: 'banner-submissions' },
  { label: 'Members', desc: 'Everyone with a BCPS MarComm account.', group: 'Daily work', page: 'members', gate: 'members' },
  { label: 'WCM Roster', desc: 'Who manages each department site.', group: 'Daily work', page: 'wcm-roster', gate: 'wcm-roster' },

  { label: 'Meeting Notes', desc: 'Recaps from every meeting.', group: 'Content', page: 'notes', gate: 'notes' },
  { label: 'Documents', desc: 'Shared files and templates.', group: 'Content', page: 'documents', gate: 'documents' },
  { label: 'Minutes', desc: 'Formal meeting minutes.', group: 'Content', page: 'minutes', gate: 'minutes' },
  { label: 'Minibase', desc: 'Turn a spreadsheet into a searchable directory.', group: 'Content', page: 'minibase', gate: 'minibase' },
  { label: 'Widgets', desc: 'Directories and tools built for departments.', group: 'Content', page: 'widgets', gate: 'widgets' },
  { label: 'Newsroom', desc: 'The MarComm console.', group: 'Content', page: 'marcomm', gate: 'marcomm', superadmin: true },
  { label: 'Graphics & Printing', desc: 'Graphics and print requests.', group: 'Content', page: 'graphics', gate: 'graphics', superadmin: true },

  { label: 'Departments', desc: 'Every department site and its status.', group: 'Websites', page: 'departments', gate: 'departments' },
  { label: 'Analytics', desc: 'Visitors and top pages from Google Analytics.', group: 'Websites', page: 'analytics', gate: 'analytics' },
  { label: 'School Profiles', desc: 'Each school site and its WCM.', group: 'Websites', page: 'school-profiles', gate: 'school-profiles' },
  { label: 'Department Name Audit', desc: 'Department names checked against the website.', group: 'Websites', page: 'department-audit', gate: 'department-audit' },
  { label: 'Google Governance', desc: 'Google account and site governance.', group: 'Websites', page: 'bcps-google-governance', gate: 'bcps-google-governance' },
  { label: 'Website Governance Plan', desc: 'The district website governance plan.', group: 'Websites', href: '/briefs/bcps-website-governance-plan-2026-06-10', gate: 'bcps-google-governance' },

  { label: 'ADA Scanner', desc: 'Scan a page for accessibility issues.', group: 'Accessibility', page: 'ada-scanner', gate: 'ada-scanner' },
  { label: 'ADA Manager', desc: 'Full-site school scans and issue detail.', group: 'Accessibility', page: 'ada-manager', gate: 'ada-manager' },

  { label: 'Department Certification', desc: 'The Department WCM Certification course.', group: 'WCM program', page: 'bcps-certification', gate: 'bcps-certification' },
  { label: 'Department WCM Playbook', desc: 'Everything current for department WCMs.', group: 'WCM program', href: '/playbooks/wcm-department', gate: 'wcm' },
  { label: 'Director Playbook', desc: 'Every update for directors.', group: 'WCM program', href: '/playbooks/director-department', gate: 'wcm' },
  { label: 'Registration: Getting Started', desc: 'How WCMs register for the program.', group: 'WCM program', href: '/playbooks/bcps-wcm-registration-2026-27', gate: 'wcm' },

  { label: 'My Profile', desc: 'Your name, photo and contact details.', group: 'Me', page: 'profile', gate: 'profile' },
  { label: 'My Records', desc: 'Your employee records.', group: 'Me', page: 'employee-records', gate: 'employee-records' },

  { label: 'Platform Management', desc: 'Accounts, View as access and platform settings.', group: 'SuperAdmin', page: 'superadmin', gate: 'superadmin', superadmin: true },
  { label: 'Permissions', desc: 'Who can open what.', group: 'SuperAdmin', page: 'permissions', gate: 'permissions', superadmin: true },
  { label: 'Note Approvals', desc: 'Notes waiting to publish.', group: 'SuperAdmin', page: 'pulse-approvals', gate: 'pulse-approvals', superadmin: true },
  { label: 'Registrations', desc: 'New sign-ups waiting on approval.', group: 'SuperAdmin', page: 'registrations', gate: 'registrations', superadmin: true },
  { label: 'Reports', desc: 'Program reports and exports.', group: 'SuperAdmin', page: 'reports', gate: 'reports', superadmin: true },
]

export const TOOL_GROUPS: Tool['group'][] = ['Daily work', 'Content', 'Websites', 'Accessibility', 'WCM program', 'Me', 'SuperAdmin']

// The tiles each view opens with (Sean approved, mock v3; Widgets added Oct 1).
// Director, WCM and member lists added when the left menu was retired
// (Sean, 2026-10-02), so every role reaches every tool it has from the
// dashboard. A tile only shows when that person can open the tool.
export const TOP_TOOLS: Record<'superadmin' | 'comms' | 'appsvc' | 'director' | 'wcm' | 'member', string[]> = {
  // Widgets lives here as a tile rather than its own tab (Sean, 2026-10-01).
  superadmin: ['Web Team Assignments', 'Banner Submissions', 'Proud Points', 'WCM Roster', 'Documents', 'Meeting Notes', 'Widgets', 'Permissions'],
  comms: ['Web Team Assignments', 'Banner Submissions', 'Departments', 'WCM Roster', 'Documents', 'Meeting Notes', 'Widgets'],
  appsvc: ['Web Team Assignments', 'ADA Scanner', 'ADA Manager', 'School Profiles', 'Banner Submissions', 'Proud Points', 'Documents', 'Widgets'],
  director: ['Director Playbook', 'WCM Roster', 'Meeting Notes', 'Documents', 'Department Certification', 'My Profile'],
  wcm: ['Department Certification', 'Department WCM Playbook', 'ADA Scanner', 'Documents', 'Meeting Notes', 'My Profile'],
  member: ['Department Certification', 'Registration: Getting Started', 'Director Playbook', 'Documents', 'WCM Roster', 'My Profile'],
}
