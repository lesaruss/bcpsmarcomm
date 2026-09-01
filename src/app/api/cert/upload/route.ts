import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-admin'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const svc = createServiceClient(URL, SERVICE)

// Stores the file a WCM attaches to a certification assignment (the
// Module 9 Accessible PDF Review, and the Final Assignment which already
// told learners to "submit your report as a Word document or PDF" with
// no actual way to do so - Sean, live Hot Lab 2026-09-01). Uploads go
// through this server route with the service role rather than a direct
// client-to-storage upload so there is no need to open bucket RLS to end
// users - the same pattern used by /api/bcps/messages for voice-note
// replies (Sean, 2026-08-19).
//
// Files land in the private bcps-client bucket under
// cert-submissions/<user_id>/... so they are not publicly reachable;
// admins read them back via a short-lived signed URL (see the
// admin dashboard, which calls storage.createSignedUrl at render time).
const MAX_BYTES = 15 * 1024 * 1024 // 15MB - plenty for a department PDF/Word doc, small enough to stay well under serverless body limits
const ALLOWED_EXT = /\.(pdf|docx?)$/i
const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { user_id, course_id, module_id, page_id, filename, file_base64 } = body as {
      user_id?: string; course_id?: string; module_id?: string; page_id?: string
      filename?: string; file_base64?: string
    }

    if (!user_id || !course_id || !module_id || !page_id || !filename || !file_base64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!ALLOWED_EXT.test(filename)) {
      return NextResponse.json({ error: 'Only PDF or Word (.docx) files can be attached to this assignment.' }, { status: 400 })
    }

    const match = file_base64.match(/^data:([^;]+);base64,(.+)$/)
    const mime = match?.[1] || ''
    if (!match || !ALLOWED_MIME[mime]) {
      return NextResponse.json({ error: 'That file did not look like a PDF or Word document. Please attach a .pdf or .docx file.' }, { status: 400 })
    }
    const buffer = Buffer.from(match[2], 'base64')
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 15MB. Please attach a smaller file, or contact the Office of Communications.' }, { status: 400 })
    }

    const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-120)
    const path = `cert-submissions/${user_id}/${module_id}-${page_id}-${Date.now()}-${safeName}`

    const { error: uploadErr } = await svc.storage.from('bcps-client').upload(path, buffer, {
      contentType: mime,
      upsert: false,
    })
    if (uploadErr) {
      console.error('Cert PDF upload failed:', uploadErr)
      return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
    }

    const record: Record<string, unknown> = {
      user_id, course_id, module_id, page_id,
      submission_file_path: path,
      submission_file_name: filename,
      last_visited_at: new Date().toISOString(),
    }
    const { error: dbErr } = await svc
      .from('wcm_cert_progress')
      .upsert(record, { onConflict: 'user_id,course_id,module_id,page_id' })

    if (dbErr) {
      console.error('Cert PDF progress upsert failed:', dbErr)
      // Clean up the orphaned file so retries don't pile up storage.
      await svc.storage.from('bcps-client').remove([path]).catch(() => {})
      return NextResponse.json({ error: 'Upload saved to storage but the record failed to save. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, path, filename })
  } catch (err) {
    console.error('Cert upload API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: remove a previously attached PDF (the WCM chose to replace it).
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { user_id, course_id, module_id, page_id, path } = body as {
      user_id?: string; course_id?: string; module_id?: string; page_id?: string; path?: string
    }
    if (!user_id || !course_id || !module_id || !page_id || !path) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Only ever remove a file under this exact user's own folder.
    if (!path.startsWith(`cert-submissions/${user_id}/`)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    await svc.storage.from('bcps-client').remove([path]).catch(() => {})
    const { error } = await svc.from('wcm_cert_progress')
      .update({ submission_file_path: null, submission_file_name: null })
      .eq('user_id', user_id).eq('course_id', course_id).eq('module_id', module_id).eq('page_id', page_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Cert upload DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
