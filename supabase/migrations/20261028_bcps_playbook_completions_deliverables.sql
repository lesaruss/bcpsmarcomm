-- Deliverables Shelf (BCPS Document System, Phase 3, V 2026-10-28): an owner
-- turns in a Shelf slot the same way as a to-do, so a completion can be for a
-- deliverable too.
alter table public.bcps_playbook_completions drop constraint if exists bcps_playbook_completions_item_kind_check;
alter table public.bcps_playbook_completions add constraint bcps_playbook_completions_item_kind_check
  check (item_kind in ('queue', 'action', 'deliverable'));
