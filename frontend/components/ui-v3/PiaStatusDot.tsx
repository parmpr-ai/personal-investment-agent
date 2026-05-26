import type { HTMLAttributes } from 'react'

export type PiaStatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'ai'
export type PiaStatusDotSize = 'sm' | 'md' | 'lg'

export type PiaStatusDotProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: PiaStatusTone
  size?: PiaStatusDotSize
  pulse?: boolean
  label?: string
}

export function PiaStatusDot({
  tone = 'neutral',
  size = 'md',
  pulse = false,
  label,
  className,
  ...props
}: PiaStatusDotProps) {
  return (
    <span
      className={[
        'pia-v3-status-dot',
        `pia-v3-status-dot-${tone}`,
        `pia-v3-status-dot-${size}`,
        pulse ? 'pia-v3-status-dot-pulse' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      {...props}
    />
  )
}
