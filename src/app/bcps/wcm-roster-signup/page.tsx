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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDept) {
      setResult({ type: 'error', text: 'Please select your department from the list.' })
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
          department_name: selectedDept.department_name,
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
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid rgba(0,0,0,0.08)', padding: '20px 24px' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E8650A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
            BC
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a' }}>Broward County Public Schools</div>
            <div style={{ fontSize: 12, color: 'rgba(26,26,26,0.5)' }}>District Web Team</div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', margin: '0 0 8px' }}>
          Department Web Content Managers Roster 2026/27
        </h1>
        <p style={{ fontSize: 14.5, color: 'rgba(26,26,26,0.65)', lineHeight: 1.6, margin: '0 0 32px' }}>
          Directors: please submit a separate response for each Web Content Manager (WCM) assigned to help maintain
          your department&apos;s webpages. We recommend assigning more than one WCM to ensure consistent support with
          website updates. Submissions are reviewed by the District Web Team before a department&apos;s record is updated.
        </p>

        {result && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 8,
              marginBottom: 24,
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

        <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 28 }}>
          <div style={{ marginBottom: 22, position: 'relative' }} ref={boxRef}>
            <label style={labelStyle}>
              Department <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input
              style={inputStyle}
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
                background: '#fff', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20,
              }}>
                {filteredDepts.length === 0 ? (
                  <div style={{ padding: '12px 14px', fontSize: 13, color: 'rgba(26,26,26,0.4)' }}>No departments match.</div>
                ) : filteredDepts.map(d => (
                  <div
                    key={d.id}
                    onClick={() => pickDept(d)}
                    style={{ padding: '10px 14px', fontSize: 13.5, cursor: 'pointer', borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                    onMouseDown={ev => ev.preventDefault()}
                  >
                    {titleCase(d.department_name)} <span style={{ color: 'rgba(26,26,26,0.4)', fontSize: 12 }}>({d.location_number})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Directors Name" required value={directorName} onChange={setDirectorName} placeholder="Enter your answer" />
          <Field label="Name of Web Content Manager (WCM)" required value={wcmName} onChange={setWcmName} placeholder="Enter your answer" />
          <Field label="WCM Personnel Number" value={wcmPersonnelNumber} onChange={setWcmPersonnelNumber} placeholder="Enter your answer" />
          <Field label="WCM Email Address" value={wcmEmail} onChange={setWcmEmail} placeholder="Enter your answer" type="email" />

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 8, padding: '12px 28px', background: submitting ? '#f0a875' : '#E8650A', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </form>
      </main>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 700, color: '#1a1a1a', marginBottom: 6 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 8,
  fontFamily: 'inherit', boxSizing: 'border-box',
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
    <div style={{ marginBottom: 22 }}>
      <label style={labelStyle}>
        {label} {required && <span style={{ color: '#DC2626' }}>*</span>}
      </label>
      <input
        style={inputStyle}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  )
}
