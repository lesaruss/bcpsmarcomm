-- Platform request form job numbers (V, 2026-10-28). The form took its job
-- numbers from bcps_marcomm_job_seq, the sequence the Wufoo sync advances to
-- the latest Wufoo entry, so a form request could take the number Wufoo would
-- give its next entry, and that entry was skipped on import. While both forms
-- are live, form requests get their own range starting at 5001. Wufoo entries
-- keep their entry numbers (1762 on this date). bcps_marcomm_job_seq stays for
-- bcps_marcomm_bump_job_seq.
create sequence if not exists public.bcps_marcomm_form_job_seq start with 5001;

create or replace function public.bcps_marcomm_next_job() returns integer
language sql security definer set search_path = public as $$
  select nextval('public.bcps_marcomm_form_job_seq')::integer
$$;
revoke all on function public.bcps_marcomm_next_job() from public, anon, authenticated;
revoke all on sequence public.bcps_marcomm_form_job_seq from public, anon, authenticated;
