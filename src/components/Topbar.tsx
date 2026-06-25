'use client'

import { createClient } from '@/lib/supabase'
import type { PageId, BreadcrumbItem } from '@/lib/types'

interface TopbarProps {
  title: string
  sub: string
  currentPage: PageId
  breadcrumb?: BreadcrumbItem
  onNavigate: (page: PageId) => void
  onShowToast: (msg: string) => void
  onToggleSidebar?: () => void
}

// Flat hamburger icon
const HamburgerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)

// Flat bell icon (replaces emoji)
const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
)

export default function Topbar({
  title, sub, currentPage, breadcrumb,
  onNavigate, onShowToast, onToggleSidebar,
}: TopbarProps) {

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <header className="topbar">
      <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>

        {/* Hamburger */}
        <button
          className="hamburger-btn"
          onClick={onToggleSidebar}
          aria-label="Open menu"
        >
          <HamburgerIcon />
        </button>

        {/* Title or breadcrumb */}
        {breadcrumb ? (
          <div className="topbar-breadcrumb">
            <button className="breadcrumb-back" onClick={() => onNavigate(breadcrumb.pageId)}>
              &larr; {title}
            </button>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-current">{breadcrumb.label}</span>
          </div>
        ) : (
          <div>
            <h1>{title}</h1>
            <p>{sub}</p>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {currentPage === 'notes' && (
          <button className="btn btn-primary" onClick={() => onShowToast('New note editor opened')}>
            + New Note
          </button>
        )}
        {currentPage === 'departments' && (
          <button className="btn btn-primary" onClick={() => onNavigate('departments')}>
            + Add Department
          </button>
        )}
        {currentPage === 'superadmin' && (
          <button className="btn btn-primary" onClick={() => onShowToast('Invite modal opened')}>
            + Send Invite
          </button>
        )}
        <div className="topbar-search">
          <input type="text" placeholder="Search..." className="search-input" />
        </div>

        {/* Flat bell icon */}
        <button className="topbar-notif" title="Notifications" style={{ position: 'relative', background: 'none', border: '1.5px solid var(--border)', borderRadius: '8px', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <BellIcon />
          <span className="notif-badge" style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: '#ef4444', border: '2px solid #fff' }} />
        </button>

        <button
          onClick={handleLogout}
          title="Sign out"
          style={{
            background: 'none', border: '1.5px solid var(--border)',
            borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer',
            padding: '6px 12px', fontSize: '12px', fontWeight: '600',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--blue)')}
          onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
