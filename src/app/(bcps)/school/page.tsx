'use client'

// School Profile page (Sean + Vanessa Deslandes, 2026-10-23): /school?loc=<n>,
// opened from a Schools tile the way /department?id= opens from a Departments
// tile. It shows under the dashboard tab bar, like every other page.

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import SchoolProfileView from '@/components/bcps/SchoolProfileView'
import UnderDashboardTabs from '@/components/UnderDashboardTabs'

function SchoolContent() {
  const loc = useSearchParams().get('loc') || ''
  if (!loc) return <div style={{ padding: 48, textAlign: 'center', color: '#767676', fontSize: 13 }}>No school was named. <a href="/?page=dashboard&tab=schools" style={{ color: '#1672A7' }}>Return to schools</a></div>
  return <SchoolProfileView key={loc} loc={loc} />
}

export default function SchoolPage() {
  return (
    <Suspense fallback={null}>
      <UnderDashboardTabs><SchoolContent /></UnderDashboardTabs>
    </Suspense>
  )
}
