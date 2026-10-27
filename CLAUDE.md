# bcpsmarcomm

## Before saying anything is blocked, unreachable, or can't be verified

- Search `public.error_registry` and `public.knowledge_records` first, every time, before those words reach Sean or V. A wall (auth, network, proxy, repo, a page behind login) almost always has a recorded way through. This has been missed ten times (registry `AGENT-BLIND-VERIFICATION-CLAIM`).
- Signed-in pages on bcpsmarcomm.com (anything behind login, gated docs, `/api/bcps/*`): use canon `agent-headless-page-verification`. Its full steps are in registry `QA-VEGAN-OTP-RETIRED-NO-HEADLESS-LOGIN`. The old `qa-vegan-otp` function is retired; do not call it.
- This sandbox cannot load bcpsmarcomm.com directly. Use `pg_net` from SQL, or `mcp__Vercel__web_fetch_vercel_url` for signed-out pages (registry `SANDBOX-EGRESS-403-LIVE-SITE-USE-VERCEL-FETCH`).

## Supabase writes (project fwbhwfxpncrsfhttimna)

- Before the first write, check the error registry (`public.error_registry`) and canon (`public.knowledge_records`, `always_load = true`).
- If `execute_sql` or `apply_migration` times out because "the server asked the user a question", route the write through a one-time edge function in the same turn. That is canon `ops-supabase-write-once-function` and registry `SUPABASE-MCP-APPROVAL-HOLD-USE-ONCE-FUNCTION`. Do not retry the held call, ask Sean to approve a prompt, or offer the dashboard or a hub editor instead.
- The template is public: `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 --filter=blob:none --sparse https://github.com/lesaruss/vegansexplore-com`, then `git sparse-checkout set scripts/supabase-once`. Follow its README, and commit the same SQL as a migration in `supabase/migrations/`.
