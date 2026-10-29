import { NextRequest, NextResponse } from 'next/server'
import { requireDocumentAccess } from '@/lib/bcps-auth'
import { SERVER_GUIDES } from '@/lib/guides/server'

// A restricted guide's content (Sean, 2026-10-30), for its readers only:
// requireDocumentAccess checks the guide's slug the way the Documents list
// checks a restricted document. The content never ships in the page code.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const guide = SERVER_GUIDES[slug]
  if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const auth = await requireDocumentAccess(req, slug)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  return NextResponse.json({ ok: true, guide }, { headers: { 'Cache-Control': 'no-store' } })
}
