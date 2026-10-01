'use client'

import { useEffect, useState } from 'react'

// ?row=<slug> (from the dashboard's task links, 2026-10-01) opens that
// assignment's notes inside the page.
export default function AssignmentsPage() {
  const [src, setSrc] = useState('/bcps-web-team-assignments.html')
  useEffect(() => {
    const row = new URLSearchParams(window.location.search).get('row')
    if (row) setSrc(`/bcps-web-team-assignments.html#open=${encodeURIComponent(row)}`)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <iframe
        key={src}
        src={src}
        title="Web Team Assignments"
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  )
}
