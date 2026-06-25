// app/api/admin/departments/route.ts
// GET /api/admin/departments?limit=50&status=active
// POST /api/admin/departments - create new department record
// PATCH /api/admin/departments - update department (scores, status, audit_status)

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
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const status = searchParams.get('status')

    let query = db.from('bcps_departments').select('*').order('created_at', { ascending: false }).limit(limit)

    if (status) query = query.eq('audit_status', status)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Departments GET error:', error)
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

  const { school_name, county, district_code } = body as any

  if (!school_name || !county || !district_code) {
    return NextResponse.json(
      { error: 'school_name, county, district_code required.' },
      { status: 400 }
    )
  }

  try {
    const { data, error } = await db
      .from('bcps_departments')
      .insert([
        {
          school_name,
          county,
          district_code,
          audit_status: 'not_started',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error('Departments POST error:', error)
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
      .from('bcps_departments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Departments PATCH error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}