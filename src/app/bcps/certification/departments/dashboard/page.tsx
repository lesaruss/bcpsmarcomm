'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { MODULES, COURSE_ID } from '@/lib/cert-data'
import type { CoursePage } from '@/lib/cert-data'

const LOGO_URL = "https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()
  const [certUser, setCertUser] = useState<{ full_name: string | null; department: string | null; email: string | null; is_admin: boolean } | null>(null)
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/bcps/certification/login'); return }
      const [userRes, progressRes] = await Promise.all([
        supabase.from('wcm_cert_users').select('full_name,department,is_admin').eq('user_id', user.id).maybeSingle(),
        supabase.from('wcm_cert_progress').select('module_id,page_id,completed').eq('user_id', user.id).eq('course_id', COURSE_ID),
      ])
      setCertUser({ full_name: userRes.data?.full_name ?? null, department: userRes.data?.department ?? null, is_admin: userRes.data?.is_admin ?? false, email: user.email ?? null })
      const progress = progressRes.data || []
      setCompletedSet(new Set(progress.filter((p: { completed: boolean }) => p.completed).map((p: { module_id: string; page_id: string }) => `${p.module_id}::${p.page_id}`)))
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", background: '#f0f4f8' }}>
      <span style={{ fontSize: 14, color: '#888' }}>Loading...</span>
    </div>
  )

  const totalPages = MODULES.reduce((sum, m) => sum + m.pages.length, 0)
  const completedCount = completedSet.size
  const pct = Math.round((completedCount / totalPages) * 100)

  function getResumeHref(): string {
    for (const mod of MODULES) {
      for (const page of mod.pages) {
        if (!completedSet.has(`${mod.id}::${page.id}`)) {
          return `/bcps/certification/departments/course/${mod.id}/${page.id}`
        }
      }
    }
    return '/bcps/certification/departments/complete'
  }

  function isModuleUnlocked(modIndex: number): boolean {
    if (modIndex === 0) return true
    const prevMod = MODULES[modIndex - 1]
    return prevMod.pages.every((p: CoursePage) => completedSet.has(`${prevMod.id}::${p.id}`))
  }

  const allDone = completedCount === totalPages

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", background: '#f0f4f8', minHeight: 'calc(100vh - 60px)' }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {certUser?.is_admin && (
        <div style={{ padding: '8px 32px', background: '#fffbe6', borderBottom: '1px solid #ffe58f', fontSize: 12, fontWeight: 700 }}>
          <a href="/bcps/certification/departments/admin" style={{ color: '#1672A7', textDecoration: 'none' }}>Admin View</a>
        </div>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        {/* User info card */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1672A7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>WCM Certification - Department</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0e4e73', marginBottom: 4 }}>{certUser?.full_name || 'Welcome'}</div>
            {certUser?.department && <div style={{ fontSize: 13, color: '#666', fontWeight: 500 }}>{certUser.department}</div>}
            {certUser?.email && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{certUser.email}</div>}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: allDone ? '#16750C' : '#1672A7', lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 11, color: '#999', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>Complete</div>
            <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>{completedCount} of {totalPages} pages</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 32px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Overall Progress</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#1672A7' }}>{pct}%</span>
          </div>
          <div style={{ height: 10, background: '#eef0f3', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: allDone ? '#16750C' : '#1672A7', borderRadius: 10, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* Resume CTA */}
        {!allDone ? (
          <div style={{ marginBottom: 28 }}>
            <a href={getResumeHref()} style={{ display: 'inline-block', padding: '13px 30px', background: '#1672A7', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              {completedCount === 0 ? 'Begin Certification' : 'Resume Where You Left Off'}
            </a>
          </div>
        ) : (
          <div style={{ marginBottom: 28 }}>
            <a href="/bcps/certification/departments/complete" style={{ display: 'inline-block', padding: '13px 30px', background: '#16750C', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
              View Your Certificate
            </a>
          </div>
        )}

        {/* Module list */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '24px 32px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0e4e73', marginBottom: 18 }}>Course Modules</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MODULES.map((mod, idx) => {
              const allModDone = mod.pages.every((p: CoursePage) => completedSet.has(`${mod.id}::${p.id}`))
              const someModDone = mod.pages.some((p: CoursePage) => completedSet.has(`${mod.id}::${p.id}`))
              const unlocked = isModuleUnlocked(idx)
              const modPct = Math.round((mod.pages.filter((p: CoursePage) => completedSet.has(`${mod.id}::${p.id}`)).length / mod.pages.length) * 100)
              return (
                <div key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', border: `1.5px solid ${allModDone ? '#c8e6c9' : someModDone ? '#d0e8f7' : '#eef0f3'}`, borderRadius: 10, opacity: unlocked ? 1 : 0.45 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: allModDone ? '#16750C' : unlocked ? '#1672A7' : '#cdd5de', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {allModDone ? (
                      <span style={{ color: '#fff', fontSize: 15, fontWeight: 900 }}>+</span>
                    ) : (
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>{mod.id === 'final' ? 'F' : mod.number}</span>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                      {mod.id === 'final' ? 'Final Assignments' : `Module ${mod.number}`}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>{mod.title}</div>
                    {someModDone && !allModDone && (
                      <div style={{ height: 3, background: '#eef0f3', borderRadius: 3, marginTop: 5, width: 120 }}>
                        <div style={{ height: '100%', width: `${modPct}%`, background: '#1672A7', borderRadius: 3 }} />
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {allModDone ? (
                      <span style={{ fontSize: 12, color: '#16750C', fontWeight: 700 }}>Complete</span>
                    ) : someModDone ? (
                      <span style={{ fontSize: 12, color: '#1672A7', fontWeight: 700 }}>{modPct}%</span>
                    ) : unlocked ? (
                      <a href={`/bcps/certification/departments/course/${mod.id}/${mod.pages[0].id}`}
                        style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#1672A7', padding: '6px 14px', borderRadius: 6, textDecoration: 'none' }}>
                        Start
                      </a>
                    ) : (
                      <span style={{ fontSize: 11, color: '#bbb', fontWeight: 600 }}>Locked</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
