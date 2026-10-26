// Shared by the site inbox routes (wcm-pilot-feedback intake, messages).
// Staff who get an email for every new message, and every reply a sender
// writes back inside Messages (per Sean 2026-07-29, unchanged since).
export const INBOX_NOTIFY_EMAILS = ['sean.russell@browardschools.com', 'felicia.hicks@browardschools.com']

// Where a conversation opens inside the platform; used in outgoing emails.
export function conversationUrl(id: string) {
  return `https://bcpsmarcomm.com/?page=messages&thread=${id}`
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
