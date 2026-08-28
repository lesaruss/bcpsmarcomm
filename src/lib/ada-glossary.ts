// lib/ada-glossary.ts
//
// The definitions layer for the ADA Scanner. Every entry here is written
// and vetted ONCE, then looked up by rule id whenever a scan returns that
// finding, instead of the tool showing raw axe-core/WAVE text and leaving a
// WCM to guess what to do about it.
//
// Draft v1, built 2026-08-28 for the Application Services kickoff pilot
// (Silver Ridge Elementary). Sourced from axe-core 4.2's rule list (Deque
// University) and WebAIM's WAVE evaluation guide, narrowed to checks
// realistic on a FinalSite-built BCPS site. Matched live against a real
// scan of https://silverridge.browardschools.com/ - the 7 findings from
// that scan are marked below.
//
// Owner classification is a starting default, not a guarantee: a small
// number of rules (marked "depends") can fire from either FinalSite's
// shared template chrome or a WCM's own Composer content, depending on the
// page. Those get an override note instead of a flat answer. This file is
// meant to be revised as real scans surface findings it doesn't yet cover
// - an unmatched rule id/description should get a new entry, not be
// explained ad hoc in the UI.

export type GlossaryOwner = 'wcm' | 'finalsite' | 'depends'
export type GlossarySource = 'axe' | 'wave'

export interface GlossaryEntry {
  /** Stable key for this entry, also used as the React list key. */
  key: string
  source: GlossarySource
  /** axe-core rule id (exact match) for axe entries. */
  axeId?: string
  /** WAVE item id (exact match, matched against WaveViolation.id) when known. */
  waveId?: string
  /**
   * Fallback substring(s) matched against the WAVE item's description
   * (lowercased) when waveId isn't confirmed or doesn't match. WAVE's
   * documented item ids aren't publicly enumerated the way axe-core's are,
   * so description matching is the reliable path for WAVE entries today.
   */
  waveDescriptionMatch?: string[]
  category:
    | 'images'
    | 'headings'
    | 'links'
    | 'lists'
    | 'forms'
    | 'contrast'
    | 'page'
    | 'aria'
    | 'scripts'
  title: string
  definition: string
  owner: GlossaryOwner
  /** Why this owner call, and the override condition for "depends" entries. */
  ownerNote: string
  /** Step-by-step Composer instructions, shown when owner is wcm or the depends/wcm case applies. */
  fixSteps?: string[]
  /** Shown when owner is finalsite, or the depends/finalsite case applies. */
  escalationNote?: string
  /** True for the 7 findings actually observed on the Silver Ridge pilot scan. */
  seenOnPilot?: boolean
}

export const ADA_GLOSSARY: GlossaryEntry[] = [
  // ---- Images & media ----
  {
    key: 'image-alt',
    source: 'axe',
    axeId: 'image-alt',
    waveDescriptionMatch: ['missing alternative text'],
    category: 'images',
    title: 'Image missing alternative text',
    definition: 'An image has no text description for screen reader users, or a linked image has no accessible name at all.',
    owner: 'wcm',
    ownerNote: 'Lives inside a Composer content block, set per image.',
    fixSteps: [
      'Click the image in Composer and open its properties.',
      "Fill in the Alt Text field with a short, specific description (skip \"image of\" or \"picture of\").",
      'If the image is purely decorative, mark it decorative instead of leaving alt text blank.',
    ],
  },
  {
    key: 'wave-alt-redundant',
    source: 'wave',
    waveDescriptionMatch: ['suspicious alternative text', 'redundant alternative text', 'redundant text alternative'],
    category: 'images',
    title: 'Suspicious or redundant alternative text',
    definition: 'Alt text that just repeats the filename, says "image," or duplicates text already next to the image.',
    owner: 'wcm',
    ownerNote: 'Set per image inside Composer.',
    fixSteps: [
      'Rewrite the Alt Text field to describe what the image actually shows.',
      'If it only repeats adjacent text, clear it and mark the image decorative instead.',
    ],
  },
  {
    key: 'video-caption',
    source: 'axe',
    axeId: 'video-caption',
    category: 'images',
    title: 'Video missing captions',
    definition: 'A video on the page has no caption track available.',
    owner: 'depends',
    ownerNote: 'WCM if the video was embedded through Composer\'s video app: source a captioned version of the same video. FinalSite if the video comes from a template-level widget the WCM can\'t edit.',
    fixSteps: [
      'Replace the embedded video with a captioned version of the same video (auto-captions should be reviewed for accuracy, not trusted as-is).',
    ],
    escalationNote: 'If the video is part of a template widget with no Composer video field, escalate rather than trying to edit the embed code directly.',
  },
  {
    key: 'object-alt',
    source: 'axe',
    axeId: 'object-alt',
    category: 'images',
    title: 'Embedded object missing alternate text',
    definition: 'A PDF viewer, embedded document, or similar <object> element has no accessible fallback text.',
    owner: 'finalsite',
    ownerNote: 'Almost always rendered by a template-level embed widget, not something Composer exposes an alt-text field for.',
    escalationNote: 'Escalate: this is not editable through page content.',
  },

  // ---- Headings & structure ----
  {
    key: 'heading-order',
    source: 'axe',
    axeId: 'heading-order',
    waveDescriptionMatch: ['skipped heading level', 'missing first level heading', 'possible heading'],
    category: 'headings',
    title: 'Skipped heading level or missing page heading',
    definition: "Headings jump levels (H2 straight to H4) or the page has no true H1, so the outline doesn't make sense to screen reader users.",
    owner: 'wcm',
    ownerNote: 'Heading structure is set per page inside Composer content.',
    fixSteps: [
      'Select the heading text.',
      'Use the Composer paragraph style dropdown to set the correct Heading level, in order (H1, then H2, then H3).',
      "Never skip a level just to get a certain visual size, style the correct heading tag with CSS instead.",
    ],
  },
  {
    key: 'empty-heading',
    source: 'axe',
    axeId: 'empty-heading',
    waveDescriptionMatch: ['empty heading'],
    category: 'headings',
    title: 'Empty heading',
    definition: 'A heading style is applied to a line with no visible text, or only an image with no alt text inside it.',
    owner: 'wcm',
    ownerNote: 'A leftover formatting artifact inside a Composer content block.',
    fixSteps: ['Delete the empty heading block, or add real text (or image alt text) to it.'],
  },

  // ---- Links ----
  {
    key: 'wave-redundant-link',
    source: 'wave',
    waveDescriptionMatch: ['redundant link'],
    category: 'links',
    title: 'Redundant link',
    definition: 'Two links right next to each other point to the same destination, commonly an image and its headline.',
    owner: 'depends',
    ownerNote: 'FinalSite by default: confirmed on Silver Ridge to come from the district News widget repeating "headline + Read More" per article (74 instances), entirely template-generated. WCM only if hand-built inside a Composer text block.',
    fixSteps: ['If typed by hand in Composer, combine the two links into one, or make the duplicate a plain, non-linked mention.'],
    escalationNote: 'If it repeats across many items on the page (a news feed, a directory), it is almost certainly the widget template, escalate rather than trying to edit per item.',
    seenOnPilot: true,
  },
  {
    key: 'link-name',
    source: 'axe',
    axeId: 'link-name',
    waveDescriptionMatch: ['suspicious link text', 'link text'],
    category: 'links',
    title: 'Suspicious or non-descriptive link text',
    definition: 'Link text like "click here," "read more," or a bare URL that doesn\'t tell a screen reader user where the link goes out of context.',
    owner: 'wcm',
    ownerNote: 'The visible link text is set per link inside Composer content.',
    fixSteps: ['Rewrite the visible link text to describe the destination, for example "View the 2026/27 meal benefits application" instead of "click here."'],
  },
  {
    key: 'wave-empty-link',
    source: 'wave',
    waveDescriptionMatch: ['link has no text', 'empty link'],
    category: 'links',
    title: 'Empty link',
    definition: 'A link has no text, label, or alt text at all, so it announces as just "link" with no destination.',
    owner: 'depends',
    ownerNote: 'WCM if it\'s a text or image link inside a Composer content block. FinalSite if it\'s an icon-only link in the navigation or a social icon in the template footer.',
    fixSteps: ['Add link text, or add alt text to the linked image.'],
    escalationNote: 'Icon-only nav or footer links are template markup, escalate instead.',
  },
  {
    key: 'skip-link',
    source: 'wave',
    waveDescriptionMatch: ['skip link'],
    category: 'links',
    title: 'Broken or missing skip link',
    definition: 'The "skip to main content" link that should appear for keyboard users at the top of the page is missing or doesn\'t jump anywhere.',
    owner: 'finalsite',
    ownerNote: "Skip links are part of the site template's header markup, not page content.",
    escalationNote: 'Escalate.',
  },

  // ---- Lists & tables ----
  {
    key: 'listitem',
    source: 'axe',
    axeId: 'listitem',
    category: 'lists',
    title: 'List item not inside a list container',
    definition: "Bullets or numbers that look right on screen but aren't wrapped in a real <ul> or <ol>, usually from a paste.",
    owner: 'wcm',
    ownerNote: 'Confirmed on Silver Ridge: lives inside a Composer content block, not the template.',
    fixSteps: [
      'Select the affected lines.',
      'Click Clear Formatting.',
      "Reapply the list using Composer's Bulleted List or Numbered List button.",
    ],
    seenOnPilot: true,
  },
  {
    key: 'wave-layout-table',
    source: 'wave',
    waveDescriptionMatch: ['layout table'],
    category: 'lists',
    title: 'Table used for visual layout, not data',
    definition: 'A table was inserted just to line things up side by side, which screen readers announce as a data table with rows and columns that don\'t mean anything.',
    owner: 'wcm',
    ownerNote: 'Set per page inside Composer.',
    fixSteps: ["Rebuild the layout using Composer's columns or layout tool instead of a table.", 'Reserve the Table tool for actual tabular data.'],
  },
  {
    key: 'th-has-data-cells',
    source: 'axe',
    axeId: 'th-has-data-cells',
    category: 'lists',
    title: 'Data table missing header cells',
    definition: "A real data table (a bell schedule, a staff list) doesn't mark its first row or column as headers, so screen readers can't announce what each cell means.",
    owner: 'wcm',
    ownerNote: "Set at table-insertion time inside Composer's table tool.",
    fixSteps: ['When inserting the table, check the "first row is a header" (or column) option in the table tool, don\'t just bold the top row manually.'],
  },

  // ---- Forms ----
  {
    key: 'label',
    source: 'axe',
    axeId: 'label',
    waveDescriptionMatch: ['unlabeled form', 'missing form label'],
    category: 'forms',
    title: 'Form control missing a label',
    definition: "A text field, checkbox, or dropdown has no associated label, so a screen reader user can't tell what it's asking for.",
    owner: 'depends',
    ownerNote: "WCM if built with FinalSite's Forms app. FinalSite if it's a template-level form widget the WCM didn't build.",
    fixSteps: ["Add a label to every field in the Forms app builder, don't rely on placeholder text alone."],
    escalationNote: 'Escalate a template-level form (a global "Contact Us" block) rather than trying to edit it in Composer.',
  },

  // ---- Contrast ----
  {
    key: 'color-contrast',
    source: 'axe',
    axeId: 'color-contrast',
    waveDescriptionMatch: ['very low contrast', 'low contrast'],
    category: 'contrast',
    title: 'Very low text contrast',
    definition: 'Text color against its background falls under the 4.5:1 minimum (3:1 for large text, 24px and up).',
    owner: 'wcm',
    ownerNote: 'Confirmed pattern: set with Composer\'s text color tool on a content block, not a template style.',
    fixSteps: [
      "Click Clear Formatting to return to the template's default (already ADA-checked) text color.",
      'If a custom color is genuinely needed, pick from the BCPS ADA-compliant secondary palette, matched to the background it sits on.',
      'If unsure, check the pairing at webaim.org/resources/contrastchecker before publishing, it needs to clear 4.5:1.',
    ],
    seenOnPilot: true,
  },
  {
    key: 'wave-contrast-ui',
    source: 'wave',
    waveDescriptionMatch: ['contrast'],
    category: 'contrast',
    title: 'Low contrast on a button or callout box',
    definition: 'A custom-colored button or highlighted box inserted through Composer falls below the 3:1 minimum for graphical UI components.',
    owner: 'wcm',
    ownerNote: 'Custom color choice made inside Composer.',
    fixSteps: ['Pick a background/text combination from the BCPS ADA-compliant secondary palette rather than a freehand color choice.'],
  },

  // ---- Page-level & language ----
  {
    key: 'html-has-lang',
    source: 'axe',
    axeId: 'html-has-lang',
    category: 'page',
    title: 'Missing page language',
    definition: "The page's <html> tag has no lang attribute, so screen readers can't pick the right pronunciation rules.",
    owner: 'finalsite',
    ownerNote: 'A site-wide template setting, not something set per page.',
    escalationNote: 'Escalate.',
  },
  {
    key: 'html-lang-valid',
    source: 'axe',
    axeId: 'html-lang-valid',
    category: 'page',
    title: 'Invalid page language value',
    definition: "The page's <html> lang attribute is set, but to a value that isn't a valid language code.",
    owner: 'finalsite',
    ownerNote: 'A site-wide template setting.',
    escalationNote: 'Escalate.',
  },
  {
    key: 'wave-title-missing',
    source: 'wave',
    waveDescriptionMatch: ['missing document title', 'page title', 'duplicate page title'],
    category: 'page',
    title: 'Missing or duplicate page title',
    definition: "The browser tab title is blank, generic, or identical to another page, so screen reader and tab users can't tell pages apart.",
    owner: 'wcm',
    ownerNote: 'Set per page in Composer.',
    fixSteps: ['Set a specific, unique title in the page\'s SEO/Title field when creating or editing the page.'],
  },

  // ---- ARIA & landmarks ----
  {
    key: 'aria-required-children',
    source: 'axe',
    axeId: 'aria-required-children',
    category: 'aria',
    title: 'ARIA role missing required child roles',
    definition: 'An element with a role like "menu" or "list" is missing the specific child roles ARIA requires it to contain.',
    owner: 'finalsite',
    ownerNote: 'Confirmed on Silver Ridge: traces to the global navigation / quick-links menu markup, part of the shared template.',
    escalationNote: 'Escalate.',
    seenOnPilot: true,
  },
  {
    key: 'aria-required-parent',
    source: 'axe',
    axeId: 'aria-required-parent',
    category: 'aria',
    title: 'ARIA role not contained by required parent',
    definition: 'An element with a child ARIA role (like "menuitem") isn\'t wrapped in the parent role it requires (like "menu").',
    owner: 'finalsite',
    ownerNote: 'Confirmed on Silver Ridge: same template navigation system as aria-required-children.',
    escalationNote: 'Escalate.',
    seenOnPilot: true,
  },
  {
    key: 'landmark-unique',
    source: 'axe',
    axeId: 'landmark-unique',
    category: 'aria',
    title: 'Duplicate, unlabeled landmarks',
    definition: 'Two regions on the page (often two <nav> elements) have the same role with no distinguishing accessible name.',
    owner: 'finalsite',
    ownerNote: 'Confirmed on Silver Ridge: the header menu and the sidebar quick-links both render as unlabeled nav regions in the template.',
    escalationNote: 'Escalate.',
    seenOnPilot: true,
  },
  {
    key: 'wave-aria-broken-reference',
    source: 'wave',
    waveDescriptionMatch: ['broken aria', 'aria reference'],
    category: 'aria',
    title: 'Broken ARIA reference',
    definition: "An aria-labelledby or aria-describedby attribute points to an element ID that doesn't exist on the page.",
    owner: 'finalsite',
    ownerNote: 'Code-level wiring inside a template component, not editable through Composer.',
    escalationNote: 'Escalate.',
  },

  // ---- Scripts & embeds ----
  {
    key: 'wave-noscript',
    source: 'wave',
    waveDescriptionMatch: ['noscript element'],
    category: 'scripts',
    title: 'Noscript element',
    definition: 'A <noscript> fallback block is present on the page, usually paired with an embedded script.',
    owner: 'finalsite',
    ownerNote: 'Confirmed on Silver Ridge: output of a template-embedded script (analytics, chat widget), not page content.',
    escalationNote: 'Escalate.',
    seenOnPilot: true,
  },
  {
    key: 'wave-device-dependent',
    source: 'wave',
    waveDescriptionMatch: ['device dependent', 'device-dependent'],
    category: 'scripts',
    title: 'Device-dependent event handler',
    definition: 'An interactive element (often a dropdown menu) only responds to mouse events, not keyboard.',
    owner: 'finalsite',
    ownerNote: 'Template JavaScript behavior driving the navigation, not page content.',
    escalationNote: 'Escalate.',
  },
]

export const CATEGORY_LABELS: Record<GlossaryEntry['category'], string> = {
  images: 'Images & media',
  headings: 'Headings & structure',
  links: 'Links',
  lists: 'Lists & tables',
  forms: 'Forms',
  contrast: 'Contrast',
  page: 'Page-level & language',
  aria: 'ARIA & landmarks',
  scripts: 'Scripts & embeds',
}

/**
 * Look up the glossary entry for a given axe-core violation id.
 */
export function lookupAxeEntry(axeId: string): GlossaryEntry | null {
  return ADA_GLOSSARY.find(e => e.source === 'axe' && e.axeId === axeId) ?? null
}

/**
 * Look up the glossary entry for a WAVE violation, trying the confirmed
 * waveId first, then falling back to a case-insensitive substring match
 * against the description WAVE returned. Description matching is the
 * reliable path today since WAVE's item ids aren't publicly enumerated the
 * way axe-core's rule ids are; entries should be upgraded to exact waveId
 * matches as real ids are confirmed from production scan data.
 */
export function lookupWaveEntry(waveId: string, description: string): GlossaryEntry | null {
  const exact = ADA_GLOSSARY.find(e => e.source === 'wave' && e.waveId === waveId)
  if (exact) return exact
  const d = description.toLowerCase()
  return ADA_GLOSSARY.find(e => e.source === 'wave' && e.waveDescriptionMatch?.some(m => d.includes(m))) ?? null
}
