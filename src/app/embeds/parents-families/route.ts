import { readFileSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

// Portals Project test-page embed (Sean, 2026-10-22: "build the test-page
// embed for Farrah"). The same Parents & Families page as
// /mockups/parents-families, cut down to what would sit inside a Finalsite
// page: the review bar, the copied site header, navigation and footer, the
// walkthrough and the build notes are stripped (they are marked mock-only in
// the source file), so there is one file to edit for both.
//
// Public on purpose, and unlisted: /embeds/ is in the middleware's isPublic
// list because a Finalsite page has to frame it signed out. It carries
// example content only, and noindex keeps it out of search engines. The
// mockup itself stays behind sign-in.
export const dynamic = 'force-dynamic'

const FILE = path.join(process.cwd(), 'src/mockups/parents-families.html')
const SLUG = 'parents-families'

// Links open in the Finalsite page, not inside the frame; the page sits flush
// in the host's content column; and the frame reports its height the same way
// every BCPS MarComm widget does (bcps-widget-resize), so the host snippet
// can grow and shrink the iframe to fit.
const HEAD = `<base target="_top">
<style>
  body.embed { background: transparent; }
  body.embed .wrap { padding: 0; }
  body.embed .section, body.embed .hero, body.embed .signin-bar, body.embed .results-head { scroll-margin-top: 12px; }
</style>`

const RESIZE = `<script>
(function () {
  var last = 0;
  function post() {
    var h = Math.ceil(document.body.getBoundingClientRect().height);
    if (Math.abs(h - last) < 2) return;
    last = h;
    window.parent.postMessage({ type: 'bcps-widget-resize', slug: '${SLUG}', height: h }, '*');
  }
  if ('ResizeObserver' in window) new ResizeObserver(post).observe(document.body);
  window.addEventListener('load', post);
  window.addEventListener('resize', post);
  post();
})();
</script>`

function toEmbed(html: string): string {
  const out = html
    .replace(/<!-- mock-only:start[\s\S]*?<!-- mock-only:end -->\n?/g, '')
    .replace(/\/\* mock-only:start \*\/[\s\S]*?\/\* mock-only:end \*\/\n?/g, '')
    .replace(/<title>Mockup: /, '<title>')
    .replace('</head>', `${HEAD}\n</head>`)
    .replace('<body>', '<body class="embed">')
    .replace('</body>', `${RESIZE}\n</body>`)
  if (out.includes('mock-only')) throw new Error('unmatched mock-only marker in parents-families.html')
  return out
}

export async function GET() {
  const html = toEmbed(readFileSync(FILE, 'utf8'))
  return new NextResponse(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
