'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PageId, NavState, BreadcrumbItem } from '@/lib/types'
import { useBCPSShell } from '@/components/BCPSShell'
import DashboardPage from '@/components/pages/DashboardPage'
import NotesPage from '@/components/pages/NotesPage'
import ProfilePage from '@/components/pages/ProfilePage'
import DepartmentsPage from '@/components/pages/DepartmentsPage'
import AnalyticsPage from '@/components/pages/AnalyticsPage'
import DocumentsPage from '@/components/pages/DocumentsPage'
import PermissionsPanel from '@/components/pages/PermissionsPanel'
import SuperAdminPage from '@/components/pages/SuperAdminPage'
import CartridgePage from '@/components/pages/CartridgePage'
import WCMPage from '@/components/pages/WCMPage'
import MinutesPage from '@/components/pages/MinutesPage'
import QueuePage from '@/components/pages/QueuePage'
import BCPSGovernancePage from '@/components/pages/BCPSGovernancePage'
import AssignmentsPage from '@/components/pages/AssignmentsPage'
import CertificationPage from '@/components/pages/CertificationPage'
import EmployeeRecordsPage from '@/components/pages/EmployeeRecordsPage'
import GraphicsPage from '@/components/pages/GraphicsPage'
import ReportsPage from '@/components/pages/ReportsPage'
import MembersPage from '@/components/pages/MembersPage'
import CommunityRelationsPage from '@/components/pages/CommunityRelationsPage'
import MinibsePage from '@/components/pages/MinibsePage'
import NoteApprovalsPage from '@/components/pages/NoteApprovalsPage'
import DepartmentAuditPage from '@/components/pages/DepartmentAuditPage'
import FindItFastPage from '@/components/pages/FindItFastPage'
import type { UserRole } from '@/components/Sidebar'

const SUPERADMIN_PAGES = new Set<PageId>(['superadmin', 'analytics', 'marcomm', 'graphics', 'reports', 'pulse-approvals'])

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { role, viewAs } = useBCPSShell()
  const effectiveRole: UserRole = viewAs ? 'user' : role

  const urlPage = (searchParams.get('page') as PageId) || 'dashboard'
  const urlSub = searchParams.get('dept') || undefined

  const [nav, setNav] = useState<NavState>({ page: urlPage, subPage: urlSub })
  const [toast, setToast] = useState<string | null>(null)

  // Sync nav with URL (handles sidebar clicks routed through BCPSShell + deep links)
  useEffect(() => {
    setNav(prev => (prev.page === urlPage && prev.subPage === urlSub && !prev.breadcrumb) ? prev : { page: urlPage, subPage: urlSub })
  }, [urlPage, urlSub])

  // If viewAs switches to a non-superadmin view, bounce off superadmin pages
  useEffect(() => {
    if (viewAs && SUPERADMIN_PAGES.has(nav.page)) {
      setNav({ page: 'dashboard' })
      router.push('/bcps?page=dashboard', { scroll: false })
    }
  }, [viewAs, nav.page, router])

  const navigate = useCallback((page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => {
    if (effectiveRole !== 'superadmin' && SUPERADMIN_PAGES.has(page)) return
    setNav({ page, breadcrumb, subPage })
    window.scrollTo(0, 0)
    // Keep URL in sync so BCPSShell Topbar title stays current
    if (!breadcrumb) {
      router.push(`/bcps?page=${page}`, { scroll: false })
    }
  }, [effectiveRole, router])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  return (
    <div className="page-content">
      {nav.page === 'dashboard'              && <DashboardPage onNavigate={navigate} viewAsUserId={viewAs?.id} />}
      {nav.page === 'notes'                  && <NotesPage />}
      {nav.page === 'profile'                && <ProfilePage subPage={nav.subPage} onNavigate={navigate} />}
      {nav.page === 'departments'            && <DepartmentsPage subPage={nav.subPage} onNavigate={navigate} />}
      {nav.page === 'analytics'              && effectiveRole === 'superadmin' && <AnalyticsPage onShowToast={showToast} />}
      {nav.page === 'documents'             && <DocumentsPage />}
      {nav.page === 'permissions'             && effectiveRole === 'superadmin' && <PermissionsPanel />}
      {nav.page === 'superadmin'             && effectiveRole === 'superadmin' && <SuperAdminPage onShowToast={showToast} />}
      {nav.page === 'marcomm'                && effectiveRole === 'superadmin' && <CartridgePage title="MarComm Console" description="Manage marketing and communications assets, campaigns, and approvals." />}
      {nav.page === 'graphics'               && effectiveRole === 'superadmin' && <GraphicsPage />}
      {nav.page === 'minutes'                && <MinutesPage />}
      {nav.page === 'wcm'                    && effectiveRole === 'superadmin' && <WCMPage />}
      {nav.page === 'queue'                  && <QueuePage onNavigate={navigate} onShowToast={showToast} viewAsUserId={viewAs?.id} />}
      {nav.page === 'bcps-google-governance' && <BCPSGovernancePage />}
      {nav.page === 'bcps-assignments'       && <AssignmentsPage />}
      {nav.page === 'employee-records'         && <EmployeeRecordsPage />}
      {nav.page === 'reports'                  && effectiveRole === 'superadmin' && <ReportsPage />}
      {nav.page === 'bcps-certification'       && <CertificationPage />}
      {nav.page === 'members'                  && <MembersPage />}
      {nav.page === 'community-relations'      && <CommunityRelationsPage />}
      {nav.page === 'minibase'                   && <MinibsePage />}
      {nav.page === 'pulse-approvals'          && effectiveRole === 'superadmin' && <NoteApprovalsPage />}
      {nav.page === 'department-audit'        && <DepartmentAuditPage />}
      {nav.page === 'find-it-fast'            && <FindItFastPage />}

      {toast && <div className="toast toast-show">{toast}</div>}
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  )
}

