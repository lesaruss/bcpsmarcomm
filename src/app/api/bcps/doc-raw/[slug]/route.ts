// src/app/api/bcps/doc-raw/[slug]/route.ts
// Serves a BCPS Playbook or doc (briefings, brand_slug='bcps') as a real HTML document so
// inline <script> executes. The /playbooks routes iframe this endpoint for interactive
// content, the same pattern /briefs/[slug] uses with /api/bcps/brief-raw/[slug].
// Access rules are identical: public unless bcps_brief_recipients has rows for the slug,
// in which case the session email must match a recipient or be a wcm_cert_users admin.
// ?debug=1 returns metadata only (never the body), same standing diagnostic as brief-raw.

import { NextRequest, NextResponse } from 'next/server'
import { serviceClient, checkDocAccess, getBcpsDoc } from '@/lib/bcps-doc-access'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const db = serviceClient()
  if (!db) return new NextResponse('Not found', { status: 404 })

  const doc = await getBcpsDoc(db, slug)
  if (!doc) return new NextResponse('Not found', { status: 404 })

  const access = await checkDocAccess(db, slug)
  if (!access.allowed) return new NextResponse('Unauthorized', { status: 401 })

  if (req.nextUrl.searchParams.get('debug') === '1') {
    return NextResponse.json(
      {
        slug,
        type: doc.type,
        parent_playbook_slug: doc.parent_playbook_slug,
        title: doc.title,
        updated_at: doc.updated_at,
        content_length: doc.content.length,
        content_sha256_prefix: await sha256HexPrefix(doc.content, 12),
        restricted: access.restricted,
        served_at: new Date().toISOString(),
        deployment_sha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // ?embed=1: shown inside the dashboard's Documents tab (Sean, 2026-10-20).
  // Links to another Playbook or doc open in the tab; every other link leaves
  // the frame instead of loading inside it.
  const body = req.nextUrl.searchParams.get('embed') === '1' ? withEmbedScript(doc.content) : doc.content

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  })
}

// id lets the in-place editor strip it before saving (2026-10-22).
const EMBED_SCRIPT = `<script id="bcps-embed-script">
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (!a || a.getAttribute('href').charAt(0) === '#') return;
  var u = new URL(a.href, location.href);
  var ours = u.origin === location.origin || u.hostname === 'bcpsmarcomm.com' || u.hostname === 'www.bcpsmarcomm.com';
  var m = ours && u.pathname.match(/^\\/playbooks\\/(?:[^/]+\\/)?([^/]+)\\/?$/);
  if (m && !u.hash) { e.preventDefault(); parent.postMessage({ type: 'bcps-open-doc', slug: decodeURIComponent(m[1]) }, location.origin); return; }
  if (!a.target) a.target = ours ? '_top' : '_blank';
}, true);
</script>`

function withEmbedScript(html: string): string {
  const i = html.toLowerCase().lastIndexOf('</body>')
  return i === -1 ? html + EMBED_SCRIPT : html.slice(0, i) + EMBED_SCRIPT + html.slice(i)
}

async function sha256HexPrefix(input: string, len: number): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, len)
}
