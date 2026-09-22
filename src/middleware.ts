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
    // /wcm-roster-signup: public again as of 2026-09-15, Sean's explicit call
    // with the risk stated - directors are not getting portal accounts yet
    // (that is being cleaned up first) and the sign-in wall was costing
    // responses. Every director will be moved onto a real login in a week or
    // two and this goes back behind auth then.
    //
    // What still protects the record, so re-opening the page is not re-opening
    // the 2026-09-14 hole (PUBLIC-REPO-HARDCODED-KEY-ESCALATED):
    //   - the submission is a REQUEST, never a write to the roster. Nothing
    //     reaches bcps_wcm_roster until an admin approves it by hand.
    //   - a district (@browardschools.com) submitter address is still required,
    //     now self-declared rather than session-proven when signed out.
    //   - only a SESSION-VERIFIED submitter can become director_email of
    //     record on approval (see wcm-roster-queue) - a self-declared address
    //     never writes an identity, it only labels the request.
    //   - unverified submitters still raise identity_flag and the review email.
    pathname.startsWith('/wcm-roster-signup') ||
    // WCM Department Registration welcome page (renamed from WCM Pilot
    // Program 2026-07-28): shared with brand new WCMs who have no account
    // yet. Same reasoning as wcm-roster-signup above - must stay public or
    // anonymous visitors get bounced to /login before seeing it.
    pathname.startsWith('/wcm-registration') ||
    pathname.startsWith('/briefs/') ||
    pathname.startsWith('/embeds/') ||
    // BCPS Playbooks/Docs (canon-bcps-doc-url-standard, Sean 2026-09-03): per-slug
    // access (public unless bcps_brief_recipients has rows) is enforced in
    // checkDocAccess (src/lib/bcps-doc-access.ts). This entry only stops the
    // middleware from bouncing every /playbooks/ request to /login before that
    // check ever runs -- added 2026-09-08 after live verification showed every
    // /playbooks/ URL, including intentionally public ones, hit the login wall
    // unconditionally.
    pathname.startsWith('/playbooks/') ||
    // Campaign reports (/campaigns/[slug]). Per-campaign: a campaign with
    // is_public = true is readable by anyone with the link, which is the whole
    // point of it (Sean, 2026-09-22: shared with the chief and others, no
    // obstacles). A campaign with is_public = false still falls through to
    // checkCampaignReportAccess inside the route, which is default deny.
    //
    // This entry only stops the middleware bouncing every /campaigns/ request
    // to /login before that per-campaign decision can be made. The route, not
    // this list, is what decides.
    pathname.startsWith('/campaigns/')

  if (isPublic) return supabaseResponse

  if (!user) {
    // WCM Certification is not a separate account system - per V,
    // 2026-07-28: one BCPS Marcomm login gates every page, certification
    // included. No bespoke cert login/register exists.
    //
    // Carry the requested path through as ?next= so signing in returns the
    // visitor to where they were headed instead of the homepage. The login
    // page already reads this param (4808bc5); it just was never being sent
    // from here. Added 2026-09-14 alongside gating /wcm-roster-signup, whose
    // link is emailed to directors directly - without this, every director
    // following that link lands somewhere else after signing in.
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
