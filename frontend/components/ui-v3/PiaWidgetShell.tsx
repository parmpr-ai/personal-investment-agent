import type { HTMLAttributes, ReactNode } from 'react'
import { PiaEmptyState } from './PiaEmptyState'

export type PiaWidgetShellDensity = 'compact' | 'default' | 'spacious'

export type PiaWidgetShellProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  statusBadge?: ReactNode
  actions?: ReactNode
  footer?: ReactNode
  loading?: boolean
  error?: ReactNode
  empty?: boolean
  emptyTitle?: string
  emptyDescription?: ReactNode
  emptyAction?: ReactNode
  density?: PiaWidgetShellDensity
}

export function PiaWidgetShell({
  icon,
  title,
  subtitle,
  statusBadge,
  actions,
  footer,
  loading = false,
  error,
  empty = false,
  emptyTitle = 'No data available',
  emptyDescription,
  emptyAction,
  density = 'default',
  children,
  className,
  ...props
}: PiaWidgetShellProps) {
  const body = loading ? (
    <div className="pia-v3-widget-loading" aria-live="polite" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  ) : error ? (
    <div className="pia-v3-widget-error" role="alert">
      {error}
    </div>
  ) : empty ? (
    <PiaEmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} density={density} />
  ) : (
    children
  )

  return (
    <section
      className={['pia-v3-widget', `pia-v3-density-${density}`, className].filter(Boolean).join(' ')}
      aria-busy={loading || undefined}
      {...props}
    >
      <header className="pia-v3-widget-header">
        {icon ? <div className="pia-v3-widget-icon">{icon}</div> : null}
        <div className="pia-v3-widget-title-block">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {(statusBadge || actions) && (
          <div className="pia-v3-widget-actions">
            {statusBadge}
            {actions}
          </div>
        )}
      </header>
      <div className="pia-v3-widget-body">{body}</div>
      {footer ? <footer className="pia-v3-widget-footer">{footer}</footer> : null}
    </section>
  )
}
