-- Recordings for the Nov 5 and Nov 10 Hot Labs (links from Sean, 2026-11-10),
-- embedded the same way as earlier sessions, in place of the "recording will be
-- added" note. Applied through execute_sql the same day.
update briefings b set updated_at = now(), content = replace(b.content, '<p class="gap-note">The recording will be added here once it is posted.</p>',
'<div class="recording-embed">
<div class="recording-embed-frame">
<iframe allowfullscreen="" loading="lazy" src="https://browardcountyschools.sharepoint.com/sites/WCMCommunity-Departments/_layouts/15/embed.aspx?id=%2Fsites%2FWCMCommunity-Departments%2FShared%20Documents%2FRecordings%2FDepartment%20WCM%20Hot%20Lab%20%28Current%29-' || v.stamp || '-Meeting%20Recording.mp4" title="Hot Lab session recording"></iframe>
</div>
<details class="video-help">
<summary>Having trouble viewing this video?</summary>
<div class="video-help-body">You will need to be signed in to your BCPS Microsoft 365 account (SharePoint SSO) in this browser to view the recording. If it does not load, sign in at <a href="https://portal.office.com" rel="noopener noreferrer" target="_blank">portal.office.com</a> in this browser, then refresh this page.</div>
</details>
</div>')
from (values ('bcps-hot-lab-dept-wcms-2026-11-05','20261105_140315UTC'), ('bcps-hot-lab-dept-wcms-2026-11-10','20261110_162446UTC')) v(slug, stamp)
where b.slug = v.slug and b.content like '%The recording will be added here once it is posted.%';
