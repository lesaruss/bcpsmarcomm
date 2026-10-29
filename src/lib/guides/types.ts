// Guides (Sean, 2026-10-29): one page per audience in place of a stack of
// overlapping documents. Each guide is a set of tabs (the steps someone goes
// through, then reference), each tab a few sections, with search across all
// of it. The first tab, Overview, is drawn live for the person reading it,
// so it is not part of the content here.
//
// Section bodies are trusted HTML written by the District Web Team. Two link
// forms do something inside the guide instead of navigating:
//   href="#feedback"            opens the message panel (data-msg prefills it)
//   href="#guide/<tab>[/<id>]"  opens another tab, scrolled to a section

export interface GuideSection {
  id: string
  title: string
  html: string
}

export interface GuideTab {
  id: string
  label: string
  // Shown as a badge on the tabs that are steps ("Step 1"), so the order of
  // the work is visible at a glance. Reference tabs leave it out.
  step?: number
  intro?: string
  sections: GuideSection[]
}

export interface GuideChange {
  date: string
  text: string
}

export interface GuideDef {
  slug: string
  eyebrow: string
  title: string
  audience: string
  // Date the content was last refreshed (YYYY-MM-DD).
  updated: string
  tabs: GuideTab[]
  changes: GuideChange[]
  // Older documents folded into this guide, by slug, and the tab each one
  // now lives in. Opening one of them opens the guide there instead.
  replaces: Record<string, string>
}
