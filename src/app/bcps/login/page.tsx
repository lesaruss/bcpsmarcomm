'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function BCPSLoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [mode, setMode]         = useState<'signin' | 'forgot'>('signin')
  const [resetSent, setResetSent] = useState(false)

  const supabase = createClient()

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
    window.location.href = mustChange ? '/bcps/set-password' : '/bcps'
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/bcps/set-password`,
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
