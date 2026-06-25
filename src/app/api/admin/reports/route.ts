// app/api/admin/reports/route.ts
// GET /api/admin/reports?department_id=X&type=audit
// POST /api/admin/reports - generate new report
// PATCH /api/admin/reports - update report status

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
    const departmentId = searchParams.get('department_id')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)

    let query = db.from('bcps_reports').select('*').order('created_at', { ascending: false }).limit(limit)

    if (departmentId) query = query.eq('department_id', departmentId)
    if (type) query = query.eq('report_type', type)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Reports GET error:', error)
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

  const { department_id, report_type, scheduled_for } = body as any

  if (!department_id || !report_type) {
    return NextResponse.json({ error: 'department_id, report_type required.' }, { status: 400 })
  }

  try {
    const { data, error } = await db
      .from('bcps_reports')
      .insert([
        {
          department_id,
          report_type,
          scheduled_for: scheduled_for ?? new Date().toISOString(),
          status: 'queued',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Reports POST error:', error)
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
      .from('bcps_reports')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Reports PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}