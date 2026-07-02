/**
 * Workspace Registry - Defines all workspaces in PIA
 *
 * Workspaces are top-level dashboard views like:
 * - Home: Primary command center
 * - Portfolio: Holdings and exposure
 * - Watchlist: Tracked opportunities
 * - Scanner: Technical setups
 * - Autonomous Agent: AI-powered trading
 */

export type WorkspaceId =
  | 'home'
  | 'portfolio'
  | 'watchlist'
  | 'scanner'
  | 'agent'
  | 'risk'
  | 'tax'
  | 'about'
  | 'settings'

export type WorkspaceCategory = 'core' | 'portfolio' | 'trading' | 'utility' | 'settings'

export type WorkspaceIconKey =
  | 'home'
  | 'wallet'
  | 'trending-up'
  | 'target'
  | 'bot'
  | 'shield'
  | 'file'
  | 'info'
  | 'settings'

export type WorkspaceStatus = 'active' | 'planned' | 'beta'

export type WorkspaceDefinition = {
  id: WorkspaceId
  title: string
  description: string
  iconKey: WorkspaceIconKey
  category: WorkspaceCategory
  status: WorkspaceStatus
  mobilePriority: number // 1=top, lower=more visible
}

export const WORKSPACE_REGISTRY: readonly WorkspaceDefinition[] = [
  {
    id: 'home',
    title: 'Home',
    description: 'Primary dashboard with portfolio snapshot, market context, and decision brief.',
    iconKey: 'home',
    category: 'core',
    status: 'active',
    mobilePriority: 1,
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    description: 'Holdings, exposure, risk, and performance analysis.',
    iconKey: 'wallet',
    category: 'portfolio',
    status: 'active',
    mobilePriority: 2,
  },
  {
    id: 'watchlist',
    title: 'Watchlist',
    description: 'Custom watchlists and opportunity tracking.',
    iconKey: 'trending-up',
    category: 'trading',
    status: 'active',
    mobilePriority: 3,
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Technical setups and trade radar.',
    iconKey: 'target',
    category: 'trading',
    status: 'active',
    mobilePriority: 4,
  },
  {
    id: 'agent',
    title: 'Agent',
    description: 'Autonomous AI trading agent with backtesting and live paper trading.',
    iconKey: 'bot',
    category: 'trading',
    status: 'active',
    mobilePriority: 5,
  },
  {
    id: 'risk',
    title: 'Risk',
    description: 'Risk controls, guardrails, and stress tests.',
    iconKey: 'shield',
    category: 'utility',
    status: 'active',
    mobilePriority: 6,
  },
  {
    id: 'tax',
    title: 'Tax',
    description: 'Tax documents and reporting.',
    iconKey: 'file',
    category: 'utility',
    status: 'planned',
    mobilePriority: 7,
  },
  {
    id: 'about',
    title: 'About',
    description: 'App information and legal.',
    iconKey: 'info',
    category: 'utility',
    status: 'active',
    mobilePriority: 8,
  },
  {
    id: 'settings',
    title: 'Settings',
    description: 'Preferences and integrations.',
    iconKey: 'settings',
    category: 'settings',
    status: 'active',
    mobilePriority: 9,
  },
] as const

export const WORKSPACE_MAP = Object.fromEntries(
  WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace])
) as Record<WorkspaceId, WorkspaceDefinition>

export const ACTIVE_WORKSPACES = WORKSPACE_REGISTRY.filter((w) => w.status === 'active')
export const PLANNED_WORKSPACES = WORKSPACE_REGISTRY.filter((w) => w.status === 'planned')
export const MOBILE_WORKSPACES = ACTIVE_WORKSPACES.sort((a, b) => a.mobilePriority - b.mobilePriority)

export const DEFAULT_WORKSPACE_ID: WorkspaceId = 'home'

export function isWorkspaceId(id: string): id is WorkspaceId {
  return id in WORKSPACE_MAP
}

export function getWorkspace(id: WorkspaceId): WorkspaceDefinition {
  return WORKSPACE_MAP[id]
}
