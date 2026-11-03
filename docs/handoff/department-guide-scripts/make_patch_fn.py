import json
import secrets

BASE = '/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/'
v3 = json.load(open(BASE + 'def-v3.json'))
analytics = next(t for t in v3['tabs'] if t['id'] == 'analytics')
layout = {s['id']: s['layout'] for s in v3['overview']}
changes = v3['changes']

key = secrets.token_hex(24)
open(BASE + 'run-key-v3.txt', 'w').write(key)

code = '''// One-time patch of the Early Childhood Education guide in public.bcps_guides: the Overview layout
// (hero, tiles, wide) and the Analytics tab. Canon ops-supabase-write-once-function (HTML in SQL stalls the connector).
import postgres from 'npm:postgres@3.4.4'

const KEY = '__KEY__'
const LAYOUT: Record<string, string> = __LAYOUT__
const ANALYTICS = __ANALYTICS__
const CHANGES = __CHANGES__

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-run-key') !== KEY) return new Response('not found', { status: 404 })
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  try {
    const out = await sql.begin(async (tx) => {
      const rows = await tx`select def from public.bcps_guides where slug = 'early-childhood-education'`
      if (!rows.length) throw new Error('guide not found')
      const def: any = rows[0].def
      for (const s of def.overview) if (LAYOUT[s.id]) s.layout = LAYOUT[s.id]
      if (!def.tabs.some((t: any) => t.id === 'analytics')) {
        const i = def.tabs.findIndex((t: any) => t.id === 'reference')
        def.tabs.splice(i < 0 ? def.tabs.length : i, 0, ANALYTICS)
      }
      def.changes = CHANGES
      await tx`update public.bcps_guides set def = ${tx.json(def)}, updated_at = now(), updated_by = 'logan' where slug = 'early-childhood-education'`
      return { tabs: def.tabs.map((t: any) => t.id), overview: def.overview.map((s: any) => s.id + ':' + s.layout) }
    })
    return Response.json(out)
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  } finally {
    await sql.end()
  }
})
'''
code = (code.replace('__KEY__', key)
        .replace('__LAYOUT__', json.dumps(layout))
        .replace('__ANALYTICS__', json.dumps(analytics, ensure_ascii=False))
        .replace('__CHANGES__', json.dumps(changes, ensure_ascii=False)))
open(BASE + 'index-patch.ts', 'w').write(code)
print(len(code), 'bytes')
