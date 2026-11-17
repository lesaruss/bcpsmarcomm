-- Audit rule review finished (Sean and Felicia, 2026-11-16): the last 15 of
-- 36 rules decided. Applied through execute_sql the same day; the full
-- comments live on the rows. This file is the record, with short summaries,
-- and does nothing if the rows are already there.
insert into bcps_audit_rule_reviews (check_id, reviewer_email, reviewer_name, decision, comment) values
('single-column','contact@lesaruss.com','Sean A. Russell','change','Nov 16: about the page frame only; two-column sections inside a one-column page are fine. Retitled "The page is one column from top to bottom". Marker outlines the frame.'),
('description-length','contact@lesaruss.com','Sean A. Russell','change','Nov 16: up to 300 characters pass, 301 to 500 review, over 500 fail. Copilot prompt.'),
('descriptive-links','contact@lesaruss.com','Sean A. Russell','change','Nov 16 (BOSS): buttons 2 to 5 words, links name the destination, never click here. Sources WCAG 2.4.4/2.5.3, Google, NN/g. Copilot prompt. Review long buttons and links.'),
('current-content','contact@lesaruss.com','Sean A. Russell','change','Nov 16: past dates fine when history or a record. "What is this date?" answers; Other goes to Sean by email.'),
('working-links','contact@lesaruss.com','Sean A. Russell','change','Nov 16: steps use Finalsite link names (Edit Link, Internal Link, Resources, External Link).'),
('left-nav','contact@lesaruss.com','Sean A. Russell','approve','Nov 16: no exceptions. 404 pages were scored as normal pages: broken-page guard added.'),
('a11y-frame-title','contact@lesaruss.com','Sean A. Russell','change','Nov 16: split. Finalsite-made frames to the Finalsite list; WCM embeds reworded "Embedded videos, maps and forms have a title".'),
('contact-info','contact@lesaruss.com','Sean A. Russell','approve','Nov 16: no contact of your own, use the office that runs the program; exception request to Sean; Finalsite link steps; example Early Childhood Education.'),
('photo-element','contact@lesaruss.com','Sean A. Russell','approve','Nov 16: photos only; logos and white-background graphics exempt.'),
('staff-directory','contact@lesaruss.com','Sean A. Russell','change','Nov 16: "Key contacts come from the district directory, not typed in". Check matches the profile card, not the search box. Example Early Childhood Education.'),
('description-first','contact@lesaruss.com','Sean A. Russell','approve','Nov 16: a logo beside the description is fine; example Early Childhood Education.'),
('a11y-listitem','contact@lesaruss.com','Sean A. Russell','change','Nov 16: why rewritten for WCMs.'),
('a11y-color-contrast','contact@lesaruss.com','Sean A. Russell','change','Nov 16: Clear Formatting first; palette and contrast-checker steps dropped.'),
('a11y-aria-allowed-attr','contact@lesaruss.com','Sean A. Russell','not_applicable','Nov 16: Finalsite list.'),
('a11y-th-has-data-cells','contact@lesaruss.com','Sean A. Russell','change','Nov 16: why in plain words.')
on conflict do nothing;
