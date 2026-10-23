'use client'

// A page with its own address (/department, /school) shown under the
// dashboard tab bar, the same as the ?page= pages (Sean, 2026-10-23: the
// department profile had lost the main navigation).

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import HomePage from '@/components/pages/HomePage'
import { useBCPSShell } from '@/components/BCPSShell'
import { MARCOMM_PATH, type PageId } from '@/lib/types'

export default function UnderDashboardTabs({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { viewAs } = useBCPSShell()
  const navigate = useCallback((page: PageId) => {
    router.push(page === 'marcomm-assignments' ? MARCOMM_PATH : `/?page=${page}`)
  }, [router])
  return (
    <div className="page-content">
      <HomePage onNavigate={navigate} viewAsUserId={viewAs?.id} page={children} />
    </div>
  )
}
