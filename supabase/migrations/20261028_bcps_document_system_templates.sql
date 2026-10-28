-- BCPS Document System, Phase 1 (V, 2026-10-28): five document types with locked templates.
-- Applied 2026-10-28 through the one-time function ve-once-docsys-phase1 (now a 410 stub).
-- 1. The shared BCPS document template (f7037d82) moves to version 2: labeled groups
--    (eyebrow h2 over accordions with h3 titles), Skip to content, On This Page index,
--    status tags in words, plain names. Its rules gain the five rules below.
-- 2. One template row per type: bcps-doc-project-proposal, -project-playbook,
--    -meeting-record, -final-report, -guide (groups, sections, required flags, prompts).
-- Also applied in the same run (content, not repeated here): the preview record
-- bcps-governance-plan-v5-preview under bcps-document-system (md5 166b4588d35b4c55b11d414794f3c47b,
-- readers copied from bcps-document-system) and the bcps-document-system Playbook update
-- recording V's decisions (md5 0dacdc87911b6dd7e832c8a4bcca16bd; previous content in
-- bcps_doc_revisions ee253090-e4a2-4e70-91df-e08e30d0b998).

update public.templates set
  parameters = parameters || jsonb_build_object(
    'html_head', $tpl$<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>School WCM Certification &amp; Audit Communication Plan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
  :root {
    --bcps-blue: #1672A7; --bcps-blue-dark: #0e4e73; --bcps-blue-bg: rgba(22,114,167,0.07); --bcps-blue-border: rgba(22,114,167,0.25);
    --bcps-green: #16750C; --bcps-green-bg: rgba(22,117,12,0.07); --bcps-green-border: rgba(22,117,12,0.30);
    --bcps-orange: #C55326;
    --bg: #f5f5f5; --surface: #ffffff; --surface2: #fafafa; --border: rgba(0,0,0,0.09);
    --text: #1a1a1a; --text-75: rgba(26,26,26,0.78); --text-50: rgba(26,26,26,0.55); --text-30: rgba(26,26,26,0.35);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); font-weight: 400; line-height: 1.6; }
  :focus-visible { outline: 3px solid var(--bcps-blue); outline-offset: 3px; }
  a { color: inherit; text-decoration: none; }
  main { max-width: none; margin: 0; padding: 86px 40px 80px; }
  h1 { font-size: clamp(26px,4vw,44px); font-weight: 900; line-height: 1.0; letter-spacing: -0.02em; text-transform: uppercase; margin-bottom: 18px; }
  h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.22em; color: var(--bcps-blue); margin: 14px 0; }
  h2.lead-heading { color: var(--bcps-green); margin: 0 0 16px; }
  p { font-size: 15px; font-weight: 400; color: var(--text-75); line-height: 1.75; margin-bottom: 14px; }
  p strong { color: var(--text); font-weight: 700; }
  main ul, main ol { margin: 6px 0 18px 22px; }
  main li { font-size: 15px; color: var(--text-75); line-height: 1.75; margin-bottom: 6px; }
  .meta-row { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 32px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
  .meta-item { display: flex; flex-direction: column; gap: 4px; position: relative; }
  .meta-label { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.22em; color: var(--text-30); }
  .meta-value { font-size: 13px; font-weight: 600; color: var(--text); }
  .doc-type-badge { display: inline-block; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.18em; padding: 5px 12px; border-radius: 4px; background: var(--bcps-blue-bg); border: 1px solid var(--bcps-blue-border); color: var(--bcps-blue-dark); }
  .audience-banner { background: var(--bcps-blue-bg); border: 1px solid var(--bcps-blue-border); border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; }
  .audience-banner p { font-size: 13px; color: var(--text-75); margin: 0; }
  .audience-banner p strong { color: var(--bcps-blue-dark); }
  .section-block { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 24px; margin-bottom: 20px; }
  .lead-summary { margin-bottom: 20px; }
  .block-intro { font-size: 13px; color: var(--text-75); line-height: 1.65; margin-bottom: 16px; }
  .agenda-item { padding: 18px 0; border-bottom: 1px solid var(--border); }
  .agenda-item:last-child { border-bottom: none; }
  .agenda-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
  .agenda-step { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.14em; color: var(--bcps-blue); }
  .agenda-title { font-size: 15px; font-weight: 800; color: var(--text); }
  .agenda-time { font-size: 11px; font-weight: 700; color: var(--bcps-orange); text-transform: uppercase; letter-spacing: 0.08em; }
  .agenda-detail { font-size: 13px; color: var(--text-75); line-height: 1.65; }
  .agenda-detail + .agenda-detail { margin-top: 6px; }
  .agenda-detail strong { color: var(--text); }
  .action-item { display: flex; gap: 16px; align-items: flex-start; padding: 16px 0; border-bottom: 1px solid var(--border); }
  .action-item:last-child { border-bottom: none; }
  .action-num { font-size: 20px; font-weight: 900; color: var(--bcps-blue); min-width: 32px; line-height: 1; }
  .action-body .action-title { font-size: 14px; font-weight: 700; color: var(--text); margin-bottom: 4px; }
  .action-body .action-detail { font-size: 13px; color: var(--text-75); line-height: 1.6; }
  .action-body .action-owner { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-50); margin-top: 6px; }
  .action-body .action-deadline { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--bcps-orange); margin-top: 4px; }
  .tag { display: inline-block; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; padding: 3px 8px; border-radius: 4px; margin-left: 6px; background: var(--bcps-blue-bg); border: 1px solid var(--bcps-blue-border); color: var(--bcps-blue-dark); vertical-align: middle; }
  .link-block { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; }
  .link-label { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: var(--text-30); margin-bottom: 6px; }
  .link-url { font-size: 14px; font-weight: 700; color: var(--bcps-blue-dark); word-break: break-all; }
  .link-note { font-size: 12px; color: var(--text-50); margin-top: 4px; }
  .tablist { display: flex; gap: 8px; margin: 0 0 24px; border-bottom: 2px solid var(--border); padding-top: 4px; }
  .tab-btn { appearance: none; border: none; background: none; cursor: pointer; font: inherit; font-weight: 700; font-size: 14px; color: var(--text-50); padding: 12px 16px 14px; border-bottom: 3px solid transparent; margin-bottom: -2px; border-radius: 8px 8px 0 0; display: flex; align-items: center; gap: 8px; }
  .tab-btn:hover { color: var(--text); background: rgba(0,0,0,.03); }
  .tab-btn[aria-selected="true"] { color: var(--bcps-blue-dark); border-bottom-color: var(--bcps-blue); }
  .tab-btn .count { font-size: 11px; font-weight: 800; background: var(--border); color: var(--text-75); border-radius: 99px; padding: 1px 8px; }
  .tab-btn[aria-selected="true"] .count { background: var(--bcps-blue); color: #fff; }
  .tabpanel[hidden] { display: none; }
  details.done, details.held { border-radius: 8px; margin: 0 0 12px; overflow: hidden; }
  details.done { background: var(--bcps-green-bg); border: 1px solid var(--bcps-green-border); }
  details.held { background: var(--bcps-blue-bg); border: 1px solid var(--bcps-blue-border); }
  details.done > summary, details.held > summary { list-style: none; cursor: pointer; font-weight: 700; font-size: 14px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  details.done > summary { color: var(--bcps-green); }
  details.held > summary { color: var(--bcps-blue-dark); }
  details.done > summary::-webkit-details-marker, details.held > summary::-webkit-details-marker { display: none; }
  .grp-count { font-size: 11px; font-weight: 800; background: rgba(0,0,0,.06); color: var(--text-75); border-radius: 99px; padding: 1px 9px; margin-left: auto; margin-right: 8px; }
  details.done > summary::after, details.held > summary::after { content: '+'; font-size: 18px; font-weight: 400; flex: 0 0 auto; color: var(--text-50); line-height: 1; }
  details[open].done > summary::after, details[open].held > summary::after { content: '\2212'; }
  details.done .body, details.held .body { padding: 0 18px 16px; }
  .chk-list { list-style: none; padding-left: 0; margin: 0; }
  .chk-item { display: flex; align-items: flex-start; gap: 9px; padding: 4px 0; font-size: 13px; color: var(--text-75); line-height: 1.6; }
  .chk-box { flex: 0 0 auto; width: 16px; height: 16px; border-radius: 4px; margin-top: 2px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; line-height: 1; }
  .chk-item.pending .chk-box { border: 1.5px solid var(--text-30); background: transparent; }
  .chk-item.done .chk-box { background: var(--bcps-green); color: #fff; }
  details.history { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; margin: 30px 0 0; }
  details.history > summary { list-style: none; cursor: pointer; font-weight: 700; font-size: 13px; padding: 16px 20px; color: var(--text-50); text-transform: uppercase; letter-spacing: 0.1em; }
  details.history > summary::-webkit-details-marker { display: none; }
  details.history .body { padding: 0 20px 20px; }
  details.history h2:first-child { margin-top: 0; }

  /* Top navigation */
  header.bcps-header { position: fixed; top: 0; left: 0; right: 0; z-index: 200; height: 64px; background: #ffffff; border-bottom: 3px solid var(--bcps-blue); display: flex; align-items: center; padding: 0 28px; gap: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .bcps-logo-link { display: flex; align-items: center; }
  .bcps-logo-link:focus-visible { outline: 3px solid var(--bcps-blue); outline-offset: 3px; border-radius: 4px; }
  .bcps-logo { height: 44px; width: auto; display: block; image-rendering: -webkit-optimize-contrast; }
  .bcps-header-divider { width: 1px; height: 32px; background: var(--border); }
  .bcps-header-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: var(--bcps-blue); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Version queue, inline in the meta-row */
  .ver-radio { position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none; }
  .ver { display: none; }
  #ver9:checked ~ .ver-content .ver-9,
  #ver8:checked ~ .ver-content .ver-8,
  #ver7:checked ~ .ver-content .ver-7,
  #ver6:checked ~ .ver-content .ver-6,
  #ver5:checked ~ .ver-content .ver-5,
  #ver4:checked ~ .ver-content .ver-4,
  #ver3:checked ~ .ver-content .ver-3,
  #ver2:checked ~ .ver-content .ver-2,
  #ver1:checked ~ .ver-content .ver-1 { display: block; }
  details.ver-dd-inline { position: static; }
  details.ver-dd-inline > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; }
  details.ver-dd-inline > summary::-webkit-details-marker { display: none; }
  details.ver-dd-inline > summary .caret { font-size: 16px; line-height: 1; color: var(--text-50); transition: transform 0.15s; }
  details.ver-dd-inline[open] > summary .caret { transform: rotate(180deg); }
  details.ver-dd-inline .ver-menu { position: absolute; top: 100%; left: 0; margin-top: 8px; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.14); padding: 6px; min-width: 300px; max-width: calc(100vw - 32px); z-index: 50; }
  .ver-menu label { display: block; padding: 10px 12px; border-radius: 6px; cursor: pointer; }
  .ver-menu label:hover { background: var(--surface2); }
  .ver-menu label.is-current { background: rgba(22,114,167,0.09); }
  .ver-menu .vlabel { font-size: 13px; font-weight: 800; color: var(--text); }
  .ver-menu .vlabel .current-badge { font-size: 9px; font-weight: 800; color: var(--bcps-green); text-transform: uppercase; letter-spacing: 0.08em; margin-left: 6px; }
  .ver-menu .vdesc { display: block; font-size: 11px; color: var(--text-50); margin-top: 2px; }

  /* Collapsible sections (default closed) */
  details.doc-accordion { margin-bottom: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); overflow: hidden; }
  details.doc-accordion > summary { list-style: none; cursor: pointer; padding: 4px 20px; display: flex; align-items: center; }
  details.doc-accordion > summary::-webkit-details-marker { display: none; }
  details.doc-accordion > summary h2 { margin: 14px 0; }
  details.doc-accordion > summary::after { content: "+"; margin-left: auto; padding-left: 12px; font-size: 20px; font-weight: 700; color: var(--bcps-blue); }
  details.doc-accordion[open] > summary::after { content: "\2212"; }
  details.doc-accordion > .section-block { border: none; border-top: 1px solid var(--border); border-radius: 0; margin-bottom: 0; }
  details.doc-accordion > .tablist-wrap { border-top: 1px solid var(--border); padding: 20px; }
  details.doc-accordion.nested { margin: 12px 0 0; }
  details.doc-accordion.nested > summary { padding: 12px 16px; font-size: 13px; font-weight: 800; color: var(--bcps-blue-dark); }
  details.doc-accordion.nested > summary::after { font-size: 16px; }
  details.doc-accordion.nested > .section-block { padding: 6px 18px 12px; }

  @media (max-width: 640px) {
    main { padding: 84px 16px 64px; }
    header.bcps-header { padding: 0 16px; gap: 12px; }
    .bcps-logo { height: 36px; }
    .section-block { padding: 18px; }
    details.doc-accordion > summary { padding: 4px 16px; }
  }

  /* Labeled groups (BCPS Document System, V 2026-10-28): eyebrow h2 over accordions with h3 titles */
  .skip-link { position: absolute; left: -9999px; top: 8px; background: #fff; padding: 8px 12px; border: 2px solid var(--bcps-blue); z-index: 300; font-weight: 700; }
  .skip-link:focus { left: 16px; }
  nav.page-index { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px 20px; margin: 0 0 28px; }
  nav.page-index .pi-label { font-size: 13px; font-weight: 800; color: var(--text-50); margin: 0 0 8px; }
  nav.page-index ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px 22px; }
  nav.page-index li { margin: 0; font-size: 14px; }
  nav.page-index a { color: var(--bcps-blue-dark); font-weight: 700; text-decoration: underline; }
  nav.page-index .pi-count { color: var(--text-50); font-weight: 600; font-size: 12px; margin-left: 6px; }
  section.doc-group { margin: 34px 0 0; scroll-margin-top: 80px; }
  h2.eyebrow { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--bcps-blue-dark); border-top: 2px solid var(--bcps-blue); padding-top: 12px; margin: 0 0 4px; }
  .group-note { font-size: 13px; color: var(--text-50); margin: 0 0 12px; }
  details.doc-accordion > summary h3 { font-size: 15px; font-weight: 800; color: var(--text); margin: 14px 0; }
  main h4 { font-size: 13px; font-weight: 800; color: var(--text); margin: 16px 0 6px; }
  .status-tag { display: inline-block; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 8px; border-radius: 4px; margin-left: 10px; vertical-align: middle; border: 1px solid var(--text-30); color: var(--text-75); background: #fff; }
  .status-tag.done { border-color: var(--bcps-green); color: var(--bcps-green); }
  .missing-note { font-size: 13px; color: var(--text-75); border-left: 3px solid var(--text-30); padding: 6px 12px; margin: 0; }
  @media (max-width: 640px) { nav.page-index ol { flex-direction: column; } }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
</style>
<style id="bcps-phone-ver-fix">@media (max-width: 640px) { .meta-row { position: relative; } .meta-row .meta-item:has(details.ver-dd-inline) { position: static; } details.ver-dd-inline .ver-menu { min-width: min(300px, 100%); } .tablist { flex-wrap: wrap; } }</style></head>
$tpl$::text,
    'body_skeleton', $tpl$<body>
<a class="skip-link" href="#content">Skip to content</a>
<header class="bcps-header" role="banner"><a class="bcps-logo-link" href="/?page=dashboard" aria-label="Back to the BCPS MarComm dashboard"><img src="https://resources.finalsite.net/images/f_auto,q_auto/v1722824051/browardschoolscom/wwnjoznupmdrvqlgbnip/00DistrictDemoLogo.png" alt="Broward County Public Schools" class="bcps-logo"></a><div class="bcps-header-divider" aria-hidden="true"></div><span class="bcps-header-title">BCPS MarComm &middot; {{SHORT_TITLE}}</span></header>
<main id="content">
  <input class="ver-radio" type="radio" name="docver" id="ver{{N}}" checked>
  <div class="ver-content">
  <div class="ver ver-{{N}}">
  <h1>{{TITLE}}</h1>
  <div class="meta-row"><div class="meta-item"><span class="meta-label">Type</span><span class="meta-value"><span class="doc-type-badge">{{TYPE_LABEL}}</span></span></div>{{META_ITEMS_HTML}}<div class="meta-item"><span class="meta-label">Version</span><span class="meta-value"><details class="ver-dd-inline"><summary><span class="cur">v{{N}} &#183; {{DATE}}</span><span class="caret">&#9662;</span></summary><div class="ver-menu">{{VERSION_LABELS_HTML}}</div></details></span></div></div>
  <div class="audience-banner"><p><strong>For:</strong> {{AUDIENCE}}</p></div>
  <nav class="page-index" aria-label="On this page"><p class="pi-label">On this page</p><ol>{{GROUP_LINKS_WITH_COUNTS}}</ol></nav>
  <h2 class="lead-heading">{{LEAD_HEADING}}</h2>
  <div class="section-block lead-summary">{{LEAD_HTML}}</div>
  <!-- One section per group from the type template, in order. The last two are always Your To-Do List, then Resources and History. -->
  <section class="doc-group" aria-labelledby="g-{{KEY}}"><h2 class="eyebrow" id="g-{{KEY}}">{{GROUP}}</h2><p class="group-note">{{GROUP_NOTE}}</p>
    <details class="doc-accordion"><summary><h3>{{SECTION_TITLE}}<!-- required: --> <span class="status-tag">Missing</span></h3></summary><div class="section-block">{{SECTION_HTML or <p class="missing-note">Missing: what belongs here, who owns it, when it is due.</p>}}</div></details>
  </section>
  <!-- Your To-Do List holds Still to Do and Done: <details class="doc-accordion"><summary><h3>Still to Do and Done</h3></summary><div class="tablist-wrap">tabs Still to Do / Done + held/done groups</div></details> -->
  <!-- Resources and History ends with <details class="history"><summary>Version History</summary>...</details> -->
  </div>
  </div>
</main>
<script>/* tab switching, same as reference */</script>
</body>
</html>$tpl$::text,
    'rules', coalesce(parameters->'rules', '[]'::jsonb) || $tpl$["Labeled groups (V, 2026-10-28, BCPS Document System): every document is one of five types, each with its own template row (subtype bcps-doc-<type>) listing its groups and sections. Four or five groups per page, at most five accordions per group; the last two groups are always Your To-Do List, then Resources and History.", "Headings: h1 title; the open lead heading and each group eyebrow are h2; accordion titles h3; headings inside a section h4. A Skip to content link and an On This Page index (groups only, with counts) sit above the lead.", "Status in words on required sections: Missing (neutral outline), Draft, Done (green). An empty required section holds one sentence: what belongs there, who owns it, when it is due. A section that receives content from a meeting or an owner turns Draft until a person confirms it.", "Plain names: Your To-Do List with Still to Do and Done tabs (was Work Queue, Pending, Completed); Decisions Made (was Key Decisions); Version History (was Decision History); Turn in my work (owner button); Add Meeting Notes and Publish Update (transcript). Stages: Idea, Planning, In Progress, Wrapping Up, Done.", "What AI may change: on its own, only filing and formatting what a person already did (an owner's own turn-in, attachments, meeting notes marked as an AI summary, agenda drafts). A person reviews decisions, owners, dates, numbers, stage and section rewrites. AI never writes about named students, personnel or legal matters, or sign-off fields."]$tpl$::jsonb,
    'types', $tpl$["bcps-doc-project-proposal", "bcps-doc-project-playbook", "bcps-doc-meeting-record", "bcps-doc-final-report", "bcps-doc-guide"]$tpl$::jsonb),
  version = 2, updated_at = now()
where id = 'f7037d82-c5e2-4997-8631-aa68993157a4' and version = 1;

insert into public.templates (type, subtype, brand, title, description, source_ref, parameters, version, status, created_by)
select 'document', 'bcps-doc-project-proposal', 'bcps', $tpl$BCPS Project Proposal$tpl$, $tpl$Gets a yes or no from the person who decides. When approved it becomes the Project Playbook, carrying its content forward; when declined it is kept with the reason.$tpl$, 'bcps-document-system',
  $tpl${"key": "project-proposal", "title": "BCPS Project Proposal", "label": "Project Proposal", "description": "Gets a yes or no from the person who decides. When approved it becomes the Project Playbook, carrying its content forward; when declined it is kept with the reason.", "stages": ["Idea", "Submitted", "Approved", "Declined"], "meta": ["Requested By", "Decision Maker", "Decide By", "Status"], "lead": {"heading": "The Ask", "prompt": "What we want, what it costs in money and staff time, and the date we need a decision."}, "groups": [{"eyebrow": "The Case", "sections": [{"title": "The Problem", "required": true, "prompt": "What is not working, for whom, and how we know."}, {"title": "Who It Serves", "required": true, "prompt": "The people who benefit and how."}, {"title": "Our Recommendation", "required": true, "prompt": "What we propose, in one or two paragraphs."}, {"title": "Other Options We Considered", "required": false, "prompt": "Alternatives and why we did not pick them."}]}, {"eyebrow": "The Plan", "sections": [{"title": "What Is In and Out", "required": true, "prompt": "What this covers and what it does not."}, {"title": "What We Will Deliver", "required": true, "prompt": "Each deliverable, one line each."}, {"title": "Key Dates", "required": true, "prompt": "Start, milestones, finish."}, {"title": "Who Does What", "required": true, "prompt": "Sponsor, lead, backup lead, who signs off, who is kept informed."}]}, {"eyebrow": "Fit and Risk", "sections": [{"title": "How This Supports the Strategic Plan", "required": false, "prompt": ""}, {"title": "Equity and Access", "required": false, "prompt": ""}, {"title": "Risks and What We Depend On", "required": false, "prompt": ""}, {"title": "Cost or Staff Time", "required": false, "prompt": "Required when money is involved."}]}, {"eyebrow": "Your To-Do List", "fixed": true, "sections": [{"title": "Approvals Needed", "required": false, "prompt": ""}, {"title": "Sponsor Approval", "required": true, "prompt": "Typed by the sponsor. Never filled by AI."}]}, {"eyebrow": "Resources and History", "fixed": true, "sections": [{"title": "Files and Links", "required": false, "prompt": ""}, {"title": "Decisions Made", "required": false, "prompt": ""}]}], "base_template_id": "f7037d82-c5e2-4997-8631-aa68993157a4"}$tpl$::jsonb, 1, 'active', 'logan'
where not exists (select 1 from public.templates where subtype = 'bcps-doc-project-proposal' and brand = 'bcps');
insert into public.templates (type, subtype, brand, title, description, source_ref, parameters, version, status, created_by)
select 'document', 'bcps-doc-project-playbook', 'bcps', $tpl$BCPS Project Playbook$tpl$, $tpl$The home of a project while the work happens. A Campaign or Event variant adds Event Day and Results groups (workshops, Hot Labs, enrollment pushes).$tpl$, 'bcps-document-system',
  $tpl${"key": "project-playbook", "title": "BCPS Project Playbook", "label": "Project Playbook", "description": "The home of a project while the work happens. A Campaign or Event variant adds Event Day and Results groups (workshops, Hot Labs, enrollment pushes).", "stages": ["Planning", "In Progress", "Wrapping Up", "Done"], "meta": ["Lead", "Prepared by", "Stage"], "lead": {"heading": "At a Glance", "prompt": "Goal in one sentence, who it serves, where it stands, next milestone, and what we need from you."}, "groups": [{"eyebrow": "The Plan", "sections": [{"title": "Why We Are Doing This", "required": false, "prompt": ""}, {"title": "What Success Looks Like", "required": true, "prompt": "How we will know it worked."}, {"title": "Timeline and Milestones", "required": true, "prompt": "Dates that matter, in order."}, {"title": "Who Is Involved", "required": true, "prompt": "Lead, backup lead, sponsor, team, and who does what."}, {"title": "Audience and Key Messages", "required": true, "prompt": "Required for communications projects: who we need to reach and the two or three messages each should hear."}]}, {"eyebrow": "The Details", "flexible": true, "note": "Up to five project-specific sections (data, options, standards, best practices). Rename the group if a better label fits.", "sections": []}, {"eyebrow": "Questions and Risks", "sections": [{"title": "Open Questions", "required": true, "prompt": "Empty or assigned before Wrapping Up."}, {"title": "Concerns to Watch", "required": true, "prompt": "Risks that could stall the work, and who is watching each."}]}, {"eyebrow": "Your To-Do List", "fixed": true, "sections": [{"title": "Next Meeting Agenda", "required": true, "prompt": "Built from overdue to-dos, open questions and Missing sections; the lead edits before sending."}, {"title": "Action Items", "required": false, "prompt": ""}, {"title": "Still to Do and Done", "required": false, "prompt": ""}, {"title": "Deliverables Shelf", "required": true, "prompt": "One slot per deliverable, each turned in before Wrapping Up."}]}, {"eyebrow": "Resources and History", "fixed": true, "sections": [{"title": "Past Meeting Notes", "required": false, "prompt": ""}, {"title": "Files and Links", "required": false, "prompt": ""}, {"title": "Decisions Made", "required": false, "prompt": ""}]}], "variants": {"campaign-or-event": {"add_groups": [{"eyebrow": "Event Day", "sections": [{"title": "Logistics", "required": false, "prompt": ""}, {"title": "Roles", "required": false, "prompt": ""}]}, {"eyebrow": "Results", "sections": [{"title": "How We Will Measure It", "required": false, "prompt": ""}, {"title": "Recap", "required": false, "prompt": ""}]}], "insert_after": "Questions and Risks"}}, "base_template_id": "f7037d82-c5e2-4997-8631-aa68993157a4"}$tpl$::jsonb, 1, 'active', 'logan'
where not exists (select 1 from public.templates where subtype = 'bcps-doc-project-playbook' and brand = 'bcps');
insert into public.templates (type, subtype, brand, title, description, source_ref, parameters, version, status, created_by)
select 'document', 'bcps-doc-meeting-record', 'bcps', $tpl$BCPS Meeting Record$tpl$, $tpl$The agenda before a meeting and the notes after it, always filed under a Playbook. The notes come from the transcript and match back to the agenda items.$tpl$, 'bcps-document-system',
  $tpl${"key": "meeting-record", "title": "BCPS Meeting Record", "label": "Meeting Record", "description": "The agenda before a meeting and the notes after it, always filed under a Playbook. The notes come from the transcript and match back to the agenda items.", "stages": ["Agenda", "Notes Filed"], "meta": ["Playbook", "Meeting date", "Uploaded by"], "lead": {"heading": "Summary", "prompt": "What the meeting covered and changed."}, "groups": [{"eyebrow": "The Meeting", "sections": [{"title": "Agenda", "required": false, "prompt": ""}, {"title": "Who Attended", "required": false, "prompt": ""}]}, {"eyebrow": "What We Decided", "sections": [{"title": "Decisions", "required": false, "prompt": ""}, {"title": "Open Questions", "required": false, "prompt": ""}]}, {"eyebrow": "Your To-Do List", "fixed": true, "sections": [{"title": "Action Items", "required": false, "prompt": ""}]}, {"eyebrow": "Resources and History", "fixed": true, "sections": [{"title": "Transcript Source", "required": false, "prompt": ""}, {"title": "Related Documents", "required": false, "prompt": ""}]}], "base_template_id": "f7037d82-c5e2-4997-8631-aa68993157a4"}$tpl$::jsonb, 1, 'active', 'logan'
where not exists (select 1 from public.templates where subtype = 'bcps-doc-meeting-record' and brand = 'bcps');
insert into public.templates (type, subtype, brand, title, description, source_ref, parameters, version, status, created_by)
select 'document', 'bcps-doc-final-report', 'bcps', $tpl$BCPS Final Report$tpl$, $tpl$What was delivered, what we learned, and who owns it now. Built from the Playbook at Wrapping Up; closes with the sponsor's sign-off. Modeled on the WCM Kickoff Final Report.$tpl$, 'bcps-document-system',
  $tpl${"key": "final-report", "title": "BCPS Final Report", "label": "Final Report", "description": "What was delivered, what we learned, and who owns it now. Built from the Playbook at Wrapping Up; closes with the sponsor's sign-off. Modeled on the WCM Kickoff Final Report.", "stages": ["Draft", "Signed Off"], "meta": ["Lead", "Project Dates", "Status"], "lead": {"heading": "Results in Brief", "prompt": "What we set out to do, what happened, three numbers, and what comes next."}, "groups": [{"eyebrow": "Results", "sections": [{"title": "Goals and Outcomes", "required": true, "prompt": "Pulled from the Proposal."}, {"title": "What We Delivered", "required": true, "prompt": "Pulled from the Deliverables Shelf."}, {"title": "By the Numbers", "required": false, "prompt": ""}, {"title": "What People Said", "required": false, "prompt": ""}]}, {"eyebrow": "What We Learned", "sections": [{"title": "What Worked", "required": false, "prompt": ""}, {"title": "What We Would Change", "required": false, "prompt": ""}]}, {"eyebrow": "What Happens Next", "sections": [{"title": "Recommendations", "required": false, "prompt": ""}, {"title": "Handoff and Owners", "required": true, "prompt": "Who owns each piece now."}]}, {"eyebrow": "Your To-Do List", "fixed": true, "sections": [{"title": "Sponsor Sign-Off", "required": true, "prompt": "Typed by the sponsor. Never filled by AI."}]}, {"eyebrow": "Resources and History", "fixed": true, "sections": [{"title": "Files and Links", "required": false, "prompt": ""}, {"title": "Decisions Made", "required": false, "prompt": ""}]}], "base_template_id": "f7037d82-c5e2-4997-8631-aa68993157a4"}$tpl$::jsonb, 1, 'active', 'logan'
where not exists (select 1 from public.templates where subtype = 'bcps-doc-final-report' and brand = 'bcps');
insert into public.templates (type, subtype, brand, title, description, source_ref, parameters, version, status, created_by)
select 'document', 'bcps-doc-guide', 'bcps', $tpl$BCPS Guide or Standard$tpl$, $tpl$Reference that outlives any one project: how-to guides, standards, program handbooks. No stage; an owner and a review date instead.$tpl$, 'bcps-document-system',
  $tpl${"key": "guide", "title": "BCPS Guide or Standard", "label": "Guide or Standard", "description": "Reference that outlives any one project: how-to guides, standards, program handbooks. No stage; an owner and a review date instead.", "stages": [], "meta": ["Owner", "Review By"], "lead": {"heading": "What This Is For", "prompt": "Who it is for and what it helps them do."}, "groups": [{"eyebrow": "The Guide", "flexible": true, "note": "One accordion per step or topic, nested when long.", "sections": []}, {"eyebrow": "Your To-Do List", "fixed": true, "sections": [{"title": "Review Due", "required": true, "prompt": "The owner confirms it is still right by the review date."}]}, {"eyebrow": "Resources and History", "fixed": true, "sections": [{"title": "Related Guides", "required": false, "prompt": ""}, {"title": "Earlier Versions", "required": false, "prompt": ""}]}], "base_template_id": "f7037d82-c5e2-4997-8631-aa68993157a4"}$tpl$::jsonb, 1, 'active', 'logan'
where not exists (select 1 from public.templates where subtype = 'bcps-doc-guide' and brand = 'bcps');
