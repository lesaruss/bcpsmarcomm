-- Department audit v2 (Sean, 2026-10-06 Hot Lab). The layout/content/nav
-- half of run-audit was generated with Math.random(); v2 replaces it with
-- real marketing checks (src/lib/dept-audit.ts) and scores accessibility on
-- the rules a WCM can fix. Two halves, equal weight.
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-10-06.

ALTER TABLE public.bcps_audit_results
  ADD COLUMN IF NOT EXISTS audit_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS marketing_score integer,
  ADD COLUMN IF NOT EXISTS marketing_checks jsonb;

COMMENT ON COLUMN public.bcps_audit_results.audit_version IS '1 = legacy (layout/content/nav were synthetic); 2 = marketing + WCM-owned accessibility';
COMMENT ON COLUMN public.bcps_audit_results.marketing_score IS 'v2: weighted share of the 12 marketing checks passed (0-100)';
COMMENT ON COLUMN public.bcps_audit_results.marketing_checks IS 'v2: per-check results [{id,title,weight,passed,detail,steps}]';

ALTER TABLE public.bcps_audit_findings DROP CONSTRAINT IF EXISTS bcps_audit_findings_category_check;
ALTER TABLE public.bcps_audit_findings ADD CONSTRAINT bcps_audit_findings_category_check
  CHECK (category = ANY (ARRAY['layout'::text, 'content'::text, 'nav'::text, 'ada'::text, 'marketing'::text]));
