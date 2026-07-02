export type PageId =
  | 'dashboard'
  | 'notes'
  | 'profile'
  | 'departments'
  | 'analytics'
  | 'superadmin'
  | 'marcomm'
  | 'graphics'
  | 'minutes'
  | 'wcm'
  | 'queue'
  | 'bcps-google-governance'
  | 'bcps-assignments'
  | 'bcps-certification'
  | 'employee-records'
  | 'department'
  | 'reports'
  | 'documents'
  | 'permissions'
  | 'members'
  | 'community-relations'
  | 'minibase'

export interface BreadcrumbItem {
  label: string
  pageId: PageId
}

export interface NavState {
  page: PageId
  breadcrumb?: BreadcrumbItem
  subPage?: string
}

export interface Member {
  id: number
  name: string
  initials: string
  color: string
  role: string
  email: string
}

export interface BetaMember {
  id: number
  name: string
  email: string
  role: string
  status: 'sent' | 'pending' | 'accepted'
  beta: boolean
}

export interface Note {
  id: number
  author: string
  initials: string
  color: string
  time: string
  content: string
  mentions: string[]
}

export interface Department {
  id: string
  name: string
  description: string
  director: string
  directorTitle: string
  phone: string
  email: string
  subdepts: SubDept[]
}

export interface SubDept {
  name: string
  staff: StaffMember[]
}

export interface StaffMember {
  name: string
  title: string
}

export interface DomainRule {
  domain: string
  enabled: boolean
}
