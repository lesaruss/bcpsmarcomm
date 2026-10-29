// The Department WCM Guide (Sean, 2026-10-29). Replaces the Department WCM
// Playbook document (briefings wcm-department), the Registration: Getting
// Started document and the Certification Complete: What's Next brief, which
// said the same things in different places. Refreshed every Thursday by 5 PM
// from that week's Hot Labs: edit the sections here and add a line to
// changes, newest first.
import type { GuideDef } from './types'

export const HOT_LAB_JOIN_URL = 'https://teams.microsoft.com/meet/264785803068551?p=uQvBT8hLfn90fHBTN0'
export const LAB_SHORT_LINK = 'https://bcpsmarcomm.com/lab'
export const FINALSITE_URL = 'https://www.browardschools.com/fs/admin'
export const IIQ_URL = 'https://browardschools.incidentiq.com/'
// Department WCM certification: due date, and the day editing access is
// checked (end of the day) and paused for anyone not finished.
export const CERT_DUE = '2026-10-30'
export const CERT_CHECK = '2026-11-02'

const ext = (href: string, label: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`

export const WCM_DEPARTMENT_GUIDE: GuideDef = {
  slug: 'wcm-department',
  eyebrow: 'BCPS MarComm',
  title: 'Department WCM Guide',
  audience: 'Department Web Content Managers',
  updated: '2026-10-29',
  cadence: 'refreshed every Thursday',
  replaces: {
    'bcps-wcm-registration-2026-27': 'start',
    'bcps-wcm-cert-complete-2026-27': 'certify',
  },
  tabs: [
    {
      id: 'start',
      label: 'Getting Started',
      step: 1,
      intro: 'Register, get confirmed by your director, and sign in. No web experience is needed: the course and Hot Lab walk you through everything.',
      sections: [
        {
          id: 'register',
          title: 'Register, step by step',
          html: `
<ol class="guide-steps">
  <li><b>Register for PD credit in LAB.</b> LAB (Learning Across Broward) is the District's professional development system. Sign in through Clever with your SSO login and register for the WCM Certification course. Do this first: it is how your certification hours count toward PD credit. Short link: ${ext(LAB_SHORT_LINK, 'bcpsmarcomm.com/lab')}.</li>
  <li><b>Follow the link LAB gives you.</b> After you register, look in the body of LAB's confirmation page for the BCPS Certification link. Use that link, not a bookmark to our registration page.</li>
  <li><b>Select Create Your Account.</b> Already have an account? Select Log in, right below it.</li>
  <li><b>Use your name-based @browardschools.com email</b>, for example john.doe@browardschools.com, not your P-number. Only District addresses can register.</li>
  <li><b>You are enrolled</b> as your department's Web Content Manager.</li>
  <li><b>Bookmark bcpsmarcomm.com/login.</b> BCPS MarComm is not on single sign-on yet, so this is how you get back in.</li>
</ol>
<p class="guide-note">Sharing this with a new WCM? Send ${ext(LAB_SHORT_LINK, 'bcpsmarcomm.com/lab')}. It works before they have an account here.</p>`,
        },
        {
          id: 'designation',
          title: 'Confirm your director has named you',
          html: `
<p>Your director confirms who manages your department's website at <a href="/wcm-roster-signup">bcpsmarcomm.com/wcm-roster-signup</a>. It is their form, not yours, and it should not hold up your own registration. If you are not sure they have done it, send them the link.</p>
<p><b>What your director does.</b> It takes less than five minutes and needs no sign-in: pick the department, enter their District email, and review the WCMs on file. Submit if the list is right, or remove and add people (adding someone needs their personnel number). A submission from anyone other than the director is flagged for review.</p>
<p><b>What happens after.</b> The District Web Team reviews every submission. Once it is approved, you and your director each get a confirmation email, and you are added to Hot Lab and your division's Teams chat.</p>
<p><b>Check where you stand</b> on the <a href="/?page=members">Members</a> page. Your WCM Roster badge reads <b>Confirmed</b> (your director submitted and it was approved), <b>On roster</b> (the District Web Team added you) or <b>Unassigned</b> (your director still needs to submit).</p>`,
        },
        {
          id: 'coverage',
          title: 'How many WCMs a department should have',
          html: `<p>At least one, and two or three where your department can support it, so someone trained can always cover. This is a recommendation, not a requirement: departments know their own staffing best.</p>`,
        },
      ],
    },
    {
      id: 'certify',
      label: 'Certification',
      step: 2,
      intro: 'The Department WCM Certification course teaches every standard your page is audited on. Finish it to keep editing access to your department website.',
      sections: [
        {
          id: 'deadline',
          title: 'The deadline, and what happens after it',
          html: `
<p>Certification is due <b>Friday, October 30, 2026</b>. The course stays open through the weekend. At the end of the day <b>Monday, November 2</b>, the District Web Team checks who has not finished, and access to edit your department website is paused until you complete it. It is restored once you finish.</p>
<p>New WCMs complete the course before update access is granted. If someone new has just taken over your pages, <a href="#feedback" data-msg="A new Web Content Manager just took over our department pages: ">tell us</a> and we will fast-track them.</p>
<p><a class="guide-btn" href="/certification/departments/dashboard">Open the certification course</a></p>`,
        },
        {
          id: 'progress',
          title: 'Where you stand',
          html: `<p>Your progress shows on the Overview of this guide and on your dashboard. When you finish, your certificate page has a <b>Download badge</b> option, for example for your email signature.</p>
<p>Stuck on a module? Bring it to <a href="#guide/help/hotlab">Hot Lab</a> this week, or <a href="#feedback" data-msg="I am stuck on a certification module: ">send us a message</a>. If something is stopping you from reaching 100%, tell us now rather than on the last day.</p>`,
        },
        {
          id: 'adobe',
          title: 'Getting Adobe Acrobat (required)',
          html: `<p>You need Adobe Acrobat to complete certification. If it will not install through the Software Center, go to ${ext('https://www.adobe.com', 'adobe.com')} and sign in with your P-number through SSO. Still no access? Submit an ${ext(IIQ_URL, 'Incident IQ ticket')}.</p>`,
        },
        {
          id: 'finalsite-access',
          title: 'After you finish: getting into Finalsite',
          html: `
<p>Finalsite is where your department page actually lives and where you make live updates. It is a separate system with its own sign-in.</p>
<p><b>Had Finalsite access last year?</b> Nothing changes. Sign in to the ${ext(FINALSITE_URL, 'Finalsite dashboard')} as usual.</p>
<p><b>First time?</b></p>
<ol class="guide-steps">
  <li><b>There is no form to submit.</b> Finishing the course sends us your proof of completion.</li>
  <li><b>Sign in to the ${ext(FINALSITE_URL, 'Finalsite dashboard')}</b> once access is granted.</li>
  <li><b>Use your P-number address</b> (for example P000XXXXX@browardschools.com). You may need to enter it twice the first time. There is usually no password prompt; if there is, use your SSO password. Still not working? Email the IT Service Desk at ITServiceDesk@browardschools.com with the subject "Finalsite Access."</li>
</ol>
<p>Next step: <a href="#guide/audit">your department audit</a>.</p>`,
        },
      ],
    },
    {
      id: 'audit',
      label: 'Your Audit',
      step: 3,
      intro: 'Once you are certified, your work is the audit: it checks your department page against the standards the course taught, and shows you exactly what to fix.',
      sections: [
        {
          id: 'how',
          title: 'How the audit works',
          html: `
<p>Open <a href="/?page=dashboard&amp;tab=audit">Run Audit</a> on your dashboard. You see a picture of your page, on desktop and phone, with a numbered pin on every check. The ADA scan runs at the same time, so it is one place for both.</p>
<ul>
  <li><b>Green</b> passes. <b>Red</b> needs a fix. <b>Amber</b> asks you to take a look (for example, whether an image is a flyer) and never changes your score.</li>
  <li>Every check is a standard from the certification course and links to the course page that teaches it, so the audit and the training never disagree.</li>
  <li>Issues in the site header, menus and footer belong to Finalsite and never count against you.</li>
  <li>The audit includes pages linked from your main page, not only the ones in the menu, and shows when each page was last checked.</li>
</ul>
<p><a class="guide-btn" href="/?page=dashboard&amp;tab=audit">Go to Run Audit</a> <a class="guide-btn guide-btn-outline" href="/playbooks/wcm-department/score-100-checklist">Department Page Checklist</a></p>
<p class="guide-note">The <b>Department Page Checklist</b> is exactly what the audit checks, nothing more, with the Finalsite steps for each item. Meet every item and your page scores 100.</p>`,
        },
        {
          id: 'item',
          title: 'Working an audit item, step by step',
          html: `
<ol class="guide-steps">
  <li>The number next to each item matches the numbered pin on the picture of your page.</li>
  <li>Keep your live page open in another tab so you can find the spot while you read the item.</li>
  <li>Follow the steps on the item. If you need more, open the course module it links to.</li>
  <li>Fix it in Finalsite and <b>publish</b>. "Draft" means the page has unpublished changes, and an unpublished fix does not show on the live page or in the next audit.</li>
  <li>Leave a short note on what you changed, then mark it done.</li>
  <li>When every item is done, select <b>Request re-audit</b>, or run the audit again on that page (up to 15 pages a day) and watch the checks turn green.</li>
</ol>
<p>Still stuck? Select <b>Still stuck? Ask the District Web Team</b> on the item and give as much detail as you can. Questions are answered in order, and one several people ask moves up the list.</p>`,
        },
        {
          id: 'pages',
          title: 'Check that your audit lists only your pages',
          html: `<p>Some departments look like one office from the outside, so we rely on you. If a page in your list belongs to another office, select it for reclassification, or use Still stuck? and tell us who manages it. Missing a page? Add any browardschools.com page by its link.</p>`,
        },
        {
          id: 'tips',
          title: 'Answers to the most common items',
          html: `
<ul>
  <li><b>Quick Access buttons</b> are the most common red item: three to six buttons under your description that go to your most visited pages. Your <a href="/?page=dashboard&amp;tab=analytics">Analytics</a> tab shows which pages those are.</li>
  <li><b>Review items are not errors.</b> Amber items such as text-heavy images only ask you to look. Check the image, add a note, and mark it checked.</li>
  <li><b>Heading order.</b> One H1 for the page title, then H2 for sections and H3 inside them. Do not skip a level, and do not use a heading just to make text bigger.</li>
  <li><b>Side-by-side sections are allowed.</b> The single-column standard is about a whole page split into two columns. A small side-by-side section, such as Important Links or a logo beside your intro, is fine. The audit still flags these: skip that item for now, the check is being corrected.</li>
  <li><b>Past dates on a page.</b> Review the page with your team. It is often a chance to post a short update. If the wording stays, say so in the note and mark it done.</li>
  <li><b>Items only Finalsite can fix</b> (template markup and some PDF rules) should not be on your list. They are being filtered out.</li>
  <li><b>Finding your page in Finalsite.</b> Departments, then Department Branch, then BCPS Departments. Select the page icon, not the title, then Compose. Bookmark it.</li>
</ul>
<p class="guide-note">Scores will be reset for everyone once this version of the audit is confirmed, so treat today's number as a guide to what to fix rather than a final grade.</p>`,
        },
      ],
    },
    {
      id: 'review',
      label: 'Website Review',
      step: 4,
      intro: 'Every department has one website review a school year, in its division\'s window, with the District Web Team, you and your director.',
      sections: [
        {
          id: 'windows',
          title: 'When your review is',
          html: `
<ul>
  <li><b>Window 1, October 1 to December 18:</b> Human Resources, Student Services, Academics, Chief of Staff.</li>
  <li><b>Window 2, January 11 to March 31:</b> Finance, Strategy &amp; Operations, Facilities, Safety &amp; Security.</li>
  <li><b>Window 3, April 1 to June 30:</b> Information Systems, Learning Communities, Independent Offices.</li>
</ul>
<p>This first year is for getting everything in order, so later reviews are maintenance. Your director can ask for a meeting sooner at any time. When the team is working with your division, that is the time to have your pages, content and questions ready. Each division also gets a Teams group chat with its WCMs and the District Web Team.</p>`,
        },
        {
          id: 'steps',
          title: 'How the review works',
          html: `
<ol class="guide-steps">
  <li><b>You work through your audit</b> and fix the red items.</li>
  <li><b>You bring your director to a one-hour meeting</b> with the District Web Team: page setup, audit findings, accessibility and the tools available to you. This is where your department's web plan for the year is set.</li>
  <li><b>We send a written playbook</b> with a timetable, usually two weeks to a month.</li>
  <li><b>We build the changes together</b> with you.</li>
  <li><b>Your director reviews</b> the finished site and signs off.</li>
</ol>
<p>No WCM yet, or not sure what is next? That is part of the review too: whatever the gap, staffing or know-how, we work it out together.</p>`,
        },
        {
          id: 'prepare',
          title: 'Before your review',
          html: `
<ul>
  <li><b>Run your audit first.</b> Walking in with the red items fixed means the meeting can focus on strategy instead of cleanup.</li>
  <li><b>Search browardschools.com</b> for every page that mentions your department, not only your own, and update the evergreen ones (news articles stay as they are). If a page that mentions you belongs to someone else, tell the District Web Team.</li>
  <li><b>Talk it through inside your department</b> first, so everyone walks in on the same page.</li>
</ul>`,
        },
        {
          id: 'story',
          title: 'After your review: tell your department\'s story',
          html: `<p>The District is shifting from making sure department websites are correct to helping departments tell their story: videos, spotlights and updates that show how your department supports the District's mission.</p>
<p><b>Start with an editorial calendar.</b> List the events and moments your department has every year in a simple spreadsheet, plan a few campaigns ahead, and reuse last year's content where it still fits. Content made with reuse in mind can run year after year.</p>`,
        },
      ],
    },
    {
      id: 'finalsite',
      label: 'Working in Finalsite',
      intro: 'How to do the everyday work on your pages the right way, so it keeps working.',
      sections: [
        {
          id: 'resources',
          title: 'Uploading and organizing files',
          html: `
<ul>
  <li>Upload only PDF, PNG and JPEG files. Never upload a Word or Excel file directly: convert it to PDF first, so it cannot be edited after posting. Check accessibility, confirm the folder, then test the link.</li>
  <li>Use logical folder names by content, avoid deep folder structures, and review folders regularly for outdated documents.</li>
  <li>Use clear file names with the school year when it applies (2026-2027-Q1-FiscalReport.pdf rather than fiscalreport.pdf), and no special characters.</li>
  <li>Existing folders are not being reorganized: moving a file breaks every direct link already sent in emails or bookmarks. Set new work up correctly from the start.</li>
</ul>`,
        },
        {
          id: 'links',
          title: 'Linking to pages and files',
          html: `<p>If a page or document lives on browardschools.com, link to it with <b>Site Page</b> or <b>Site File</b>, never by pasting its address. A pasted address breaks the moment the file moves; an internal link follows it. Give every link a descriptive title, since most visitors skim. Take a pass through your pages for pasted browardschools.com addresses and relink them.</p>`,
        },
        {
          id: 'pages',
          title: 'Renaming, moving and retiring pages',
          html: `
<ul>
  <li><b>Renaming.</b> Update the SEO title too, or leave it on its default so it follows the page title. A forgotten custom SEO title is why Google keeps showing an old name. If the address changes, the old one needs a redirect: ask us if you are not sure.</li>
  <li><b>Moving.</b> A move to a new parent takes effect when you publish. If Finalsite reports a duplicate address, publish first, then move it again.</li>
  <li><b>Retiring.</b> Hiding a page from navigation does not take it off the web. Link it to its replacement (Settings, then Linked page) so visitors from Google or an old bookmark land in the right place.</li>
  <li><b>Legacy pages</b> from SchoolWires may still be live but hidden. Relink what should point to your current page, and move what you no longer need into a "deletion" folder rather than deleting it.</li>
  <li><b>Share your new addresses</b> in anything you send to schools so search results catch up. Google usually reflects a change within about a week.</li>
</ul>`,
        },
        {
          id: 'access',
          title: 'Access to a page',
          html: `<p><b>Do I have access?</b> Sign in to Finalsite, then open the page on the live site. If you can edit it, an Edit option appears in the top right.</p>
<p><b>Lost access?</b> Sign out of Finalsite and back in. Still missing? <a href="#feedback" data-msg="I lost access to a page in Finalsite: ">Tell us</a>: an account can sit in only one access group, so an extra group can block the one you need. Pages left over from an old department layout can also sit outside your section; we can move them.</p>`,
        },
        {
          id: 'content',
          title: 'Images, committees and contact details',
          html: `
<ul>
  <li><b>Images with text in them</b> (including AI graphics and flyers) are not accessible. Use a post board with a real photo as each thumbnail and write the text out on the page.</li>
  <li><b>Committee pages</b> live under Community, then Advisory &amp; Committees. Link to them instead of keeping a copy, give the bylaws link a short description (150 to 250 characters), and list a contact on every committee page.</li>
  <li><b>Moving offices?</b> Update the contact address at the bottom of your homepage, and anywhere else it appears, linked to the new Google Maps location, as soon as the move is set.</li>
</ul>`,
        },
        {
          id: 'shared',
          title: 'Shared elements',
          html: `<p>A shared element is content built once in Finalsite and placed in more than one spot, so a department's information can read the same on every school site. Edit it once in Composer, then Elements, and the change appears everywhere it is placed. On a page, a shared element shows a <b>Shared</b> button where the gear icon usually is.</p>
<ul>
  <li><b>Edit Shared</b> changes it everywhere. Use it when your department's information changes.</li>
  <li><b>Orphan and Edit</b> turns one copy into a separate element that stops getting updates. Avoid it on content your department owns.</li>
  <li>Deleting a shared element removes it from every page it is on. Finalsite shows how many times it is used before you delete: read that number first.</li>
</ul>
<p>Need a school to add or change something on its own site? See <a href="#guide/tools/schools">Requesting updates across schools</a>.</p>`,
        },
      ],
    },
    {
      id: 'standards',
      label: 'Content Standards',
      intro: 'Brand, accessibility and AI: the rules every page and file follows.',
      sections: [
        {
          id: 'ada',
          title: 'Making a document accessible',
          html: `<p>ADA (the Americans with Disabilities Act) requires BCPS websites to work for everyone, including people using screen readers, keyboard navigation and voice control. Before a document goes on your site:</p>
<ol class="guide-steps">
  <li><b>Check accessibility in Word first.</b> Review, then Check Accessibility. Resolve every flagged issue.</li>
  <li><b>Save as PDF</b> and confirm it opens in Adobe Acrobat, not Adobe Reader.</li>
  <li><b>Run the Acrobat Accessibility Checker.</b> All Tools, Prepare for Accessibility, Check for Accessibility. Right-click each issue and choose Fix until the list is clear, then save.</li>
  <li><b>Scanned document?</b> Run Scan &amp; OCR first, then the checker.</li>
</ol>`,
        },
        {
          id: 'ai',
          title: 'AI and branding',
          html: `<p>AI is welcome. The goal is to make the on-brand, accessible path the easy one. Watch for what generic AI gets wrong: colors outside BCPS Blue, Green and Orange, script or decorative fonts, low-contrast text (under 4.5:1), a missing or altered BCPS logo, no School Board list or non-discrimination statement, and files with no headings, alt text or reading order.</p>
<ul>
  <li><b>High visibility</b> (districtwide, press or media-facing): route it through the Marketing &amp; Communications Request Form.</li>
  <li><b>Routine</b> (internal, day-to-day): self-serve, but it must pass the Top Ten Communications checklist, which includes an AI verification line.</li>
</ul>`,
        },
        {
          id: 'tools',
          title: 'Editing tools you can use',
          html: `
<ul>
  <li><b>Adobe Acrobat</b>, <b>Adobe Express</b> and <b>Adobe Premiere</b> through District Adobe access (sign in with your P-number through SSO).</li>
  <li><b>Canva</b>, free with your own educational account.</li>
  <li><b>Clipchamp</b> in Microsoft 365, for video, image and audio.</li>
  <li><b>Finalsite Image Editor</b> to resize and crop inside your resource folder.</li>
</ul>
<p>Whatever the tool, follow BCPS branding: use the logo correctly and follow the design standards. A video resource for departments is on the way.</p>`,
        },
      ],
    },
    {
      id: 'tools',
      label: 'Tools & Widgets',
      intro: 'Everything you use, one click away.',
      sections: [
        {
          id: 'links',
          title: 'Your tools',
          html: `
<ul class="guide-links">
  <li><a href="/?page=dashboard&amp;tab=audit"><b>Run Audit</b><span>Your page with every check pinned on it, plus the ADA scan.</span></a></li>
  <li><a href="/playbooks/wcm-department/score-100-checklist"><b>Department Page Checklist</b><span>What the audit checks, with the Finalsite steps.</span></a></li>
  <li><a href="${FINALSITE_URL}" target="_blank" rel="noopener noreferrer"><b>Finalsite</b><span>Edit your live department page.</span></a></li>
  <li><a href="/certification/departments/dashboard"><b>Certification course</b><span>Your progress, and your certificate and badge.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=analytics"><b>Analytics</b><span>Your department's visitors and most visited pages.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=widgets"><b>Widgets</b><span>Every widget built so far, and the ones you edit.</span></a></li>
  <li><a href="/?page=members"><b>Members</b><span>Your roster status and your teammates.</span></a></li>
  <li><a href="/?page=notes"><b>Meeting Notes</b><span>Every Hot Lab, with its recording.</span></a></li>
</ul>`,
        },
        {
          id: 'analytics',
          title: 'Your department\'s Analytics',
          html: `<p>The <a href="/?page=dashboard&amp;tab=analytics">Analytics</a> tab shows only your department. Choose the period (calendar year, school year or custom dates) to see visits and visitors by month and your most visited pages, which are the best candidates for your Quick Access buttons. If your department's address moved, earlier months under the old address still count.</p>`,
        },
        {
          id: 'widgets',
          title: 'Widgets',
          html: `<p>Need more than a standard page, like a searchable directory or program list? The District Web Team builds widgets, an enhanced Finalsite minibase. The Charter Schools directory is the working example. Send us a spreadsheet and we mock one up with you.</p>
<ul>
  <li>Widgets are embeds, so they go anywhere an embed can.</li>
  <li>Your department's editors keep them current from BCPS MarComm, and a change shows right away. The ${'<a href="/playbooks/wcm-department/bcps-widget-editing-guide">widget editing guide</a>'} has the steps.</li>
  <li>The <a href="/?page=dashboard&amp;tab=widgets">Widgets</a> tab is a showroom of every widget built so far. Have a different idea? <a href="#feedback" data-msg="Widget idea for our department: ">Ask us</a>.</li>
</ul>`,
        },
        {
          id: 'schools',
          title: 'Requesting updates across schools',
          html: `<p>If your department needs schools to add or update information on their websites, start with an ${ext(IIQ_URL, 'Incident IQ ticket to Application Services')}. Application Services will:</p>
<ol class="guide-steps">
  <li>Review the request and confirm the content requirements.</li>
  <li>Recommend the best approach, which may include a shared element.</li>
  <li>If school updates are needed, write instructions for school WCMs.</li>
</ol>
<p><b>Wait to contact schools until Application Services has sent those instructions.</b> This is the one request that starts with a ticket. For anything about your own department page, use the blue message button.</p>`,
        },
      ],
    },
    {
      id: 'help',
      label: 'Hot Lab & Help',
      intro: 'Where to get an answer, fast.',
      sections: [
        {
          id: 'hotlab',
          title: 'Hot Lab',
          html: `<p>Every <b>Tuesday and Thursday, 11:30 AM to 12:30 PM</b> on Teams. Bring a page, a task or a question. We also show work other departments are doing, walk through hard problems together, and build new tools every department can use. It is worth making time for.</p>
<p>Every session is recorded, so missing one is fine: the notes and recording are in <a href="/?page=notes">Meeting Notes</a>. If an older Hot Lab series still shows on your calendar, use this link or the meeting titled Department WCM Hot Lab (Current).</p>
<p>${'<a class="guide-btn" href="' + HOT_LAB_JOIN_URL + '" target="_blank" rel="noopener noreferrer">Join Hot Lab on Teams</a>'}</p>`,
        },
        {
          id: 'message',
          title: 'Send the District Web Team a message',
          html: `<p>Use the blue message button in the bottom right of any page on BCPS MarComm. It goes straight to the District Web Team, so there is no need to also post in Teams or email. It is faster than an Incident IQ ticket for anything about your department page.</p>
<p><a class="guide-btn" href="#feedback">Send a message</a></p>
<p>Found a tool, tip or example worth sharing? Drop it in the Hot Lab chat so everyone can use it.</p>`,
        },
        {
          id: 'current',
          title: 'How this guide stays current',
          html: `<p>This guide is refreshed every <b>Thursday by 5 PM</b> from that week's Hot Labs and updates, and a short email the following <b>Monday</b> points back here with what changed. The guide is always the current version: the email is just the pointer. See <a href="#guide/changes">What's New</a> for every change.</p>`,
        },
        {
          id: 'feedback',
          title: 'Tell us what this guide is missing',
          html: `<p>Something unclear, out of date, or missing? Tell us and it goes into the next Thursday refresh.</p>
<p><a class="guide-btn" href="#feedback" data-msg="Feedback on the Department WCM Guide: ">Leave feedback on this guide</a></p>`,
        },
      ],
    },
  ],
  changes: [
    { date: '2026-10-29', text: 'The Department WCM Playbook, Registration: Getting Started, and Certification Complete: What\'s Next are now one guide, with an Overview built for you, a tab for each step, and search. From the October 29 Hot Lab: check that your audit lists only your pages, side-by-side sections are allowed, what to do with past dates, how to ask for help, and items only Finalsite can fix. Added Tell your department\'s story. 45 department WCMs certified, the course open through the weekend, and the check at the end of the day Monday, November 2.' },
    { date: '2026-10-28', text: 'Added Requesting updates across schools (an Incident IQ ticket to Application Services first). From the October 27 Hot Lab: working an audit item step by step, review items, what Draft means, heading order, finding your page in Finalsite, and your department\'s Analytics tab.' },
    { date: '2026-10-22', text: 'Editing access is paused starting Monday, November 2 for anyone not certified, and restored once they finish. The audit includes pages linked from your main page, shows when each page was checked, and lets you mark items done, request a re-audit and flag pages for reclassification.' },
    { date: '2026-10-20', text: 'Run Audit is live, with green, red and amber checks and the Department Page Checklist. The ADA scan moved into Run Audit. Added the certificate badge, the Widgets showroom, updating your address when an office moves, and old pages in Google.' },
    { date: '2026-10-06', text: 'The three website review windows, checking every page that mentions your department, messages through BCPS MarComm, page access, moving pages, committee pages, and images that carry text.' },
    { date: '2026-09-25', text: 'One set of Adobe access steps, video guidance, Department Widgets, the Analytics Campaigns tab, lost page access, and division Teams chats.' },
    { date: '2026-09-23', text: 'What directors do on the roster form, checking your status on Members, linking internally, renaming pages, and legacy pages.' },
    { date: '2026-09-17', text: 'Training sections from the Kickoff: AI and branding, accessibility, Analytics, and managing resources.' },
    { date: '2026-09-08', text: 'Launched. Certification deadline set: October 30, 2026.' },
  ],
}
