'use client'

import React, { useState, useEffect, useMemo, useCallback, Suspense, createContext, useContext, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar, { type UserRole, type TeamMember } from '@/components/Sidebar'
import PulseWidget from '@/components/PulseWidget'
import type { PageId } from '@/lib/types'

// ── Context (consumed by bcps/page.tsx for role-gated content) ────────────
interface BCPSShellContextValue {
  role: UserRole
  viewAs: TeamMember | null
  canManageMessages: boolean
}
export const BCPSShellContext = createContext<BCPSShellContextValue>({
  role: 'user',
  viewAs: null,
  canManageMessages: false,
})
export function useBCPSShell() { return useContext(BCPSShellContext) }

// ── Constants ─────────────────────────────────────────────────────────────
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])
const SUPERADMIN_PAGES = new Set<PageId>(['superadmin', 'analytics', 'marcomm', 'graphics', 'wcm', 'pulse-approvals'])

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  dashboard:                { title: 'Dashboard',               sub: 'Broward County Public Schools' },
  notes:                    { title: 'Meeting Notes',           sub: 'Briefs & Records' },
  profile:                  { title: 'My Profile',              sub: 'Account & Settings' },
  departments:              { title: 'Departments',             sub: 'Directory & Profiles' },
  analytics:                { title: 'Analytics',               sub: 'Performance Insights' },
  superadmin:               { title: 'Platform Management',      sub: 'SuperAdmin' },
  permissions:              { title: 'Permissions Console',     sub: 'Access & Sharing' },
  members:                  { title: 'Members',                 sub: 'Team Directory' },
  marcomm:                  { title: 'MarComm Console',         sub: 'Marketing & Communications' },
  graphics:                 { title: 'Graphics & Printing',      sub: 'Request Queue' },
  minutes:                  { title: 'Minutes Console',         sub: 'Create Meeting Records' },
  wcm:                      { title: 'WCM Community Hub',       sub: 'Web Content Management' },
  queue:                    { title: 'Queue',                   sub: 'Marketing & Communications' },
  'bcps-google-governance': { title: 'Google Governance Plan',  sub: 'BCPS' },
  'bcps-assignments':       { title: 'Web Team Assignments',    sub: 'BCPS' },
  'community-relations':    { title: 'Community Relations Tracker', sub: 'District Community Relations' },
  minibase:                 { title: 'Minibase',                    sub: 'Document Library' },
  'bcps-certification':     { title: 'Department Certification',sub: 'WCM Certification Program' },
  department:               { title: 'Department Profile',      sub: 'Audit & Analytics' },
  'pulse-approvals':        { title: 'Note Approvals',          sub: 'Pulse Feedback Queue' },
  'department-audit':       { title: 'Department Name Audit',  sub: 'Profiles vs. Roster Consistency' },
  'find-it-fast':           { title: 'Find It Fast',          sub: 'Back to School Widget Content' },
  'widgets':                { title: 'Widgets',               sub: 'Embeddable Modules' },
  'ada-scanner':            { title: 'ADA Scanner',           sub: 'Accessibility Compliance Check' },
  'schools':                { title: 'School ADA Accounts',   sub: 'School-Level WCM Portal Accounts' },
}

// ── Icons ─────────────────────────────────────────────────────────────────
const HamburgerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

// ── Inner shell (needs Suspense boundary for useSearchParams) ─────────────
function BCPSShellInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [role, setRole] = useState<UserRole>('user')
  const [viewAs, setViewAs] = useState<TeamMember | null>(null)
  const [allowedPages, setAllowedPages] = useState<string[] | null>(null)
  const [unreadMessages, setUnreadMessages] = useState(0)
  // canManageMessages tracks the raw backend role (admin OR superadmin) for
  // the notification bell / dashboard inbox specifically. Deliberately kept
  // separate from `role` (UserRole = 'superadmin' | 'user'), which drives
  // Sidebar/page-visibility and is a pre-existing two-tier model - widening
  // that to a real three-tier system is a bigger design change than this
  // fix calls for. Found 2026-07-29: my-access already returns a real
  // 'admin' tier (used server-side by requireBcpsAdmin on run-audit,
  // admin-decision, and the new messages route), but this component was
  // silently collapsing 'admin' down to 'user', so making someone (Felicia
  // Hicks) an admin had no visible effect on the bell/inbox. This fixes
  // that specific gap without touching the Sidebar role model.
  const [canManageMessages, setCanManageMessages] = useState(false)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const email = sess.session?.user?.email ?? ''
      if (!token) return
      tokenRef.current = token
      try {
        const r = await fetch('/api/bcps/my-access', { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const j = await r.json()
          setRole(j.role === 'superadmin' || SUPERADMIN_EMAILS.has(email) ? 'superadmin' : 'user')
          setCanManageMessages(j.role === 'admin' || j.role === 'superadmin' || SUPERADMIN_EMAILS.has(email))
          setAllowedPages(j.pages as string[])
          return
        }
      } catch { /* fall through to safe default */ }
      setRole(SUPERADMIN_EMAILS.has(email) ? 'superadmin' : 'user')
      setCanManageMessages(SUPERADMIN_EMAILS.has(email))
    })()
  }, [])

  // Notification bell: unread count of site reports (wcm_pilot_feedback),
  // admin/superadmin inbox per Sean 2026-07-29. Poll every 45s so the bell
  // reflects new reports without a full page reload.
  useEffect(() => {
    if (!canManageMessages) { setUnreadMessages(0); return }
    let cancelled = false
    async function poll() {
      const token = tokenRef.current
      if (!token) return
      try {
        const r = await fetch('/api/bcps/messages', { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const j = await r.json()
        if (!cancelled) setUnreadMessages(j.unread_count ?? 0)
      } catch { /* leave last known count */ }
    }
    poll()
    const interval = setInterval(poll, 45000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [canManageMessages])

  const handleBellClick = useCallback(() => {
    router.push('/?page=dashboard', { scroll: false })
    setTimeout(() => {
      document.getElementById('dashboard-messages-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 250)
  }, [router])

  // Active page: cert routes and department route use pathname; others read ?page=
  const activePage = useMemo<PageId>(() => {
    if (pathname.startsWith('/certification')) return 'bcps-certification'
    if (pathname.startsWith('/department')) return 'department'
    return (searchParams.get('page') as PageId) || 'dashboard'
  }, [pathname, searchParams])

  const { title, sub } = PAGE_TITLES[activePage] ?? PAGE_TITLES['dashboard']

  // Engine-driven page enforcement: if the user lands on a page they may not reach, send to dashboard.
  useEffect(() => {
    if (!allowedPages || viewAs) return
    const pathRouted = pathname.startsWith('/certification') || pathname.startsWith('/department')
    // Hardcoded admin-tier pages (SUPERADMIN_PAGES) are gated by role alone and
    // don't depend on the acl_objects registry, since that registry has shown
    // eventual-consistency lag right after a new page is registered (also true
    // for the pre-existing Minibase page, which isn't in acl_objects either).
    const roleGated = role === 'superadmin' && SUPERADMIN_PAGES.has(activePage)
    if (!pathRouted && activePage !== 'dashboard' && !allowedPages.includes(activePage) && !roleGated) {
      router.replace('/?page=dashboard', { scroll: false })
    }
  }, [allowedPages, activePage, pathname, viewAs, router])

  // Called by Sidebar for all pages; route special cases here
  const handleNavigate = useCallback((page: PageId) => {
    if (page === 'bcps-certification') {
      router.push('/certification/departments')
      return
    }
    router.push(`/?page=${page}`, { scroll: false })
  }, [router])

  const handleViewAs = useCallback((member: TeamMember | null) => {
    setViewAs(member)
    // If switching to user-view while on a superadmin-only page, bounce to dashboard
    if (member) {
      const current = (searchParams.get('page') as PageId) || 'dashboard'
      if (SUPERADMIN_PAGES.has(current)) {
        router.push('/?page=dashboard', { scroll: false })
      }
    }
  }, [searchParams, router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    // One BCPS Marcomm login for every module, certification included
    // (per V, 2026-07-28) - no more bespoke cert-only sign-out target.
    window.location.href = '/login'
  }

  return (
    <BCPSShellContext.Provider value={{ role, viewAs, canManageMessages }}>
      <div className="app-shell">
        <Sidebar
          activePage={activePage}
          onNavigate={handleNavigate}
          role={role}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          viewAs={viewAs}
          onViewAs={handleViewAs}
          allowedPages={allowedPages ?? undefined}
        />

        <div className="main-area">
          {/* Global Topbar */}
          <header className="topbar">
            <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                className="hamburger-btn"
                onClick={() => setSidebarOpen(s => !s)}
                aria-label="Open menu"
              >
                <HamburgerIcon />
              </button>
              <div>
                <h1>{title}</h1>
                <p>{sub}</p>
              </div>
            </div>

            <div className="topbar-right">
              <div className="topbar-search">
                <input type="text" placeholder="Search..." className="search-input" />
              </div>
              {canManageMessages && (
                <button
                  className="topbar-notif"
                  title={unreadMessages > 0 ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}` : 'Notifications'}
                  onClick={handleBellClick}
                  style={{
                    position: 'relative', background: 'none',
                    border: `1.5px solid ${unreadMessages > 0 ? '#eab308' : 'var(--border)'}`,
                    borderRadius: '8px', width: 36, height: 36, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                    color: unreadMessages > 0 ? '#eab308' : 'var(--text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  <BellIcon />
                  {unreadMessages > 0 && (
                    <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '2px solid #fff' }} />
                  )}
                </button>
              )}
              <button
                onClick={handleSignOut}
                style={{
                  background: 'none', border: '1.5px solid var(--border)', borderRadius: '8px',
                  color: 'var(--text-secondary)', cursor: 'pointer', padding: '6px 12px',
                  fontSize: '12px', fontWeight: '600', transition: 'all 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                Sign out
              </button>
            </div>
          </header>

          {/* View-as diagnostic banner removed 2026-08-13 per V: standardizing "View
              as" across the LESARUSS Universe on GeekFon Society's gold-standard
              pattern (nav-drawer only, never visible in the page body). The
              Sidebar's own footer switcher (view/onViewAs prop) already shows the
              active simulation and offers a reset entry, so this banner was a
              redundant always-visible duplicate. See Sidebar.tsx. */}

          {/* Pulse strip - superadmin only */}
          <PulseWidget role={role} />

          {children}
        </div>
      </div>
    </BCPSShellContext.Provider>
  )
}

// ── Public component (Suspense boundary for useSearchParams) ──────────────
export default function BCPSShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <BCPSShellInner>{children}</BCPSShellInner>
    </Suspense>
  )
}
