import { NextRequest, NextResponse } from 'next/server'
import { svc, caller, schoolByLoc } from '@/lib/proudPointsApi'
import { sendEmail } from '@/lib/resend'
import {
  POINT_COUNT, cleanPoint, validatePoint, schoolState, isTestBuild, escapeHtml, type ProudPoint,
} from '@/lib/proudPoints'

// Sends Proud Points to the District Web Team review queue.
// body: { loc, kind: 'initial', points: [6] }                         first six
//    or { loc, kind: 'replace', point, replace_slot?, replaced_text? } one swap
//    plus checklist_ack { media_release, faces_visible, final_ack }
//
// The server decides which flow a school is in (schoolState), so a WCM cannot
// send one point for a school that has none, or six for one that has six.
// Only one submission per school waits for review at a time, so the web team
// never posts two conflicting sets.

const REQUIRED_ACK_KEYS = ['media_release', 'faces_visible', 'final_ack'] as const
const FOOTER = 'This is an automated message from the School Proud Points Submission Form.'

async function photoOk(path: string | null, userId: string): Promise<boolean> {
  if (!path) return false
  const { data } = await svc.from('bcps_proud_point_photos').select('ok, wcm_user_id').eq('path', path).maybeSingle()
  return !!data && data.ok && data.wcm_user_id === userId
}

export async function POST(req: NextRequest) {
  const user = await caller(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    loc?: string; kind?: 'initial' | 'replace'
    points?: Partial<ProudPoint>[]; point?: Partial<ProudPoint>
    replace_slot?: number | null; replaced_text?: string
    checklist_ack?: Record<string, boolean>
  }
  const school = await schoolByLoc(body.loc)
  if (!school) return NextResponse.json({ error: 'Pick your school first.' }, { status: 400 })
  for (const k of REQUIRED_ACK_KEYS) {
    if (body.checklist_ack?.[k] !== true) return NextResponse.json({ error: 'Check every box in the checklist before sending.' }, { status: 400 })
  }

  const state = await schoolState(svc, school.loc_no)
  const expected = state.has_six ? 'replace' : 'initial'
  if (body.kind !== expected) {
    return NextResponse.json({
      error: expected === 'initial'
        ? `${school.school_name} does not have six Proud Points on record yet, so all six are needed.`
        : `${school.school_name} already has six Proud Points. Replace them one at a time.`,
    }, { status: 409 })
  }

  const { data: waiting } = await svc.from('bcps_proud_point_submissions').select('id')
    .eq('school_location_nbr', school.loc_no).eq('status', 'pending').is('archived_at', null).limit(1)
  if (waiting && waiting.length) {
    return NextResponse.json({ error: `A Proud Points submission for ${school.school_name} is already waiting for review. You can send another once it is reviewed.` }, { status: 409 })
  }

  let points: ProudPoint[]
  let replaceSlot: number | null = null
  let replacedText: string | null = null
  if (expected === 'initial') {
    if (!Array.isArray(body.points) || body.points.length !== POINT_COUNT) {
      return NextResponse.json({ error: `All ${POINT_COUNT} Proud Points are needed.` }, { status: 400 })
    }
    points = body.points.map((p, i) => cleanPoint(p, i + 1))
  } else {
    replaceSlot = typeof body.replace_slot === 'number' && body.replace_slot >= 1 && body.replace_slot <= POINT_COUNT ? body.replace_slot : null
    replacedText = (body.replaced_text || '').trim().slice(0, 600) || null
    if (!replaceSlot && !replacedText) return NextResponse.json({ error: 'Choose which Proud Point this replaces.' }, { status: 400 })
    if (replaceSlot && !replacedText) {
      const cur = state.current.find(c => c.slot === replaceSlot)
      replacedText = cur ? (cur.text || [cur.stat, cur.heading, cur.caption].filter(Boolean).join(' - ')) : null
    }
    points = [cleanPoint(body.point || {}, replaceSlot ?? 1)]
  }
  for (const p of points) {
    const err = validatePoint(p, { complete: true })
    if (err) return NextResponse.json({ error: err }, { status: 400 })
    if (!(await photoOk(p.photo_path, user.id))) {
      return NextResponse.json({ error: `The photo for point ${p.slot} was not accepted. Choose it again.` }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const test = isTestBuild()
  const row = {
    wcm_user_id: user.id, wcm_email: user.email, school_location_nbr: school.loc_no, school_name: school.school_name,
    kind: expected, status: 'pending', points, replace_slot: replaceSlot, replaced_text: replacedText,
    checklist_ack: { ...Object.fromEntries(REQUIRED_ACK_KEYS.map(k => [k, true])), acked_at: now },
    submitted_at: now, updated_at: now, is_test: test,
  }
  // The first-six flow turns the caller's draft into the submission, so the
  // draft does not linger after it is sent.
  const { data: draft } = await svc.from('bcps_proud_point_submissions').select('id')
    .eq('wcm_user_id', user.id).eq('school_location_nbr', school.loc_no).eq('status', 'draft').maybeSingle()
  const write = draft && expected === 'initial'
    ? svc.from('bcps_proud_point_submissions').update(row).eq('id', draft.id).select('id').single()
    : svc.from('bcps_proud_point_submissions').insert(row).select('id').single()
  const { data: saved, error } = await write
  if (error || !saved) return NextResponse.json({ error: error?.message || 'Could not save the submission.' }, { status: 500 })

  await notifyReviewers(saved.id, { school: school.school_name, kind: expected, wcm: user.email ?? null, test }).catch(() => {})
  return NextResponse.json({ ok: true, id: saved.id, test })
}

// Mirrors the banner submit notification: the bcps_banner_admins rows with
// notify_on_submit, best effort, outcome logged on the row. From the test
// build it goes to the tester instead, so the team is not emailed by tests.
async function notifyReviewers(id: string, s: { school: string; kind: string; wcm: string | null; test: boolean }) {
  let recipients: string[]
  if (s.test) {
    recipients = s.wcm ? [s.wcm] : []
  } else {
    const { data: admins } = await svc.from('bcps_banner_admins').select('email').eq('notify_on_submit', true)
    recipients = (admins ?? []).map(a => a.email).filter((e): e is string => !!e)
  }
  if (!recipients.length) return
  const what = s.kind === 'initial' ? 'a full set of six Proud Points' : 'a replacement Proud Point'
  const result = await sendEmail({
    to: recipients,
    subject: `${s.test ? '[TEST] ' : ''}New Proud Points submission (${s.school})`,
    kind: 'proud-points-submitted',
    context: { submission_id: id, test: s.test },
    html: `
      <p>Hi,</p>
      <p>${s.wcm ? `<strong>${escapeHtml(s.wcm)}</strong>` : 'A WCM'} sent ${what} for <strong>${escapeHtml(s.school)}</strong>.</p>
      <p><a href="https://bcpsmarcomm.com/?page=proud-points&tab=review">Review it in the Proud Points queue</a>.</p>
      ${s.test ? '<p><em>Sent from the test build, so only you received it.</em></p>' : ''}
      <p style="color:#888;font-size:12px">${FOOTER} You're receiving it because you're listed as an Admin or Manager for school submissions.</p>
    `,
  })
  await svc.from('bcps_proud_point_submissions').update({
    notify_email_sent_at: result.ok ? new Date().toISOString() : null,
    notify_email_error: result.ok ? null : (result.error || 'Unknown send error'),
  }).eq('id', id)
}
