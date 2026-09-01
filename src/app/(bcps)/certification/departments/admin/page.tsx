import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { MODULES, COURSE_ID, getTotalPages } from '@/lib/cert-data'
import { createServiceClient } from '@/lib/supabase-admin'

export default async function AdminDashboard() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (s) => s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: adminCheck } = await supabase.from('wcm_cert_users').select('is_admin').eq('user_id', user.id).single()
  if (!adminCheck?.is_admin) redirect('/certification/departments')

  const [usersRes, progressRes, certsRes] = await Promise.all([
    supabase.from('wcm_cert_users').select('user_id,email,full_name,department,created_at').eq('is_admin', false).order('created_at', { ascending: false }),
    supabase.from('wcm_cert_progress').select('user_id,module_id,page_id,completed,submission_text,submission_file_path,submission_file_name').eq('course_id', COURSE_ID),
    supabase.from('wcm_certifications').select('user_id,issued_at,expires_at').eq('course_id', COURSE_ID),
  ])

  const users = usersRes.data || []
  const allProgress = progressRes.data || []
  const certMap = new Map((certsRes.data || []).map(c => [c.user_id, c]))
  const totalPages = getTotalPages()

  // Assignment submissions (Module 9 PDF review, Final Assignment audit,
  // Submit Badge Evidence) so the Office of Communications has somewhere
  // to actually read what WCMs wrote - previously nothing captured this
  // text at all (Kristin Kupetsky, 2026-08-20). Attached files (added
  // 2026-09-01, Sean live in Hot Lab: WCMs had no way to submit the PDF
  // itself alongside their written review) live in the private
  // bcps-client bucket, so each is read back here via a short-lived
  // signed URL using the service role rather than making the bucket
  // public.
  const svc = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const withFiles = (allProgress || []).filter((p: { submission_file_path: string | null }) => p.submission_file_path)
  const signedUrlByPath = new Map<string, string>()
  await Promise.all(withFiles.map(async (p: { submission_file_path: string | null }) => {
    if (!p.submission_file_path) return
    const { data } = await svc.storage.from('bcps-client').createSignedUrl(p.submission_file_path, 3600)
    if (data?.signedUrl) signedUrlByPath.set(p.submission_file_path, data.signedUrl)
  }))

  const submissions = (allProgress || [])
    .filter((p: { submission_text: string | null; submission_file_path: string | null }) => (p.submission_text && p.submission_text.trim().length > 0) || p.submission_file_path)
    .map((p: { user_id: string; module_id: string; page_id: string; submission_text: string | null; submission_file_path: string | null; submission_file_name: string | null }) => {
      const u = users.find(usr => usr.user_id === p.user_id)
      const modu = MODULES.find(m => m.id === p.module_id)
      const pageTitle = modu?.pages.find(pg => pg.id === p.page_id)?.title || p.page_id
      return {
        userLabel: u?.full_name || u?.email || p.user_id,
        pageTitle,
        text: p.submission_text as string | null,
        fileName: p.submission_file_name,
        fileUrl: p.submission_file_path ? signedUrlByPath.get(p.submission_file_path) || null : null,
      }
    })

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
        <Link href="/certification/departments/course/mod1/welcome" style={{ ...S.backBtn, marginLeft: 'auto' }}>Preview Course Content</Link>
        <Link href="/certification/departments" style={S.backBtn}>My Progress</Link>
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

        <details style={S.details}>
          <summary style={S.summary}>Assignment Submissions ({submissions.length})</summary>
          {submissions.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888', marginTop: 8 }}>No assignment submissions yet.</p>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {submissions.map((s, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0e4e73' }}>{s.userLabel} <span style={{ fontWeight: 400, color: '#888' }}>&mdash; {s.pageTitle}</span></div>
                  {s.text && <p style={{ fontSize: 13, color: '#333', margin: '6px 0 0', whiteSpace: 'pre-wrap' as const }}>{s.text}</p>}
                  {s.fileName && (
                    s.fileUrl ? (
                      <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 700, color: '#1672A7', textDecoration: 'none' }}>
                        &#128206; {s.fileName} (opens in a new tab, link valid for 1 hour)
                      </a>
                    ) : (
                      <span style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, color: '#888' }}>&#128206; {s.fileName} (link unavailable - refresh this page)</span>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
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
  backBtn: { fontSize: 13, color: '#1672A7', fontWeight: 600, textDecoration: 'none' },
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
