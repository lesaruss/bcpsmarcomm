'use client'

// The interactive guide for a password reader (Sean, 2026-11-10). The content
// comes from /api/bcps/guides/[slug], which accepts the reader's 24-hour pass.

import RestrictedGuide from '@/components/guides/RestrictedGuide'
import type { RestrictedGuideMeta } from '@/lib/guides/restricted'

export default function GuideReader({ meta, loginHref }: { meta: RestrictedGuideMeta; loginHref: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f4f7fb' }}>
      <header style={{ background: '#fff', borderBottom: '3px solid #1672A7', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" style={{ height: 40, width: 'auto' }} />
        <span style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#1672A7' }}>BCPS MarComm</span>
      </header>
      <div className="home" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 16px 48px' }}>
        <RestrictedGuide meta={meta}
          actions={<a className="wcm-hub2-card-btn" href={loginHref}>Sign in for the full guide</a>} />
      </div>
    </div>
  )
}
