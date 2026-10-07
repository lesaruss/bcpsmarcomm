'use client'
// School accessibility audit (Sean, 2026-10-07): the same audit system as
// departments, run on a school's site with the accessibility checks only
// (WCAG 2.1 AA), every issue pinned on the school's page. The schools' own
// web standards plug in once they are set. First school: Silver Ridge
// Elementary, to show the Application Services team. Admins only for now
// (the API enforces it).

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useBCPSShell } from '@/components/BCPSShell'
import SiteAudit from '@/components/bcps/SiteAudit'

function SchoolAudit() {
  const id = useSearchParams().get('id') || ''
  const { role } = useBCPSShell()
  const isAdmin = role === 'superadmin'
  const [school, setSchool] = useState<{ name: string; site_url: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    createClient().from('bcps_schools').select('name, site_url').eq('id', id).maybeSingle().then(({ data }) => setSchool(data ?? null))
  }, [id])
  if (!id) return <p style={{ padding: 24 }}>No school selected.</p>
  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#C55326' }}>School accessibility audit</div>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: '4px 0 6px' }}>{school?.name ?? 'School'}</h1>
      <p style={{ fontSize: 13.5, color: 'rgba(26,26,26,.7)', maxWidth: 820, margin: '0 0 16px' }}>
        The same audit the department sites use, with the accessibility checks only for now. Each issue is pinned on the school&apos;s own page with the steps to fix it in Finalsite.
        {school?.site_url && <> Site: <a href={school.site_url} target="_blank" rel="noopener" style={{ color: '#1672A7', fontWeight: 700 }}>{school.site_url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></>}
      </p>
      <SiteAudit owner={{ school_id: id }} adaOnly isAdmin={isAdmin} />
    </div>
  )
}

export default function SchoolAuditPage() {
  return <Suspense fallback={null}><SchoolAudit /></Suspense>
}
