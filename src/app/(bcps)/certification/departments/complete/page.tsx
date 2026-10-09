import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { COURSE_ID } from '@/lib/cert-data'

export default async function CompletePage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => { try { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { /* server component: middleware.ts refreshes the session */ } } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [certRes, userRes] = await Promise.all([
    supabase.from('wcm_certifications').select('issued_at,expires_at').eq('user_id', user.id).eq('course_id', COURSE_ID).maybeSingle(),
    supabase.from('wcm_cert_users').select('full_name,department').eq('user_id', user.id).maybeSingle(),
  ])

  const cert = certRes.data
  const certUser = userRes.data
  if (!cert) redirect('/certification/departments')

  const issuedDate = new Date(cert.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const expiresDate = new Date(cert.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={S.page}>
      <header style={S.header}>
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" style={{ height: 40, width: "auto" }} />
        <div>
          <span style={S.headerTitle}>WCM Certification - Department</span>
          <span style={S.headerSub}>Broward County Public Schools</span>
        </div>
      </header>

      <main style={S.main}>
        <div style={S.card}>
          {/* Official 2026 WCM Certified shield (Sean, 2026-10-06). */}
          <img src={SHIELD_SRC} alt="Broward County Public Schools Web Content Manager Certified 2026 badge" style={S.shield} />

          <h1 style={S.heading}>Congratulations!</h1>
          <p style={S.name}>{certUser?.full_name || user.email}</p>
          {certUser?.department && <p style={S.dept}>{certUser.department}</p>}
          <p style={S.body}>
            You have successfully completed the <strong>BCPS Department Web Content Manager Certification</strong>.
          </p>

          <div style={S.certInfo}>
            <div style={S.certRow}>
              <span style={S.certRowLabel}>Issued</span>
              <span style={S.certRowVal}>{issuedDate}</span>
            </div>
            <div style={S.certRow}>
              <span style={S.certRowLabel}>Expires</span>
              <span style={S.certRowVal}>{expiresDate}</span>
            </div>
            <div style={S.certRow}>
              <span style={S.certRowLabel}>Course</span>
              <span style={S.certRowVal}>Department WCM - v1</span>
            </div>
          </div>

          <p style={S.nextSteps}>
            Next: get into Finalsite to update your department page. The What&apos;s Next page walks you through it, whether you are recertifying or getting access for the first time.
          </p>

          {/* "What's Next" replaces "Get Into Finalsite" (Sean, 2026-09-29 Hot Lab): the
              brief covers more than Finalsite login. Certified WCMs are added to that
              brief's recipient list by the bcps_cert_complete_add_recipient trigger, so
              this link always opens for the person who just earned the certificate. */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/briefs/bcps-wcm-cert-complete-2026-27" style={S.dashBtn}>What&apos;s Next</a>
            <a href={SHIELD_SRC} download="BCPS-WCM-Certified-2026.png" style={S.badgeBtn}>Download badge</a>
          </div>
          <p style={S.badgeHint}>Add the badge to your email signature. In Outlook, open Signatures, then insert the downloaded image.</p>
          <div style={{ marginTop: 14, display: 'flex', gap: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/?page=dashboard" style={{ fontSize: 13, color: '#1672A7', fontWeight: 700, textDecoration: 'underline' }}>Go to Your Dashboard</Link>
            <Link href="/" style={{ fontSize: 13, color: '#888', textDecoration: 'underline' }}>Return to Dashboard</Link>
          </div>
        </div>
      </main>
    </div>
  )
}

const SHIELD_SRC = '/brand/wcm-certified-shield-2026.png'

const S: Record<string, React.CSSProperties> = {
  shield: { display: 'block', width: 200, maxWidth: '70%', height: 'auto', margin: '0 auto 24px' },
  badgeBtn: { display: 'inline-block', padding: '12px 28px', background: '#fff', color: '#1672A7', border: '2px solid #1672A7', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },
  badgeHint: { fontSize: 12, color: '#777', margin: '12px 0 0' },
  page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Montserrat', sans-serif" },
  header: { background: '#fff', borderBottom: '3px solid #1672A7', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 16 },
  headerTitle: { display: 'block', fontSize: 16, fontWeight: 700, color: '#0e4e73' },
  headerSub: { display: 'block', fontSize: 11, color: '#888' },
  main: { display: 'flex', justifyContent: 'center', padding: '60px 24px' },
  card: { background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.10)', padding: '48px 40px', maxWidth: 520, width: '100%', textAlign: 'center' },
  heading: { fontSize: 28, fontWeight: 900, color: '#16750C', margin: '0 0 8px' },
  name: { fontSize: 20, fontWeight: 700, color: '#0e4e73', margin: '0 0 4px' },
  dept: { fontSize: 13, color: '#777', margin: '0 0 16px' },
  body: { fontSize: 15, color: '#444', lineHeight: 1.6, margin: '0 0 24px' },
  certInfo: { background: '#f8fafb', border: '1px solid #e0e8ef', borderRadius: 10, padding: '16px 20px', marginBottom: 24, textAlign: 'left' },
  certRow: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #eee' },
  certRowLabel: { fontSize: 12, fontWeight: 600, color: '#888' },
  certRowVal: { fontSize: 13, fontWeight: 600, color: '#333' },
  nextSteps: { fontSize: 13, color: '#666', lineHeight: 1.6, marginBottom: 28 },
  dashBtn: { display: 'inline-block', padding: '12px 28px', background: '#1672A7', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' },
}
