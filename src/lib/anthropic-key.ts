import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase-admin'

// The key lives in the vault (lesaruss_secrets.ANTHROPIC_API_KEY), read with
// the service role the same way audit-worker reads its key; an env var wins
// if one is ever set on the project.
export async function anthropicKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  const lesaruss = createServiceClient(process.env.LESARUSS_SUPABASE_URL!, process.env.LESARUSS_SUPABASE_SERVICE_KEY!)
  const { data } = await lesaruss.from('lesaruss_secrets').select('value').eq('key', 'ANTHROPIC_API_KEY').maybeSingle()
  return (data?.value as string) || null
}

// One structured answer from Claude: the reply is JSON matching the schema.
export async function askClaudeJson(model: string, schema: Record<string, unknown>, system: string, content: string): Promise<Record<string, unknown>> {
  const key = await anthropicKey()
  if (!key) throw new Error('The Claude key is not set up for this site.')
  const client = new Anthropic({ apiKey: key })
  const msg = await client.beta.messages.stream({
    model,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  }).finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request.')
  return JSON.parse(msg.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
}
