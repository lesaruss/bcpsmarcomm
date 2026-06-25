'use client'

interface CartridgePageProps {
  title: string
  description: string
}

export default function CartridgePage({ title, description }: CartridgePageProps) {
  return (
    <div className="cartridge-page">
      <div className="cartridge-empty">
        <div className="cartridge-icon">🎮</div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="cartridge-coming-soon">
          <span className="badge badge-yellow">Coming Soon</span>
          <p>This console is in development. Check back in the next release.</p>
        </div>
      </div>
    </div>
  )
}
