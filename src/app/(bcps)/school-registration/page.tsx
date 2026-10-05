'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

// School WCM signup (Sean, 2026-10-05): pick your school instead of skipping a
// department field. Account creation and the "is this the WCM on file for
// this school" check happen in /api/banner/school-register; this page then
// signs the WCM in and sends them to their school home.

const FONT = "'Montserrat', sans-serif"

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: '8px',
  background: '#f8fafc', border: '1px solid #d1d5db',
  color: '#111827', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
  fontFamily: FONT, marginBottom: '14px',
}
const labelStyle: React.CSSProperties = {
  display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.1em',
}

export default function SchoolRegistrationPage() {
  const [schools, setSchools] = useState<{ loc_no: string; name: string }[] | null>(null)
  const [locNo, setLocNo] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/banner/school-register', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setSchools(j.schools || []))
      .catch(() => setSchools([]))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setAlreadyRegistered(false)
    setLoading(true)
    try {
      const res = await fetch('/api/banner/school-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loc_no: locNo, name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not create your account.')
        setAlreadyRegistered(!!data.already_registered)
        setLoading(false)
        return
      }
      const { error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (signInError) {
        setError('Your account was created. Sign in with your email and password to continue.')
        setAlreadyRegistered(true)
        setLoading(false)
        return
      }
      window.location.href = '/'
    } catch {
      setError('Could not create your account. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #f4f7fb 0%, #e7eef6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img
            src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
            alt="Broward County Public Schools"
            style={{ height: '52px', width: 'auto', marginBottom: '16px' }}
          />
          <h1 style={{ color: '#111827', fontSize: '18px', fontWeight: 800, margin: '0 0 4px', letterSpacing: '-0.01em' }}>
            BCPS Web Team Portal
          </h1>
          <p style={{ color: '#5b6675', fontSize: '12px', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            School Web Content Managers
          </p>
        </div>

        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '32px',
          border: '1px solid #e5e7eb', boxShadow: '0 12px 32px rgba(15,41,69,0.10)',
        }}>
          <h2 style={{ color: '#111827', fontSize: '17px', fontWeight: 700, margin: '0 0 6px' }}>Create your school account</h2>
          <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: 1.5, margin: '0 0 20px' }}>
            Choose your school and use the district email the District Web Team has on file for you.
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="school" style={labelStyle}>Your School</label>
            <select
              id="school" required value={locNo} onChange={e => setLocNo(e.target.value)}
              disabled={!schools}
              style={{ ...inputStyle }}
            >
              <option value="">{schools ? 'Select your school...' : 'Loading schools...'}</option>
              {(schools || []).map(s => <option key={s.loc_no} value={s.loc_no}>{s.name}</option>)}
            </select>

            <label htmlFor="name" style={labelStyle}>Full Name</label>
            <input id="name" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="First Last" style={inputStyle} />

            <label htmlFor="email" style={labelStyle}>BCPS Email Address</label>
            <input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="john.doe@browardschools.com" style={inputStyle} />

            <label htmlFor="password" style={labelStyle}>Password</label>
            <input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" style={inputStyle} />

            {error && (
              <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
                {error}
                {alreadyRegistered && <> <a href="/login" style={{ color: '#0e4e73', fontWeight: 700 }}>Go to sign in</a>.</>}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
              border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
              opacity: loading ? 0.7 : 1, fontFamily: FONT,
            }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '20px', color: '#6b7280', fontSize: '12px', lineHeight: '1.6' }}>
            Already have an account? <a href="/login" style={{ color: '#0e4e73', fontWeight: 700 }}>Sign in</a>.<br />
            School not listed? Contact the District Web Team.
          </p>
        </div>
      </div>
    </div>
  )
}
