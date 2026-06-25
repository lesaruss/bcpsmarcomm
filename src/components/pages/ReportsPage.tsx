'use client'

import { useState, useEffect } from 'react'

interface Finding {
  code: string
  count: number
  severity: string
  pages: string[]
}

interface DepartmentReport {
  id: string
  name: string
  auditDate: string
  findingsCount: number
  findings: Finding[]
}

interface ReportSummary {
  totalDepartments: number
  totalFindings: number
  byImpact: Record<string, number>
  generatedAt: string
}

interface Report {
  id: string
  title: string
  summary: ReportSummary
  departments: DepartmentReport[]
  status: string
  created_at: string
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    loadReports()
  }, [])

  const loadReports = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bcps/reports')
      if (res.ok) {
        const data = await res.json()
        setReports(data.reports || [])
      }
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateReport = async () => {
    setGeneratingReport(true)
    try {
      const res = await fetch('/api/bcps/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setSelectedReport(data.report)
        await loadReports()
      } else {
        alert('Failed to generate report')
      }
    } catch (err) {
      console.error('Generation error:', err)
      alert('Error generating report')
    } finally {
      setGeneratingReport(false)
    }
  }

  const downloadPDF = () => {
    if (!selectedReport) return
    // Placeholder: in production, integrate with a PDF library
    alert('PDF download will be implemented with a PDF library')
  }

  const printReport = () => {
    window.print()
  }

  const severityColor = (severity: string) => {
    const colors: Record<string, string> = {
      critical: '#DC2626',
      high: '#EA580C',
      medium: '#F59E0B',
      low: '#10B981',
    }
    return colors[severity] || '#6B7280'
  }

  // List view
  if (!selectedReport) {
    return (
      <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1F2937', margin: 0 }}>ADA Audit Reports</h1>
          <button
            onClick={generateReport}
            disabled={generatingReport}
            style={{
              background: '#003087',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: generatingReport ? 'not-allowed' : 'pointer',
              opacity: generatingReport ? 0.6 : 1,
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            {generatingReport ? 'Generating...' : 'Generate Report'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>Loading reports...</div>
        ) : reports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
            No reports yet. Click "Generate Report" to create one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {reports.map(report => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                style={{
                  background: '#fff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  padding: '18px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
                  e.currentTarget.style.borderColor = '#003087'
                }}
                onMouseOut={e => {
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'
                  e.currentTarget.style.borderColor = '#E5E7EB'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937', margin: '0 0 6px 0' }}>
                      {report.title}
                    </h3>
                    <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
                      Generated {new Date(report.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#003087' }}>
                      {report.summary.totalFindings}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6B7280' }}>findings</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '12px' }}>
                  {Object.entries(report.summary.byImpact).map(([severity, count]) => (
                    <div
                      key={severity}
                      style={{
                        padding: '8px',
                        background: '#F3F4F6',
                        borderRadius: '6px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '14px', fontWeight: 700, color: severityColor(severity) }}>
                        {count}
                      </div>
                      <div style={{ fontSize: '11px', color: '#6B7280', textTransform: 'capitalize' }}>
                        {severity}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Detail view
  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setSelectedReport(null)}
            style={{
              background: 'none',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              padding: '8px 12px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: '#374151',
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            ← Back to Reports
          </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={printReport}
            style={{
              background: '#F3F4F6',
              border: '1px solid #D1D5DB',
              borderRadius: '6px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: '#374151',
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            Print
          </button>
          <button
            onClick={downloadPDF}
            style={{
              background: '#003087',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 14px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              fontFamily: 'Open Sans, sans-serif',
            }}
          >
            Download PDF
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', marginBottom: '24px', border: '1px solid #E5E7EB' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1F2937', margin: '0 0 12px 0' }}>
          {selectedReport.title}
        </h1>
        <p style={{ fontSize: '13px', color: '#6B7280', margin: 0 }}>
          Generated {new Date(selectedReport.summary.generatedAt).toLocaleString()}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '24px' }}>
          <div style={{ padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#003087' }}>
              {selectedReport.summary.totalDepartments}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Departments with findings</div>
          </div>
          <div style={{ padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#003087' }}>
              {selectedReport.summary.totalFindings}
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>Total fixable violations</div>
          </div>
          {Object.entries(selectedReport.summary.byImpact).map(([severity, count]) => (
            <div key={severity} style={{ padding: '16px', background: '#F3F4F6', borderRadius: '8px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: severityColor(severity) }}>
                {count}
              </div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px', textTransform: 'capitalize' }}>
                {severity} severity
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1F2937', marginBottom: '16px', margin: '24px 0 16px 0' }}>
        By Department
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {selectedReport.departments.map(dept => (
          <div
            key={dept.id}
            style={{
              background: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '12px',
              padding: '18px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1F2937', margin: 0 }}>
                  {dept.name}
                </h3>
                <p style={{ fontSize: '12px', color: '#6B7280', margin: '4px 0 0 0' }}>
                  Audited {new Date(dept.auditDate).toLocaleDateString()}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: '#003087' }}>
                  {dept.findingsCount}
                </div>
                <div style={{ fontSize: '11px', color: '#6B7280' }}>findings</div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '14px' }}>
              {dept.findings.map((finding, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: idx < dept.findings.length - 1 ? '1px solid #F3F4F6' : 'none',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>
                      {finding.code.replace(/-/g, ' ')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                      {finding.pages.length} page{finding.pages.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        background: severityColor(finding.severity) + '22',
                        color: severityColor(finding.severity),
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    >
                      {finding.severity}
                    </span>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#003087', minWidth: '30px', textAlign: 'right' }}>
                      {finding.count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
