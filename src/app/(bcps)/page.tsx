'use client'

import { useState, useCallback, useEffect, Suspense } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { PageId, NavState, BreadcrumbItem } from '@/lib/types'
import { useBCPSShell } from '@/components/BCPSShell'
import NotesPage from '@/components/pages/NotesPage'
import ProfilePage from '@/components/pages/ProfilePage'
import DepartmentsPage from '@/components/pages/DepartmentsPage'
import AnalyticsPage from '@/components/pages/AnalyticsPage'
import DocumentsPage from '@/components/pages/DocumentsPage'
import PermissionsPanel from '@/components/pages/PermissionsPanel'
import SuperAdminPage from '@/components/pages/SuperAdminPage'
import CartridgePage from '@/components/pages/CartridgePage'
import { WcmRosterStandalonePage } from '@/components/pages/WCMPage'
import HomePage from '@/components/pages/HomePage'
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
import WidgetsPage from '@/components/pages/WidgetsPage'
import DirectoryPage from '@/components/pages/DirectoryPage'
import AdaScannerPage from '@/components/pages/AdaScannerPage'
import ADAManagerPage from '@/components/pages/ADAManagerPage'
import RegistrationsPage from '@/components/pages/RegistrationsPage'
import BannerSubmissionsPage from '@/components/pages/BannerSubmissionsPage'
import ProudPointsPage from '@/components/pages/ProudPointsPage'
import MySubmissionsPage from '@/components/pages/MySubmissionsPage'
import MessagesPage from '@/components/pages/MessagesPage'
import SchoolProfilesPage from '@/components/pages/SchoolProfilesPage'
import CertFollowupPage from '@/components/pages/CertFollowupPage'
import { SAMPLE_SUPERADMIN_ID, type UserRole } from '@/components/Sidebar'
import { SUPERADMIN_PAGES_SET as SUPERADMIN_PAGES } from '@/lib/superadmin-pages'
import { MARCOMM_PATH } from '@/lib/types'

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { role, viewAs, canManageMessages } = useBCPSShell()
  // The fictitious Superadmin sample identity previews the real superadmin
  // experience instead of collapsing to 'user' like every other viewAs pick.
  const effectiveRole: UserRole = viewAs ? (viewAs.id === SAMPLE_SUPERADMIN_ID ? 'superadmin' : 'user') : role

  // MarComm Assignments lives at its own address, /marcomm-assignments.
  const urlPage = pathname === MARCOMM_PATH ? 'marcomm-assignments' : (searchParams.get('page') as PageId) || 'dashboard'
  const urlSub = searchParams.get('dept') || undefined

  const [nav, setNav] = useState<NavState>({ page: urlPage, subPage: urlSub })
  const [toast, setToast] = useState<string | null>(null)

  // Sync nav with URL (handles sidebar clicks routed through BCPSShell + deep links)
  useEffect(() => {
    setNav(prev => (prev.page === urlPage && prev.subPage === urlSub && !prev.breadcrumb) ? prev : { page: urlPage, subPage: urlSub })
  }, [urlPage, urlSub])

  // If viewAs switches to a non-superadmin view, bounce off superadmin pages.
  // Exempt the Superadmin sample identity - it's meant to preview those pages.
  useEffect(() => {
    if (viewAs && viewAs.id !== SAMPLE_SUPERADMIN_ID && SUPERADMIN_PAGES.has(nav.page)) {
      setNav({ page: 'dashboard' })
      router.push('/?page=dashboard', { scroll: false })
    }
  }, [viewAs, nav.page, router])

  const navigate = useCallback((page: PageId, breadcrumb?: BreadcrumbItem, subPage?: string) => {
    if (effectiveRole !== 'superadmin' && SUPERADMIN_PAGES.has(page)) return
    setNav({ page, breadcrumb, subPage })
    window.scrollTo(0, 0)
    // Keep URL in sync so BCPSShell Topbar title stays current
    if (!breadcrumb) {
      router.push(page === 'marcomm-assignments' ? MARCOMM_PATH : `/?page=${page}`, { scroll: false })
    }
  }, [effectiveRole, router])

  // The WCM Community Hub merged into the dashboard (Sean, 2026-10-01): the
  // old ?page=wcm address forwards there so existing links keep working.
  useEffect(() => {
    if (nav.page === 'wcm') {
      setNav({ page: 'dashboard' })
      router.replace('/?page=dashboard', { scroll: false })
    }
  }, [nav.page, router])

  // School WCMs used to land on Banner Submissions (2026-10-05). Since
  // 2026-10-23 (Sean + Vanessa Deslandes) their dashboard is their school's
  // profile, with banners and Proud Points on it, so they land there.

  // Old /?page=marcomm-assignments links move to the page's own address.
  useEffect(() => {
    if (searchParams.get('page') === 'marcomm-assignments') {
      const row = searchParams.get('row')
      router.replace(row ? `${MARCOMM_PATH}?row=${encodeURIComponent(row)}` : MARCOMM_PATH, { scroll: false })
    }
  }, [searchParams, router])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  const isDashboard = nav.page === 'dashboard' || nav.page === 'marcomm-assignments'
  const pageEl = isDashboard ? null : (
    <>
      {nav.page === 'notes'                  && <NotesPage />}
      {nav.page === 'profile'                && <ProfilePage subPage={nav.subPage} onNavigate={navigate} />}
      {nav.page === 'departments'            && <DepartmentsPage subPage={nav.subPage} onNavigate={navigate} />}
      {/* Analytics renders for anyone the engine lets onto the page (acl grants,
          BCPSShell bounces the rest); only a superadmin may trigger a GA4 sync and
          only admins may add campaigns (canManageMessages is the raw admin-or-superadmin
          role; UserRole has no admin tier), matching the routes (2026-09-23). */}
      {nav.page === 'analytics'              && <AnalyticsPage onShowToast={showToast} canSync={effectiveRole === 'superadmin'} canManageCampaigns={effectiveRole === 'superadmin' || (!viewAs && canManageMessages)} />}
      {nav.page === 'documents'             && <DocumentsPage />}
      {nav.page === 'permissions'             && effectiveRole === 'superadmin' && <PermissionsPanel />}
      {nav.page === 'superadmin'             && effectiveRole === 'superadmin' && <SuperAdminPage onShowToast={showToast} />}
      {nav.page === 'marcomm'                && effectiveRole === 'superadmin' && <CartridgePage title="MarComm Console" description="Manage marketing and communications assets, campaigns, and approvals." />}
      {nav.page === 'graphics'               && effectiveRole === 'superadmin' && <GraphicsPage />}
      {nav.page === 'minutes'                && <MinutesPage />}
      {nav.page === 'wcm-roster'              && <WcmRosterStandalonePage />}
      {nav.page === 'queue'                  && <QueuePage onNavigate={navigate} onShowToast={showToast} viewAsUserId={viewAs?.id} />}
      {nav.page === 'bcps-google-governance' && <BCPSGovernancePage />}
      {nav.page === 'bcps-assignments'       && <AssignmentsPage />}
      {nav.page === 'employee-records'         && <EmployeeRecordsPage />}
      {nav.page === 'reports'                  && effectiveRole === 'superadmin' && <ReportsPage />}
      {nav.page === 'cert-followup'            && effectiveRole === 'superadmin' && <CertFollowupPage onShowToast={showToast} />}
      {nav.page === 'bcps-certification'       && <CertificationPage />}
      {nav.page === 'members'                  && <MembersPage />}
      {nav.page === 'community-relations'      && <CommunityRelationsPage />}
      {nav.page === 'minibase'                   && <MinibsePage />}
      {nav.page === 'pulse-approvals'          && effectiveRole === 'superadmin' && <NoteApprovalsPage />}
      {nav.page === 'department-audit'        && <DepartmentAuditPage />}
      {nav.page === 'find-it-fast'            && <FindItFastPage />}
      {nav.page === 'widgets'                 && <WidgetsPage />}
      {nav.page === 'directory'               && <DirectoryPage />}
      {nav.page === 'ada-scanner'              && <AdaScannerPage />}
      {nav.page === 'ada-manager'              && <ADAManagerPage />}
      {nav.page === 'registrations'            && effectiveRole === 'superadmin' && <RegistrationsPage />}
      {nav.page === 'banner-submissions'       && <BannerSubmissionsPage />}
      {nav.page === 'proud-points'             && <ProudPointsPage />}
      {nav.page === 'my-submissions'           && <MySubmissionsPage />}
      {nav.page === 'messages'                 && <MessagesPage />}
      {nav.page === 'school-profiles'          && <SchoolProfilesPage />}
    </>
  )

  return (
    <div className="page-content">
      {/* Every page opens under the dashboard tab bar, so the menu is always
          on screen (Sean, 2026-10-20). One HomePage instance either way, so
          moving between a page and a tab does not reload the dashboard. */}
      <HomePage onNavigate={navigate} viewAsUserId={viewAs?.id} onShowToast={showToast} page={pageEl} />

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

