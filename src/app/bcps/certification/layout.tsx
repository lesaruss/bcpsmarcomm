import WcmPilotFeedback from '@/app/bcps/wcm-registration/WcmPilotFeedback'

// No auth gate here on purpose. This layout wraps every route under
// /bcps/certification/*, including the login page itself - a blanket
// "redirect to /bcps/certification/login if no session" here redirects the
// login page to itself, an infinite loop for any anonymous visitor (found
// 2026-07-27 via a real incognito test: the login page just kept
// relooping). Every actual protected page under this tree (departments,
// dashboard, admin, course, complete) already does its own auth check and
// redirects to login independently, so this layout only needs to provide
// the shared chrome, not gate access.
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
