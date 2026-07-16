'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function CertLoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [registered, setRegistered] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!email.toLowerCase().endsWith('@browardschools.com')) {
      setError('Access is restricted to @browardschools.com email addresses.')
      setLoading(false)
      return
    }

    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        router.push('/bcps/certification/departments')
        router.refresh()
      } else {
        if (!fullName.trim()) { setError('Full name is required.'); setLoading(false); return }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } }
        })
        if (signUpError) throw signUpError
        if (data.user) {
          await supabase.from('wcm_cert_users').upsert({
            user_id: data.user.id,
            email: email.toLowerCase(),
            full_name: fullName,
            department: department || null,
            is_admin: false,
          }, { onConflict: 'user_id' })
        }
        setRegistered(true)
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (registered) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <BcpsLogo />
          <h1 style={styles.title}>Check Your Email</h1>
          <p style={styles.body}>
            A confirmation link has been sent to <strong>{email}</strong>. Please click the link to activate your account, then return here to log in.
          </p>
          <button style={styles.linkBtn} onClick={() => { setRegistered(false); setMode('login') }}>
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.outer}>
        <div style={styles.introCard}>
          <p style={styles.introEyebrow}>WCM Pilot Program</p>
          <h1 style={styles.introTitle}>Welcome to the Web Content Manager Pilot</h1>
          <p style={styles.introBody}>
            This is your starting point as a Department Web Content Manager. Create your account below, then
            complete the Department WCM Certification course. Once certified, you will have access to your
            department&apos;s WCM Hub to manage your website audit checklist.
          </p>
          <ol style={styles.introSteps}>
            <li style={styles.introStep}>
              <span style={styles.introStepNum}>1</span>
              <span>Create your account with your BCPS email address.</span>
            </li>
            <li style={styles.introStep}>
              <span style={styles.introStepNum}>2</span>
              <span>Complete the Department WCM Certification course at your own pace.</span>
            </li>
            <li style={styles.introStep}>
              <span style={styles.introStepNum}>3</span>
              <span>Get access to your department&apos;s WCM Hub and website audit checklist.</span>
            </li>
          </ol>
        </div>

        <div style={styles.card}>
          <BcpsLogo />
          <h2 style={styles.title}>
            {mode === 'login' ? 'WCM Certification' : 'Create Account'}
          </h2>
          <p style={styles.subtitle}>Department - Broward County Public Schools</p>

          <form onSubmit={handleSubmit} style={styles.form}>
            {mode === 'register' && (
              <>
                <label style={styles.label}>Full Name *</label>
                <input
                  style={styles.input}
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="First Last"
                  required
                />
                <label style={styles.label}>Department</label>
                <input
                  style={styles.input}
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="e.g., Communications, IT, Student Services"
                />
              </>
            )}
            <label style={styles.label}>Email *</label>
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@browardschools.com"
              required
            />
            <label style={styles.label}>Password *</label>
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Create a password (min 8 characters)' : 'Your password'}
              minLength={mode === 'register' ? 8 : undefined}
              required
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} type="submit" disabled={loading}>
              {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
            </button>
          </form>

          <p style={styles.toggleText}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button style={styles.linkBtn} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
              {mode === 'login' ? 'Register' : 'Log In'}
            </button>
          </p>
          <p style={styles.note}>Access restricted to @browardschools.com addresses.</p>
        </div>
      </div>
    </div>
  )
}

function BcpsLogo() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <img
        src="/bcps/bcps-logo.png"
        alt="Broward County Public Schools"
        style={{ height: 56, objectFit: 'contain' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Montserrat', sans-serif" },
  outer: { width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 20 },
  introCard: { background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '28px 32px', borderLeft: '4px solid #1672A7' },
  introEyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#1672A7', margin: '0 0 8px' },
  introTitle: { fontSize: 20, fontWeight: 800, color: '#0e4e73', margin: '0 0 10px', lineHeight: 1.25 },
  introBody: { fontSize: 13.5, color: '#444', lineHeight: 1.65, margin: '0 0 18px' },
  introSteps: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 },
  introStep: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#333', lineHeight: 1.5 },
  introStepNum: { flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#1672A7', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '40px 36px', width: '100%' },
  title: { fontSize: 22, fontWeight: 700, color: '#0e4e73', margin: '0 0 4px', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 28, marginTop: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4, marginTop: 12 },
  input: { border: '1px solid #d0d9e3', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: '#222', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: { marginTop: 20, padding: '12px 0', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' },
  error: { color: '#c0392b', fontSize: 13, marginTop: 8, marginBottom: 0 },
  toggleText: { textAlign: 'center', fontSize: 13, color: '#555', marginTop: 20, marginBottom: 0 },
  linkBtn: { background: 'none', border: 'none', color: '#1672A7', cursor: 'pointer', fontWeight: 600, fontSize: 13, padding: 0 },
  note: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 12, marginBottom: 0 },
  body: { fontSize: 14, color: '#444', lineHeight: 1.6, textAlign: 'center' },
}
