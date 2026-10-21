-- Jennifer Hodder, 2026-10-22: the Wufoo questions carried their examples
-- ("What are you requesting (e.g., a flyer, a social media post, press
-- release, video, marketing campaign)?"), often longer than the answer. Drop
-- the examples from the question labels in imported requests; the requester's
-- own words are untouched (only "(e.g./i.e. ...)" right before "?:" or ":").
-- Applied 2026-10-22 (11 requests). New imports drop them in wufoo-sync.
update public.bcps_marcomm_requests
   set description = regexp_replace(description, ' \(((e\.g\.|i\.e\.)[^)]*)\)(\??:)', '\3', 'gi'),
       updated_at = now()
 where description ~* ' \((e\.g\.|i\.e\.)[^)]*\)\??:';
