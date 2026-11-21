// One header rule for documents (Sean, 2026-11-10): inside BCPS MarComm the
// only header is the platform top bar. A document opened in the platform (a
// lightbox, a tab, a frame) shows no header of its own; a document opened on
// its own as a full page keeps its header.
//
// A Playbook's public address (/playbooks/<playbook> or
// /playbooks/<playbook>/<doc>) sends a signed-in reader into the dashboard,
// so framing it inside the platform drew a second top bar (and a second copy
// of the app) under the first. In the platform, frame /api/bcps/doc-raw with
// ?bare=1 instead: the stored HTML with its header hidden.

const PLAYBOOK_PATH = /^\/playbooks\/(?:[^/?#]+\/)?([^/?#]+)\/?(?:[?#].*)?$/

/** The slug a /playbooks/ address points at, or null for any other URL. */
export function playbookSlug(url: string): string | null {
  const m = url.match(PLAYBOOK_PATH)
  return m ? decodeURIComponent(m[1]) : null
}

/** The address to frame a document at inside the platform (no header of its own). */
export function inPlatformDocSrc(url: string, slug?: string): string {
  const s = playbookSlug(url) ? (slug || playbookSlug(url)) : null
  return s ? `/api/bcps/doc-raw/${encodeURIComponent(s)}?bare=1` : url
}

/** The address to open a document on its own, as a full page with its header. */
export function fullPageDocHref(url: string): string {
  return playbookSlug(url) ? `${url.split(/[?#]/)[0]}?standalone=1` : url
}
