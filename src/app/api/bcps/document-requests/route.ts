import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'
const LESARUSS_TENANT = '00000000-0000-4000-a000-000000000001'
const PROJECT_SLUG = 'bcps-documents'

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...(init ?? {}), cache: 'no-store' })
const svc = createClient(URL, SERVICE, { auth: { persistSession: false }, global: { fetch: noStoreFetch } })

async function authedUser(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const asUser = createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: { user } } = await asUser.auth.getUser()
  return user ?? null
}

async function roleFor(userId: string) {
  const { data } = await svc.from('acl_member_roles')
    .select('role').eq('user_id', userId).eq('brand', BRAND).maybeSingle()
  return data?.role || 'user'
}

// Resolve a document by slug plus whether the given user can directly edit
// it (same rule as /api/bcps/documents: admin, owner, or an edit/manage
// grant). Also resolves who "is in charge" of it for approval routing and
// for allowing approve/reject/publish - owner, admin, or a manage grant.
async function loadDoc(slug: string, userId: string, isAdmin: boolean) {
  const { data: doc } = await svc.from('acl_objects')
    .select('id, slug, title, owner_id, sensitive').eq('brand', BRAND).eq('kind', 'document').eq('slug', slug).single()
  if (!doc) return null
  const { data: grants } = await svc.from('acl_grants')
    .select('subject_type, subject_id, role').eq('object_id', doc.id).eq('subject_type', 'user').eq('subject_id', userId)
  const myGrant = (grants ?? [])[0]
  const canEdit = isAdmin || doc.owner_id === userId || (!!myGrant && ['edit', 'manage'].includes(myGrant.role))
  const canManage = isAdmin || doc.owner_id === userId || (!!myGrant && myGrant.role === 'manage')
  return { doc, canEdit, canManage }
}

async function emailFor(userId: string | null) {
  if (!userId) return null
  const { data } = await svc.auth.admin.getUserById(userId)
  return data.user?.email ?? null
}

// GET /api/bcps/document-requests - tickets relevant to the caller.
// Admins/superadmins see every Documents request; everyone else sees
// requests they submitted (from_agent) or that are waiting on them as the
// document's owner/manager (to_agent).
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'

  let query = svc.from('agent_tasks').select('*').eq('project_slug', PROJECT_SLUG).order('created_at', { ascending: false })
  if (!isAdmin) {
    query = query.or(`from_agent.eq.${user.email},to_agent.eq.${user.email}`)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Annotate each ticket with whether the caller can act on it right now.
  const slugs = Array.from(new Set((data ?? []).map(t => (t.metadata as { slug?: string })?.slug).filter(Boolean))) as string[]
  const canManageBySlug = new Map<string, boolean>()
  for (const slug of slugs) {
    const resolved = await loadDoc(slug, user.id, isAdmin)
    canManageBySlug.set(slug, !!resolved?.canManage)
  }

  const tickets = (data ?? []).map(t => {
    const meta = (t.metadata ?? {}) as Record<string, unknown>
    const slug = meta.slug as string | undefined
    return { ...t, can_act: isAdmin || (slug ? canManageBySlug.get(slug) : false) }
  })

  const res = NextResponse.json({ ok: true, role, tickets })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

// POST /api/bcps/document-requests - { action, ...fields }
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'
  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      // Anyone who can see a document may request a change to it, even
      // without edit rights. If they already have edit rights themselves,
      // the ticket skips approval and goes straight to the agent queue;
      // otherwise it routes to the document's owner for approval first.
      case 'create': {
        const { doc_slug, prompt } = body
        if (!doc_slug || !prompt) return NextResponse.json({ error: 'doc_slug and prompt required.' }, { status: 400 })
        const resolved = await loadDoc(doc_slug, user.id, isAdmin)
        if (!resolved) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
        const { doc, canEdit } = resolved
        const ownerEmail = await emailFor(doc.owner_id)
        // Sensitive documents (APPAS/records) always require owner approval,
        // even for a requester who already has edit rights - matches the
        // existing convention that `sensitive` means extra caution (see
        // /api/bcps/permissions' link_create, which blocks public links on
        // sensitive objects the same way).
        const requestState = (canEdit && !doc.sensitive) ? 'ready_for_agent' : 'pending_approval'
        const requiresApproval = requestState === 'pending_approval'
        const { data, error } = await svc.from('agent_tasks').insert({
          tenant_id: LESARUSS_TENANT,
          module: 'bcps',
          station: 'both',
          project_slug: PROJECT_SLUG,
          task_type: 'feedback_request',
          source_type: 'document_edit_request',
          source_id: doc.id,
          from_agent: user.email,
          to_agent: requiresApproval ? (ownerEmail || 'claude') : 'claude',
          title: doc.title,
          description: prompt,
          priority: 'medium',
          status: 'pending',
          metadata: {
            slug: doc.slug, doc_id: doc.id, requested_by_email: user.email,
            requested_by_user_id: user.id, request_state: requestState,
            requires_approval: requiresApproval,
          },
        }).select().single()
        if (error) throw error
        return NextResponse.json({ ok: true, ticket: data, requires_approval: requiresApproval })
      }

      // Doc owner/manager (or admin) approves a pending request, moving it
      // into the agent queue.
      case 'approve': {
        const { id } = body
        const { data: ticket, error: tErr } = await svc.from('agent_tasks').select('*').eq('id', id).single()
        if (tErr || !ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
        const meta = (ticket.metadata ?? {}) as Record<string, unknown>
        const slug = meta.slug as string
        const resolved = await loadDoc(slug, user.id, isAdmin)
        if (!resolved?.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (meta.request_state !== 'pending_approval') return NextResponse.json({ error: 'Ticket is not awaiting approval.' }, { status: 422 })
        const { error } = await svc.from('agent_tasks').update({
          to_agent: 'claude', status: 'pending',
          metadata: { ...meta, request_state: 'ready_for_agent', approved_by: user.email },
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      case 'reject': {
        const { id, reason } = body
        const { data: ticket, error: tErr } = await svc.from('agent_tasks').select('*').eq('id', id).single()
        if (tErr || !ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
        const meta = (ticket.metadata ?? {}) as Record<string, unknown>
        const slug = meta.slug as string
        const resolved = await loadDoc(slug, user.id, isAdmin)
        if (!resolved?.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        const { error } = await svc.from('agent_tasks').update({
          status: 'cancelled',
          metadata: { ...meta, request_state: 'rejected', rejected_by: user.email, rejection_reason: reason || null },
          completed_at: new Date().toISOString(), completed_by: user.email,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      // Publish the agent-drafted content (stored in the ticket's `result`)
      // into the live document, and close out the ticket. Requires the same
      // "in charge" check as approve/reject - this is the mandatory final
      // human confirm click, even for self-requests.
      case 'publish': {
        const { id } = body
        const { data: ticket, error: tErr } = await svc.from('agent_tasks').select('*').eq('id', id).single()
        if (tErr || !ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
        const meta = (ticket.metadata ?? {}) as Record<string, unknown>
        const slug = meta.slug as string
        const resolved = await loadDoc(slug, user.id, isAdmin)
        if (!resolved?.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (meta.request_state !== 'draft_ready') return NextResponse.json({ error: 'No draft ready to publish yet.' }, { status: 422 })
        if (!ticket.result) return NextResponse.json({ error: 'Ticket has no draft content.' }, { status: 422 })
        const { error: pageErr } = await svc.from('mock_pages').upsert({
          brand: BRAND, slug, surface: 'brief', title: resolved.doc.title, content: ticket.result,
          created_by: user.email, updated_at: new Date().toISOString(),
        }, { onConflict: 'brand,slug,surface' })
        if (pageErr) throw pageErr
        const { error } = await svc.from('agent_tasks').update({
          status: 'completed',
          metadata: { ...meta, request_state: 'published', published_by: user.email },
          completed_at: new Date().toISOString(), completed_by: user.email,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        if (error) throw error
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
