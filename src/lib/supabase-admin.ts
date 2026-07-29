import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Next.js patches the global fetch and can cache GET requests made through
// it - including the ones @supabase-js makes internally - even on routes
// marked `dynamic = 'force-dynamic'`. That silently served stale rows here
// (a support_access_grants row read back as "approved" for ~30s+ after it
// had actually been closed in Postgres, confirmed via a direct PostgREST
// call bypassing this app). Passing an explicit no-store fetch to the
// client is what actually disables the caching, not the route config.
function noStoreFetch(url: RequestInfo | URL, options: RequestInit = {}) {
  return fetch(url, { ...options, cache: 'no-store' })
}

export function createServiceClient(url: string, serviceKey: string): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch: noStoreFetch },
  })
}

export function createAnonClientWithToken(url: string, anonKey: string, token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
    global: {
      fetch: noStoreFetch,
      headers: { Authorization: `Bearer ${token}` },
    },
  })
}
