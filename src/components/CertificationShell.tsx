'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Sidebar, { type UserRole } from '@/components/Sidebar'
import type { PageId } from '@/lib/types'

export default function CertificationShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [role, setRole] = useState<UserRole>('user')

  const SUPERADMIN_EMAILS = new Set(['contact@lesaruss.com'])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ''
      setRole(SUPERADMIN_EMAILS.has(email) ? 'superadmin' : 'user')
    })
  }, [])

  const handleNavigate = (page: PageId) => {
    const routes: Partial<Record<PageId, string>> = {
      dashboard: '/bcps',
      departments: '/bcps/departments.html',
      queue: '/bcps',
      notes: '/bcps',
      profile: '/bcps',
      analytics: '/bcps',
      superadmin: '/bcps',
      marcomm: '/bcps',
      minutes: '/bcps',
      wcm: '/bcps',
      'bcps-google-governance': '/bcps/google-governance-plan.html',
      'bcps-assignments': '/bcps/bcps-web-team-assignments.html',
      'bcps-certification': '/bcps/certification/departments',
    }
    window.location.href = routes[page] ?? '/bcps'
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/bcps/certification/login'
  }

  return (
    <div className="app-shell" style={{ width: '100%', minHeight: '100vh' }}>
      <Sidebar
        activePage="bcps-certification"
        onNavigate={handleNavigate}
        role={role}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen(s => !s)}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <div>
              <div className="topbar-title">Department Certification</div>
              <div className="topbar-sub">WCM Certification Program</div>
            </div>
          </div>
          <div className="topbar-right">
            <button className="btn-secondary" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
