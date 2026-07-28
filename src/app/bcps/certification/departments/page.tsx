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
  if (!user) redirect('/bcps/login')

  const { data: progress } = await supabase
    .from('wcm_cert_progress')
    .select('module_id,page_id,completed,last_visited_at')
    .eq('user_id', user.id)
    .eq('course_id', COURSE_ID)

  const rows = progress || []
  if (rows.length === 0) {
    redirect('/bcps/certification/departments/welcome')
  }

  const allKeys = MODULES.flatMap((mod) => mod.pages.map((page) => `${mod.id}::${page.id}`))

  const completedPages = new Set(
    rows
      .filter((p: { completed: boolean }) => p.completed)
      .map((p: { module_id: string; page_id: string }) => `${p.module_id}::${p.page_id}`)
  )

  if (allKeys.every((k) => completedPages.has(k))) {
    redirect('/bcps/certification/departments/complete')
  }

  // Resume at the most recently visited page, not just the first incomplete
  // page in course order. "Save & Exit" only records the current page as
  // visited (not completed) unless the user separately clicked Mark
  // Complete, so resuming purely off completion order sent returning users
  // all the way back to Module 1 even when they had read well past it. This
  // uses last_visited_at to send them back to exactly where they left off.
  const lastVisited = rows
    .filter(
      (p: { module_id: string; page_id: string; last_visited_at: string | null }) =>
        allKeys.includes(`${p.module_id}::${p.page_id}`) && p.last_visited_at
    )
    .sort(
      (a: { last_visited_at: string }, b: { last_visited_at: string }) =>
        new Date(b.last_visited_at).getTime() - new Date(a.last_visited_at).getTime()
    )[0]

  if (lastVisited) {
    redirect(`/bcps/certification/departments/course/${lastVisited.module_id}/${lastVisited.page_id}`)
  }

  // Fallback for legacy rows with no last_visited_at: first incomplete page.
  for (const mod of MODULES) {
    for (const page of mod.pages) {
      if (!completedPages.has(`${mod.id}::${page.id}`)) {
        redirect(`/bcps/certification/departments/course/${mod.id}/${page.id}`)
      }
    }
  }

  redirect('/bcps/certification/departments/complete')
}
