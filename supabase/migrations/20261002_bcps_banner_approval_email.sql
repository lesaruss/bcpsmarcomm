-- Banner Submissions: approval email to the WCM (Vanessa Deslandes, 2026-10-02).
-- Mirrors rejection_email_sent_at / rejection_email_error.
alter table public.bcps_banner_submissions
  add column if not exists approval_email_sent_at timestamptz,
  add column if not exists approval_email_error text;
