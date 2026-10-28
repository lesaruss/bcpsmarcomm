'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cleanTranscript } from '@/components/bcps/MeetingTranscriptUpload'

// Complete a Playbook item from the document (V, 2026-10-28). Opens from the
// Complete button beside a Work Queue or Action Items entry, shown only to the
// item's owner and the superadmin. The person writes what they did, drops in
// any number of files, or has Claude draft the response from a transcript or
// notes file; the item then moves to Completed with the response and links.
// Data: /api/bcps/playbook-items.
//
// mode 'input' (V, 2026-10-28): the same dialog lets any reader add their
// input to an open question, a Missing or Draft section, or the page in
// general. Input shows on the page as team input until a lead accepts or
// dismisses it. Data: /api/bcps/playbook-input.

const supabaseClient = createClient()
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabaseClient.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface CompletableItem { kind: 'queue' | 'action'; key: string; text: string }
export interface InputTarget { kind: 'question' | 'section' | 'general'; key: string; text: string }
type Mode = 'complete' | 'input'

const INPUT_PROMPT: Record<InputTarget['kind'], string> = {
  question: 'Answer this question with what you know. Attach anything that backs it up.',
  section: 'Add what this section is missing, or what should change. Attach any files that help.',
  general: 'Share a thought, an idea, a concern or a file for the team. The project lead reviews it.',
}

const TEXT_FILE = /\.(vtt|txt|md|srt)$/i
const MAX_FILES = 10

function size(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}

async function post(body: Record<string, unknown>, endpoint = '/api/bcps/playbook-items') {
  const res = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({ error: 'The server did not answer. Try again.' }))
  if (!res.ok) throw new Error(j.error || 'Something went wrong.')
  return j
}

export default function CompleteItemDialog({ slug, item, onClose, onDone, mode = 'complete' }: { slug: string; item: CompletableItem | InputTarget; onClose: () => void; onDone: (message: string) => void; mode?: Mode }) {
  const isInput = mode === 'input'
  const endpoint = isInput ? '/api/bcps/playbook-input' : '/api/bcps/playbook-items'
  const call = (body: Record<string, unknown>) => post(body, endpoint)
  const [prompt, setPrompt] = useState('')
  const [expectsFiles, setExpectsFiles] = useState(false)
  const [response, setResponse] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<'' | 'drafting' | 'saving'>('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const scope = { slug, kind: item.kind, key: item.key }

  useEffect(() => {
    let live = true
    if (isInput) {
      setPrompt(INPUT_PROMPT[item.kind as InputTarget['kind']] ?? INPUT_PROMPT.general)
    } else post({ ...scope, action: 'prompt' })
      .then((j) => { if (live) { setPrompt(j.prompt || ''); setExpectsFiles(!!j.expects_files) } })
      .catch(() => { if (live) setPrompt('Say what you did to complete this item, and attach anything it produced.') })
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => { live = false; window.removeEventListener('keydown', onKey) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.key])

  const add = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...files]
    for (const f of Array.from(list)) {
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue
      if (f.size > 50 * 1024 * 1024) { setError(`${f.name} is larger than 50 MB.`); continue }
      next.push(f)
    }
    if (next.length > MAX_FILES) setError(`Attach up to ${MAX_FILES} files.`)
    setFiles(next.slice(0, MAX_FILES))
  }

  const draft = async (f: File) => {
    if (response.trim() && !window.confirm('Replace what you have written with a draft from this file?')) return
    setBusy('drafting'); setError('')
    try {
      const j = await call({ ...scope, action: 'draft', source_name: f.name, source_text: cleanTranscript(await f.text()) })
      setResponse(j.response || '')
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  const save = async () => {
    setBusy('saving'); setError('')
    try {
      let uploaded: { name: string; path: string; size: number }[] = []
      if (files.length) {
        setStatus('Preparing the upload...')
        const j = await call({ ...scope, action: 'upload_urls', files: files.map((f) => ({ name: f.name, size: f.size })) })
        const slots = j.uploads as { name: string; path: string; token: string }[]
        for (let i = 0; i < slots.length; i++) {
          setStatus(`Uploading ${i + 1} of ${slots.length}: ${files[i].name}`)
          const { error: upErr } = await supabaseClient.storage.from('playbook-attachments').uploadToSignedUrl(slots[i].path, slots[i].token, files[i], { contentType: files[i].type || undefined })
          if (upErr) throw new Error(`${files[i].name} did not upload. ${isInput ? 'Nothing was shared.' : 'Nothing was marked complete.'}`)
        }
        uploaded = slots.map((s, i) => ({ name: s.name, path: s.path, size: files[i].size }))
      }
      setStatus('Updating the page...')
      if (isInput) {
        await call({ ...scope, action: 'add', response, files: uploaded })
        onDone('Shared. Your input is on the page now, and the project lead will review it.')
        return
      }
      const j = await call({ ...scope, action: 'complete', response, files: uploaded })
      const n = (j.completed as string[] | undefined)?.length ?? 1
      onDone(n > 1 ? 'Turned in. It is marked done on your to-do list and in Action Items.' : 'Turned in. It is marked done on your to-do list.')
    } catch (e) { setError((e as Error).message); setStatus('') } finally { setBusy('') }
  }

  const textFiles = files.filter((f) => TEXT_FILE.test(f.name))

  return (
    <div className="cid-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cid-panel" role="dialog" aria-modal="true" aria-labelledby="cid-title">
        <div className="cid-head">
          <h2 id="cid-title">{isInput ? 'Add your input' : 'Turn in my work'}</h2>
          <button type="button" className="cid-x" aria-label="Close" disabled={!!busy} onClick={onClose}>&times;</button>
        </div>
        <p className="cid-item">{item.text}</p>
        <p className="cid-prompt">{prompt || 'Reading what this item asks for...'}</p>
        {error && <div className="cid-error" role="alert">{error}</div>}

        <label className="cid-block">
          <span className="cid-l">{isInput ? 'Your input' : 'Your response'}</span>
          <textarea rows={5} value={response} onChange={(e) => setResponse(e.target.value)} disabled={busy === 'drafting'}
            placeholder={busy === 'drafting' ? 'Drafting from your file...' : 'What you did, when, and who it went to.'} />
        </label>

        <div
          className={`cid-drop${over ? ' over' : ''}${expectsFiles && !files.length ? ' ask' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files) }}
          onClick={() => input.current?.click()}
          role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click() } }}
        >
          <strong>Drag files here</strong> or click to choose. Documents, decks, spreadsheets, images, or a meeting transcript. Up to {MAX_FILES} files, 50 MB each.
          <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
        </div>

        {files.length > 0 && (
          <ul className="cid-files">
            {files.map((f, i) => (
              <li key={f.name + i}>
                <span>{f.name} <em>{size(f.size)}</em></span>
                {TEXT_FILE.test(f.name) && <button type="button" className="cid-link" disabled={!!busy} onClick={() => draft(f)}>Draft my response from this</button>}
                <button type="button" className="cid-link" disabled={!!busy} aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {textFiles.length > 0 && !response && <p className="cid-hint">Tip: Claude can draft your response from {textFiles.length === 1 ? textFiles[0].name : 'one of these files'}.</p>}

        <div className="cid-actions">
          {status && <span className="cid-status" role="status">{status}</span>}
          <button type="button" className="cid-btn ghost" disabled={!!busy} onClick={onClose}>Cancel</button>
          <button type="button" className="cid-btn" disabled={!!busy || (!response.trim() && !files.length)} onClick={save}>
            {busy === 'saving' ? 'Saving...' : isInput ? 'Share my input' : 'Turn it in'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CSS = `
.cid-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1000; display: flex; justify-content: center; align-items: flex-start; padding: 40px 16px; overflow-y: auto; }
.cid-panel { background: #fff; border-radius: 10px; width: min(680px, 100%); padding: 24px 28px; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; box-sizing: border-box; }
.cid-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.cid-head h2 { font-size: 20px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.01em; margin: 0; }
.cid-x { font-size: 26px; line-height: 1; background: none; border: 0; cursor: pointer; color: rgba(26,26,26,0.6); }
.cid-item { font-size: 15px; font-weight: 700; line-height: 1.5; margin: 0 0 8px; }
.cid-prompt { font-size: 13px; line-height: 1.6; color: #0e4e73; background: rgba(22,114,167,0.07); border-left: 3px solid #1672A7; border-radius: 0 6px 6px 0; padding: 10px 14px; margin: 0 0 16px; }
.cid-l { display: block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: rgba(26,26,26,0.5); margin-bottom: 4px; }
.cid-block { display: block; margin-bottom: 12px; }
.cid-panel textarea { font: inherit; font-size: 13px; padding: 9px 12px; border: 1px solid rgba(0,0,0,0.18); border-radius: 6px; width: 100%; box-sizing: border-box; resize: vertical; }
.cid-drop { border: 2px dashed rgba(22,114,167,0.35); border-radius: 8px; padding: 18px; text-align: center; font-size: 13px; line-height: 1.6; color: rgba(26,26,26,0.7); cursor: pointer; background: #fafafa; }
.cid-drop strong { color: #0e4e73; }
.cid-drop.over { background: rgba(22,114,167,0.08); border-color: #1672A7; }
.cid-drop.ask { border-color: #1672A7; }
.cid-files { list-style: none; padding: 0; margin: 10px 0 0; display: flex; flex-direction: column; gap: 6px; }
.cid-files li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 13px; padding: 8px 12px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; }
.cid-files li > span { flex: 1; min-width: 160px; word-break: break-word; }
.cid-files em { font-style: normal; color: rgba(26,26,26,0.5); font-size: 11px; margin-left: 6px; }
.cid-link { font: inherit; font-size: 12px; font-weight: 700; color: #0e4e73; background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.cid-link:disabled { opacity: 0.5; cursor: default; }
.cid-hint { font-size: 12px; color: rgba(26,26,26,0.6); margin: 8px 0 0; }
.cid-error { background: rgba(185,28,28,0.07); border-left: 4px solid #b91c1c; padding: 10px 14px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; }
.cid-actions { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.cid-status { font-size: 12px; color: rgba(26,26,26,0.6); margin-right: auto; }
.cid-btn { font: inherit; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; padding: 9px 16px; border-radius: 6px; border: 1px solid #1672A7; background: #1672A7; color: #fff; cursor: pointer; }
.cid-btn.ghost { background: #fff; color: #0e4e73; }
.cid-btn:disabled { opacity: 0.5; cursor: default; }
@media (max-width: 640px) { .cid-panel { padding: 18px 16px; } }
`
