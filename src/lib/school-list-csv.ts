// School list export for the District Web Team (Vanessa, 2026-10-13: "we would
// like an option to export our school name list"). Used by the My Schools
// tile on each lead's dashboard and by the Find Your District Web Team Lead
// editor on the Widgets page. Plain CSV so it opens straight in Excel.

export interface SchoolCsvRow {
  loc_no: string
  display_name: string
  school_level: string | null
  region: string | null
  lead_name?: string
  no_wcm?: boolean
  // The school's WCM where we have one on file (My Schools tab, 2026-10-22).
  wcm_name?: string | null
  wcm_email?: string | null
}

function cell(v: string) {
  return `"${v.replace(/"/g, '""')}"`
}

export function downloadSchoolsCsv(rows: SchoolCsvRow[], filename: string) {
  const withLead = rows.some(r => r.lead_name !== undefined)
  const withWcm = rows.some(r => r.wcm_name !== undefined)
  const header = ['Location Number', 'School', 'Level', 'Region', ...(withLead ? ['District Web Team Lead'] : []), 'WCM on file', ...(withWcm ? ['WCM', 'WCM Email'] : [])]
  const lines = rows.map(r => [
    // ="0131" keeps the leading zero when Excel opens the file.
    `="${r.loc_no}"`,
    cell(r.display_name),
    cell(r.school_level ?? ''),
    cell(r.region ?? ''),
    ...(withLead ? [cell(r.lead_name ?? '')] : []),
    cell(r.no_wcm ? 'No' : 'Yes'),
    ...(withWcm ? [cell(r.wcm_name ?? ''), cell(r.wcm_email ?? '')] : []),
  ].join(','))
  // BOM so Excel reads names with accents correctly.
  const blob = new Blob(['﻿' + [header.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function csvDateStamp() {
  return new Date().toISOString().slice(0, 10)
}
