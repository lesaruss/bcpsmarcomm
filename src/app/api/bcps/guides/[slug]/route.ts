import { NextRequest, NextResponse } from 'next/server'
import { requireDocumentAccess } from '@/lib/bcps-auth'
import { serviceClient } from '@/lib/bcps-doc-access'
import { isSuperadmin, resolvePerson } from '@/lib/bcps-view-as-person'
import { filterGuide, viewerAudiences } from '@/lib/guides/audience'
import type { GuideDef } from '@/lib/guides/types'

// A restricted guide's content (Sean, 2026-10-30), for its readers only:
// requireDocumentAccess checks the guide's slug the way the Documents list
// checks a restricted document. The content lives in public.bcps_guides,
// which only the service role can read, and never in this repository (it is
// public) or the page code. Edit it with SQL on bcps_guides.def.
//
// Department guides (Sean, 2026-11-03) are one page for a whole team, so the
// tabs and sections marked for a role are sent only to that role
// (src/lib/guides/audience.ts). ?as=<email> lets a SuperAdmin see the guide
// as one named person would, the same read-only preview as View as person.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const auth = await requireDocumentAccess(req, slug)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  const { data, error } = await db.from('bcps_guides').select('def').eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.def) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let who = { userId: auth.user.userId, email: auth.user.email }
  const as = new URL(req.url).searchParams.get('as')
  if (as && await isSuperadmin(db, auth.user.userId)) {
    const person = await resolvePerson(db, as)
    if (person) who = { userId: person.userId, email: person.email }
  }

  const guide = filterGuide(data.def as GuideDef, await viewerAudiences(db, slug, who))
  return NextResponse.json({ ok: true, guide }, { headers: { 'Cache-Control': 'no-store' } })
}
