import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BRAND = 'bcps'

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

// A document is "dynamic" (live-editable in the browser) when its doc_url
// points at the /briefs/[slug] mock_pages route rather than a static file
// in the repo (static HTML has a .html suffix, the one PDF has .pdf).
// Migrating a static doc into mock_pages is what flips this to true - see
// the 2026-07-23 Documents migration.
function isDynamic(docUrl: string | null) {
  return !!docUrl && docUrl.startsWith('/briefs/') && !docUrl.endsWith('.html')
}

async function audit(actor: string, action: string, object_id: string | null, detail: unknown) {
  await svc.from('acl_audit').insert({ brand: BRAND, actor_id: actor, action, object_id, detail })
}

// GET /api/bcps/documents - the Documents catalog for the calling user.
// Admins/superadmins see every document (matches every other BCPS admin
// surface); everyone else sees what they own, plus anything non-private
// they've been granted directly or through a group.
//
// For admins only, the response also includes groups/members/grants scoped
// to document objects, so the Documents page can render and manage access
// inline without a second round trip through the superadmin-only
// /api/bcps/permissions console. This route intentionally gates its own
// admin actions at role=admin (not superadmin-only) - the whole point of
// this feature is to let Sean's team self-serve Documents without needing
// the Permissions Console or Sean personally.
export async function GET(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'

  // ?content_slug=X - on-demand fetch of one document's full HTML body for
  // the Content editor panel. Not included in the main catalog response so
  // a normal page load never pulls every document's full text at once.
  const contentSlug = req.nextUrl.searchParams.get('content_slug')
  if (contentSlug) {
    const { data: obj } = await svc.from('acl_objects')
      .select('id, owner_id, doc_url').eq('brand', BRAND).eq('kind', 'document').eq('slug', contentSlug).single()
    if (!obj) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    if (!isAdmin && obj.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!isDynamic(obj.doc_url)) return NextResponse.json({ error: 'Not database-backed.' }, { status: 422 })
    const { data: page } = await svc.from('mock_pages')
      .select('content').eq('brand', BRAND).eq('surface', 'brief').eq('slug', contentSlug).single()
    const res = NextResponse.json({ ok: true, content: page?.content ?? '' })
    res.headers.set('Cache-Control', 'no-store')
    return res
  }

  const { data: docs, error } = await svc.from('acl_objects')
    .select('id, slug, title, description, doc_type, doc_date, icon, section, visibility, sensitive, owner_id, doc_url, series_id')
    .eq('brand', BRAND).eq('kind', 'document')
    .order('section').order('title')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const all = docs ?? []

  // Some documents are one-off (WCM Kickoff Event); others are recurring
  // instances of a series (e.g. "Hot Lab for Department WCMs" - a new dated
  // acl_objects row gets created for each occurrence). For series
  // documents, effective visibility/sensitive/owner/grants all resolve from
  // the series' own acl_objects row (kind='document_series') instead of the
  // instance's own row, so access granted once at the series level
  // automatically covers every past and future instance - no re-granting
  // per occurrence.
  type DocRow = (typeof all)[number]
  const seriesIds = Array.from(new Set(all.map(d => d.series_id).filter(Boolean))) as string[]
  const seriesById = new Map<string, { id: string; slug: string; title: string; visibility: string; sensitive: boolean; owner_id: string }>()
  if (seriesIds.length) {
    const { data: seriesRows } = await svc.from('acl_objects')
      .select('id, slug, title, visibility, sensitive, owner_id')
      .in('id', seriesIds).eq('kind', 'document_series')
    for (const s of seriesRows ?? []) seriesById.set(s.id, s)
  }
  const effectiveOf = (d: DocRow) => {
    const series = d.series_id ? seriesById.get(d.series_id) : undefined
    return {
      objectId: series ? series.id : d.id,
      visibility: series ? series.visibility : d.visibility,
      sensitive: series ? series.sensitive : d.sensitive,
      ownerId: series ? series.owner_id : d.owner_id,
      seriesTitle: series?.title ?? null,
    }
  }

  const objIds = Array.from(new Set(all.map(d => effectiveOf(d).objectId)))

  const { data: gm } = await svc.from('acl_group_members').select('group_id').eq('user_id', user.id)
  const gids = (gm ?? []).map(g => g.group_id)
  const { data: grants } = await svc.from('acl_grants')
    .select('id, object_id, subject_type, subject_id, role')
    .in('object_id', objIds.length ? objIds : ['__none__'])

  const grantsFor = (objId: string) => (grants ?? []).filter(g => g.object_id === objId)
  const myGrant = (objId: string) => grantsFor(objId).find(g =>
    (g.subject_type === 'user' && g.subject_id === user.id) ||
    (g.subject_type === 'group' && gids.includes(g.subject_id)))

  const visible = all.filter(d => {
    const eff = effectiveOf(d)
    if (eff.ownerId === user.id) return true
    if (eff.visibility === 'private') return false
    return isAdmin || !!myGrant(eff.objectId)
  })

  const result = visible.map(d => {
    const eff = effectiveOf(d)
    const grant = myGrant(eff.objectId)
    const can_edit = isAdmin || eff.ownerId === user.id || (!!grant && ['edit', 'manage'].includes(grant.role))
    return {
      id: d.id, slug: d.slug, title: d.title, description: d.description,
      type: d.doc_type, date: d.doc_date, icon: d.icon, section: d.section || 'documents',
      visibility: eff.visibility, sensitive: eff.sensitive, doc_url: d.doc_url,
      is_dynamic: isDynamic(d.doc_url), can_edit,
      series_id: d.series_id || null, series_title: eff.seriesTitle, effective_object_id: eff.objectId,
    }
  })

  const extra: Record<string, unknown> = {}
  if (isAdmin) {
    const [groups, members] = await Promise.all([
      svc.from('acl_groups').select('id, slug, name').eq('brand', BRAND).order('name'),
      svc.from('acl_member_roles').select('user_id').eq('brand', BRAND),
    ])
    const ids = (members.data ?? []).map(m => m.user_id)
    const { data: authUsers } = await svc.auth.admin.listUsers({ perPage: 1000 })
    const byId = new Map((authUsers?.users ?? []).map(u => [u.id, u]))
    extra.groups = groups.data ?? []
    extra.members = ids.map(id => {
      const u = byId.get(id)
      return {
        user_id: id, email: u?.email ?? '(unknown)',
        name: (u?.user_metadata as { name?: string; full_name?: string } | undefined)?.name
          || (u?.user_metadata as { name?: string; full_name?: string } | undefined)?.full_name
          || u?.email?.split('@')[0] || '',
      }
    }).sort((a, b) => a.name.localeCompare(b.name))
    extra.grants = grants ?? []
  }

  const res = NextResponse.json({ ok: true, role, documents: result, ...extra })
  res.headers.set('Cache-Control', 'no-store')
  return res
}

// POST /api/bcps/documents - { action, ...fields }. Admin/superadmin only.
export async function POST(req: NextRequest) {
  const user = await authedUser(req)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const role = await roleFor(user.id)
  const isAdmin = role === 'admin' || role === 'superadmin'
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const a = body.action as string

  try {
    switch (a) {
      // Update a document's display metadata (title/description/type/date/
      // icon/section) and, optionally, its visibility/sensitive flags.
      case 'meta_update': {
        const { slug } = body
        if (!slug) return NextResponse.json({ error: 'slug required.' }, { status: 400 })
        const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
        for (const [bodyKey, col] of [
          ['title', 'title'], ['description', 'description'], ['doc_type', 'doc_type'],
          ['doc_date', 'doc_date'], ['icon', 'icon'], ['section', 'section'],
          ['visibility', 'visibility'], ['sensitive', 'sensitive'],
        ] as const) {
          if (body[bodyKey] !== undefined) row[col] = body[bodyKey]
        }
        const { data, error } = await svc.from('acl_objects')
          .update(row).eq('brand', BRAND).eq('kind', 'document').eq('slug', slug)
          .select('id').single()
        if (error) throw error
        await audit(user.id, 'document_meta_update', data.id, { slug, fields: Object.keys(row) })
        return NextResponse.json({ ok: true })
      }

      // Save new HTML content for a document that's backed by mock_pages
      // (doc_url like /briefs/[slug], no .html suffix). Static files and
      // the PDF are not editable this way - use pdf_replace for the PDF.
      case 'content_save': {
        const { slug, content } = body
        if (!slug || typeof content !== 'string') {
          return NextResponse.json({ error: 'slug and content required.' }, { status: 400 })
        }
        const { data: obj, error: objErr } = await svc.from('acl_objects')
          .select('id, doc_url, title').eq('brand', BRAND).eq('kind', 'document').eq('slug', slug).single()
        if (objErr || !obj) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
        if (!isDynamic(obj.doc_url)) {
          return NextResponse.json({ error: 'This document is not database-backed and cannot be edited here.' }, { status: 422 })
        }
        const { error } = await svc.from('mock_pages')
          .upsert({
            brand: BRAND, slug, surface: 'brief', title: obj.title, content,
            created_by: user.id, updated_at: new Date().toISOString(),
          }, { onConflict: 'brand,slug,surface' })
        if (error) throw error
        await audit(user.id, 'document_content_save', obj.id, { slug, length: content.length })
        return NextResponse.json({ ok: true })
      }

      // Replace the underlying PDF file for a PDF-backed document by
      // pushing a new version to GitHub Contents API at the same path,
      // so the existing doc_url keeps working. base64 = raw file bytes.
      case 'pdf_replace': {
        const { slug, base64, filename } = body
        if (!slug || !base64) return NextResponse.json({ error: 'slug and base64 required.' }, { status: 400 })
        const { data: obj, error: objErr } = await svc.from('acl_objects')
          .select('id, doc_url').eq('brand', BRAND).eq('kind', 'document').eq('slug', slug).single()
        if (objErr || !obj) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
        if (!obj.doc_url || !obj.doc_url.endsWith('.pdf')) {
          return NextResponse.json({ error: 'This document is not a replaceable PDF.' }, { status: 422 })
        }
        const ghToken = process.env.BCPS_DOCS_GITHUB_TOKEN
        if (!ghToken) return NextResponse.json({ error: 'File replace is not configured on this deployment.' }, { status: 500 })
        const repoPath = `public${obj.doc_url}`
        const ghHeaders = { Authorization: `token ${ghToken}`, Accept: 'application/vnd.github.v3+json' }
        const getRes = await fetch(`https://api.github.com/repos/lesaruss/bcpsmarcomm/contents/${repoPath}`, { headers: ghHeaders })
        if (!getRes.ok) return NextResponse.json({ error: 'Could not read current file from GitHub.' }, { status: 502 })
        const cur = await getRes.json()
        const putRes = await fetch(`https://api.github.com/repos/lesaruss/bcpsmarcomm/contents/${repoPath}`, {
          method: 'PUT', headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Replace ${filename || repoPath} via BCPS Documents admin (${user.email})`,
            content: base64, sha: cur.sha,
          }),
        })
        if (!putRes.ok) {
          const t = await putRes.text()
          return NextResponse.json({ error: `GitHub push failed: ${t.slice(0, 300)}` }, { status: 502 })
        }
        await audit(user.id, 'document_pdf_replace', obj.id, { slug, filename })
        return NextResponse.json({ ok: true, note: 'Vercel will redeploy automatically; the file updates in a minute or two.' })
      }

      // Grant or revoke a user/group's access to a document. Scoped to
      // kind='document' objects only and deliberately gated at admin (not
      // superadmin, unlike /api/bcps/permissions' grant_set) so Sean's team
      // can manage Documents access themselves.
      //
      // If the document belongs to a series (series_id set), the grant is
      // written against the series' own object id instead of the
      // document's - that's the whole point of a series: set access once
      // and every instance (past and future) shares it transparently.
      case 'grant_set': {
        const { slug, subject_type, subject_id, role: grantRole, grant } = body
        if (!slug || !subject_type || !subject_id) {
          return NextResponse.json({ error: 'slug, subject_type, subject_id required.' }, { status: 400 })
        }
        const { data: obj, error: objErr } = await svc.from('acl_objects')
          .select('id, series_id').eq('brand', BRAND).eq('kind', 'document').eq('slug', slug).single()
        if (objErr || !obj) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
        const targetId = obj.series_id || obj.id
        if (grant) {
          const { error } = await svc.from('acl_grants').upsert(
            { object_id: targetId, subject_type, subject_id, role: grantRole || 'view' },
            { onConflict: 'object_id,subject_type,subject_id' })
          if (error) throw error
        } else {
          const { error } = await svc.from('acl_grants').delete()
            .eq('object_id', targetId).eq('subject_type', subject_type).eq('subject_id', subject_id)
          if (error) throw error
        }
        await audit(user.id, 'document_grant_set', targetId, { slug, subject_type, subject_id, role: grantRole, grant, series_id: obj.series_id || null })
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
