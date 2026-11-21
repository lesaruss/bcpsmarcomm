import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Walkthrough audio (Sean, 2026-11-17): a walkthrough page's Listen buttons
// play Sean's own takes, recorded in the Depot like Charlene's tour. Each
// Depot tile names its lesson in tour.lesson; once the tile has a recorded
// line (status past 'script'), its file is returned here. Only the projects
// listed below are served, and only their audio links, so the page works for
// any reader of the walkthrough without a sign-in.
const PUBLIC_PROJECTS = new Set(['audit-walkthrough'])

const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('project') || ''
  if (!PUBLIC_PROJECTS.has(slug)) return NextResponse.json({ error: 'Unknown walkthrough' }, { status: 404 })
  const { data: p } = await svc.from('bcps_depot_projects').select('id').eq('slug', slug).maybeSingle()
  if (!p) return NextResponse.json({ audio: {} })
  const { data: tiles } = await svc.from('bcps_depot_tiles').select('audio_path, status, version, tour')
    .eq('project_id', p.id).not('audio_path', 'is', null).neq('status', 'script')
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  const audio: Record<string, string> = {}
  for (const t of tiles ?? []) {
    const lesson = (t.tour as { lesson?: string } | null)?.lesson
    if (lesson && t.audio_path) audio[lesson] = `${base}${t.audio_path}?v=${t.version}`
  }
  return NextResponse.json({ audio }, { headers: { 'Cache-Control': 'no-store' } })
}
