'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cleanTranscript } from '@/components/bcps/MeetingTranscriptUpload'
import { fmtGuideDate } from './Guide'

// Web Team Meetings (Sean, 2026-11-06): one page per Web Team Meeting (Sean,
// Farrah Wilson, Felicia Hicks) inside the District Web Team Guide. Before the
// meeting it is the agenda, with a link on every item so it opens in a click.
// After it, the transcript is added right here and the page becomes the
// meeting's notes: the recap, what happened to each agenda item, decisions,
// action items and the recording. Not a playbook. Data: /api/bcps/team-meetings.

const supabase = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Link { label: string; url: string }
// An item is a short summary on the agenda, with a Details page behind it
// (Sean, 2026-11-06): the goal, what has been done, what is left and the
// points to raise, laid out like an article, with a way back to the agenda.
interface AgendaItem { title: string; owner: string; minutes: number | null; summary?: string; detail: string; goal?: string; done?: string[]; left?: string[]; points?: string[]; links: Link[] }
const hasDetails = (a: AgendaItem) => !!(a.goal || a.done?.length || a.left?.length || a.points?.length || (a.summary && a.detail))
const lines = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean)
interface Notes {
  summary: string
  items: { agenda_index: number; outcome: string; discussed: boolean }[]
  decisions: string[]
  action_items: { task: string; owner: string; due: string }[]
  other_topics: string[]
}
interface Meeting {
  id?: string
  meeting_date: string
  title: string
  time_label: string | null
  join_url: string | null
  attendees: string[]
  agenda: AgendaItem[]
  video_url: string | null
  notes: Notes | null
  notes_at: string | null
  has_transcript?: boolean
  updated_at?: string
  updated_by?: string | null
}

const todayEastern = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

const blank = (): Meeting => ({
  meeting_date: todayEastern(), title: 'Web Team Meeting', time_label: '11:00 AM to 12:00 PM', join_url: null,
  attendees: ['Sean A. Russell', 'Farrah Wilson', 'Felicia Hicks'], agenda: [], video_url: null, notes: null, notes_at: null,
})

// A recording link as something the page can play: YouTube and Vimeo become
// their players, a SharePoint or Stream embed code is read for its address,
// a video file plays as is. Anything else is a link to open it.
function playable(raw: string): { kind: 'iframe' | 'video'; src: string } | null {
  let u = raw.trim()
  const src = u.match(/<iframe[^>]+src="([^"]+)"/i)
  if (src) u = src[1].replace(/&amp;/g, '&')
  let url: URL
  try { url = new URL(u) } catch { return null }
  if (url.protocol !== 'https:') return null
  const h = url.hostname.replace(/^www\./, '')
  if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) return { kind: 'video', src: url.toString() }
  if (h === 'youtu.be') return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}` }
  if (h.endsWith('youtube.com')) {
    const v = url.searchParams.get('v') ?? url.pathname.split('/').pop()
    return v ? { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${v}` } : null
  }
  if (h === 'vimeo.com') return { kind: 'iframe', src: `https://player.vimeo.com/video${url.pathname}` }
  if (h === 'player.vimeo.com') return { kind: 'iframe', src: url.toString() }
  if (h.endsWith('sharepoint.com') && /embed\.aspx/i.test(url.pathname)) return { kind: 'iframe', src: url.toString() }
  if (h.endsWith('sharepoint.com') && /stream\.aspx/i.test(url.pathname)) {
    // A Stream share link plays inside the page with embed=true when the viewer is signed in to Microsoft 365.
    url.searchParams.set('embed', '{"af":true,"ust":true}')
    return { kind: 'iframe', src: url.toString() }
  }
  return null
}

const linksToText = (l: Link[]) => l.map((x) => `${x.label} | ${x.url}`).join('\n')
const textToLinks = (t: string): Link[] => t.split('\n').map((line) => {
  const [a, b] = line.includes('|') ? line.split('|') : ['', line]
  const url = (b ?? '').trim()
  return { label: (a ?? '').trim() || url.replace(/^https?:\/\//, '').slice(0, 40), url }
}).filter((l) => l.url)

function Editor({ start, onSaved, onCancel }: { start: Meeting; onSaved: (m: Meeting) => void; onCancel: () => void }) {
  const [m, setM] = useState<Meeting>(start)
  const [links, setLinks] = useState<string[]>(start.agenda.map((a) => linksToText(a.links)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<Meeting>) => setM((x) => ({ ...x, ...patch }))
  const setItem = (i: number, patch: Partial<AgendaItem>) => setM((x) => ({ ...x, agenda: x.agenda.map((a, j) => (j === i ? { ...a, ...patch } : a)) }))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= m.agenda.length) return
    const a = [...m.agenda]; [a[i], a[j]] = [a[j], a[i]]
    const l = [...links]; [l[i], l[j]] = [l[j], l[i]]
    set({ agenda: a }); setLinks(l)
  }
  const save = async () => {
    setBusy(true); setError('')
    try {
      const agenda = m.agenda.map((a, i) => ({ ...a, links: textToLinks(links[i] ?? '') }))
      const r = await fetch('/api/bcps/team-meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'save', meeting: { ...m, agenda } }) })
      const j = await r.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not save.')
      onSaved(j.meeting)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="home-dept guide-sec tm-edit">
      <h3 className="home-card-title">{start.id ? 'Edit this meeting' : 'New meeting'}</h3>
      <div className="tm-grid">
        <label>Title<input value={m.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label>Date<input type="date" value={m.meeting_date} onChange={(e) => set({ meeting_date: e.target.value })} /></label>
        <label>Time<input value={m.time_label ?? ''} onChange={(e) => set({ time_label: e.target.value })} placeholder="11:00 AM to 12:00 PM" /></label>
        <label>Teams link<input value={m.join_url ?? ''} onChange={(e) => set({ join_url: e.target.value })} placeholder="https://teams.microsoft.com/..." /></label>
        <label className="tm-wide">Recording (a link or the embed code from Stream, YouTube or Vimeo)<input value={m.video_url ?? ''} onChange={(e) => set({ video_url: e.target.value })} placeholder="Paste after the meeting" /></label>
      </div>
      <h4 className="tm-h4">Agenda</h4>
      <ol className="tm-edit-items">
        {m.agenda.map((a, i) => (
          <li key={i}>
            <div className="tm-grid">
              <label className="tm-wide">Item<input value={a.title} onChange={(e) => setItem(i, { title: e.target.value })} /></label>
              <label>Who<input value={a.owner} onChange={(e) => setItem(i, { owner: e.target.value })} /></label>
              <label>Minutes<input type="number" min={0} value={a.minutes ?? ''} onChange={(e) => setItem(i, { minutes: e.target.value ? Number(e.target.value) : null })} /></label>
              <label className="tm-wide">Summary (shown on the agenda)<textarea rows={2} value={a.summary ?? ''} onChange={(e) => setItem(i, { summary: e.target.value })} /></label>
              <label className="tm-wide">Goal<textarea rows={2} value={a.goal ?? ''} onChange={(e) => setItem(i, { goal: e.target.value })} /></label>
              <label className="tm-wide">Done so far, one per line<textarea rows={3} value={(a.done ?? []).join('\n')} onChange={(e) => setItem(i, { done: lines(e.target.value) })} /></label>
              <label className="tm-wide">Still to do, one per line<textarea rows={3} value={(a.left ?? []).join('\n')} onChange={(e) => setItem(i, { left: lines(e.target.value) })} /></label>
              <label className="tm-wide">To raise in the meeting, one per line<textarea rows={2} value={(a.points ?? []).join('\n')} onChange={(e) => setItem(i, { points: lines(e.target.value) })} /></label>
              <label className="tm-wide">Background<textarea rows={2} value={a.detail} onChange={(e) => setItem(i, { detail: e.target.value })} /></label>
              <label className="tm-wide">Links, one per line (Label | https://...)<textarea rows={2} value={links[i] ?? ''} onChange={(e) => setLinks((l) => l.map((x, j) => (j === i ? e.target.value : x)))} /></label>
            </div>
            <div className="tm-row-tools">
              <button type="button" className="home-link-btn" onClick={() => move(i, -1)} disabled={i === 0}>Move up</button>
              <button type="button" className="home-link-btn" onClick={() => move(i, 1)} disabled={i === m.agenda.length - 1}>Move down</button>
              <button type="button" className="home-link-btn" onClick={() => { set({ agenda: m.agenda.filter((_, j) => j !== i) }); setLinks((l) => l.filter((_, j) => j !== i)) }}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="wcm-hub2-card-btn" onClick={() => { set({ agenda: [...m.agenda, { title: '', owner: '', minutes: 5, summary: '', detail: '', goal: '', done: [], left: [], points: [], links: [] }] }); setLinks((l) => [...l, '']) }}>Add an item</button>
      {error && <p className="tm-error" role="alert">{error}</p>}
      <div className="tm-actions">
        <button type="button" className="home-btn" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        <button type="button" className="home-link-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function AfterMeeting({ meeting, onSaved }: { meeting: Meeting; onSaved: (m: Meeting) => void }) {
  const [open, setOpen] = useState(!meeting.notes)
  const [text, setText] = useState('')
  const [file, setFile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (/\.docx$/i.test(f.name)) { setError('Word files cannot be read here. In Teams, download the transcript as .vtt, or open the Word file and paste the text.'); return }
    setError(''); setFile(f.name); setText(cleanTranscript(await f.text()))
  }
  const write = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/bcps/team-meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'notes', id: meeting.id, transcript: cleanTranscript(text) }) })
      const j = await r.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not write the notes.')
      setText(''); setFile(''); setOpen(false); onSaved(j.meeting)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (!open) return <p className="guide-body"><button type="button" className="home-link-btn" onClick={() => setOpen(true)}>Redo the notes from a new transcript</button></p>
  return (
    <div className="home-dept guide-sec">
      <h3 className="home-card-title">{meeting.notes ? 'Redo the notes' : 'After the meeting: turn this agenda into notes'}</h3>
      <p className="guide-body">Add the transcript and the notes are written here: a recap, what happened to each agenda item, decisions and action items. In Teams, open the meeting&apos;s Recap, download the transcript as .vtt, and choose it below, or paste the text.</p>
      <label className="tm-file">Choose a file (.vtt or .txt)<input type="file" accept=".vtt,.txt,.srt,.md,text/plain,text/vtt" onChange={(e) => onFile(e.target.files?.[0])} /></label>
      {file && <p className="guide-body">Read {file}.</p>}
      <textarea className="tm-transcript" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste the transcript here" />
      {error && <p className="tm-error" role="alert">{error}</p>}
      <div className="tm-actions">
        <button type="button" className="home-btn" onClick={write} disabled={busy || text.trim().length < 200}>{busy ? 'Writing the notes, about a minute...' : 'Write the notes'}</button>
        {meeting.notes && <button type="button" className="home-link-btn" onClick={() => setOpen(false)}>Cancel</button>}
      </div>
    </div>
  )
}

function Transcript({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null)
  const load = async () => {
    const r = await fetch('/api/bcps/team-meetings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ action: 'transcript', id }) })
    const j = await r.json().catch(() => ({}))
    setText(j.transcript ?? '')
  }
  return text === null
    ? <button type="button" className="home-link-btn" onClick={load}>Show the transcript</button>
    : <pre className="tm-pre">{text || 'No transcript saved.'}</pre>
}

export default function TeamMeetings() {
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'error'>('loading')
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [sel, setSel] = useState<string>('')
  const [editing, setEditing] = useState<Meeting | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const openItem = (i: number | null) => { setOpen(i); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const r = await fetch('/api/bcps/team-meetings', { headers: await authHeaders(), cache: 'no-store' })
        if (!live) return
        if (r.status === 401 || r.status === 403) { setState('denied'); return }
        const j = await r.json()
        if (!r.ok || !j.ok) { setState('error'); return }
        const list = (j.meetings ?? []) as Meeting[]
        setMeetings(list)
        const want = new URLSearchParams(window.location.search).get('meeting')
        const today = todayEastern()
        const pick = list.find((m) => m.id === want) ?? list.find((m) => m.meeting_date === today) ?? list[0]
        setSel(pick?.id ?? '')
        setState('ok')
      } catch { if (live) setState('error') }
    })()
    return () => { live = false }
  }, [])

  const meeting = useMemo(() => meetings.find((m) => m.id === sel) ?? null, [meetings, sel])
  const saved = (m: Meeting) => {
    setMeetings((list) => {
      const rest = list.filter((x) => x.id !== m.id)
      return [m, ...rest].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))
    })
    setSel(m.id ?? ''); setEditing(null)
  }

  if (state === 'loading') return <p className="guide-body" role="status">Loading the meetings...</p>
  if (state === 'denied') return <div className="home-dept guide-sec"><p className="guide-body">The Web Team Meeting notes are for Sean, Farrah and Felicia.</p></div>
  if (state === 'error') return <div className="home-dept guide-sec"><p className="guide-body">The meetings could not be loaded. Refresh the page to try again.</p></div>
  if (editing) return <Editor start={editing} onSaved={saved} onCancel={() => setEditing(null)} />

  const notes = meeting?.notes
  const minutes = meeting ? meeting.agenda.reduce((s, a) => s + (a.minutes ?? 0), 0) : 0
  const video = meeting?.video_url ? playable(meeting.video_url) : null

  const item = meeting && open !== null ? meeting.agenda[open] : null
  if (meeting && item && open !== null) {
    const out = notes?.items.find((x) => x.agenda_index === open)
    const prev = open > 0 ? open - 1 : null
    const next = open < meeting.agenda.length - 1 ? open + 1 : null
    return (
      <article className="home-dept guide-sec tm-article">
        <nav className="tm-crumbs" aria-label="Breadcrumb">
          <button type="button" className="home-link-btn" onClick={() => openItem(null)}>{notes ? 'Meeting notes' : 'Agenda'}</button>
          <span aria-hidden="true">›</span>
          <span>Item {open + 1}</span>
        </nav>
        <div className="guide-date-label">{fmtGuideDate(meeting.meeting_date, { weekday: 'long', month: 'short', day: 'numeric' })} · {meeting.title}</div>
        <h2 className="guide-h2 tm-article-title">{item.title}</h2>
        <p className="tm-article-meta">{[item.owner, item.minutes ? `${item.minutes} minutes` : ''].filter(Boolean).join(' · ')}</p>
        {(item.summary || item.detail) && <p className="tm-lede">{item.summary || item.detail}</p>}
        {out && <div className="tm-outcome"><b>{out.discussed ? 'What happened in the meeting: ' : ''}</b>{out.outcome}</div>}
        {item.goal && <section className="tm-block"><h3>Goal</h3><p>{item.goal}</p></section>}
        {!!item.done?.length && <section className="tm-block tm-done"><h3>Done so far</h3><ul>{item.done.map((d, j) => <li key={j}>{d}</li>)}</ul></section>}
        {!!item.left?.length && <section className="tm-block tm-left"><h3>Still to do</h3><ul>{item.left.map((d, j) => <li key={j}>{d}</li>)}</ul></section>}
        {!!item.points?.length && <section className="tm-block tm-points"><h3>To raise in the meeting</h3><ul>{item.points.map((d, j) => <li key={j}>{d}</li>)}</ul></section>}
        {item.summary && item.detail && <section className="tm-block"><h3>Background</h3><p>{item.detail}</p></section>}
        {item.links.length > 0 && <section className="tm-block"><h3>Links</h3><div className="tm-links">{item.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}</div></section>}
        <div className="tm-article-nav">
          <button type="button" className="wcm-hub2-card-btn" onClick={() => openItem(null)}>&larr; Back to the agenda</button>
          {next !== null && <button type="button" className="home-btn" onClick={() => openItem(next)}>Next: {meeting.agenda[next].title} &rarr;</button>}
          {next === null && prev !== null && <span />}
        </div>
      </article>
    )
  }

  return (
    <>
      <div className="tm-bar">
        {meetings.length > 0 && (
          <label className="tm-pick">Meeting
            <select value={sel} onChange={(e) => { setSel(e.target.value); setOpen(null) }}>
              {meetings.map((m) => <option key={m.id} value={m.id}>{fmtGuideDate(m.meeting_date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}{m.notes ? ' · notes' : ' · agenda'}</option>)}
            </select>
          </label>
        )}
        <button type="button" className="wcm-hub2-card-btn" onClick={() => setEditing(blank())}>New meeting</button>
        {meeting && <button type="button" className="home-link-btn" onClick={() => setEditing(meeting)}>Edit agenda and details</button>}
      </div>

      {!meeting && <div className="home-dept guide-sec"><p className="guide-body">No meetings yet. Start one with New meeting.</p></div>}

      {meeting && (
        <>
          <section className="home-dept guide-sec tm-head">
            <div>
              <div className="guide-date-label">{notes ? 'Meeting notes' : 'Agenda'}</div>
              <h2 className="guide-h2">{meeting.title}</h2>
              <p className="guide-body">
                {fmtGuideDate(meeting.meeting_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {meeting.time_label ? `, ${meeting.time_label}` : ''}
                {meeting.attendees.length ? `. ${meeting.attendees.join(', ')}` : ''}
                {minutes ? `. ${minutes} minutes planned.` : ''}
              </p>
            </div>
            {meeting.join_url && !notes && <a className="home-btn" href={meeting.join_url} target="_blank" rel="noopener noreferrer">Join on Teams</a>}
          </section>

          {notes && (
            <section className="home-dept guide-sec">
              <h3 className="home-card-title">Recap</h3>
              <p className="guide-body">{notes.summary}</p>
              {notes.action_items.length > 0 && (
                <>
                  <h4 className="tm-h4">Action items</h4>
                  <ul className="tm-actions-list">
                    {notes.action_items.map((a, i) => <li key={i}><b>{a.owner || 'Unassigned'}</b><span>{a.task}{a.due ? ` (by ${a.due})` : ''}</span></li>)}
                  </ul>
                </>
              )}
              {notes.decisions.length > 0 && (
                <>
                  <h4 className="tm-h4">Decisions</h4>
                  <ul>{notes.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </>
              )}
            </section>
          )}

          {meeting.video_url && (
            <section className="home-dept guide-sec">
              <h3 className="home-card-title">Recording</h3>
              {video?.kind === 'video' && <video className="tm-video" src={video.src} controls preload="metadata" />}
              {video?.kind === 'iframe' && <div className="tm-video-wrap"><iframe src={video.src} title={`${meeting.title} recording`} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen /></div>}
              <p className="guide-body"><a href={video?.src ?? meeting.video_url} target="_blank" rel="noopener noreferrer">Open the recording in a new tab</a>{video?.kind === 'iframe' ? ' if it does not play here.' : ''}</p>
            </section>
          )}

          <section className="home-dept guide-sec">
            <h3 className="home-card-title">{notes ? 'Agenda and what happened' : 'Agenda'}</h3>
            {meeting.agenda.length === 0 ? <p className="guide-body">No items yet. <button type="button" className="home-link-btn" onClick={() => setEditing(meeting)}>Add the agenda</button></p> : (
              <ol className="tm-agenda">
                {meeting.agenda.map((a, i) => {
                  const out = notes?.items.find((x) => x.agenda_index === i)
                  return (
                    <li key={i} className={out && !out.discussed ? 'tm-skipped' : ''}>
                      <div className="tm-item-head"><b>{a.title}</b><span>{[a.owner, a.minutes ? `${a.minutes} min` : ''].filter(Boolean).join(' · ')}</span></div>
                      {(a.summary || a.detail) && <p>{a.summary || a.detail}</p>}
                      {hasDetails(a)
                        ? <button type="button" className="tm-details-btn" onClick={() => openItem(i)}>Details &rarr;</button>
                        : a.links.length > 0 && (
                          <div className="tm-links">
                            {a.links.map((l, j) => <a key={j} href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a>)}
                          </div>
                        )}
                      {out && <p className="tm-outcome"><b>{out.discussed ? 'What happened: ' : ''}</b>{out.outcome}</p>}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {notes && notes.other_topics.length > 0 && (
            <section className="home-dept guide-sec">
              <h3 className="home-card-title">Also discussed</h3>
              <ul>{notes.other_topics.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </section>
          )}

          {meeting.id && <AfterMeeting key={meeting.id + (meeting.notes_at ?? '')} meeting={meeting} onSaved={saved} />}

          {meeting.has_transcript && meeting.id && (
            <section className="home-dept guide-sec">
              <h3 className="home-card-title">Transcript</h3>
              <Transcript key={meeting.id} id={meeting.id} />
            </section>
          )}
        </>
      )}
    </>
  )
}
