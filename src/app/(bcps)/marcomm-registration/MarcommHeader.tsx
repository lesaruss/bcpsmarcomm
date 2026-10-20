'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// Shared header for the MarComm Meeting onboarding pages (welcome deck and
// registration). Same logo-left treatment and menu as the WCM Department
// Registration pages, whose stylesheet these pages reuse.
export const MARCOMM_HOME = '/marcomm-assignments'
export const MARCOMM_LOGIN = `/login?next=${encodeURIComponent('/marcomm-registration/register')}`

export default function MarcommHeader({ right }: { right?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="wp-header-row">
      <div className="wp-header-brand">
        <img
          className="wp-header-logo"
          src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
          alt="Broward County Public Schools"
        />
        <span className="wp-header-divider" aria-hidden="true" />
        <span className="wp-header-title">MarComm Meeting</span>
      </div>
      <div className="wp-header-right">
        {right}
        <div className="wp-menu" ref={boxRef}>
          <button
            type="button"
            className="wp-menu-btn"
            aria-label="Menu"
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={() => setOpen(o => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          {open && (
            <div className="wp-menu-dropdown" role="menu">
              <a href={MARCOMM_LOGIN} className="wp-menu-item" role="menuitem">Log In</a>
              <a href="/marcomm-registration/register" className="wp-menu-item" role="menuitem">Create Account</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
