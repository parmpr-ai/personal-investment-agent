import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type PiaButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type PiaButtonDensity = 'compact' | 'default' | 'spacious'

export type PiaButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PiaButtonVariant
  density?: PiaButtonDensity
  loading?: boolean
  icon?: ReactNode
  trailingIcon?: ReactNode
}

export function PiaButton({
  variant = 'secondary',
  density = 'default',
  loading = false,
  icon,
  trailingIcon,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: PiaButtonProps) {
  return (
    <button
      className={['pia-v3-button', `pia-v3-button-${variant}`, `pia-v3-density-${density}`, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      type={type}
      {...props}
    >
      {loading ? <span className="pia-v3-button-spinner" aria-hidden="true" /> : icon ? <span>{icon}</span> : null}
      <span className="pia-v3-button-label">{children}</span>
      {trailingIcon ? <span>{trailingIcon}</span> : null}
    </button>
  )
}
