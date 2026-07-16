import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import BCPSShell from '@/components/BCPSShell'

export default async function BCPSLayout({ children }: { children: React.ReactNode }) {
  const headersList = headers()
  const pathname = headersList.get('x-pathname') || ''
  const isCert         = pathname.startsWith('/bcps/certification')
  const isWcmPortal     = pathname.startsWith('/bcps/wcm-portal')
  const isWcmRosterForm = pathname.startsWith('/bcps/wcm-roster-signup')
  const isWcmPilot      = pathname.startsWith('/bcps/wcm-pilot')
  const isLoginPage    = pathname.startsWith('/bcps/login') || pathname.startsWith('/bcps/set-password')

  if (!isCert && !isWcmPortal && !isWcmRosterForm && !isWcmPilot && !isLoginPage) {
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
    if (!user) redirect('/bcps/login')
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

  // WCM Pilot welcome page: standalone, no auth, no admin shell -
  // brand new pilot WCMs land here before they have an account.
  if (isWcmPilot) {
    return <>{children}</>
  }

  // Cert routes: let bcps/certification/layout handle its own auth
  // BCPSShell wraps all other /bcps/* routes
  return <BCPSShell>{children}</BCPSShell>
}
