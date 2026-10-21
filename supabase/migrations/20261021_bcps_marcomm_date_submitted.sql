-- MarComm Assignments: "Start date" is now "Date submitted" (Sean, 2026-10-21:
-- "reference the date that it was either submitted or created in our Marcom
-- assignments or on Wufoo ... so it's not just an empty date"). The column
-- stays start_date. A new row gets the day it came in (Eastern) by default;
-- Wufoo rows set the Wufoo entry's own day (wufoo-sync). The team can still
-- change it. Existing rows were filled from submitted_at.
-- (A before-insert trigger was tried first; creating it hung, so this is a
-- column default instead.)

alter table public.bcps_marcomm_requests
  alter column start_date set default ((now() at time zone 'America/New_York')::date);

update public.bcps_marcomm_requests
  set start_date = (submitted_at at time zone 'America/New_York')::date
  where start_date is null and submitted_at is not null;
