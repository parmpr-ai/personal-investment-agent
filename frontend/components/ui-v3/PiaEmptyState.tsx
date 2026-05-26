import type { HTMLAttributes, ReactNode } from 'react'

export type PiaEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  density?: 'compact' | 'default' | 'spacious'
}

export function PiaEmptyState({
  icon,
  title,
  description,
  action,
  density = 'default',
  className,
  ...props
}: PiaEmptyStateProps) {
  return (
    <div className={['pia-v3-empty', `pia-v3-density-${density}`, className].filter(Boolean).join(' ')} {...props}>
      {icon ? <div className="pia-v3-empty-icon">{icon}</div> : null}
      <div className="pia-v3-empty-copy">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="pia-v3-empty-action">{action}</div> : null}
    </div>
  )
}
