// The Director Guide (Sean, 2026-10-29): the third guide, in place of the
// Director Playbook document (briefings director-department) and the Common
// questions that lived on the directors' My Resources tab until that tab was
// retired (2026-10-28). Directors review rather than do the work, so the
// guide is what to know and what to ask of your WCM; the how-to stays in the
// Department WCM Guide. Refreshed every Thursday with the WCM guide.
import type { GuideDef } from './types'
import { LAB_SHORT_LINK, IIQ_URL } from './wcm-department'

const ext = (href: string, label: string) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`

export const DIRECTOR_DEPARTMENT_GUIDE: GuideDef = {
  slug: 'director-department',
  eyebrow: 'BCPS MarComm',
  title: 'Director Guide',
  audience: 'department directors',
  updated: '2026-10-29',
  cadence: 'refreshed every Thursday',
  replaces: {},
  tabs: [
    {
      id: 'wcm',
      label: 'Your WCM',
      step: 1,
      intro: 'Every department website has a Web Content Manager (WCM) from your team. Naming yours is the one thing only you can do.',
      sections: [
        {
          id: 'confirm',
          title: 'Confirm your Web Content Manager',
          html: `<p>Confirm who manages your department's website at <a href="/wcm-roster-signup">bcpsmarcomm.com/wcm-roster-signup</a>. It takes less than five minutes and needs no sign-in: pick your department, enter your District email, and review the WCMs on file. Submit if the list is right, or remove and add people (adding someone needs their personnel number).</p>
<p>The form has to come from you personally: a submission from anyone else is flagged for review. Once it is approved, you and your WCM each get a confirmation email, and your WCM is connected to Hot Lab and your division's Teams chat.</p>
<p><a class="guide-btn" href="/wcm-roster-signup">Confirm or change your WCM</a></p>`,
        },
        {
          id: 'coverage',
          title: 'How many WCMs you need',
          html: `<p>At least one, and two or three where you can support it, so someone trained can always cover. If your department runs lean, it is fine for you to hold the role in the meantime.</p>
<p><b>Departments with their own functions.</b> Some departments include a function with its own WCM, such as Emergency Management within Safety, Security and Emergency Preparedness. From the outside they can look like one office, so tell us who manages which pages.</p>
<p><b>Offices without website pages</b> still benefit from a trained contact, because District initiatives sometimes need a page from any office. If yours has no WCM, <a href="#feedback" data-msg="Our office has no website pages and no Web Content Manager: ">let us know</a>.</p>`,
        },
        {
          id: 'change',
          title: 'A new or changed WCM',
          html: `<p>Use the same <a href="/wcm-roster-signup">WCM form</a> to add someone or tell us who has left the role. If someone new has just taken over your pages, <a href="#feedback" data-msg="We assigned a new Web Content Manager recently: ">tell us</a> and we will fast-track them through certification so the work is not held up.</p>
<p>New WCMs start at ${ext(LAB_SHORT_LINK, 'bcpsmarcomm.com/lab')}, which takes them straight to the course and works before they have an account.</p>`,
        },
      ],
    },
    {
      id: 'cert',
      label: 'Certification',
      step: 2,
      intro: 'Your WCM completes a self-paced certification course. The single most useful thing you can do is make time for it.',
      sections: [
        {
          id: 'deadline',
          title: 'What is due, and when',
          html: `<p>Certification is due <b>Thursday, November 5, 2026</b>, extended from October 30 to give WCMs a little more room. A quick check-in with your WCM this week helps. After the deadline, the District Web Team follows up with each WCM who has not finished. Anyone new to the role finishes before update access is granted; if someone new has taken over your pages, tell us and we will fast-track them.</p>
<p>WCMs register through LAB (Learning Across Broward), so their hours count toward PD credit. Once certified, they can download a certification badge from their certificate page.</p>`,
        },
        {
          id: 'help',
          title: 'How to help your WCM',
          html: `
<ul>
  <li><b>Check in</b> on where they are in the course. Your dashboard shows each WCM's progress.</li>
  <li><b>Make time for Hot Lab</b>, Tuesdays and Thursdays, 11:30 AM to 12:30 PM. It is where WCMs get live help, see what other departments do, and build new tools together. Sessions are recorded.</li>
  <li><b>Back the updates</b> that come out of your review. Your WCM makes the changes, but they need you behind them.</li>
</ul>`,
        },
      ],
    },
    {
      id: 'review',
      label: 'Website Review',
      step: 3,
      intro: 'Once a school year, the District Web Team meets with you and your WCM about your department’s website. This is where your department’s web plan for the year is set.',
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
<p>When your window opens, book your meeting from the <a href="/?page=dashboard&amp;tab=review">Website Review</a> tab. Have a bigger initiative and need help sooner? Request an earlier meeting there: you do not have to wait for your window.</p>
<p><a class="guide-btn" href="/?page=dashboard&amp;tab=review">Open Website Review</a></p>`,
        },
        {
          id: 'steps',
          title: 'How the review works',
          html: `
<ol class="guide-steps">
  <li><b>Your WCM works through the audit</b> of your department's pages.</li>
  <li><b>You and your WCM meet with us for one hour:</b> page setup, audit findings, accessibility, and the tools available to you.</li>
  <li><b>We send a written playbook</b> with a timetable, usually two weeks to a month.</li>
  <li><b>We build the changes together</b> with your WCM.</li>
  <li><b>You review the finished site</b> and sign off.</li>
</ol>
<p>The first year is for getting everything in order, so each review after that is lighter. It helps to talk inside your department first about what you want your web presence to do.</p>`,
        },
        {
          id: 'audit',
          title: 'The audit behind the review',
          html: `<p>The department website audit was rebuilt from the certification course. Your WCM runs it from their dashboard and sees every check pinned on your department's pages, with the accessibility scan alongside. Each check links to the course page that teaches it. Issues in the site header, menus and footer belong to the vendor, not your department.</p>
<p>Your WCM marks each item done as they fix it and requests a re-audit. Each audit lists only your department's pages. Scores will be reset once this version is confirmed, so treat today's score as a to-do list rather than a grade.</p>`,
        },
      ],
    },
    {
      id: 'story',
      label: 'Telling Your Story',
      step: 4,
      intro: 'The work is shifting from making sure your website is correct to helping your department tell its story.',
      sections: [
        {
          id: 'calendar',
          title: 'Start with an editorial calendar',
          html: `<p>Videos, spotlights and updates about how your department supports the District's mission. A simple spreadsheet of the events and moments your department has every year is the best start: plan a few campaigns ahead, and reuse last year's content where it still fits. Your one-on-one sessions with the District Web Team are where we help plan it.</p>`,
        },
        {
          id: 'available',
          title: 'What your department can use',
          html: `
<ul>
  <li><b>Analytics.</b> Your department's visitors, most visited pages and trends, on your <a href="/?page=dashboard&amp;tab=analytics">Analytics</a> tab, with marketing ideas drawn from your numbers.</li>
  <li><b>Widgets.</b> Need more than a standard page, such as a searchable directory or program list? We build widgets from a spreadsheet of your information. The Charter Schools directory is the working example. <a href="#feedback" data-msg="We would like to talk about a widget for our department: ">Ask about one</a>.</li>
</ul>`,
        },
      ],
    },
    {
      id: 'dashboard',
      label: 'Your Dashboard',
      intro: 'Your view of BCPS MarComm is read-only: everything about your department’s website, kept current on its own.',
      sections: [
        {
          id: 'tabs',
          title: 'What each tab shows',
          html: `
<ul class="guide-links">
  <li><a href="/?page=dashboard"><b>Overview</b><span>Your WCMs and their certification, your review window, visitors and action items.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=review"><b>Website Review</b><span>Your window, how the review works, and booking your meeting.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=analytics"><b>Analytics</b><span>Who visits your pages and what they read most.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=notes"><b>Meeting Notes</b><span>Notes from the meetings that matter to you.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=hotlabs"><b>Hot Labs</b><span>What the District Web Team is working through with WCMs each week.</span></a></li>
  <li><a href="/?page=dashboard&amp;tab=documents"><b>Documents</b><span>Playbooks shared with you, and your WCM's guide.</span></a></li>
</ul>`,
        },
        {
          id: 'wcm-guide',
          title: 'Your WCM’s guide',
          html: `<p>Your WCM works from the <a href="/?page=dashboard&amp;tab=documents&amp;doc=wcm-department">Department WCM Guide</a>, with every step in detail. This guide is the director's view of the same program.</p>`,
        },
      ],
    },
    {
      id: 'help',
      label: 'Questions & Help',
      intro: 'The questions directors ask most, and how to reach us.',
      sections: [
        {
          id: 'schools',
          title: 'How do I get schools to add or update information on their websites?',
          html: `<p>Start with an ${ext(IIQ_URL, 'Incident IQ ticket to Application Services')}. Application Services will:</p>
<ol class="guide-steps">
  <li>Review the request and confirm the content requirements.</li>
  <li>Recommend the best approach, which may include a shared element for centralized content.</li>
  <li>If school updates are needed, write instructions for school Web Content Managers.</li>
</ol>
<p><b>Wait to contact schools until Application Services has sent those instructions.</b></p>`,
        },
        {
          id: 'new-wcm',
          title: 'I just assigned a new WCM. What about the certification deadline?',
          html: `<p><a href="#feedback" data-msg="We assigned a new Web Content Manager recently: ">Let us know</a>, and our team will work directly with them so they have what they need to get started.</p>`,
        },
        {
          id: 'ask',
          title: 'Who do I ask about anything else?',
          html: `<p>Use the blue message button in the bottom right of any page on BCPS MarComm. It comes straight to the District Web Team. Want to see what your WCMs are working on? You are welcome to sit in on a Hot Lab.</p>
<p><a class="guide-btn" href="#feedback">Send a message</a></p>`,
        },
        {
          id: 'reference',
          title: 'The earlier Director Playbook',
          html: `<p>Everything in it is now in this guide. It is kept as it was, for reference: <a href="/playbooks/director-department?standalone=1" target="_blank" rel="noopener">Director Playbook, as of October 29, 2026</a>.</p>`,
        },
        {
          id: 'current',
          title: 'How this guide stays current',
          html: `<p>This guide is refreshed every <b>Thursday by 5 PM</b>, and a short email the following Monday points back here with what changed. See <a href="#guide/changes">What's New</a>. Something missing? <a href="#feedback" data-msg="Feedback on the Director Guide: ">Tell us</a>.</p>`,
        },
      ],
    },
  ],
  changes: [
    { date: '2026-10-29', text: 'Certification extended to Thursday, November 5. After the deadline, the District Web Team follows up with each WCM who has not finished.' },
    { date: '2026-10-29', text: 'The Director Playbook is now the Director Guide: an Overview built for your departments, a tab for each part of the program, the common questions, and search. 45 department WCMs certified, the course open through the weekend, and the check at the end of the day Monday, November 2. Each audit lists only your department\'s pages, and departments with functions managed by different people should tell us who manages which pages. Added telling your department\'s story.' },
    { date: '2026-10-28', text: 'Added how to get schools to update their websites (an Incident IQ ticket to Application Services first). WCMs who have not finished certification lose editing access starting Monday, November 2.' },
    { date: '2026-10-22', text: 'WCMs can mark audit items done and request a re-audit.' },
    { date: '2026-10-20', text: 'The rebuilt department audit behind the website review, the certification badge, and the first review window opening.' },
    { date: '2026-10-06', text: 'The three review windows by division, requesting support early, and offices without website pages.' },
    { date: '2026-09-29', text: 'Certification progress, what Hot Lab offers, division reviews and widgets.' },
    { date: '2026-09-08', text: 'Launched. Certification deadline set: October 30, 2026.' },
  ],
}
