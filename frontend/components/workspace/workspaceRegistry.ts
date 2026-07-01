/**
 * Workspace Registry - Define available workspaces
 */

export type WorkspaceId = 'agent' | 'portfolio' | 'watchlist' | 'dashboard'

export interface Workspace {
  id: WorkspaceId
  title: string
  description: string
  icon?: string
  widgets: string[]
}

export const WORKSPACES: readonly Workspace[] = [
  {
    id: 'agent',
    title: 'Agent Control',
    description: 'Autonomous trading agent training and paper trading control',
    icon: '🤖',
    widgets: [
      'agent-training-status',
      'agent-backtest-results',
      'agent-performance',
      'agent-decisions',
      'agent-paper-trading',
      'agent-settings',
    ],
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Your investment portfolio overview',
    icon: '📊',
    widgets: [],
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    description: 'Monitor stocks and assets',
    icon: '👁️',
    widgets: [],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Main trading dashboard',
    icon: '📈',
    widgets: [],
  },
] as const

export function getWorkspace(id: WorkspaceId): Workspace | undefined {
  return WORKSPACES.find((w) => w.id === id)
}

export function isWorkspaceId(id: string): id is WorkspaceId {
  return WORKSPACES.some((w) => w.id === id)
}
