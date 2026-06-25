import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { MODULES, COURSE_ID } from '@/lib/cert-data'

export default async function DepartmentsRoot() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/bcps/certification/login')

  const { data: progress } = await supabase
    .from('wcm_cert_progress')
    .select('module_id,page_id,completed')
    .eq('user_id', user.id)
    .eq('course_id', COURSE_ID)

  const completedPages = new Set((progress || []).filter((p: { completed: boolean }) => p.completed).map((p: { module_id: string; page_id: string }) => `${p.module_id}::${p.page_id}`))

  if (completedPages.size === 0) {
    redirect('/bcps/certification/departments/welcome')
  }

  // Find first incomplete page (resume point)
  for (const mod of MODULES) {
    for (const page of mod.pages) {
      if (!completedPages.has(`${mod.id}::${page.id}`)) {
        redirect(`/bcps/certification/departments/course/${mod.id}/${page.id}`)
      }
    }
  }

  // All done
  redirect('/bcps/certification/departments/complete')
}
