'use client'

import { useState } from 'react'
import type { PageId } from '@/lib/types'

/* ─── Colors ──────────────────────────────────────────────────── */
const BCPS_BLUE   = '#1672A7'
const BCPS_PURPLE = '#682D87'
const BCPS_GREEN  = '#16750C'
const BCPS_ORANGE = '#C55326'
const BCPS_YELLOW = '#F4C436'
const K12_NAVY    = '#0B1F3A'
const K12_BLUE    = '#2563EB'
const TEXT_PRI    = '#1A1A2E'
const TEXT_MUT    = '#6B7280'
const TEXT_SEC    = '#4A5568'
const BG_CARD     = '#FFFFFF'
const BORDER      = '#E2E8F0'
const BORDER_LT   = '#EDF2F7'

/* ─── Types ───────────────────────────────────────────────────── */
interface QueuePageProps {
  onNavigate: (page: PageId) => void
  onShowToast: (msg: string) => void
  viewAsUserId?: string   // when set, only show items assigned to this user ID
}
type Lead       = 'all' | 'sr' | 'fh' | 'vd' | 'ta' | 'na'
type ViewMode   = 'active' | 'completed' | 'detail'
type ItemType   = 'email' | 'task' | 'ticket' | 'meeting'
type ItemSource = 'outlook' | 'calendar' | 'fieldy' | 'iq' | 'manual'
type ItemSection = 'action' | 'inbox' | 'tickets' | 'wcm'
type StatusKey  = 'new' | 'inprog' | 'blocked' | 'done' | 'pending' | 'review'
type ActiveUser = 'sr' | 'fh'

interface QueueItem {
  id: string
  type: ItemType
  title: string
  meta: string
  description?: string
  lead: 'sr' | 'fh' | 'both'
  assignees: string[]
  priority: 'high' | 'med' | 'low'
  section: ItemSection
  source: ItemSource
  status: StatusKey
  date: string
  completed: boolean
  notes?: string
}

const TEAM_MEMBERS = [
  { id: 'SR', name: 'Sean A. Russell',   color: BCPS_BLUE   },
  { id: 'FH', name: 'Felicia Hicks',     color: BCPS_PURPLE },
  { id: 'VD', name: 'Vanessa Deslandes', color: BCPS_GREEN  },
  { id: 'TA', name: 'Tricia Allen',      color: BCPS_ORANGE },
  { id: 'NA', name: 'Nakesha Ali-Sirju', color: '#0891B2'   },
]

interface WeekMeeting {
  day: string
  date: string
  title: string
  time: string
  tags?: Array<{ label: string; color: string; bg: string }>
  today?: boolean
}

/* ─── Style maps ──────────────────────────────────────────────── */
const SOURCE_STYLE: Record<ItemSource, { bg: string; color: string; label: string }> = {
  outlook:  { bg: '#EBF4FA', color: BCPS_BLUE,   label: 'Outlook'     },
  calendar: { bg: '#ECFDF5', color: BCPS_GREEN,   label: 'Calendar'    },
  fieldy:   { bg: '#FEF3C7', color: '#92400E',    label: 'Fieldy'      },
  iq:       { bg: '#FFF7ED', color: BCPS_ORANGE,  label: 'Incident IQ' },
  manual:   { bg: '#F1F5F9', color: '#475569',    label: 'Manual'      },
}

const TYPE_ICON_STYLE: Record<ItemType, { bg: string; color: string }> = {
  email:   { bg: '#EBF4FA', color: BCPS_BLUE   },
  task:    { bg: '#F3E8FF', color: BCPS_PURPLE  },
  ticket:  { bg: '#FFF7ED', color: BCPS_ORANGE  },
  meeting: { bg: '#ECFDF5', color: BCPS_GREEN   },
}

const STATUS_STYLE: Record<StatusKey, { bg: string; color: string; label: string }> = {
  new:     { bg: '#DBEAFE', color: '#1E3A8A', label: 'New'         },
  inprog:  { bg: '#FEF9C3', color: '#713F12', label: 'In Progress' },
  blocked: { bg: '#FEE2E2', color: '#7F1D1D', label: 'Overdue'     },
  done:    { bg: '#DCFCE7', color: '#14532D', label: 'Routed'      },
  pending: { bg: '#F1F5F9', color: '#475569', label: 'FYI'         },
  review:  { bg: '#FFF7ED', color: '#9A3412', label: 'Review'      },
}

const PRIORITY_BORDER: Record<string, string> = {
  high: '#DC2626',
  med:  BCPS_YELLOW,
  low:  '#D1D5DB',
}

/* ─── SVG icons ───────────────────────────────────────────────── */
function EmailIcon()   { return <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg> }
function TaskIcon()    { return <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg> }
function TicketIcon()  { return <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/></svg> }
function MeetingIcon() { return <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> }
function CheckIcon()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> }
function CloseIcon()   { return <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> }
function RefreshIcon() { return <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> }
function PlayIcon()    { return <svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> }
function NoteIcon()    { return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> }
function VideoIcon()   { return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8.82a1 1 0 01.553-.89L15 2.82V21.18L3.553 16.07A1 1 0 013 15.18V8.82z"/></svg> }
function EditIcon()    { return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> }
function CalIcon()     { return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg> }
function ShieldIcon()  { return <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }

const TYPE_ICON: Record<ItemType, React.ReactNode> = {
  email:   <EmailIcon />,
  task:    <TaskIcon />,
  ticket:  <TicketIcon />,
  meeting: <MeetingIcon />,
}

/* ─── Static data ─────────────────────────────────────────────── */
const INITIAL_ITEMS: QueueItem[] = [
  // Needs Action (3)
  { id:'q1',  type:'email',   title:'Superintendent - Dash Video re-edit request',                meta:'From Kelya via Felicia Hicks · Edit out specific portion to make video evergreen',        lead:'both', assignees:['SR','FH'], priority:'high', section:'action',  source:'outlook',  status:'new',     date:'Today',   completed:false },
  { id:'q2',  type:'task',    title:'Prep analytics platform report for Friday governance meeting', meta:'Fri May 22 at 3 PM · Present current platform + Google dependencies',                    lead:'sr',   assignees:['SR'],      priority:'high', section:'action',  source:'calendar', status:'inprog',  date:'Due Fri', completed:false },
  { id:'q3',  type:'email',   title:'TAC Meeting (May 11) - follow-up action items',               meta:'From Lin Ferrara, TAC Chair · Unread reminder - review for commitments',                 lead:'sr',   assignees:['SR'],      priority:'high', section:'action',  source:'outlook',  status:'blocked', date:'May 10',  completed:false },
  // Inbox - Unread (5)
  { id:'q4',  type:'email',   title:'BCPS In The News - Monday roundup',                           meta:'From Novia Ingraham · Attached news articles for review',                                lead:'both', assignees:['SR','FH'], priority:'med',  section:'inbox',   source:'outlook',  status:'new',     date:'Today',   completed:false },
  { id:'q5',  type:'email',   title:'BCPS Shines - Atlantic Technical College post live',           meta:'From Cathleen Brennan · Posted at bit.ly/49DIAmo - confirm social share',                lead:'fh',   assignees:['FH'],      priority:'med',  section:'inbox',   source:'outlook',  status:'review',  date:'Today',   completed:false },
  { id:'q6',  type:'email',   title:'TURN IT OFF - 2026 Summer Break notice',                      meta:'District-wide · Electrical conservation for summer break',                                lead:'sr',   assignees:['SR'],      priority:'low',  section:'inbox',   source:'outlook',  status:'pending', date:'Today',   completed:false },
  { id:'q6b', type:'email',   title:'BCPS Tech Talk Newsletter - May edition final review',        meta:'From Communications team · Please review before noon',                                     lead:'sr',   assignees:['SR'],      priority:'med',  section:'inbox',   source:'outlook',  status:'new',     date:'Today',   completed:false },
  { id:'q6c', type:'email',   title:'Summer STEM Camp 2026 - registration confirmation',           meta:'From STEM Dept · 47 students registered - confirm capacity',                              lead:'fh',   assignees:['FH'],      priority:'low',  section:'inbox',   source:'outlook',  status:'review',  date:'Today',   completed:false },
  // Active Tickets (4)
  { id:'q7',  type:'ticket',  title:'IQ #97618 - Active with comments from Andrea',                meta:'Incident IQ · Multiple status changes today',                                            lead:'sr',   assignees:['SR'],      priority:'med',  section:'tickets', source:'iq',       status:'inprog',  date:'Today',   completed:false },
  { id:'q8',  type:'ticket',  title:'IQ #97992 - Updates from Nakesha Ali-Sirju',                  meta:'Incident IQ · Status change + 2 comments',                                              lead:'sr',   assignees:['SR'],      priority:'med',  section:'tickets', source:'iq',       status:'inprog',  date:'Today',   completed:false },
  { id:'q9',  type:'ticket',  title:'IQ #98000 - Updates from Nakesha Ali-Sirju',                  meta:'Incident IQ · Status change + comment',                                                  lead:'sr',   assignees:['SR'],      priority:'low',  section:'tickets', source:'iq',       status:'inprog',  date:'Today',   completed:false },
  { id:'q10', type:'ticket',  title:'IQ #98079 - Assigned to Jeune Tilus / WebApplications',      meta:'Incident IQ · Routed to Shilpa - resolved',                                             lead:'sr',   assignees:['SR'],      priority:'low',  section:'tickets', source:'iq',       status:'done',    date:'Today',   completed:true  },
  // WCM Tasks (2)
  { id:'q11', type:'meeting', title:"Hot Lab for Dept WCMs - Tue & Thu (you're organizer)",       meta:'Tue May 19 + Thu May 21, 11:30 AM · Prepare agenda + page walk-throughs',               lead:'sr',   assignees:['SR','VD'], priority:'med',  section:'wcm',     source:'calendar', status:'pending', date:'Tue',     completed:false },
  { id:'q12', type:'task',    title:'WCM Recertification Plan - review with Vanessa',              meta:'Thu May 21 at 1 PM · Prep materials for planning session',                               lead:'sr',   assignees:['SR','VD'], priority:'med',  section:'wcm',     source:'calendar', status:'pending', date:'Thu',     completed:false },
]

const THIS_WEEK_SR: WeekMeeting[] = [
  { day:'Mon', date:'18', title:'OOC WEB Huddle',               time:'2:00 PM - Teams',   tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'}], today:true },
  { day:'Tue', date:'19', title:'Enterprise App Services Team', time:'10:00 AM - Teams' },
  { day:'Tue', date:'19', title:'Hot Lab for Dept WCMs',        time:'11:30 AM - Teams',  tags:[{label:'Organizer',color:BCPS_PURPLE,bg:'#F3E8FF'}] },
  { day:'Tue', date:'19', title:'District Web Team Huddle',     time:'1:00 PM - Teams',   tags:[{label:'Tentative',color:'#713F12',bg:'#FEF9C3'}] },
  { day:'Wed', date:'20', title:'OOC Web Meeting',              time:'10:00 AM - Teams',  tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'},{label:'Organizer',color:BCPS_PURPLE,bg:'#F3E8FF'}] },
  { day:'Wed', date:'20', title:'Marcomm Meeting',              time:'1:00 PM - Teams' },
  { day:'Thu', date:'21', title:'Hot Lab for Dept WCMs',        time:'11:30 AM - Teams',  tags:[{label:'Organizer',color:BCPS_PURPLE,bg:'#F3E8FF'}] },
  { day:'Thu', date:'21', title:'WCM Recertification Plan',     time:'1:00 PM - Teams' },
  { day:'Fri', date:'22', title:'OOC WEB Meeting',              time:'10:00 AM - Teams',  tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'},{label:'Tentative',color:'#713F12',bg:'#FEF9C3'}] },
  { day:'Fri', date:'22', title:'Web Analytics Governance',     time:'3:00 PM - Teams',   tags:[{label:"You're presenting",color:'#991B1B',bg:'#FEE2E2'}] },
]

const THIS_WEEK_FH: WeekMeeting[] = [
  { day:'Mon', date:'18', title:'Media Meeting on Monday',       time:'10:30 AM - Teams', today:true },
  { day:'Mon', date:'18', title:'OOC WEB Huddle',               time:'2:00 PM - Teams',  tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'}], today:true },
  { day:'Tue', date:'19', title:'Enterprise App Services Team', time:'10:00 AM - Teams' },
  { day:'Tue', date:'19', title:'District Web Team Huddle',     time:'1:00 PM - Teams' },
  { day:'Wed', date:'20', title:'OOC Web Meeting',              time:'10:00 AM - Teams', tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'}] },
  { day:'Wed', date:'20', title:'Marcomm Meeting',              time:'1:00 PM - Teams' },
  { day:'Thu', date:'21', title:'WCM Recertification Plan',     time:'1:00 PM - Teams' },
  { day:'Fri', date:'22', title:'OOC WEB Meeting',              time:'10:00 AM - Teams', tags:[{label:'Huddle',color:BCPS_BLUE,bg:'#EBF4FA'}] },
  { day:'Fri', date:'22', title:'District Web Team Huddle',     time:'11:30 AM - Teams' },
]

const FIELDY_RECORDINGS = [
  { title:'OOC WEB Huddle - May 14',  meta:'Wed May 14 - Felicia, Sean, Vanessa', duration:'58m' },
  { title:'Marcomm Meeting - May 13', meta:'Tue May 13 - Org-wide',               duration:'47m' },
]

const MINUTES_ENTRIES = [
  { id:'m1', title:'OOC WEB Huddle - May 18',          meta:'Today - Felicia, Sean, Vanessa',  badge:'Today' },
  { id:'m2', title:'Marcomm Meeting - May 14',          meta:'Wed May 14 - Org-wide team',      badge:'New'   },
  { id:'m3', title:'Media Meeting on Monday - May 11',  meta:'Mon May 11 - Jennifer Hodder',    badge:''      },
  { id:'m4', title:'District Web Team Huddle - May 8',  meta:'Fri May 8 - Vanessa Deslandes',   badge:''      },
  { id:'m5', title:'Enterprise App Services - May 5',   meta:'Tue May 5 - Tricia Allen',        badge:''      },
]

/* ─── Main component ──────────────────────────────────────────── */
export default function QueuePage({ onShowToast, viewAsUserId }: QueuePageProps) {
  const [items, setItems]               = useState<QueueItem[]>(INITIAL_ITEMS)
  const [lead, setLead]                 = useState<Lead>('all')
  const [viewMode, setViewMode]         = useState<ViewMode>('active')
  const [activeUser, setActiveUser]     = useState<ActiveUser>('sr')
  const [impersonating, setImpersonating] = useState(false)
  const [huddleNote, setHuddleNote]     = useState('')
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null)
  const [prevViewMode, setPrevViewMode] = useState<'active' | 'completed'>('active')

  /* computed */
  const activeItems    = items.filter(i => !i.completed)
  const completedItems = items.filter(i => i.completed)
  const srTasks = activeItems.filter(i => i.lead === 'sr' || i.lead === 'both').length
  const fhTasks = activeItems.filter(i => i.lead === 'fh' || i.lead === 'both').length

  function matchesLead(item: QueueItem) {
    if (lead === 'all') return true
    return item.lead === lead || item.lead === 'both'
  }
  function matchesImp(item: QueueItem) {
    // Diagnostic view-as mode: filter to user's assigned tasks
    if (viewAsUserId) return item.assignees.includes(viewAsUserId)
    if (!impersonating || activeUser !== 'fh') return true
    return item.lead === 'fh' || item.lead === 'both'
  }
  function getSection(section: ItemSection): QueueItem[] {
    if (viewMode === 'completed') return []
    return activeItems.filter(i => i.section === section && matchesLead(i) && matchesImp(i))
  }
  const completedVisible = viewMode === 'completed'
    ? completedItems.filter(i => matchesLead(i) && matchesImp(i))
    : []
  const totalActive = activeItems.filter(i => matchesLead(i) && matchesImp(i)).length

  function closeItem(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: true } : i))
    onShowToast('Job closed')
  }
  function reactivateItem(id: string) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: false } : i))
    onShowToast('Job reactivated')
  }
  function switchUser(uid: ActiveUser) {
    setActiveUser(uid)
    setImpersonating(uid === 'fh')
    setLead(uid === 'fh' ? 'fh' : 'all')
    onShowToast(uid === 'sr' ? 'Returned to Sean Russell' : 'Viewing as Felicia Hicks')
  }
  function openDetail(item: QueueItem) {
    setPrevViewMode(viewMode === 'completed' ? 'completed' : 'active')
    setSelectedItem(item)
    setViewMode('detail')
  }
  function closeDetail() {
    setSelectedItem(null)
    setViewMode(prevViewMode)
  }
  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    if (selectedItem?.id === id) setSelectedItem(prev => prev ? { ...prev, ...patch } : null)
  }

  const meetings   = activeUser === 'fh' ? THIS_WEEK_FH : THIS_WEEK_SR
  const showMinutes = impersonating && activeUser === 'fh'

  // ---- DETAIL VIEW ----
  if (viewMode === 'detail' && selectedItem) {
    return (
      <QueueItemDetail
        item={selectedItem}
        onBack={closeDetail}
        onClose={(id) => { closeItem(id); closeDetail() }}
        onReactivate={(id) => { reactivateItem(id); closeDetail() }}
        onUpdateItem={updateItem}
        onShowToast={onShowToast}
      />
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      <style>{`
        @keyframes k12pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {/* Impersonation banner */}
      {impersonating && (
        <div style={{
          background:'#7C3AED', color:'#fff',
          padding:'9px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
          fontSize:12, fontWeight:600,
          borderRadius:8, marginBottom:16,
          border:'2px solid #6D28D9',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ background:'rgba(255,255,255,0.2)', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:800 }}>SUPERADMIN</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:'rgba(255,255,255,0.3)', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>FH</div>
              <span>You are viewing as <strong>Felicia Hicks</strong> - felicia.hicks@browardschools.com</span>
            </div>
          </div>
          <button onClick={() => switchUser('sr')} style={{
            background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)',
            color:'#fff', borderRadius:6, padding:'5px 14px', fontSize:11, fontWeight:700,
            cursor:'pointer', fontFamily:'inherit',
          }}>
            Exit - Back to Sean&apos;s Admin
          </button>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        <StatCard label="Unread Inbox"          value={9}           sub="3 need action today" subColor="#DC2626" />
        <StatCard label="Sean's Open Tasks"     value={srTasks}     sub="1 high priority"     subColor={BCPS_BLUE} />
        <StatCard label="Felicia's Open Tasks"  value={fhTasks}     sub="All on track"        subColor={BCPS_GREEN} />
        <StatCard label="Next Huddle"           value="Today 2PM"   sub="OOC WEB Huddle"      subColor={BCPS_BLUE} small />
      </div>

      {/* Filter + tabs row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Lead dropdown */}
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, fontWeight:700, color:TEXT_MUT, whiteSpace:'nowrap' }}>Lead:</span>
            <select
              value={lead}
              onChange={e => setLead(e.target.value as Lead)}
              style={{
                fontSize:12, fontWeight:600, color:TEXT_PRI,
                background:BG_CARD, border:`1px solid ${BORDER}`,
                borderRadius:7, padding:'5px 10px', cursor:'pointer',
                fontFamily:'inherit', outline:'none',
              }}
            >
              <option value="all">All Members</option>
              {TEAM_MEMBERS.map(m => (
                <option key={m.id} value={m.id.toLowerCase()}>{m.name}</option>
              ))}
            </select>
          </div>
          <div style={{ width:1, height:16, background:BORDER, margin:'0 2px' }} />
          {/* Type tabs */}
          <div style={{ display:'flex', gap:4, background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:10, padding:4 }}>
            {[
              { key:'active',    label:'Active',    cnt:totalActive,              isActive: viewMode==='active',    green:false },
              { key:'email',     label:'Email',     cnt:9,                        isActive: false,                  green:false },
              { key:'tasks',     label:'Tasks',     cnt:5,                        isActive: false,                  green:false },
              { key:'tickets',   label:'Tickets',   cnt:4,                        isActive: false,                  green:false },
              { key:'completed', label:'Completed', cnt:completedItems.length,    isActive: viewMode==='completed', green:true  },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setViewMode(tab.key === 'completed' ? 'completed' : 'active')}
                style={{
                  padding:'7px 14px', borderRadius:7, fontSize:12, fontWeight:600,
                  cursor:'pointer', border:'none', fontFamily:'inherit',
                  background: tab.isActive ? K12_NAVY : 'transparent',
                  color: tab.isActive ? '#fff' : tab.green ? BCPS_GREEN : TEXT_MUT,
                  display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap',
                }}
              >
                {tab.label}
                <span style={{
                  fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:999,
                  background: tab.isActive ? 'rgba(255,255,255,0.2)' : tab.green ? '#DCFCE7' : BORDER,
                  color: tab.isActive ? '#fff' : tab.green ? '#14532D' : TEXT_MUT,
                }}>{tab.cnt}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Huddle indicator */}
        <div style={{
          display:'flex', alignItems:'center', gap:7,
          background:'#ECFDF5', border:'1px solid #6EE7B7',
          borderRadius:999, padding:'5px 12px',
          fontSize:11, fontWeight:700, color:'#065F46',
        }}>
          <div style={{ width:7, height:7, borderRadius:'50%', background:'#10B981', animation:'k12pulse 2s infinite' }} />
          Huddle Today at 2 PM
        </div>
      </div>

      {/* Queue layout */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start' }}>

        {/* Left: queue list */}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {viewMode === 'active' ? (
            <>
              <QueueSection label="Needs Action"   items={getSection('action')}  onClose={closeItem} onReactivate={reactivateItem} onOpen={openDetail} />
              <QueueSection label="Inbox - Unread" items={getSection('inbox')}   onClose={closeItem} onReactivate={reactivateItem} onOpen={openDetail} />
              <QueueSection label="Active Tickets" items={getSection('tickets')} onClose={closeItem} onReactivate={reactivateItem} onOpen={openDetail} />
              <QueueSection label="WCM Tasks"      items={getSection('wcm')}     onClose={closeItem} onReactivate={reactivateItem} onOpen={openDetail} />
              {totalActive === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:10, color:TEXT_MUT, fontSize:14 }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>&#10003;</div>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT_PRI, marginBottom:6 }}>All clear</div>
                  <div>No items match this filter.</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 4px' }}>
                <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1.2px', color:BCPS_GREEN }}>Completed Jobs</span>
                <div style={{ flex:1, height:1, background:BORDER }} />
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#DCFCE7', color:'#14532D' }}>{completedVisible.length}</span>
              </div>
              {completedVisible.map(item => (
                <QueueItemCard key={item.id} item={item} onClose={closeItem} onReactivate={reactivateItem} onOpen={openDetail} />
              ))}
              {completedVisible.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:10, color:TEXT_MUT, fontSize:14 }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>&#9711;</div>
                  <div style={{ fontSize:15, fontWeight:700, color:TEXT_PRI, marginBottom:6 }}>No completed jobs yet</div>
                  <div>Close a job to move it here.</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: side panels */}
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* This Week */}
          <SidePanel title="This Week" action="Full calendar" icon={<CalIcon />} iconBg="#EBF4FA" iconColor={BCPS_BLUE}>
            <ul style={{ listStyle:'none', padding:0, margin:0 }}>
              {meetings.map((m, i) => (
                <li key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'11px 16px', borderBottom: i < meetings.length - 1 ? `1px solid ${BORDER_LT}` : 'none' }}>
                  <div style={{ minWidth:38, textAlign:'center', flexShrink:0 }}>
                    <div style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', color: m.today ? BCPS_BLUE : TEXT_MUT }}>{m.day}</div>
                    <div style={{ fontSize:18, fontWeight:800, color: m.today ? BCPS_BLUE : TEXT_PRI, lineHeight:1.1 }}>{m.date}</div>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:TEXT_PRI, marginBottom:2 }}>{m.title}</div>
                    <div style={{ fontSize:11, color:TEXT_MUT }}>{m.time}</div>
                    {m.tags && (
                      <div style={{ display:'flex', gap:4, marginTop:4, flexWrap:'wrap' }}>
                        {m.tags.map((t, j) => (
                          <span key={j} style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:999, background:t.bg, color:t.color }}>{t.label}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </SidePanel>

          {/* Minutes (FH view only) */}
          {showMinutes && (
            <SidePanel title="My Minutes" action="View all" icon={<NoteIcon />} iconBg="#F3E8FF" iconColor={BCPS_PURPLE}>
              {MINUTES_ENTRIES.map((m, i) => (
                <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderBottom: i < MINUTES_ENTRIES.length - 1 ? `1px solid ${BORDER_LT}` : 'none', cursor:'pointer' }}>
                  <div style={{ width:30, height:30, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', background:'#F3E8FF', color:BCPS_PURPLE, flexShrink:0 }}>
                    <NoteIcon />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:TEXT_PRI, marginBottom:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.title}</div>
                    <div style={{ fontSize:10, color:TEXT_MUT }}>{m.meta}</div>
                  </div>
                  {m.badge && (
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:999, background:'#DBEAFE', color:'#1E3A8A', whiteSpace:'nowrap', flexShrink:0 }}>{m.badge}</span>
                  )}
                </div>
              ))}
            </SidePanel>
          )}

          {/* Fieldy Recordings */}
          <SidePanel title="Fieldy Recordings" action="Connect" icon={<VideoIcon />} iconBg="#FEF3C7" iconColor="#92400E">
            {FIELDY_RECORDINGS.map((r, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', borderBottom: i < FIELDY_RECORDINGS.length - 1 ? `1px solid ${BORDER_LT}` : 'none' }}>
                <button style={{ width:30, height:30, borderRadius:'50%', background:BCPS_BLUE, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', border:'none', flexShrink:0 }}>
                  <PlayIcon />
                </button>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:TEXT_PRI, marginBottom:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.title}</div>
                  <div style={{ fontSize:11, color:TEXT_MUT }}>{r.meta}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, color:TEXT_MUT, background:'#F1F5F9', padding:'2px 7px', borderRadius:999, flexShrink:0 }}>{r.duration}</span>
              </div>
            ))}
            <div style={{ padding:'10px 16px', textAlign:'center', borderTop:`1px solid ${BORDER_LT}` }}>
              <button style={{ fontSize:11, fontWeight:700, color:TEXT_MUT, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>
                Connect Fieldy to load all recordings
              </button>
            </div>
          </SidePanel>

          {/* Huddle Notes */}
          <SidePanel title="Huddle Notes" icon={<EditIcon />} iconBg="#ECFDF5" iconColor={BCPS_GREEN}>
            <div style={{ padding:'12px 16px' }}>
              <div style={{ fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', color:TEXT_MUT, marginBottom:6 }}>
                Add update for today&apos;s huddle
              </div>
              <textarea
                value={huddleNote}
                onChange={e => setHuddleNote(e.target.value)}
                placeholder="What's the status? Use @SR or @FH to assign..."
                rows={3}
                style={{ width:'100%', border:`1.5px solid ${BORDER}`, borderRadius:8, padding:'8px 10px', fontSize:12, fontFamily:'inherit', color:TEXT_PRI, resize:'vertical', outline:'none', background:'#FAFBFC', boxSizing:'border-box' }}
              />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
                <span style={{ fontSize:10, color:TEXT_MUT }}>
                  <strong style={{ color:BCPS_BLUE }}>@SR</strong> Sean &nbsp;
                  <strong style={{ color:BCPS_BLUE }}>@FH</strong> Felicia
                </span>
                <button
                  onClick={() => { if (huddleNote.trim()) { onShowToast('Note posted'); setHuddleNote('') } }}
                  style={{ height:28, padding:'0 12px', background:BCPS_BLUE, color:'#fff', border:'none', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
                >Post Update</button>
              </div>
            </div>
          </SidePanel>

          {/* Team Accounts (SuperAdmin, not impersonating) */}
          {!impersonating && (
            <SidePanel title="Team Accounts" titleColor="#7C3AED" icon={<ShieldIcon />} iconBg="rgba(124,58,237,0.1)" iconColor="#7C3AED">
              <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:4 }}>
                {([
                  { uid:'sr' as ActiveUser, name:'Sean A. Russell', role:'Web Strategy Lead',         color:BCPS_BLUE,   ini:'SR' },
                  { uid:'fh' as ActiveUser, name:'Felicia Hicks',   role:'Webmaster 1, Marketing',    color:BCPS_PURPLE, ini:'FH' },
                ]).map(u => (
                  <div key={u.uid} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:u.color, color:'#fff', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{u.ini}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:TEXT_PRI }}>{u.name}</div>
                      <div style={{ fontSize:10, color:TEXT_MUT }}>{u.role}</div>
                    </div>
                    <button
                      onClick={() => u.uid !== 'sr' && switchUser(u.uid)}
                      style={{
                        fontSize:9, fontWeight:700, padding:'3px 8px', borderRadius:999,
                        border:`1px solid ${BORDER}`,
                        background: u.uid === activeUser ? 'rgba(255,255,255,0.12)' : 'none',
                        color: u.uid === activeUser ? TEXT_MUT : TEXT_SEC,
                        cursor: u.uid === activeUser ? 'default' : 'pointer',
                        fontFamily:'inherit', whiteSpace:'nowrap',
                      }}
                    >{u.uid === activeUser ? 'You' : 'View as'}</button>
                  </div>
                ))}
              </div>
            </SidePanel>
          )}

        </div>
      </div>
    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────────── */

function StatCard({ label, value, sub, subColor, small }: {
  label: string; value: number | string; sub: string; subColor: string; small?: boolean
}) {
  return (
    <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'18px 20px' }}>
      <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.7px', color:TEXT_MUT, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize: small ? 20 : 28, fontWeight:800, color:TEXT_PRI, lineHeight:1, marginTop: small ? 2 : 0 }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:500, marginTop:4, color:subColor }}>{sub}</div>
    </div>
  )
}

function LeadPill({ pid, label, active, onClick, av }: {
  pid: string; label: string; active: boolean; onClick: () => void
  av?: { ini: string; bg: string }
}) {
  const AC: Record<string, { bg: string; bdr: string }> = {
    all: { bg:K12_NAVY,    bdr:K12_NAVY    },
    sr:  { bg:BCPS_BLUE,   bdr:BCPS_BLUE   },
    fh:  { bg:BCPS_PURPLE, bdr:BCPS_PURPLE },
  }
  const ac = AC[pid]
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:6, padding:'6px 12px',
      borderRadius:999, fontSize:12, fontWeight:700, cursor:'pointer',
      border:`1.5px solid ${active ? ac.bdr : BORDER}`,
      background: active ? ac.bg : BG_CARD,
      color: active ? '#fff' : TEXT_SEC,
      fontFamily:'inherit',
    }}>
      {av && <span style={{ width:18, height:18, borderRadius:'50%', background:'rgba(255,255,255,0.3)', fontSize:8, fontWeight:800, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{av.ini}</span>}
      {label}
    </button>
  )
}

function SidePanel({ title, titleColor, action, icon, iconBg, iconColor, children }: {
  title: string; titleColor?: string; action?: string
  icon?: React.ReactNode; iconBg?: string; iconColor?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'13px 16px', borderBottom:`1px solid ${BORDER_LT}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {icon && (
            <div style={{ width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', background: iconBg ?? '#EBF4FA', color: iconColor ?? BCPS_BLUE }}>
              {icon}
            </div>
          )}
          <span style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color: titleColor ?? TEXT_PRI }}>{title}</span>
        </div>
        {action && (
          <button style={{ fontSize:11, fontWeight:600, color:BCPS_BLUE, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>{action}</button>
        )}
      </div>
      {children}
    </div>
  )
}

function QueueSection({ label, items, onClose, onReactivate, onOpen }: {
  label: string; items: QueueItem[]
  onClose: (id: string) => void; onReactivate: (id: string) => void
  onOpen: (item: QueueItem) => void
}) {
  if (items.length === 0) return null
  return (
    <>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0 4px' }}>
        <span style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1.2px', color:TEXT_MUT }}>{label}</span>
        <div style={{ flex:1, height:1, background:BORDER }} />
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:BORDER_LT, color:TEXT_MUT }}>{items.length}</span>
      </div>
      {items.map(item => (
        <QueueItemCard key={item.id} item={item} onClose={onClose} onReactivate={onReactivate} onOpen={onOpen} />
      ))}
    </>
  )
}

function QueueItemCard({ item, onClose, onReactivate, onOpen }: {
  item: QueueItem; onClose: (id: string) => void; onReactivate: (id: string) => void
  onOpen: (item: QueueItem) => void
}) {
  const [hovered, setHovered] = useState(false)
  const ts = TYPE_ICON_STYLE[item.type]
  const ss = SOURCE_STYLE[item.source]
  const st = STATUS_STYLE[item.status]
  const borderColor = item.completed ? '#D1D5DB' : PRIORITY_BORDER[item.priority]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onOpen(item)}
      style={{
        background: item.completed ? '#FAFBFC' : BG_CARD,
        border:`1px solid ${BORDER}`,
        borderLeft:`3px solid ${borderColor}`,
        borderRadius:10,
        padding:'14px 16px',
        display:'flex', alignItems:'center', gap:12,
        cursor:'pointer',
        boxShadow: hovered ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
        opacity: item.completed ? 0.85 : 1,
      }}
    >
      {/* Check circle */}
      <button
        onClick={e => { e.stopPropagation(); item.completed ? onReactivate(item.id) : onClose(item.id) }}
        style={{
          width:22, height:22, borderRadius:'50%',
          border:`2px solid ${item.completed ? BCPS_GREEN : BORDER}`,
          background: item.completed ? BCPS_GREEN : BG_CARD,
          display:'flex', alignItems:'center', justifyContent:'center',
          cursor:'pointer', flexShrink:0, padding:0,
        }}
      >
        {item.completed && <CheckIcon />}
      </button>

      {/* Type icon */}
      <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:ts.bg, color:ts.color, opacity: item.completed ? 0.45 : 1 }}>
        {TYPE_ICON[item.type]}
      </div>

      {/* Body */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13.5, fontWeight:600, color: item.completed ? TEXT_MUT : TEXT_PRI, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:3, textDecoration: item.completed ? 'line-through' : 'none' }}>
          {item.title}
        </div>
        <div style={{ fontSize:11, color: item.completed ? '#B0B7C3' : TEXT_MUT }}>{item.meta}</div>
      </div>

      {/* Right chips */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
        {/* Source badge */}
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:ss.bg, color:ss.color, opacity: item.completed ? 0.45 : 1, whiteSpace:'nowrap' }}>{ss.label}</span>

        {/* Assignee chips */}
        <div style={{ display:'flex' }} onClick={e => e.stopPropagation()}>
          {item.assignees.map((aid, idx) => {
            const m = TEAM_MEMBERS.find(t => t.id === aid)
            return m ? (
              <div key={aid} style={{ width:26, height:26, borderRadius:'50%', background:m.color, color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', border:'2px solid #fff', flexShrink:0, marginLeft: idx > 0 ? -8 : 0, opacity: item.completed ? 0.45 : 1 }} title={m.name}>{m.id}</div>
            ) : null
          })}
        </div>

        {/* Status badge (active only) */}
        {!item.completed && (
          <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:999, background:st.bg, color:st.color, whiteSpace:'nowrap' }}>{st.label}</span>
        )}

        {/* Close on hover (active) */}
        {!item.completed && hovered && (
          <button onClick={e => { e.stopPropagation(); onClose(item.id) }} style={{ zIndex:1,
            height:26, padding:'0 10px', borderRadius:6, border:`1.5px solid ${BORDER}`,
            background:BG_CARD, color:TEXT_SEC, fontSize:10, fontWeight:700,
            cursor:'pointer', display:'flex', alignItems:'center', gap:4,
            whiteSpace:'nowrap', flexShrink:0, fontFamily:'inherit',
          }}>
            <CloseIcon /> Close
          </button>
        )}

        {/* Reactivate (completed) */}
        {item.completed && (
          <button onClick={e => { e.stopPropagation(); onReactivate(item.id) }} style={{
            height:26, padding:'0 10px', borderRadius:6, border:`1.5px solid ${BORDER}`,
            background:BG_CARD, color:TEXT_SEC, fontSize:10, fontWeight:700,
            cursor:'pointer', display:'flex', alignItems:'center', gap:4,
            whiteSpace:'nowrap', flexShrink:0, fontFamily:'inherit',
          }}>
            <RefreshIcon /> Reactivate
          </button>
        )}
      </div>

      {/* Date */}
      <span style={{ fontSize:11, color: item.completed ? '#B0B7C3' : TEXT_MUT, whiteSpace:'nowrap', flexShrink:0 }}>{item.date}</span>
    </div>
  )
}

/* ─── Queue Item Detail (Trello-style) ────────────────────────── */
function QueueItemDetail({ item, onBack, onClose, onReactivate, onUpdateItem, onShowToast }: {
  item: QueueItem
  onBack: () => void
  onClose: (id: string) => void
  onReactivate: (id: string) => void
  onUpdateItem: (id: string, patch: Partial<QueueItem>) => void
  onShowToast: (msg: string) => void
}) {
  const [notes, setNotes] = useState(item.notes || '')
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const ts = TYPE_ICON_STYLE[item.type]
  const ss = SOURCE_STYLE[item.source]
  const st = STATUS_STYLE[item.status]
  const borderColor = item.completed ? '#D1D5DB' : PRIORITY_BORDER[item.priority]

  function toggleAssignee(mid: string) {
    const current = item.assignees
    const next = current.includes(mid) ? current.filter(a => a !== mid) : [...current, mid]
    onUpdateItem(item.id, { assignees: next })
    onShowToast(current.includes(mid) ? 'Assignee removed' : 'Assignee added')
  }

  function changeStatus(s: StatusKey) {
    onUpdateItem(item.id, { status: s })
    onShowToast('Status updated')
  }

  function saveNotes() {
    onUpdateItem(item.id, { notes })
    onShowToast('Notes saved')
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, fontSize:13, color:TEXT_MUT }}>
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:700, color:BCPS_BLUE, padding:0 }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
          Queue
        </button>
        <span style={{ color:BORDER }}>/</span>
        <span style={{ color:TEXT_PRI, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:400 }}>{item.title}</span>
      </div>

      {/* Main layout */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:24, alignItems:'start' }}>

        {/* Left: content */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Header card */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderLeft:`4px solid ${borderColor}`, borderRadius:12, padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
              <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:ts.bg, color:ts.color }}>
                {TYPE_ICON[item.type]}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <h2 style={{ fontSize:18, fontWeight:800, color:TEXT_PRI, margin:0, marginBottom:6, lineHeight:1.3 }}>{item.title}</h2>
                <p style={{ fontSize:13, color:TEXT_MUT, margin:0 }}>{item.meta}</p>
              </div>
            </div>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:ss.bg, color:ss.color }}>{ss.label}</span>
              <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:st.bg, color:st.color }}>{st.label}</span>
              {item.priority === 'high' && <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:999, background:'#FEE2E2', color:'#991B1B' }}>High Priority</span>}
              <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:999, background:'#F1F5F9', color:TEXT_SEC }}>{item.date}</span>
            </div>
          </div>

          {/* Notes */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color:TEXT_MUT, marginBottom:10 }}>Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add context, links, or updates about this item..."
              rows={5}
              style={{ width:'100%', border:`1.5px solid ${BORDER}`, borderRadius:8, padding:'10px 12px', fontSize:13, fontFamily:'inherit', color:TEXT_PRI, resize:'vertical', outline:'none', background:'#FAFBFC', boxSizing:'border-box', lineHeight:1.6 }}
            />
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
              <button onClick={saveNotes} style={{ padding:'7px 16px', background:BCPS_BLUE, color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Save Notes</button>
            </div>
          </div>
        </div>

        {/* Right: metadata panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

          {/* Actions */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px', display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color:TEXT_MUT, marginBottom:4 }}>Actions</div>
            {item.completed ? (
              <button onClick={() => onReactivate(item.id)} style={{ width:'100%', padding:'9px', background:'#F1F5F9', border:`1px solid ${BORDER}`, borderRadius:8, fontSize:12, fontWeight:700, color:TEXT_SEC, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <RefreshIcon /> Reactivate Job
              </button>
            ) : (
              <button onClick={() => onClose(item.id)} style={{ width:'100%', padding:'9px', background:BCPS_GREEN, border:'none', borderRadius:8, fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <CheckIcon /> Close Job
              </button>
            )}
          </div>

          {/* Assignees */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px', position:'relative' }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color:TEXT_MUT, marginBottom:10 }}>Assignees</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {item.assignees.length === 0 && (
                <div style={{ fontSize:12, color:TEXT_MUT, fontStyle:'italic' }}>No assignees yet</div>
              )}
              {item.assignees.map(aid => {
                const m = TEAM_MEMBERS.find(t => t.id === aid)
                if (!m) return null
                return (
                  <div key={aid} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background:m.color, color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{m.id}</div>
                    <span style={{ flex:1, fontSize:12, fontWeight:600, color:TEXT_PRI }}>{m.name}</span>
                    <button onClick={() => toggleAssignee(m.id)} style={{ background:'none', border:'none', cursor:'pointer', color:TEXT_MUT, fontSize:16, lineHeight:1, padding:'0 4px', fontFamily:'inherit' }} title="Remove">x</button>
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => setShowAssignMenu(v => !v)}
              style={{ marginTop:10, width:'100%', padding:'7px', background:'#F8FAFC', border:`1.5px dashed ${BORDER}`, borderRadius:8, fontSize:12, fontWeight:700, color:TEXT_MUT, cursor:'pointer', fontFamily:'inherit' }}
            >+ Add Assignee</button>
            {showAssignMenu && (
              <div style={{ position:'absolute', left:16, right:16, top:'calc(100% - 4px)', background:'#fff', border:`1px solid ${BORDER}`, borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:20, overflow:'hidden' }}>
                {TEAM_MEMBERS.map(m => {
                  const assigned = item.assignees.includes(m.id)
                  return (
                    <button key={m.id} onClick={() => { toggleAssignee(m.id); setShowAssignMenu(false) }} style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background: assigned ? '#F0F9FF' : '#fff', border:'none', borderBottom:`1px solid ${BORDER_LT}`, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                      <div style={{ width:26, height:26, borderRadius:'50%', background:m.color, color:'#fff', fontSize:9, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{m.id}</div>
                      <span style={{ flex:1, fontSize:12, fontWeight:600, color:TEXT_PRI }}>{m.name}</span>
                      {assigned && <span style={{ fontSize:10, fontWeight:700, color:BCPS_BLUE }}>Assigned</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Status */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px' }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color:TEXT_MUT, marginBottom:10 }}>Status</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {(Object.entries(STATUS_STYLE) as [StatusKey, typeof STATUS_STYLE[StatusKey]][]).map(([key, s]) => (
                <button key={key} onClick={() => changeStatus(key)} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, border:`1.5px solid ${item.status === key ? BCPS_BLUE : 'transparent'}`, background: item.status === key ? '#EBF4FA' : 'transparent', cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:999, background:s.bg, color:s.color, flexShrink:0 }}>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div style={{ background:BG_CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px' }}>
            <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', color:TEXT_MUT, marginBottom:10 }}>Priority</div>
            <div style={{ display:'flex', gap:6 }}>
              {(['high','med','low'] as const).map(p => (
                <button key={p} onClick={() => { onUpdateItem(item.id, { priority: p }); onShowToast('Priority updated') }} style={{ flex:1, padding:'7px 4px', borderRadius:8, border:`1.5px solid ${item.priority === p ? PRIORITY_BORDER[p] : BORDER}`, background: item.priority === p ? (p === 'high' ? '#FEE2E2' : p === 'med' ? '#FFFBEB' : '#F1F5F9') : 'transparent', cursor:'pointer', fontFamily:'inherit', fontSize:11, fontWeight:700, color: item.priority === p ? (p === 'high' ? '#991B1B' : p === 'med' ? '#713F12' : TEXT_MUT) : TEXT_MUT }}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
