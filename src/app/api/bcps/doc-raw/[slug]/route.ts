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
  // ?bare=1: framed somewhere else inside the platform (the Documents
  // lightbox): the header comes off, links behave normally.
  const sp = req.nextUrl.searchParams
  let parentTitle: string | null = null
  if (doc.parent_playbook_slug) {
    const { data: parent } = await db.from('briefings').select('title').eq('brand_slug', 'bcps').eq('slug', doc.parent_playbook_slug).maybeSingle()
    parentTitle = parent?.title ?? null
  }
  const crumbed = withBreadcrumb(doc.content, doc.title, doc.parent_playbook_slug, parentTitle)
  const body = sp.get('embed') === '1' ? withEmbedScript(crumbed) : sp.get('bare') === '1' ? withEmbedStyle(crumbed) : crumbed

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

// Inside BCPS MarComm a document shows no header of its own (Sean,
// 2026-11-02): the platform's top bar is already there, so the doc's fixed
// BCPS header bar and its skip link are hidden and the page starts at the
// title. Open full page and the public /playbooks/ URL serve the document
// without ?embed=1, so they keep the header. id lets the in-place editor
// strip it before saving, like the script.
const EMBED_STYLE = `<style id="bcps-embed-style">
header.bcps-header, .skip-link { display: none !important; }
main { padding-top: 28px !important; }
@media (max-width: 640px) { main { padding-top: 20px !important; } }
</style>`

// Breadcrumb above the title (Sean, 2026-11-02): Documents, then the
// Playbook a doc lives under, then the doc, so a reader always has a way
// back. Added when served, never stored: id lets the in-place editor strip
// it before saving. Inside the dashboard the embed script opens the Playbook
// link in the Documents tab; Documents goes to the list.
const escHtml = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
function withBreadcrumb(html: string, title: string | null, parentSlug: string | null, parentTitle: string | null): string {
  // Versioned docs repeat the title once per version block, so the crumb
  // goes before the first version switch when there is one.
  const v = html.search(/<input[^>]*class="ver-radio"/i)
  const i = v !== -1 ? v : html.search(/<h1[\s>]/i)
  if (i === -1) return html
  const link = 'color:#1672A7;text-decoration:none;font-weight:700'
  const sep = '<span aria-hidden="true" style="margin:0 8px;color:#9ca3af">&rsaquo;</span>'
  const parts = [`<a href="/?page=dashboard&amp;tab=documents" style="${link}">Documents</a>`]
  if (parentSlug) parts.push(`<a href="/playbooks/${encodeURIComponent(parentSlug)}" style="${link}">${escHtml(parentTitle || parentSlug)}</a>`)
  parts.push(`<span aria-current="page" style="color:#4b5563">${escHtml(title || 'This document')}</span>`)
  const nav = `<nav id="bcps-doc-breadcrumb" aria-label="Breadcrumb" style="font-size:13px;line-height:1.5;margin:0 0 10px;display:flex;flex-wrap:wrap;align-items:center">${parts.join(sep)}</nav>`
  return html.slice(0, i) + nav + html.slice(i)
}

function withEmbedStyle(html: string): string {
  const h = html.toLowerCase().indexOf('</head>')
  return h === -1 ? EMBED_STYLE + html : html.slice(0, h) + EMBED_STYLE + html.slice(h)
}

function withEmbedScript(html: string): string {
  const styled = withEmbedStyle(html)
  const i = styled.toLowerCase().lastIndexOf('</body>')
  return i === -1 ? styled + EMBED_SCRIPT : styled.slice(0, i) + EMBED_SCRIPT + styled.slice(i)
}

async function sha256HexPrefix(input: string, len: number): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.slice(0, len)
}
