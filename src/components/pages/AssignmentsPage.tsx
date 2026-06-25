'use client'

export default function AssignmentsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <iframe
        src="/bcps/bcps-web-team-assignments.html"
        title="Web Team Assignments"
        style={{
          flex: 1,
          border: 'none',
          width: '100%',
          height: '100%',
        }}
      />
    </div>
  )
}
