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
  const [completedPages, setCompletedPages] = useState<Set<string>>(new Set())
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({})
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizScore, setQuizScore] = useState(0)
  const [quizPassed, setQuizPassed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)

  const mod = getModuleById(moduleId)
  const page = getPageById(moduleId, pageId)
  const next = getNextPage(moduleId, pageId)
  const prev = getPrevPage(moduleId, pageId)
  const pageKey = `${moduleId}::${pageId}`
  const pageIndex = mod ? mod.pages.findIndex((p: CoursePage) => p.id === pageId) : 0
  const totalPages = mod ? mod.pages.length : 0

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/bcps/certification/login'); return }
      setUserId(user.id)
      await supabase.from('wcm_cert_users').upsert(
        { user_id: user.id, email: user.email!, full_name: user.user_metadata?.full_name || null, is_admin: false },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
      const { data } = await supabase.from('wcm_cert_progress')
        .select('module_id,page_id,completed')
        .eq('user_id', user.id)
        .eq('course_id', COURSE_ID)
      if (data) {
        setCompletedPages(new Set(data.filter((r: { completed: boolean }) => r.completed).map((r: { module_id: string; page_id: string }) => `${r.module_id}::${r.page_id}`)))
      }
      setLoading(false)
    }
    init()
  }, [moduleId, pageId])

  useEffect(() => {
    if (!userId || loading) return
    fetch('/api/cert/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
    }).catch(console.error)
  }, [userId, moduleId, pageId, loading])

  useEffect(() => {
    if (!userId) return
    autoSaveRef.current = setInterval(async () => {
      setSaving(true)
      await fetch('/api/cert/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
      })
      setTimeout(() => setSaving(false), 1200)
    }, 5 * 60 * 1000)
    return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current) }
  }, [userId, moduleId, pageId])

  const saveAndExit = useCallback(async () => {
    if (!userId) return
    await fetch('/api/cert/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId }),
    }).catch(console.error)
    router.push('/bcps')
  }, [userId, moduleId, pageId])

  const markComplete = useCallback(async () => {
    if (!userId) return
    if (!completedPages.has(pageKey)) {
      const res = await fetch('/api/cert/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, completed: true }),
      })
      if (!res.ok) { console.error('Failed to save progress') }
      else {
        const newCompleted = new Set(Array.from(completedPages).concat(pageKey))
        setCompletedPages(newCompleted)
        const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
        if (allKeys.every((k: string) => newCompleted.has(k))) {
          await fetch('/api/cert/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
          }).catch(console.error)
          router.push('/bcps/certification/departments/complete')
          return
        }
      }
    }
    if (next) {
      router.push(`/bcps/certification/departments/course/${next.moduleId}/${next.pageId}`)
    } else {
      router.push('/bcps/certification/departments/complete')
    }
  }, [userId, completedPages, pageKey, moduleId, pageId, next])

  // Marks page complete without navigating - activates the footer Continue button
  const markCompleteOnly = useCallback(async () => {
    if (!userId || completedPages.has(pageKey)) return
    const res = await fetch('/api/cert/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, course_id: COURSE_ID, module_id: moduleId, page_id: pageId, completed: true }),
    })
    if (!res.ok) { console.error('Failed to save progress'); return }
    const newCompleted = new Set(Array.from(completedPages).concat(pageKey))
    setCompletedPages(newCompleted)
    const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
    if (allKeys.every((k: string) => newCompleted.has(k))) {
      await fetch('/api/cert/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
      }).catch(console.error)
      router.push('/bcps/certification/departments/complete')
    }
  }, [userId, completedPages, pageKey, moduleId, pageId])

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
      // Mark ALL pages in this module complete so the next module unlocks.
      // Users who skipped "Mark Complete" on content pages still advance cleanly.
      const incompletePages = mod.pages.filter(
        (p: CoursePage) => !completedPages.has(`${moduleId}::${p.id}`)
      )
      if (incompletePages.length > 0) {
        await Promise.all(
          incompletePages.map((p: CoursePage) =>
            fetch('/api/cert/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: userId, course_id: COURSE_ID,
                module_id: moduleId, page_id: p.id, completed: true,
              }),
            })
          )
        )
        const allModuleKeys = mod.pages.map((p: CoursePage) => `${moduleId}::${p.id}`)
        const newCompleted = new Set([...Array.from(completedPages), ...allModuleKeys])
        setCompletedPages(newCompleted)
        // Check full course completion
        const allKeys = MODULES.flatMap((m: CourseModule) => m.pages.map((p: CoursePage) => `${m.id}::${p.id}`))
        if (allKeys.every((k: string) => newCompleted.has(k))) {
          await fetch('/api/cert/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, course_id: COURSE_ID }),
          }).catch(console.error)
          router.push('/bcps/certification/departments/complete')
          return
        }
      }
      // Navigate to next page / module
      if (next) {
        router.push(`/bcps/certification/departments/course/${next.moduleId}/${next.pageId}`)
      } else {
        router.push('/bcps/certification/departments/complete')
      }
    }
  }

  function canNavigateTo(targetModuleId: string, targetPageId: string) {
    const key = `${targetModuleId}::${targetPageId}`
    if (completedPages.has(key)) return true
    const targetPrev = getPrevPage(targetModuleId, targetPageId)
    if (!targetPrev) return true
    return completedPages.has(`${targetPrev.moduleId}::${targetPrev.pageId}`)
  }

  function isModuleUnlocked(modIndex: number): boolean {
    if (modIndex === 0) return true
    const prevMod = MODULES[modIndex - 1]
    return prevMod.pages.every((p: CoursePage) => completedPages.has(`${prevMod.id}::${p.id}`))
  }

  if (loading) return <div style={S.loading}>Loading...</div>
  if (!mod || !page) return <div style={S.loading}>Page not found. <Link href="/bcps/certification/departments/welcome">Return to overview.</Link></div>

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
      `}</style>

      {/* Course outline drawer overlay */}
      {menuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Course outline drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 300,
        background: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        zIndex: 50, transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s ease', overflowY: 'auto', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #eef0f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0e4e73' }}>Course Outline</span>
          <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#888', lineHeight: 1, padding: '2px 6px' }}>x</button>
        </div>
        <div style={{ padding: '8px 12px 6px' }}>
          <Link href="/bcps/certification/departments/welcome" onClick={() => setMenuOpen(false)} style={{ fontSize: 12, color: '#1672A7', fontWeight: 700, textDecoration: 'none', display: 'block', padding: '6px 4px' }}>Course Overview</Link>
        </div>
        <div style={{ borderTop: '1px solid #eef0f3', flex: 1, overflowY: 'auto' }}>
          {MODULES.map((m: CourseModule, idx: number) => {
            const modAllDone = m.pages.every((p: CoursePage) => completedPages.has(`${m.id}::${p.id}`))
            const modActive = m.id === moduleId
            const unlocked = isModuleUnlocked(idx)
            return (
              <div key={m.id} style={{ borderLeft: `3px solid ${modActive ? '#1672A7' : modAllDone ? '#16750C' : 'transparent'}`, opacity: unlocked ? 1 : 0.45 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#777', padding: '8px 16px 3px', textTransform: 'uppercase', letterSpacing: 0.4, lineHeight: 1.4 }}>
                  {!unlocked && <span style={{ marginRight: 4 }}>LOCKED -</span>}
                  {m.id === 'final' ? 'FINAL' : `MOD ${m.number}`} - {m.title}
                  {modAllDone && <span style={{ marginLeft: 4, color: '#16750C' }}>+</span>}
                </div>
                {(modActive || modAllDone) && unlocked && m.pages.map((p: CoursePage) => {
                  const pk = `${m.id}::${p.id}`
                  const isActive = m.id === moduleId && p.id === pageId
                  const isDone = completedPages.has(pk)
                  const accessible = canNavigateTo(m.id, p.id)
                  return accessible ? (
                    <Link key={p.id} href={`/bcps/certification/departments/course/${m.id}/${p.id}`}
                      onClick={() => setMenuOpen(false)}
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
        </div>
      </div>

      {/* Page content */}
      <div style={S.contentArea}>
        {/* Breadcrumb row with module info + page counter + outline trigger */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 12 }}>
          <div style={S.breadcrumb}>{mod.id === 'final' ? 'Final Assignments' : `Module ${mod.number}: ${mod.title}`}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {saving && <span style={S.saving}>Saving...</span>}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#1672A7', borderRadius: 20, padding: '3px 10px', letterSpacing: 0.3, whiteSpace: 'nowrap' }}>
              Page {pageIndex + 1} of {totalPages}
            </div>
            <button onClick={() => setMenuOpen(true)} style={S.outlineBtn} aria-label="Open course outline">
              <span style={S.hamburgerLine} />
              <span style={S.hamburgerLine} />
              <span style={S.hamburgerLine} />
            </button>
          </div>
        </div>

        <h1 style={S.pageTitle}>{page.title}</h1>

        <div style={S.contentCard}>
          {isContentPage && (
            <>
              {page.content && <div className="cert-content" style={S.content} dangerouslySetInnerHTML={{ __html: page.content }} />}
              {page.type === 'assignment' && (
                <div style={S.assignmentBox}>
                  <p style={{ margin: 0, fontSize: 13, color: '#666' }}>When you have completed this assignment, mark it complete to continue.</p>
                </div>
              )}
              {!isCurrentComplete && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 28 }}>
                  <button style={S.completeBtn} onClick={markCompleteOnly}>Mark Complete</button>
                  <button style={S.saveExitBtn} onClick={saveAndExit}>Save &amp; Exit</button>
                </div>
              )}
              {isCurrentComplete && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
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
                        href={`/bcps/certification/departments/course/${next.moduleId}/${next.pageId}`}
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
            <Link href={`/bcps/certification/departments/course/${prev.moduleId}/${prev.pageId}`} style={S.navBtn}>Previous</Link>
          ) : <span />}
          {next && (isCurrentComplete || canGoNext) ? (
            <Link href={`/bcps/certification/departments/course/${next.moduleId}/${next.pageId}`} style={{ ...S.navBtn, ...S.navBtnPrimary }}>Continue</Link>
          ) : next ? (
            <span style={{ ...S.navBtn, ...S.navBtnDisabled }}>Complete this page to continue</span>
          ) : isCurrentComplete ? (
            <Link href="/bcps/certification/departments/complete" style={{ ...S.navBtn, ...S.navBtnPrimary }}>Finish Course</Link>
          ) : null}
        </div>
      </div>
    </>
  )
}

const S: Record<string, React.CSSProperties> = {
  loading: { padding: 40, fontFamily: "'Montserrat', sans-serif", fontSize: 15 },
  saving: { fontSize: 12, color: '#1672A7', fontStyle: 'italic' },
  outlineBtn: { background: 'none', border: '1px solid #e0e8ef', borderRadius: 8, cursor: 'pointer', padding: '7px 9px', display: 'flex', flexDirection: 'column', gap: 4 },
  hamburgerLine: { display: 'block', width: 18, height: 2, background: '#555', borderRadius: 2 },
  contentArea: { padding: '28px 24px 48px', maxWidth: 820, width: '100%', margin: '0 auto', boxSizing: 'border-box' as const },
  breadcrumb: { fontSize: 12, color: '#999', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  pageTitle: { fontSize: 24, fontWeight: 900, color: '#0e4e73', margin: '0 0 22px', lineHeight: 1.2 },
  contentCard: { background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 24 },
  content: { fontSize: 15, color: '#2a2a2a', fontWeight: 400 },
  completeBtn: { padding: '13px 30px', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' as const },
  completedNote: { color: '#16750C', fontWeight: 700, fontSize: 14 },
  assignmentBox: { background: '#f8fafb', border: '1px solid #e0e8ef', borderRadius: 8, padding: '14px 18px', marginTop: 24 },
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
