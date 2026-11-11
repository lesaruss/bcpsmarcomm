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
  const firstPageHref = `/certification/departments/course/${MODULES[0].id}/${MODULES[0].pages[0].id}`

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Open Sans', sans-serif", background: '#f0f4f8' }}>
      <span style={{ fontSize: 14, color: '#888' }}>Loading...</span>
    </div>
  )

  const hasStarted = completedSet.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Open Sans', sans-serif" }}>
      <style>{`/* Google Fonts, self-hosted (site health 2026-11-11) */@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2) format('woff2');unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2) format('woff2');unicode-range:U+1F00-1FFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2) format('woff2');unicode-range:U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2) format('woff2');unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2) format('woff2');unicode-range:U+0302-0303,U+0305,U+0307-0308,U+0310,U+0312,U+0315,U+031A,U+0326-0327,U+032C,U+032F-0330,U+0332-0333,U+0338,U+033A,U+0346,U+034D,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+03D1,U+03D5-03D6,U+03F0-03F1,U+03F4-03F5,U+2016-2017,U+2034-2038,U+203C,U+2040,U+2043,U+2047,U+2050,U+2057,U+205F,U+2070-2071,U+2074-209F,U+20D0-20DC,U+20E1,U+20E5-20EF,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+2190,U+2192,U+2194-21AE,U+21B0-21E5,U+21F1-21F2,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+2310,U+2319,U+231C-2321,U+2336-237A,U+237C,U+2395,U+239B-23B7,U+23D0,U+23DC-23E1,U+2474-2475,U+25AF,U+25B3,U+25B7,U+25BD,U+25C1,U+25CA,U+25CC,U+25FB,U+266D-266F,U+27C0-27FF,U+2900-2AFF,U+2B0E-2B11,U+2B30-2B4C,U+2BFE,U+3030,U+FF5B,U+FF5D,U+1D400-1D7FF,U+1EE00-1EEFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2) format('woff2');unicode-range:U+0001-000C,U+000E-001F,U+007F-009F,U+20DD-20E0,U+20E2-20E4,U+2150-218F,U+2190,U+2192,U+2194-2199,U+21AF,U+21E6-21F0,U+21F3,U+2218-2219,U+2299,U+22C4-22C6,U+2300-243F,U+2440-244A,U+2460-24FF,U+25A0-27BF,U+2800-28FF,U+2921-2922,U+2981,U+29BF,U+29EB,U+2B00-2BFF,U+4DC0-4DFF,U+FFF9-FFFB,U+10140-1018E,U+10190-1019C,U+101A0,U+101D0-101FD,U+102E0-102FB,U+10E60-10E7E,U+1D2C0-1D2D3,U+1D2E0-1D37F,U+1F000-1F0FF,U+1F100-1F1AE,U+1F1E6-1F1FF,U+1F30D-1F30F,U+1F315,U+1F31C,U+1F31E,U+1F320-1F32C,U+1F336,U+1F378,U+1F37D,U+1F382,U+1F393-1F39F,U+1F3A7-1F3A8,U+1F3AC-1F3AF,U+1F3C2,U+1F3C4-1F3C6,U+1F3CA-1F3CE,U+1F3D4-1F3E0,U+1F3ED,U+1F3F1-1F3F3,U+1F3F5-1F3F7,U+1F408,U+1F415,U+1F41F,U+1F426,U+1F43F,U+1F441-1F442,U+1F444,U+1F446-1F449,U+1F44C-1F44E,U+1F453,U+1F46A,U+1F47D,U+1F4A3,U+1F4B0,U+1F4B3,U+1F4B9,U+1F4BB,U+1F4BF,U+1F4C8-1F4CB,U+1F4D6,U+1F4DA,U+1F4DF,U+1F4E3-1F4E6,U+1F4EA-1F4ED,U+1F4F7,U+1F4F9-1F4FB,U+1F4FD-1F4FE,U+1F503,U+1F507-1F50B,U+1F50D,U+1F512-1F513,U+1F53E-1F54A,U+1F54F-1F5FA,U+1F610,U+1F650-1F67F,U+1F687,U+1F68D,U+1F691,U+1F694,U+1F698,U+1F6AD,U+1F6B2,U+1F6B9-1F6BA,U+1F6BC,U+1F6C6-1F6CF,U+1F6D3-1F6D7,U+1F6E0-1F6EA,U+1F6F0-1F6F3,U+1F6F7-1F6FC,U+1F700-1F80B,U+1F810-1F847,U+1F850-1F859,U+1F860-1F887,U+1F890-1F8AD,U+1F8B0-1F8BB,U+1F8C0-1F8C1,U+1F8D0-1F8D8,U+1F900-1F90B,U+1F93B,U+1F946,U+1F984,U+1F996,U+1F9E9,U+1FA00-1FA6F,U+1FA70-1FA7C,U+1FA80-1FAC6,U+1FAC8,U+1FACC-1FADD,U+1FADF-1FAEB,U+1FAEF-1FAFA,U+1FB00-1FBFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2) format('woff2');unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:400;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2) format('woff2');unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2) format('woff2');unicode-range:U+1F00-1FFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2) format('woff2');unicode-range:U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2) format('woff2');unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2) format('woff2');unicode-range:U+0302-0303,U+0305,U+0307-0308,U+0310,U+0312,U+0315,U+031A,U+0326-0327,U+032C,U+032F-0330,U+0332-0333,U+0338,U+033A,U+0346,U+034D,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+03D1,U+03D5-03D6,U+03F0-03F1,U+03F4-03F5,U+2016-2017,U+2034-2038,U+203C,U+2040,U+2043,U+2047,U+2050,U+2057,U+205F,U+2070-2071,U+2074-209F,U+20D0-20DC,U+20E1,U+20E5-20EF,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+2190,U+2192,U+2194-21AE,U+21B0-21E5,U+21F1-21F2,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+2310,U+2319,U+231C-2321,U+2336-237A,U+237C,U+2395,U+239B-23B7,U+23D0,U+23DC-23E1,U+2474-2475,U+25AF,U+25B3,U+25B7,U+25BD,U+25C1,U+25CA,U+25CC,U+25FB,U+266D-266F,U+27C0-27FF,U+2900-2AFF,U+2B0E-2B11,U+2B30-2B4C,U+2BFE,U+3030,U+FF5B,U+FF5D,U+1D400-1D7FF,U+1EE00-1EEFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2) format('woff2');unicode-range:U+0001-000C,U+000E-001F,U+007F-009F,U+20DD-20E0,U+20E2-20E4,U+2150-218F,U+2190,U+2192,U+2194-2199,U+21AF,U+21E6-21F0,U+21F3,U+2218-2219,U+2299,U+22C4-22C6,U+2300-243F,U+2440-244A,U+2460-24FF,U+25A0-27BF,U+2800-28FF,U+2921-2922,U+2981,U+29BF,U+29EB,U+2B00-2BFF,U+4DC0-4DFF,U+FFF9-FFFB,U+10140-1018E,U+10190-1019C,U+101A0,U+101D0-101FD,U+102E0-102FB,U+10E60-10E7E,U+1D2C0-1D2D3,U+1D2E0-1D37F,U+1F000-1F0FF,U+1F100-1F1AE,U+1F1E6-1F1FF,U+1F30D-1F30F,U+1F315,U+1F31C,U+1F31E,U+1F320-1F32C,U+1F336,U+1F378,U+1F37D,U+1F382,U+1F393-1F39F,U+1F3A7-1F3A8,U+1F3AC-1F3AF,U+1F3C2,U+1F3C4-1F3C6,U+1F3CA-1F3CE,U+1F3D4-1F3E0,U+1F3ED,U+1F3F1-1F3F3,U+1F3F5-1F3F7,U+1F408,U+1F415,U+1F41F,U+1F426,U+1F43F,U+1F441-1F442,U+1F444,U+1F446-1F449,U+1F44C-1F44E,U+1F453,U+1F46A,U+1F47D,U+1F4A3,U+1F4B0,U+1F4B3,U+1F4B9,U+1F4BB,U+1F4BF,U+1F4C8-1F4CB,U+1F4D6,U+1F4DA,U+1F4DF,U+1F4E3-1F4E6,U+1F4EA-1F4ED,U+1F4F7,U+1F4F9-1F4FB,U+1F4FD-1F4FE,U+1F503,U+1F507-1F50B,U+1F50D,U+1F512-1F513,U+1F53E-1F54A,U+1F54F-1F5FA,U+1F610,U+1F650-1F67F,U+1F687,U+1F68D,U+1F691,U+1F694,U+1F698,U+1F6AD,U+1F6B2,U+1F6B9-1F6BA,U+1F6BC,U+1F6C6-1F6CF,U+1F6D3-1F6D7,U+1F6E0-1F6EA,U+1F6F0-1F6F3,U+1F6F7-1F6FC,U+1F700-1F80B,U+1F810-1F847,U+1F850-1F859,U+1F860-1F887,U+1F890-1F8AD,U+1F8B0-1F8BB,U+1F8C0-1F8C1,U+1F8D0-1F8D8,U+1F900-1F90B,U+1F93B,U+1F946,U+1F984,U+1F996,U+1F9E9,U+1FA00-1FA6F,U+1FA70-1FA7C,U+1FA80-1FAC6,U+1FAC8,U+1FACC-1FADD,U+1FADF-1FAEB,U+1FAEF-1FAFA,U+1FB00-1FBFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2) format('woff2');unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:500;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2) format('woff2');unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2) format('woff2');unicode-range:U+1F00-1FFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2) format('woff2');unicode-range:U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2) format('woff2');unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2) format('woff2');unicode-range:U+0302-0303,U+0305,U+0307-0308,U+0310,U+0312,U+0315,U+031A,U+0326-0327,U+032C,U+032F-0330,U+0332-0333,U+0338,U+033A,U+0346,U+034D,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+03D1,U+03D5-03D6,U+03F0-03F1,U+03F4-03F5,U+2016-2017,U+2034-2038,U+203C,U+2040,U+2043,U+2047,U+2050,U+2057,U+205F,U+2070-2071,U+2074-209F,U+20D0-20DC,U+20E1,U+20E5-20EF,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+2190,U+2192,U+2194-21AE,U+21B0-21E5,U+21F1-21F2,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+2310,U+2319,U+231C-2321,U+2336-237A,U+237C,U+2395,U+239B-23B7,U+23D0,U+23DC-23E1,U+2474-2475,U+25AF,U+25B3,U+25B7,U+25BD,U+25C1,U+25CA,U+25CC,U+25FB,U+266D-266F,U+27C0-27FF,U+2900-2AFF,U+2B0E-2B11,U+2B30-2B4C,U+2BFE,U+3030,U+FF5B,U+FF5D,U+1D400-1D7FF,U+1EE00-1EEFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2) format('woff2');unicode-range:U+0001-000C,U+000E-001F,U+007F-009F,U+20DD-20E0,U+20E2-20E4,U+2150-218F,U+2190,U+2192,U+2194-2199,U+21AF,U+21E6-21F0,U+21F3,U+2218-2219,U+2299,U+22C4-22C6,U+2300-243F,U+2440-244A,U+2460-24FF,U+25A0-27BF,U+2800-28FF,U+2921-2922,U+2981,U+29BF,U+29EB,U+2B00-2BFF,U+4DC0-4DFF,U+FFF9-FFFB,U+10140-1018E,U+10190-1019C,U+101A0,U+101D0-101FD,U+102E0-102FB,U+10E60-10E7E,U+1D2C0-1D2D3,U+1D2E0-1D37F,U+1F000-1F0FF,U+1F100-1F1AE,U+1F1E6-1F1FF,U+1F30D-1F30F,U+1F315,U+1F31C,U+1F31E,U+1F320-1F32C,U+1F336,U+1F378,U+1F37D,U+1F382,U+1F393-1F39F,U+1F3A7-1F3A8,U+1F3AC-1F3AF,U+1F3C2,U+1F3C4-1F3C6,U+1F3CA-1F3CE,U+1F3D4-1F3E0,U+1F3ED,U+1F3F1-1F3F3,U+1F3F5-1F3F7,U+1F408,U+1F415,U+1F41F,U+1F426,U+1F43F,U+1F441-1F442,U+1F444,U+1F446-1F449,U+1F44C-1F44E,U+1F453,U+1F46A,U+1F47D,U+1F4A3,U+1F4B0,U+1F4B3,U+1F4B9,U+1F4BB,U+1F4BF,U+1F4C8-1F4CB,U+1F4D6,U+1F4DA,U+1F4DF,U+1F4E3-1F4E6,U+1F4EA-1F4ED,U+1F4F7,U+1F4F9-1F4FB,U+1F4FD-1F4FE,U+1F503,U+1F507-1F50B,U+1F50D,U+1F512-1F513,U+1F53E-1F54A,U+1F54F-1F5FA,U+1F610,U+1F650-1F67F,U+1F687,U+1F68D,U+1F691,U+1F694,U+1F698,U+1F6AD,U+1F6B2,U+1F6B9-1F6BA,U+1F6BC,U+1F6C6-1F6CF,U+1F6D3-1F6D7,U+1F6E0-1F6EA,U+1F6F0-1F6F3,U+1F6F7-1F6FC,U+1F700-1F80B,U+1F810-1F847,U+1F850-1F859,U+1F860-1F887,U+1F890-1F8AD,U+1F8B0-1F8BB,U+1F8C0-1F8C1,U+1F8D0-1F8D8,U+1F900-1F90B,U+1F93B,U+1F946,U+1F984,U+1F996,U+1F9E9,U+1FA00-1FA6F,U+1FA70-1FA7C,U+1FA80-1FAC6,U+1FAC8,U+1FACC-1FADD,U+1FADF-1FAEB,U+1FAEF-1FAFA,U+1FB00-1FBFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2) format('woff2');unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:600;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2) format('woff2');unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2) format('woff2');unicode-range:U+1F00-1FFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2) format('woff2');unicode-range:U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2) format('woff2');unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2) format('woff2');unicode-range:U+0302-0303,U+0305,U+0307-0308,U+0310,U+0312,U+0315,U+031A,U+0326-0327,U+032C,U+032F-0330,U+0332-0333,U+0338,U+033A,U+0346,U+034D,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+03D1,U+03D5-03D6,U+03F0-03F1,U+03F4-03F5,U+2016-2017,U+2034-2038,U+203C,U+2040,U+2043,U+2047,U+2050,U+2057,U+205F,U+2070-2071,U+2074-209F,U+20D0-20DC,U+20E1,U+20E5-20EF,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+2190,U+2192,U+2194-21AE,U+21B0-21E5,U+21F1-21F2,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+2310,U+2319,U+231C-2321,U+2336-237A,U+237C,U+2395,U+239B-23B7,U+23D0,U+23DC-23E1,U+2474-2475,U+25AF,U+25B3,U+25B7,U+25BD,U+25C1,U+25CA,U+25CC,U+25FB,U+266D-266F,U+27C0-27FF,U+2900-2AFF,U+2B0E-2B11,U+2B30-2B4C,U+2BFE,U+3030,U+FF5B,U+FF5D,U+1D400-1D7FF,U+1EE00-1EEFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2) format('woff2');unicode-range:U+0001-000C,U+000E-001F,U+007F-009F,U+20DD-20E0,U+20E2-20E4,U+2150-218F,U+2190,U+2192,U+2194-2199,U+21AF,U+21E6-21F0,U+21F3,U+2218-2219,U+2299,U+22C4-22C6,U+2300-243F,U+2440-244A,U+2460-24FF,U+25A0-27BF,U+2800-28FF,U+2921-2922,U+2981,U+29BF,U+29EB,U+2B00-2BFF,U+4DC0-4DFF,U+FFF9-FFFB,U+10140-1018E,U+10190-1019C,U+101A0,U+101D0-101FD,U+102E0-102FB,U+10E60-10E7E,U+1D2C0-1D2D3,U+1D2E0-1D37F,U+1F000-1F0FF,U+1F100-1F1AE,U+1F1E6-1F1FF,U+1F30D-1F30F,U+1F315,U+1F31C,U+1F31E,U+1F320-1F32C,U+1F336,U+1F378,U+1F37D,U+1F382,U+1F393-1F39F,U+1F3A7-1F3A8,U+1F3AC-1F3AF,U+1F3C2,U+1F3C4-1F3C6,U+1F3CA-1F3CE,U+1F3D4-1F3E0,U+1F3ED,U+1F3F1-1F3F3,U+1F3F5-1F3F7,U+1F408,U+1F415,U+1F41F,U+1F426,U+1F43F,U+1F441-1F442,U+1F444,U+1F446-1F449,U+1F44C-1F44E,U+1F453,U+1F46A,U+1F47D,U+1F4A3,U+1F4B0,U+1F4B3,U+1F4B9,U+1F4BB,U+1F4BF,U+1F4C8-1F4CB,U+1F4D6,U+1F4DA,U+1F4DF,U+1F4E3-1F4E6,U+1F4EA-1F4ED,U+1F4F7,U+1F4F9-1F4FB,U+1F4FD-1F4FE,U+1F503,U+1F507-1F50B,U+1F50D,U+1F512-1F513,U+1F53E-1F54A,U+1F54F-1F5FA,U+1F610,U+1F650-1F67F,U+1F687,U+1F68D,U+1F691,U+1F694,U+1F698,U+1F6AD,U+1F6B2,U+1F6B9-1F6BA,U+1F6BC,U+1F6C6-1F6CF,U+1F6D3-1F6D7,U+1F6E0-1F6EA,U+1F6F0-1F6F3,U+1F6F7-1F6FC,U+1F700-1F80B,U+1F810-1F847,U+1F850-1F859,U+1F860-1F887,U+1F890-1F8AD,U+1F8B0-1F8BB,U+1F8C0-1F8C1,U+1F8D0-1F8D8,U+1F900-1F90B,U+1F93B,U+1F946,U+1F984,U+1F996,U+1F9E9,U+1FA00-1FA6F,U+1FA70-1FA7C,U+1FA80-1FAC6,U+1FAC8,U+1FACC-1FADD,U+1FADF-1FAEB,U+1FAEF-1FAFA,U+1FB00-1FBFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2) format('woff2');unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:700;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2) format('woff2');unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2) format('woff2');unicode-range:U+1F00-1FFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2) format('woff2');unicode-range:U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2) format('woff2');unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2) format('woff2');unicode-range:U+0302-0303,U+0305,U+0307-0308,U+0310,U+0312,U+0315,U+031A,U+0326-0327,U+032C,U+032F-0330,U+0332-0333,U+0338,U+033A,U+0346,U+034D,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+03D1,U+03D5-03D6,U+03F0-03F1,U+03F4-03F5,U+2016-2017,U+2034-2038,U+203C,U+2040,U+2043,U+2047,U+2050,U+2057,U+205F,U+2070-2071,U+2074-209F,U+20D0-20DC,U+20E1,U+20E5-20EF,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+2190,U+2192,U+2194-21AE,U+21B0-21E5,U+21F1-21F2,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+2310,U+2319,U+231C-2321,U+2336-237A,U+237C,U+2395,U+239B-23B7,U+23D0,U+23DC-23E1,U+2474-2475,U+25AF,U+25B3,U+25B7,U+25BD,U+25C1,U+25CA,U+25CC,U+25FB,U+266D-266F,U+27C0-27FF,U+2900-2AFF,U+2B0E-2B11,U+2B30-2B4C,U+2BFE,U+3030,U+FF5B,U+FF5D,U+1D400-1D7FF,U+1EE00-1EEFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2) format('woff2');unicode-range:U+0001-000C,U+000E-001F,U+007F-009F,U+20DD-20E0,U+20E2-20E4,U+2150-218F,U+2190,U+2192,U+2194-2199,U+21AF,U+21E6-21F0,U+21F3,U+2218-2219,U+2299,U+22C4-22C6,U+2300-243F,U+2440-244A,U+2460-24FF,U+25A0-27BF,U+2800-28FF,U+2921-2922,U+2981,U+29BF,U+29EB,U+2B00-2BFF,U+4DC0-4DFF,U+FFF9-FFFB,U+10140-1018E,U+10190-1019C,U+101A0,U+101D0-101FD,U+102E0-102FB,U+10E60-10E7E,U+1D2C0-1D2D3,U+1D2E0-1D37F,U+1F000-1F0FF,U+1F100-1F1AE,U+1F1E6-1F1FF,U+1F30D-1F30F,U+1F315,U+1F31C,U+1F31E,U+1F320-1F32C,U+1F336,U+1F378,U+1F37D,U+1F382,U+1F393-1F39F,U+1F3A7-1F3A8,U+1F3AC-1F3AF,U+1F3C2,U+1F3C4-1F3C6,U+1F3CA-1F3CE,U+1F3D4-1F3E0,U+1F3ED,U+1F3F1-1F3F3,U+1F3F5-1F3F7,U+1F408,U+1F415,U+1F41F,U+1F426,U+1F43F,U+1F441-1F442,U+1F444,U+1F446-1F449,U+1F44C-1F44E,U+1F453,U+1F46A,U+1F47D,U+1F4A3,U+1F4B0,U+1F4B3,U+1F4B9,U+1F4BB,U+1F4BF,U+1F4C8-1F4CB,U+1F4D6,U+1F4DA,U+1F4DF,U+1F4E3-1F4E6,U+1F4EA-1F4ED,U+1F4F7,U+1F4F9-1F4FB,U+1F4FD-1F4FE,U+1F503,U+1F507-1F50B,U+1F50D,U+1F512-1F513,U+1F53E-1F54A,U+1F54F-1F5FA,U+1F610,U+1F650-1F67F,U+1F687,U+1F68D,U+1F691,U+1F694,U+1F698,U+1F6AD,U+1F6B2,U+1F6B9-1F6BA,U+1F6BC,U+1F6C6-1F6CF,U+1F6D3-1F6D7,U+1F6E0-1F6EA,U+1F6F0-1F6F3,U+1F6F7-1F6FC,U+1F700-1F80B,U+1F810-1F847,U+1F850-1F859,U+1F860-1F887,U+1F890-1F8AD,U+1F8B0-1F8BB,U+1F8C0-1F8C1,U+1F8D0-1F8D8,U+1F900-1F90B,U+1F93B,U+1F946,U+1F984,U+1F996,U+1F9E9,U+1FA00-1FA6F,U+1FA70-1FA7C,U+1FA80-1FAC6,U+1FAC8,U+1FACC-1FADD,U+1FADF-1FAEB,U+1FAEF-1FAFA,U+1FB00-1FBFF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2) format('woff2');unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C4,U+2113,U+2C60-2C7F,U+A720-A7FF}@font-face{font-family:'Open Sans';font-style:normal;font-weight:800;font-stretch:100%;font-display:swap;src:url(/fonts/opensans-memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`}</style>

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
                      <a href={`/certification/departments/course/${mod.id}/${mod.pages[0].id}`}
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
