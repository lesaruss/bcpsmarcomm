import { askClaudeJson } from '@/lib/anthropic-key'

// The content stop (BCPS Document System, Phase 3, V 2026-10-28): "AI never
// writes about a named student, personnel matters (performance, discipline,
// complaints, health, leave), legal matters... If a transcript contains them,
// the upload stops and flags it instead of summarizing." Every Playbook
// transcript is screened before it is summarized. Student ID and Social
// Security numbers are caught by pattern, without sending the text anywhere
// else; then Claude reads for the rest. Anything found stops the upload, and
// the lead gets the lines to remove. If the screen cannot run, the upload
// stops too: nothing is summarized unscreened.

export const SCREEN_MODEL = 'claude-sonnet-5-5'
export type ScreenKind = 'student_id' | 'ssn' | 'named_student' | 'personnel' | 'legal'
export interface ScreenFinding { kind: ScreenKind; excerpt: string; why: string }
export interface ScreenResult { clean: boolean; findings: ScreenFinding[]; model: string | null }

export const SCREEN_LABEL: Record<ScreenKind, string> = {
  student_id: 'a student ID number',
  ssn: 'a Social Security number',
  named_student: 'a named student',
  personnel: 'a personnel matter',
  legal: 'a legal matter',
}

// The transcript line around a match, trimmed to something short to show.
function lineAround(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index) + 1
  const end = text.indexOf('\n', index)
  const line = text.slice(start, end === -1 ? undefined : end).trim()
  return line.length > 220 ? line.slice(0, 217) + '...' : line
}

export function patternScreen(text: string): ScreenFinding[] {
  const out: ScreenFinding[] = []
  const add = (kind: ScreenKind, re: RegExp, why: string) => {
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) && out.filter((f) => f.kind === kind).length < 5) {
      out.push({ kind, excerpt: lineAround(text, m.index), why })
    }
  }
  // "student ID 0612345678", "student number: 123456"; and bare 10-digit
  // numbers, the length of a BCPS student number (phone numbers are written
  // with separators, so they do not match).
  add('student_id', /\bstudent\s*(?:id|number|#|no\.?)\s*[:#]?\s*\d{5,}/gi, 'A student ID number is in the transcript.')
  add('student_id', /(?<![\d-])\d{10}(?![\d-])/g, 'A ten-digit number, the length of a student ID, is in the transcript.')
  add('ssn', /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, 'A number in the format of a Social Security number is in the transcript.')
  return out
}

const SYSTEM = `You screen a Broward County Public Schools meeting transcript before anything is written from it into a project document that staff will read. Find only these, and only when the transcript actually discusses them:

- named_student: a specific student who is named or could be identified (by name, initials with a school, or a description that points to one child), together with anything about them: grades, behavior, discipline, attendance, health, family, services, incidents. General talk about "students", a grade level, or a program is not this. A student named only as the author of public work being celebrated (a winning poster, a news story) is not this either.
- personnel: a named or identifiable employee's performance, evaluation, discipline, complaints about them, health, medical or family leave, pay disputes, or a pending hiring or firing decision. Ordinary work talk (who owns a task, who is out of office today, who will send something, someone being new to a role) is not this.
- legal: litigation, a legal claim or threat, advice from attorneys, an investigation, or a public records dispute.

For each finding, quote the transcript line it rests on in "excerpt" (at most 200 characters, exactly as written), and say in "why" in a few plain words what it is about, without repeating private details. If none of these are present, return an empty list. Do not flag anything else.`

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['kind', 'excerpt', 'why'],
        properties: { kind: { type: 'string', enum: ['named_student', 'personnel', 'legal'] }, excerpt: { type: 'string' }, why: { type: 'string' } },
      },
    },
  },
}

export async function screenTranscript(text: string): Promise<ScreenResult> {
  const found = patternScreen(text)
  if (found.length) return { clean: false, findings: found, model: null }
  const out = await askClaudeJson(SCREEN_MODEL, SCHEMA, SYSTEM, `<transcript>\n${text}\n</transcript>`)
  const findings = (Array.isArray(out.findings) ? out.findings : []).slice(0, 10).map((f) => {
    const o = f as Record<string, unknown>
    return { kind: o.kind as ScreenKind, excerpt: String(o.excerpt || '').slice(0, 220), why: String(o.why || '').slice(0, 200) }
  }).filter((f) => f.kind in SCREEN_LABEL)
  return { clean: !findings.length, findings, model: SCREEN_MODEL }
}

// What the lead is told when an upload stops.
export function screenMessage(r: ScreenResult): string {
  const kinds = Array.from(new Set(r.findings.map((f) => SCREEN_LABEL[f.kind])))
  return `This transcript was not summarized: it talks about ${kinds.join(', ').replace(/, ([^,]*)$/, ' and $1')}, which never goes into a project document. Remove those parts and upload it again. The lines are listed below.`
}
