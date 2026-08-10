import { redirect } from 'next/navigation'

// WCM Certification no longer has its own account system (per V,
// 2026-07-28). This route only still exists for old bookmarks/links -
// middleware.ts and bcps/layout.tsx already gate every /bcps/certification/*
// path on the single BCPS Marcomm session (redirect to /bcps/login) before a
// request ever reaches this page, so anyone landing here is already
// authenticated. Send them straight into the smart-resume course root.
export default function CertLoginRedirect() {
  redirect('/certification/departments')
}
