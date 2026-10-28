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
