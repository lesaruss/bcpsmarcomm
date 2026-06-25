'use client'

export default function BCPSGovernancePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <iframe
        src="/bcps/google-governance-plan.html"
        title="Google Governance Plan"
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
