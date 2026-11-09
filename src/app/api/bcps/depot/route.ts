import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireBcpsSuperAdmin } from '@/lib/bcps-auth'

export const dynamic = 'force-dynamic'

// The Depot (Sean, 2026-11-09): BCPS MarComm's studio for videos and other
// media, in the lookbook format from the HQ podcast studio. A project is a run
// of numbered tiles; each tile has its stills, its script and its voice line,
// and is approved on its own. Tables: bcps_depot_projects, bcps_depot_tiles
// (supabase/migrations/20261109_bcps_depot.sql). SuperAdmin only, like the page
// (src/components/pages/DepotPage.tsx).
//
// Voice: Sean's lines are made in Higgsfield (his voice element) and checked
// word for word, the way the HQ podcast studio handles Sean's own cards, so
// "Request my voice" queues the line (voice_request_at + a Recording Queue
// row) and the take lands back on the tile. An uploaded or recorded take works
// too. The finished video is requested the same way and uploaded to the
// project's final slot.
//
// Files are "<bucket>/<path>" in public buckets; new ones go to
// bcps-public/depot/<project slug>/.

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const BUCKET = 'bcps-public'
const P = 'bcps_depot_projects'
const T = 'bcps_depot_tiles'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'project'
const clean = (s: unknown, max = 4000) => String(s ?? '').trim().slice(0, max)

async function log(summary: string, link = 'https://bcpsmarcomm.com/?page=depot') {
  await svc.from('stream_events').insert({
    timestamp: new Date().toISOString(), owner: 'logan', station: 'bcps', task_id: null,
    summary: `[BCPS Depot] ${summary}`, status: 'open', context_link: link,
  })
}

async function tileWithProject(id: string) {
  const { data: tile } = await svc.from(T).select('*').eq('id', id).maybeSingle()
  if (!tile) return null
  const { data: project } = await svc.from(P).select('*').eq('id', tile.project_id).maybeSingle()
  return project ? { tile, project } : null
}

async function renumber(projectId: string) {
  const { data } = await svc.from(T).select('id, position').eq('project_id', projectId).order('position')
  const rows = data ?? []
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].position !== (i + 1) * 10) await svc.from(T).update({ position: (i + 1) * 10 }).eq('id', rows[i].id)
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return bad(auth.error, auth.status)
  const v = req.nextUrl.searchParams.get('v') || 'projects'

  if (v === 'projects') {
    const { data: projects } = await svc.from(P).select('id, slug, title, kind, audience, status, final_path, poster_path, updated_at, created_at').order('created_at', { ascending: false })
    const { data: tiles } = await svc.from(T).select('project_id, status, stills')
    const out = (projects ?? []).map((p) => {
      const mine = (tiles ?? []).filter((t) => t.project_id === p.id)
      const firstStill = mine.flatMap((t) => (t.stills as { path: string }[]) ?? [])[0]?.path ?? null
      return { ...p, tiles: mine.length, approved: mine.filter((t) => t.status === 'approved').length, cover: p.poster_path || firstStill }
    })
    return NextResponse.json({ ok: true, projects: out })
  }

  if (v === 'project') {
    const slug = req.nextUrl.searchParams.get('slug') || ''
    const { data: project } = await svc.from(P).select('*').eq('slug', slug).maybeSingle()
    if (!project) return bad('That project is not in the Depot.', 404)
    const { data: tiles } = await svc.from(T).select('*').eq('project_id', project.id).order('position')
    return NextResponse.json({ ok: true, project, tiles: tiles ?? [] })
  }

  return bad('Unknown view.')
}

export async function POST(req: NextRequest) {
  const auth = await requireBcpsSuperAdmin(req)
  if (!auth.ok) return bad(auth.error, auth.status)
  const who = auth.user.email ?? 'superadmin'
  const b = await req.json().catch(() => ({}))
  const now = new Date().toISOString()

  switch (b.action) {
    case 'project_create': {
      const title = clean(b.title, 140)
      if (!title) return bad('Give the project a name.')
      let slug = slugify(title)
      const { data: taken } = await svc.from(P).select('slug').like('slug', `${slug}%`)
      if ((taken ?? []).some((t) => t.slug === slug)) slug = `${slug}-${(taken ?? []).length + 1}`
      const { data, error } = await svc.from(P).insert({ slug, title, audience: clean(b.audience, 400) || null, created_by: who }).select('slug, id').single()
      if (error || !data) return bad('Could not create the project.', 500)
      await svc.from(T).insert({ project_id: data.id, position: 10, title: 'Opening' })
      await log(`New project: ${title}`, `https://bcpsmarcomm.com/?page=depot&project=${data.slug}`)
      return NextResponse.json({ ok: true, slug: data.slug })
    }

    case 'project_save': {
      const patch: Record<string, unknown> = { updated_at: now }
      if (b.title !== undefined) patch.title = clean(b.title, 140) || 'Untitled'
      if (b.audience !== undefined) patch.audience = clean(b.audience, 400) || null
      if (b.surface !== undefined) patch.surface = clean(b.surface, 400) || null
      const { error } = await svc.from(P).update(patch).eq('id', b.id)
      return error ? bad('Could not save.', 500) : NextResponse.json({ ok: true })
    }

    case 'feedback': {
      const text = clean(b.text, 4000)
      if (!text) return bad('Write the feedback first.')
      const { data: p } = await svc.from(P).select('title, slug, feedback').eq('id', b.id).maybeSingle()
      if (!p) return bad('Project not found.', 404)
      const feedback = [...((p.feedback as unknown[]) ?? []), { at: now, text, done: false, by: who }]
      await svc.from(P).update({ feedback, updated_at: now }).eq('id', b.id)
      await log(`Feedback on ${p.title}: ${text.slice(0, 200)}`, `https://bcpsmarcomm.com/?page=depot&project=${p.slug}`)
      return NextResponse.json({ ok: true })
    }

    case 'render_request': {
      const { data: p } = await svc.from(P).select('title, slug').eq('id', b.id).maybeSingle()
      if (!p) return bad('Project not found.', 404)
      const { data: tiles } = await svc.from(T).select('status').eq('project_id', b.id)
      if (!(tiles ?? []).length || (tiles ?? []).some((t) => t.status !== 'approved')) return bad('Approve every tile first.')
      await svc.from(P).update({ render_request_at: now, status: 'rendering', updated_at: now }).eq('id', b.id)
      await log(`Render requested: ${p.title}. Build the video from the approved tiles and upload it to the project.`, `https://bcpsmarcomm.com/?page=depot&project=${p.slug}`)
      return NextResponse.json({ ok: true })
    }

    case 'tile_add': {
      const { data: last } = await svc.from(T).select('position').eq('project_id', b.project_id).order('position', { ascending: false }).limit(1)
      const position = ((last ?? [])[0]?.position ?? 0) + 10
      const { error } = await svc.from(T).insert({ project_id: b.project_id, position, title: clean(b.title, 140) || 'New tile' })
      return error ? bad('Could not add the tile.', 500) : NextResponse.json({ ok: true })
    }

    case 'tile_save': {
      const found = await tileWithProject(b.id)
      if (!found) return bad('Tile not found.', 404)
      const { tile } = found
      const patch: Record<string, unknown> = { updated_at: now }
      if (b.title !== undefined) patch.title = clean(b.title, 140)
      if (b.note !== undefined) patch.note = clean(b.note, 2000) || null
      if (b.script !== undefined) {
        const script = clean(b.script, 4000)
        // New words make the voice line stale: back to script until it is re-voiced.
        if (script !== tile.script) { patch.script = script; if (tile.status !== 'script') patch.status = 'script'; patch.checked = null }
      }
      const { error } = await svc.from(T).update(patch).eq('id', b.id)
      return error ? bad('Could not save.', 500) : NextResponse.json({ ok: true })
    }

    case 'tile_remove': {
      const found = await tileWithProject(b.id)
      if (!found) return bad('Tile not found.', 404)
      await svc.from(T).delete().eq('id', b.id)
      await renumber(found.project.id)
      return NextResponse.json({ ok: true })
    }

    case 'tile_move': {
      const found = await tileWithProject(b.id)
      if (!found) return bad('Tile not found.', 404)
      const { data: all } = await svc.from(T).select('id, position').eq('project_id', found.project.id).order('position')
      const list = all ?? []
      const i = list.findIndex((t) => t.id === b.id)
      const j = b.dir === 'up' ? i - 1 : i + 1
      if (i < 0 || j < 0 || j >= list.length) return NextResponse.json({ ok: true })
      await svc.from(T).update({ position: list[j].position }).eq('id', list[i].id)
      await svc.from(T).update({ position: list[i].position }).eq('id', list[j].id)
      await renumber(found.project.id)
      return NextResponse.json({ ok: true })
    }

    case 'tile_status': {
      const found = await tileWithProject(b.id)
      if (!found) return bad('Tile not found.', 404)
      const { tile } = found
      if (b.status === 'approved') {
        if (!tile.audio_path) return bad('This tile has no voice line yet.')
        if (tile.status === 'script') return bad('The words changed after this line was voiced. Re-voice it first.')
        if (tile.checked === false) return bad('The voice line does not match the script.')
        if (!((tile.stills as unknown[]) ?? []).length) return bad('Add a still first.')
      }
      const status = b.status === 'approved' ? 'approved' : tile.audio_path && tile.status !== 'script' ? 'voiced' : 'script'
      await svc.from(T).update({ status, updated_at: now }).eq('id', b.id)
      return NextResponse.json({ ok: true, status })
    }

    case 'voice_request': {
      const found = await tileWithProject(b.id)
      if (!found) return bad('Tile not found.', 404)
      const { tile, project } = found
      if (!clean(tile.script)) return bad('Write the line first.')
      await svc.from(T).update({ voice_request_at: now, updated_at: now }).eq('id', b.id)
      const words = clean(tile.script).split(/\s+/).length
      await svc.from('recording_queue').upsert({
        slug: `bcps-depot-${project.slug}-${String(tile.id).slice(0, 8)}`, brand_slug: 'bcps',
        title: `${project.title}: ${tile.title}`, kind: 'narration', status: 'needs_approval',
        batch: `bcps-depot-${project.slug}`, position: Math.round(tile.position / 10),
        purpose: `BCPS Depot tile for ${project.title}`, surface_url: `https://bcpsmarcomm.com/?page=depot&project=${project.slug}`,
        script: clean(tile.script), direction: 'Warm, conversational, speech_rate -5', est_seconds: Math.round(words / 2.4),
        target: { depot_tile: tile.id, project: project.slug }, source: 'BCPS Depot voice request', updated_by: who,
      }, { onConflict: 'slug' })
      await log(`Voice requested in Sean's voice: ${project.title}, tile "${tile.title}". Make it in Higgsfield, check it word for word, upload it to the tile.`, `https://bcpsmarcomm.com/?page=depot&project=${project.slug}`)
      return NextResponse.json({ ok: true })
    }

    case 'upload_start': {
      const kind = String(b.kind)
      if (!['still', 'audio', 'final', 'poster'].includes(kind)) return bad('Unknown upload.')
      const projectId = b.project_id as string
      const { data: project } = await svc.from(P).select('slug').eq('id', projectId).maybeSingle()
      if (!project) return bad('Project not found.', 404)
      const name = clean(b.name, 120).toLowerCase().replace(/[^a-z0-9.]+/g, '-')
      const ext = (name.match(/\.([a-z0-9]{2,5})$/)?.[1]) || (kind === 'audio' ? 'mp3' : kind === 'final' ? 'mp4' : 'jpg')
      const path = `depot/${project.slug}/${kind}s/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error || !data) return bad('Could not prepare the upload.', 500)
      return NextResponse.json({ ok: true, bucket: BUCKET, path, token: data.token })
    }

    case 'upload_done': {
      const kind = String(b.kind)
      const path = clean(b.path, 300)
      if (!path.startsWith('depot/') || path.includes('..')) return bad('Bad file path.')
      const full = `${BUCKET}/${path}`
      // The file must really be there before a tile points at it.
      const dir = path.slice(0, path.lastIndexOf('/')), file = path.slice(path.lastIndexOf('/') + 1)
      const { data: listed } = await svc.storage.from(BUCKET).list(dir, { search: file })
      if (!(listed ?? []).some((f) => f.name === file)) return bad('The upload did not arrive. Try again.')

      if (kind === 'still' || kind === 'audio') {
        const found = await tileWithProject(b.tile_id)
        if (!found) return bad('Tile not found.', 404)
        const { tile } = found
        if (kind === 'still') {
          const stills = [...((tile.stills as { path: string; at: number }[]) ?? [])]
          const lastAt = stills.length ? stills[stills.length - 1].at : -1
          stills.push({ path: full, at: stills.length ? Math.max(lastAt + 3, 0) : 0 })
          await svc.from(T).update({ stills, updated_at: now }).eq('id', tile.id)
        } else {
          const seconds = Number(b.seconds)
          await svc.from(T).update({
            audio_path: full, audio_seconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 100) / 100 : null,
            status: 'voiced', checked: null, version: (tile.version ?? 0) + 1, voice_request_at: null, updated_at: now,
          }).eq('id', tile.id)
        }
        return NextResponse.json({ ok: true })
      }
      if (kind === 'final' || kind === 'poster') {
        const patch: Record<string, unknown> = { updated_at: now }
        if (kind === 'final') { patch.final_path = full; patch.status = 'ready'; patch.render_request_at = null }
        else patch.poster_path = full
        await svc.from(P).update(patch).eq('id', b.project_id)
        return NextResponse.json({ ok: true })
      }
      return bad('Unknown upload.')
    }

    case 'still_remove':
    case 'still_at': {
      const found = await tileWithProject(b.tile_id)
      if (!found) return bad('Tile not found.', 404)
      const stills = [...((found.tile.stills as { path: string; at: number }[]) ?? [])]
      const i = Number(b.index)
      if (!(i >= 0 && i < stills.length)) return bad('No such still.')
      if (b.action === 'still_remove') stills.splice(i, 1)
      else stills[i] = { ...stills[i], at: i === 0 ? 0 : Math.max(0, Math.round(Number(b.at) * 100) / 100 || 0) }
      if (stills.length) stills[0] = { ...stills[0], at: 0 }
      stills.sort((x, y) => x.at - y.at)
      await svc.from(T).update({ stills, updated_at: now }).eq('id', b.tile_id)
      return NextResponse.json({ ok: true })
    }
  }
  return bad('Unknown action.')
}
