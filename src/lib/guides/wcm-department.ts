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
// Department WCM certification: due date, and the day the District Web Team
// reviews who has not finished and follows up with each one. Extended from
// Oct 30 to Thursday, Nov 5 (Sean, 2026-10-29); no one's access is switched
// off on a date, so nothing here says so.
export const CERT_DUE = '2026-11-05'
export const CERT_CHECK = '2026-11-09'

const ext = (href: string, label: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`

// Audit tab building blocks (Sean, 2026-11-03: everything a WCM needs about the
// audit in one place, visual, no separate playbook). Fix cards and FAQ
// entries are native <details> so they open in place and the guide search
// still finds their text.
const TONE = {
  red: { bar: '#b91c1c', pillBg: '#fde8e8', pillFg: '#8f1d1d', label: 'Red' },
  amber: { bar: '#b45309', pillBg: '#fbf0d4', pillFg: '#7a5200', label: 'Amber' },
}
const courseLink = (m: string, p: string, label: string) =>
  `<a href="/certification/departments/course/${m}/${p}">${label}</a>`
const auditFix = (o: { tone: 'red' | 'amber'; title: string; why: string; steps: string[]; course: [string, string, string] }) => {
  const t = TONE[o.tone]
  return `<details style="border:1px solid #d6e4ee;border-left:6px solid ${t.bar};border-radius:8px;margin:0 0 8px;background:#fff"><summary style="cursor:pointer;padding:11px 14px;font-weight:700;color:#1a1a1a"><span style="display:inline-block;background:${t.pillBg};color:${t.pillFg};border-radius:99px;padding:1px 9px;font-size:11px;font-weight:800;margin-right:8px">${t.label}</span>${o.title}</summary><div style="padding:0 14px 12px"><p>${o.why}</p><ol class="guide-steps">${o.steps.map((s) => `<li>${s}</li>`).join('')}</ol><p>Taught in ${courseLink(o.course[0], o.course[1], o.course[2])}.</p></div></details>`
}
const auditFaq = (q: string, a: string) =>
  `<details style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;margin:0 0 8px;background:#fff"><summary style="cursor:pointer;padding:11px 14px;font-weight:700;color:#1a1a1a">${q}</summary><div style="padding:0 14px 12px">${a}</div></details>`
const auditStat = (color: string, bg: string, title: string, body: string) =>
  `<div style="border:1px solid ${color};background:${bg};border-radius:10px;padding:12px 14px"><div style="font-weight:800;color:${color};font-size:15px">&#9679; ${title}</div><div style="margin-top:4px">${body}</div></div>`

export const WCM_DEPARTMENT_GUIDE: GuideDef = {
  slug: 'wcm-department',
  eyebrow: 'BCPS MarComm',
  title: 'Department WCM Guide',
  audience: 'Department Web Content Managers',
  updated: '2026-11-03',
  cadence: 'refreshed every Thursday',
  replaces: {
    'bcps-wcm-registration-2026-27': 'start',
    'bcps-wcm-cert-complete-2026-27': 'certify',
    'bcps-wcm-start-here': 'start',
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
          id: 'signin',
          title: 'Can\u2019t sign in?',
          html: `<p>Most sign-in trouble is a registration that was never finished, so check that you completed both steps: LAB first, then your account here. Still stuck? <a href="#feedback" data-msg="I cannot sign in to BCPS MarComm: ">Tell us right away</a>: nothing else in this guide works until you can sign in.</p>`,
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
<p>Certification is due <b>Thursday, November 5, 2026</b>, extended from October 30 to give everyone a little more room. If anything is in the way, or you need more time, <a href="#feedback" data-msg="I need help finishing the certification: ">tell us</a> and we will work it out with you. After the deadline, the District Web Team follows up with anyone who has not finished.</p>
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
      intro: 'Everything about your audit in one place: what the colors mean, how to fix the items flagged most often, what is not yours to fix, and where to get help.',
      sections: [
        {
          id: 'how',
          title: 'Your audit at a glance',
          html: `
<p>Open <a href="/?page=dashboard&amp;tab=audit">Run Audit</a> on your dashboard. You see a picture of your page, on desktop and phone, with a numbered pin on every check. The ADA scan runs at the same time, so it is one place for both.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0">
  ${auditStat('#15803d', '#eaf6ee', 'Green', 'Passes. Nothing to do.')}
  ${auditStat('#b91c1c', '#fdeeee', 'Red', 'Needs a fix. These are your list.')}
  ${auditStat('#b45309', '#fdf5e4', 'Amber', 'Take a look. Amber never changes your score.')}
</div>
<p><b>What it checks</b>, in five areas:</p>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px">
  <span style="border:1px solid #d6e4ee;background:#f3f8fc;border-radius:99px;padding:4px 12px;font-weight:700;color:#0e4e73">Homepage</span>
  <span style="border:1px solid #d6e4ee;background:#f3f8fc;border-radius:99px;padding:4px 12px;font-weight:700;color:#0e4e73">Layout</span>
  <span style="border:1px solid #d6e4ee;background:#f3f8fc;border-radius:99px;padding:4px 12px;font-weight:700;color:#0e4e73">Content</span>
  <span style="border:1px solid #d6e4ee;background:#f3f8fc;border-radius:99px;padding:4px 12px;font-weight:700;color:#0e4e73">Navigation</span>
  <span style="border:1px solid #d6e4ee;background:#f3f8fc;border-radius:99px;padding:4px 12px;font-weight:700;color:#0e4e73">Accessibility (ADA)</span>
</div>
<ul>
  <li>Every check is a standard from the certification course and links to the course page that teaches it, so the audit and the training never disagree.</li>
  <li>Issues in the site header, menus and footer belong to Finalsite and never count against you.</li>
  <li>The audit includes pages linked from your main page, not only the ones in the menu, and shows when each page was last checked.</li>
</ul>
<p><a class="guide-btn" href="/?page=dashboard&amp;tab=audit">Go to Run Audit</a> <a class="guide-btn guide-btn-outline" href="/playbooks/wcm-department/score-100-checklist">Department Page Checklist</a></p>
<p class="guide-note">The <b>Department Page Checklist</b> is exactly what the audit checks, nothing more, with the Finalsite steps for each item. Meet every item and your page scores 100.</p>`,
        },

        {
          id: 'walkthrough',
          title: 'Walkthrough: the audit in five steps',
          html: `
<p>Use this as a quick map. Each step happens on your dashboard, on the Run Audit tab.</p>
<div style="display:grid;gap:10px;margin:12px 0">
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>1. Open Run Audit.</b> You see your page with a numbered pin on every check. Pins match the numbers in the item list.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>2. Read the colors.</b>
    <div style="margin-top:6px"><span style="color:#15803d;font-weight:700">&#9679; Green</span> passes. &nbsp; <span style="color:#b91c1c;font-weight:700">&#9679; Red</span> needs a fix. &nbsp; <span style="color:#b45309;font-weight:700">&#9679; Amber</span> asks you to take a look. Amber never changes your score.</div></div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>3. Pick a red pin and read the item.</b> Keep your live page open in another tab so you can find the spot. <span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#1672A7;color:#fff;text-align:center;line-height:22px;font-weight:700;font-size:12px">4</span> is pin 4.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>4. Fix it in Finalsite, then publish.</b> A page marked Draft has changes that are not live yet, and the audit can't see them.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>5. Note it, mark it done, and re-audit.</b> Add a short note on what you changed, then mark the item done. When every item is done, select <b>Request re-audit</b> and watch the checks turn green.</div>
</div>
<p class="guide-note">Stuck on a step? Select <b>Still stuck? Ask the District Web Team</b> on the item. The detailed steps are below.</p>`,
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
          id: 'fixes',
          title: 'How to fix the most common items',
          html: `
<p>These come up most often across departments, most common first. Open one to see why it is checked and the steps to fix it. Each step list is the same one you see on the item in Run Audit.</p>
${auditFix({ tone: 'amber', title: 'No text-heavy images or flyers', why: 'Screen readers cannot read text inside an image. If an image carries important information, that information must also be on the page as text.', steps: ['Look at each image pinned on your page.', 'If it is a flyer or graphic full of text, type that information onto the page, or add it as text right below the image.', 'If the image is fine (a photo, say), add a short note and mark it checked.'], course: ['mod4', 'common-issues', 'Module 4: Common Content Issues'] })}
${auditFix({ tone: 'amber', title: 'Linked PDFs are tagged for accessibility', why: 'The Finalsite checker does not open PDFs. Every document you link must pass Adobe Acrobat’s own Accessibility Checker.', steps: ['Open each PDF in Adobe Acrobat and run Tools, Accessibility, Full Check.', 'Fix what it reports, or ask the document’s owner for an accessible version.', 'Replace the file in your Finalsite gallery so the link stays the same.'], course: ['mod9', 'checker', 'Module 9: Finalsite Accessibility Checker'] })}
${auditFix({ tone: 'red', title: 'Headings are in order, with none skipped or empty', why: 'Headings jump levels (H2 straight to H4) or the page has no true H1, so the outline does not make sense to screen reader users.', steps: ['Highlight the heading text inside your content block.', 'Click the Formatting icon (the pilcrow symbol, ¶) in the Composer toolbar.', 'Choose the correct heading level from the dropdown. Work in order down the page: one H1, then H2s under it, then H3s under those. Never skip from H2 straight to H4.', 'Never pick a heading level just to get a certain font size.'], course: ['mod9', 'accessible-page', 'Module 9: What Makes a Page Accessible?'] })}
${auditFix({ tone: 'red', title: 'The Overview page is labeled with the department name', why: 'In a large district site, a menu item called just “Overview” or “Home” does not tell visitors which department they reached.', steps: ['Open the Overview page settings in Composer.', 'Rename it with your department name or initials before “Overview”, for example “OC Overview”.', 'Publish the page.'], course: ['mod5', 'dropdowns', 'Module 5: Checking and Correcting Navigation'] })}
${auditFix({ tone: 'amber', title: 'No long unbroken blocks of text', why: 'Very long blocks of content are hard to scan. Content that belongs together but does not all need to be visible should go in lists, accordions or tabs.', steps: ['Turn any paragraph that lists three or more items into a bulleted list.', 'Move detail not every visitor needs into an accordion (Add Element, Layout tab, Accordion).', 'Use tabs when the content splits by audience or program.'], course: ['mod4', 'proofreading', 'Module 4: Condensing and Organizing Content'] })}
${auditFix({ tone: 'red', title: 'Every link has readable text', why: 'Link text like “click here”, “read more” or a bare web address does not tell a screen reader user where the link goes.', steps: ['Run Composer’s Accessibility Checker to see every non-descriptive link flagged across the page at once.', 'Select the link text and edit it directly. You do not need to touch the address.', 'Rewrite it to describe the destination, for example “View the 2026-27 meal benefits application” instead of “click here”.'], course: ['mod12', 'link-language', 'Module 12: Link Language'] })}
${auditFix({ tone: 'red', title: 'Three to six Quick Access buttons', why: 'Quick Access buttons take visitors straight to your most visited pages. Limit them to your real top priorities; do not list every page.', steps: ['Pick your three to six most visited pages. Your <a href="/?page=dashboard&amp;tab=analytics">Analytics</a> tab shows them.', 'For each one, add a link in a Content element under your description.', 'Right-click the link, choose Edit Link, and apply a button size class and a color class (for example small button and button blue).'], course: ['mod2', 'homepage', 'Module 2: Required Content: Homepage'] })}
${auditFix({ tone: 'red', title: 'The description is 250 characters or fewer', why: 'A concise description is the first thing visitors see. Keep it brief and direct; the rest of the page carries the detail.', steps: ['Copy your description into Copilot and ask it to shorten it to 250 characters or fewer.', 'Paste the shorter version back into the first Content element.', 'Move the longer text further down the page, or into an accordion.'], course: ['mod2', 'homepage', 'Module 2: Required Content: Homepage'] })}
${auditFix({ tone: 'red', title: 'Internal links use site page links, not copied URLs', why: 'Links made with Finalsite’s site page option update themselves when a page moves. Addresses copied from the browser break when pages are renamed.', steps: ['Right-click each pinned link and choose Edit Link.', 'Change the link type to Site Page (or Site File) and pick the page from the list.', 'Save and publish.'], course: ['mod5', 'dropdowns', 'Module 5: Checking and Correcting Navigation'] })}
${auditFix({ tone: 'red', title: 'All hyperlinks are working', why: 'Every link on your department site must work. Broken links leave visitors at a dead end.', steps: ['Open each link listed on the item.', 'Relink it with the site page or file option, not a pasted address, so it keeps working when pages move.', 'Remove the link if the destination no longer exists.'], course: ['mod5', 'standards', 'Module 5: Navigation Standards'] })}
${auditFix({ tone: 'red', title: 'All dates and information are current', why: 'Dates from past school years and expired deadlines are among the most common findings, and they undermine trust in everything else on the page.', steps: ['Search the page for past school years (for example 2024-25 or 2024-2025).', 'Update or remove anything out of date.', 'If older material must stay, move it into an Archive section labeled by school year.', 'If the wording should stay as it is, say so in your note and mark the item done.'], course: ['mod4', 'writing', 'Module 4: Writing and Updating Content'] })}
${auditFix({ tone: 'red', title: 'The left navigation menu is on the page', why: 'District standard requires the left menu on all department pages. It gives visitors access to every sub-page and section.', steps: ['In Compose Mode, click the building block icon, then Page Appearance, then Left Banner.', 'Set the left nav tier: Tier 2 for main department pages, Tier 3 for sub-pages.', 'Publish, then check every sub-page appears in the menu.'], course: ['mod5', 'standards', 'Module 5: Navigation Standards'] })}
${auditFix({ tone: 'red', title: 'Single-column page layout', why: 'A page laid out in two columns all the way down breaks on phones and is harder to scan. A small section placed side by side, such as Important Links or a logo beside your introduction, is fine.', steps: ['In Compose Mode, click the building block icon, then “Edit page layout, banners and themes”, and confirm the page is single column.', 'For any two- or three-column layout that runs the length of the page, drag its content out into the single column.', 'Use accordion or tab elements (Add Element, Layout tab) to organize what was in the side column.'], course: ['mod3', 'standards', 'Module 3: Layout Standards'] })}
${auditFix({ tone: 'red', title: 'Contact information at the bottom, in the required format', why: 'Visitors look for contact details at the bottom of the page. The required format works the same way on every department page.', steps: ['At the bottom of the homepage, add or edit a Content element with your department name in bold, your address linked to your Google Maps location, and your phone number.', 'Link the phone number with tel: and no spaces, for example tel:7545551234.', 'Fax is optional: use the “F:” prefix in the same format.'], course: ['mod2', 'homepage', 'Module 2: Required Content: Homepage'] })}
${auditFix({ tone: 'red', title: 'Photos use the rounded photo element, not a Content element', why: 'Photos use the WCM Enhancements rounded-corner photo element. Images inserted directly into a Content element do not follow the district style and are hard to manage.', steps: ['Delete the image from inside the Content element.', 'Add a Resource (photo) element in its place and choose the image from your gallery.', 'Apply the rounded photo style from WCM Enhancements, and give the photo alt text.'], course: ['mod2', 'homepage', 'Module 2: Required Content: Homepage'] })}
<p class="guide-note">Not on this list? Open the item in Run Audit. Every item carries its own steps and the course page that teaches it.</p>`,
        },

        {
          id: 'finalsite',
          title: 'What is yours to fix, and what is not',
          html: `
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:0 0 12px">
  <div style="border:1px solid #b9dcc0;border-top:6px solid #15803d;border-radius:10px;padding:12px 14px;background:#fff"><b style="color:#15803d">Yours to fix</b>
    <ul style="margin:8px 0 0">
      <li>Content on your pages: text, links, dates, images, headings</li>
      <li>Your page layout and Quick Access buttons</li>
      <li>PDFs you upload and link</li>
    </ul></div>
  <div style="border:1px solid #d6e4ee;border-top:6px solid #1672A7;border-radius:10px;padding:12px 14px;background:#fff"><b style="color:#0e4e73">Not yours: tell us</b>
    <ul style="margin:8px 0 0">
      <li>Site header, menus and footer, which belong to Finalsite</li>
      <li>Template markup and some accessibility rules only Finalsite can change</li>
      <li>A page in your list that belongs to another office</li>
    </ul></div>
</div>
<p><b>Items only Finalsite can fix</b> should not be on your list, and they never count against you. If one appears, select <b>Still stuck? Ask the District Web Team</b> on the item so we can take it off.</p>
<p><b>PDFs.</b> Run Adobe Acrobat’s Accessibility Checker before you post. If it reports something with no available fix, even after you have tried, use Still stuck and tell us what the checker says. That is how we decide what to take off your list.</p>`,
        },

        {
          id: 'tips',
          title: 'A few more answers',
          html: `
<ul>
  <li><b>Review items are not errors.</b> Amber items such as text-heavy images only ask you to look. Check the image, add a note, and mark it checked.</li>
  <li><b>Side-by-side sections are allowed.</b> The single-column standard is about a whole page split into two columns. A small side-by-side section, such as Important Links or a logo beside your intro, is fine. The audit still flags these: skip that item for now, the check is being corrected.</li>
  <li><b>Past dates on a page.</b> Review the page with your team. It is often a chance to post a short update. If the wording stays, say so in the note and mark it done.</li>
  <li><b>Finding your page in Finalsite.</b> Departments, then Department Branch, then BCPS Departments. Select the page icon, not the title, then Compose. Bookmark it.</li>
</ul>
<p class="guide-note">Scores will be reset for everyone once this version of the audit is confirmed, so treat today's number as a guide to what to fix rather than a final grade.</p>`,
        },

        {
          id: 'faq',
          title: 'Frequently asked questions',
          html: `
${auditFaq('I fixed it in Finalsite, but it is still red. Why?', '<p>Almost always because the page is still marked <b>Draft</b>. A fix that is not published does not show on the live page, and the audit only sees the live page. Publish it, then run the audit again on that page or select <b>Request re-audit</b>.</p>')}
${auditFaq('How many times can I run the audit?', '<p>You can run it again on a page up to 15 pages a day. When every item is done, <b>Request re-audit</b> is the quickest way to see everything turn green.</p>')}
${auditFaq('What is the difference between red and amber?', '<p><b>Red</b> means the page does not meet a standard and needs a fix. <b>Amber</b> asks you to take a look, for example whether an image is a flyer. Amber never changes your score. Check it, add a note, and mark it checked.</p>')}
${auditFaq('A page in my audit is not mine. What do I do?', '<p>Some departments look like one office from the outside. Select the page for reclassification, or use Still stuck and tell us who manages it. You are not expected to fix another office’s page.</p>')}
${auditFaq('A page of mine is missing from the audit.', '<p>The audit includes your main page, your left menu, and every quick link on your main page that lands under your address. If one is still missing, add any browardschools.com page by its link and it is audited next.</p>')}
${auditFaq('Why is my score not 100?', '<p>Only green and red items count. Open Run Audit, work through the red pins, then re-audit. The <a href="/playbooks/wcm-department/score-100-checklist">Department Page Checklist</a> is exactly what is checked.</p>')}
${auditFaq('The audit flagged something that looks right to me. Is it wrong?', '<p>It can be. The audit is new and the District Web Team is going through its rules, including the ones WCMs ask about. Two examples already corrected or being corrected: side-by-side sections such as Important Links, and items only Finalsite can fix. Use <b>Still stuck?</b> and tell us what you see. When several people raise the same thing, it moves up the list.</p>')}
${auditFaq('Do I have to do the audit myself?', '<p>Your department page is your responsibility as WCM. The audit tells you exactly what to fix and where, and the District Web Team and Hot Lab are there when you are stuck.</p>')}
<p><a class="guide-btn guide-btn-outline" href="#feedback" data-msg="My audit question: ">Ask a question that is not here</a></p>`,
        },

        {
          id: 'help',
          title: 'Stuck? Four ways to get unstuck',
          html: `
<div style="display:grid;gap:10px;margin:12px 0">
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>1. Follow the steps on the item.</b> Every item in Run Audit says what to do, in order.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>2. Open the course page it links to.</b> It shows where the thing is in Finalsite.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #1672A7;border-radius:8px;padding:12px 14px"><b>3. Select Still stuck? Ask the District Web Team.</b> Say what does not make sense and give as much detail as you can. Questions are answered in order, and one several people ask moves up the list.</div>
  <div style="border:1px solid #d6e4ee;border-left:6px solid #C55326;border-radius:8px;padding:12px 14px"><b>4. Come to Hot Lab.</b> Tuesday and Thursday, 11:30 AM to 12:30 PM on Teams. Bring your audit and we work through it together. <a href="${HOT_LAB_JOIN_URL}" target="_blank" rel="noopener noreferrer">Join on Teams</a></div>
</div>`,
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
          id: 'training',
          title: 'Tools that come with hands-on training',
          html: `<p>A few tools here, like the Find It Fast editor, are not turned on for every WCM. They are granted person by person after a short hands-on walkthrough set up around what your role needs. If your work calls for one, bring it to <a href="#guide/help/hotlab">Hot Lab</a> or <a href="#feedback" data-msg="I would like training on this tool: ">send us a message</a>. Once you are trained, the tool appears in your menu. A colleague who needs the same tool asks the same way.</p>`,
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
      id: 'leaderboard',
      label: 'Leaderboard',
      intro: 'How Department WCMs earn points this school year.',
      sections: [
        {
          id: 'how',
          title: 'How the leaderboard works',
          html: `<p>Every Department WCM earns points for the work that keeps department sites in good shape. The leaderboard shows the <b>top 20</b> this school year. It starts over every school year, so everyone begins even.</p>
<p>Points update after each Hot Lab, once the meeting notes are posted. The board shows first name, last initial and department.</p>
<p>Hot Lab points come from the people named in each posted meeting note, so someone who joins and stays quiet may be missed. If a session is missing for you, <a href="#feedback" data-msg="A Hot Lab is missing from my leaderboard points: ">tell us</a> and we will add it.</p>`,
        },
        {
          id: 'rubric',
          title: 'Point chart (100 points)',
          html: `<table>
  <thead><tr><th>Category</th><th>Points</th><th>How you earn them</th></tr></thead>
  <tbody>
    <tr><td><b>Certification</b></td><td>Up to 40</td><td>Certified by Oct 30: 40. By Nov 5: 30. By Nov 9: 20. After Nov 9: 10.</td></tr>
    <tr><td><b>In-person Hot Labs</b></td><td>Up to 30</td><td>3 points for each Hot Lab you attend this school year, up to 30.</td></tr>
    <tr><td><b>Kickoff</b></td><td>10</td><td>You attended the September 10 Kickoff.</td></tr>
    <tr><td><b>Audit started</b></td><td>Up to 20</td><td>10 for marking your first audit item, and 10 more once at least half your findings are fixed.</td></tr>
  </tbody>
</table>
<p>Ties go to whoever certified first.</p>
<p><a class="guide-btn" href="#guide/certify">Finish certification</a></p>`,
        },
        {
          id: 'standing',
          title: 'Where you stand',
          html: `<p>If you are not in the top 20, you will not appear on the board. Your own dashboard shows your rank and how many points you need to reach the top 20.</p>
<p>Not sure which points you are missing? Ask in <a href="#guide/help/hotlab">Hot Lab</a> or <a href="#feedback" data-msg="Question about my leaderboard points: ">send us a message</a>.</p>`,
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
          id: 'reference',
          title: 'Earlier documents',
          html: `<p>Everything in these is now in this guide. They are kept as they were, for reference.</p>
<ul>
  <li><a href="/playbooks/wcm-department?standalone=1" target="_blank" rel="noopener">Department WCM Playbook</a>, as of October 29, 2026, including the September 10 Kickoff recap.</li>
  <li><a href="/playbooks/bcps-wcm-registration-2026-27?standalone=1" target="_blank" rel="noopener">Registration: Getting Started</a></li>
</ul>`,
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
    { date: '2026-11-03', text: 'Your Audit rebuilt as one place for everything about the audit: the colors and the five areas at a glance, step-by-step fixes for the 15 items flagged most often, what is yours to fix and what is not, frequently asked questions, and four ways to get unstuck.' },
    { date: '2026-11-03', text: 'New Leaderboard tab: the live top 20 for this school year, certification tiles, and the 100-point chart (certification, Hot Labs, the Kickoff, and starting your audit). Your Overview shows your own standing.' },
    { date: '2026-11-02', text: 'New: a walkthrough of the audit in five steps, at the start of Your Audit: open Run Audit, read the colors, fix a red pin, publish, then note it and re-audit. Hot Labs on Tuesday, November 3 and Thursday, November 5 cover the audits.' },
    { date: '2026-10-30', text: 'Start Here: Web Content Manager Onboarding folded in: what to do when you cannot sign in, and how to get the tools that come with hands-on training. The earlier documents are listed under Hot Lab & Help, for reference.' },
    { date: '2026-10-29', text: 'Certification extended to Thursday, November 5. Hot Labs on Tuesday, November 3 and Thursday, November 5 are the place to get help finishing.' },
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
