import type { SupabaseClient } from '@supabase/supabase-js'
import type { GuideAudience, GuideDef } from './types'

// Role-aware department guides (Sean, 2026-11-03). A department guide is one
// page for everyone on a department's team. A section or tab marked
// for: ['wcm'] is sent only to that department's Web Content Managers, one
// marked for: ['director'] only to its director (or an executive it reports
// to, or Department Oversight), and one with no "for" to everyone. An admin
// or SuperAdmin gets all of it, so the team can see the whole guide.
//
// The department is the one whose slug is the guide's slug. A guide with no
// matching department, or no "for" marks, is returned as it is.

export type GuideViewer = 'all' | Set<GuideAudience>

export async function viewerAudiences(
  db: SupabaseClient,
  slug: string,
  who: { userId: string; email: string },
): Promise<GuideViewer> {
  const { data: roleRow } = await db.from('acl_member_roles').select('role').eq('user_id', who.userId).eq('brand', 'bcps').maybeSingle()
  if (roleRow?.role === 'admin' || roleRow?.role === 'superadmin') return 'all'

  const out = new Set<GuideAudience>()
  const email = who.email.trim().toLowerCase()
  const { data: dept } = await db.from('bcps_departments').select('id, director_email, executive_emails').eq('slug', slug).maybeSingle()

  // Department Oversight reads every department as a director (the home route
  // gives them the Director dashboard across all of them).
  const { data: gm } = await db.from('acl_group_members').select('group_id').eq('user_id', who.userId)
  const gids = (gm ?? []).map((g) => g.group_id as string)
  let oversight = false
  if (gids.length) {
    const { data: groups } = await db.from('acl_groups').select('name').eq('brand', 'bcps').in('id', gids)
    oversight = (groups ?? []).some((g) => g.name === 'Department Oversight')
  }

  if (oversight) out.add('director')
  if (!dept) return out

  const isLeader = (dept.director_email || '').trim().toLowerCase() === email
    || ((dept.executive_emails as string[] | null) ?? []).some((e) => (e || '').trim().toLowerCase() === email)
  if (isLeader) out.add('director')

  const { data: rosters } = await db.from('bcps_wcm_roster').select('id').eq('matched_department_id', dept.id)
  const rosterIds = (rosters ?? []).map((r) => r.id as string)
  if (rosterIds.length) {
    const { data: members } = await db.from('bcps_wcm_roster_members').select('wcm_email').in('roster_id', rosterIds)
    if ((members ?? []).some((m) => (m.wcm_email || '').trim().toLowerCase() === email)) out.add('wcm')
  }
  return out
}

export function filterGuide(def: GuideDef, viewer: GuideViewer): GuideDef {
  if (viewer === 'all') return def
  const ok = (f?: GuideAudience[]) => !f || f.some((a) => viewer.has(a))
  // Steps are numbered for what this person sees, so a staff member reads
  // "Step 1 of 1", not "Step 1 of 3" with two steps missing.
  let step = 0
  const tabs = def.tabs
    .filter((t) => ok(t.for))
    .map((t) => ({ ...t, sections: t.sections.filter((s) => ok(s.for)) }))
    .filter((t) => t.sections.length > 0)
    .map((t) => (t.step ? { ...t, step: ++step } : t))
  return { ...def, tabs, overview: def.overview?.filter((s) => ok(s.for)) }
}
