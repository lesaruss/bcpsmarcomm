'use client'

import { useEffect, useState } from 'react'
import MeetingTranscriptUpload from '@/components/bcps/MeetingTranscriptUpload'

// The page is served through /api/bcps/web-team-assignments-html (2026-10-21)
// so rows added by a meeting transcript upload appear alongside the file's own.
const PAGE_SRC = '/api/bcps/web-team-assignments-html'

// ?row=<slug> (from the dashboard's task links, 2026-10-01) opens that
// assignment's notes inside the page.
export default function AssignmentsPage() {
  const [src, setSrc] = useState(PAGE_SRC)
  const [reloads, setReloads] = useState(0)
  useEffect(() => {
    const row = new URLSearchParams(window.location.search).get('row')
    if (row) setSrc(`${PAGE_SRC}#open=${encodeURIComponent(row)}`)
  }, [])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <MeetingTranscriptUpload onApplied={() => setReloads((n) => n + 1)} />
      <iframe
        key={`${src}-${reloads}`}
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
