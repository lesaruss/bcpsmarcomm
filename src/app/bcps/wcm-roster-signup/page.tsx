'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

const ACCESS_KEY = 'lr-wcm-roster-9f21ab6c'

interface DeptOption {
  id: string
  department_name: string
  location_number: string
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

export default function WCMRosterSignupPage() {
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [deptQuery, setDeptQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState<DeptOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  // Fallback for a department that isn't in the bcps_wcm_roster list: lets a
  // Director type it in directly instead of being stuck. Nothing extra to
  // flag here - /api/bcps/wcm-roster-intake already routes every submission
  // (matched or not) into bcps_wcm_roster_submissions as 'pending' for the
  // District Web Team to review, and an unmatched name just lands with a
  // null location_number as the natural "needs a look" signal.
  const [manualDept, setManualDept] = useState(false)

  const [directorName, setDirectorName] = useState('')
  const [wcmName, setWcmName] = useState('')
  const [wcmPersonnelNumber, setWcmPersonnelNumber] = useState('')
  const [wcmEmail, setWcmEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/bcps/wcm-roster-departments')
      .then(r => r.json())
      .then(j => setDepartments(j.departments || []))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filteredDepts = useMemo(() => {
    const q = deptQuery.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(d => d.department_name.toLowerCase().includes(q))
  }, [departments, deptQuery])

  function pickDept(d: DeptOption) {
    setSelectedDept(d)
    setDeptQuery(`${titleCase(d.department_name)} (${d.location_number})`)
    setShowDropdown(false)
  }

  function useManualDept() {
    setSelectedDept(null)
    setManualDept(true)
    setShowDropdown(false)
  }

  function backToDeptSearch() {
    setManualDept(false)
    setDeptQuery('')
    setSelectedDept(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const departmentName = manualDept ? deptQuery.trim() : selectedDept?.department_name
    if (!departmentName) {
      setResult({
        type: 'error',
        text: manualDept
          ? 'Please enter your department name.'
          : 'Please select your department from the list.',
      })
      return
    }
    if (!directorName.trim() || !wcmName.trim()) {
      setResult({ type: 'error', text: 'Director name and WCM name are required.' })
      return
    }

    setSubmitting(true)
    setResult(null)
    try {
      const r = await fetch('/api/bcps/wcm-roster-intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          department_name: departmentName,
          director_name: directorName.trim(),
          wcm_name: wcmName.trim(),
          wcm_personnel_number: wcmPersonnelNumber.trim() || undefined,
          wcm_email: wcmEmail.trim() || undefined,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Submission failed.')

      setResult({
        type: 'success',
        text: 'Thank you! Your submission has been received and is awaiting review by the District Web Team.',
      })
      setSelectedDept(null)
      setManualDept(false)
      setDeptQuery('')
      setDirectorName('')
      setWcmName('')
      setWcmPersonnelNumber('')
      setWcmEmail('')
    } catch (err) {
      setResult({ type: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '16px 28px', borderBottom: '3px solid var(--blue)',
        background: '#fff',
      }}>
        <img
          src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
          alt="Broward County Public Schools"
          style={{ height: 40, width: 'auto', flexShrink: 0 }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text-primary)' }}>Broward County Public Schools</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>District Web Team</div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 28px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--blue)', marginBottom: 8 }}>
            Department Web Managers
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Department Web Content Managers Roster 2026/27
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
            Directors: submit a separate response for each Web Content Manager (WCM) assigned to your department.
            Submissions are reviewed by the District Web Team before a record is updated.
          </p>
        </div>

        <div>
          {result && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 8,
                marginBottom: 20,
                fontSize: 14,
                fontWeight: 600,
                background: result.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                color: result.type === 'success' ? '#059669' : '#DC2626',
                border: `1px solid ${result.type === 'success' ? 'rgba(5,150,105,0.25)' : 'rgba(220,38,38,0.25)'}`,
              }}
            >
              {result.text}
            </div>
          )}

          <div className="wcm-portal-content">
            <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
                Department <span style={{ color: '#DC2626' }}>*</span>
              </label>
              {manualDept ? (
                <div>
                  <input
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Type your department name"
                    value={deptQuery}
                    onChange={e => setDeptQuery(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={backToDeptSearch}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, padding: '6px 0 0', display: 'block' }}
                  >
                    Search departments instead
                  </button>
                </div>
              ) : (
                <div style={{ position: 'relative' }} ref={boxRef}>
                  <input
                    className="form-input"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="Start typing to search departments..."
                    value={deptQuery}
                    onChange={e => { setDeptQuery(e.target.value); setSelectedDept(null); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    autoComplete="off"
                    required
                  />
                  {showDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, maxHeight: 260, overflowY: 'auto',
                      background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20,
                    }}>
                      {filteredDepts.length === 0 && (
                        <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-muted)' }}>No departments match.</div>
                      )}
                      {filteredDepts.map(d => (
                        <div
                          key={d.id}
                          onClick={() => pickDept(d)}
                          style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                          onMouseDown={ev => ev.preventDefault()}
                        >
                          {titleCase(d.department_name)} <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({d.location_number})</span>
                        </div>
                      ))}
                      <div
                        onClick={useManualDept}
                        onMouseDown={ev => ev.preventDefault()}
                        style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--blue)', cursor: 'pointer' }}
                      >
                        Don&apos;t see your department? Enter it manually
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Field label="Directors Name" required value={directorName} onChange={setDirectorName} placeholder="Enter your answer" />
            <Field label="Name of Web Content Manager (WCM)" required value={wcmName} onChange={setWcmName} placeholder="Enter your answer" />
            <Field label="WCM Personnel Number" value={wcmPersonnelNumber} onChange={setWcmPersonnelNumber} placeholder="Enter your answer" />
            <Field label="WCM Email Address" value={wcmEmail} onChange={setWcmEmail} placeholder="Enter your answer" type="email" />

            <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: 8, padding: '11px 28px', fontSize: 14 }}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}

function Field({
  label, value, onChange, required, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>
      <input
        className="form-input"
        style={{ width: '100%', boxSizing: 'border-box' }}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}
