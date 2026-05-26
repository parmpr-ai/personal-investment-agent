import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type PiaTabItem = {
  id: string
  label: ReactNode
  icon?: ReactNode
  badge?: ReactNode
  disabled?: boolean
}

export type PiaTabsProps = {
  tabs: PiaTabItem[]
  activeId: string
  onChange?: (id: string) => void
  density?: 'compact' | 'default' | 'spacious'
  ariaLabel: string
  className?: string
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children'>
}

export function PiaTabs({
  tabs,
  activeId,
  onChange,
  density = 'default',
  ariaLabel,
  className,
  buttonProps,
}: PiaTabsProps) {
  return (
    <div
      className={['pia-v3-tabs', `pia-v3-density-${density}`, className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label={ariaLabel}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            {...buttonProps}
            className={isActive ? 'pia-v3-tab pia-v3-tab-active' : 'pia-v3-tab'}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange?.(tab.id)}
          >
            {tab.icon ? <span className="pia-v3-tab-icon">{tab.icon}</span> : null}
            <span className="pia-v3-tab-label">{tab.label}</span>
            {tab.badge ? <span className="pia-v3-tab-badge">{tab.badge}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
