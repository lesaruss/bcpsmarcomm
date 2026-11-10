-- Hot Lab attendance table and the new leaderboard rubric (Sean, 2026-11-10). Applied through apply_migration
-- the same day. The attendance rows (241, from the 22 Teams attendance reports, Aug 25 to Nov 10) were loaded
-- directly into the database and are deliberately not in this public repo: they hold staff emails and meeting times.

create table if not exists public.bcps_hotlab_attendance (
  id bigserial primary key,
  event_date date not null,
  email text not null,
  name text,
  in_meeting_seconds int not null,
  meeting_seconds int not null,
  unmutes int not null default 0,
  raised_hands int not null default 0,
  spoke boolean not null default false,
  scored boolean not null default true,
  source text not null default 'teams-attendance-csv',
  created_at timestamptz not null default now(),
  unique (event_date, email)
);
comment on table public.bcps_hotlab_attendance is 'Department WCM Hot Lab attendance from the Teams attendance reports (Sean, 2026-11-10). One row per person per session: time in the meeting, meeting length, and whether they spoke (named as a speaker in the session notes). Scores the leaderboard: 10 points for half the meeting or more, 5 for less, +5 once per meeting for speaking. scored=false for District Web Team staff. Service role only.';
alter table public.bcps_hotlab_attendance enable row level security;

-- Hot Lab points from the Teams attendance reports (Sean, 2026-11-10): per
-- session, 10 points for staying half the meeting or more, 5 for less, and +5
-- once if named as a speaker. No overall cap (the 100-point chart is retired).
create or replace function public.bcps_wcm_leaderboard(p_start date default '2026-07-01'::date)
 returns table(email text, name text, department text, certified_at timestamp with time zone, cert_points integer, hot_labs integer, hotlab_points integer, kickoff_points integer, audit_points integer, total integer)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    select lower(a.email) as email,
           count(*)::int as n,
           sum((case when a.in_meeting_seconds * 2 >= a.meeting_seconds then 10 else 5 end)
               + (case when a.spoke then 5 else 0 end))::int as pts
    from bcps_hotlab_attendance a
    where a.scored and a.event_date >= p_start
    group by 1
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
      coalesce(h.pts, 0) as hotlab_points,
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
$function$;
