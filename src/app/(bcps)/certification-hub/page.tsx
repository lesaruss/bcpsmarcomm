import { redirect } from 'next/navigation'

// A short address for the Certification page (Sean, 2026-11-05). The page
// itself lives in the app shell at /?page=cert-followup (SuperAdmin only);
// signed-out visitors are sent to log in by middleware first.
export default function CertificationHub() {
  redirect('/?page=cert-followup')
}
