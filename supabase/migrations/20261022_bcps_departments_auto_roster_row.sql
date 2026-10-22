-- Sean, 2026-10-22: every new department gets a WCM roster row.
-- Project Management Office (added 2026-10-14) and School Choice (added
-- 2026-10-20) went into bcps_departments with no bcps_wcm_roster row. The
-- roster form's department picker and the intake director check
-- (wcm-roster-intake, verifyDirector) both read bcps_wcm_roster, so each
-- department's director submission came in as "No director on file" and was
-- flagged. Both were added by direct SQL, not through an app route, so the
-- guard lives on the table where every insert passes through it.
--
-- Matches the roster's own conventions: upper-case name, location_number
-- 'UNASSIGNED' (as Facilities), tracked (no_website false). An existing
-- unlinked roster row with the same name is linked instead of duplicated. A
-- name already taken by a row linked to another department is left alone
-- (ON CONFLICT DO NOTHING) so a roster clash can never fail the department
-- insert itself.
create or replace function public.bcps_departments_ensure_roster_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from bcps_wcm_roster where matched_department_id = new.id) then
    return new;
  end if;

  update bcps_wcm_roster
     set matched_department_id = new.id,
         director_name = coalesce(director_name, new.director_name),
         updated_at = now()
   where matched_department_id is null
     and lower(trim(department_name)) = lower(trim(new.name));
  if found then
    return new;
  end if;

  insert into bcps_wcm_roster (department_name, location_number, director_name, matched_department_id)
  values (upper(trim(new.name)), 'UNASSIGNED', new.director_name, new.id)
  on conflict (department_name) do nothing;

  return new;
end;
$$;

drop trigger if exists bcps_departments_ensure_roster_row on public.bcps_departments;
create trigger bcps_departments_ensure_roster_row
  after insert on public.bcps_departments
  for each row execute function public.bcps_departments_ensure_roster_row();
