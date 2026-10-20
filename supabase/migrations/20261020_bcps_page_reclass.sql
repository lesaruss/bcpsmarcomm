-- Pages a WCM does not manage (Sean, 2026-10-20, Hot Lab with Patricia Sapp,
-- Labor Relations: her audit lists the Equal Educational Opportunities/ADA
-- Compliance pages, which another office keeps up). From the audit's page
-- list the WCM marks those pages for reclassification, with an optional note
-- on who manages them. Until the District Web Team decides, the page's items
-- leave the WCM's walk and do not count toward Request re-audit.
--   open       waiting on the District Web Team
--   kept       it belongs here after all; its items count again
--   moved      moved to moved_to's site (the page is retired here and added
--              there, so the page finder never brings it back)
--   removed    taken off the audit (not a department page)
--   withdrawn  the WCM took the request back
--
-- Service-role only (RLS on, no policies): /api/bcps/site-audit actions
-- reclass, reclass_withdraw (the WCM) and reclass_resolve (admins).
create table if not exists public.bcps_page_reclass_requests (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.bcps_departments(id) on delete cascade,
  site_page_id uuid not null references public.bcps_site_pages(id) on delete cascade,
  note text,
  requested_by text not null,
  requested_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'kept', 'moved', 'removed', 'withdrawn')),
  moved_to uuid references public.bcps_departments(id),
  resolved_by text,
  resolved_at timestamptz
);
create unique index if not exists bcps_page_reclass_open on public.bcps_page_reclass_requests (site_page_id) where status = 'open';
create index if not exists bcps_page_reclass_dept on public.bcps_page_reclass_requests (department_id, status);
alter table public.bcps_page_reclass_requests enable row level security;
