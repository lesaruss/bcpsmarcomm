'use client'

export default function CertificationPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', marginTop: '0' }}>
      <iframe
        src="/bcps/department-certification.html"
        title="Department Certification"
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