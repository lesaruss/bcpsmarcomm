// app/api/admin/audits/route.ts
// GET /api/admin/audits?department_id=X&status=in_progress
// POST /api/admin/audits - create audit finding
// PATCH /api/admin/audits - update audit finding status

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
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') ?? '100', 10)

    let query = db.from('bcps_audit_findings').select('*').order('created_at', { ascending: false }).limit(limit)

    if (departmentId) query = query.eq('department_id', departmentId)
    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Audits GET error:', error)
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

  const { department_id, finding_type, severity, description } = body as any

  if (!department_id || !finding_type || !severity) {
    return NextResponse.json(
      { error: 'department_id, finding_type, severity required.' },
      { status: 400 }
    )
  }

  try {
    const { data, error } = await db
      .from('bcps_audit_findings')
      .insert([
        {
          department_id,
          finding_type,
          severity,
          description,
          status: 'open',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Audits POST error:', error)
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
      .from('bcps_audit_findings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Audits PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}