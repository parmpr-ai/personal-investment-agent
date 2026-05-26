import type { HTMLAttributes, ReactNode } from 'react'

export type PiaCardDensity = 'compact' | 'default' | 'spacious'

export type PiaCardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section' | 'div'
  icon?: ReactNode
  title?: ReactNode
  metric?: ReactNode
  visual?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  density?: PiaCardDensity
  elevated?: boolean
  privacySafe?: boolean
}

export function PiaCard({
  as: Component = 'article',
  icon,
  title,
  metric,
  visual,
  badge,
  actions,
  footer,
  density = 'default',
  elevated = false,
  privacySafe = false,
  children,
  className,
  ...props
}: PiaCardProps) {
  return (
    <Component
      className={[
        'pia-v3-card',
        `pia-v3-density-${density}`,
        elevated ? 'pia-v3-card-elevated' : '',
        privacySafe ? 'pia-v3-private' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {(icon || title || badge || actions) && (
        <header className="pia-v3-card-header">
          {icon ? <div className="pia-v3-card-icon">{icon}</div> : null}
          {title ? <div className="pia-v3-card-title">{title}</div> : null}
          {badge || actions ? (
            <div className="pia-v3-card-actions">
              {badge}
              {actions}
            </div>
          ) : null}
        </header>
      )}
      {metric ? <div className="pia-v3-card-metric">{metric}</div> : null}
      {visual ? <div className="pia-v3-card-visual">{visual}</div> : null}
      {children ? <div className="pia-v3-card-body">{children}</div> : null}
      {footer ? <footer className="pia-v3-card-footer">{footer}</footer> : null}
    </Component>
  )
}
