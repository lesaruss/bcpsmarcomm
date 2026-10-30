-- Applied 2026-10-30 through ve-once-bcps-guide-names (now a 410 stub).
-- The two guides kept their old Playbook names in the Documents catalog, so pinned items and search did not
-- match the guide they open (Sean, 2026-10-30). Catalog and briefing titles now use the guide names.
update public.acl_objects set title='Department WCM Guide', doc_type='Guide', updated_at=now(),
  description='Everything for Department Web Content Managers in one place: registration, certification, your audit, Hot Lab and tools.'
where brand='bcps' and kind='document' and slug='wcm-department';
update public.acl_objects set title='Director Guide', doc_type='Guide', updated_at=now(),
  description='Everything directors need about the Web Content Manager program: your WCMs and their certification, reviews, analytics and how to help.'
where brand='bcps' and kind='document' and slug='director-department';
update public.briefings set title='Department WCM Guide', updated_at=now() where brand_slug='bcps' and slug='wcm-department';
update public.briefings set title='Director Guide', updated_at=now() where brand_slug='bcps' and slug='director-department';
