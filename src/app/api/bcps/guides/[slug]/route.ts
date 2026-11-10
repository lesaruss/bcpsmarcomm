import { NextRequest, NextResponse } from 'next/server'
import { requireDocumentAccess } from '@/lib/bcps-auth'
import { serviceClient } from '@/lib/bcps-doc-access'
import { isSuperadmin, resolvePerson } from '@/lib/bcps-view-as-person'
import { filterGuide, viewerAudiences, type GuideViewer } from '@/lib/guides/audience'
import { hasValidPass } from '@/lib/bcps-doc-password'
import { loadGuideDepartment } from '@/lib/guides/department'
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
  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  // A guide with a password (Sean, 2026-11-10) also opens for 24 hours to
  // anyone holding a live pass for it (see src/lib/bcps-doc-password.ts).
  // They read it as an outside reader: only sections not marked for a role.
  const viaPass = !auth.ok && (await hasValidPass(db, slug)).valid
  if (!auth.ok && !viaPass) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await db.from('bcps_guides').select('def').eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.def) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let viewer: GuideViewer = new Set()
  if (auth.ok) {
    let who = { userId: auth.user.userId, email: auth.user.email }
    const as = new URL(req.url).searchParams.get('as')
    if (as && await isSuperadmin(db, auth.user.userId)) {
      const person = await resolvePerson(db, as)
      if (person) who = { userId: person.userId, email: person.email }
    }
    viewer = await viewerAudiences(db, slug, who)
  }
  const guide = filterGuide(data.def as GuideDef, viewer)
  // A department guide also carries the department's live side: its page, its
  // audit snapshot and its analytics, each only for the roles that see them.
  const department = await loadGuideDepartment(db, slug, viewer).catch((e) => { console.error('guide department failed', slug, e); return null })
  return NextResponse.json({ ok: true, guide, department }, { headers: { 'Cache-Control': 'no-store' } })
}
