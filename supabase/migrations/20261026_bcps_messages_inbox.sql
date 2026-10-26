-- Messages inbox (V, 2026-10-26). Two things on the existing site inbox
-- (wcm_pilot_feedback):
--   1. A message can be closed without a reply ("she sent them while I was
--      speaking to her in real time"). closed_at/closed_by; a new reply from
--      the sender reopens it.
--   2. Each message becomes a conversation, so the bell opens a Messages page
--      where staff and the sender talk inside the platform. Every reply after
--      the opening message is a row in bcps_message_posts. admin_reply stays
--      on the parent row (latest staff reply) so older readers keep working.
-- member_read_at is when the sender last opened their own conversation, so
-- their bell can show an unread staff reply; last_activity_at orders the list.
alter table public.wcm_pilot_feedback add column if not exists closed_at timestamptz;
alter table public.wcm_pilot_feedback add column if not exists closed_by text;
alter table public.wcm_pilot_feedback add column if not exists member_read_at timestamptz;
alter table public.wcm_pilot_feedback add column if not exists last_activity_at timestamptz;

update public.wcm_pilot_feedback
   set last_activity_at = greatest(created_at, coalesce(replied_at, created_at))
 where last_activity_at is null;
alter table public.wcm_pilot_feedback alter column last_activity_at set default now();

create table if not exists public.bcps_message_posts (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.wcm_pilot_feedback(id) on delete cascade,
  created_at timestamptz not null default now(),
  author_user_id uuid,
  author_email text,
  from_staff boolean not null default false,
  body text,
  audio_url text,
  email_error text
);
create index if not exists bcps_message_posts_message_idx on public.bcps_message_posts (message_id, created_at);

-- Server routes only (service role), same as wcm_pilot_feedback.
alter table public.bcps_message_posts enable row level security;

-- Carry the replies already sent into the conversation history.
insert into public.bcps_message_posts (message_id, created_at, author_email, from_staff, body, audio_url, email_error)
select f.id, f.replied_at, f.replied_by, true, f.admin_reply, f.admin_reply_audio_url, f.reply_error
  from public.wcm_pilot_feedback f
 where f.replied_at is not null
   and (f.admin_reply is not null or f.admin_reply_audio_url is not null)
   and not exists (select 1 from public.bcps_message_posts p where p.message_id = f.id);
