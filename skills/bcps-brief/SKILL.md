---
name: bcps-brief
description: Generate a BCPS-styled meeting brief from a transcript or notes, push it live to bcpsmarcomm.com, and log it as a Studio task under the BCPS client. USE THIS SKILL automatically whenever Sean drops meeting notes, a transcript, a Fieldy recording, or raw notes and asks to produce a brief, make a link, add to Studio, document a meeting, or mentions BCPS minutes, governance notes, or any BCPS meeting documentation. Also fires when the K12 Unlocked minutes module or BCPS pipeline is mentioned alongside any meeting content. The output is always a bcpsmarcomm.com/briefs/[slug] URL, access-gated to real recipients.
---

# BCPS Brief Generator

Converts raw meeting transcripts or notes into a polished BCPS-branded HTML brief, writes it to the shared `mock_pages` table (which bcpsmarcomm.com reads directly), gates access to named recipients, and logs a Studio project entry under the BCPS client.

**IMPORTANT, read before doing anything else:** BCPS is a client, not an internal LESARUSS brand. Client deliverables live on bcpsmarcomm.com, never on hq.lesaruss.ai as a surface. This skill writes to a shared Supabase table (`mock_pages`) that bcpsmarcomm.com's own `/briefs/[slug]` route reads directly and renders at bcpsmarcomm.com. That write happens through an API hosted at hq.lesaruss.ai, but the write itself is correct and is not "publishing to HQ": no content, mirror, or static file should ever be pushed into the lesaruss-hq or k12unlocked.com repos for BCPS briefs. Older versions of this skill described a second push to those two repos. That step is retired. Do not resurrect it.

---

## What you produce

A self-contained HTML file using the BCPS visual system. These values are locked, do not substitute or invent alternatives:

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
| Background | white only, never dark mode |

The document always has a fixed BCPS header bar (white, 3px bottom border in #1672A7) and uses the CSS variable system from `assets/template.html`.

**LOGO RULE, non-negotiable:** every brief must display the BCPS district logo in the header. Use `assets/template.html`, the logo img tag is already wired in. Never omit it.

---

## HARD RULES (non-negotiable)

### 1. Access control is not optional

**A brief with no rows in `bcps_brief_recipients` is PUBLIC on bcpsmarcomm.com.** The route checks for recipient rows and only gates access if rows exist. This is the single most important rule in this skill: if the brief is meant for specific people, their emails must be inserted into `bcps_brief_recipients` before the brief is considered done. Skipping this step does not fail loudly, it just silently ships a restricted-sounding document to the open internet. Confirm the insert succeeded (query it back) before sharing any link.

```sql
INSERT INTO bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
VALUES ('[slug]', '[Full Name]', '[email]', 'auto');
```

If the brief is genuinely meant to be public (rare, confirm with Sean first), state that explicitly instead of leaving the table empty by accident.

### 2. Attendee names and titles

Names and titles MUST come from `wcm_cert_users`. Never infer, guess, or derive them from transcript context.

```sql
SELECT full_name, department, email, is_admin
FROM public.wcm_cert_users
ORDER BY full_name;
```

Match each name in the transcript against this table. Match found: use `full_name` and `department`, never override with transcript wording. No match: use the transcript's wording, set the attendee title to "Unverified, confirm title and department," and flag the gap in the chat response before delivering.

Sean A. Russell is always: "Sean A. Russell, District Webmaster, Office of Communications," locked regardless of transcript wording.

### 3. Pulse widget

Every brief MUST include the Pulse widget, copied verbatim from `assets/template.html`. Replace `{{SUPABASE_ANON_KEY}}` with the anon key from `lesaruss_secrets` and `{{SLUG}}` with the brief slug. It is an orange diamond fixed bottom-left; clicking it opens a panel that posts to `pulse_messages`.

### 4. No em-dashes

Zero tolerance. Comma, colon, or plain hyphen only. Check the whole HTML before pushing.

### 5. Series field

Every brief includes a Series meta field derived from the meeting title and recurrence pattern: "Recurring, Mondays and Thursdays," "One-time," "Monthly." Never blank.

### 6. Recording link

Include the recording bar only if a Teams or Zoom URL is present in the source. No URL, no placeholder, omit the section entirely.

---

## Step-by-step workflow

### Step 1: Load attendee roster and credentials

```sql
SELECT full_name, department, email, is_admin FROM public.wcm_cert_users ORDER BY full_name;
SELECT key, value FROM public.lesaruss_secrets WHERE key IN ('LESARUSS_ADMIN_TOKEN', 'SUPABASE_ANON_KEY');
```
Supabase project ID: `fwbhwfxpncrsfhttimna`

### Step 2: Extract from the source

Pull meeting title, date, series, platform, attendees (cross-referenced against `wcm_cert_users` immediately), recording URL, session overview, decisions with rationale, action items with owner and deadline, open questions, and follow-up dates. Do not fabricate anything missing, note the gap inline instead.

Slug pattern: `bcps-[short-topic]-[YYYY-MM-DD]`, e.g. `bcps-analytics-governance-2026-05-22`.

### Step 3: Build the HTML brief

Use `assets/template.html`. Required sections in order: fixed BCPS header with logo, H1 title, meta row (Date, Series, Platform, Attendees count, Version), recording bar (if applicable), audience banner, session overview, attendees grid, key decisions, action items, open issues (omit if none), next steps/timeline, Pulse widget.

### Step 4: Push to mock_pages (this is the live push to bcpsmarcomm.com)

```
POST https://hq.lesaruss.ai/api/admin/mock-pages
Authorization: Bearer [LESARUSS_ADMIN_TOKEN]
Content-Type: application/json

{
  "brand": "bcps",
  "slug": "[slug]",
  "surface": "brief",
  "title": "[Meeting Title]",
  "content": "[full HTML string]"
}
```

A 200/201 response means the row is written to `mock_pages` and bcpsmarcomm.com's `/briefs/[slug]` route will render it immediately on next request (`force-dynamic`, no cache). This is the correct and only push step for brief content. There is no separate bcpsmarcomm-specific admin endpoint for this and no static file to commit.

### Step 5: Gate access (do this before sharing anything, see Hard Rule 1)

Insert every real recipient into `bcps_brief_recipients`, matched against the attendee list from Step 2. Admins (`is_admin = true` in `wcm_cert_users`) always receive all briefs regardless of attendance; anyone else not on the attendee list needs a manual override logged in `override_added_by`. Query the table back after inserting to confirm the rows landed.

### Step 6: Log to Studio under BCPS

```sql
INSERT INTO studio_projects (id, slug, name, brand_slug, scope, status, owner_role, owner_label, unread, source, position, created_at, updated_at)
SELECT gen_random_uuid(), '[slug]', '[Meeting Title]', 'bcps',
'[one sentence: what this brief covers and why it matters]',
'shipped', 'sar', 'SAR', 0, 'auto', 10, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_projects WHERE slug = '[slug]');
```

### Step 7: Preflight and share

Check: no em-dashes anywhere, LESARUSS all-caps where it appears, Sean A. Russell spelled correctly, district logo present, Pulse widget present with correct slug and anon key, all `{{PLACEHOLDER}}` tokens replaced, `bcps_brief_recipients` populated and confirmed.

Share the canonical link: `bcpsmarcomm.com/briefs/[slug]` (prefaced "This link has been verified.") and confirm it was logged in Studio under BCPS.

---

## Quality rules

- White background only, no dark mode.
- WCAG 2 AA contrast (template is pre-validated).
- No em-dashes anywhere.
- District logo always present.
- Pulse widget always present.
- Decisions in green, deadlines in orange, consistently.
- Omit empty sections rather than leaving them blank.
- Attendee names and titles come ONLY from `wcm_cert_users`, flag unmatched names.
- Audience banner names specific people or roles, not generic language.
- Series field always populated.
- `bcps_brief_recipients` populated for every brief unless it is deliberately public and Sean has confirmed that.
