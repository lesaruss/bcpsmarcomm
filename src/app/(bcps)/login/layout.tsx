import type { Metadata } from 'next'

// The homepage sends signed-out visitors here (/login?next=...), so this is the
// site's front door for Google. One canonical URL stops "Duplicate without
// user-selected canonical" across the ?next= variants (nightly fixer 2026-11-25).
export const metadata: Metadata = {
  alternates: { canonical: 'https://bcpsmarcomm.com/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
