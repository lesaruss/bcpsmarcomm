// app/api/admin/graphics/route.ts
// GET /api/admin/graphics?status=pending
// POST /api/admin/graphics - new graphics request
// PATCH /api/admin/graphics - update request status

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminToken } from '../_auth'
import { serviceClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const auth = requireAdminToken(req)
  if (auth) return auth

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'DB unavailable.' }, { status: 503 })

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    let query = db.from('bcps_graphics_requests').select('*').order('created_at', { ascending: false }).limit(limit)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Graphics GET error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const auth = requireAdminToken(req)
  if (auth) return auth

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'DB unavailable.' }, { status: 503 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const { department_id, request_type, description, priority } = body as any

  if (!department_id || !request_type) {
    return NextResponse.json({ error: 'department_id, request_type required.' }, { status: 400 })
  }

  try {
    const { data, error } = await db
      .from('bcps_graphics_requests')
      .insert([
        {
          department_id,
          request_type,
          description,
          priority: priority ?? 'normal',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Graphics POST error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdminToken(req)
  if (auth) return auth

  const db = serviceClient()
  if (!db) return NextResponse.json({ error: 'DB unavailable.' }, { status: 503 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const { id, ...updates } = body as any
  if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 })

  try {
    const { data, error } = await db
      .from('bcps_graphics_requests')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Graphics PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}