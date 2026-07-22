'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

function getSafeNext(): string {
  if (typeof window === 'undefined') return '/'
  const next = new URLSearchParams(window.location.search).get('next')
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [emailSent, setEmailSent] = useState(false)

  const supabase = createClient()

  const handleGoogle = async () => {
    setLoading(true)
    const next = getSafeNext()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    })
    if (error) setError(error.message)
    setLoading(false)
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
      } else {
        window.location.href = getSafeNext()
      }
    } else {
      const next = getSafeNext()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      })
      if (error) setError(error.message)
      else setEmailSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f1923 0%, #1a2a3a 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Open Sans', sans-serif",
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: '20px', fontWeight: '700', color: '#fff',
            boxShadow: '0 8px 24px rgba(22,114,167,0.35)',
          }}>BCPS</div>
          <h1 style={{ color: '#fff', fontSize: '22px', fontWeight: '700', margin: '0 0 4px' }}>
            BCPS Marcomm
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>
            Broward County Public Schools
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#1e2d3d',
          borderRadius: '16px',
          padding: '32px',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        }}>
          <h2 style={{ color: '#fff', fontSize: '18px', fontWeight: '600', margin: '0 0 24px', textAlign: 'center' }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </h2>

          {emailSent ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>📬</div>
              <p style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                Check your email for a confirmation link to complete sign-up.
              </p>
            </div>
          ) : (
            <>
              {/* Google SSO */}
              <button onClick={handleGoogle} disabled={loading} style={{
                width: '100%', padding: '12px', borderRadius: '10px',
                background: '#fff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '10px', fontSize: '14px', fontWeight: '600', color: '#1e293b',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'opacity 0.15s',
                opacity: loading ? 0.7 : 1,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '20px 0' }}>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ color: '#475569', fontSize: '12px' }}>or continue with email</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              </div>

              {/* Email form */}
              <form onSubmit={handleEmail}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                    Email address
                  </label>
                  <input
                    type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required placeholder="you@lesaruss.com"
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: '8px',
                      background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                    Password
                  </label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    required placeholder="••••••••"
                    style={{
                      width: '100%', padding: '11px 14px', borderRadius: '8px',
                      background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>

                {error && (
                  <div style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', padding: '10px 14px', color: '#fca5a5',
                    fontSize: '13px', marginBottom: '16px',
                  }}>{error}</div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '12px',
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  border: 'none', borderRadius: '10px', color: '#fff',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s',
                }}>
                  {loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: '20px', color: '#475569', fontSize: '13px' }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError('') }}
                  style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: 0 }}>
                  {mode === 'signin' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
