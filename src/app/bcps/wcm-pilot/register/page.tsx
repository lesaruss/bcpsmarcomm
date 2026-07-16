'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import '../wcm-pilot.css'
import WcmPilotHeader from '../WcmPilotHeader'

export default function WCMPilotRegisterPage() {
  const [step, setStep] = useState<'intro' | 'form' | 'done'>('intro')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!email.toLowerCase().endsWith('@browardschools.com')) {
      setError('Access is restricted to @browardschools.com email addresses.')
      return
    }
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Registration did not return an account. Please try again.')

      // Course profile, same table the certification course reads from.
      await supabase.from('wcm_cert_users').upsert(
        {
          user_id: data.user.id,
          email: email.toLowerCase(),
          full_name: fullName,
          department: department || null,
          is_admin: false,
        },
        { onConflict: 'user_id' }
      )

      // Enroll into the real permissions system (acl_member_roles + the wcm
      // group), this is what actually makes them a WCM in the system rather
      // than just someone with a certification-course profile.
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (accessToken) {
        await fetch('/api/bcps/wcm-pilot-register', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        }).catch(() => { /* best effort, follow up manually if this fails */ })
      }

      setStep('done')
    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="wp-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="wp-page-topbar">
        <WcmPilotHeader />
      </div>

      <div className="wp-page-body" style={{ background: '#f0f4f8' }}>
        <div style={styles.wrap}>
          {step === 'intro' && (
            <div style={styles.card}>
              <p style={styles.eyebrow}>WCM Pilot Program</p>
              <h1 style={styles.title}>Before You Register</h1>
              <p style={styles.body}>
                Creating your account enrolls you as a Department Web Content Manager in the WCM Pilot
                Program. Here is what happens next.
              </p>
              <ol style={styles.steps}>
                <li style={styles.step}>
                  <span style={styles.stepNum}>1</span>
                  <span>You create your account with your BCPS email and a password.</span>
                </li>
                <li style={styles.step}>
                  <span style={styles.stepNum}>2</span>
                  <span>You are enrolled as a Web Content Manager, this is separate from and comes before the certification course.</span>
                </li>
                <li style={styles.step}>
                  <span style={styles.stepNum}>3</span>
                  <span>You will be directed to log in and complete the Department WCM Certification course at your own pace.</span>
                </li>
              </ol>
              <button style={styles.btn} onClick={() => setStep('form')}>
                Continue to Registration
              </button>
              <p style={styles.note}>Access restricted to @browardschools.com addresses.</p>
            </div>
          )}

          {step === 'form' && (
            <div style={styles.card}>
              <p style={styles.eyebrow}>WCM Pilot Program</p>
              <h1 style={styles.title}>Create Your Account</h1>
              <p style={styles.subtitle}>Department Web Content Manager - Broward County Public Schools</p>

              <form onSubmit={handleSubmit} style={styles.form}>
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
                  placeholder="Create a password (min 8 characters)"
                  minLength={8}
                  required
                />
                {error && <p style={styles.error}>{error}</p>}
                <button style={styles.btn} type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : 'Create Account'}
                </button>
              </form>
              <p style={styles.note}>Access restricted to @browardschools.com addresses.</p>
            </div>
          )}

          {step === 'done' && (
            <div style={styles.card}>
              <h1 style={styles.title}>You&apos;re Enrolled</h1>
              <p style={styles.body}>
                Your WCM Pilot Program account has been created. Next, log in to complete the Department
                WCM Certification course.
              </p>
              <a href="/certification/login" style={styles.btnLink}>
                Continue to Certification Login
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { width: '100%', maxWidth: 440 },
  card: { background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '40px 36px' },
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#1672A7', margin: '0 0 8px', textAlign: 'center' },
  title: { fontSize: 22, fontWeight: 700, color: '#0e4e73', margin: '0 0 4px', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 20, marginTop: 0 },
  body: { fontSize: 13.5, color: '#444', lineHeight: 1.65, margin: '0 0 20px', textAlign: 'center' },
  steps: { listStyle: 'none', margin: '0 0 26px', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#333', lineHeight: 1.5 },
  stepNum: { flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#1672A7', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4, marginTop: 12 },
  input: { border: '1px solid #d0d9e3', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: '#222', outline: 'none', width: '100%', boxSizing: 'border-box' },
  btn: { marginTop: 20, padding: '12px 0', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' },
  btnLink: { display: 'block', marginTop: 8, padding: '12px 0', background: '#1672A7', color: '#fff', borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'center', textDecoration: 'none' },
  error: { color: '#c0392b', fontSize: 13, marginTop: 8, marginBottom: 0 },
  note: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 16, marginBottom: 0 },
}
