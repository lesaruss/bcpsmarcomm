'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { MODULES, COURSE_ID, getPageById, getModuleById, getNextPage, getPrevPage } from '@/lib/cert-data'
import type { CourseModule, CoursePage, QuizQuestion } from '@/lib/cert-data'

interface Props { params: { moduleId: string; pageId: string } }

export default function CoursePlayerPage({ params }: Props) {
  const { moduleId, pageId } = params
  const router = useRouter()
  const supabase = createClient()
  const [userId, setUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [completedPages, setCompletedPages] = useState<Set<string>>(new Set())
  const [submissions, setSubmissions] = useState<Record<string, string>>({})
  const [submissionDraft, setSubmissionDraft] = useState('')
  const [submissionSaved, setSubmissionSaved] = useState(false)
  const [submissionSaving, setSubmissionSaving] = useState(false)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, { path: string; name: string }>>({})
  const [fileUploading, setFileUploading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  // "Request Composer Access" (Sean, 2026-09-02): shown on pages flagged
  // composerAccessGate in cert-data.ts. idle -> checking (GET on load) ->
  // either 'available' (no request on file, show the button) or 'requested'
  // (already on file, show the confirmation instead).
  const [accessRequestState, setAccessRequestState] = useState<'idle' | 'checking' | 'available' | 'requesting' | 'requested'>('idle')
  const [accessRequestedAt, setAccessRequestedAt] = useState<string | null>(null)
  const [accessRequestError, setAccessRequestError] = useState<string | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizScore, setQuizScore] = useState(0)
  const [quizPassed, setQuizPassed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Modules the user has manually expanded in the outline/rail accordion.
  // The active module is always shown expanded regardless of this set.
  const [openModules, setOpenModules] = useState<Set<string>>(new Set())
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

  // /api/cert/progress and /api/cert/upload verify the caller's Supabase
  // session server-side rather than trusting a client-supplied user_id
  // (fixed 2026-09-01, full-course audit follow-up). Every fetch to those
  // routes needs this Authorization header - supabase-js keeps the access
  // token refreshed in memory, so pulling it fresh from getSession() right
  // before each request avoids sending a stale one on a long-open page.
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    }
  }, [])

  const toggleModule = useCallback((modId: string) => {
    setOpenModules(prev => {
      const next = new Set(prev)
      if (next.has(modId)) next.delete(modId)
      else next.add(modId)
      return next
    })
  }, [])

  // Escape closes the mobile course-outline modal (Sean, voice note
  // 2026-08-10: retire the side drawer, replace with a dismissible modal).
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const mod = getModuleById(moduleId)
  const page = getPageById(moduleId, pageId)
  const next = getNextPage(moduleId, pageId)
  const prev = getPrevPage(moduleId, pageId)
  const pageKey = `${moduleId}::${pageId}`
  // The Submit Badge Evidence page (type: 'content', not 'assignment')
  // asked WCMs for a screenshot or email confirmation with no upload
  // control anywhere in the app - flagged in the full-course audit,
  // fixed 2026-09-01 (Sean: "let's get that taken care of"). It reuses
  // the same file-attach UI and /api/cert/upload route as assignments,
  // just with image types allowed and no text submission box.
  const isBadgeEvidencePage = moduleId === 'final' && pageId === 'badge'
  const pageIndex = mod ? mod.pages.findIndex((p: CoursePage) => p.id === pageId) : 0
  const totalPages = mod ? mod.pages.length : 0
  // Where-am-I overall progress (per Sean, Hot Lab 2026-07-28: WCMs need to
  // see cert progress at a glance, not just per-module page counts).
  const allPageKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
  const overallTotal = allPageKeys.length
  const overallCompleted = allPageKeys.filter((k: string) => completedPages.has(k)).length
  const overallPct = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserId(user.id)
      await supabase.from('wcm_cert_users').upsert(
        { user_id: user.id, email: user.email!, full_name: user.user_metadata?.full_name || null, is_admin: false },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      const { data: profile } = await supabase.from('wcm_cert_users').select('is_admin').eq('user_id', user.id).maybeSingle()
      setIsAdmin(!!profile?.is_admin)
      const { data } = await supabase.from('wcm_cert_progress')
        .select('module_id,page_id,completed,submission_text,submission_file_path,submission_file_name')
        .eq('user_id', user.id)
        .eq('course_id', COURSE_ID)
      if (data) {
        setCompletedPages(new Set(data.filter((r: { completed: boolean }) => r.completed).map((r: { module_id: string; page_id: string }) => `${r.module_id}::${r.page_id}`)))
        const subs: Record<string, string> = {}
        const files: Record<string, { path: string; name: string }> = {}
        data.forEach((r: { module_id: string; page_id: string; submission_text: string | null; submission_file_path: string | null; submission_file_name: string | null }) => {
          if (r.submission_text) subs[`${r.module_id}::${r.page_id}`] = r.submission_text
          if (r.submission_file_path && r.submission_file_name) files[`${r.module_id}::${r.page_id}`] = { path: r.submission_file_path, name: r.submission_file_name }
        })
        setSubmissions(subs)
        setSubmissionFiles(files)
      }
      setLoading(false)
    }
    init()
  }, [moduleId, pageId])

  // Load whatever submission text exists for the page being viewed (or
  // start blank) whenever the learner navigates to a new page.
  useEffect(() => {
    setSubmissionDraft(submissions[pageKey] || '')
    setSubmissionSaved(false)
    setSubmissionError(null)
    setFileError(null)
  }, [pageKey, submissions])

  // Attaches the PDF a WCM reviewed for the accessibility assignment.
  // Uploads through the server (service role) so no storage bucket RLS
  // needs to open up to end users - see /api/cert/upload.
  const uploadSubmissionFile = useCallback(async (file: File) => {
    if (!userId) return
    const allowedPattern = isBadgeEvidencePage ? /\.(pdf|png|jpe?g)$/i : /\.(pdf|docx?)$/i
    if (!allowedPattern.test(file.name)) {
      setFileError(isBadgeEvidencePage
        ? 'Only PDF, PNG, or JPG files can be attached here.'
        : 'Only PDF or Word (.docx) files can be attached here.')
      return
    }
    if (file.size > 15 * 1024 * 1024) {
      setFileError('That file is larger than 15MB. Please attach a smaller file.')
      return
    }
    setFileUploading(true)
    setFileError(null)
    try {
      const file_base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch('/api/cert/upload', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, filename: file.name, file_base64 }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Server returned ${res.status}`)
      setSubmissionFiles(prev => ({ ...prev, [pageKey]: { path: json.path, name: json.filename } }))
    } catch (err) {
      console.error('PDF attach failed:', err)
      setFileError(err instanceof Error ? err.message : 'That upload did not go through. Please try again.')
    } finally {
      setFileUploading(false)
    }
  }, [userId, moduleId, pageId, pageKey, getAuthHeaders, isBadgeEvidencePage])

  const removeSubmissionFile = useCallback(async () => {
    const existing = submissionFiles[pageKey]
    if (!userId || !existing) return
    setFileUploading(true)
    setFileError(null)
    try {
      const res = await fetch('/api/cert/upload', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, path: existing.path }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || `Server returned ${res.status}`)
      }
      setSubmissionFiles(prev => { const next = { ...prev }; delete next[pageKey]; return next })
    } catch (err) {
      console.error('PDF remove failed:', err)
      setFileError(err instanceof Error ? err.message : 'Could not remove that file. Please try again.')
    } finally {
      setFileUploading(false)
    }
  }, [userId, moduleId, pageId, pageKey, submissionFiles, getAuthHeaders])

  const saveSubmission = useCallback(async (text: string) => {
    if (!userId) return
    setSubmissionSaving(true)
    setSubmissionError(null)
    try {
      const res = await fetch('/api/cert/progress', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, submission_text: text }),
      })
      if (!res.ok) {
        let detail = ''
        try { detail = (await res.json())?.error || '' } catch { /* non-JSON error body */ }
        throw new Error(detail || `Server returned ${res.status}`)
      }
      setSubmissions(prev => ({ ...prev, [pageKey]: text }))
      setSubmissionSaved(true)
    } catch (err) {
      console.error('Save Draft failed:', err)
      setSubmissionSaved(false)
      setSubmissionError('Your draft did not save. Check your connection and try Save Draft again - your text is still in the box.')
    } finally {
      setSubmissionSaving(false)
    }
  }, [userId, moduleId, pageId, pageKey, getAuthHeaders])

  // "Request Composer Access" (Sean, 2026-09-02): on load, check whether this
  // learner already has a pending access request on file for this course, so
  // we show the confirmation instead of the button after a refresh.
  useEffect(() => {
    if (!userId || !page?.composerAccessGate) return
    let cancelled = false
    setAccessRequestState('checking')
    ;(async () => {
      try {
        const headers = await getAuthHeaders()
        const res = await fetch(`/api/cert/request-access?course_id=${COURSE_ID}`, { headers })
        const json = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok && json?.request?.status === 'pending') {
          setAccessRequestState('requested')
          setAccessRequestedAt(json.request.requested_at || null)
        } else {
          setAccessRequestState('available')
        }
      } catch (err) {
        console.error('Access-request status check failed:', err)
        if (!cancelled) setAccessRequestState('available')
      }
    })()
    return () => { cancelled = true }
  }, [userId, page?.composerAccessGate, getAuthHeaders])

  const requestComposerAccess = useCallback(async () => {
    if (!userId) return
    setAccessRequestState('requesting')
    setAccessRequestError(null)
    try {
      const res = await fetch('/api/cert/request-access', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || `Server returned ${res.status}`)
      setAccessRequestState('requested')
      setAccessRequestedAt(json.requested_at || new Date().toISOString())
    } catch (err) {
      console.error('Request Composer Access failed:', err)
      setAccessRequestState('available')
      setAccessRequestError('That did not go through. Check your connection and try again.')
    }
  }, [userId, moduleId, pageId, getAuthHeaders])

  useEffect(() => {
    if (!userId || loading) return
    ;(async () => {
      const headers = await getAuthHeaders()
      fetch('/api/cert/progress', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
      }).catch(console.error)
    })()
  }, [userId, moduleId, pageId, loading, getAuthHeaders])

  useEffect(() => {
    if (!userId) return
    autoSaveRef.current = setInterval(async () => {
      setSaving(true)
      const headers = await getAuthHeaders()
      await fetch('/api/cert/progress', {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
      })
      setTimeout(() => setSaving(false), 1200)
    }, 5 * 60 * 1000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [userId, moduleId, pageId, getAuthHeaders])

  const saveAndExit = useCallback(async () => {
    if (!userId) return
    await fetch('/api/cert/progress', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
    }).catch(console.error)
    router.push('/')
  }, [userId, moduleId, pageId, getAuthHeaders])

  const markComplete = useCallback(async () => {
    if (!userId) return
    if (!completedPages.has(pageKey)) {
      let res: Response
      try {
        res = await fetch('/api/cert/progress', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, completed: true,
            ...(page?.type === 'assignment' ? { submission_text: submissionDraft } : {}),
          }),
        })
      } catch (err) {
        console.error('Failed to save progress:', err)
        setSubmissionError('This did not save. Check your connection and press the button again - your text is still in the box, nothing has been lost.')
        return
      }
      if (!res.ok) {
        console.error('Failed to save progress:', res.status)
        setSubmissionError('This did not save. Check your connection and press the button again - your text is still in the box, nothing has been lost.')
        return
      }
      setSubmissionError(null)
      const newCompleted = new Set(Array.from(completedPages).concat(pageKey))
      setCompletedPages(newCompleted)
      const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
      if (allKeys.every((k: string) => newCompleted.has(k))) {
        await fetch('/api/cert/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
        }).catch(console.error)
        router.push('/certification/departments/complete')
        return
      }
    }
    if (next) {
      router.push(`/certification/departments/course/${next.moduleId}/${next.pageId}`)
    } else {
      router.push('/certification/departments/complete')
    }
  }, [userId, completedPages, pageKey, moduleId, pageId, next, page, submissionDraft, getAuthHeaders])

  // Marks page complete without navigating - activates the footer Continue button
  const markCompleteOnly = useCallback(async () => {
    if (!userId || completedPages.has(pageKey)) return
    let res: Response
    try {
      res = await fetch('/api/cert/progress', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, completed: true,
          ...(page?.type === 'assignment' ? { submission_text: submissionDraft } : {}),
        }),
      })
    } catch (err) {
      console.error('Failed to save progress:', err)
      setSubmissionError('This did not save. Check your connection and press Mark Complete again - your text is still in the box, nothing has been lost.')
      return
    }
    if (!res.ok) {
      console.error('Failed to save progress:', res.status)
      setSubmissionError('This did not save. Check your connection and press Mark Complete again - your text is still in the box, nothing has been lost.')
      return
    }
    setSubmissionError(null)
    const newCompleted = new Set(Array.from(completedPages).concat(pageKey))
    setCompletedPages(newCompleted)
    const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
    if (allKeys.every((k: string) => newCompleted.has(k))) {
      await fetch('/api/cert/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
      }).catch(console.error)
      router.push('/certification/departments/complete')
    }
  }, [userId, completedPages, pageKey, moduleId, pageId, page, submissionDraft, getAuthHeaders])

  async function handleQuizSubmit() {
    if (!page?.questions || !userId || !mod) return
    let correct = 0
    page.questions.forEach((q: QuizQuestion, i: number) => { if (quizAnswers[i] === q.correctIndex) correct++ })
    const score = Math.round((correct / page.questions.length) * 100)
    const passed = score >= 80
    setQuizScore(score)
    setQuizPassed(passed)
    setQuizSubmitted(true)
    await supabase.from('wcm_cert_quiz_attempts').insert({
      user_id: userId, course_id: COURSE_ID, module_id: moduleId,
      score, passed, answers: quizAnswers, attempted_at: new Date().toISOString(),
    })
    if (passed) {
      // Mark remaining CONTENT pages in this module complete so the next
      // module unlocks, so users who skipped "Mark Complete" on reading
      // pages still advance cleanly. Assignment pages (and the final
      // module's Submit Badge Evidence page) require the learner to
      // actually do and submit something - passing the quiz must never
      // silently tick those off. Before this fix, passing the Final Quiz
      // force-completed the Final Assignment and Submit Badge Evidence
      // pages along with everything else in the "final" module, which
      // satisfied the all-pages-complete check and fired /certification/
      // departments/complete instantly - before the learner ever saw those
      // pages (Kristin Kupetsky, 2026-08-20: quiz score flashed then jumped
      // straight to the certificate, with no way back to the required
      // submission steps).
      const incompletePages = mod.pages.filter(
        (p: CoursePage) => p.type !== 'assignment' && !(moduleId === 'final' && p.id === 'badge') && !completedPages.has(`${moduleId}::${p.id}`)
      )
      if (incompletePages.length > 0) {
        const headers = await getAuthHeaders()
        await Promise.all(
          incompletePages.map((p: CoursePage) =>
            fetch('/api/cert/progress', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                user_id: userId, course_id: COURSE_ID,
                module_id: moduleId, page_id: p.id, completed: true,
              }),
            })
          )
        )
        const newlyCompletedKeys = incompletePages.map((p: CoursePage) => `${moduleId}::${p.id}`)
        const newCompleted = new Set([...Array.from(completedPages), ...newlyCompletedKeys])
        setCompletedPages(newCompleted)
        // Check full course completion
        const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
        if (allKeys.every((k: string) => newCompleted.has(k))) {
          await fetch('/api/cert/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
          }).catch(console.error)
          router.push('/certification/departments/complete')
          return
        }
      }
      // Let the "Continue to Module X" link already rendered below (once
      // quizPassed) be the way the user advances. Auto-navigating here used
      // to fire in the same tick as showing the score, so the pass/fail
      // screen flashed for a fraction of a second before redirecting away
      // (WCM Hot Lab feedback, Leon Clinch, 2026-07-30). Only auto-advance
      // when there is truly nothing left to continue to.
      if (!next) {
        router.push('/certification/departments/complete')
      }
    }
  }

  function canNavigateTo(targetModuleId: string, targetPageId: string) {
    // Admins can preview the full course - edit suggestions, video/audio
    // slots, etc. - without completing assessments or prior pages.
    if (isAdmin) return true
    const key = `${targetModuleId}::${targetPageId}`
    if (completedPages.has(key)) return true
    const targetPrev = getPrevPage(targetModuleId, targetPageId)
    if (!targetPrev) return true
    return completedPages.has(`${targetPrev.moduleId}::${targetPrev.pageId}`)
  }

  function isModuleUnlocked(modIndex: number): boolean {
    if (isAdmin) return true
    if (modIndex === 0) return true
    const prevMod = MODULES[modIndex - 1]
    return prevMod.pages.every((p: CoursePage) => completedPages.has(`${prevMod.id}::${p.id}`))
  }

  // Shared module-list accordion markup, used by BOTH the persistent
  // desktop rail and the mobile modal, so the two presentations can never
  // drift apart (Sean, voice note 2026-08-10: "one menu", not two divergent
  // copies). `closeOnNav` closes the mobile modal when a page link is
  // clicked; the desktop rail doesn't need that since it has no open/close
  // state.
  function renderModuleList(closeOnNav: boolean) {
    return (
      <>
        {MODULES.map((m: CourseModule, idx: number) => {
          const modAllDone = m.pages.every((p: CoursePage) => completedPages.has(`${m.id}::${p.id}`))
          const modActive = m.id === moduleId
          const unlocked = isModuleUnlocked(idx)
          // Accordion: only the active module is forced open. Every other
          // unlocked module is collapsed by default and expands on click
          // (Sean, voice note 2026-08-10).
          const isOpen = modActive || openModules.has(m.id)
          return (
            <div key={m.id} style={{ borderLeft: `3px solid ${modActive ? '#1672A7' : modAllDone ? '#16750C' : 'transparent'}`, opacity: unlocked ? 1 : 0.45 }}>
              {unlocked ? (
                <button
                  type="button"
                  onClick={() => toggleModule(m.id)}
                  aria-expanded={isOpen}
                  style={S.moduleAccordionBtn}
                >
                  <span>
                    {m.id === 'final' ? 'FINAL' : `MOD ${m.number}`} - {m.title}
                    {modAllDone && <span style={{ marginLeft: 4, color: '#16750C' }}>+</span>}
                  </span>
                  {!modActive && (
                    <span aria-hidden="true" style={{ ...S.moduleChevron, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9656;</span>
                  )}
                </button>
              ) : (
                <div style={S.moduleHeaderStatic}>
                  <span style={{ marginRight: 4 }}>LOCKED -</span>
                  {m.id === 'final' ? 'FINAL' : `MOD ${m.number}`} - {m.title}
                </div>
              )}
              {isOpen && unlocked && m.pages.map((p: CoursePage) => {
                const pk = `${m.id}::${p.id}`
                const isActive = m.id === moduleId && p.id === pageId
                const isDone = completedPages.has(pk)
                const accessible = canNavigateTo(m.id, p.id)
                return accessible ? (
                  <Link key={p.id} href={`/certification/departments/course/${m.id}/${p.id}`}
                    onClick={closeOnNav ? () => setMenuOpen(false) : undefined}
                    style={{ display: 'block', fontSize: 12, padding: '5px 16px', textDecoration: 'none', borderRadius: 4, margin: '1px 4px', background: isActive ? '#e8f4fd' : 'transparent', color: isDone ? '#16750C' : isActive ? '#1672A7' : '#444', fontWeight: isActive ? 700 : 400, lineHeight: 1.4 }}>
                    {isDone ? '+ ' : '  '}{p.title}
                  </Link>
                ) : (
                  <span key={p.id} style={{ display: 'block', fontSize: 12, padding: '5px 16px', color: '#bbb', lineHeight: 1.4, margin: '1px 4px' }}>{p.title}</span>
                )
              })}
            </div>
          )
        })}
      </>
    )
  }

  if (loading) return <div style={S.loading}>Loading...</div>
  if (!mod || !page) return <div style={S.loading}>Page not found. <Link href="/certification/departments/welcome">Return to overview.</Link></div>

  const isCurrentComplete = completedPages.has(pageKey)
  const canGoNext = next ? canNavigateTo(next.moduleId, next.pageId) || isCurrentComplete : false
  const isContentPage = page.type === 'content' || page.type === 'assignment'
  const isQuizPage = page.type === 'quiz'

  return (
    <>
      <style>{`
        .cert-content p { margin: 0 0 1rem; line-height: 1.75; font-weight: 400; }
        .cert-content h2 { font-size: 1.2rem; font-weight: 800; color: #0e4e73; margin: 1.75rem 0 0.75rem; line-height: 1.3; }
        .cert-content h3 { font-size: 1.05rem; font-weight: 700; color: #1672A7; margin: 1.4rem 0 0.6rem; line-height: 1.3; }
        .cert-content h4 { font-size: 0.95rem; font-weight: 700; color: #333; margin: 1.2rem 0 0.5rem; }
        .cert-content ul, .cert-content ol { padding-left: 1.5rem; margin: 0 0 1rem; }
        .cert-content li { margin-bottom: 0.45rem; line-height: 1.7; font-weight: 400; }
        .cert-content strong, .cert-content b { font-weight: 700; }
        .cert-content em, .cert-content i { font-style: italic; }
        .cert-content hr { border: none; border-top: 1px solid #e0e8ef; margin: 1.5rem 0; }
        .cert-content blockquote { border-left: 3px solid #1672A7; padding: 8px 16px; margin: 1rem 0; background: #f5f9fd; }
        .cert-content table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: 14px; }
        .cert-content th { background: #0e4e73; color: #fff; padding: 10px 14px; font-size: 12px; font-weight: 700; text-align: left; }
        .cert-content td { padding: 9px 14px; border-bottom: 1px solid #e8eef4; }
        .cert-content tr:nth-child(even) td { background: #f8fafb; }
        .cert-content a { color: #1672A7; }
        /* Mobile overflow guards: admin-authored page.content is raw HTML
           (tables, images) that can carry fixed pixel widths from whatever
           it was pasted from. Without these, a single wide table or image
           forces horizontal scroll on the whole page at mobile widths
           (Sean, voice note 2026-08-10). */
        .cert-content img { max-width: 100%; height: auto; }
        .cert-content, .cert-content td, .cert-content th { overflow-wrap: break-word; word-break: break-word; }
        .course-shell { padding: 28px 24px 48px; box-sizing: border-box; max-width: 100%; }
        .course-card-row { display: flex; align-items: stretch; gap: 24px; }
        .course-content-col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .course-rail { width: 280px; flex-shrink: 0; background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.06); overflow-y: auto; }
        .course-outline-toggle { display: none; }
        @media (max-width: 960px) {
          .course-shell { padding: 20px 16px 40px; }
          .course-rail { display: none; }
          .course-outline-toggle { display: flex !important; }
          /* contentCard's inline padding (32px 36px) is too wide at phone
             widths and was one of the things making the page not "look
             like proper mobile view" when resized down - it eats most of
             the 375-428px viewport width before any text renders. The
             !important is required because inline style attributes
             otherwise always beat a stylesheet rule of any specificity. */
          .course-content-card { padding: 20px 18px !important; }
          /* Mark Complete / Save & Exit sit side by side with nowrap text;
             at phone widths their combined width can exceed the card, which
             was pushing the page wider than the viewport. Wrapping keeps
             both buttons fully visible without any horizontal scroll. */
          .course-actions-row { flex-wrap: wrap; row-gap: 10px; }
        }
      `}</style>

      {/* Mobile course outline modal - retires the old side drawer (Sean,
          voice note 2026-08-10: "one menu", fixed rail on desktop, pop-up
          modal on mobile). Only ever opened by the mobile-only hamburger
          (.course-outline-toggle, hidden above the 960px breakpoint), so it
          never appears on desktop. Backdrop click, the close button, and
          Escape (effect above) all dismiss it. `top` and `zIndex` are both
          kept clear of the site topbar + BCPS Pulse bar (BCPSShell.tsx /
          PulseWidget.tsx, ~68px + up to ~90px tall once the mobile search
          row from globals.css is included): the top offset leaves that
          space empty, and zIndex 35 sits below the topbar's sticky zIndex
          40 (globals.css) as a second guard so a height miscalculation
          still can't paint this over the blue bar. */}
      {menuOpen && (
        <div
          role="presentation"
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed', top: 130, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.45)', zIndex: 35,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Course outline"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, width: '100%', maxWidth: 360,
              maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
              boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef0f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#0e4e73' }}>Course Outline</span>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close course outline" style={S.modalCloseBtn}>x</button>
            </div>
            <div style={{ padding: '8px 12px 6px', flexShrink: 0 }}>
              <Link href="/certification/departments/welcome" onClick={() => setMenuOpen(false)} style={{ fontSize: 12, color: '#1672A7', fontWeight: 700, textDecoration: 'none', display: 'block', padding: '6px 4px' }}>Course Overview</Link>
            </div>
            <div style={{ borderTop: '1px solid #eef0f3', overflowY: 'auto' }}>
              {renderModuleList(true)}
            </div>
          </div>
        </div>
      )}

      {/* Persistent desktop progress/nav rail + main content, per Sean
          (Hot Lab 2026-07-28): WCMs need a where-am-I indicator, not just a
          hidden drawer. Mobile now uses the hamburger + centered modal
          above instead of a slide-in side drawer (course-outline-toggle /
          course-rail CSS classes swap which one is visible at the 960px
          breakpoint; Sean, voice note 2026-08-10). Rail sits to the right
          of the content on desktop, styled as a rounded card to match the
          content card (V, 2026-08-07). */}
      <div className="course-shell">
      {/* Page content */}
      <div style={S.contentArea} className="course-main">
        {/* Breadcrumb row: module name + mobile outline trigger only. The
            status badges (saving, admin preview, page counter) now live in
            the rail next to Course Overview so they read on the same line
            as the persistent nav (V, 2026-08-07). The hamburger button
            stays here rather than moving into the rail, because .course-rail
            is display:none on mobile -- if the toggle lived inside it there
            would be no way left to open the mobile modal. The hamburger
            itself only renders at mobile widths via the .course-outline-
            toggle CSS class above (display:none by default, display:flex
            below the 960px breakpoint) - it is fully hidden on desktop. */}
        <div style={S.breadcrumbRow}>
          <div style={S.breadcrumb}>{mod.id === 'final' ? 'Final Assignments' : `Module ${mod.number}: ${mod.title}`}</div>
          <button type="button" onClick={() => setMenuOpen(true)} className="course-outline-toggle" style={S.outlineBtn} aria-label="Open course outline">
            <span style={S.hamburgerLine} />
            <span style={S.hamburgerLine} />
            <span style={S.hamburgerLine} />
          </button>
        </div>

        {/* Content column + rail: a stretch row so the rail top-aligns with
            this column and matches its height exactly, whether the module
            content is short or long (V, 2026-08-07). */}
        <div className="course-card-row">
        <div className="course-content-col">
        <h1 style={S.pageTitle}>{page.title}</h1>

        <div className="course-content-card" style={S.contentCard}>
          {isContentPage && (
            <>
              {page.content && <div className="cert-content" style={S.content} dangerouslySetInnerHTML={{ __html: page.content }} />}
              {page.composerAccessGate && accessRequestState !== 'checking' && (
                <div style={S.accessRequestBox}>
                  {accessRequestState === 'requested' ? (
                    <p style={{ margin: 0, fontSize: 14, color: '#1a1a1a' }}>
                      <strong>Request sent.</strong> Sean and Felicia have been notified that you need a Composer account
                      {accessRequestedAt ? ` (requested ${new Date(accessRequestedAt).toLocaleDateString('en-US')})` : ''}.
                      Once your account is created, come back and continue with this step.
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: 0, fontSize: 14, color: '#1a1a1a' }}>
                        Don&apos;t have a Finalsite Composer login yet? Click below to notify Sean and Felicia so they can set one up for you.
                      </p>
                      <button
                        style={{ ...S.accessRequestBtn, opacity: accessRequestState === 'requesting' ? 0.6 : 1 }}
                        onClick={requestComposerAccess}
                        disabled={accessRequestState === 'requesting'}
                      >
                        {accessRequestState === 'requesting' ? 'Sending...' : 'Request Composer Access'}
                      </button>
                      {accessRequestError && (
                        <p style={{ margin: '8px 0 0', fontSize: 13, color: '#b3261e' }}>{accessRequestError}</p>
                      )}
                    </>
                  )}
                </div>
              )}
              {page.type === 'assignment' && (
                <div style={S.assignmentBox}>
                  <label htmlFor="assignment-submission" style={{ display: 'block', margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0e4e73' }}>
                    Your submission
                  </label>
                  <textarea
                    id="assignment-submission"
                    value={submissionDraft}
                    onChange={(e) => { setSubmissionDraft(e.target.value); setSubmissionSaved(false); setSubmissionError(null) }}
                    placeholder="Type your summary here..."
                    rows={6}
                    style={S.submissionTextarea}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                    <button
                      type="button"
                      style={{ ...S.saveExitBtn, opacity: submissionSaving ? 0.6 : 1 }}
                      disabled={submissionSaving}
                      onClick={() => saveSubmission(submissionDraft)}
                    >
                      {submissionSaving ? 'Saving...' : 'Save Draft'}
                    </button>
                    {submissionSaved && !submissionSaving && <span style={{ fontSize: 12, color: '#16750C', fontWeight: 700 }}>Saved</span>}
                  </div>
                  {submissionError && (
                    <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, color: '#b3261e', fontWeight: 600 }}>{submissionError}</p>
                  )}

                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #e0e8ef' }}>
                    <label htmlFor="assignment-file" style={{ display: 'block', margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0e4e73' }}>
                      Attach a file (optional)
                    </label>
                    {submissionFiles[pageKey] ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                        <span style={{ fontSize: 13, color: '#333', background: '#fff', border: '1px solid #d0d9e3', borderRadius: 6, padding: '6px 10px' }}>
                          {submissionFiles[pageKey].name}
                        </span>
                        <button
                          type="button"
                          style={{ ...S.saveExitBtn, opacity: fileUploading ? 0.6 : 1 }}
                          disabled={fileUploading}
                          onClick={removeSubmissionFile}
                        >
                          {fileUploading ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          id="assignment-file"
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          disabled={fileUploading}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSubmissionFile(f); e.target.value = '' }}
                          style={{ fontSize: 13 }}
                        />
                        {fileUploading && <span style={{ marginLeft: 10, fontSize: 12, color: '#888' }}>Uploading...</span>}
                      </>
                    )}
                    {fileError && (
                      <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b3261e', fontWeight: 600 }}>{fileError}</p>
                    )}
                    <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#888' }}>PDF or Word, up to 15MB. Attaching a file is optional - your written summary above is still the required submission.</p>
                  </div>

                  <p style={{ margin: '14px 0 0', fontSize: 12, color: '#888' }}>Marking this assignment complete saves your submission and sends it to the Office of Communications for review.</p>
                </div>
              )}
              {isBadgeEvidencePage && (
                <div style={S.assignmentBox}>
                  <label htmlFor="assignment-file" style={{ display: 'block', margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0e4e73' }}>
                    Attach your evidence (required)
                  </label>
                  {submissionFiles[pageKey] ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
                      <span style={{ fontSize: 13, color: '#333', background: '#fff', border: '1px solid #d0d9e3', borderRadius: 6, padding: '6px 10px' }}>
                        {submissionFiles[pageKey].name}
                      </span>
                      <button
                        type="button"
                        style={{ ...S.saveExitBtn, opacity: fileUploading ? 0.6 : 1 }}
                        disabled={fileUploading}
                        onClick={removeSubmissionFile}
                      >
                        {fileUploading ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        id="assignment-file"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                        disabled={fileUploading}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadSubmissionFile(f); e.target.value = '' }}
                        style={{ fontSize: 13 }}
                      />
                      {fileUploading && <span style={{ marginLeft: 10, fontSize: 12, color: '#888' }}>Uploading...</span>}
                    </>
                  )}
                  {fileError && (
                    <p role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: '#b3261e', fontWeight: 600 }}>{fileError}</p>
                  )}
                  <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#888' }}>Screenshot (PNG/JPG) or email confirmation (PDF), up to 15MB. Required before this page can be marked complete.</p>
                </div>
              )}
              {!isCurrentComplete && (
                <>
                  {page.type !== 'assignment' && submissionError && (
                    <p role="alert" style={{ margin: '16px 0 0', fontSize: 12.5, color: '#b3261e', fontWeight: 600 }}>{submissionError}</p>
                  )}
                  <div className="course-actions-row" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 28 }}>
                    <button
                      style={{ ...S.completeBtn, opacity: (page.type === 'assignment' && submissionDraft.trim().length < 20) || (isBadgeEvidencePage && !submissionFiles[pageKey]) ? 0.5 : 1 }}
                      disabled={(page.type === 'assignment' && submissionDraft.trim().length < 20) || (isBadgeEvidencePage && !submissionFiles[pageKey])}
                      onClick={markCompleteOnly}
                    >
                      Mark Complete
                    </button>
                    <button style={S.saveExitBtn} onClick={saveAndExit}>Save &amp; Exit</button>
                    {page.type === 'assignment' && submissionDraft.trim().length < 20 && (
                      <span style={{ fontSize: 12, color: '#888' }}>Write at least a few sentences before marking this complete.</span>
                    )}
                    {isBadgeEvidencePage && !submissionFiles[pageKey] && (
                      <span style={{ fontSize: 12, color: '#888' }}>Attach your evidence above before marking this complete.</span>
                    )}
                  </div>
                </>
              )}
              {isCurrentComplete && (
                <div className="course-actions-row" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
                  <div style={S.completedNote}>+ Completed</div>
                  <button style={S.saveExitBtn} onClick={saveAndExit}>Save &amp; Exit</button>
                </div>
              )}
            </>
          )}

          {isQuizPage && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0e4e73', marginTop: 0, marginBottom: 20 }}>Knowledge Check</h2>
              {!quizSubmitted ? (
                <>
                  {page.questions?.map((q: QuizQuestion, i: number) => (
                    <div key={i} style={S.question}>
                      <p style={S.questionText}>{i + 1}. {q.question}</p>
                      {q.options.map((opt: string, j: number) => (
                        <label key={j} style={{ ...S.option, background: quizAnswers[i] === j ? '#e8f4fd' : 'transparent', borderRadius: 6, padding: '8px 10px', marginLeft: -10 }}>
                          <input type="radio" name={`q${i}`} checked={quizAnswers[i] === j}
                            onChange={() => setQuizAnswers(prev => ({ ...prev, [i]: j }))} />
                          {' '}{opt}
                        </label>
                      ))}
                    </div>
                  ))}
                  <button style={{ ...S.completeBtn, opacity: !page.questions || Object.keys(quizAnswers).length < (page.questions?.length || 0) ? 0.5 : 1 }}
                    disabled={!page.questions || Object.keys(quizAnswers).length < (page.questions?.length || 0)}
                    onClick={handleQuizSubmit}>
                    Submit Answers
                  </button>
                </>
              ) : (
                <div>
                  <div style={{ ...S.scoreBox, background: quizPassed ? '#edf7ed' : '#fff4f2', border: `2px solid ${quizPassed ? '#16750C' : '#c0392b'}` }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color: quizPassed ? '#16750C' : '#c0392b' }}>{quizScore}%</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: quizPassed ? '#16750C' : '#c0392b', marginTop: 4 }}>{quizPassed ? 'Passed' : 'Not yet - keep going'}</div>
                    <p style={{ fontSize: 13, color: '#555', margin: '8px 0 0' }}>
                      {quizPassed ? 'You scored 80% or higher. You may proceed to the next section.' : 'You need 80% or higher to pass. Review the module content and try again.'}
                    </p>
                  </div>
                  {quizPassed && next && (
                    <div style={{ marginTop: 4, marginBottom: 8 }}>
                      <Link
                        href={`/certification/departments/course/${next.moduleId}/${next.pageId}`}
                        style={{ ...S.completeBtn, display: 'inline-block', textDecoration: 'none', textAlign: 'center' as const }}
                      >
                        Continue to {getModuleById(next.moduleId)?.id === 'final' ? 'Final Assignments' : `Module ${getModuleById(next.moduleId)?.number}`} &rarr;
                      </Link>
                    </div>
                  )}
                  {!quizPassed && (
                    <button style={S.retryBtn} onClick={() => { setQuizSubmitted(false); setQuizAnswers({}); setQuizScore(0) }}>
                      Retake Quiz
                    </button>
                  )}
                  <div style={{ marginTop: 20 }}>
                    {page.questions?.map((q: QuizQuestion, i: number) => (
                      <div key={i} style={{ ...S.question, borderLeft: `3px solid ${quizAnswers[i] === q.correctIndex ? '#16750C' : '#c0392b'}`, paddingLeft: 12, marginLeft: -4 }}>
                        <p style={{ ...S.questionText, color: quizAnswers[i] === q.correctIndex ? '#16750C' : '#c0392b', marginBottom: 4 }}>
                          {quizAnswers[i] === q.correctIndex ? '+ ' : 'x '}{i + 1}. {q.question}
                        </p>
                        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>Correct answer: {q.options[q.correctIndex]}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={S.navFooter}>
          {prev ? (
            <Link href={`/certification/departments/course/${prev.moduleId}/${prev.pageId}`} style={S.navBtn}>Previous</Link>
          ) : <span />}
          {next && (isCurrentComplete || canGoNext) ? (
            <Link href={`/certification/departments/course/${next.moduleId}/${next.pageId}`} style={{ ...S.navBtn, ...S.navBtnPrimary }}>Continue</Link>
          ) : next ? (
            <span style={{ ...S.navBtn, ...S.navBtnDisabled }}>Complete this page to continue</span>
          ) : isCurrentComplete ? (
            <Link href="/certification/departments/complete" style={{ ...S.navBtn, ...S.navBtnPrimary }}>Finish Course</Link>
          ) : null}
        </div>
        </div>

        {/* Module rail, right-hand side. Stretch-aligned with course-content-col
            above, so its top edge and height always match the content column
            next to it (V, 2026-08-07). */}
        <div className="course-rail">
          <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #eef0f3' }}>
            {/* Admin Preview pill moved here, top-right of the progress
                header, so the overview/page-number row below no longer
                fights it for width and overflows (Sean, voice note
                2026-08-10). */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0e4e73', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Progress</div>
              {isAdmin && (
                <div style={{ fontSize: 10, fontWeight: 800, color: '#854F0B', background: '#fef3e2', borderRadius: 20, padding: '3px 10px', letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Admin Preview
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 28, fontWeight: 900, color: overallPct >= 100 ? '#16750C' : '#1672A7' }}>{overallPct}%</span>
              <span style={{ fontSize: 11, color: '#888' }}>{overallCompleted} of {overallTotal} pages</span>
            </div>
            <div style={{ height: 6, background: '#e5e9ee', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overallPct}%`, background: overallPct >= 100 ? '#16750C' : '#1672A7', borderRadius: 8, transition: 'width 0.3s ease' }} />
            </div>
            <div style={S.railOverviewRow}>
              <Link href="/certification/departments/welcome" style={S.railOverviewLink}>Course Overview</Link>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {saving && <span style={S.saving}>Saving...</span>}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#1672A7', borderRadius: 20, padding: '3px 10px', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
                  Page {pageIndex + 1} of {totalPages}
                </div>
              </div>
            </div>
          </div>
          <div style={{ paddingBottom: 20 }}>
            {renderModuleList(false)}
          </div>
        </div>
        </div>
      </div>
      </div>
    </>
  )
}

const S: Record<string, React.CSSProperties> = {
  loading: { padding: 40, fontFamily: "'Montserrat', sans-serif", fontSize: 15 },
  saving: { fontSize: 12, color: '#1672A7', fontStyle: 'italic' },
  outlineBtn: { background: 'none', border: '1px solid #e0e8ef', borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 },
  modalCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', lineHeight: 1, padding: '2px 6px' },
  hamburgerLine: { display: 'block', width: 18, height: 2, background: '#555', borderRadius: 2 },
  moduleAccordionBtn: { display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' as const, fontFamily: 'inherit', fontSize: 10, fontWeight: 700, color: '#777', padding: '8px 16px 3px', textTransform: 'uppercase' as const, letterSpacing: 0.4, lineHeight: 1.4 },
  moduleHeaderStatic: { fontSize: 10, fontWeight: 700, color: '#777', padding: '8px 16px 3px', textTransform: 'uppercase' as const, letterSpacing: 0.4, lineHeight: 1.4 },
  moduleChevron: { fontSize: 10, transition: 'transform 0.15s ease', flexShrink: 0 },
  contentArea: { width: '100%', boxSizing: 'border-box' as const },
  breadcrumbRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, width: '100%' },
  breadcrumb: { fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, flex: 1, minWidth: 0, overflowWrap: 'break-word' as const },
  railOverviewRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 14 },
  railOverviewLink: { fontSize: 12, color: '#1672A7', fontWeight: 700, textDecoration: 'none' as const, flexShrink: 0 },
  pageTitle: { fontSize: 24, fontWeight: 900, color: '#0e4e73', margin: '0 0 22px', lineHeight: 1.2 },
  contentCard: { background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 24 },
  content: { fontSize: 15, color: '#2a2a2a', fontWeight: 400 },
  completeBtn: { padding: '13px 30px', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  completedNote: { color: '#16750C', fontWeight: 700, fontSize: 14 },
  assignmentBox: { background: '#f8fafb', border: '1px solid #e0e8ef', borderRadius: 8, padding: '14px 18px', marginTop: 24 },
  accessRequestBox: { background: '#eef7fc', border: '1.5px solid #1672A7', borderRadius: 8, padding: '16px 18px', marginTop: 20, marginBottom: 4 },
  accessRequestBtn: { padding: '11px 20px', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 10 },
  submissionTextarea: { width: '100%', boxSizing: 'border-box' as const, fontFamily: 'inherit', fontSize: 14, color: '#222', border: '1px solid #d0d9e3', borderRadius: 8, padding: '10px 12px', resize: 'vertical' as const, lineHeight: 1.5 },
  question: { marginBottom: 24 },
  questionText: { fontSize: 15, fontWeight: 600, color: '#222', margin: '0 0 10px', lineHeight: 1.5 },
  option: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14, color: '#444', margin: '4px 0', cursor: 'pointer', lineHeight: 1.5 },
  retryBtn: { padding: '10px 22px', background: '#C55326', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 12, marginBottom: 16, fontFamily: 'inherit' },
  scoreBox: { borderRadius: 10, padding: '28px 32px', textAlign: 'center' as const, marginBottom: 20 },
  saveExitBtn: { padding: '11.5px 20px', background: '#fff', color: '#1672A7', border: '1.5px solid #1672A7', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  navFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 },
  navBtn: { padding: '11px 24px', background: '#fff', border: '1px solid #d0d9e3', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#333', textDecoration: 'none', cursor: 'pointer', fontFamily: 'inherit' },
  navBtnPrimary: { background: '#1672A7', border: 'none', color: '#fff' },
  navBtnDisabled: { background: '#f5f5f5', color: '#aaa', border: '1px solid #eee', cursor: 'default' },
}

