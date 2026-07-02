import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

async function verifyToken(req: NextRequest): Promise<{ userId: string; email: string } | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace('Bearer ', '').trim()
  if (!token) return null
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return { userId: user.id, email: user.email ?? '' }
}

// GET /api/bcps/minibase
// Returns all folders and their documents for the bcps brand
export async function GET(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()

  const [foldersRes, docsRes] = await Promise.all([
    admin
      .from('minibase_folders')
      .select('*')
      .eq('brand_slug', 'bcps')
      .order('name'),
    admin
      .from('minibase_documents')
      .select('*')
      .order('created_at', { ascending: false }),
  ])

  if (foldersRes.error) return NextResponse.json({ error: foldersRes.error.message }, { status: 500 })
  if (docsRes.error)    return NextResponse.json({ error: docsRes.error.message },    { status: 500 })

  return NextResponse.json({
    folders:   foldersRes.data ?? [],
    documents: docsRes.data ?? [],
  })
}

// POST /api/bcps/minibase
// Adds a document to a minibase folder (superadmin only)
export async function POST(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const SUPERADMIN = new Set(['contact@lesaruss.com'])
  if (!SUPERADMIN.has(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { folder_id, title, description, url, file_type, tags, categories, is_embedded } = body

  if (!folder_id || !title) return NextResponse.json({ error: 'folder_id and title required' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('minibase_documents')
    .insert({ folder_id, title, description, url, file_type: file_type || 'document', tags: tags || [], categories: categories || [], is_embedded: is_embedded || false })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data }, { status: 201 })
}

// PATCH /api/bcps/minibase
// Updates a document (superadmin only)
export async function PATCH(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const SUPERADMIN = new Set(['contact@lesaruss.com'])
  if (!SUPERADMIN.has(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('minibase_documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data })
}

// DELETE /api/bcps/minibase
// Deletes a document (superadmin only)
export async function DELETE(req: NextRequest) {
  const user = await verifyToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const SUPERADMIN = new Set(['contact@lesaruss.com'])
  if (!SUPERADMIN.has(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const admin = supabaseAdmin()
  const { error } = await admin.from('minibase_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
