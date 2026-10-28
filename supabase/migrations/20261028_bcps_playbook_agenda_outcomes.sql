-- Agenda outcomes (BCPS Document System, Phase 3, V 2026-10-28): when a
-- meeting's transcript is uploaded, each item on that meeting's saved agenda
-- is matched to its outcome (settled, partly, not covered), reviewed by the
-- lead and written into the agenda record. Items with no outcome two business
-- days after the meeting are flagged to the lead and carried to the next agenda.
alter table public.bcps_playbook_agendas add column if not exists outcomes jsonb;
alter table public.bcps_playbook_agendas add column if not exists outcomes_at timestamptz;
alter table public.bcps_playbook_agendas add column if not exists upload_id uuid;
