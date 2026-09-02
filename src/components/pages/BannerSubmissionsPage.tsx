'use client'

// Standalone page for the WCM Banner Submission App - lives under the "Web
// Content Managers" nav section so any WCM can reach it directly at
// /?page=banner-submissions and Sean has a real link to hand out.
//
// Originally built as a dashboard widget (2026-09-02); Sean asked to make it
// its own page instead of an embeddable-anywhere widget, so it moved here
// under WCM (a dedicated Schools section is planned later - WCM is the
// interim home). BannerWidget itself is unchanged and does its own data
// fetching, so this file is just the page shell + nav placement.

import BannerWidget from '@/components/bcps/BannerWidget'

export default function BannerSubmissionsPage() {
  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: 'inherit' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>
        Banner Submissions
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
        Submit a photo or video for your school&apos;s homepage banner, request removal of a prior submission, or
        review your submission history. Every submission goes to the District Web Team for review before it goes live.
      </p>
      <BannerWidget />
    </div>
  )
}
