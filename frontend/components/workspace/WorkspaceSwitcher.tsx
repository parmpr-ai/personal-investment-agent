'use client'

import {
  Bitcoin,
  BookOpen,
  Brain,
  CalendarDays,
  Cpu,
  Globe2,
  Home,
  List,
  ScanSearch,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { WORKSPACE_REGISTRY, type WorkspaceDefinition, type WorkspaceIconKey, type WorkspaceId } from './workspaceRegistry'

type WorkspaceSwitcherProps = {
  activeWorkspaceId: WorkspaceId
  onSelect: (workspaceId: WorkspaceId) => void
  workspaces?: readonly WorkspaceDefinition[]
  className?: string
  showDescriptions?: boolean
}

export const workspaceIconMap: Record<WorkspaceIconKey, typeof Home> = {
  home: Home,
  wallet: Wallet,
  list: List,
  scan: ScanSearch,
  globe: Globe2,
  cpu: Cpu,
  calendar: CalendarDays,
  'trending-up': TrendingUp,
  bitcoin: Bitcoin,
  brain: Brain,
  'book-open': BookOpen,
}

export default function WorkspaceSwitcher({
  activeWorkspaceId,
  onSelect,
  workspaces = WORKSPACE_REGISTRY,
  className = '',
  showDescriptions = false,
}: WorkspaceSwitcherProps) {
  return (
    <nav className={className} aria-label="Workspaces">
      {workspaces.map((workspace) => {
        const Icon = workspaceIconMap[workspace.iconKey] || Home
        const disabled = workspace.status === 'planned'
        const selected = workspace.id === activeWorkspaceId
        return (
          <button
            key={workspace.id}
            type="button"
            className={selected ? 'active' : ''}
            aria-current={selected ? 'page' : undefined}
            aria-disabled={disabled}
            disabled={disabled}
            title={disabled ? `${workspace.title} - coming soon` : workspace.description}
            onClick={() => {
              if (!disabled) onSelect(workspace.id)
            }}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{workspace.title}</span>
            {disabled ? <small>Coming soon</small> : null}
            {showDescriptions ? <em>{workspace.description}</em> : null}
          </button>
        )
      })}
    </nav>
  )
}
