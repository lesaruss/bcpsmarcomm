import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Documents that contain personal/sensitive evaluation data.
// Access is restricted to the named individuals only (server-enforced).
const SENSITIVE_DOC = /bcps-appas-evaluation\.html$|bcps-appas-self-eval/i
const SENSITIVE_DOC_ALLOWED = new Set([
  'contact@lesaruss.com',
  'farrah.wilson@browardschools.com',
])

function readOnlyClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() { /* read-only */ },
      },
    }
  )
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Legacy WCM Pilot Program URLs (renamed to WCM Department Registration
  // 2026-07-28). Permanent redirect so old links/bookmarks still land. ─────
  if (pathname === '/wcm-pilot' || pathname.startsWith('/wcm-pilot/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/wcm-pilot', '/wcm-registration')
    return NextResponse.redirect(url, 308)
  }

  // ── Sensitive document gate (runs before everything else) ────────────────
  if (SENSITIVE_DOC.test(pathname)) {
    const supabase = readOnlyClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    const email = (user?.email || '').toLowerCase()
    if (!user || !SENSITIVE_DOC_ALLOWED.has(email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = '?page=documents&denied=1'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // Root-level static documents (e.g. /bcps-implementation-plan-2026-2027.pdf)
  // are public assets served straight from /public - no auth needed.
  const isStaticFile = /\.(html|pptx|pdf|png|jpg|svg|css|js|webp|mp3|mp4)(\?|$)/.test(pathname)
  if (isStaticFile) {
    return NextResponse.next()
  }

  // ── Standard auth middleware. bcpsmarcomm.com is one standalone property -
  // every page lives at its own clean top-level path. The old dual-path
  // rewrite into an internal "/bcps" namespace (which made bcpsmarcomm.com/bcps/*
  // resolve alongside the clean URL) is removed 2026-08-10 per Sean: no
  // /bcps/ segment should exist in any URL on this site, ever. ─────────────
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  supabaseResponse.headers.set('x-pathname', pathname)

  const isPublic =
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth') ||
    pathname === '/login' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/set-password') ||
    // Department WCM Roster signup: the one page on this site Directors
    // reach with no account. Real access control lives here, not just the
    // BCPSShell wrapper - without this line an anonymous visitor gets
    // redirected to /login before the page ever renders.
    pathname.startsWith('/wcm-roster-signup') ||
    // WCM Department Registration welcome page (renamed from WCM Pilot
    // Program 2026-07-28): shared with brand new WCMs who have no account
    // yet. Same reasoning as wcm-roster-signup above - must stay public or
    // anonymous visitors get bounced to /login before seeing it.
    pathname.startsWith('/wcm-registration') ||
    pathname.startsWith('/briefs/') ||
    pathname.startsWith('/embeds/')

  if (isPublic) return supabaseResponse

  if (!user) {
    // WCM Certification is not a separate account system - per V,
    // 2026-07-28: one BCPS Marcomm login gates every page, certification
    // included. No bespoke cert login/register exists.
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
