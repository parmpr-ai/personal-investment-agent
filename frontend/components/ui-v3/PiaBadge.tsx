import type { HTMLAttributes, ReactNode } from 'react'

export type PiaBadgeVariant =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'warning'
  | 'danger'
  | 'info'
  | 'ai'
  | 'yahoo'
  | 'discord'
  | 'sa'
  | 'reuters'
  | 'pia'
  | 'x'
  | 'ibkr'

export type PiaBadgeSize = 'compact' | 'default' | 'spacious'

export type PiaBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: PiaBadgeVariant
  size?: PiaBadgeSize
  icon?: ReactNode
  children: ReactNode
}

export function PiaBadge({ variant = 'neutral', size = 'default', icon, children, className, ...props }: PiaBadgeProps) {
  return (
    <span
      className={['pia-v3-badge', `pia-v3-badge-${variant}`, `pia-v3-density-${size}`, className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {icon ? <span className="pia-v3-badge-icon">{icon}</span> : null}
      <span className="pia-v3-badge-label">{children}</span>
    </span>
  )
}
