import type { ReactNode } from 'react'
import WcmPilotNavMenu from './WcmPilotNavMenu'

// Shared persistent header for every WCM Pilot page (welcome deck, registration).
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
        <span className="wp-header-title">WCM Pilot Program</span>
      </div>
      <div className="wp-header-right">
        {right}
        <WcmPilotNavMenu />
      </div>
    </div>
  )
}
