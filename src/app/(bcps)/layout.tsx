import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import BCPSShell from '@/components/BCPSShell'

export default async function BCPSLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers()
  const pathname = headersList.get('x-pathname') || ''
  const isWcmPortal     = pathname.startsWith('/wcm-portal')
  const isWcmRosterForm = pathname.startsWith('/wcm-roster-signup')
  const isWcmRegistration = pathname.startsWith('/wcm-registration')
  const isLoginPage    = pathname.startsWith('/login') || pathname.startsWith('/set-password')
  // School WCM signup (2026-10-05): public, standalone, like wcm-registration.
  const isSchoolRegistration = pathname.startsWith('/school-registration')

  // WCM Certification is gated the same as every other /bcps/* module now
  // (per V, 2026-07-28) - no more bespoke cert-only auth bypass here.
  if (!isWcmPortal && !isWcmRosterForm && !isWcmRegistration && !isLoginPage && !isSchoolRegistration) {
    // BCPS portal auth: redirect to BCPS login if no session
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          // A server component cannot write cookies (Next.js throws); the
          // session refresh is written by middleware.ts on the same request.
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch { /* read-only here */ }
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }

  // MarComm Request Form (2026-10-08): signed-in District employees only (the
  // auth check above still applies), but rendered on its own without the
  // admin shell - most requesters have no other reason to use the portal.
  if (pathname.startsWith('/marcomm-request')) {
    return <>{children}</>
  }

  // Login/set-password: render without BCPSShell wrapper
  if (isLoginPage || isSchoolRegistration) {
    return <>{children}</>
  }

  // WCM portal: its own standalone layout (no admin shell)
  if (isWcmPortal) {
    return <>{children}</>
  }

  // Public WCM Roster signup form: standalone, no auth, no admin shell -
  // Directors filling this out have no portal account.
  if (isWcmRosterForm) {
    return <>{children}</>
  }

  // WCM Department Registration welcome page (renamed from WCM Pilot
  // Program 2026-07-28): standalone, no auth, no admin shell - brand new
  // WCMs land here before they have an account.
  if (isWcmRegistration) {
    return <>{children}</>
  }

  // BCPSShell wraps all /bcps/* routes, including certification now that
  // it shares the standard auth gate above.
  return <BCPSShell>{children}</BCPSShell>
}
