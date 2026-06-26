'use client'

import React, { useState, useEffect, useMemo, useCallback, Suspense, createContext, useContext } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar, { type UserRole, type TeamMember } from '@/components/Sidebar'
import PulseWidget from '@/components/PulseWidget'
import type { PageId } from '@/lib/types'

// ── Context (consumed by bcps/page.tsx for role-gated content) ────────────
interface BCPSShellContextValue {
  role: UserRole
  viewAs: TeamMember | null
}
export const BCPSShellContext = createContext<BCPSShellContextValue>({
  role: 'user',
  viewAs: null,
})
export function useBCPSShell() { return useContext(BCPSShellContext) }

// ── Constants ─────────────────────────────────────────────────────────────
const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])
const SUPERADMIN_PAGES = new Set<PageId>(['superadmin', 'analytics', 'marcomm', 'graphics', 'wcm'])

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  dashboard:                { title: 'Passport',                sub: 'Broward County Public Schools' },
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
  'bcps-certification':     { title: 'Department Certification',sub: 'WCM Certification Program' },
  department:               { title: 'Department Profile',      sub: 'Audit & Analytics' },
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

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      const email = sess.session?.user?.email ?? ''
      if (!token) return
      try {
        const r = await fetch('/api/bcps/my-access', { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const j = await r.json()
          setRole(j.role === 'superadmin' || SUPERADMIN_EMAILS.has(email) ? 'superadmin' : 'user')
          setAllowedPages(j.pages as string[])
          return
        }
      } catch { /* fall through to safe default */ }
      setRole(SUPERADMIN_EMAILS.has(email) ? 'superadmin' : 'user')
    })()
  }, [])

  // Active page: cert routes and department route use pathname; others read ?page=
  const activePage = useMemo<PageId>(() => {
    if (pathname.startsWith('/bcps/certification')) return 'bcps-certification'
    if (pathname.startsWith('/bcps/department')) return 'department'
    return (searchParams.get('page') as PageId) || 'dashboard'
  }, [pathname, searchParams])

  const { title, sub } = PAGE_TITLES[activePage] ?? PAGE_TITLES['dashboard']

  // Engine-driven page enforcement: if the user lands on a page they may not reach, send to dashboard.
  useEffect(() => {
    if (!allowedPages || viewAs) return
    const pathRouted = pathname.startsWith('/bcps/certification') || pathname.startsWith('/bcps/department')
    if (!pathRouted && activePage !== 'dashboard' && !allowedPages.includes(activePage)) {
      router.replace('/bcps?page=dashboard', { scroll: false })
    }
  }, [allowedPages, activePage, pathname, viewAs, router])

  // Called by Sidebar for all pages; route special cases here
  const handleNavigate = useCallback((page: PageId) => {
    if (page === 'bcps-certification') {
      router.push('/bcps/certification/departments')
      return
    }
    router.push(`/bcps?page=${page}`, { scroll: false })
  }, [router])

  const handleViewAs = useCallback((member: TeamMember | null) => {
    setViewAs(member)
    // If switching to user-view while on a superadmin-only page, bounce to dashboard
    if (member) {
      const current = (searchParams.get('page') as PageId) || 'dashboard'
      if (SUPERADMIN_PAGES.has(current)) {
        router.push('/bcps?page=dashboard', { scroll: false })
      }
    }
  }, [searchParams, router])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    const isCert = pathname.startsWith('/bcps/certification')
    window.location.href = isCert ? '/bcps/certification/login' : '/bcps/login'
  }

  return (
    <BCPSShellContext.Provider value={{ role, viewAs }}>
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
              <button
                className="topbar-notif"
                title="Notifications"
                style={{
                  position: 'relative', background: 'none', border: '1.5px solid var(--border)',
                  borderRadius: '8px', width: 36, height: 36, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
              >
                <BellIcon />
                <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '2px solid #fff' }} />
              </button>
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

          {/* Diagnostic view-as banner */}
          {viewAs && (
            <div style={{
              background: '#fffbeb', borderBottom: '1px solid #fde68a',
              padding: '8px 28px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                Diagnostic view: seeing the platform as <strong>{viewAs.name}</strong> ({viewAs.roleLabel})
              </span>
              <button
                onClick={() => handleViewAs(null)}
                style={{
                  marginLeft: 'auto', background: 'none', border: '1px solid #d97706',
                  borderRadius: '6px', color: '#92400e', fontSize: '11px', fontWeight: 700,
                  padding: '3px 10px', cursor: 'pointer',
                }}
              >
                Exit diagnostic
              </button>
            </div>
          )}

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
