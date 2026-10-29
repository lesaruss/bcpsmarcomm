// The MarComm Team Guide (Sean, 2026-10-29): the second guide, for everyone in
// the Marcomm Meeting. The weekly meeting, MarComm Assignments and how
// requests come in, in one place, with an Overview showing where the team is
// this week and when the next meeting is. Update it after a Marcomm Meeting
// changes how the team works, and add a line to changes, newest first.
import type { GuideDef } from './types'

// The Marcomm Meeting: Wednesdays, 1:00 to 2:00 PM Eastern, on Teams.
// Jennifer Hodder sends the invitation and runs the tracker.
export const MARCOMM_MEETING_DAY = 3
export const MARCOMM_MEETING_START = { hour: 13, minute: 0 }
export const MARCOMM_MEETING_END = { hour: 14, minute: 0 }
export const MARCOMM_EDITORS = ['Jennifer Hodder', 'Sean Russell', 'Felicia Hicks', 'Farrah Wilson']

const TRACKER = '/marcomm-assignments'

export const MARCOMM_TEAM_GUIDE: GuideDef = {
  slug: 'marcomm-team',
  eyebrow: 'BCPS MarComm',
  title: 'MarComm Team Guide',
  audience: 'the Marcomm Meeting team',
  updated: '2026-10-29',
  cadence: 'updated as the team’s process changes',
  replaces: {},
  tabs: [
    {
      id: 'before',
      label: 'Before the Meeting',
      step: 1,
      intro: 'Five minutes before Wednesday is all it takes: know where each of your items stands so the meeting can move fast.',
      sections: [
        {
          id: 'check',
          title: 'Check your items',
          html: `
<ol class="guide-steps">
  <li><b>Open <a href="${TRACKER}">MarComm Assignments</a></b> and click <b>My items</b>. It shows only the requests where you are the lead or support.</li>
  <li><b>Open each one</b> to see its details, the requester's contact, the date needed and every note so far.</li>
  <li><b>Look for Overdue.</b> A date shown in red and marked Overdue is past its date needed. Ongoing items and ones the team has cleared are never flagged.</li>
  <li><b>Have a one-line update ready</b> for each item: what changed, what is next, and anything you are waiting on.</li>
</ol>`,
        },
        {
          id: 'between',
          title: 'Something changed between meetings?',
          html: `<p>The tracker is updated by its editors: ${MARCOMM_EDITORS.slice(0, -1).join(', ')} and ${MARCOMM_EDITORS[MARCOMM_EDITORS.length - 1]}. If something cannot wait for Wednesday, such as a new date, a finished item or a blocker, send it to Jennifer Hodder and it goes in the tracker right away.</p>`,
        },
      ],
    },
    {
      id: 'meeting',
      label: 'In the Meeting',
      step: 2,
      intro: 'Every Wednesday, 1:00 to 2:00 PM on Teams. The invitation comes from Jennifer Hodder.',
      sections: [
        {
          id: 'runs',
          title: 'How the meeting runs',
          html: `
<ul>
  <li>The tracker is on screen, usually sorted <b>Most urgent first</b>, and each request opens full screen so everyone can read it.</li>
  <li><b>New requests get owners.</b> Anything marked New is assigned a lead and support.</li>
  <li><b>Each owner gives their update</b>, and Jennifer Hodder records the status and a note on the request as you talk.</li>
  <li><b>Dates and priorities</b> are confirmed or changed in the room.</li>
</ul>`,
        },
        {
          id: 'recorded',
          title: 'When the meeting is recorded',
          html: `<p>The recording's transcript is read against the open requests, and every status, owner, date and note it mentions is proposed as an update. An editor reviews the proposal before anything changes, so nothing is applied without a person checking it. Each update is saved as a dated meeting note on the request.</p>`,
        },
      ],
    },
    {
      id: 'after',
      label: 'After the Meeting',
      step: 3,
      intro: 'Every meeting is saved, so anyone can see what was decided and what changed week to week.',
      sections: [
        {
          id: 'versions',
          title: 'Every week is saved',
          html: `<p>After each meeting, the whole tracker is saved as a version under that meeting's date. In MarComm Assignments, use the version list at the top (it starts on <b>Today (live)</b>) to see the tracker exactly as it stood after any meeting. Recorded meetings are saved when their transcript is applied; an editor saves the others by hand.</p>
<p>The <a href="#guide/overview">Overview</a> of this guide shows the latest meeting's recap.</p>`,
        },
        {
          id: 'follow',
          title: 'Follow up on what you took on',
          html: `<p>Open <b>My items</b> again after the meeting. Anything newly assigned to you is there, with the notes from the meeting on it. If a requester needs to hear from you, their contact details are on the request.</p>`,
        },
      ],
    },
    {
      id: 'tracker',
      label: 'MarComm Assignments',
      intro: 'One shared list of every request, in place of the MarComm Spreadsheet.',
      sections: [
        {
          id: 'what',
          title: 'What it is',
          html: `<p>Every request has its lead, support, date needed, status and a dated log of notes underneath. Everyone sees the same list, so there are no copies to reconcile. Requests from the MarComm Request Form arrive on their own with a job number, and the team adds its own work too (those have no job number).</p>
<p><a class="guide-btn" href="${TRACKER}">Open MarComm Assignments</a></p>`,
        },
        {
          id: 'statuses',
          title: 'What each status means',
          html: `
<ul>
  <li><b>New:</b> just arrived and waiting for an owner.</li>
  <li><b>Needs Info:</b> waiting on the requester for something before work can continue.</li>
  <li><b>Assigned:</b> has a lead, and work has not started.</li>
  <li><b>In Progress:</b> being worked on.</li>
  <li><b>In Review:</b> done and out for approval.</li>
  <li><b>Scheduled:</b> set for a date, such as a post going out or an event being covered.</li>
  <li><b>On Hold:</b> paused.</li>
  <li><b>Completed</b> and <b>Declined</b> close the request. Closed requests move to the Completed tab.</li>
</ul>`,
        },
        {
          id: 'finding',
          title: 'Finding things',
          html: `
<ul>
  <li><b>My items</b> shows what you lead or support. The status chips filter the Active list, and the lead list shows any person's or team's work (Graphics, Media, Web and Marketing can own requests too).</li>
  <li><b>Sort</b> by most urgent, date submitted or job number. The team logs work by job number, so it has its own column.</li>
  <li><b>Search</b> finds a request by title, requester, department or job number.</li>
  <li>The <b>Completed</b> tab holds everything closed, most recent first.</li>
</ul>`,
        },
        {
          id: 'calendar',
          title: 'Calendar posts',
          html: `<p>Requests to put an event on the District calendar are listed on the <b>Calendar posts</b> tab of MarComm Assignments. The team posts each one and marks it <b>Posted</b>, with the link to the calendar entry, or <b>Declined</b>.</p>`,
        },
      ],
    },
    {
      id: 'requests',
      label: 'Requests',
      intro: 'How work reaches the team, and what to send people who ask.',
      sections: [
        {
          id: 'form',
          title: 'The MarComm Request Form',
          html: `<p>Send anyone who needs Office of Communications support to <a href="/marcomm-request" target="_blank" rel="noopener">bcpsmarcomm.com/marcomm-request</a>. It replaced the Wufoo form and is open to anyone with the link: signed in, it knows who they are; signed out, they type their District email. Every submission appears in MarComm Assignments as New, with a job number.</p>
<p>Requesters choose the services they need, so nobody has to describe the same thing twice:</p>
<ul>
  <li>Graphic design, Social media, BCPS Happenings, ParentLink message, Press release or media advisory</li>
  <li>Video or BECON coverage, Photography, Livestream</li>
  <li>Website update or pop-up, Event support, Marketing campaign, Writing or editing</li>
</ul>
<p>They also give a short title, the audience, the date needed (asked once), and can attach files.</p>`,
        },
        {
          id: 'calendar-form',
          title: 'The Calendar Post form',
          html: `<p>Events for the District calendar go through the <a href="/calendar-request" target="_blank" rel="noopener">Calendar Post Guidelines &amp; Request Form</a>: the guidelines first, then the request. If someone is already filling in the MarComm Request Form and their event should go on the calendar, the same calendar questions open inside that form, so they only fill in one.</p>`,
        },
        {
          id: 'duplicates',
          title: 'Duplicates and the team’s own work',
          html: `<p>When the same request comes in twice, an editor combines them: the duplicate leaves the list and its notes move to the one that stays. Work the team starts itself, like a recurring video series or the District Newsletter, is added straight to the tracker without the form.</p>`,
        },
      ],
    },
    {
      id: 'help',
      label: 'Access & Help',
      intro: 'Getting in, and who to ask.',
      sections: [
        {
          id: 'access',
          title: 'Getting access',
          html: `
<ol class="guide-steps">
  <li><b>Create your account</b> at <a href="/marcomm-registration" target="_blank" rel="noopener">bcpsmarcomm.com/marcomm-registration</a> with your name-based @browardschools.com email, the one on the Marcomm Meeting invitation, not your P-number.</li>
  <li><b>Access is added for you.</b> If your email is on the Marcomm Meeting list, MarComm Assignments opens right away.</li>
  <li><b>Sign in any time</b> at bcpsmarcomm.com/login. This guide and the tracker are on your home page.</li>
</ol>
<p>Someone new joining the meeting? Send them the same link, and ask Jennifer Hodder to add them to the invitation.</p>`,
        },
        {
          id: 'ask',
          title: 'Who to ask',
          html: `
<ul>
  <li><b>About a request or the tracker:</b> Jennifer Hodder.</li>
  <li><b>Something on BCPS MarComm is not working:</b> use the blue message button in the bottom right of any page. It goes straight to the District Web Team.</li>
</ul>
<p><a class="guide-btn" href="#feedback">Send a message</a></p>`,
        },
        {
          id: 'feedback',
          title: 'Tell us what this guide is missing',
          html: `<p>Something unclear or out of date? Tell us and we will add it.</p>
<p><a class="guide-btn" href="#feedback" data-msg="Feedback on the MarComm Team Guide: ">Leave feedback on this guide</a></p>`,
        },
      ],
    },
  ],
  changes: [
    { date: '2026-10-29', text: 'The MarComm Team Guide: the weekly meeting, MarComm Assignments and requests in one place, with an Overview showing where the team is this week, your own items, and when the next Marcomm Meeting is.' },
    { date: '2026-10-21', text: 'The tracker’s editors (Jennifer Hodder, Sean Russell, Felicia Hicks and Farrah Wilson) record updates, and recorded meetings update the tracker from their transcript after an editor reviews it.' },
    { date: '2026-10-20', text: 'The MarComm Request Form opened to anyone with the link, and the Calendar Post form moved onto BCPS MarComm.' },
    { date: '2026-10-14', text: 'The first Marcomm Meeting run on MarComm Assignments.' },
    { date: '2026-10-08', text: 'MarComm Assignments replaced the MarComm Spreadsheet, starting with its 80 requests, and the MarComm Request Form replaced the Wufoo form.' },
  ],
}
