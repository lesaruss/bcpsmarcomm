import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { MODULES, COURSE_ID, getTotalPages } from '@/lib/cert-data'

export default async function AdminDashboard() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/bcps/certification/login')

  const { data: adminCheck } = await supabase.from('wcm_cert_users').select('is_admin').eq('user_id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/bcps/certification/departments')

  const [usersRes, progressRes, certsRes] = await Promise.all([
    supabase.from('wcm_cert_users').select('user_id,email,full_name,department,created_at').eq('is_admin', false).order('created_at', { ascending: false }),
    supabase.from('wcm_cert_progress').select('user_id,module_id,page_id,completed').eq('course_id', COURSE_ID),
    supabase.from('wcm_certifications').select('user_id,issued_at,expires_at').eq('course_id', COURSE_ID),
  ])

  const users = usersRes.data || []
  const allProgress = progressRes.data || []
  const certMap = new Map((certsRes.data || []).map(c => [c.user_id, c]))
  const totalPages = getTotalPages()

  const userStats = users.map(u => {
    const uProgress = allProgress.filter(p => p.user_id === u.user_id)
    const completedCount = uProgress.filter(p => p.completed).length
    const pct = Math.round((completedCount / totalPages) * 100)
    const cert = certMap.get(u.user_id)

    const modProgress = MODULES.map(m => {
      const mPages = m.pages.length
      const mDone = uProgress.filter(p => p.module_id === m.id && p.completed).length
      return { id: m.id, number: m.number, title: m.title, done: mDone, total: mPages }
    })

    // Find current module (first not fully complete)
    const currentMod = modProgress.find(m => m.done < m.total) || modProgress[modProgress.length - 1]

    return { ...u, completedCount, pct, cert, currentMod, modProgress }
  })

  return (
    <div style={S.page}>
      <header style={S.header}>
        <img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" style={{ height: 40, width: "auto" }} />
        <div>
          <span style={S.headerTitle}>Admin - WCM Certification Dashboard</span>
          <span style={S.headerSub}>Department - Broward County Public Schools</span>
        </div>
        <Link href="/bcps/certification/departments" style={S.backBtn}>My Progress</Link>
      </header>

      <main style={S.main}>
        <div style={S.statsRow}>
          <div style={S.stat}><span style={S.statNum}>{users.length}</span><span style={S.statLabel}>Enrolled</span></div>
          <div style={S.stat}><span style={S.statNum}>{certMap.size}</span><span style={S.statLabel}>Certified</span></div>
          <div style={S.stat}><span style={S.statNum}>{users.filter(u => { const up = allProgress.filter(p => p.user_id === u.user_id); return up.some(p => p.completed) && !certMap.has(u.user_id) }).length}</span><span style={S.statLabel}>In Progress</span></div>
        </div>

        <table style={S.table}>
          <thead>
            <tr style={S.thead}>
              <th style={S.th}>Name</th>
              <th style={S.th}>Department</th>
              <th style={S.th}>Progress</th>
              <th style={S.th}>Current Module</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {userStats.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#888', fontSize: 14 }}>No learners enrolled yet.</td></tr>
            )}
            {userStats.map(u => (
              <tr key={u.user_id} style={S.tr}>
                <td style={S.td}>
                  <div style={{ fontWeight: 600, color: '#0e4e73' }}>{u.full_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{u.email}</div>
                </td>
                <td style={S.td}><span style={{ fontSize: 13 }}>{u.department || '-'}</span></td>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={S.pBar}><div style={{ ...S.pFill, width: `${u.pct}%` }} /></div>
                    <span style={{ fontSize: 12, color: '#555', minWidth: 32 }}>{u.pct}%</span>
                  </div>
                </td>
                <td style={S.td}>
                  <span style={{ fontSize: 13, color: '#333' }}>
                    {u.completedCount === 0 ? 'Not started' : u.cert ? 'Completed' : `Mod ${u.currentMod.number}: ${u.currentMod.title.substring(0, 30)}${u.currentMod.title.length > 30 ? '...' : ''}`}
                  </span>
                </td>
                <td style={S.td}>
                  {u.cert ? (
                    <span style={S.badgeCert}>Certified</span>
                  ) : u.completedCount > 0 ? (
                    <span style={S.badgeProgress}>In Progress</span>
                  ) : (
                    <span style={S.badgeNew}>Enrolled</span>
                  )}
                </td>
                <td style={S.td}><span style={{ fontSize: 12, color: '#888' }}>{new Date(u.created_at).toLocaleDateString()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <details style={S.details}>
          <summary style={S.summary}>Module-by-Module Completion</summary>
          <table style={{ ...S.table, marginTop: 12 }}>
            <thead>
              <tr style={S.thead}>
                <th style={S.th}>Name</th>
                {MODULES.map(m => <th key={m.id} style={{ ...S.th, fontSize: 10, padding: '8px 6px' }}>M{m.number}</th>)}
              </tr>
            </thead>
            <tbody>
              {userStats.map(u => (
                <tr key={u.user_id} style={S.tr}>
                  <td style={S.td}><span style={{ fontSize: 13, fontWeight: 600 }}>{u.full_name || u.email}</span></td>
                  {u.modProgress.map(m => (
                    <td key={m.id} style={{ ...S.td, textAlign: 'center', background: m.done === m.total ? '#edf7ed' : m.done > 0 ? '#e8f4fd' : '#fff' }}>
                      <span style={{ fontSize: 11, color: m.done === m.total ? '#16750C' : '#1672A7' }}>{m.done}/{m.total}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </main>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Montserrat', sans-serif" },
  header: { background: '#fff', borderBottom: '3px solid #1672A7', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 16 },
  headerTitle: { display: 'block', fontSize: 16, fontWeight: 700, color: '#0e4e73' },
  headerSub: { display: 'block', fontSize: 11, color: '#888' },
  backBtn: { marginLeft: 'auto', fontSize: 13, color: '#1672A7', fontWeight: 600, textDecoration: 'none' },
  main: { maxWidth: 1200, margin: '0 auto', padding: 32 },
  statsRow: { display: 'flex', gap: 16, marginBottom: 28 },
  stat: { background: '#fff', borderRadius: 10, padding: '18px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 120 },
  statNum: { fontSize: 32, fontWeight: 900, color: '#0e4e73' },
  statLabel: { fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  table: { width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  thead: { background: '#0e4e73' },
  th: { padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  tr: { borderBottom: '1px solid #f0f4f8' },
  td: { padding: '14px 16px', verticalAlign: 'middle' },
  pBar: { background: '#e8eef4', borderRadius: 4, height: 8, width: 80, overflow: 'hidden' },
  pFill: { background: '#1672A7', height: '100%', borderRadius: 4 },
  badgeCert: { background: '#edf7ed', color: '#16750C', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  badgeProgress: { background: '#e8f4fd', color: '#1672A7', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  badgeNew: { background: '#f5f5f5', color: '#888', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 12 },
  details: { marginTop: 28 },
  summary: { fontSize: 14, fontWeight: 700, color: '#0e4e73', cursor: 'pointer', marginBottom: 4 },
}
