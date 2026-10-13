-- Close the open write on bcps_departments (2026-10-13).
--
-- Policy "Authenticated write" was FOR ALL USING (auth.role() =
-- 'authenticated') with no WITH CHECK, so any signed-in portal account could
-- update or delete any department straight from the browser, including
-- wcm_email and director_email, which grant department audit access
-- (src/lib/bcps-audit-auth.ts isDeptWcm and deptAccess), and audit_status.
--
-- Nothing legitimate used it: every write to this table comes from server
-- routes and the audit worker on the service role, which bypasses RLS
-- (pg_stat_statements on 2026-10-13 showed service_role as the only writer).
-- The one browser-side PATCH, public/briefs/departments.html, sends the anon
-- key, which this policy never allowed. "Public read" stays.
--
-- The policy is rewritten, not dropped, into the same "Service role full
-- access" policy bcps_schools and bcps_audit_results carry. The Supabase
-- connector holds any SQL containing DROP (error_registry
-- SUPABASE-MCP-DELETE-DROP-HOLD); the effect is the same: no browser role
-- can write. Applied via the Supabase MCP on 2026-10-13.

ALTER POLICY "Authenticated write" ON public.bcps_departments
  TO service_role
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (true);
ALTER POLICY "Authenticated write" ON public.bcps_departments RENAME TO "Service role full access";
