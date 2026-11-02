-- Practice applications for the Public School Impact Application (Sean,
-- 2026-11-03: Glennika D. Gordon should be able to try the whole process on
-- her own, without a call). A project name that starts with TEST marks the
-- application as a practice run: it emails only the address typed in, never
-- copies or alerts the shared inbox, never triggers a due-soon reminder, is
-- left out of the CSV export, and is the only kind staff can delete.
alter table public.bcps_school_impact_applications add column if not exists is_test boolean not null default false;
create index if not exists bcps_school_impact_test_idx on public.bcps_school_impact_applications (is_test) where is_test;
