'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function SetPasswordPage() {
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)
  const [userName, setUserName]   = useState('')
  const [ready, setReady]         = useState(false)

  const supabase = createClient()

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event (from reset email link)
    // or SIGNED_IN (from must_change_password flow)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session?.user) {
          const name = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'there'
          setUserName(name)
          setReady(true)
        }
      }
    })

    // Also handle users already logged in (must_change_password flow)
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        const name = data.user.user_metadata?.name || data.user.email?.split('@')[0] || 'there'
        setUserName(name)
        setReady(true)
      }
    })

    // If no session after 3s, redirect to login
    const timeout = setTimeout(() => {
      if (!ready) {
        supabase.auth.getUser().then(({ data }) => {
          if (!data.user) window.location.href = '/bcps/login'
        })
      }
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => { window.location.href = '/bcps' }, 2000)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: '8px',
    background: '#0f1923', border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff', fontSize: '14px', outline: 'none', boxSizing: 'border-box',
    fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.1em',
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0a1628 0%, #0e2a45 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Montserrat', sans-serif", padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <img
            src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
            alt="Broward County Public Schools"
            style={{ height: '52px', width: 'auto', marginBottom: '16px' }}
          />
        </div>

        <div style={{
          background: '#132030', borderRadius: '16px', padding: '32px',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '16px' }}>✅</div>
              <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: '700', marginBottom: '10px' }}>Password set!</h2>
              <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '13px' }}>Taking you to your dashboard...</p>
            </div>
          ) : !ready ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(255,255,255,0.45)', fontSize: '13px' }}>
              Verifying your reset link...
            </div>
          ) : (
            <>
              <h2 style={{ color: '#fff', fontSize: '17px', fontWeight: '700', margin: '0 0 6px' }}>
                {userName ? `Welcome, ${userName.split(' ')[0]}` : 'Welcome'}
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', margin: '0 0 24px', lineHeight: '1.65' }}>
                Create a personal password to secure your account. You will use this to sign in going forward.
              </p>

              <form onSubmit={handleSubmit}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  New Password
                </label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required placeholder="At least 8 characters" style={{ ...inputStyle, marginBottom: '14px' }} />

                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Confirm Password
                </label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required placeholder="Re-enter password" style={{ ...inputStyle, marginBottom: '20px' }} />

                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px 14px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '12px', background: 'linear-gradient(135deg, #1672A7, #0e4e73)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '800',
                  textTransform: 'uppercase', letterSpacing: '0.08em', cursor: 'pointer',
                  opacity: loading ? 0.7 : 1, fontFamily: "'Montserrat', sans-serif",
                }}>
                  {loading ? 'Saving...' : 'Set Password and Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

