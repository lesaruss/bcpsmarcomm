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
  group: 'Work' | 'Websites' | 'Notes & files' | 'People' | 'Learn' | 'SuperAdmin'
  page?: PageId
  href?: string
  gate: PageId
  // Key into the left menu's icon set (Sidebar Icons); defaults to page/gate.
  icon?: string
  superadmin?: boolean
}

export const TOOLS: Tool[] = [
  { label: 'Web Team Assignments', desc: 'Every project, who leads it, and its notes.', group: 'Work', page: 'bcps-assignments', gate: 'bcps-assignments' },
  { label: 'MarComm Assignments', desc: 'Office of Communications requests, who owns them, and their notes.', group: 'Work', page: 'marcomm-assignments', gate: 'marcomm-assignments' },
  { label: 'Request MarComm Support', desc: 'Ask the Office of Communications for design, social, video, press and more.', group: 'Work', href: '/marcomm-request', gate: 'profile', icon: 'marcomm' },
  { label: 'Queue', desc: 'Requests waiting on the team.', group: 'Work', page: 'queue', gate: 'queue' },
  { label: 'Task Tracker', desc: 'Community Relations tasks.', group: 'Work', page: 'community-relations', gate: 'community-relations' },
  { label: 'Banner Submissions', desc: 'Review WCM banners for school sites.', group: 'Work', page: 'banner-submissions', gate: 'banner-submissions' },
  { label: 'Proud Points', desc: 'Review school homepage Proud Points.', group: 'Work', page: 'proud-points', gate: 'proud-points', icon: 'banner-submissions' },
  { label: 'Members', desc: 'Everyone with a BCPS MarComm account.', group: 'People', page: 'members', gate: 'members' },
  { label: 'WCM Roster', desc: 'Who manages each department site.', group: 'People', page: 'wcm-roster', gate: 'wcm-roster' },

  { label: 'Meeting Notes', desc: 'Recaps from every meeting.', group: 'Notes & files', page: 'notes', gate: 'notes' },
  { label: 'Documents', desc: 'Shared files and templates.', group: 'Notes & files', page: 'documents', gate: 'documents' },
  { label: 'Minutes', desc: 'Formal meeting minutes.', group: 'Notes & files', page: 'minutes', gate: 'minutes' },
  { label: 'Minibase', desc: 'Turn a spreadsheet into a searchable directory.', group: 'Notes & files', page: 'minibase', gate: 'minibase' },
  { label: 'Widgets', desc: 'Directories and tools built for departments.', group: 'Notes & files', page: 'widgets', gate: 'widgets' },
  { label: 'Newsroom', desc: 'The MarComm console.', group: 'Work', page: 'marcomm', gate: 'marcomm', superadmin: true },
  { label: 'Graphics & Printing', desc: 'Graphics and print requests.', group: 'Work', page: 'graphics', gate: 'graphics', superadmin: true },

  { label: 'Departments', desc: 'Every department site and its status.', group: 'Websites', page: 'departments', gate: 'departments' },
  { label: 'Analytics', desc: 'Visitors and top pages from Google Analytics.', group: 'Websites', page: 'analytics', gate: 'analytics' },
  { label: 'School Profiles', desc: 'Each school site and its WCM.', group: 'Websites', page: 'school-profiles', gate: 'school-profiles' },
  { label: 'Department Name Audit', desc: 'Department names checked against the website.', group: 'Websites', page: 'department-audit', gate: 'department-audit' },
  { label: 'Google Governance', desc: 'Google account and site governance.', group: 'Websites', page: 'bcps-google-governance', gate: 'bcps-google-governance' },
  { label: 'Website Governance Plan', desc: 'The district website governance plan.', group: 'Websites', href: '/briefs/bcps-website-governance-plan-2026-06-10', gate: 'bcps-google-governance' },

  { label: 'ADA Scanner', desc: 'Scan a page for accessibility issues.', group: 'Websites', page: 'ada-scanner', gate: 'ada-scanner' },
  { label: 'ADA Manager', desc: 'Full-site school scans and issue detail.', group: 'Websites', page: 'ada-manager', gate: 'ada-manager' },

  { label: 'Department Certification', desc: 'The Department WCM Certification course.', group: 'Learn', page: 'bcps-certification', gate: 'bcps-certification' },
  { label: 'Department WCM Guide', desc: 'Everything for department WCMs, step by step.', group: 'Learn', href: '/?page=dashboard&tab=documents&doc=wcm-department', gate: 'wcm' },
  { label: 'Director Guide', desc: 'Everything for directors, step by step.', group: 'Learn', href: '/?page=dashboard&tab=documents&doc=director-department', gate: 'wcm' },

  { label: 'My Profile', desc: 'Your name, photo and contact details.', group: 'People', page: 'profile', gate: 'profile' },
  { label: 'My Records', desc: 'Your employee records.', group: 'People', page: 'employee-records', gate: 'employee-records' },

  { label: 'Platform Management', desc: 'Accounts, View as access and platform settings.', group: 'SuperAdmin', page: 'superadmin', gate: 'superadmin', superadmin: true },
  { label: 'Permissions', desc: 'Who can open what.', group: 'SuperAdmin', page: 'permissions', gate: 'permissions', superadmin: true },
  { label: 'Note Approvals', desc: 'Notes waiting to publish.', group: 'SuperAdmin', page: 'pulse-approvals', gate: 'pulse-approvals', superadmin: true },
  { label: 'Registrations', desc: 'New sign-ups waiting on approval.', group: 'SuperAdmin', page: 'registrations', gate: 'registrations', superadmin: true },
  { label: 'Reports', desc: 'Program reports and exports.', group: 'SuperAdmin', page: 'reports', gate: 'reports', superadmin: true },
]

// My Resources groups (Sean, 2026-10-23: fewer categories that make sense
// for what's on the page). Was Daily work, Content, Websites, Accessibility,
// WCM program and Me; Hot Labs, guides and Ask now sit under Learn.
export const TOOL_GROUPS: Tool['group'][] = ['Work', 'Websites', 'Notes & files', 'People', 'Learn', 'SuperAdmin']

// The tiles each view opens with (Sean approved, mock v3; Widgets added Oct 1).
// Director, WCM and member lists added when the left menu was retired
// (Sean, 2026-10-02), so every role reaches every tool it has from the
// dashboard. A tile only shows when that person can open the tool.
export const TOP_TOOLS: Record<'superadmin' | 'comms' | 'appsvc' | 'director' | 'wcm' | 'member', string[]> = {
  // Widgets lives here as a tile rather than its own tab (Sean, 2026-10-01).
  superadmin: ['Web Team Assignments', 'Banner Submissions', 'Proud Points', 'WCM Roster', 'Documents', 'Meeting Notes', 'Widgets', 'Permissions'],
  comms: ['Web Team Assignments', 'Banner Submissions', 'Proud Points', 'Departments', 'WCM Roster', 'Documents', 'Meeting Notes', 'Widgets'],
  appsvc: ['Web Team Assignments', 'ADA Scanner', 'ADA Manager', 'School Profiles', 'Banner Submissions', 'Proud Points', 'Documents', 'Widgets'],
  director: ['Request MarComm Support', 'Director Guide', 'WCM Roster', 'Meeting Notes', 'Documents', 'Department Certification', 'My Profile'],
  wcm: ['Department Certification', 'Request MarComm Support', 'Department WCM Guide', 'ADA Scanner', 'Documents', 'Meeting Notes', 'My Profile'],
  member: ['Department Certification', 'Department WCM Guide', 'Director Guide', 'Documents', 'WCM Roster', 'My Profile'],
}
