import WcmPilotFeedback from '@/app/bcps/wcm-registration/WcmPilotFeedback'

// No auth gate here on purpose. WCM Certification is no longer a separate
// account system (per V, 2026-07-28): middleware.ts and the parent
// bcps/layout.tsx already gate every /bcps/certification/* path on the
// single BCPS Marcomm session (redirect to /bcps/login) before a request
// ever reaches this layout. This layout only needs to provide the shared
// feedback-widget chrome, not gate access - the old bespoke cert login page
// is gone, replaced with a thin redirect stub for stale bookmarks.
export default function CertLayout({ children }: { children: React.ReactNode }) {
  // BCPSShell is provided by the parent bcps/layout.tsx. WcmPilotFeedback is
  // mounted here so every certification-course page (login, departments,
  // dashboard, course modules) carries the same feedback channel, per the
  // July 16 Hot Lab request to replace Teams/email for pilot testers.
  return (
    <>
      {children}
      <WcmPilotFeedback />
    </>
  )
}
