'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import MeetingTranscriptUpload from '@/components/bcps/MeetingTranscriptUpload'
import TrackerItemDialog, { type TrackerRow } from '@/components/bcps/TrackerItemDialog'

// The page is served through /api/bcps/web-team-assignments-html (2026-10-21)
// so rows added by a meeting transcript upload appear alongside the file's own.
const PAGE_SRC = '/api/bcps/web-team-assignments-html'

const supabaseClient = createClient()

// Toolbar (V, 2026-10-28): the same row a Playbook has, in the same order:
// All documents, Open full page, Edit this page, Upload transcript, Add your
// input. It replaces the transcript bar and is the toolbar for trackers.
// Edit this page and Upload transcript show only to the people who update the
// tracker; see /api/bcps/web-team-assignments-edit.
//
// ?row=<slug> (from the dashboard's task links, 2026-10-01) opens that
// assignment's notes inside the page.
export default function AssignmentsPage({ onBack }: { onBack?: () => void }) {
  const router = useRouter()
  const [src, setSrc] = useState(PAGE_SRC)
  const [reloads, setReloads] = useState(0)
  const [access, setAccess] = useState<{ can_edit: boolean; can_input: boolean; rows: TrackerRow[] }>({ can_edit: false, can_input: false, rows: [] })
  const [dialog, setDialog] = useState<'edit' | 'input' | null>(null)
  const [note, setNote] = useState('')

  useEffect(() => {
    const row = new URLSearchParams(window.location.search).get('row')
    if (row) setSrc(`${PAGE_SRC}#open=${encodeURIComponent(row)}`)
  }, [])

  useEffect(() => {
    let live = true
    ;(async () => {
      const token = (await supabaseClient.auth.getSession()).data.session?.access_token
      const res = await fetch('/api/bcps/web-team-assignments-edit', { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
      const j = await res.json().catch(() => null)
      if (live && j) setAccess({ can_edit: !!j.can_edit, can_input: !!j.can_input, rows: j.rows ?? [] })
    })().catch(() => {})
    return () => { live = false }
  }, [reloads])

  const back = onBack ?? (() => router.push('/?page=dashboard&tab=documents', { scroll: false }))
  const done = (message: string) => { setDialog(null); setNote(message); setReloads((n) => n + 1) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <div className="doc-toolbar">
        <button type="button" className="wcm-hub2-card-btn" onClick={back}>All documents</button>
        <a className="wcm-hub2-card-btn" href={PAGE_SRC} target="_blank" rel="noopener noreferrer">Open full page</a>
        {access.can_edit && <button type="button" className="wcm-hub2-card-btn" onClick={() => { setNote(''); setDialog('edit') }}>Edit this page</button>}
        <MeetingTranscriptUpload variant="button" onApplied={() => setReloads((n) => n + 1)} />
        {access.can_input && <button type="button" className="wcm-hub2-card-btn" onClick={() => { setNote(''); setDialog('input') }}>Add your input</button>}
      </div>
      {note && <p className="home-hint doc-toolbar-note" role="status">{note}</p>}
      {dialog && <TrackerItemDialog mode={dialog} rows={access.rows} onClose={() => setDialog(null)} onDone={done} />}
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
