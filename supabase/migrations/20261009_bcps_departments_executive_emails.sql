-- Executives a department reports to, who get the Director dashboard for it
-- alongside the department's director (Sean, 2026-10-09). The addresses are
-- set in the database, not in this public repo.
alter table public.bcps_departments add column if not exists executive_emails text[];
