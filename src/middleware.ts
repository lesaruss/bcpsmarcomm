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

  // ── Sensitive document gate (runs before everything else) ────────────────
  if (SENSITIVE_DOC.test(pathname)) {
    const supabase = readOnlyClient(request)
    const { data: { user } } = await supabase.auth.getUser()
    const email = (user?.email || '').toLowerCase()
    if (!user || !SENSITIVE_DOC_ALLOWED.has(email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/bcps'
      url.search = '?page=documents&denied=1'
      return NextResponse.redirect(url)
    }
    return NextResponse.next()
  }

  // ── Standalone BCPS property (bcpsmarcomm.com) ───────────────────────────
  if (
    !(pathname === '/bcps' || pathname.startsWith('/bcps/')) &&
    !pathname.startsWith('/briefs/') &&
    !pathname.startsWith('/embeds/') &&
    !pathname.startsWith('/auth/') &&
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/api/')
  ) {
    const isLoginPath =
      pathname === '/login' ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/set-password') ||
      pathname.startsWith('/certification/login')
    // Department WCM Roster signup: reachable at the clean top-level URL
    // bcpsmarcomm.com/wcm-roster-signup (rewritten to /bcps/wcm-roster-signup
    // below) so Directors never see the internal "/bcps" segment. No account
    // required - this is one of the only genuinely public pages on this site.
    const isWcmRosterSignup = pathname.startsWith('/wcm-roster-signup')
    const isStaticFile = /\.(html|pptx|pdf|png|jpg|svg|css|js|webp)(\?|$)/.test(pathname)

    // Root-level static documents (e.g. /bcps-implementation-plan-2026-2027.pdf)
    // are public assets served straight from /public - do not rewrite them into
    // the /bcps app namespace (no matching file lives there) or gate them behind auth.
    if (isStaticFile) {
      return NextResponse.next()
    }

    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/bcps' + (pathname === '/' ? '' : pathname)

    let response = NextResponse.rewrite(rewriteUrl)

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.rewrite(rewriteUrl)
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    response.headers.set('x-pathname', rewriteUrl.pathname)

    if (!user && !isLoginPath && !isWcmRosterSignup && !isStaticFile) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      return NextResponse.redirect(loginUrl)
    }

    return response
  }

  // ── Standard auth middleware for /bcps/* paths ───────────────────────────
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
    pathname === '/bcps/login' ||
    pathname.startsWith('/bcps/login') ||
    pathname.startsWith('/bcps/set-password') ||
    pathname.startsWith('/bcps/certification/login') ||
    // Department WCM Roster signup: the one page on this site Directors
    // reach with no account. Real access control lives here, not just the
    // BCPSShell wrapper - without this line an anonymous visitor gets
    // redirected to /login before the page ever renders.
    pathname.startsWith('/bcps/wcm-roster-signup') ||
    pathname.startsWith('/briefs/') ||
    pathname.startsWith('/embeds/') ||
    (pathname.startsWith('/bcps/') && /\.(html|pptx|pdf|png|jpg|svg|css|js|webp)(\?|$)/.test(pathname))

  if (isPublic) return supabaseResponse

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    if (pathname.startsWith('/bcps/certification')) {
      loginUrl.pathname = '/bcps/certification/login'
    } else {
      loginUrl.pathname = '/login'
    }
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
