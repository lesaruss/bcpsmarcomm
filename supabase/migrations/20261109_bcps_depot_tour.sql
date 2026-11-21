-- Charlene's dashboard rework (Sean, 2026-11-09). Applied 2026-11-09.
-- bcps_depot_projects.for_email: the person whose dashboard the project plays on
-- (home API director_video, only when status = ready). bcps_depot_tiles.tour: the
-- tour cue for the tile ({tab, doc?, target}); the director tour is built from the
-- project's tiles in order (home API director_tour), with a tile's recording
-- played once its line matches its words (status voiced or approved).
alter table public.bcps_depot_projects add column if not exists for_email text;
alter table public.bcps_depot_tiles add column if not exists tour jsonb;
-- Charlene's project: for_email set, the out-of-date cut taken off her page, the
-- tiles reordered for the new tabs (Director Guide, ADA / Audit, Banners, Proud
-- Points, Analytics) with tour cues; done with one-time SQL on 2026-11-09.
