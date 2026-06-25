import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── Standalone BCPS property (bcpsmarcomm.com) ───────────────────────────
  // The entire domain is BCPS. Rewrite all non-prefixed paths to /bcps/*.
  // Auth callback (/auth/*), Next internals (/_next/*), API routes (/api/*),
  // and public brief routes (/briefs/*) are excluded from the rewrite.
  if (
    !pathname.startsWith('/bcps') &&
    !pathname.startsWith('/briefs/') &&
    !pathname.startsWith('/auth/') &&
    !pathname.startsWith('/_next/') &&
    !pathname.startsWith('/api/')
  ) {
    const isLoginPath =
      pathname === '/login' ||
      pathname.startsWith('/login') ||
      pathname.startsWith('/set-password') ||
      pathname.startsWith('/certification/login')
    const isStaticFile = /\.(html|pptx|pdf|png|jpg|svg|css|js|webp)(\?|$)/.test(pathname)

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

    if (!user && !isLoginPath && !isStaticFile) {
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
    pathname.startsWith('/briefs/') ||
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
