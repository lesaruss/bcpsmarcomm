---
name: bcps-brief
description: Generate a BCPS-styled meeting brief from a transcript or notes, push it live to hq.lesaruss.ai, and log it as a Studio task under the BCPS client. USE THIS SKILL automatically whenever Sean drops meeting notes, a transcript, a Fieldy recording, or raw notes and asks to produce a brief, make a link, add to Studio, document a meeting, or mentions BCPS minutes, governance notes, or any BCPS meeting documentation. Also fires when the K12 Unlocked minutes module or BCPS pipeline is mentioned alongside any meeting content. The output is always a sharable hq.lesaruss.ai URL.
---

# BCPS Brief Generator

Converts raw meeting transcripts or notes into a polished BCPS-branded HTML brief, pushes it live to both hq.lesaruss.ai and k12unlocked.com via their GitHub repos, and logs a Studio project entry under the BCPS client.

---

## What you produce

A self-contained HTML file using the BCPS visual system. These values are locked - do not substitute or invent alternatives:

| Token | Value |
|-------|-------|
| Font | Montserrat (Google Fonts, weights 400/600/700/800/900) |
| Primary blue | #1672A7 |
| Dark blue | #0e4e73 |
| Accent green | #16750C (decisions, resolutions) |
| Accent orange | #C55326 (deadlines, action owners) |
| Pulse orange | #E8650A |
| Canvas | #f5f5f5 |
| Surface cards | #ffffff |
| Background | white only - never dark mode |

The document always has a fixed BCPS header bar (white, 3px bottom border in #1672A7) and uses the CSS variable system from the template.

**LOGO RULE - NON-NEGOTIABLE:** Every brief must display the BCPS district logo in the header. Use the template in assets/template.html - the logo img tag is already wired in. Never omit it.

---

## HARD RULES (non-negotiable)

### Attendee names and titles

**RULE: Attendee names and titles MUST come from the wcm_cert_users table. Never infer, guess, or derive them from transcript context.**

Before building any brief, run this query:

```sql
SELECT full_name, department, email, is_admin
FROM public.wcm_cert_users
ORDER BY full_name;
```

Match each name that appears in the transcript against this table:
- Match found: use `full_name` as the attendee name and `department` as the title. Never override with transcript wording.
- No match found: use the name as it appears in the transcript, set `attendee-title` to "Unverified - confirm title and department", and flag this in a comment before delivering the brief.

Sean A. Russell is always: "Sean A. Russell, District Webmaster, Office of Communications" - this is locked regardless of what the transcript says.

### Pulse widget

Every brief MUST include the Pulse widget. Copy it verbatim from assets/template.html. Replace:
- `{{SUPABASE_ANON_KEY}}` with the anon key from lesaruss_secrets
- `{{SLUG}}` with the brief slug

The Pulse widget is: an orange diamond fixed in the bottom-left corner of the page. Clicking it opens a message panel. Messages post to the `pulse_messages` table in Supabase.

### No em-dashes

Zero tolerance. Use comma, colon, or plain hyphen. Check the entire HTML before pushing.

### Series field

Every brief must include the Series meta field. Derive it from the meeting title and recurrence pattern in the transcript. Common values: "Recurring - Mondays and Thursdays", "One-time", "Monthly". Never leave blank.

### Recording link

If a Teams or Zoom recording URL is present in the transcript or source, include the recording bar. If no recording URL is available, omit the recording bar entirely - do not include a placeholder.

---

## Step-by-step workflow

### Step 1 - Load attendee roster

Before reading the transcript, query wcm_cert_users:

```sql
SELECT full_name, department, email, is_admin
FROM public.wcm_cert_users
ORDER BY full_name;
```

Hold this list in context. This is the only valid source for attendee names and titles.

### Step 2 - Extract from the source

Read the transcript or notes and pull out:

- Meeting title, date, series/recurrence pattern, platform (Teams, Zoom, in-person, phone, etc.)
- Attendee names - cross-reference against wcm_cert_users immediately
- Recording URL if present
- Session overview bullet points (high-level narrative of what was covered)
- Key decisions made, including rationale if present
- Action items with owner and deadline
- Open questions flagged but not yet resolved
- Follow-up meeting dates or next steps confirmed

If something is ambiguous or missing, use what is in the source and note the gap inline. Do not fabricate details.

Build the slug using this pattern: `bcps-[short-topic]-[YYYY-MM-DD]`
Example: `bcps-analytics-governance-2026-05-22`

### Step 3 - Build the HTML brief

Use the BCPS HTML template in `assets/template.html`. Read it now. Key structural rules:

**Required sections in order:**
1. Fixed BCPS header bar with district logo
2. H1 meeting title
3. Meta row: Date, Series, Platform, Attendees count, Version
4. Recording bar (only if recording URL exists)
5. Audience banner
6. Session Overview (bullet list using .overview-list)
7. Attendees grid (from wcm_cert_users lookup - see hard rules above)
8. Key Decisions (.decision-item blocks)
9. Action Items (numbered .action-item blocks)
10. Open Issues (omit entirely if none)
11. Next Steps / Timeline (.timeline-row blocks)
12. Pulse widget (orange diamond, fixed bottom-left)

Style rules:
- Decisions use the green decision-item / outcome-banner pattern
- Action items use numbered .action-item blocks with .action-owner (gray) and .action-deadline (orange)
- Open issues use .tag.open, .tag.resolved, .tag.pending badges
- Version line in meta row: `v1 - [date produced]`

### Step 4 - Log distribution to bcps_brief_recipients

After building the brief, insert one row per confirmed attendee into bcps_brief_recipients:

```sql
INSERT INTO bcps_brief_recipients (brief_slug, attendee_name, attendee_email, wcm_user_id, added_by)
SELECT
  '[slug]',
  full_name,
  email,
  id,
  'auto'
FROM public.wcm_cert_users
WHERE full_name IN ([comma-separated names from attendee list]);
```

Distribution rule: Only confirmed attendees receive the brief unless an admin overrides.
- `is_admin = true` in wcm_cert_users = admin. Admins always receive all briefs regardless of attendance.
- If a member's name is not in the attendee list and is not an admin, they must not be added without a manual override logged in `override_added_by`.

### Step 5 - Push to both repos

All BCPS briefs go to TWO repos:

**Primary (public-facing):**
```
PUT https://api.github.com/repos/lesaruss/k12-unlocked/contents/public/bcps/[slug].html
```
Live at: `k12unlocked.com/bcps/[slug].html`

**Mirror (HQ reference):**
```
PUT https://api.github.com/repos/lesaruss/lesaruss-hq/contents/public/briefs/[slug].html
```
Live at: `hq.lesaruss.ai/briefs/[slug].html`

Steps for each:
1. Get credentials:
   ```sql
   SELECT key, value FROM public.lesaruss_secrets WHERE key IN ('GITHUB_TOKEN', 'SUPABASE_ANON_KEY');
   ```
   Supabase project ID: `fwbhwfxpncrsfhttimna`

2. Replace all `{{PLACEHOLDER}}` tokens in the template before encoding.

3. Check whether the slug already exists (GET first to retrieve SHA if updating).

4. Base64-encode the HTML file (use `base64 -w 0` in bash).

5. PUT to the GitHub API with commit message, base64 content, sha (if update), branch main.

6. Confirm both pushes returned the file name before sharing anything.

### Step 6 - Log to Studio under BCPS

```sql
INSERT INTO studio_projects (
  id, slug, name, brand_slug, scope, status,
  owner_role, owner_label, unread, source, position, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  '[slug]',
  '[Meeting Title]',
  'bcps',
  '[one sentence: what this brief covers and why it matters]',
  'shipped',
  'sar',
  'SAR',
  0,
  'auto',
  10,
  NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_projects WHERE slug = '[slug]');
```

### Step 7 - Run brand preflight and share

Before sharing the link, check:
- No em-dashes in the chat message or the HTML
- LESARUSS all-caps where it appears
- Sean A. Russell spelled correctly
- District logo present in header
- Pulse widget present with correct slug and anon key injected
- All {{PLACEHOLDER}} tokens replaced

Then share:
- The canonical link: `k12unlocked.com/bcps/[slug].html` (prefaced "This link has been verified.")
- One-line confirmation that it was logged in Studio under BCPS

---

## Quality rules

- White background only. No dark backgrounds, no dark mode.
- WCAG 2 AA contrast on all text. The CSS in the template is pre-validated.
- No em-dashes anywhere in the HTML or in the chat response.
- District logo always present in the header.
- Pulse widget always present - orange diamond, bottom-left, Supabase-backed.
- Decisions in green, deadlines in orange - consistently.
- Do not add sections that have no content. If there are no open issues, omit that section.
- Attendee names and titles come ONLY from wcm_cert_users. Flag any unmatched names.
- The audience banner should name specific people or roles, not generic language.
- Series field is always populated. Never blank.
