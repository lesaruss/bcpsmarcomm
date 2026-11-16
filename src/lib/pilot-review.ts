// WCM Pilot Review feedback form (Sean, 2026-11-16). Fifteen school WCMs test
// the three apps named in the "You've Been Selected" letter, about 30
// minutes, then tell the District Web Team how it went before launch. The
// page (/pilot-review) and the route (/api/bcps/pilot-review) share these
// definitions so a question added here shows in the form and the results.

export const PILOT_APPS = [
  { id: 'dashboard', label: 'WCM Dashboard', help: 'Your home page after you sign in: your school, your tools, and what needs you.' },
  { id: 'banner', label: 'Banner Submission', help: 'Sending a homepage banner for your school site to the District Web Team.' },
  { id: 'proud_points', label: 'Proud Points Submission', help: 'Sending a Proud Point for your school homepage.' },
] as const
export type PilotAppId = (typeof PILOT_APPS)[number]['id']

export const TRIED = [
  { id: 'done', label: 'I finished it' },
  { id: 'partly', label: 'I started but did not finish' },
  { id: 'blocked', label: 'I could not get to it' },
  { id: 'skipped', label: 'I did not try it' },
] as const

export const SIGN_IN = [
  { id: 'smooth', label: 'It went smoothly' },
  { id: 'trouble', label: 'I had some trouble' },
  { id: 'failed', label: 'I could not sign in' },
] as const

export const TIME_SPENT = [
  { id: 'under15', label: 'Under 15 minutes' },
  { id: '15to30', label: '15 to 30 minutes' },
  { id: '30to45', label: '30 to 45 minutes' },
  { id: 'over45', label: 'More than 45 minutes' },
] as const

export const LAUNCH_READY = [
  { id: 'yes', label: 'Yes, it is ready as it is' },
  { id: 'after_fixes', label: 'Yes, after a few fixes' },
  { id: 'not_yet', label: 'Not yet' },
] as const

export const EASE_LABELS = ['Very hard', 'Hard', 'Okay', 'Easy', 'Very easy'] as const

export type AppAnswer = { tried: string; ease: number | null; confusing: string; better: string }
export type PilotAnswers = {
  sign_in: string
  sign_in_notes: string
  apps: Record<PilotAppId, AppAnswer>
  time_spent: string
  top_fix: string
  anything_else: string
}

export const emptyAnswers = (): PilotAnswers => ({
  sign_in: '', sign_in_notes: '',
  apps: Object.fromEntries(PILOT_APPS.map(a => [a.id, { tried: '', ease: null, confusing: '', better: '' }])) as Record<PilotAppId, AppAnswer>,
  time_spent: '', top_fix: '', anything_else: '',
})

const ids = <T extends readonly { id: string }[]>(list: T) => new Set(list.map(x => x.id))
const text = (v: unknown, max = 4000) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// Cleans what the browser sent into a stored answers object, or says what is
// missing. Free text is optional; the picks are required.
export function cleanAnswers(raw: unknown): { answers: PilotAnswers } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>
  const appsRaw = (r.apps ?? {}) as Record<string, Record<string, unknown>>
  const signIn = text(r.sign_in, 20)
  if (!ids(SIGN_IN).has(signIn)) return { error: 'Please tell us how signing in went.' }
  const apps = {} as Record<PilotAppId, AppAnswer>
  for (const a of PILOT_APPS) {
    const v = appsRaw[a.id] ?? {}
    const tried = text(v.tried, 20)
    if (!ids(TRIED).has(tried)) return { error: `Please tell us whether you tried ${a.label}.` }
    const ease = typeof v.ease === 'number' && v.ease >= 1 && v.ease <= 5 ? Math.round(v.ease) : null
    if ((tried === 'done' || tried === 'partly') && ease == null) return { error: `Please rate how easy ${a.label} was.` }
    apps[a.id] = { tried, ease: tried === 'done' || tried === 'partly' ? ease : null, confusing: text(v.confusing), better: text(v.better) }
  }
  const time = text(r.time_spent, 20)
  if (!ids(TIME_SPENT).has(time)) return { error: 'Please tell us about how long the review took.' }
  return { answers: { sign_in: signIn, sign_in_notes: text(r.sign_in_notes), apps, time_spent: time, top_fix: text(r.top_fix), anything_else: text(r.anything_else) } }
}

export const labelOf = (list: readonly { id: string; label: string }[], id: string | null | undefined) =>
  list.find(x => x.id === id)?.label ?? '—'
