/**
 * Widget Catalog - Defines all widgets that can appear in workspaces
 *
 * Widgets are reusable UI components that can be placed in any workspace.
 * Each widget has size constraints and workspace compatibility.
 */

import type { WorkspaceId } from './workspaceRegistry'

export type WorkspaceWidgetId =
  // Agent widgets
  | 'agent-training-status'
  | 'agent-backtest-results'
  | 'agent-performance'
  | 'agent-settings'
  | 'agent-decisions'
  | 'agent-paper-trading'

export type WidgetSize = 'full'

export type WidgetStatus = 'active' | 'planned'

export type WidgetCatalogItem = {
  id: WorkspaceWidgetId
  title: string
  description: string
  size: WidgetSize
  supportedWorkspaces: readonly WorkspaceId[]
  status: WidgetStatus
}

export const WIDGET_CATALOG: readonly WidgetCatalogItem[] = [
  {
    id: 'agent-training-status',
    title: 'Training Status',
    description: 'Current training progress, accuracy, and model metrics.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
  {
    id: 'agent-backtest-results',
    title: 'Backtest Results',
    description: 'Walk-forward validation results per strategy.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
  {
    id: 'agent-performance',
    title: 'Live Performance',
    description: 'Paper trading results and equity curve.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
  {
    id: 'agent-settings',
    title: 'Agent Settings',
    description: 'Configuration and optimization controls.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
  {
    id: 'agent-decisions',
    title: 'Trading Decisions',
    description: 'Recent entries, exits, and decision logs.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
  {
    id: 'agent-paper-trading',
    title: 'Paper Trading Control',
    description: 'Manual trade entry/exit with live predictions and performance tracking.',
    size: 'full',
    supportedWorkspaces: ['agent'],
    status: 'active',
  },
] as const

export const WIDGET_MAP = Object.fromEntries(
  WIDGET_CATALOG.map((widget) => [widget.id, widget])
) as Record<WorkspaceWidgetId, WidgetCatalogItem>

export const AGENT_WIDGETS = WIDGET_CATALOG.filter((w) => w.supportedWorkspaces.includes('agent'))

export const WIDGET_CATALOG_MAP = WIDGET_MAP

export function isWidgetId(id: string): id is WorkspaceWidgetId {
  return id in WIDGET_MAP
}

export function isKnownWorkspaceWidgetId(id: string): id is WorkspaceWidgetId {
  return isWidgetId(id)
}

export function getWidget(id: WorkspaceWidgetId): WidgetCatalogItem {
  return WIDGET_MAP[id]
}

export function getWorkspaceWidgets(workspaceId: WorkspaceId): WidgetCatalogItem[] {
  return WIDGET_CATALOG.filter((w) => w.supportedWorkspaces.includes(workspaceId))
}
