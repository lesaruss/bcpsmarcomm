import json
import secrets

BASE = '/tmp/claude-0/-home-user-bcpsmarcomm/9cd69df2-9574-5317-a1e6-9dedb578c0ca/scratchpad/ece-guide/'
key = secrets.token_hex(24)
open(BASE + 'run-key.txt', 'w').write(key)

d = json.dumps(json.load(open(BASE + 'def.json')), ensure_ascii=False, separators=(',', ':'))
TAG = '$ecedef$'
assert '`' not in d and '${' not in d and TAG not in d

code = '''// One-time write of the Early Childhood Education guide definition into public.bcps_guides
// (canon ops-supabase-write-once-function). HTML payloads stall the Supabase connector, so this is the delivery route.
import postgres from 'npm:postgres@3.4.4'

const KEY = '__KEY__'
const DEF = String.raw`__DEF__`
const STEPS: Record<string, string> = {
  guide: `insert into public.bcps_guides (slug, def, updated_by) values ('early-childhood-education', __TAG__${DEF}__TAG__::jsonb, 'logan') on conflict (slug) do update set def = excluded.def, updated_at = now(), updated_by = 'logan';`,
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-run-key') !== KEY) return new Response('not found', { status: 404 })
  const step = new URL(req.url).searchParams.get('step') || ''
  if (!STEPS[step]) return Response.json({ error: 'unknown_step' }, { status: 400 })
  const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
  try {
    const out = await sql.begin(async (tx) => {
      const r: any = await tx.unsafe(STEPS[step])
      const counts = Array.isArray(r) && Array.isArray(r[0]) ? r.map((x: any) => x.count) : [r.count]
      return { step, counts }
    })
    return Response.json(out)
  } catch (e) {
    return Response.json({ step, error: String(e) }, { status: 500 })
  } finally {
    await sql.end()
  }
})
'''
code = code.replace('__KEY__', key).replace('__DEF__', d).replace('__TAG__', TAG)
open(BASE + 'index.ts', 'w').write(code)
print(len(code), 'bytes; key stored in run-key.txt')
