'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { MODULES, COURSE_ID } from '@/lib/cert-data'
import type { CoursePage } from '@/lib/cert-data'

const LOGO_URL = "https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"

const LEARN_ITEMS = [
  'Your role, responsibilities, and accountability as a Department WCM',
  'BCPS web governance policies and the Standards and Guidelines',
  'How to use the Episerver CMS to create, edit, and publish content',
  'Writing for the web: plain language, active voice, and clarity',
  'Accessibility compliance - ADA, Section 508, and WCAG 2.1 AA',
  'Image and media standards, file formatting, and proper alt text',
  'The approval workflow and proper channels for content requests',
  'Maintaining content accuracy, link hygiene, and audit readiness',
]

const GROUP_SIZE = 4

export default function WelcomePage() {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [group, setGroup] = useState(0)
  const [certUser, setCertUser] = useState<{ full_name: string | null; department: string | null; is_admin: boolean } | null>(null)
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const totalGroups = Math.ceil(MODULES.length / GROUP_SIZE)
  const visibleMods = MODULES.slice(group * GROUP_SIZE, (group + 1) * GROUP_SIZE)
  const firstPageHref = `/bcps/certification/departments/course/${MODULES[0].id}/${MODULES[0].pages[0].id}`

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/bcps/certification/login'); return }
      const [userRes, progressRes] = await Promise.all([
        supabase.from('wcm_cert_users').select('full_name,department,is_admin').eq('user_id', user.id).maybeSingle(),
        supabase.from('wcm_cert_progress').select('module_id,page_id,completed').eq('user_id', user.id).eq('course_id', COURSE_ID),
      ])
      setCertUser(userRes.data)
      const progress = progressRes.data || []
      setCompletedSet(new Set(progress.filter((p: { completed: boolean }) => p.completed).map((p: { module_id: string; page_id: string }) => `${p.module_id}::${p.page_id}`)))
      setLoading(false)
    }
    init()
  }, [])

  function isModuleUnlocked(modIndex: number): boolean {
    if (modIndex === 0) return true
    const prevMod = MODULES[modIndex - 1]
    return prevMod.pages.every((p: CoursePage) => completedSet.has(`${prevMod.id}::${p.id}`))
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Montserrat', sans-serif", background: '#f0f4f8' }}>
      <span style={{ fontSize: 14, color: '#888' }}>Loading...</span>
    </div>
  )

  const hasStarted = completedSet.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Montserrat', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {step === 0 && (
        <div style={{ padding: '32px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1672A7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>WCM Certification Program</div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0e4e73', margin: '0 0 24px', lineHeight: 1.2 }}>
            Department Website Content Manager Certification
          </h1>
          <div style={{ background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0e4e73', margin: '0 0 16px' }}>About This Certification</h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: '#444', margin: '0 0 16px', fontWeight: 400 }}>
              This program is designed for Department Website Content Managers (WCMs) who are responsible for maintaining accurate, accessible, and compliant content on the Broward County Public Schools website. Completing this certification demonstrates your proficiency with BCPS web standards and your commitment to delivering a high-quality experience for students, families, and staff.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: '#444', margin: '0 0 16px', fontWeight: 400 }}>
              You will work through 12 modules covering everything from the foundational policies and your role as a WCM, to practical skills in the Episerver CMS, accessibility compliance under ADA and WCAG 2.1 AA, and the content governance workflows that keep the district website consistent and trustworthy.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: '#444', margin: 0, fontWeight: 400 }}>
              The course is completely self-paced. Your progress is saved automatically as you work. Each module ends with a knowledge check, and you must pass with 80% or higher before advancing. Upon completing all 12 modules and the final assignments, you will receive a digital certification badge.
            </p>
          </div>
          <button onClick={() => setStep(1)} style={S.primaryBtn}>
            {hasStarted ? 'Resume Certification' : 'Begin Certification'}
          </button>
        </div>
      )}

      {step === 1 && (
        <div style={{ padding: '32px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1672A7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Step 1 of 2</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0e4e73', margin: '0 0 24px', lineHeight: 1.2 }}>What You Will Learn</h1>
          <div style={{ background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 32 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {LEARN_ITEMS.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 28, height: 28, background: '#e8f4fd', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1672A7' }}>{i + 1}</span>
                  </div>
                  <span style={{ fontSize: 14, lineHeight: 1.7, color: '#333', fontWeight: 400, paddingTop: 4 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <button onClick={() => setStep(0)} style={S.secondaryBtn}>Back</button>
            <button onClick={() => { setStep(2); setGroup(0) }} style={S.primaryBtn}>Next</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ padding: '32px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#1672A7', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Step 2 of 2</div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0e4e73', margin: '0 0 8px', lineHeight: 1.2 }}>Begin the Course</h1>
          <p style={{ fontSize: 14, color: '#666', margin: '0 0 28px', fontWeight: 400 }}>Begin the course by clicking Start below.</p>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px', boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid #eef0f3' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Modules {group * GROUP_SIZE + 1}-{Math.min((group + 1) * GROUP_SIZE, MODULES.length)} of {MODULES.length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {visibleMods.map((mod, relIdx) => {
                const absIdx = group * GROUP_SIZE + relIdx
                const unlocked = isModuleUnlocked(absIdx)
                const allDone = mod.pages.every((p: CoursePage) => completedSet.has(`${mod.id}::${p.id}`))
                return (
                  <div key={mod.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', border: `1.5px solid ${allDone ? '#c8e6c9' : unlocked ? '#d0e8f7' : '#eef0f3'}`, borderRadius: 10, opacity: unlocked ? 1 : 0.5 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: allDone ? '#16750C' : unlocked ? '#1672A7' : '#cdd5de', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {allDone ? (
                        <span style={{ color: '#fff', fontSize: 16, fontWeight: 900 }}>+</span>
                      ) : unlocked ? (
                        <span style={{ color: '#fff', fontSize: 12, fontWeight: 800 }}>{mod.id === 'final' ? 'F' : mod.number}</span>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <rect x="3" y="6" width="8" height="7" rx="1.5" fill="white" opacity="0.8"/>
                          <path d="M4.5 6V4.5C4.5 3.12 5.62 2 7 2s2.5 1.12 2.5 2.5V6" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.8"/>
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>
                        {mod.id === 'final' ? 'Final Assignments' : `Module ${mod.number}`}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{mod.title}</div>
                      <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{mod.pages.length} pages</div>
                    </div>
                    {allDone ? (
                      <span style={{ fontSize: 12, color: '#16750C', fontWeight: 700 }}>Complete</span>
                    ) : unlocked ? (
                      <a href={`/bcps/certification/departments/course/${mod.id}/${mod.pages[0].id}`}
                        style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#1672A7', padding: '8px 18px', borderRadius: 7, textDecoration: 'none' }}>
                        {completedSet.size > 0 && mod.pages.some((p: CoursePage) => completedSet.has(`${mod.id}::${p.id}`)) ? 'Continue' : 'Start'}
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: '#bbb', fontWeight: 600 }}>Locked</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <button onClick={() => group > 0 ? setGroup(g => g - 1) : setStep(1)} style={S.secondaryBtn}>Back</button>
            {group < totalGroups - 1 ? (
              <button onClick={() => setGroup(g => g + 1)} style={S.primaryBtn}>Continue</button>
            ) : (
              <a href={firstPageHref} style={{ ...S.primaryBtn, textDecoration: 'none', display: 'inline-block' }}>Start Module 1</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  primaryBtn: { padding: '13px 30px', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  secondaryBtn: { padding: '13px 24px', background: '#fff', color: '#555', border: '1.5px solid #d0d9e3', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
}
