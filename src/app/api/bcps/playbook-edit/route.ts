import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'
import { requirePlaybookEditAccess } from '@/lib/bcps-auth'

// Project leads edit a Playbook, or a doc under it, in place on the dashboard
// (Sean, 2026-10-22: "designate people as admins for these projects so they
// can make edits to the document directly"). The Documents tab turns the page
// itself editable and posts the whole page back here. Every save first copies
// the current page to bcps_doc_revisions, so any edit can be rolled back.
//
//   GET  ?slug=        -> { can_edit }
//   POST { slug, html } -> { ok, revision_id }
export const dynamic = 'force-dynamic'

const MAX_HTML = 3_000_000
const SLUG = /^[a-z0-9][a-z0-9-]{0,160}$/

const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const slug = String(req.nextUrl.searchParams.get('slug') || '')
  if (!SLUG.test(slug)) return NextResponse.json({ can_edit: false })
  const auth = await requirePlaybookEditAccess(req, slug)
  return NextResponse.json({ can_edit: auth.ok }, { status: auth.ok || auth.status !== 401 ? 200 : 401 })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug || '')
  const html = typeof body.html === 'string' ? body.html : ''
  if (!SLUG.test(slug)) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 })
  const auth = await requirePlaybookEditAccess(req, slug)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!/<html[\s>]/i.test(html) || !/<\/body>/i.test(html)) return NextResponse.json({ error: 'The page did not come through whole. Nothing was saved.' }, { status: 400 })
  if (html.length > MAX_HTML) return NextResponse.json({ error: 'The page is too large to save.' }, { status: 413 })

  const { data: current } = await svc.from('briefings').select('content').eq('brand_slug', 'bcps').eq('slug', slug).maybeSingle()
  if (!current) return NextResponse.json({ error: 'That document was not found.' }, { status: 404 })
  if (current.content === html) return NextResponse.json({ ok: true, unchanged: true })

  const { data: rev, error: revErr } = await svc.from('bcps_doc_revisions')
    .insert({ slug, content: current.content, replaced_by_email: auth.user.email })
    .select('id').single()
  if (revErr || !rev) return NextResponse.json({ error: 'Could not keep the previous version, so nothing was saved.' }, { status: 500 })

  const { error } = await svc.from('briefings').update({ content: html, updated_at: new Date().toISOString() })
    .eq('brand_slug', 'bcps').eq('slug', slug)
  if (error) return NextResponse.json({ error: 'The page could not be saved.' }, { status: 500 })
  return NextResponse.json({ ok: true, revision_id: rev.id })
}
