import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.LESARUSS_SUPABASE_URL!,
  process.env.LESARUSS_SUPABASE_SERVICE_KEY!
)

// Runs before a new BCPS account is created (both registration forms), so a
// person does not end up with a second account that has none of their
// certification on it (Sean, 2026-10-01; error_registry
// BCPS-CERT-DUPLICATE-ACCOUNT: Vince Watson and Leon Clinch were certified on
// one account and signing in on another).
//
// Two checks, both advisory: the form shows the warning and the person can
// still continue, so nobody is locked out by a false match.
//   employee_id   - the email is an employee-ID address (p00028746@...).
//                   District staff all have a name address, which is what the
//                   roster and the director lists use.
//   existing_name - an account with the same full name already exists under a
//                   different @browardschools.com address. Only a masked
//                   address goes back (v***.w***@browardschools.com), and only
//                   BCPS accounts are considered, never other brands' users.
//
// Public on purpose (the person is not signed in yet). It returns nothing a
// staff directory does not already show, and never a full address or an id.

const EMPLOYEE_ID = /^p\d{5,}@browardschools\.com$/i

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const masked = local.split(/([._-])/).map((part) => (/^[._-]$/.test(part) || !part ? part : `${part[0]}***`)).join('')
  return `${masked}@${domain}`
}

export async function POST(req: Request) {
  let body: { email?: unknown; full_name?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad request' }, { status: 400 }) }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName = typeof body.full_name === 'string' ? normName(body.full_name) : ''
  if (!email || email.length > 200 || fullName.length > 120) return NextResponse.json({ error: 'bad request' }, { status: 400 })

  const warnings: { kind: 'employee_id' | 'existing_name'; masked_email?: string }[] = []
  if (EMPLOYEE_ID.test(email)) warnings.push({ kind: 'employee_id' })

  // Two words minimum, so a first name alone never matches someone.
  if (fullName.split(' ').length >= 2) {
    const { data, error } = await supabase
      .from('wcm_cert_users')
      .select('email, full_name')
      .ilike('email', '%@browardschools.com')
      .ilike('full_name', fullName.replace(/[%_]/g, '').split(' ').join('%'))
      .limit(20)
    if (error) return NextResponse.json({ warnings })
    const others = Array.from(new Set((data ?? [])
      .filter((r) => r.full_name && normName(r.full_name) === fullName)
      .map((r) => (r.email as string).toLowerCase())
      .filter((e) => e !== email)))
    // Prefer showing a name address over another employee-ID one.
    others.sort((a, b) => Number(EMPLOYEE_ID.test(a)) - Number(EMPLOYEE_ID.test(b)))
    if (others.length) warnings.push({ kind: 'existing_name', masked_email: maskEmail(others[0]) })
  }

  return NextResponse.json({ warnings })
}
