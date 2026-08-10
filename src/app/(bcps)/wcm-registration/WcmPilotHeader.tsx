import type { ReactNode } from 'react'
import WcmPilotNavMenu from './WcmPilotNavMenu'

// Shared persistent header for every WCM Department Registration page (welcome
// deck, registration). Renamed from WCM Pilot Program 2026-07-28, old
// /wcm-pilot URLs redirect here via middleware.ts.
// Logo, a vertical divider, then the program label - matches the same
// logo-left header treatment used elsewhere in the app (see wcm-roster-signup).
export default function WcmPilotHeader({ right }: { right?: ReactNode }) {
  return (
    <div className="wp-header-row">
      <div className="wp-header-brand">
        <img
          className="wp-header-logo"
          src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
          alt="Broward County Public Schools"
        />
        <span className="wp-header-divider" aria-hidden="true" />
        <span className="wp-header-title">WCM Department Registration</span>
      </div>
      <div className="wp-header-right">
        {right}
        <WcmPilotNavMenu />
      </div>
    </div>
  )
}
