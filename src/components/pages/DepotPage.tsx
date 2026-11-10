'use client'

// The Depot (Sean, 2026-11-09): BCPS MarComm's studio for videos and other
// media. A project is a lookbook, the format of the HQ podcast studio
// (lesaruss-hq components/branddesk/PodcastRoom.tsx): numbered tiles beside a
// player, one card per tile with its stills, its words and its voice line.
// A tile opens in the player once it is approved; the whole piece plays once
// every tile is. The finished video sits under the player with a place for
// notes on it. SuperAdmin only; the API is /api/bcps/depot.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const supabase = createClient()
const MEDIA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
const media = (p: string | null | undefined) => (p ? MEDIA + p : '')

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data.session?.access_token
  return t ? { Authorization: `Bearer ${t}` } : {}
}

interface Still { path: string; at: number }
interface Tile {
  id: string; project_id: string; position: number; title: string; script: string; stills: Still[]
  audio_path: string | null; audio_seconds: number | null; checked: boolean | null
  status: 'script' | 'voiced' | 'approved'; voice_request_at: string | null; version: number; note: string | null; updated_at: string
}
interface Project {
  id: string; slug: string; title: string; kind: string; audience: string | null; surface: string | null; status: string
  final_path: string | null; poster_path: string | null; render_request_at: string | null
  feedback: { at: string; text: string; done: boolean; by?: string }[]
}
interface ListItem { id: string; slug: string; title: string; audience: string | null; status: string; tiles: number; approved: number; cover: string | null; final_path: string | null }

const pad = (n: number) => String(n).padStart(2, '0')
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const STATUS: Record<Tile['status'], string> = { script: 'Words only', voiced: 'Voiced', approved: 'Approved' }

async function api(body: Record<string, unknown>) {
  const res = await fetch('/api/bcps/depot', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Something went wrong.')
  return j
}

async function upload(projectId: string, kind: 'still' | 'audio' | 'final' | 'poster', file: File) {
  const slot = await api({ action: 'upload_start', project_id: projectId, kind, name: file.name })
  const { error } = await supabase.storage.from(slot.bucket).uploadToSignedUrl(slot.path, slot.token, file, { contentType: file.type || undefined })
  if (error) throw new Error('The upload did not go through. Try again.')
  return slot.path as string
}

function audioLength(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const a = new Audio(); const url = URL.createObjectURL(file)
    a.preload = 'metadata'; a.src = url
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(a.duration) ? a.duration : null) }
    a.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
  })
}

export default function DepotPage() {
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const slug = search.get('project')
  const go = (s: string | null) => router.push(s ? `${pathname}?page=depot&project=${encodeURIComponent(s)}` : `${pathname}?page=depot`, { scroll: false })
  return (
    <div className="depot">
      <style>{CSS}</style>
      {slug ? <ProjectView slug={slug} onBack={() => go(null)} /> : <Projects onOpen={go} />}
    </div>
  )
}

function Projects({ onOpen }: { onOpen: (slug: string) => void }) {
  const [list, setList] = useState<ListItem[] | null>(null)
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    (async () => {
      const res = await fetch('/api/bcps/depot?v=projects', { headers: await authHeaders(), cache: 'no-store' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setErr(j.error || 'Could not load the Depot.'); else setList(j.projects)
    })()
  }, [])
  const create = async () => {
    try { const j = await api({ action: 'project_create', title }); onOpen(j.slug) } catch (e) { setErr((e as Error).message) }
  }
  return (
    <>
      <header className="dp-head">
        <p className="dp-eyebrow">BCPS MarComm</p>
        <h1>The Depot</h1>
        <p className="dp-muted">Videos and media for the District, built tile by tile. Each tile is a still and a line in Sean&apos;s voice; approve them one at a time, then play the whole piece.</p>
      </header>
      <div className="dp-new">
        <label htmlFor="dp-new-title" className="dp-sr">New project name</label>
        <input id="dp-new-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New project, e.g. Director walkthrough for Finance" maxLength={140}
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) create() }} />
        <button type="button" className="dp-btn" disabled={!title.trim()} onClick={create}>Start a project</button>
      </div>
      {err && <p className="dp-err" role="alert">{err}</p>}
      {!list && !err && <p className="dp-muted">Loading the Depot…</p>}
      {list && !list.length && <p className="dp-muted">Nothing here yet. Start a project above.</p>}
      <div className="dp-grid">
        {(list ?? []).map((p) => (
          <button type="button" key={p.id} className="dp-proj" onClick={() => onOpen(p.slug)}>
            <span className="dp-proj-cover">{p.cover
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={media(p.cover)} alt="" /> : <b>▶</b>}</span>
            <span className="dp-proj-title">{p.title}</span>
            {p.audience && <span className="dp-muted dp-small">{p.audience}</span>}
            <span className="dp-small"><b>{p.approved} of {p.tiles}</b> tiles approved{p.final_path ? ' · video ready' : ''}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function ProjectView({ slug, onBack }: { slug: string; onBack: () => void }) {
  const [project, setProject] = useState<Project | null>(null)
  const [tiles, setTiles] = useState<Tile[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const load = useCallback(async () => {
    const res = await fetch(`/api/bcps/depot?v=project&slug=${encodeURIComponent(slug)}`, { headers: await authHeaders(), cache: 'no-store' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(j.error || 'Could not load the project.'); return }
    setProject(j.project); setTiles(j.tiles)
  }, [slug])
  useEffect(() => { load() }, [load])
  const run = useCallback(async (key: string, body: Record<string, unknown>) => {
    setBusy(key); setErr('')
    try { const j = await api(body); await load(); return j } catch (e) { setErr((e as Error).message); return null } finally { setBusy('') }
  }, [load])

  if (!project) return <>{err ? <p className="dp-err">{err}</p> : <p className="dp-muted">Loading…</p>}</>
  const approved = tiles.filter((t) => t.status === 'approved').length
  const all = tiles.length > 0 && approved === tiles.length
  return (
    <>
      <p className="dp-crumbs"><button type="button" onClick={onBack}>The Depot</button> / {project.title}</p>
      <header className="dp-head">
        <p className="dp-eyebrow">{project.kind === 'video' ? 'Video' : project.kind} · {approved} of {tiles.length} tiles approved</p>
        <h1>{project.title}</h1>
        {project.audience && <p className="dp-muted">For {project.audience}</p>}
        {project.surface && <p className="dp-muted dp-small">Plays at {project.surface}</p>}
      </header>
      {err && <p className="dp-err" role="alert">{err}</p>}

      <PlayThrough tiles={tiles} />

      <section className="dp-final" aria-label="The finished video">
        <div>
          <h2>The finished video</h2>
          {project.final_path
            ? <video controls preload="metadata" playsInline src={media(project.final_path)} poster={media(project.poster_path)} />
            : <p className="dp-muted">No finished file yet. {all ? 'Every tile is approved: request the render.' : 'Approve every tile, then request the render.'}</p>}
        </div>
        <div className="dp-final-side">
          {project.render_request_at && <p className="dp-tag wait">Render requested {when(project.render_request_at)}</p>}
          <button type="button" className="dp-btn" disabled={!all || !!busy} onClick={() => run('render', { action: 'render_request', id: project.id })}
            title={all ? '' : 'Opens once every tile is approved'}>{project.final_path ? 'Render again from the tiles' : 'Request the render'}</button>
          <FileButton label="Upload the finished video" accept="video/mp4,video/webm,video/quicktime" disabled={!!busy}
            onFile={async (f) => { setBusy('final'); try { const path = await upload(project.id, 'final', f); await api({ action: 'upload_done', project_id: project.id, kind: 'final', path }); await load() } catch (e) { setErr((e as Error).message) } finally { setBusy('') } }} />
          <Feedback project={project} run={run} busy={busy} />
        </div>
      </section>

      <h2 className="dp-h2">The tiles</h2>
      <MicPicker />
      <div className="dp-cards">
        {tiles.map((t, i) => (
          <TileCard key={t.id} n={i + 1} tile={t} first={i === 0} last={i === tiles.length - 1} projectId={project.id} run={run} busy={busy} reload={load} setErr={setErr} />
        ))}
      </div>
      <button type="button" className="dp-btn ghost" disabled={!!busy} onClick={() => run('add', { action: 'tile_add', project_id: project.id })}>Add a tile</button>
    </>
  )
}

type Run = (key: string, body: Record<string, unknown>) => Promise<unknown>

// The run sheet beside a stage, as in the HQ lookbook. An approved tile is
// open and plays from there through the approved tiles after it; a tile still
// waiting takes you to its card. The stage shows each still as its moment in
// the line comes up.
function PlayThrough({ tiles }: { tiles: Tile[] }) {
  const [i, setI] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const voice = useRef<HTMLAudioElement>(null)
  const ok = (x: Tile) => x.status === 'approved' && !!x.audio_path
  const approved = tiles.filter(ok).length
  const full = tiles.length > 0 && approved === tiles.length
  const cur = i >= 0 ? tiles[i] : null
  const nextOk = (from: number) => { for (let n = from; n < tiles.length; n++) if (ok(tiles[n])) return n; return -1 }
  const start = (n: number) => {
    const m = nextOk(n)
    if (m < 0) { setI(-1); setPlaying(false); voice.current?.pause(); return }
    setI(m); setT(0); setPlaying(true)
    const v = voice.current!
    v.src = media(tiles[m].audio_path); v.play().catch(() => setPlaying(false))
  }
  const still = useMemo(() => {
    if (!cur) return tiles.find((x) => x.stills?.length)?.stills[0]?.path ?? null
    const s = (cur.stills ?? []).filter((x) => x.at <= t + 0.05)
    return (s[s.length - 1] ?? cur.stills?.[0])?.path ?? null
  }, [cur, t, tiles])
  const tile = (n: number) => {
    if (ok(tiles[n])) start(n)
    else document.getElementById(`dp-tile-${tiles[n].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return (
    <section className="dp-lb" aria-label="Play through">
      <div className="dp-lb-stage">
        <div className="dp-lb-frame">
          {still
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={media(still)} alt="" /> : <b>▶</b>}
        </div>
        <div className="dp-lb-now">
          <p><b>{cur ? `${pad(i + 1)} · ${cur.title}` : full ? 'Every tile is approved.' : `${approved} of ${tiles.length} tiles approved`}</b></p>
          <p className="dp-muted dp-small">{cur ? (playing ? 'Playing' : 'Paused') : full ? 'Play the whole piece from the first tile.' : 'Approve a tile below and it opens here. Tap an open tile to play from there.'}</p>
        </div>
        <div className="dp-line">
          {playing
            ? <button type="button" className="dp-btn" onClick={() => { voice.current?.pause(); setPlaying(false) }}>❚❚ Pause</button>
            : i >= 0
              ? <button type="button" className="dp-btn" onClick={() => { setPlaying(true); voice.current?.play().catch(() => setPlaying(false)) }}>▶ Resume</button>
              : <button type="button" className="dp-btn" disabled={!full} onClick={() => start(0)} title={full ? '' : 'Opens once every tile is approved'}>▶ Play the whole piece</button>}
          {i >= 0 && <button type="button" className="dp-btn ghost" onClick={() => start(i + 1)}>Next</button>}
          {i >= 0 && !playing && <button type="button" className="dp-btn ghost" onClick={() => { setI(-1); setT(0) }}>Back to the start</button>}
        </div>
        <div className="dp-lb-bar" aria-hidden="true"><span style={{ width: `${tiles.length ? (approved / tiles.length) * 100 : 0}%` }} /></div>
      </div>
      <div className="dp-lb-side">
        <p className="dp-kind">The run sheet</p>
        <div className="dp-lb-tiles">
          {tiles.map((x, n) => (
            <button type="button" key={x.id} className={`dp-lb-t${ok(x) ? ' open' : ''}${n === i ? ' on' : ''}`} onClick={() => tile(n)}
              aria-label={`${pad(n + 1)}, ${x.title}, ${ok(x) ? 'approved, play from here' : 'waiting for approval, go to it'}`} title={x.title}>{pad(n + 1)}</button>
          ))}
        </div>
        <p className="dp-muted dp-small"><span className="dp-key open" /> Approved, tap to play <span className="dp-key" /> Waiting for you</p>
      </div>
      <audio ref={voice} onEnded={() => start(i + 1)} onTimeUpdate={(e) => setT(e.currentTarget.currentTime)} />
    </section>
  )
}

function TileCard({ n, tile, first, last, projectId, run, busy, reload, setErr }: {
  n: number; tile: Tile; first: boolean; last: boolean; projectId: string; run: Run; busy: string; reload: () => Promise<void>; setErr: (s: string) => void
}) {
  const [title, setTitle] = useState(tile.title)
  const [script, setScript] = useState(tile.script)
  const [confirmRm, setConfirmRm] = useState(false)
  useEffect(() => { setTitle(tile.title); setScript(tile.script) }, [tile.title, tile.script])
  const dirty = title !== tile.title || script !== tile.script
  const doUpload = async (kind: 'still' | 'audio', f: File): Promise<boolean> => {
    try {
      const seconds = kind === 'audio' ? await audioLength(f) : null
      const path = await upload(projectId, kind, f)
      await api({ action: 'upload_done', tile_id: tile.id, kind, path, seconds })
      await reload()
      return true
    } catch (e) { setErr((e as Error).message); return false }
  }
  const canApprove = !!tile.audio_path && tile.status === 'voiced' && tile.checked !== false && (tile.stills ?? []).length > 0
  return (
    <article className={`dp-card ${tile.status}`} id={`dp-tile-${tile.id}`}>
      <div className="dp-card-main">
        <div className="dp-card-top">
          <span className="dp-num">{pad(n)}</span>
          <label className="dp-sr" htmlFor={`dp-title-${tile.id}`}>Tile title</label>
          <input id={`dp-title-${tile.id}`} className="dp-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
          <span className={`dp-tag ${tile.status}`}>{STATUS[tile.status]}</span>
          {tile.checked === true && <span className="dp-tag ok">Matches the script</span>}
          {tile.checked === false && <span className="dp-tag bad">Does not match the script</span>}
        </div>
        <div className="dp-stills">
          {(tile.stills ?? []).map((s, k) => (
            <figure key={s.path + k} className="dp-still">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media(s.path)} alt={`${tile.title}, still ${k + 1}`} loading="lazy" />
              <figcaption>
                {k === 0 ? <span className="dp-small">From the start</span> : (
                  <label className="dp-small">At <input type="number" min={0} step={0.1} defaultValue={s.at} aria-label={`Still ${k + 1} comes in at, seconds`}
                    onBlur={(e) => { const at = Number(e.currentTarget.value); if (at !== s.at) run(`at-${tile.id}`, { action: 'still_at', tile_id: tile.id, index: k, at }) }} /> s</label>
                )}
                <button type="button" className="dp-link" disabled={!!busy} onClick={() => run(`rm-still-${tile.id}`, { action: 'still_remove', tile_id: tile.id, index: k })}>Remove</button>
              </figcaption>
            </figure>
          ))}
          <FileButton label="Add a still" accept="image/*" small disabled={!!busy} onFile={(f) => doUpload('still', f)} />
        </div>
        <label className="dp-sr" htmlFor={`dp-script-${tile.id}`}>The line</label>
        <textarea id={`dp-script-${tile.id}`} className="dp-script" rows={3} value={script} onChange={(e) => setScript(e.target.value)} maxLength={4000} placeholder="What Sean says on this tile." />
        {dirty && (
          <div className="dp-line">
            <button type="button" className="dp-btn" disabled={!!busy} onClick={() => run(`save-${tile.id}`, { action: 'tile_save', id: tile.id, title, script })}>Save</button>
            <button type="button" className="dp-btn ghost" onClick={() => { setTitle(tile.title); setScript(tile.script) }}>Cancel</button>
            {script !== tile.script && tile.audio_path && <span className="dp-muted dp-small">New words need a new voice line.</span>}
          </div>
        )}
        {tile.audio_path && <audio controls preload="none" src={`${media(tile.audio_path)}?v=${tile.version}`} className="dp-audio" />}
        {tile.voice_request_at && <p className="dp-tag wait">Voice requested {when(tile.voice_request_at)}: it lands here once it is made and checked.</p>}
      </div>
      <div className="dp-card-side">
        {tile.status === 'approved'
          ? <button type="button" className="dp-btn ghost" disabled={!!busy} onClick={() => run(`st-${tile.id}`, { action: 'tile_status', id: tile.id, status: 'voiced' })}>Undo approval</button>
          : <button type="button" className="dp-btn go" disabled={!canApprove || !!busy} onClick={() => run(`st-${tile.id}`, { action: 'tile_status', id: tile.id, status: 'approved' })}
              title={canApprove ? '' : 'Needs a still and a voice line that matches the words'}>Approve</button>}
        <button type="button" className="dp-btn ghost" disabled={!!busy || !tile.script.trim() || dirty} onClick={() => run(`vr-${tile.id}`, { action: 'voice_request', id: tile.id })}>
          {tile.audio_path ? 'Re-voice in my voice' : 'Request my voice'}</button>
        <RecordButton disabled={!!busy} onTake={(f) => doUpload('audio', f)} setErr={setErr} />
        <FileButton label="Upload a take" accept="audio/*" disabled={!!busy} onFile={(f) => doUpload('audio', f)} />
        <div className="dp-line">
          <button type="button" className="dp-mv" aria-label="Move up" disabled={first || !!busy} onClick={() => run('mv', { action: 'tile_move', id: tile.id, dir: 'up' })}>↑</button>
          <button type="button" className="dp-mv" aria-label="Move down" disabled={last || !!busy} onClick={() => run('mv', { action: 'tile_move', id: tile.id, dir: 'down' })}>↓</button>
          {confirmRm
            ? <><button type="button" className="dp-link bad" onClick={() => run(`rm-${tile.id}`, { action: 'tile_remove', id: tile.id })}>Take it out</button><button type="button" className="dp-link" onClick={() => setConfirmRm(false)}>Keep</button></>
            : <button type="button" className="dp-link" onClick={() => setConfirmRm(true)}>Take out</button>}
        </div>
        {tile.note && <p className="dp-muted dp-small">{tile.note}</p>}
      </div>
    </article>
  )
}

function Feedback({ project, run, busy }: { project: Project; run: Run; busy: string }) {
  const [text, setText] = useState('')
  const list = project.feedback ?? []
  return (
    <div className="dp-feedback">
      <label htmlFor="dp-fb" className="dp-small"><b>Notes on the finished video</b></label>
      <textarea id="dp-fb" rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder="What should change: pace, a still, a word, the order?" />
      <button type="button" className="dp-btn ghost" disabled={!!busy || !text.trim()} onClick={async () => { const r = await run('fb', { action: 'feedback', id: project.id, text }); if (r) setText('') }}>Send the note</button>
      {list.length > 0 && <ul className="dp-fblist">{list.slice().reverse().map((f, k) => (
        <li key={k}><span className={`dp-tag ${f.done ? 'ok' : 'wait'}`}>{f.done ? 'Done' : 'Waiting'}</span> {f.text} <span className="dp-muted dp-small">{when(f.at)}</span></li>
      ))}</ul>}
    </div>
  )
}

// The microphone to record with (Sean, 2026-11-10: "I just be able to use the
// microphone that I have"). Picked once and remembered in this browser; every
// Record button uses it. Test shows a live level so you know it hears you.
const MIC_KEY = 'bcps-depot-mic'
const savedMic = () => { try { return localStorage.getItem(MIC_KEY) || '' } catch { return '' } }
const audioConstraints = (deviceId: string): MediaTrackConstraints => ({
  echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1,
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
})

// A live level bar for a stream (0 to 1), from an analyser on the mic.
function useLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!stream) { setLevel(0); return }
    const ctx = new AudioContext()
    const an = ctx.createAnalyser(); an.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(an)
    const buf = new Float32Array(an.fftSize)
    let raf = 0
    const tick = () => {
      an.getFloatTimeDomainData(buf)
      let peak = 0; for (let k = 0; k < buf.length; k++) peak = Math.max(peak, Math.abs(buf[k]))
      setLevel((l) => Math.max(peak, l * 0.85)); raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); ctx.close().catch(() => {}) }
  }, [stream])
  return level
}

function LevelBar({ level }: { level: number }) {
  const pct = Math.min(100, Math.round(level * 100))
  const tone = level > 0.9 ? 'hot' : level > 0.05 ? 'ok' : 'low'
  return (
    <div className="dp-level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span className={tone} style={{ width: `${pct}%` }} />
    </div>
  )
}

function MicPicker() {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [mic, setMic] = useState('')
  const [testing, setTesting] = useState<MediaStream | null>(null)
  const [note, setNote] = useState('')
  const level = useLevel(testing)
  const list = async () => {
    try { setMics((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput')) } catch { /* no list */ }
  }
  useEffect(() => { setMic(savedMic()); list() }, [])
  useEffect(() => () => { testing?.getTracks().forEach((t) => t.stop()) }, [testing])
  const pick = (id: string) => { setMic(id); try { localStorage.setItem(MIC_KEY, id) } catch { /* not saved */ } }
  const test = async () => {
    if (testing) { testing.getTracks().forEach((t) => t.stop()); setTesting(null); return }
    setNote('')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(mic) })
      setTesting(s); await list()
    } catch { setNote('The microphone did not start. Allow microphone access for bcpsmarcomm.com, or pick another microphone.') }
  }
  // Device names only show once the browser has been allowed to use a mic.
  const named = mics.some((m) => m.label)
  return (
    <div className="dp-mic">
      <label htmlFor="dp-mic-select" className="dp-mic-label">Your microphone</label>
      <select id="dp-mic-select" value={mic} onChange={(e) => pick(e.target.value)}>
        <option value="">Computer default</option>
        {mics.filter((m) => m.deviceId && m.deviceId !== 'default').map((m, i) => <option key={m.deviceId} value={m.deviceId}>{m.label || `Microphone ${i + 1}`}</option>)}
      </select>
      <button type="button" className="dp-btn ghost" onClick={test}>{testing ? 'Stop test' : 'Test'}</button>
      {testing && <LevelBar level={level} />}
      {testing && <p className="dp-mic-now">Listening on: <b>{testing.getAudioTracks()[0]?.label || 'your microphone'}</b></p>}
      <p className="dp-muted dp-small">{testing ? 'Talk at your normal reading level. The bar should move into the green, and not hit red.' : named ? 'Every Record button below uses this microphone. Your choice is saved in this browser.' : 'Press Test once to let the browser list your microphones by name.'}</p>
      {note && <p className="dp-err" role="alert">{note}</p>}
    </div>
  )
}

// Record a take right here (Sean, 2026-11-10: "I just need to get my
// microphone and speak into it"). The line is in the box beside this button.
// Record, Stop, listen back, then Use this take (saved like an upload) or
// Record again. Logan cleans the audio afterwards (level, noise, hum).
function RecordButton({ onTake, disabled, setErr }: { onTake: (f: File) => Promise<boolean>; disabled?: boolean; setErr: (s: string) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'review' | 'saving'>('idle')
  const [secs, setSecs] = useState(0)
  const [url, setUrl] = useState('')
  const rec = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const take = useRef<File | null>(null)
  const [live, setLive] = useState<MediaStream | null>(null)
  const level = useLevel(live)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); rec.current?.stream.getTracks().forEach((t) => t.stop()); if (url) URL.revokeObjectURL(url) }, [url])

  const start = async () => {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(savedMic()) })
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) || ''
      const r = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 128000 } : undefined)
      chunks.current = []
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data) }
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        setLive(null)
        const mime = r.mimeType || 'audio/webm'
        const blob = new Blob(chunks.current, { type: mime })
        take.current = new File([blob], `take.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime })
        setUrl(URL.createObjectURL(blob)); setState('review')
      }
      rec.current = r
      setLive(stream)
      r.start()
      setSecs(0); setState('recording')
      timer.current = setInterval(() => setSecs((n) => n + 1), 1000)
    } catch {
      setErr('The microphone did not start. Allow microphone access for bcpsmarcomm.com in your browser, or pick another microphone above, then try again.')
    }
  }
  const stop = () => { if (timer.current) clearInterval(timer.current); rec.current?.stop() }
  const reset = () => { if (url) URL.revokeObjectURL(url); setUrl(''); take.current = null; setState('idle') }
  // The take stays on screen until it has really saved, so a failed upload never loses it.
  const use = async () => { if (!take.current) return; setState('saving'); if (await onTake(take.current)) reset(); else setState('review') }
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`

  if (state === 'recording') return (
    <div className="dp-rec-review">
      <button type="button" className="dp-btn rec on" onClick={stop} aria-live="polite">■ Stop ({clock})</button>
      <LevelBar level={level} />
      <span className="dp-muted dp-small">Recording on: {live?.getAudioTracks()[0]?.label || 'your microphone'}</span>
    </div>
  )
  if (state === 'review' || state === 'saving') return (
    <div className="dp-rec-review">
      <audio controls src={url} className="dp-audio" />
      <div className="dp-line">
        <button type="button" className="dp-btn go" disabled={state === 'saving'} onClick={use}>{state === 'saving' ? 'Saving…' : 'Use this take'}</button>
        <button type="button" className="dp-btn ghost" disabled={state === 'saving'} onClick={reset}>Record again</button>
      </div>
    </div>
  )
  return <button type="button" className="dp-btn rec" disabled={disabled} onClick={start}>● Record</button>
}

function FileButton({ label, accept, onFile, disabled, small }: { label: string; accept: string; onFile: (f: File) => unknown; disabled?: boolean; small?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  return (
    <>
      <input ref={ref} type="file" accept={accept} hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setWorking(true); try { await onFile(f) } finally { setWorking(false) } }} />
      <button type="button" className={small ? 'dp-addstill' : 'dp-btn ghost'} disabled={disabled || working} onClick={() => ref.current?.click()}>{working ? 'Uploading…' : label}</button>
    </>
  )
}

const CSS = `
.depot{padding:28px 32px 60px;color:#14212b;max-width:1180px}
.dp-head{display:grid;gap:4px;margin-bottom:16px}.dp-head h1{margin:0;font-size:28px;color:#0e4e73}.dp-head p{margin:0}
.dp-eyebrow,.dp-kind{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#1672A7;margin:0}
.dp-muted{color:#56656f}.dp-small{font-size:13px}.dp-err{color:#991b1b;font-weight:700}
.dp-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.dp-crumbs{margin:0 0 8px;font-size:14px}.dp-crumbs button{background:none;border:0;padding:0;color:#1672A7;font:inherit;font-weight:700;cursor:pointer;text-decoration:underline}
.dp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:6px;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;background:#0e4e73;color:#fff;border:1px solid #0e4e73;cursor:pointer}
.dp-btn.ghost{background:#fff;color:#0e4e73;border-color:#cbd5e1}.dp-btn.go{background:#166534;border-color:#166534}
.dp-btn:disabled{opacity:.45;cursor:default}.dp-btn:focus-visible,.dp-lb-t:focus-visible,.dp-proj:focus-visible{outline:3px solid #1672A7;outline-offset:2px}
.dp-link{background:none;border:0;padding:0;color:#1672A7;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:underline}.dp-link.bad{color:#991b1b}
.dp-new{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 20px}.dp-new input{flex:1;min-width:240px;border:1px solid #cbd5e1;border-radius:6px;padding:9px 12px;font:inherit}
.dp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr));gap:16px}
.dp-proj{display:flex;flex-direction:column;gap:6px;text-align:left;background:#fff;border:1px solid #d6dee5;border-radius:12px;padding:12px;font:inherit;color:inherit;cursor:pointer}
.dp-proj:hover{border-color:#1672A7}.dp-proj-cover{aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#e7eef4;display:grid;place-items:center}.dp-proj-cover img{width:100%;height:100%;object-fit:cover}
.dp-proj-title{font-weight:800;font-size:16px;color:#0e4e73}
.dp-lb{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:18px;background:#fff;border:1px solid #d6dee5;border-radius:12px;padding:16px;margin-bottom:18px}
.dp-lb-stage{display:grid;gap:10px;min-width:0}.dp-lb-frame{aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#e7eef4;display:grid;place-items:center}
.dp-lb-frame img{width:100%;height:100%;object-fit:cover}.dp-lb-frame b{font-size:40px;color:#0e4e73}.dp-lb-now p{margin:0}
.dp-line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dp-lb-bar{height:4px;background:#e7eef4;border-radius:4px;overflow:hidden}.dp-lb-bar span{display:block;height:100%;background:#166534}
.dp-lb-side{display:grid;gap:10px;align-content:start}.dp-lb-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.dp-lb-t{aspect-ratio:1;border-radius:8px;border:1px dashed #cbd5e1;background:#f8fafc;color:#56656f;font:800 15px/1 inherit;font-variant-numeric:tabular-nums;cursor:pointer}
.dp-lb-t.open{border:1px solid #166534;background:#dcfce7;color:#166534}.dp-lb-t.on{background:#0e4e73;color:#fff;border-color:#0e4e73}
.dp-key{display:inline-block;width:12px;height:12px;border-radius:3px;border:1px dashed #cbd5e1;vertical-align:-2px;margin:0 4px 0 8px}.dp-key.open{border:1px solid #166534;background:#dcfce7;margin-left:0}
.dp-final{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:18px;background:#fff;border:1px solid #d6dee5;border-radius:12px;padding:16px;margin-bottom:22px}
.dp-final h2,.dp-h2{margin:0 0 8px;font-size:18px;color:#0e4e73}.dp-final video{width:100%;aspect-ratio:16/9;border-radius:8px;background:#0e4e73}
.dp-final-side{display:flex;flex-direction:column;gap:10px;align-items:flex-start;min-width:0}
.dp-feedback{display:grid;gap:6px;width:100%}.dp-feedback textarea,.dp-script{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:6px;padding:8px 10px;font:inherit;font-size:14px;line-height:1.5}
.dp-fblist{list-style:none;margin:4px 0 0;padding:0;display:grid;gap:6px;font-size:13px}
.dp-cards{display:grid;gap:14px;margin-bottom:14px}
.dp-card{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:16px;background:#fff;border:1px solid #d6dee5;border-radius:12px;padding:14px 16px}
.dp-card.approved{border-color:#166534}.dp-card-main{display:grid;gap:10px;min-width:0}
.dp-card-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dp-num{font-weight:800;color:#1672A7;font-variant-numeric:tabular-nums}
.dp-title{flex:1;min-width:160px;border:1px solid transparent;border-radius:6px;padding:4px 6px;font:inherit;font-size:17px;font-weight:800;color:#0e4e73}.dp-title:hover,.dp-title:focus{border-color:#cbd5e1}
.dp-tag{display:inline-block;padding:2px 8px;border-radius:6px;font-size:12px;font-weight:700;background:#f1f5f9;color:#334155;margin:0}
.dp-tag.approved,.dp-tag.ok{background:#dcfce7;color:#166534}.dp-tag.voiced{background:#e0f2fe;color:#075985}.dp-tag.bad{background:#fee2e2;color:#991b1b}.dp-tag.wait{background:#fef3c7;color:#92400e}
.dp-stills{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start}
.dp-still{margin:0;width:200px;max-width:100%;display:grid;gap:4px}.dp-still img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;border:1px solid #d6dee5}
.dp-still figcaption{display:flex;justify-content:space-between;align-items:center;gap:6px}.dp-still input{width:58px;border:1px solid #cbd5e1;border-radius:4px;padding:2px 4px;font:inherit;font-size:13px}
.dp-addstill{width:200px;aspect-ratio:16/9;border:1px dashed #cbd5e1;border-radius:6px;background:#f8fafc;color:#0e4e73;font:inherit;font-weight:700;cursor:pointer}
.dp-audio{width:100%;max-width:520px;height:36px}
.dp-btn.rec{border-color:#b91c1c;color:#b91c1c;background:#fff}.dp-btn.rec.on{background:#b91c1c;color:#fff}.dp-rec-review{display:grid;gap:6px}
.dp-mic{display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#fff;border:1px solid #d6dee5;border-radius:10px;padding:12px 14px;margin:0 0 14px}.dp-mic p{flex-basis:100%;margin:0}.dp-mic select{font:inherit;padding:7px 8px;border:1px solid #c5d0d9;border-radius:6px;max-width:100%}.dp-mic-label{font-weight:800;color:#0e4e73}.dp-mic-now{color:#14212b}
.dp-level{flex:1;min-width:140px;height:10px;background:#e8eef3;border-radius:5px;overflow:hidden}.dp-level span{display:block;height:100%;transition:width .06s}.dp-level .low{background:#9aa9b5}.dp-level .ok{background:#16750C}.dp-level .hot{background:#b91c1c}
.dp-card-side{display:flex;flex-direction:column;gap:8px;align-items:stretch}
.dp-mv{width:32px;height:32px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
@media (max-width:820px){.depot{padding:20px 16px 48px}.dp-lb,.dp-final,.dp-card{grid-template-columns:1fr}.dp-lb-tiles{grid-template-columns:repeat(8,1fr)}}
`
