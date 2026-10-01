'use client'

// "Before you create this account" panel for both BCPS registration forms
// (login page Register tab, /wcm-registration/register). Stops a person from
// ending up with a second account that has none of their certification on it
// (error_registry BCPS-CERT-DUPLICATE-ACCOUNT). Backed by /api/bcps/account-check.
// Advisory: "Create it anyway" always works, so a false match never locks
// anyone out.

export interface AccountWarning {
  kind: 'employee_id' | 'existing_name'
  masked_email?: string
}

// Returns the warnings for this email and name. A failed check returns none,
// so registration is never blocked by this check being down.
export async function checkAccount(email: string, fullName: string): Promise<AccountWarning[]> {
  try {
    const res = await fetch('/api/bcps/account-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName }),
    })
    if (!res.ok) return []
    const j = await res.json()
    return Array.isArray(j.warnings) ? j.warnings : []
  } catch {
    return []
  }
}

export default function DuplicateAccountWarning({ warnings, onSignIn, signInHref, onContinue, onChangeEmail }: {
  warnings: AccountWarning[]
  onSignIn?: () => void
  signInHref?: string
  onContinue: () => void
  onChangeEmail: () => void
}) {
  if (!warnings.length) return null
  const existing = warnings.find((w) => w.kind === 'existing_name')
  const employeeId = warnings.some((w) => w.kind === 'employee_id')
  const btn: React.CSSProperties = {
    display: 'inline-block', padding: '9px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit', border: '1px solid #1672A7',
  }
  return (
    <div role="alert" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '14px 16px', marginBottom: '16px', color: '#78350f', fontSize: '13px', lineHeight: 1.55 }}>
      <strong style={{ display: 'block', fontSize: '14px', marginBottom: '6px', color: '#111827' }}>Before you create this account</strong>
      {existing && (
        <p style={{ margin: '0 0 8px' }}>
          There is already an account under your name: <strong>{existing.masked_email}</strong>.
          Sign in with that one so your certification and progress stay with you.
        </p>
      )}
      {employeeId && (
        <p style={{ margin: '0 0 8px' }}>
          This looks like your employee ID address. Please register with your name address
          (for example first.last@browardschools.com), the one on your department&apos;s roster.
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
        {existing && (signInHref
          ? <a href={signInHref} style={{ ...btn, background: '#1672A7', color: '#fff' }}>Sign in instead</a>
          : <button type="button" onClick={onSignIn} style={{ ...btn, background: '#1672A7', color: '#fff' }}>Sign in instead</button>)}
        {employeeId && !existing && (
          <button type="button" onClick={onChangeEmail} style={{ ...btn, background: '#1672A7', color: '#fff' }}>Use my name address</button>
        )}
        <button type="button" onClick={onContinue} style={{ ...btn, background: '#fff', color: '#1672A7' }}>
          {existing ? 'That is not me, create it anyway' : 'Create it anyway'}
        </button>
      </div>
    </div>
  )
}
