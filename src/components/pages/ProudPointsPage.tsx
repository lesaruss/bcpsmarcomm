'use client'

// Proud Points Submission App page, /?page=proud-points (2026-10-08). Same
// shape as BannerSubmissionsPage: a page shell around the widget, which does
// its own data fetching.

import ProudPointsWidget from '@/components/bcps/ProudPointsWidget'

export default function ProudPointsPage() {
  return (
    <div style={{ padding: 32, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '0 0 4px' }}>
        Proud Points
      </h1>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>
        The six highlights on your school homepage: a data point, a heading, a short caption and a background photo for each.
        Every submission goes to the District Web Team for review before it goes live.
      </p>
      {/* Related pages, so this is never a dead end (Sean, 2026-10-08). The
          topbar's Dashboard button is the way home. */}
      <nav aria-label="Related" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '-8px 0 18px' }}>
        <a className="btn-outline" href="/?page=my-submissions" style={{ fontSize: 12, padding: '6px 12px', textDecoration: 'none', borderRadius: 8 }}>Your Submissions</a>
        <a className="btn-outline" href="/?page=banner-submissions" style={{ fontSize: 12, padding: '6px 12px', textDecoration: 'none', borderRadius: 8 }}>Banner Submissions</a>
      </nav>
      <ProudPointsWidget />
    </div>
  )
}
