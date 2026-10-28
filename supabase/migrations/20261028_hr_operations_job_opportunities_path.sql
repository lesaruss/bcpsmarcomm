-- HR Operations' job-opportunity pages live under /bcps-departments/hr-operations/
-- (job opportunities, transportation positions, food service) as well as its
-- main section under /human-resources/hr-operations. Counted as its traffic.
update public.bcps_departments
set previous_paths = (select array_agg(distinct x) from unnest(previous_paths || array['/bcps-departments/hr-operations']) x), updated_at = now()
where id = '8a9adfdc-a368-4fed-88e9-4d411831551e';
