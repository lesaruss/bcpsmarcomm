// No auth gate here on purpose. WCM Certification is no longer a separate
// account system (per V, 2026-07-28): middleware.ts and the parent
// bcps/layout.tsx already gate every /bcps/certification/* path on the
// single BCPS Marcomm session (redirect to /bcps/login) before a request
// ever reaches this layout.
//
// The site-wide report-an-issue widget (SiteFeedback) used to be mounted
// here specifically for certification pages; it now mounts once in the
// root layout and covers every page on bcpsmarcomm.com, so it has been
// removed from here (per V, 2026-07-29) to avoid a duplicate floating
// button on cert pages.
export default function CertLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
