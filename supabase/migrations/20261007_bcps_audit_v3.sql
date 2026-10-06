-- Department audit v3 (Sean, 2026-10-06): checks come from the WCM
-- Department Certification course (src/lib/dept-standards.ts), each green,
-- red or amber, with screenshots of the audited page so the viewer can pin
-- every finding where it sits. Applied via the Supabase MCP on 2026-10-06.

ALTER TABLE public.bcps_audit_results
  ADD COLUMN IF NOT EXISTS checks jsonb,
  ADD COLUMN IF NOT EXISTS checks_passed integer,
  ADD COLUMN IF NOT EXISTS checks_failed integer,
  ADD COLUMN IF NOT EXISTS checks_review integer,
  ADD COLUMN IF NOT EXISTS screenshots jsonb,
  ADD COLUMN IF NOT EXISTS run_by text;

COMMENT ON COLUMN public.bcps_audit_results.audit_version IS '1 = legacy (synthetic layout/content/nav); 2 = marketing + WCM-owned accessibility; 3 = certification course standards (checks)';
COMMENT ON COLUMN public.bcps_audit_results.checks IS 'v3: [{id,area,title,status pass|fail|review,detail,items,targets[{label,ref|selector,desktop,mobile}],why,steps,course}]';
COMMENT ON COLUMN public.bcps_audit_results.screenshots IS 'v3: {desktop:{path,w,h}, mobile:{path,w,h}} in storage bucket bcps-audit-shots';
COMMENT ON COLUMN public.bcps_audit_results.run_by IS 'Email of whoever started the run (admin or the department WCM); null for scheduled runs';

ALTER TABLE public.bcps_audit_findings DROP CONSTRAINT IF EXISTS bcps_audit_findings_category_check;
ALTER TABLE public.bcps_audit_findings ADD CONSTRAINT bcps_audit_findings_category_check
  CHECK (category = ANY (ARRAY['layout'::text, 'content'::text, 'nav'::text, 'ada'::text, 'marketing'::text, 'standards'::text]));

-- Screenshots of public browardschools.com pages: public read, service-role write.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('bcps-audit-shots', 'bcps-audit-shots', true, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
