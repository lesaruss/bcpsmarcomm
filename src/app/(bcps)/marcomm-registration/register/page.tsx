'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import '../../wcm-registration/wcm-registration.css'
import MarcommHeader, { MARCOMM_HOME, MARCOMM_LOGIN } from '../MarcommHeader'
import DuplicateAccountWarning, { checkAccount, type AccountWarning } from '@/components/DuplicateAccountWarning'

// MarComm Meeting account creation (Sean, 2026-10-16). Same form and checks as
// /wcm-registration/register, minus the department picker and the
// certification course. After the account exists, /api/bcps/marcomm-register
// adds MarComm Assignments access when the email is on the Marcomm Meeting
// roster. Someone who already has an account and is signed in skips the form
// and just has access added.
type Enroll = { ok?: boolean; on_roster?: boolean; name?: string; error?: string }

async function enroll(token: string): Promise<Enroll> {
  try {
    const res = await fetch('/api/bcps/marcomm-register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    return await res.json()
  } catch {
    return { error: 'Could not reach the server. Please try again.' }
  }
}

export default function MarcommRegistrationRegisterPage() {
  const [step, setStep] = useState<'checking' | 'signedin' | 'form' | 'done'>('checking')
  const [signedInEmail, setSignedInEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [warnings, setWarnings] = useState<AccountWarning[]>([])
  const [result, setResult] = useState<Enroll | null>(null)
  // True when signUp returned no session ("Confirm email" on). Off on this
  // project today; kept so the done step stays correct if that changes.
  const [needsConfirm, setNeedsConfirm] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session
      if (s?.user?.email) { setSignedInEmail(s.user.email); setStep('signedin') }
      else setStep('form')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAccessToSignedIn() {
    setError('')
    setLoading(true)
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) { setLoading(false); setStep('form'); return }
    const r = await enroll(token)
    setLoading(false)
    if (r.error) { setError(r.error); return }
    setResult(r)
    setStep('done')
  }

  async function signOutAndRegister() {
    await supabase.auth.signOut()
    setSignedInEmail('')
    setStep('form')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void runSubmit(false)
  }

  async function runSubmit(skipCheck: boolean) {
    setError('')
    setWarnings([])
    if (!email.toLowerCase().endsWith('@browardschools.com')) {
      setError('Access is restricted to @browardschools.com email addresses.')
      return
    }
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }

    setLoading(true)
    if (!skipCheck) {
      const found = await checkAccount(email, fullName)
      if (found.length) {
        setWarnings(found)
        setLoading(false)
        return
      }
    }
    try {
      // emailRedirectTo keeps any auth email on the BCPS brand (see the same
      // note in wcm-registration/register).
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}${MARCOMM_LOGIN}`,
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('Registration did not return an account. Please try again.')

      if (data.session) {
        const r = await enroll(data.session.access_token)
        if (r.error) throw new Error(r.error)
        setResult(r)
      } else {
        // No session until they confirm; access is added when they come back
        // through the login link, which returns them to this page signed in.
        setNeedsConfirm(true)
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
        <MarcommHeader />
      </div>

      <div className="wp-page-body" style={{ background: '#f0f4f8' }}>
        <div style={styles.wrap}>
          {step === 'checking' && (
            <div style={styles.card}><p style={styles.body}>Loading...</p></div>
          )}

          {step === 'signedin' && (
            <div style={styles.card}>
              <p style={styles.eyebrow}>MarComm Meeting</p>
              <h1 style={styles.title}>You Already Have an Account</h1>
              <p style={styles.body}>
                You are signed in as <strong>{signedInEmail}</strong>. Add MarComm Assignments to this account.
              </p>
              {error && <p style={styles.error}>{error}</p>}
              <button style={styles.btn} onClick={addAccessToSignedIn} disabled={loading}>
                {loading ? 'Please wait...' : 'Add MarComm Access'}
              </button>
              <p style={styles.note}>
                Not you? <button type="button" onClick={signOutAndRegister} style={styles.linkBtn}>Sign out and create a new account</button>
              </p>
            </div>
          )}

          {step === 'form' && (
            <div style={styles.card}>
              <p style={styles.eyebrow}>MarComm Meeting</p>
              <h1 style={styles.title}>Create Your Account</h1>
              <p style={styles.subtitle}>MarComm Assignments - Broward County Public Schools</p>

              <form onSubmit={handleSubmit} style={styles.form}>
                <label style={styles.label}>Full Name *</label>
                <input
                  style={styles.input}
                  type="text"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setWarnings([]) }}
                  placeholder="First Last"
                  required
                />
                <label style={styles.label}>Email *</label>
                <input
                  style={styles.input}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setWarnings([]) }}
                  placeholder="john.doe@browardschools.com"
                  required
                />
                <p style={styles.help}>
                  Your name-based BCPS email, not your P-number. Use the one on the Marcomm Meeting invitation so your items match.
                </p>
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
                <DuplicateAccountWarning
                  warnings={warnings}
                  signInHref={MARCOMM_LOGIN}
                  onChangeEmail={() => { setWarnings([]); setEmail('') }}
                  onContinue={() => { void runSubmit(true) }}
                />
                {error && <p style={styles.error}>{error}</p>}
                <button style={styles.btn} type="submit" disabled={loading}>
                  {loading ? 'Please wait...' : 'Create Account'}
                </button>
              </form>
              <p style={styles.note}>
                Already have an account? <a href={MARCOMM_LOGIN} style={styles.textLink}>Log in</a> and your MarComm access is added.
              </p>
              <p style={styles.note}>Access restricted to @browardschools.com addresses.</p>
            </div>
          )}

          {step === 'done' && (
            <div style={styles.card}>
              {needsConfirm ? (
                <>
                  <h1 style={styles.title}>Check Your Email</h1>
                  <p style={styles.body}>
                    Your account is created. Before you can log in, open the confirmation email sent to <strong>{email}</strong> and click the link in it.
                  </p>
                  <a href={MARCOMM_LOGIN} style={styles.btnLink}>Continue to Log In</a>
                </>
              ) : result?.on_roster ? (
                <>
                  <h1 style={styles.title}>You&apos;re In{result.name ? `, ${result.name.split(' ')[0]}` : ''}</h1>
                  <p style={styles.body}>
                    MarComm Assignments is open to you. Click <strong>My items</strong> to see the requests you lead or support, then open one to update its status or add a note.
                  </p>
                  <a href={MARCOMM_HOME} style={styles.btnLink}>Open MarComm Assignments</a>
                </>
              ) : (
                <>
                  <h1 style={styles.title}>Account Ready, Access Pending</h1>
                  <p style={styles.body}>
                    Your account works, but <strong>{signedInEmail || email}</strong> is not on the Marcomm Meeting list yet, so MarComm Assignments is not open to you.
                    Ask Sean Russell to add you to the list, then come back to this page and sign in. Your access is added then.
                  </p>
                  <a href="/" style={styles.btnLink}>Go to bcpsmarcomm.com</a>
                </>
              )}
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
  title: { fontSize: 22, fontWeight: 700, color: '#0e4e73', margin: '0 0 12px', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 20, marginTop: 0 },
  body: { fontSize: 13.5, color: '#444', lineHeight: 1.65, margin: '0 0 20px', textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4, marginTop: 12 },
  input: { border: '1px solid #d0d9e3', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: '#222', outline: 'none', width: '100%', boxSizing: 'border-box' },
  help: { fontSize: 12, color: '#666', marginTop: 6, marginBottom: 4 },
  textLink: { color: '#1672A7', fontWeight: 700, textDecoration: 'underline' },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#1672A7', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 11 },
  btn: { marginTop: 20, padding: '12px 0', background: '#1672A7', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%' },
  btnLink: { display: 'block', marginTop: 8, padding: '12px 0', background: '#1672A7', color: '#fff', borderRadius: 6, fontSize: 15, fontWeight: 700, textAlign: 'center', textDecoration: 'none' },
  error: { color: '#c0392b', fontSize: 13, marginTop: 8, marginBottom: 0 },
  note: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 16, marginBottom: 0 },
}
