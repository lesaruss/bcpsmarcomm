'use client'

import { useEffect, useRef, useState } from 'react'

// Persistent top-right menu for the WCM Pilot Program entry pages (welcome
// deck + register), so a visitor can jump straight to Log In or Create
// Account from any step, not just the final step of the welcome deck.
export default function WcmPilotNavMenu() {
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
          <a href="/certification/login" className="wp-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            Log In
          </a>
          <a href="/wcm-pilot/register" className="wp-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            Create Account
          </a>
        </div>
      )}
    </div>
  )
}
