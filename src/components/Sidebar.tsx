'use client'

import { useState } from 'react'
import type { PageId } from '@/lib/types'

export type UserRole = 'superadmin' | 'user'

export interface TeamMember {
  id: string
  name: string
  initials: string
  color: string
  roleLabel: string
}

export const TEAM_MEMBERS: TeamMember[] = [
  { id: 'FH', name: 'Felicia Hicks',     initials: 'FH', color: '#7C3AED', roleLabel: 'Web Team' },
  { id: 'VD', name: 'Vanessa Deslandes', initials: 'VD', color: '#059669', roleLabel: 'Web Team' },
  { id: 'TA', name: 'Tricia Allen',      initials: 'TA', color: '#D97706', roleLabel: 'Web Team' },
  { id: 'NA', name: 'Nakesha Ali-Sirju', initials: 'NA', color: '#0891B2', roleLabel: 'Web Team' },
]

interface SidebarProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
  allowedPages?: string[]
  role?: UserRole
  isOpen?: boolean
  onClose?: () => void
  viewAs?: TeamMember | null
  onViewAs?: (member: TeamMember | null) => void
}

// ── Flat SVG icons ──────────────────────────────────────────────────────────
const Icons: Record<string, React.ReactNode> = {
  dashboard: (
    // BCPS shield as Passport icon
    <svg width="18" height="18" viewBox="0 0 36 44" fill="none">
      <path d="M18 2L32 8V22C32 31 25.5 38 18 42C10.5 38 4 31 4 22V8L18 2Z" fill="currentColor" opacity="0.85"/>
      <path d="M18 8L27 12.5V22C27 28 23.5 32.5 18 36C12.5 32.5 9 28 9 22V12.5L18 8Z" fill="currentColor" opacity="0.25"/>
    </svg>
  ),
  notes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  departments: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  analytics: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  documents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="13" x2="8" y2="13"/><line x1="12" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  profile: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  superadmin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  marcomm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  minutes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  wcm: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  ),
  queue: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <circle cx="3" cy="6" r="1" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="12" r="1" fill="currentColor" stroke="none"/>
      <circle cx="3" cy="18" r="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  graphics: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  'bcps-google-governance': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <polyline points="9 12 11 14 15 10"/>
    </svg>
  ),
  'bcps-assignments': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="4" rx="1"/>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  'bcps-certification': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6"/>
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="12" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  'employee-records': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
      <polyline points="16 11 17 16 12 14 7 16 8 11"/>
    </svg>
  ),
  'community-relations': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  minibase: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/>
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
    </svg>
  ),
  'pulse-approvals': (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      <path d="M9 12l2 2 4-4" opacity="0.6"/>
    </svg>
  ),
}

// ── Nav config ─────────────────────────────────────────────────────────────
const SUPERADMIN_PAGES = new Set<PageId>(['superadmin', 'permissions', 'analytics', 'marcomm', 'graphics', 'wcm', 'reports', 'pulse-approvals'])

interface NavItem { id: PageId; label: string }

interface NavSection { label: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  { label: 'Platform', items: [
    { id: 'dashboard', label: 'Passport' },
    { id: 'queue', label: 'Queue' },
    { id: 'notes', label: 'Meeting Notes' },
    { id: 'departments', label: 'Departments' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'documents', label: 'Documents' },
    { id: 'profile', label: 'My Profile' },
    { id: 'members', label: 'Members' },
    { id: 'minibase', label: 'Minibase' },
  ] },
  { label: 'District Community Relations', items: [
    { id: 'community-relations', label: 'Task Tracker' },
  ] },
  { label: 'MarComm', items: [
    { id: 'marcomm', label: 'Newsroom' },
    { id: 'graphics', label: 'Graphics & Printing' },
  ] },
  { label: 'Web Content Managers', items: [
    { id: 'bcps-assignments', label: 'Web Team Assignments' },
    { id: 'bcps-certification', label: 'Department Certification' },
    { id: 'bcps-google-governance', label: 'Google Governance' },
    { id: 'wcm', label: 'WCM Hub' },
  ] },
  { label: 'SuperAdmin', items: [
    { id: 'superadmin', label: 'Platform Management' },
    { id: 'permissions', label: 'Permissions' },
    { id: 'pulse-approvals', label: 'Note Approvals' },
  ] },
  { label: 'Other', items: [
    { id: 'minutes', label: 'Minutes' },
    { id: 'reports', label: 'Reports' },
    { id: 'employee-records', label: 'My Records' },
  ] },
]

function canSee(effectiveRole: UserRole, pageId: PageId): boolean {
  return effectiveRole === 'superadmin' || !SUPERADMIN_PAGES.has(pageId)
}

// Chevron icon for the user switcher
const ChevronIcon = ({ up }: { up?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {up ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
  </svg>
)

// ── Component ──────────────────────────────────────────────────────────────
export default function Sidebar({
  activePage, onNavigate,
  role = 'user',
  isOpen = false, onClose = () => {},
  viewAs = null, onViewAs,
  allowedPages,
}: SidebarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false)

  // Effective role for nav filtering: if superadmin is viewing as a user, collapse to user nav
  const effectiveRole: UserRole = viewAs ? 'user' : role

  const nav = (page: PageId) => {
    onNavigate(page)
    onClose()
  }

  const selectViewAs = (member: TeamMember | null) => {
    onViewAs?.(member)
    setSwitcherOpen(false)
  }

  const isSuperAdmin = role === 'superadmin'
  const displayUser = viewAs ?? (isSuperAdmin ? { id: 'SA', name: 'Sean A. Russell', initials: 'SA', color: '#003087', roleLabel: 'SuperAdmin' } : null)

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />
      )}

      {/* Drawer */}
      <aside className={`sidebar${isOpen ? ' open' : ''}`}>

        {/* Brand header - BCPS logo */}
        <div className="sidebar-brand" style={{ alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 14px' }}>
          <img
            src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
            alt="Broward County Public Schools"
            style={{ height: '38px', width: 'auto', filter: 'brightness(0) invert(1)', display: 'block' }}
          />
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="1" y1="1" x2="11" y2="11"/>
              <line x1="11" y1="1" x2="1" y2="11"/>
            </svg>
          </button>
        </div>

        {/* Viewing-as banner */}
        {viewAs && (
          <div style={{
            background: 'rgba(255,255,0,0.12)', borderBottom: '1px solid rgba(255,255,0,0.2)',
            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F4C436" strokeWidth="2.5" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#F4C436', flex: 1 }}>Viewing as {viewAs.name}</span>
            <button
              onClick={() => selectViewAs(null)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: '10px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
            >
              Exit
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="sidebar-nav">
          {SECTIONS.map((section, si) => {
            const items = (allowedPages && !viewAs)
              ? section.items.filter(item => allowedPages.includes(item.id) || (effectiveRole === 'superadmin' && SUPERADMIN_PAGES.has(item.id)))
              : section.items.filter(item => canSee(effectiveRole, item.id))
            if (items.length === 0) return null
            return (
              <div key={section.label}>
                <div className="sidebar-section-label" style={si === 0 ? undefined : { marginTop: '1.5rem' }}>{section.label}</div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    className={`sidebar-link${activePage === item.id ? ' active' : ''}`}
                    onClick={() => nav(item.id)}
                  >
                    <span className="sidebar-icon">{Icons[item.id]}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </nav>

        {/* Footer - user switcher for SuperAdmin, static display for users */}
        <div className="sidebar-footer" style={{ position: 'relative' }}>
          {isSuperAdmin ? (
            <>
              {/* Switcher dropdown */}
              {switcherOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, right: 0,
                  background: '#0f3c5c', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: '10px', margin: '0 4px 6px', overflow: 'hidden',
                  boxShadow: '0 -8px 24px rgba(0,0,0,0.25)',
                }}>
                  <div style={{ padding: '10px 14px 6px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)' }}>
                    View as...
                  </div>
                  {TEAM_MEMBERS.map(member => (
                    <button
                      key={member.id}
                      onClick={() => selectViewAs(member)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '9px 14px', background: viewAs?.id === member.id ? 'rgba(255,255,255,0.12)' : 'none',
                        border: 'none', cursor: 'pointer', textAlign: 'left',
                        transition: 'background 0.12s',
                      }}
                      onMouseOver={e => { if (viewAs?.id !== member.id) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                      onMouseOut={e => { if (viewAs?.id !== member.id) e.currentTarget.style.background = 'none' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: member.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                        {member.initials}
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{member.name}</div>
                        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{member.roleLabel}</div>
                      </div>
                      {viewAs?.id === member.id && (
                        <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F4C436" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '4px 0' }}/>
                  <button
                    onClick={() => selectViewAs(null)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '9px 14px', background: !viewAs ? 'rgba(255,255,255,0.12)' : 'none',
                      border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#003087', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>SA</div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Sean A. Russell</div>
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>SuperAdmin</div>
                    </div>
                    {!viewAs && (
                      <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F4C436" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* Clickable footer row */}
              <button
                onClick={() => setSwitcherOpen(s => !s)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  background: switcherOpen ? 'rgba(255,255,255,0.08)' : 'none',
                  border: 'none', cursor: 'pointer', borderRadius: '8px', padding: '6px 4px',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: displayUser?.color ?? '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {displayUser?.initials ?? 'U'}
                </div>
                <div className="sidebar-user-info" style={{ flex: 1, textAlign: 'left' }}>
                  <strong>{displayUser?.name ?? 'Team Member'}</strong>
                  <span>{viewAs ? 'Viewing as user' : 'SuperAdmin'}</span>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.4)', marginRight: 2 }}>
                  <ChevronIcon up={switcherOpen} />
                </span>
              </button>
            </>
          ) : (
            <div className="sidebar-user">
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>U</div>
              <div className="sidebar-user-info">
                <strong>Team Member</strong>
                <span>User</span>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
