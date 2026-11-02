-- Replies to tracked follow-up emails (Sean, 2026-11-02). Filled in when the
-- mailbox is checked for a reply from each person. Service role only.
alter table public.bcps_email_tracking add column if not exists replied_at timestamptz;
alter table public.bcps_email_tracking add column if not exists reply_subject text;
