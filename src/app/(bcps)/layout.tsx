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

  // WCM Certification is gated the same as every other /bcps/* module now
  // (per V, 2026-07-28) - no more bespoke cert-only auth bypass here.
  if (!isWcmPortal && !isWcmRosterForm && !isWcmRegistration && !isLoginPage) {
    // BCPS portal auth: redirect to BCPS login if no session
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')
  }

  // Login/set-password: render without BCPSShell wrapper
  if (isLoginPage) {
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
