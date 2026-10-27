import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/resend'
import { conversationUrl, escapeHtml } from '@/lib/site-inbox'

// Welcome message for a new widget editor (Sean, 2026-10-27): the moment
// someone is given edit or manage on a widget, the how-to-edit steps land in
// their Messages inbox (lighting up the bell) and stay there to come back to.
// Called after a grant is saved by both grant routes: /api/bcps/widgets
// (editor_set, a widget's own managers) and /api/bcps/permissions (grant_set,
// superadmin). Grants to a group welcome each member of the group.
//
// One welcome per person per widget: before sending, look for a conversation
// already opening with that widget's "You can now edit" line, so re-saving a
// grant or moving edit to manage never sends it twice. The row is tagged page
// "Messages" like any staff-started conversation, so the Messages page shows
// it as from the BCPS Marcomm team.

// Extra steps for widgets whose editor has more than the per-item fields.
const WIDGET_TIPS: Record<string, string[]> = {
  'iidl-services-directory': [
    "Each unit's page link and one-line summary are edited at the top of the same screen.",
    'Anything marked "Needs II&DL review" is an internal note for your team. It never appears on the public page.',
  ],
}

export async function welcomeWidgetEditors(svc: SupabaseClient, opts: {
  objectId: string
  subjectType: string
  subjectId: string
  role: string
  grantedByEmail: string
}) {
  if (!['edit', 'manage'].includes(opts.role)) return

  const { data: obj } = await svc.from('acl_objects').select('slug').eq('id', opts.objectId).eq('kind', 'page').maybeSingle()
  if (!obj) return
  const { data: widget } = await svc.from('bcps_widgets').select('slug, title, editor_component').eq('slug', obj.slug).maybeSingle()
  if (!widget) return

  let userIds = [opts.subjectId]
  if (opts.subjectType === 'group') {
    const { data: gm } = await svc.from('acl_group_members').select('user_id').eq('group_id', opts.subjectId)
    userIds = (gm ?? []).map(g => g.user_id as string)
  } else if (opts.subjectType !== 'user') return

  for (const userId of userIds) {
    try {
      await welcomeOne(svc, userId, widget, opts.role === 'manage', opts.grantedByEmail)
    } catch (e) {
      // A failed welcome never undoes or blocks the grant itself.
      console.error('widget editor welcome failed', widget.slug, userId, e)
    }
  }
}

async function welcomeOne(svc: SupabaseClient, userId: string,
  widget: { slug: string; title: string; editor_component: string | null },
  canManage: boolean, grantedByEmail: string) {
  const headline = `You can now edit the ${widget.title} widget on bcpsmarcomm.com.`
  const { data: already } = await svc.from('wcm_pilot_feedback').select('id')
    .eq('user_id', userId).eq('page', 'Messages').ilike('message', `%${headline}%`).limit(1)
  if (already?.length) return

  const { data: person } = await svc.from('wcm_cert_users').select('email, full_name').eq('user_id', userId).maybeSingle()
  let email = person?.email as string | undefined
  if (!email) {
    const { data } = await svc.auth.admin.getUserById(userId)
    email = data.user?.email ?? undefined
  }
  if (!email) return
  const first = String(person?.full_name || '').trim().split(/\s+/)[0]

  const steps = widget.editor_component
    ? [
        'Sign in at bcpsmarcomm.com and open Widgets in the menu.',
        `Find ${widget.title} and click Edit.`,
        'Change what you need and click Save. Updates show on the live page right away, with nothing to publish.',
        ...(WIDGET_TIPS[widget.slug] ?? []),
      ]
    : [
        'Sign in at bcpsmarcomm.com and open Widgets in the menu.',
        `${widget.title} does not have an in-app editor yet, so reply to this message with any change and the MarComm team will make it.`,
      ]
  const text = [
    `Hi${first ? ' ' + first : ''},`,
    '',
    headline,
    '',
    'How to make an update:',
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    ...(canManage ? ['', 'You can also choose who else can edit this widget: open its card in Widgets and click Manage editors.'] : []),
    '',
    'This message stays in your Messages (the bell at the top of the page), so you can come back to these steps anytime. For bigger changes, like a new section or a layout change, just reply here.',
  ].join('\n')

  const now = new Date().toISOString()
  // Same shape as a staff-started conversation (messages route,
  // startConversation): the opening message counts as a staff reply, so it is
  // unread for the member until they open it.
  const { data: row, error } = await svc.from('wcm_pilot_feedback').insert({
    user_id: userId, email, page: 'Messages', created_at: now,
    message: text, status: 'replied', read_at: now, last_activity_at: now,
    admin_reply: text, replied_at: now, replied_by: grantedByEmail,
  }).select('id').single()
  if (error) throw error

  const result = await sendEmail({
    to: email,
    subject: `You can now edit the ${widget.title} widget`,
    replyTo: 'sean.russell@browardschools.com',
    kind: 'widget-editor-welcome',
    html: `<p style="white-space:pre-wrap">${escapeHtml(text)}</p><p><a href="${conversationUrl(row.id)}">Open this message on bcpsmarcomm.com</a></p>`,
  })
  await svc.from('wcm_pilot_feedback').update({ reply_error: result.ok ? null : result.error }).eq('id', row.id)
}
