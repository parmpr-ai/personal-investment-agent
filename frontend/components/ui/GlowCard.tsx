import { ReactNode } from 'react'

export default function GlowCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`glow-card ${className}`.trim()}>{children}</div>
}
