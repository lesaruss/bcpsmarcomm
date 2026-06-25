import type { Member, BetaMember, Department, DomainRule } from './types'

export const MEMBERS: Member[] = [
  { id: 1, name: 'Felicia Hicks', initials: 'FH', color: '#1672A7', role: 'Communications Lead', email: 'fhicks@browardschools.com' },
  { id: 2, name: 'Vanessa Deslandes', initials: 'VD', color: '#7B5EA7', role: 'Digital Media Manager', email: 'vdeslandes@browardschools.com' },
  { id: 3, name: 'Tricia Allen', initials: 'TA', color: '#2E8B57', role: 'Content Strategist', email: 'tallen@browardschools.com' },
  { id: 4, name: 'Nakesha Ali-Sirju', initials: 'NA', color: '#D4600A', role: 'Communications Specialist', email: 'nalisirju@browardschools.com' },
  { id: 5, name: 'Victoria', initials: 'V', color: '#C0392B', role: 'SuperAdmin', email: 'vegan@lesaruss.com' },
]

export const BETA_MEMBERS: BetaMember[] = [
  { id: 1, name: 'Felicia Hicks', email: 'fhicks@browardschools.com', role: 'Communications Lead', status: 'sent', beta: true },
  { id: 2, name: 'Vanessa Deslandes', email: 'vdeslandes@browardschools.com', role: 'Digital Media Manager', status: 'sent', beta: true },
  { id: 3, name: 'Tricia Allen', email: 'tallen@browardschools.com', role: 'Content Strategist', status: 'pending', beta: true },
  { id: 4, name: 'Nakesha Ali-Sirju', email: 'nalisirju@browardschools.com', role: 'Communications Specialist', status: 'accepted', beta: true },
]

export const DOMAIN_RULES: DomainRule[] = [
  { domain: 'browardschools.com', enabled: true },
  { domain: 'lesaruss.com', enabled: true },
  { domain: 'lesaruss.ai', enabled: true },
]

export const DEPARTMENTS: Department[] = [
  {
    id: 'communications',
    name: 'Office of Communications & Legislative Affairs',
    description: 'Manages all internal and external communications for Broward County Public Schools, including media relations, legislative advocacy, and community engagement.',
    director: 'Kathy Koch',
    directorTitle: 'Chief Communications Officer',
    phone: '(754) 321-2300',
    email: 'communications@browardschools.com',
    subdepts: [
      {
        name: 'Media Relations',
        staff: [
          { name: 'John White', title: 'Media Relations Specialist' },
          { name: 'Sandra Bloom', title: 'Public Information Officer' },
        ],
      },
      {
        name: 'Digital Communications',
        staff: [
          { name: 'Marcus Webb', title: 'Digital Content Manager' },
          { name: 'Priya Nair', title: 'Social Media Coordinator' },
          { name: 'Derek Santos', title: 'Web Content Specialist' },
        ],
      },
      {
        name: 'Legislative Affairs',
        staff: [
          { name: 'Angela Ford', title: 'Legislative Affairs Director' },
          { name: 'Carlos Rios', title: 'Government Relations Analyst' },
        ],
      },
    ],
  },
  {
    id: 'curriculum',
    name: 'Office of Academics & Transformation',
    description: 'Leads curriculum development, instructional strategy, and academic transformation initiatives across all grade levels.',
    director: 'Dr. Monica Marshall',
    directorTitle: 'Chief Academic Officer',
    phone: '(754) 321-2100',
    email: 'academics@browardschools.com',
    subdepts: [
      {
        name: 'Curriculum & Instruction',
        staff: [
          { name: 'Pamela Cruz', title: 'Curriculum Director' },
          { name: 'James Okafor', title: 'Instructional Coach Lead' },
        ],
      },
    ],
  },
  {
    id: 'hr',
    name: 'Human Resource Services',
    description: 'Manages recruitment, employee relations, benefits, and workforce development for over 25,000 employees.',
    director: 'Robert Ingram',
    directorTitle: 'Chief Human Resources Officer',
    phone: '(754) 321-2080',
    email: 'hr@browardschools.com',
    subdepts: [
      {
        name: 'Recruitment & Staffing',
        staff: [
          { name: 'Lisa Torres', title: 'Recruitment Manager' },
          { name: 'Victor Chang', title: 'HR Specialist' },
        ],
      },
    ],
  },
  {
    id: 'technology',
    name: 'Information & Technology',
    description: 'Oversees technology infrastructure, cybersecurity, data systems, and digital learning tools district-wide.',
    director: 'Samuel Avery',
    directorTitle: 'Chief Information Officer',
    phone: '(754) 321-2400',
    email: 'technology@browardschools.com',
    subdepts: [
      {
        name: 'Infrastructure & Security',
        staff: [
          { name: 'Dana Kim', title: 'Network Security Manager' },
          { name: 'Paul Ruiz', title: 'Systems Administrator' },
        ],
      },
    ],
  },
  {
    id: 'finance',
    name: 'Finance & Budget Services',
    description: 'Manages the district\'s $4.5 billion budget, financial reporting, procurement, and fiscal compliance.',
    director: 'Patricia Holden',
    directorTitle: 'Chief Financial Officer',
    phone: '(754) 321-2050',
    email: 'finance@browardschools.com',
    subdepts: [
      {
        name: 'Budget Office',
        staff: [
          { name: 'Kevin Marsh', title: 'Budget Director' },
          { name: 'Iris Collins', title: 'Financial Analyst' },
        ],
      },
    ],
  },
  {
    id: 'studentservices',
    name: 'Student Support Initiatives',
    description: 'Provides wraparound services for students including counseling, mental health, attendance, and community partnerships.',
    director: 'Dr. Angela Reyes',
    directorTitle: 'Chief Student Services Officer',
    phone: '(754) 321-2200',
    email: 'studentservices@browardschools.com',
    subdepts: [
      {
        name: 'Counseling & Mental Health',
        staff: [
          { name: 'Monica Pierce', title: 'Mental Health Coordinator' },
          { name: 'Arthur Banks', title: 'School Counseling Specialist' },
        ],
      },
    ],
  },
]

export const QUIZ_STEPS = [
  {
    question: 'What is your primary communications goal?',
    options: ['Build community awareness', 'Drive parent engagement', 'Support staff communications', 'Increase media coverage'],
  },
  {
    question: 'How often do you publish content?',
    options: ['Multiple times daily', 'Once a day', 'A few times a week', 'Weekly or less'],
  },
  {
    question: 'Which channels matter most to you?',
    options: ['Social media', 'Email newsletters', 'Website & blog', 'Press & media'],
  },
  {
    question: 'What metrics do you care about most?',
    options: ['Reach & impressions', 'Engagement & shares', 'Website traffic', 'Lead generation'],
  },
  {
    question: 'How large is your communications team?',
    options: ['Just me', '2–5 people', '6–15 people', '16+ people'],
  },
]
