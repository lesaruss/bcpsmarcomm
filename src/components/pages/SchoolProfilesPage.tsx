'use client'

// School Profiles - step one of the per-school profile model (see
// SchoolProfile.tsx for the full history/rationale). Lives under "Web
// Content Managers" next to Banner Submissions since it's District Web Team
// only for now; a school-facing tier is a later, separate rollout.

import SchoolProfile from '@/components/bcps/SchoolProfile'

export default function SchoolProfilesPage() {
  return (
    <div style={{ padding: 32, width: '100%', fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>
        School Profiles
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
        Every school&apos;s automated record in one place, starting with banner submission history. Records are archived,
        never deleted, and test runs stay on the record so they can&apos;t be quietly removed. District Web Team only.
      </p>
      <SchoolProfile />
    </div>
  )
}
