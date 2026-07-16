import Link from 'next/link'

export default function WCMPilotWelcomePage() {
  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.introCard}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img
              src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png"
              alt="Broward County Public Schools"
              style={{ height: 56, objectFit: 'contain' }}
            />
          </div>

          <p style={styles.eyebrow}>WCM Pilot Program</p>
          <h1 style={styles.title}>Welcome to the Web Content Manager Pilot</h1>
          <p style={styles.body}>
            This is your starting point as a Department Web Content Manager. Create your account, then
            complete the Department WCM Certification course. Once certified, you will have access to your
            department&apos;s WCM audit portal.
          </p>

          <ol style={styles.steps}>
            <li style={styles.step}>
              <span style={styles.stepNum}>1</span>
              <span>Create your account with your BCPS email address.</span>
            </li>
            <li style={styles.step}>
              <span style={styles.stepNum}>2</span>
              <span>Complete the Department WCM Certification course at your own pace.</span>
            </li>
            <li style={styles.step}>
              <span style={styles.stepNum}>3</span>
              <span>Get access to your department&apos;s WCM audit portal and checklist.</span>
            </li>
          </ol>

          <Link href="/certification/login" style={styles.cta}>
            Get Started
          </Link>

          <p style={styles.note}>Access restricted to @browardschools.com addresses.</p>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Montserrat', sans-serif" },
  wrap: { width: '100%', maxWidth: 440 },
  introCard: { background: '#fff', borderRadius: 12, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: '40px 36px', borderLeft: '4px solid #1672A7' },
  eyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#1672A7', margin: '0 0 8px', textAlign: 'center' },
  title: { fontSize: 22, fontWeight: 800, color: '#0e4e73', margin: '0 0 12px', lineHeight: 1.25, textAlign: 'center' },
  body: { fontSize: 13.5, color: '#444', lineHeight: 1.65, margin: '0 0 22px', textAlign: 'center' },
  steps: { listStyle: 'none', margin: '0 0 28px', padding: 0, display: 'flex', flexDirection: 'column', gap: 14 },
  step: { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13.5, color: '#333', lineHeight: 1.5 },
  stepNum: { flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: '#1672A7', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cta: { display: 'block', textAlign: 'center', padding: '12px 0', background: '#1672A7', color: '#fff', borderRadius: 6, fontSize: 15, fontWeight: 700, textDecoration: 'none' },
  note: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 16, marginBottom: 0 },
}
