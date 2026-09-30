-- WCM Community Hub content list (Sean, 2026-09-29, playbook wcm-community-hub).
-- The hub used to be hardcoded JSX where every "Open" button went nowhere. Cards
-- now come from this table so the District Web Team can add, reorder or hide an
-- item without a code change. Rule for every row: state 'live' only when href
-- opens for a Department WCM. Anything still waiting on content stays 'hidden'.
--
-- Also: every certified WCM is added to the recipient list of the
-- Certification Complete: What's Next brief, which the completion button links
-- to. Before this, that list was a fixed 58 names and 4 certified WCMs could not
-- open the page they were sent to.
-- Applied to project fwbhwfxpncrsfhttimna via the Supabase MCP on 2026-09-30.

CREATE TABLE IF NOT EXISTS public.bcps_wcm_hub_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab text NOT NULL CHECK (tab IN ('start', 'build', 'maintain', 'compliance', 'learn')),
  title text NOT NULL,
  description text NOT NULL,
  -- Internal path (/playbooks/..., /?page=...), external URL, or
  -- 'action:feedback' to open the site feedback panel.
  href text NOT NULL,
  link_label text NOT NULL DEFAULT 'Open',
  -- 'certified': only shown to WCMs who hold the department certification.
  requires text CHECK (requires IS NULL OR requires IN ('certified')),
  state text NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'hidden')),
  -- Why a hidden item is hidden, or what it is waiting on. Never shown to WCMs.
  internal_note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bcps_wcm_hub_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signed-in read live hub items" ON public.bcps_wcm_hub_items;
CREATE POLICY "signed-in read live hub items" ON public.bcps_wcm_hub_items
  FOR SELECT TO authenticated USING (state = 'live');
REVOKE ALL ON public.bcps_wcm_hub_items FROM anon;
REVOKE ALL ON public.bcps_wcm_hub_items FROM authenticated;
GRANT SELECT (id, tab, title, description, href, link_label, requires, state, sort_order)
  ON public.bcps_wcm_hub_items TO authenticated;

INSERT INTO public.bcps_wcm_hub_items (tab, title, description, href, link_label, requires, state, internal_note, sort_order) VALUES
  ('start', 'Department WCM Playbook', 'Everything current for Department WCMs in one place, updated after every Hot Lab and District Web Team meeting.', '/playbooks/wcm-department', 'Open playbook', NULL, 'live', NULL, 10),
  ('start', 'Certified? Here''s What''s Next', 'Getting into Finalsite after certification: first-time access, signing in, and where to get help.', '/briefs/bcps-wcm-cert-complete-2026-27', 'See what''s next', 'certified', 'live', 'Recipient-gated; certified WCMs are added automatically by trigger.', 20),
  ('start', 'Check Your Roster Status', 'See whether your director has confirmed you as your department''s WCM. If not, send them the confirmation link.', '/?page=members', 'Open Members', NULL, 'live', NULL, 30),
  ('start', 'For Your Director', 'What directors need to know about the WCM program, to share with yours.', '/playbooks/director-department', 'Open guide', NULL, 'live', NULL, 40),

  ('build', 'Shared Elements', 'How to verify, access and edit a Finalsite shared element your department owns, including ones that appear on school websites.', '/playbooks/wcm-department/bcps-shared-elements-department-guide', 'Open guide', NULL, 'hidden', 'Draft v1 in review with Vanessa; restricted to 3 recipients. Go live once approved and opened to WCMs.', 10),
  ('build', 'Widgets', 'Embeddable directories built for departments, like the Charter School and II&DL Services directories. Want one? Send a spreadsheet of the fields you need.', '/?page=widgets', 'Open Widgets', NULL, 'live', NULL, 20),
  ('build', 'Layout Templates', 'Finalsite page templates for department sites.', '/playbooks/wcm-department', 'Open', NULL, 'hidden', 'Waiting on template source material from Vanessa.', 30),

  ('maintain', 'Your Department Audit', 'Your department''s audit findings by layout, content, navigation and accessibility. Mark fixes and submit for review.', '/wcm-portal', 'Open audit', NULL, 'live', NULL, 10),
  ('maintain', 'Analytics', 'Traffic to your pages over time, where visitors come from, and the campaigns the District Web Team tracks.', '/?page=analytics', 'Open Analytics', NULL, 'live', NULL, 20),
  ('maintain', 'Annual Content Audit Checklist', 'The checklist and deadline for the annual content audit.', '/playbooks/wcm-department', 'Open', NULL, 'hidden', 'Needs a real checklist doc with the actual deadline.', 30),

  ('compliance', 'ADA Scanner', 'Scan a page for accessibility issues and get step-by-step fixes.', '/?page=ada-scanner', 'Open scanner', NULL, 'hidden', 'WCM group already has page access. Held back until Sean confirms WCM rollout (scanner fine-tuning targeted Oct 8).', 10),
  ('compliance', 'ADA and Section 508 Basics', 'A short guide to accessibility requirements for department pages.', '/playbooks/wcm-department', 'Open', NULL, 'hidden', 'Needs content.', 20),

  ('learn', 'Hot Lab Notes and Recordings', 'Every Department WCM Hot Lab, with notes and the full recording. Missed one? Catch up here.', '/playbooks/wcm-hot-labs', 'Open Hot Labs', NULL, 'live', NULL, 10),
  ('learn', 'Join a Hot Lab', 'Live working sessions every Tuesday and Thursday at 11:30 AM. Bring a page, a task or a question.', 'https://teams.microsoft.com/meet/264785803068551?p=uQvBT8hLfn90fHBTN0', 'Join on Teams', NULL, 'live', 'Link taken from the Certification Complete brief.', 20),
  ('learn', 'Focused Hot Lab: Minibases', 'Recorded segment on minibases and department widgets, from the October 13 Hot Lab.', '/playbooks/wcm-hot-labs', 'Watch', NULL, 'hidden', 'Go live once the Oct 13 recording is posted; point href at that session doc.', 30),
  ('learn', 'Ask the District Web Team', 'Hit a bug, a confusing step, or have a question? Send it straight to the District Web Team.', 'action:feedback', 'Send a message', NULL, 'live', NULL, 40)
ON CONFLICT DO NOTHING;

-- Certified WCMs can always open the page the completion button sends them to.
CREATE OR REPLACE FUNCTION public.bcps_cert_complete_add_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  IF NEW.course_id <> 'dept-wcm-v1' THEN
    RETURN NEW;
  END IF;
  SELECT lower(email), full_name INTO v_email, v_name FROM public.wcm_cert_users WHERE user_id = NEW.user_id;
  IF v_email IS NULL THEN
    SELECT lower(email) INTO v_email FROM auth.users WHERE id = NEW.user_id;
  END IF;
  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bcps_brief_recipients
    WHERE brief_slug = 'bcps-wcm-cert-complete-2026-27' AND lower(attendee_email) = v_email
  ) THEN
    INSERT INTO public.bcps_brief_recipients (brief_slug, attendee_name, attendee_email, added_by)
    VALUES ('bcps-wcm-cert-complete-2026-27', coalesce(v_name, v_email), v_email, 'auto');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bcps_cert_complete_add_recipient ON public.wcm_certifications;
CREATE TRIGGER bcps_cert_complete_add_recipient
  AFTER INSERT ON public.wcm_certifications
  FOR EACH ROW EXECUTE FUNCTION public.bcps_cert_complete_add_recipient();
