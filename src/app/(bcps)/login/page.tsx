'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

function getSafeNext(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

interface DeptOption {
  id: string
  department_name: string
  location_number: string
  department_slug: string | null
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase())
}

export default function BCPSLoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  // Was 'signin' | 'forgot' - Sean, 2026-09-10: the login page's only path
  // to registration was a text link to a gated Playbook (60 named
  // recipients), so anyone new who wasn't already on that list got bounced
  // straight back to /login by that doc's own access check - "click
  // Register, it just brings you back to the login screen." Fix is a real
  // toggle right here, same pattern as the existing Sign In / Forgot
  // Password switch, so creating an account never depends on a gated doc.
  const [mode, setMode]         = useState<'signin' | 'register' | 'forgot'>('signin')
  const [resetSent, setResetSent] = useState(false)

  // Registration fields/state - same shape and same submit sequence as
  // /wcm-registration/register (auth.signUp -> wcm_cert_users upsert ->
  // /api/bcps/wcm-pilot-register enrollment) so an account created from
  // here ends up identically enrolled, department and all, rather than a
  // second, thinner signup path that drifts from the real one over time.
  const [regFullName, setRegFullName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)
  const [regDone, setRegDone] = useState(false)
  const [departments, setDepartments] = useState<DeptOption[]>([])
  const [deptQuery, setDeptQuery] = useState('')
  const [selectedDept, setSelectedDept] = useState<DeptOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [manualDept, setManualDept] = useState(false)
  const deptBoxRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  useEffect(() => {
    if (mode !== 'register' || departments.length) return
    fetch('/api/bcps/wcm-roster-departments')
      .then(r => r.json())
      .then(j => setDepartments(j.departments || []))
      .catch(() => setDepartments([]))
  }, [mode, departments.length])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (deptBoxRef.current && !deptBoxRef.current.contains(e.target as Node)) setShowDropdown(false)
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')

    if (!regEmail.toLowerCase().endsWith('@browardschools.com')) {
      setRegError('Access is restricted to @browardschools.com email addresses.')
      return
    }
    if (!regFullName.trim()) {
      setRegError('Full name is required.')
      return
    }

    setRegLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: regEmail,
        password: regPassword,
        options: {
          data: { full_name: regFullName },
          emailRedirectTo: `${window.location.origin}/certification/login`,
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Registration did not return an account. Please try again.')

      const departmentValue = manualDept
        ? (deptQuery.trim() || null)
        : (selectedDept ? titleCase(selectedDept.department_name) : null)
      await supabase.from('wcm_cert_users').upsert(
        {
          user_id: data.user.id,
          email: regEmail.toLowerCase(),
          full_name: regFullName,
          department: departmentValue,
          department_needs_review: manualDept && !!deptQuery.trim(),
          is_admin: false,
        },
        { onConflict: 'user_id' }
      )

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (accessToken) {
        await fetch('/api/bcps/wcm-pilot-register', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ department_slug: manualDept ? null : (selectedDept?.department_slug ?? null) }),
        }).catch(() => { /* best effort, follow up manually if this fails */ })
      }

      setRegDone(true)
    } catch (err: unknown) {
      setRegError(err instanceof Error ? err.message : 'An error occurred. Please try again.')
    } finally {
      setRegLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    const next = getSafeNext()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password. Try again, or use Forgot Password below.'
        : error.message)
      setLoading(false)
      return
    }

    const mustChange = data.user?.user_metadata?.must_change_password
    window.location.href = mustChange ? '/set-password' : getSafeNext()
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setResetSent(true)
    setLoading(false)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '8px',
    background: '#f8fafc', border: '1px solid #d1d5db',
    color: '#111827', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    fontFamily: "'Montserrat', sans-serif",
  }

  const linkStyle: React.CSSProperties = {
    background: 'none', border: 'none', color: '#0e4e73', cursor: 'pointer',
    fontSize: '13px', fontWeight: 700, fontFamily: "'Montserrat', sans-serif", padding: 0,
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f4f7fb 0%, #e7eef6 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Montserrat', sans-serif", padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Header */}
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
            Broward County Public Schools
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '32px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 12px 32px rgba(15,41,69,0.10)',
        }}>

          {!resetSent && (mode === 'signin' || mode === 'register') && !regDone && (
            <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '10px', padding: '4px', marginBottom: '24px' }}>
              <button
                type="button"
                onClick={() => { setMode('signin'); setError('') }}
                style={{
                  flex: 1, padding: '9px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  fontFamily: "'Montserrat', sans-serif",
                  background: mode === 'signin' ? '#ffffff' : 'transparent',
                  color: mode === 'signin' ? '#0e4e73' : '#6b7280',
                  boxShadow: mode === 'signin' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setRegError('') }}
                style={{
                  flex: 1, padding: '9px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                  fontFamily: "'Montserrat', sans-serif",
                  background: mode === 'register' ? '#ffffff' : 'transparent',
                  color: mode === 'register' ? '#0e4e73' : '#6b7280',
                  boxShadow: mode === 'register' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                }}
              >
                Create Account
              </button>
            </div>
          )}

          {resetSent ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#0e4e73" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 6L2 7" />
                </svg>
              </div>
              <h2 style={{ color: '#111827', fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>Check your email</h2>
              <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.7', marginBottom: '24px' }}>
                A password reset link has been sent to <strong style={{ color: '#111827' }}>{email}</strong>.
                Click the link in the email to set a new password.
              </p>
              <button onClick={() => { setMode('signin'); setResetSent(false) }} style={linkStyle}>
                Back to Sign In
              </button>
            </div>
          ) : mode === 'forgot' ? (
            <>
              <h2 style={{ color: '#111827', fontSize: '17px', fontWeight: 700, margin: '0 0 6px' }}>Reset your password</h2>
              <p style={{ color: '#5b6675', fontSize: '13px', margin: '0 0 24px', lineHeight: '1.6' }}>
                Enter your BCPS email and we will send a reset link.
              </p>
              <form onSubmit={handleForgotPassword}>
                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  BCPS Email Address
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@browardschools.com" style={{ ...inputStyle, marginBottom: '16px' }} />

                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                  opacity: loading ? 0.7 : 1, fontFamily: "'Montserrat', sans-serif",
                }}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px' }}>
                <button onClick={() => { setMode('signin'); setError('') }} style={linkStyle}>
                  Back to Sign In
                </button>
              </p>
            </>
          ) : mode === 'register' ? (
            regDone ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center' }} aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16750C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <h2 style={{ color: '#111827', fontSize: '16px', fontWeight: 700, marginBottom: '10px' }}>You&apos;re enrolled</h2>
              <p style={{ color: '#4b5563', fontSize: '13px', lineHeight: '1.7', marginBottom: '24px' }}>
                Your Web Content Manager Department Registration is complete. Sign in above to complete the Department WCM Certification course.
              </p>
              <button onClick={() => { setMode('signin'); setRegDone(false) }} style={linkStyle}>
                Back to Sign In
              </button>
            </div>
            ) : (
            <>
              <h2 style={{ color: '#111827', fontSize: '17px', fontWeight: 700, margin: '0 0 6px' }}>Create your account</h2>
              <p style={{ color: '#5b6675', fontSize: '13px', margin: '0 0 20px', lineHeight: '1.6' }}>
                Registers you as a Department Web Content Manager. Access restricted to @browardschools.com addresses.
              </p>
              <form onSubmit={handleRegister}>
                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Full Name
                </label>
                <input type="text" value={regFullName} onChange={e => setRegFullName(e.target.value)}
                  required placeholder="First Last" style={{ ...inputStyle, marginBottom: '14px' }} />

                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Department
                </label>
                {manualDept ? (
                  <div style={{ marginBottom: '14px' }}>
                    <input type="text" value={deptQuery} onChange={e => setDeptQuery(e.target.value)}
                      placeholder="Type your department name" style={inputStyle} autoFocus />
                    <button type="button" onClick={backToDeptSearch} style={{ ...linkStyle, fontSize: '12px', marginTop: '6px', display: 'block' }}>
                      Search departments instead
                    </button>
                  </div>
                ) : (
                  <div style={{ position: 'relative', marginBottom: '14px' }} ref={deptBoxRef}>
                    <input
                      type="text" value={deptQuery}
                      onChange={e => { setDeptQuery(e.target.value); setSelectedDept(null); setShowDropdown(true) }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="Start typing to search departments..." style={inputStyle} autoComplete="off"
                    />
                    {showDropdown && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', maxHeight: '220px', overflowY: 'auto', background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 20 }}>
                        {filteredDepts.length === 0 && (
                          <div style={{ padding: '10px 14px', fontSize: '13px', color: '#9ca3af' }}>No departments match.</div>
                        )}
                        {filteredDepts.map(d => (
                          <div key={d.id} onMouseDown={ev => ev.preventDefault()} onClick={() => pickDept(d)}
                            style={{ padding: '10px 14px', fontSize: '13px', cursor: 'pointer', borderBottom: '1px solid #eef1f5' }}>
                            {titleCase(d.department_name)} <span style={{ color: '#9ca3af', fontSize: '12px' }}>({d.location_number})</span>
                          </div>
                        ))}
                        <div onMouseDown={ev => ev.preventDefault()} onClick={useManualDept}
                          style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#0e4e73', cursor: 'pointer' }}>
                          Don&apos;t see your department? Enter it manually
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  BCPS Email Address
                </label>
                <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                  required placeholder="john.doe@browardschools.com" style={{ ...inputStyle, marginBottom: '4px' }} />
                <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 14px' }}>
                  This is your name-based BCPS email, not your P-number.
                </p>

                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Password
                </label>
                <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                  required minLength={8} placeholder="Create a password (min 8 characters)"
                  style={{ ...inputStyle, marginBottom: '20px', letterSpacing: '0.15em' }} />

                {regError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '16px' }}>
                    {regError}
                  </div>
                )}

                <button type="submit" disabled={regLoading} style={{
                  width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                  opacity: regLoading ? 0.7 : 1, fontFamily: "'Montserrat', sans-serif",
                }}>
                  {regLoading ? 'Creating account...' : 'Create Account'}
                </button>
              </form>
              <p style={{ textAlign: 'center', marginTop: '20px', color: '#6b7280', fontSize: '12px', lineHeight: '1.6' }}>
                Access restricted to @browardschools.com addresses.
              </p>
            </>
            )
          ) : (
            <>
              <h2 style={{ color: '#111827', fontSize: '17px', fontWeight: 700, margin: '0 0 24px' }}>Sign in to your account</h2>

              {/* Google SSO */}
              <button onClick={handleGoogle} disabled={loading} style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                background: '#fff', border: '1px solid #d1d5db', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '10px', fontSize: '13px', fontWeight: 700, color: '#1e293b',
                transition: 'opacity 0.15s',
                opacity: loading ? 0.7 : 1, fontFamily: "'Montserrat', sans-serif",
                marginBottom: '20px',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>or email</span>
                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              </div>

              <form onSubmit={handleSignIn}>
                <label style={{ display: 'block', color: '#374151', fontSize: '11px', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  BCPS Email Address
                </label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required placeholder="you@browardschools.com" style={{ ...inputStyle, marginBottom: '14px' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ color: '#374151', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Password
                  </label>
                  <button type="button" onClick={() => { setMode('forgot'); setError('') }}
                    style={{ ...linkStyle, fontSize: '12px', fontWeight: 600 }}>
                    Forgot password?
                  </button>
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="********" style={{ ...inputStyle, marginBottom: '20px', letterSpacing: '0.15em' }} />

                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#b91c1c', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                  opacity: loading ? 0.7 : 1, fontFamily: "'Montserrat', sans-serif",
                }}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '20px', color: '#6b7280', fontSize: '12px', lineHeight: '1.6' }}>
                Access is limited to the BCPS district web team.<br />
                Contact Sean Russell if you need access.
              </p>
              <p style={{ textAlign: 'center', marginTop: '10px', fontSize: '12px', lineHeight: '1.6' }}>
                Have not registered as a WCM yet?{' '}
                <button type="button" onClick={() => { setMode('register'); setRegError('') }} style={{ ...linkStyle, fontSize: '12px' }}>
                  Create an account
                </button>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
