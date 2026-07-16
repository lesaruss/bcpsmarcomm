import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

// Generic words we ignore when scoring name similarity, so "COMMUNICATIONS"
// vs "MARKETING & STRATEGIC COMMUNICATIONS" scores on the word that actually
// carries meaning, not on connector words every department name shares.
const STOPWORDS = new Set([
  'OF', 'THE', 'AND', 'FOR', 'TO', 'A', 'AN', 'OFFICE', 'DEPARTMENT', 'DEPT',
  'SERVICE', 'SERVICES', 'MANAGEMENT', 'MGMT', 'PROGRAM', 'PROGRAMS', 'CHIEF',
])

function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 &/]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
}

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  const shared = a.filter(w => setB.has(w))
  return shared.length / Math.min(a.length, b.length)
}

interface DeptRow {
  id: string
  name: string
  division: string | null
  director_name: string | null
  wcm_name: string | null
}
interface RosterRow {
  id: string
  department_name: string
  location_number: string | null
  matched_department_id: string | null
}

// Compares the two name sources behind the WCM Pilot / Roster Signup
// department picker: bcps_departments (the org-chart-derived "profile" list,
// 64 rows) vs bcps_wcm_roster (the dropdown's own list, 143 rows, linked back
// to bcps_departments via matched_department_id where a match already exists).
// Surfaces matched pairs, both sides' unmatched rows, and best-guess
// consolidation candidates for anything unmatched - Sean decides which
// candidates are real duplicates, this only suggests.
export async function GET() {
  const { data: depts, error: dErr } = await svc
    .from('bcps_departments')
    .select('id, name, division, director_name, wcm_name')
    .order('name')
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

  const { data: roster, error: rErr } = await svc
    .from('bcps_wcm_roster')
    .select('id, department_name, location_number, matched_department_id')
    .order('department_name')
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })

  const deptRows = (depts ?? []) as DeptRow[]
  const rosterRows = (roster ?? []) as RosterRow[]

  const deptById = new Map(deptRows.map(d => [d.id, d]))
  const unmatchedDeptIds = new Set(deptRows.map(d => d.id))

  const matched: Array<{
    dept_id: string; dept_name: string; division: string | null
    director_name: string | null; wcm_name: string | null
    roster_id: string; roster_name: string; location_number: string | null
  }> = []

  for (const r of rosterRows) {
    if (r.matched_department_id && deptById.has(r.matched_department_id)) {
      unmatchedDeptIds.delete(r.matched_department_id)
      const d = deptById.get(r.matched_department_id)!
      matched.push({
        dept_id: d.id, dept_name: d.name, division: d.division,
        director_name: d.director_name, wcm_name: d.wcm_name,
        roster_id: r.id, roster_name: r.department_name, location_number: r.location_number,
      })
    }
  }

  const unmatchedRoster = rosterRows.filter(r => !r.matched_department_id)
  const unmatchedDept = deptRows.filter(d => unmatchedDeptIds.has(d.id))

  const deptTokenIndex = deptRows.map(d => ({ id: d.id, name: d.name, tokens: tokens(d.name) }))

  const unmatchedRosterWithSuggestions = unmatchedRoster.map(r => {
    const rTokens = tokens(r.department_name)
    const suggestions = deptTokenIndex
      .map(d => ({ dept_id: d.id, dept_name: d.name, score: overlapScore(rTokens, d.tokens) }))
      .filter(s => s.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
    return {
      id: r.id,
      department_name: r.department_name,
      location_number: r.location_number,
      suggestions,
    }
  })

  return NextResponse.json({
    matched,
    unmatchedRoster: unmatchedRosterWithSuggestions,
    unmatchedDept,
    counts: {
      departments: deptRows.length,
      roster: rosterRows.length,
      matched: matched.length,
      unmatchedRoster: unmatchedRoster.length,
      unmatchedDept: unmatchedDept.length,
    },
  })
}
