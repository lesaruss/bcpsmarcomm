// Google Tag Manager guide (Sean, 2026-11-05): one guided page that replaces
// a written playbook. Each slide is a headline, one line on why, a picture of
// the screen with the spot to click, and narration (public/audio/gtm-guide/
// <id>.mp3). Slides split after "Which one are you?" into the department path
// and the District Web Team path.
//
// Narration is Sean's voice (Sean, 2026-11-06: "use my voice"), the same
// recipe as the Google Account Access guide: Higgsfield seed_audio, voice
// element 7985695a-f508-49d6-b6e6-508d425b609b (Sean A. Russell), speech_rate
// -5, prompt = `say` word for word; WAV converted to mono 44.1 kHz 128k mp3.
// Every take is checked against `say` with a speech-to-text transcript before
// it ships (seed_audio can add or drop words: the first `end` take added
// "Today", trimmed off). When `say` changes, re-voice only that slide. Each
// clip is a recording_queue row (batch gtm-guide) so a real recording can
// replace it at the same path.

export type Path = 'dept' | 'web'

export interface Slide {
  id: string
  path?: Path
  eyebrow: string
  title: string
  why: string
  visual: string
  say: string
  cta?: { label: string; href: string; external?: boolean }
}

export const GTM_CONTAINER_URL = 'https://tagmanager.google.com/#/container/accounts/6401095625/containers/284311188/'
export const REGISTER_URL = '/?page=tag-register&tab=access'

export const SLIDES: Slide[] = [
  {
    id: 'welcome', eyebrow: 'Website Governance', title: 'Google Tag Manager at BCPS',
    why: 'How the District keeps one Tag Manager, and how a department’s agency gets in the right way.',
    visual: 'cover',
    say: 'Welcome. This short guide explains how Broward County Public Schools manages Google Tag Manager on browardschools dot com, and what happens when a department wants an outside agency to track a campaign. It takes about four minutes. Press Next whenever you are ready.',
  },
  {
    id: 'what', eyebrow: 'The basics', title: 'What Tag Manager does',
    why: 'One snippet on every page lets someone add tracking without touching the website.',
    visual: 'what',
    say: 'Google Tag Manager is a small piece of code that loads on every page of browardschools dot com. Inside it, people add tags: small instructions that send information to tools like Google Analytics, Google Ads, or Meta. The website itself never changes. That makes it powerful, and it is exactly why it needs one clear owner.',
  },
  {
    id: 'why', eyebrow: 'Why we govern it', title: 'Why the District manages it',
    why: 'So we always know who can add tracking, what it collects, and when their access ends.',
    visual: 'why',
    say: 'Anything added to Tag Manager can run on every District page, and it decides what information leaves our site. Access also has a way of lingering long after a campaign ends. So the District Web Team keeps one record of who has access, what they track, and when that access closes. Departments still run their campaigns. We just make sure it is done the right way.',
  },
  {
    id: 'rule', eyebrow: 'The rule', title: 'One container. One owner.',
    why: 'Every agency works in the District’s own container. Nobody creates another one.',
    visual: 'rule',
    say: 'There are two Tag Manager containers on our site. One belongs to Finalsite, our website vendor. It is shared with their other clients, so it is not ours to give out. The other is the District’s own container. Every agency works there, in its own workspace, and no department creates a container of its own.',
  },
  {
    id: 'choose', eyebrow: 'Your path', title: 'Which one are you?',
    why: 'Pick the card that fits you. You can come back and take the other path anytime.',
    visual: 'choose',
    say: 'Now pick the path that fits you. If your department is working with an agency on a campaign, choose the first card. If you are on the District Web Team and manage the container, choose the second.',
  },

  // Department path
  {
    id: 'request', path: 'dept', eyebrow: 'Department · Step 1', title: 'Send us your request',
    why: 'It is our record of who is tracking, what, and until when. Your director approves it.',
    visual: 'request',
    say: 'Step one. Send the District Web Team a short request, approved by your director. It covers who the agency is, who needs access, the campaign dates, and what will be tracked. We keep it on file, so we can always answer who is tracking what, and until when.',
  },
  {
    id: 'rules', path: 'dept', eyebrow: 'Department · Step 2', title: 'What your agency gets',
    why: 'Everything they need for your campaign, and nothing that can change the rest of the site.',
    visual: 'rules',
    say: 'Step two. Your agency gets edit access in its own workspace. Their tags run only on your department’s pages, and every tag name starts with your department, like Magnet. They never change District tags, and they never collect personal information. No names, no emails, nothing typed into a form.',
  },
  {
    id: 'golive', path: 'dept', eyebrow: 'Department · Step 3', title: 'Build, review, go live',
    why: 'The agency builds and tests. The District checks it and publishes, the same business day.',
    visual: 'golive',
    say: 'Step three. The agency builds and tests its tags in preview mode, then lets us know it is ready. The District Web Team reviews the changes and publishes them, the same business day during a campaign window. Nothing goes live on the District site without that check.',
  },
  {
    id: 'end', path: 'dept', eyebrow: 'Department · Step 4', title: 'When the campaign ends',
    why: 'Access closes on the end date. Need more time? Just ask before then.',
    visual: 'end',
    say: 'Step four. On the campaign end date, the agency’s tags are paused and their access is removed. If you need more time, just ask before the end date and we will extend it. That is everything a department needs to know.',
  },

  // District Web Team path
  {
    id: 'record', path: 'web', eyebrow: 'Web Team · Step 1', title: 'Record it in the Tag Register',
    why: 'The register is our one record. If it is not in the register, it does not get access.',
    visual: 'record',
    say: 'Step one. When a department sends its request, open the Tag Register, find the agency, and click Open. Fill in the three steps: the agency and its people, the dates and approval, and their answers. Then save. If it is not in the register, it does not get access.',
    cta: { label: 'Open the Tag Register', href: REGISTER_URL },
  },
  {
    id: 'invite', path: 'web', eyebrow: 'Web Team · Step 2', title: 'Invite them in Tag Manager',
    why: 'Google emails each person an invitation. That email is their way in.',
    visual: 'invite',
    say: 'Step two. Open the District container in Tag Manager. Click Admin, then Container User Management, then the plus button, and Add users. Type each person’s email from the register, set the permission to Edit, not Publish, and click Invite. Google emails each of them an invitation.',
    cta: { label: 'Open the District container', href: GTM_CONTAINER_URL, external: true },
  },
  {
    id: 'open', path: 'web', eyebrow: 'Web Team · Step 3', title: 'Open their access',
    why: 'One click records the date, so the register always shows when access started.',
    visual: 'open',
    say: 'Step three. Back in the Tag Register, click Open access on their record. It turns green and records today’s date, so the register always shows when access started.',
    cta: { label: 'Open the Tag Register', href: REGISTER_URL },
  },
  {
    id: 'publish', path: 'web', eyebrow: 'Web Team · Step 4', title: 'Review, then publish',
    why: 'The review checks the rules for you. You only click Publish when it passes.',
    visual: 'publish',
    say: 'Step four. When the agency says it is ready, ask Logan for the workspace review. It checks that every tag is named for the department, fires only on its pages, and leaves District tags alone. If it passes, open their workspace in Tag Manager, click Submit, then Publish. If it fails, send them the list of fixes.',
  },
  {
    id: 'close', path: 'web', eyebrow: 'Web Team · Step 5', title: 'Close it out',
    why: 'Access that ends on time is the whole point of the register.',
    visual: 'close',
    say: 'Step five. On the end date, go back to Container User Management, select their names, and remove them. Pause their tags. Then click Close access in the Tag Register. Access that ends on time is the whole point.',
    cta: { label: 'Open the Tag Register', href: REGISTER_URL },
  },
  {
    id: 'quarterly', path: 'web', eyebrow: 'Web Team · Every quarter', title: 'Glance at the colors',
    why: 'Orange means a date is missing or close. Red means act now.',
    visual: 'quarterly',
    say: 'Finally, once a quarter, open the Tag Register and glance at the colors. Orange means a close date is missing or coming up. Red means access is past its end date and still open, so act on it. Anything that needs you sorts to the top.',
    cta: { label: 'Open the Tag Register', href: REGISTER_URL },
  },

  {
    id: 'done', eyebrow: 'All set', title: 'That’s the whole process.',
    why: 'One container, one record, and access that always has an end date.',
    visual: 'done',
    say: 'That is the whole process. One container, one record, and access that always has an end date. Thank you for helping keep browardschools dot com safe and well run.',
  },
]
