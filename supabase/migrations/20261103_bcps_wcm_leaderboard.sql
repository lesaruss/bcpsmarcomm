-- Department WCM leaderboard (Sean, 2026-11-03). Points for this school year,
-- reset every July 1. See the Leaderboard tab of the Department WCM Guide for
-- the public point chart (100 points):
--   certification  up to 40  (by Oct 30: 40, by Nov 5: 30, by Nov 9: 20, later: 10)
--   Hot Labs       up to 30  (3 per session attended, capped at 30)
--   Kickoff        10
--   audit          up to 20  (10 once the department marks its first item,
--                             10 more once half of its findings are fixed)
-- Hot Lab attendance is read live from the Meeting Notes (bcps_brief_recipients,
-- added automatically when a note is posted), so a new note counts with no
-- extra step. bcps_attendance holds everything the notes cannot: the Kickoff
-- roster, Teams attendance CSV rows, workshops, manual corrections.

create table if not exists public.bcps_attendance (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  event_type text not null check (event_type in ('hot_lab', 'kickoff', 'workshop')),
  event_date date not null,
  event_key text not null,
  source text not null default 'roster-list',
  created_at timestamptz not null default now(),
  unique (email, event_key)
);
comment on table public.bcps_attendance is 'Attendance not captured by Meeting Notes recipients: Kickoff roster, Teams attendance CSVs, workshops, manual fixes. Service role only.';
alter table public.bcps_attendance enable row level security;

insert into public.bcps_attendance (email, event_type, event_date, event_key, source)
select lower(e) || '@browardschools.com', 'kickoff', date '2026-09-10', 'kickoff-2026-09-10', 'roster-list'
from unnest(array[
  'mahmmoud.abdeldayem','jennifer.amador','kimberly.annis','czamantha.bello','evena.bowden','janice.brim',
  'sophie.cariveau','lacresha.cooper','matthew.cordova','belinda.daise','marcia.dixon','ana.ferreyra',
  'tia.gale','deanna.greist','celia.jimenez','tanya.jose','karen.kaya','kristin.kupetsky','allan.llanos',
  'angelique.lynch','rmalones','alessandra.mccluskey','fricketts','zuzel.rodriguez','patricia.sapp',
  'ronee.stratman','jtorrella','michael.j.torres','lindsey.way',
  'sharmela.bacchaspersaud','lorena.balharry','jeanette.castro','tracey.ciaccio','theresa.coleman',
  'tamara.duval','berhard','jamie.ferguson','vanasa.luc','alex.macri','laura.marousky','kymarie.mcewan',
  'melissa.s.moore','monica.nelsas','bryan.otoole','gregory.rawls','aeisha.rodriguez','vince.watson'
]) as e
on conflict (email, event_key) do nothing;

create or replace function public.bcps_wcm_leaderboard(p_start date default date '2026-07-01')
returns table (
  email text, name text, department text, certified_at timestamptz,
  cert_points int, hot_labs int, hotlab_points int, kickoff_points int, audit_points int, total int
)
language sql stable security definer set search_path = public as $$
  with members as (
    select distinct on (lower(m.wcm_email))
      lower(m.wcm_email) as email, m.wcm_name as name, r.department_name as department, r.matched_department_id as dept_id
    from bcps_wcm_roster_members m
    join bcps_wcm_roster r on r.id = m.roster_id
    where m.wcm_email is not null and m.wcm_email <> ''
    order by lower(m.wcm_email), m.added_at
  ),
  cert as (
    select lower(u.email) as email, min(c.issued_at) as at
    from wcm_certifications c
    join wcm_cert_users u on u.user_id = c.user_id
    where c.issued_at >= p_start
    group by 1
  ),
  hl as (
    select x.email, count(distinct x.d)::int as n
    from (
      select lower(attendee_email) as email,
             to_date(substring(brief_slug from '(\d{4}-\d{2}-\d{2})$'), 'YYYY-MM-DD') as d
      from bcps_brief_recipients
      where brief_slug ~ '^bcps-hot-lab-dept-wcms-\d{4}-\d{2}-\d{2}$'
      union
      select email, event_date from bcps_attendance where event_type = 'hot_lab'
    ) x
    where x.d >= p_start
    group by x.email
  ),
  ko as (
    select distinct email from bcps_attendance where event_type = 'kickoff' and event_date >= p_start
  ),
  started as (
    select department_id from bcps_audit_check_marks where marked_at >= p_start
    union
    select department_id from bcps_audit_findings where wcm_fixed and created_at >= p_start
  ),
  latest as (
    select department_id, max(round_number) as rn
    from bcps_audit_findings where created_at >= p_start group by 1
  ),
  half as (
    select f.department_id
    from bcps_audit_findings f
    join latest l on l.department_id = f.department_id and l.rn = f.round_number
    group by f.department_id
    having count(*) > 0 and count(*) filter (where f.wcm_fixed) * 2 >= count(*)
  ),
  scored as (
    select
      m.email, m.name, m.department, c.at as certified_at,
      case
        when c.at is null then 0
        when (c.at at time zone 'America/New_York')::date <= date '2026-10-30' then 40
        when (c.at at time zone 'America/New_York')::date <= date '2026-11-05' then 30
        when (c.at at time zone 'America/New_York')::date <= date '2026-11-09' then 20
        else 10
      end as cert_points,
      coalesce(h.n, 0) as hot_labs,
      least(coalesce(h.n, 0) * 3, 30) as hotlab_points,
      case when k.email is not null then 10 else 0 end as kickoff_points,
      (case when m.dept_id in (select department_id from started) then 10 else 0 end)
        + (case when m.dept_id in (select department_id from half) then 10 else 0 end) as audit_points
    from members m
    left join cert c on c.email = m.email
    left join hl h on h.email = m.email
    left join ko k on k.email = m.email
  )
  select s.email, s.name, s.department, s.certified_at, s.cert_points, s.hot_labs, s.hotlab_points,
         s.kickoff_points, s.audit_points,
         (s.cert_points + s.hotlab_points + s.kickoff_points + s.audit_points)::int as total
  from scored s
  order by total desc, s.certified_at asc nulls last, s.name;
$$;

-- Tiles for the top of the Leaderboard tab: certification progress across the
-- department roster, and how many departments are fully certified or have
-- started their audit.
create or replace function public.bcps_wcm_leaderboard_summary(p_start date default date '2026-07-01')
returns jsonb
language sql stable security definer set search_path = public as $$
  with members as (
    select distinct on (lower(m.wcm_email)) lower(m.wcm_email) as email, r.id as roster_id
    from bcps_wcm_roster_members m join bcps_wcm_roster r on r.id = m.roster_id
    where m.wcm_email is not null and m.wcm_email <> ''
    order by lower(m.wcm_email), m.added_at
  ),
  acct as (select lower(email) as email, user_id from wcm_cert_users),
  cert as (
    select a.email from wcm_certifications c join acct a on a.user_id = c.user_id
    where c.issued_at >= p_start group by 1
  ),
  prog as (
    select a.email from wcm_cert_progress p join acct a on a.user_id = p.user_id where p.completed group by 1
  ),
  per as (
    select m.roster_id, m.email,
           (m.email in (select email from cert)) as certified,
           (m.email in (select email from prog)) as in_progress
    from members m
  ),
  dept as (
    select roster_id, count(*) n, count(*) filter (where certified) c from per group by roster_id
  )
  select jsonb_build_object(
    'wcms_total', (select count(*) from per),
    'certified', (select count(*) from per where certified),
    'in_progress', (select count(*) from per where in_progress and not certified),
    'not_started', (select count(*) from per where not in_progress and not certified),
    'departments_total', (select count(*) from dept),
    'departments_complete', (select count(*) from dept where n > 0 and c = n),
    'departments_audit_started', (
      select count(distinct department_id) from (
        select department_id from bcps_audit_check_marks where marked_at >= p_start
        union
        select department_id from bcps_audit_findings where wcm_fixed and created_at >= p_start
      ) s
    )
  );
$$;

revoke all on function public.bcps_wcm_leaderboard(date) from public, anon, authenticated;
revoke all on function public.bcps_wcm_leaderboard_summary(date) from public, anon, authenticated;
grant execute on function public.bcps_wcm_leaderboard(date) to service_role;
grant execute on function public.bcps_wcm_leaderboard_summary(date) to service_role;
