import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import WcmPilotFeedback from '@/app/bcps/wcm-pilot/WcmPilotFeedback'

export default async function CertLayout({ children }: { children: React.ReactNode }) {
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
  if (!user) redirect('/bcps/certification/login')

  // BCPSShell is provided by the parent bcps/layout.tsx. WcmPilotFeedback is
  // mounted here so every certification-course page (login, departments,
  // dashboard, course modules) carries the same feedback channel, per the
  // July 16 Hot Lab request to replace Teams/email for pilot testers.
  return (
    <>
      {children}
      <WcmPilotFeedback />
    </>
  )
}
