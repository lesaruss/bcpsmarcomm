-- Per-account dashboard preferences (Sean, 2026-10-20: "save the stars to my
-- account"). tool_stars holds the Tools & Resources tiles a person starred,
-- as tile keys (t:<tool label>, x:hotlabs, a:<article id>), so the pins follow
-- them to any computer or phone. null means they have never starred anything
-- and their role's usual tools stand in.
--
-- Service-role only (RLS on, no policies): /api/bcps/tool-stars reads and
-- writes the signed-in person's own row.
create table if not exists public.bcps_member_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tool_stars jsonb,
  updated_at timestamptz not null default now()
);
alter table public.bcps_member_prefs enable row level security;
