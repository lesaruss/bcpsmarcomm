import { NextRequest, NextResponse } from 'next/server'
import { requireDocumentAccess } from '@/lib/bcps-auth'
import { serviceClient } from '@/lib/bcps-doc-access'

// A restricted guide's content (Sean, 2026-10-30), for its readers only:
// requireDocumentAccess checks the guide's slug the way the Documents list
// checks a restricted document. The content lives in public.bcps_guides,
// which only the service role can read, and never in this repository (it is
// public) or the page code. Edit it with SQL on bcps_guides.def.
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
  return NextResponse.json({ ok: true, guide: data.def }, { headers: { 'Cache-Control': 'no-store' } })
}
