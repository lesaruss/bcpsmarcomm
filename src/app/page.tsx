'use client'

import { useState, useCallback } from 'react'
import type { PageId, NavState, BreadcrumbItem } from '@/lib/types'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import DashboardPage from '@/components/pages/DashboardPage'
import NotesPage from '@/components/pages/NotesPage'
import ProfilePage from '@/components/pages/ProfilePage'
import DepartmentsPage from '@/components/pages/DepartmentsPage'
import AnalyticsPage from '@/components/pages/AnalyticsPage'
import SuperAdminPage from '@/components/pages/SuperAdminPage'
import CartridgePage from '@/components/pages/CartridgePage'
import WCMPage from '@/components/pages/WCMPage'
import MinutesPage from '@/components/pages/MinutesPage'
import QueuePage from '@/components/pages/QueuePage'
import BCPSGovernancePage from '@/components/pages/BCPSGovernancePage'

const PAGE_TITLES: Record<PageId, { title: string; sub: string }> = {
  dashboard: { title: 'Mission Control', sub: 'Broward County Public Schools' },
  notes: { title: 'Meeting Notes', sub: 'Team Collaboration' },
  profile: { title: 'My Profile', sub: 'Account & Settings' },
  departments: { title: 'Departments', sub: 'Directory & Profiles' },
  analytics: { title: 'Analytics', sub: 'Performance Insights' },
  superadmin: { title: 'SuperAdmin', sub: 'Platform Management' },
  marcomm: { title: 'MarComm Console', sub: 'Marketing & Communications' },
  graphics: { title: 'Graphics & Printing', sub: 'Request Queue' },
  minutes: { title: 'Minutes Console', sub: 'Meeting Records' },
  wcm: { title: 'WCM Community Hub', sub: 'Web Content Management' },
  queue: { title: 'Queue', sub: 'Marketing & Communications' },
  'bcps-google-governance': { title: 'Google Governance Plan', sub: 'BCPS' },
  'bcps-assignments': { title: 'Web Team Assignments', sub: 'BCPS' },
  'bcps-certification': { title: 'Department Certification', sub: 'WCM Certification Program' },
  'employee-records': { title: 'Employee Records', sub: 'My Documents & Appraisals' },
  reports: { title: 'Reports', sub: 'BCPS Audit Reports' },
  documents: { title: 'Documents', sub: 'BCPS Resource Library' },
  permissions: { title: 'Permissions', sub: 'Roles & Access Control' },
  members: { title: 'Members', sub: 'Team Directory' },
  'community-relations': { title: 'Community Relations Tracker', sub: 'District Community Relations' },
  minibase:                { title: 'Minibase',                    sub: 'Document Library' },
  department:               { title: 'Department Profile',      sub: 'Audit & Analytics' },
  'pulse-approvals':        { title: 'Note Approvals',          sub: 'Pulse Feedback Queue' },
}

export default function Home() {
  const [nav, setNav] = useState<NavState>({ page: 'dashboard' })
  const [toast, setToast] = useState<string | null>(null)

  const navigate = useCallback((page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => {
    setNav({ page, breadcrumb, subPage })
    window.scrollTo(0, 0)
  }, [])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const { title, sub } = PAGE_TITLES[nav.page]

  return (
    <div className="app-shell">
      <Sidebar activePage={nav.page} onNavigate={navigate} />

      <div className="main-area">
        <Topbar
          title={nav.breadcrumb ? PAGE_TITLES[nav.breadcrumb.pageId].title : title}
          sub={nav.breadcrumb ? PAGE_TITLES[nav.breadcrumb.pageId].sub : sub}
          currentPage={nav.page}
          breadcrumb={nav.breadcrumb}
          onNavigate={navigate}
          onShowToast={showToast}
        />

        <div className="page-content">
          {nav.page === 'dashboard' && <DashboardPage onNavigate={navigate} />}
          {nav.page === 'notes' && <NotesPage />}
          {nav.page === 'profile' && <ProfilePage subPage={nav.subPage} onNavigate={navigate} />}
          {nav.page === 'departments' && <DepartmentsPage subPage={nav.subPage} onNavigate={navigate} />}
          {nav.page === 'analytics' && <AnalyticsPage onShowToast={showToast} />}
          {nav.page === 'superadmin' && <SuperAdminPage onShowToast={showToast} />}
          {nav.page === 'marcomm' && <CartridgePage title="MarComm Console" description="Manage marketing and communications assets, campaigns, and approvals." />}
          {nav.page === 'minutes' && <MinutesPage />}
          {nav.page === 'wcm' && <WCMPage />}
          {nav.page === 'queue' && <QueuePage onNavigate={navigate} onShowToast={showToast} />}
          {nav.page === 'bcps-google-governance' && <BCPSGovernancePage />}
        </div>
      </div>

      {toast && (
        <div className="toast toast-show">{toast}</div>
      )}
    </div>
  )
}
