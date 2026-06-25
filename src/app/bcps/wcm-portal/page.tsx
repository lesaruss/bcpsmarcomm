'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Department {
  id: string
  name: string
  wcm_name: string | null
  wcm_email: string | null
  audit_status: string
  current_round: number
  wcm_notified_at: string | null
  wcm_submitted_at: string | null
}

interface Finding {
  id: string
  category: 'layout' | 'content' | 'nav' | 'ada'
  severity: 'critical' | 'serious' | 'moderate' | 'minor'
  finding_text: string
  recommendation: string | null
  wcm_fixed: boolean
  wcm_fixed_at: string | null
  carry_forward: boolean
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }
const CATEGORY_LABELS: Record<string, string> = { layout: 'Layout', content: 'Content', nav: 'Navigation', ada: 'Accessibility (ADA)' }
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  serious:  '#EA580C',
  moderate: '#D97706',
  minor:    '#6B7280',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  not_started:   { label: 'Not Started',        color: '#6B7280', bg: '#F3F4F6' },
  in_progress:   { label: 'Audit In Progress',  color: '#2563EB', bg: '#EFF6FF' },
  wcm_notified:  { label: 'Action Required',    color: '#D97706', bg: '#FFFBEB' },
  wcm_submitted: { label: 'Submitted - Pending Review', color: '#7C3AED', bg: '#F5F3FF' },
  admin_review:  { label: 'Under Admin Review', color: '#2563EB', bg: '#EFF6FF' },
  needs_rework:  { label: 'Updates Needed',     color: '#DC2626', bg: '#FEF2F2' },
  complete:      { label: 'Complete',           color: '#059669', bg: '#ECFDF5' },
}

export default function WCMPortalPage() {
  const supabase = createClient()

  const [loading, setLoading]       = useState(true)
  const [dept, setDept]             = useState<Department | null>(null)
  const [findings, setFindings]     = useState<Finding[]>([])
  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitDone, setSubmitDone] = useState(false)
  const [fixingId, setFixingId]     = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')

  const loadPortal = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setError('Not signed in.'); setLoading(false); return }
      setUserEmail(user.email)

      // Find the department this WCM is assigned to
      const { data: depts } = await supabase
        .from('bcps_departments')
        .select('id, name, wcm_name, wcm_email, audit_status, current_round, wcm_notified_at, wcm_submitted_at')
        .ilike('wcm_email', user.email)
        .limit(1)

      if (!depts || depts.length === 0) {
        setError("We couldn't find a department assigned to your email address. Contact the District Web Team if this is a mistake.")
        setLoading(false)
        return
      }

      const department = depts[0] as Department
      setDept(department)

      // Load findings for current round
      const { data: rows } = await supabase
        .from('bcps_audit_findings')
        .select('id, category, severity, finding_text, recommendation, wcm_fixed, wcm_fixed_at, carry_forward')
        .eq('department_id', department.id)
        .eq('round_number', department.current_round)
        .order('wcm_fixed', { ascending: true }) // unfixed first

      setFindings((rows ?? []).sort((a, b) => {
        if (a.wcm_fixed !== b.wcm_fixed) return a.wcm_fixed ? 1 : -1
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      }) as Finding[])

      // If already submitted this round, show done state
      if (department.audit_status === 'wcm_submitted' || department.audit_status === 'admin_review') {
        setSubmitDone(true)
      }
    } catch (e) {
      setError('Failed to load portal. Please refresh.')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadPortal() }, [loadPortal])

  const markFixed = async (findingId: string) => {
    if (!dept) return
    setFixingId(findingId)
    try {
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('bcps_audit_findings')
        .update({ wcm_fixed: true, wcm_fixed_at: now })
        .eq('id', findingId)

      if (error) throw error

      setFindings(prev => prev.map(f =>
        f.id === findingId ? { ...f, wcm_fixed: true, wcm_fixed_at: now } : f
      ).sort((a, b) => {
        if (a.wcm_fixed !== b.wcm_fixed) return a.wcm_fixed ? 1 : -1
        return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      }))
    } catch (e) {
      console.error('Mark fixed error:', e)
    } finally {
      setFixingId(null)
    }
  }

  const submitChecklist = async () => {
    if (!dept || !userEmail) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/bcps/wcm-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: dept.id, wcm_email: userEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSubmitDone(true)
      setDept(prev => prev ? { ...prev, audit_status: 'wcm_submitted' } : prev)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const allFixed = findings.length > 0 && findings.every(f => f.wcm_fixed)
  const fixedCount = findings.filter(f => f.wcm_fixed).length
  const totalCount = findings.length
  const progressPct = totalCount > 0 ? Math.round((fixedCount / totalCount) * 100) : 0

  const categories = ['all', ...Array.from(new Set(findings.map(f => f.category)))]
  const visibleFindings = filterCategory === 'all'
    ? findings
    : findings.filter(f => f.category === filterCategory)

  const statusCfg = dept ? (STATUS_CONFIG[dept.audit_status] ?? STATUS_CONFIG.wcm_notified) : null

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#2B5F8F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
          <p style={{ color: '#64748B', fontFamily: 'Montserrat, sans-serif' }}>Loading your audit checklist...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 480, background: '#fff', borderRadius: 12, padding: 40, boxShadow: '0 1px 4px rgba(0,0,0,.08)', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" style={{ margin: '0 auto' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h2 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>Access Error</h2>
          <p style={{ fontFamily: 'Montserrat, sans-serif', color: '#64748B', lineHeight: 1.6 }}>{error}</p>
          <a href="mailto:webmaster@bcps.net" style={{ display: 'inline-block', marginTop: 24, padding: '10px 20px', background: '#2B5F8F', color: '#fff', borderRadius: 8, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 14 }}>
            Contact Web Team
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Montserrat, sans-serif' }}>

      {/* Top bar */}
      <header style={{ background: '#2B5F8F', padding: '0 32px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, background: '#F4A300', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#2B5F8F' }}>K</div>
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>Broward County Public Schools</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>WCM Audit Portal</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{userEmail}</span>
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/bcps/login' }}
            style={{ padding: '6px 14px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 13 }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Department header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Website Audit</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', margin: '0 0 8px' }}>{dept?.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {statusCfg && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: statusCfg.bg, color: statusCfg.color, fontSize: 13, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusCfg.color, display: 'inline-block' }} />
                {statusCfg.label}
              </span>
            )}
            {dept && (
              <span style={{ color: '#94A3B8', fontSize: 13 }}>
                Round {dept.current_round}
                {dept.wcm_notified_at && ` - Audit issued ${new Date(dept.wcm_notified_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {findings.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, color: '#1E293B', fontSize: 15 }}>Checklist Progress</span>
              <span style={{ fontWeight: 700, color: progressPct === 100 ? '#059669' : '#2B5F8F', fontSize: 15 }}>{fixedCount} / {totalCount} items addressed</span>
            </div>
            <div style={{ height: 10, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: progressPct === 100 ? '#059669' : '#2B5F8F', borderRadius: 999, transition: 'width 0.4s ease' }} />
            </div>
          </div>
        )}

        {/* Submit success banner */}
        {submitDone && (
          <div style={{ background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <div>
              <div style={{ fontWeight: 700, color: '#065F46', fontSize: 14 }}>Checklist submitted.</div>
              <div style={{ color: '#047857', fontSize: 13, marginTop: 2 }}>The District Web Team has been notified and will review your updates. You will be contacted if anything further is needed.</div>
            </div>
          </div>
        )}

        {/* No findings */}
        {!loading && findings.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 48, textAlign: 'center' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" style={{ margin: '0 auto 16px', display: 'block' }}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <p style={{ color: '#64748B', fontWeight: 600 }}>No audit findings for this round.</p>
            <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 4 }}>Contact the District Web Team if you expected items here.</p>
          </div>
        )}

        {/* Category filter */}
        {findings.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setFilterCategory(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                  background: filterCategory === cat ? '#2B5F8F' : '#fff',
                  color: filterCategory === cat ? '#fff' : '#475569',
                  border: `1px solid ${filterCategory === cat ? '#2B5F8F' : '#CBD5E1'}`,
                }}
              >
                {cat === 'all' ? `All (${findings.length})` : `${CATEGORY_LABELS[cat] ?? cat} (${findings.filter(f => f.category === cat).length})`}
              </button>
            ))}
          </div>
        )}

        {/* Findings list */}
        {visibleFindings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
            {visibleFindings.map(finding => (
              <div
                key={finding.id}
                style={{
                  background: finding.wcm_fixed ? '#F8FAFC' : '#fff',
                  border: `1px solid ${finding.wcm_fixed ? '#E2E8F0' : '#CBD5E1'}`,
                  borderLeft: `4px solid ${finding.wcm_fixed ? '#D1FAE5' : SEVERITY_COLORS[finding.severity]}`,
                  borderRadius: 10,
                  padding: '16px 20px',
                  opacity: finding.wcm_fixed ? 0.65 : 1,
                  transition: 'opacity 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      {finding.wcm_fixed ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', background: '#D1FAE5', color: '#065F46', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          Fixed
                        </span>
                      ) : (
                        <span style={{ display: 'inline-block', padding: '2px 10px', background: '#FEF3C7', color: SEVERITY_COLORS[finding.severity], borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>
                          {finding.severity}
                        </span>
                      )}
                      <span style={{ padding: '2px 10px', background: '#F1F5F9', color: '#475569', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                        {CATEGORY_LABELS[finding.category] ?? finding.category}
                      </span>
                      {finding.carry_forward && (
                        <span style={{ padding: '2px 10px', background: '#FEE2E2', color: '#DC2626', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                          Carried from prior round
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '0 0 6px', fontWeight: 600, color: finding.wcm_fixed ? '#64748B' : '#1E293B', fontSize: 14, textDecoration: finding.wcm_fixed ? 'line-through' : 'none' }}>
                      {finding.finding_text}
                    </p>
                    {!finding.wcm_fixed && finding.recommendation && (
                      <p style={{ margin: 0, color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>
                        <strong style={{ color: '#475569' }}>How to fix:</strong> {finding.recommendation}
                      </p>
                    )}
                    {finding.wcm_fixed && finding.wcm_fixed_at && (
                      <p style={{ margin: 0, color: '#94A3B8', fontSize: 12 }}>
                        Marked fixed {new Date(finding.wcm_fixed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {!finding.wcm_fixed && dept?.audit_status !== 'wcm_submitted' && dept?.audit_status !== 'admin_review' && (
                    <button
                      onClick={() => markFixed(finding.id)}
                      disabled={fixingId === finding.id}
                      style={{
                        flexShrink: 0,
                        padding: '8px 16px',
                        background: fixingId === finding.id ? '#E2E8F0' : '#2B5F8F',
                        color: fixingId === finding.id ? '#94A3B8' : '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: fixingId === finding.id ? 'default' : 'pointer',
                        fontWeight: 700,
                        fontSize: 13,
                        fontFamily: 'Montserrat, sans-serif',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {fixingId === finding.id
                        ? 'Saving...'
                        : (<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Mark Fixed</>)
                      }
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Submit section */}
        {findings.length > 0 && !submitDone && (
          <div style={{ background: '#fff', border: `1px solid ${allFixed ? '#6EE7B7' : '#E2E8F0'}`, borderRadius: 12, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>
                  {allFixed ? 'All items addressed - ready to submit' : `${totalCount - fixedCount} item${totalCount - fixedCount !== 1 ? 's' : ''} remaining`}
                </div>
                <div style={{ color: '#64748B', fontSize: 13 }}>
                  {allFixed
                    ? 'Clicking Submit will notify the District Web Team to run a verification audit.'
                    : 'Mark all items as fixed before submitting. Use "Mark Fixed" on each item above once you have made the required change in Finalsite.'}
                </div>
              </div>
              <button
                onClick={submitChecklist}
                disabled={!allFixed || submitting}
                style={{
                  padding: '12px 28px',
                  background: allFixed ? '#059669' : '#E2E8F0',
                  color: allFixed ? '#fff' : '#94A3B8',
                  border: 'none',
                  borderRadius: 10,
                  cursor: allFixed && !submitting ? 'pointer' : 'default',
                  fontWeight: 800,
                  fontSize: 15,
                  fontFamily: 'Montserrat, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s',
                }}
              >
                {submitting
                  ? (<><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Submitting...</>)
                  : (<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Submit to Web Team</>)
                }
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
