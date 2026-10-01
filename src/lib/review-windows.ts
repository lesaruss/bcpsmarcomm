// Division-by-division department review windows (Sean, 2026-10-01). Every
// department website is reviewed with its director and WCM once per school
// year, July 1 to June 30, in three windows. The first window covers the
// priority divisions. A new cycle starts each July 1 in the same order, and
// is lighter because most of the work is done the first year.
//
// Division names match bcps_departments.division exactly. Shown on the
// director dashboard (Website Review tab) and mirrored on the Web Team
// Assignments page (Division-by-Division Department Reviews row); change
// both together.

export interface ReviewWindow {
  id: 1 | 2 | 3
  label: string
  start: string // YYYY-MM-DD, local school calendar date
  end: string
  divisions: string[]
}

export const REVIEW_CYCLE = '2026-27'

export const REVIEW_WINDOWS: ReviewWindow[] = [
  { id: 1, label: 'Window 1', start: '2026-10-01', end: '2026-12-18', divisions: ['Human Resources', 'Student Services', 'Academics', 'Chief of Staff'] },
  { id: 2, label: 'Window 2', start: '2027-01-11', end: '2027-03-31', divisions: ['Finance', 'Strategy & Operations', 'Facilities', 'Safety & Security'] },
  { id: 3, label: 'Window 3', start: '2027-04-01', end: '2027-06-30', divisions: ['Information Systems', 'Learning Communities', 'Independent Offices'] },
]

export const NEXT_CYCLE_START = '2027-07-01'

export function windowForDivision(division: string | null | undefined): ReviewWindow | null {
  if (!division) return null
  return REVIEW_WINDOWS.find((w) => w.divisions.includes(division)) ?? null
}

// 'open' while today falls inside the window, 'upcoming' before it, 'closed'
// after. Compared as calendar dates so a window is open through its last day.
export function windowState(w: ReviewWindow, today: Date = new Date()): 'upcoming' | 'open' | 'closed' {
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (d < w.start) return 'upcoming'
  if (d > w.end) return 'closed'
  return 'open'
}

export function formatWindowDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatWindowRange(w: ReviewWindow): string {
  return `${formatWindowDate(w.start)} to ${formatWindowDate(w.end)}`
}
