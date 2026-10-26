'use client'

// Messages, /?page=messages (V, 2026-10-26): the site inbox on its own page,
// opened from the topbar bell. Every message (a SiteFeedback report, or one
// started here) is a conversation: staff and the sender reply back and forth
// inside the platform, and each staff reply is also emailed to the sender.
// Staff can close a message that needs no reply, mark it unread again, and
// start a conversation with any member. A member sees only their own
// conversations and can write to the team. /api/bcps/messages decides who is
// staff on every call; this page only follows what it says.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Conversation {
  id: string
  created_at: string
  email: string | null
  sender_name: string | null
  page: string | null
  message: string
  status: string
  read_at: string | null
  replied_at: string | null
  closed_at: string | null
  closed_by: string | null
  last_activity_at: string | null
  user_id: string | null
  unread: boolean
}

interface Post {
  id: string
  created_at: string
  author_email: string | null
  author_name: string | null
  from_staff: boolean
  body: string | null
  audio_url: string | null
  email_error: string | null
}

type Box = 'open' | 'unread' | 'closed' | 'all'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await createClient().auth.getSession()).data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function postAction(body: Record<string, unknown>) {
  const r = await fetch('/api/bcps/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Something went wrong.')
  return j
}

function when(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const diffH = Math.floor((Date.now() - d.getTime()) / 3600000)
  if (diffH < 1) return 'Just now'
  if (diffH < 24) return `${diffH}h ago`
  if (diffH < 24 * 7) return `${Math.floor(diffH / 24)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function stamp(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function MessagesPage() {
  const router = useRouter()
  const search = useSearchParams()
  const threadId = search.get('thread')

  const [list, setList] = useState<Conversation[] | null>(null)
  const [isStaff, setIsStaff] = useState(false)
  const [failed, setFailed] = useState(false)
  const [box, setBox] = useState<Box>('open')
  const [q, setQ] = useState('')

  const [open, setOpen] = useState<{ message: Conversation; posts: Post[] } | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const [composing, setComposing] = useState(false)
  const [toEmail, setToEmail] = useState('')
  const [draft, setDraft] = useState('')

  const loadList = useCallback(async () => {
    try {
      const r = await fetch('/api/bcps/messages', { headers: await authHeaders(), cache: 'no-store' })
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json()
      setList(j.messages ?? [])
      setIsStaff(!!j.is_staff)
    } catch { setFailed(true) }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  const loadThread = useCallback(async (id: string, markRead: boolean) => {
    setOpenLoading(true)
    try {
      const r = await fetch(`/api/bcps/messages?id=${encodeURIComponent(id)}`, { headers: await authHeaders(), cache: 'no-store' })
      if (!r.ok) { setOpen(null); return }
      const j = await r.json()
      setOpen({ message: j.message, posts: j.posts ?? [] })
      if (markRead && j.message?.unread) {
        await postAction({ id, action: 'read' }).catch(() => {})
        loadList()
      }
    } finally { setOpenLoading(false) }
  }, [loadList])

  // The URL carries the open conversation, so an email link or the bell can
  // land right on it.
  useEffect(() => {
    setNotice(null)
    if (threadId) { setComposing(false); loadThread(threadId, true) } else setOpen(null)
  }, [threadId, loadThread])

  function select(id: string | null) {
    router.push(id ? `/?page=messages&thread=${id}` : '/?page=messages', { scroll: false })
  }

  async function act(action: 'close' | 'reopen' | 'unread' | 'request_access') {
    if (!open) return
    setBusy(true); setNotice(null)
    try {
      const j = await postAction({ id: open.message.id, action })
      if (action === 'unread') { await loadList(); select(null); return }
      if (action === 'request_access') {
        setNotice({ ok: true, text: j.already
          ? (j.status === 'approved' ? 'Access already granted for this person.' : 'A request is already pending with them.')
          : (j.warning ? `Request saved, but not emailed: ${j.warning}` : 'Access request sent to them by email.') })
      } else {
        setNotice({ ok: true, text: action === 'close' ? 'Closed. It moves to Closed, and comes back if they write again.' : 'Reopened.' })
      }
      await Promise.all([loadList(), loadThread(open.message.id, false)])
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally { setBusy(false) }
  }

  async function startConversation() {
    if (!draft.trim()) return
    setBusy(true); setNotice(null)
    try {
      const j = await postAction({ action: 'new', message: draft.trim(), to_email: isStaff ? toEmail.trim() : undefined })
      setDraft(''); setToEmail(''); setComposing(false)
      await loadList()
      select(j.id)
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : 'Something went wrong.' })
    } finally { setBusy(false) }
  }

  const visible = (list ?? []).filter(m => {
    if (isStaff) {
      if (box === 'open' && m.closed_at) return false
      if (box === 'unread' && !m.unread) return false
      if (box === 'closed' && !m.closed_at) return false
    }
    if (!q.trim()) return true
    const hay = `${m.sender_name ?? ''} ${m.email ?? ''} ${m.page ?? ''} ${m.message}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  const counts = {
    open: (list ?? []).filter(m => !m.closed_at).length,
    unread: (list ?? []).filter(m => m.unread).length,
    closed: (list ?? []).filter(m => m.closed_at).length,
    all: (list ?? []).length,
  }
  const paneOpen = !!threadId || composing

  return (
    <div className={`msgs${paneOpen ? ' msgs-pane-open' : ''}`}>
      <style>{CSS}</style>
      <div className="msgs-head">
        <div>
          <h1>Messages</h1>
          <p>{isStaff
            ? 'Site reports and conversations with members. Replies show here for them and are emailed to them too.'
            : 'Your conversations with the BCPS Marcomm team. Replies show up here and in your email.'}</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => { select(null); setComposing(true); setNotice(null) }}>
          New message
        </button>
      </div>

      <div className="msgs-grid">
        <section className="dash-panel msgs-list" aria-label="Conversations">
          {isStaff && (
            <div className="msgs-tabs" role="tablist" aria-label="Show">
              {(['open', 'unread', 'closed', 'all'] as Box[]).map(b => (
                <button key={b} type="button" role="tab" aria-selected={box === b} className={box === b ? 'btn-primary' : 'btn-outline'} onClick={() => setBox(b)}>
                  {b[0].toUpperCase() + b.slice(1)} <span className="msgs-count">{counts[b]}</span>
                </button>
              ))}
            </div>
          )}
          <input aria-label="Search messages" className="form-input msgs-search" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
          <div className="msgs-rows">
            {failed ? <p className="msgs-empty">Messages could not load right now.</p>
              : !list ? <p className="msgs-empty">Loading...</p>
              : visible.length === 0 ? <p className="msgs-empty">{list.length ? 'Nothing here.' : 'No messages yet.'}</p>
              : visible.map(m => (
                <button key={m.id} type="button" className={`msgs-row${m.id === threadId ? ' active' : ''}${m.unread ? ' unread' : ''}`} onClick={() => select(m.id)}>
                  <span className="msgs-row-top">
                    {m.unread && <span className="msgs-dot" aria-label="Unread" />}
                    <span className="msgs-from">{isStaff ? (m.sender_name || m.email || 'Not identified') : 'BCPS Marcomm team'}</span>
                    <span className="msgs-when">{when(m.last_activity_at || m.created_at)}</span>
                  </span>
                  <span className="msgs-snip">{m.message.length > 120 ? m.message.slice(0, 117) + '...' : m.message}</span>
                  <span className="msgs-tags">
                    {m.page && m.page !== 'Messages' && <span className="msgs-tag">{m.page}</span>}
                    {m.closed_at ? <span className="msgs-tag done">Closed</span>
                      : m.replied_at ? <span className="msgs-tag ok">Replied</span>
                      : isStaff ? <span className="msgs-tag todo">Needs reply</span> : null}
                  </span>
                </button>
              ))}
          </div>
        </section>

        <section className="dash-panel msgs-pane" aria-label="Conversation">
          {composing ? (
            <div>
              <button type="button" className="msgs-back" onClick={() => setComposing(false)}>&larr; All messages</button>
              <h2 className="msgs-title">New message</h2>
              {isStaff ? (
                <>
                  <label className="msgs-label" htmlFor="msgs-to">To (their bcpsmarcomm.com email)</label>
                  <input id="msgs-to" className="form-input" type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="name@browardschools.com" style={{ width: '100%' }} />
                  <p className="msgs-hint">It shows in their Messages and is emailed to them. Leave this empty to post a note to the team inbox instead.</p>
                </>
              ) : (
                <p className="msgs-hint">This goes to the BCPS Marcomm team. Their reply shows up here and in your email.</p>
              )}
              <label className="msgs-label" htmlFor="msgs-new">Message</label>
              <textarea id="msgs-new" rows={6} className="msgs-textarea" value={draft} onChange={e => setDraft(e.target.value)} />
              {notice && <p className={`msgs-notice${notice.ok ? ' ok' : ''}`}>{notice.text}</p>}
              <div className="msgs-actions">
                <button type="button" className="btn-primary" disabled={busy || !draft.trim()} onClick={startConversation}>{busy ? 'Sending...' : 'Send'}</button>
              </div>
            </div>
          ) : !threadId ? (
            <p className="msgs-empty msgs-pick">Pick a conversation to read it and reply.</p>
          ) : openLoading && !open ? (
            <p className="msgs-empty">Loading...</p>
          ) : !open ? (
            <p className="msgs-empty">This conversation could not be found.</p>
          ) : (
            <Thread
              key={open.message.id}
              data={open}
              isStaff={isStaff}
              busy={busy}
              notice={notice}
              onBack={() => select(null)}
              onAction={act}
              onSent={async (j) => {
                setNotice({ ok: !j.warning, text: isStaff
                  ? (j.warning ? `Saved here, but not emailed: ${j.warning}` : `Sent. It shows in their Messages and was emailed to ${open.message.email}.`)
                  : 'Sent to the team.' })
                await Promise.all([loadList(), loadThread(open.message.id, false)])
              }}
            />
          )}
        </section>
      </div>
    </div>
  )
}

function Thread({ data, isStaff, busy, notice, onBack, onAction, onSent }: {
  data: { message: Conversation; posts: Post[] }
  isStaff: boolean
  busy: boolean
  notice: { ok: boolean; text: string } | null
  onBack: () => void
  onAction: (a: 'close' | 'reopen' | 'unread' | 'request_access') => void
  onSent: (result: { warning?: string }) => Promise<void>
}) {
  const m = data.message
  const senderLabel = m.sender_name || m.email || 'Not identified'
  // A conversation a staff member started opens with their message, not the
  // member's (status replied from the first row, page Messages, no posts yet
  // from the member). The intake route never sets replied_by on insert.
  const staffStarted = m.page === 'Messages' && !!m.replied_at && m.replied_at === m.created_at

  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dictation and voice notes, carried over from the dashboard inbox (Sean,
  // 2026-07-29): no gate, both offered outright.
  const [dictating, setDictating] = useState(false)
  const [recording, setRecording] = useState(false)
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null)
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null)
  const recognitionRef = useRef<any>(null)
  const dictationBaseRef = useRef('')
  const finalTranscriptRef = useRef('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [data.posts.length])

  function startDictation() {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Ctor) { setError("Dictation isn't supported in this browser yet. Try typing, or use Chrome/Safari."); return }
    dictationBaseRef.current = reply ? reply.trim() + ' ' : ''
    finalTranscriptRef.current = ''
    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    // Only walk NEW results from e.resultIndex; walking from 0 re-adds
    // committed text in continuous mode (GeekFon fix, 2026-07-28).
    recognition.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalTranscriptRef.current += t + ' '
        else interim += t
      }
      setReply((dictationBaseRef.current + finalTranscriptRef.current).trimStart() + (interim ? '…' + interim : ''))
    }
    recognition.onerror = () => setDictating(false)
    recognition.onend = () => {
      setDictating(false)
      setReply((dictationBaseRef.current + finalTranscriptRef.current).trimStart())
    }
    recognitionRef.current = recognition
    recognition.start()
    setDictating(true)
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) { setError("Voice notes need microphone access, which isn't available here."); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setVoiceBlob(blob)
        setVoiceUrl(URL.createObjectURL(blob))
        setRecording(false)
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
    } catch {
      setError('Microphone access was blocked or unavailable.')
    }
  }

  function discardVoice() { setVoiceBlob(null); setVoiceUrl(null) }

  function handleMicClick() {
    if (recording) { recorderRef.current?.stop(); return }
    if (dictating) { recognitionRef.current?.stop(); return }
    setMicMenuOpen(v => !v)
  }

  async function send() {
    if (!reply.trim() && !voiceBlob) return
    setSending(true); setError(null)
    try {
      const audio_base64 = voiceBlob ? await blobToBase64(voiceBlob) : undefined
      const j = await postAction({ id: m.id, action: 'reply', reply_text: reply.trim(), audio_base64 })
      setReply(''); discardVoice()
      await onSent(j)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send.')
    } finally { setSending(false) }
  }

  return (
    <div className="msgs-thread">
      <button type="button" className="msgs-back" onClick={onBack}>&larr; All messages</button>
      <div className="msgs-thread-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="msgs-title">{isStaff ? senderLabel : 'BCPS Marcomm team'}</h2>
          <div className="msgs-meta">
            {isStaff && m.sender_name && m.email ? `${m.email} · ` : ''}
            {m.page && m.page !== 'Messages' ? `Sent from ${m.page} · ` : ''}
            {stamp(m.created_at)}
            {m.closed_at ? ` · Closed ${when(m.closed_at)}${m.closed_by ? ` by ${m.closed_by}` : ''}` : ''}
          </div>
        </div>
        {isStaff && (
          <div className="msgs-tools">
            {m.closed_at
              ? <button type="button" className="btn-outline" disabled={busy} onClick={() => onAction('reopen')}>Reopen</button>
              : <button type="button" className="btn-outline" disabled={busy} onClick={() => onAction('close')} title="Handled, no reply needed">Close, no reply needed</button>}
            <button type="button" className="btn-outline" disabled={busy} onClick={() => onAction('unread')}>Mark unread</button>
            {m.user_id && <button type="button" className="btn-outline" disabled={busy} onClick={() => onAction('request_access')} title="Ask them for read-only access to their account">Request access</button>}
          </div>
        )}
      </div>
      {notice && <p className={`msgs-notice${notice.ok ? ' ok' : ''}`}>{notice.text}</p>}

      <div className="msgs-bubbles">
        <Bubble mine={isStaff ? staffStarted : !staffStarted} who={staffStarted ? 'BCPS Marcomm team' : (isStaff ? senderLabel : 'You')} at={m.created_at} body={m.message} />
        {data.posts.map(p => (
          <Bubble key={p.id}
            mine={isStaff ? p.from_staff : !p.from_staff}
            who={p.from_staff ? (isStaff ? (p.author_name || p.author_email || 'Staff') : 'BCPS Marcomm team') : (isStaff ? senderLabel : 'You')}
            at={p.created_at} body={p.body} audio={p.audio_url}
            note={isStaff && p.from_staff ? (p.email_error ? `Not emailed: ${p.email_error}` : 'Also emailed') : null} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="msgs-compose">
        <label className="msgs-label" htmlFor={`msgs-reply-${m.id}`}>Reply</label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <textarea id={`msgs-reply-${m.id}`} rows={4} className="msgs-textarea" value={reply} onChange={e => setReply(e.target.value)}
            placeholder={isStaff ? (m.email ? `Reply to ${m.email}` : 'No email on file: this will be saved here only.') : 'Write back to the team'} />
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button type="button" onClick={handleMicClick} aria-label="Dictate or record a voice reply" title="Dictate or record a voice reply"
              className={`msgs-mic${recording || dictating ? ' live' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            {micMenuOpen && (
              <div className="msgs-micmenu">
                <button type="button" onClick={() => { setMicMenuOpen(false); startDictation() }}>Dictate</button>
                <button type="button" onClick={() => { setMicMenuOpen(false); startRecording() }}>Record voice note</button>
              </div>
            )}
          </div>
        </div>
        {(dictating || recording) && <p className="msgs-live">{dictating ? 'Listening…' : 'Recording…'} Click the mic to stop.</p>}
        {voiceUrl && !recording && (
          <div className="msgs-voice">
            <audio controls src={voiceUrl} />
            <button type="button" onClick={discardVoice} aria-label="Discard voice note">&times;</button>
          </div>
        )}
        {error && <p className="msgs-notice">{error}</p>}
        <div className="msgs-actions">
          <button type="button" className="btn-primary" disabled={sending || (!reply.trim() && !voiceBlob)} onClick={send}>{sending ? 'Sending...' : 'Send reply'}</button>
          <span className="msgs-hint" style={{ margin: 0 }}>
            {isStaff
              ? (m.user_id
                  ? `Shows in their Messages here and is emailed to ${m.email || 'them'}.`
                  : (m.email ? `This person has no account, so it is emailed to ${m.email} only.` : 'No email or account on file: saved here only.'))
              : 'Shows here for the team, and they get an email.'}
          </span>
        </div>
      </div>
    </div>
  )
}

function Bubble({ mine, who, at, body, audio, note }: { mine: boolean; who: string; at: string; body: string | null; audio?: string | null; note?: string | null }) {
  return (
    <div className={`msgs-bubble${mine ? ' mine' : ''}`}>
      <div className="msgs-bubble-who">{who} &middot; {stamp(at)}</div>
      {body && <div className="msgs-bubble-body">{body}</div>}
      {audio && <audio controls src={audio} style={{ width: '100%', height: 32, marginTop: body ? 8 : 0 }} />}
      {note && <div className="msgs-bubble-note">{note}</div>}
    </div>
  )
}

const CSS = `
.msgs { padding: 32px; width: 100%; box-sizing: border-box; }
.msgs-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.msgs-head h1 { font-size: 26px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0 0 4px; }
.msgs-head p { font-size: 13px; color: var(--text-muted); margin: 0; max-width: 640px; }
.msgs-grid { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 16px; align-items: start; }
.msgs-list { padding: 14px; }
.msgs-tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.msgs-tabs button { font-size: 11.5px; padding: 4px 10px; }
.msgs-count { opacity: .75; margin-left: 2px; }
.msgs-search { width: 100%; box-sizing: border-box; margin-bottom: 8px; }
.msgs-rows { max-height: calc(100vh - 300px); min-height: 200px; overflow-y: auto; }
.msgs-row { display: flex; flex-direction: column; gap: 4px; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--border); padding: 10px 8px; cursor: pointer; font: inherit; border-radius: 6px; }
.msgs-row:hover { background: var(--bg-page); }
.msgs-row.active { background: var(--blue-xlight); }
.msgs-row-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.msgs-from { font-weight: 600; font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.msgs-row.unread .msgs-from { font-weight: 800; }
.msgs-when { font-size: 11.5px; color: var(--text-muted); flex-shrink: 0; }
.msgs-dot { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; flex-shrink: 0; }
.msgs-snip { font-size: 12px; color: var(--text-muted); line-height: 1.5; overflow-wrap: anywhere; }
.msgs-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.msgs-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: #eef2f6; color: #3c4a5a; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msgs-tag.ok { background: #e6f4ea; color: #1e6b3a; }
.msgs-tag.todo { background: #fdf3e0; color: #8a5a00; }
.msgs-tag.done { background: #e5e7eb; color: #374151; }
.msgs-empty { padding: 16px 0; color: var(--text-muted); font-size: 13px; margin: 0; }
.msgs-pick { padding: 48px 0; text-align: center; }
.msgs-pane { padding: 20px; min-height: 360px; }
.msgs-back { display: none; background: none; border: none; color: var(--primary); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; margin-bottom: 10px; }
.msgs-thread-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
.msgs-title { font-size: 18px; font-weight: 800; margin: 0; overflow-wrap: anywhere; }
.msgs-meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; overflow-wrap: anywhere; }
.msgs-tools { display: flex; gap: 6px; flex-wrap: wrap; }
.msgs-tools button { font-size: 12px; padding: 6px 10px; }
.msgs-bubbles { display: flex; flex-direction: column; gap: 10px; padding: 16px 0; max-height: calc(100vh - 460px); min-height: 120px; overflow-y: auto; }
.msgs-bubble { align-self: flex-start; max-width: 85%; background: var(--bg-page); border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px; }
.msgs-bubble.mine { align-self: flex-end; background: var(--blue-xlight); border-color: #c7e1f1; }
.msgs-bubble-who { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 4px; }
.msgs-bubble-body { font-size: 14px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.msgs-bubble-note { font-size: 10.5px; color: var(--text-muted); margin-top: 6px; }
.msgs-compose { border-top: 1px solid var(--border); padding-top: 12px; }
.msgs-label { display: block; font-size: 12px; font-weight: 700; margin: 10px 0 6px; }
.msgs-textarea { flex: 1; width: 100%; border: 1px solid var(--border); border-radius: 6px; padding: 10px 12px; font-size: 14px; font-family: inherit; resize: vertical; box-sizing: border-box; }
.msgs-hint { font-size: 12px; color: var(--text-muted); margin: 6px 0 0; }
.msgs-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.msgs-notice { font-size: 12.5px; color: #c0392b; margin: 8px 0 0; }
.msgs-notice.ok { color: #16750C; }
.msgs-mic { width: 36px; height: 36px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; border: 1px solid var(--border); background: #fff; color: var(--text-muted); }
.msgs-mic.live { border: none; background: #c0392b; color: #fff; }
.msgs-micmenu { position: absolute; bottom: 44px; right: 0; background: #fff; border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.14); padding: 6px; display: flex; flex-direction: column; gap: 2px; min-width: 170px; z-index: 5; }
.msgs-micmenu button { font: inherit; font-size: 13px; font-weight: 700; background: none; border: none; border-radius: 8px; padding: 9px 10px; cursor: pointer; text-align: left; white-space: nowrap; }
.msgs-micmenu button:hover { background: var(--bg-page); }
.msgs-live { font-size: 11.5px; color: #c0392b; font-weight: 700; margin: 6px 0 0; }
.msgs-voice { display: flex; align-items: center; gap: 10px; background: var(--bg-page); border: 1px solid var(--border); border-radius: 100px; padding: 6px 8px 6px 14px; margin-top: 8px; }
.msgs-voice audio { height: 32px; flex: 1; min-width: 0; }
.msgs-voice button { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text-muted); }
@media (max-width: 860px) {
  .msgs { padding: 16px; }
  .msgs-grid { grid-template-columns: 1fr; }
  .msgs-pane-open .msgs-list { display: none; }
  .msgs:not(.msgs-pane-open) .msgs-pane { display: none; }
  .msgs-back { display: inline-block; }
  .msgs-rows { max-height: none; }
  .msgs-bubbles { max-height: none; }
}
`
