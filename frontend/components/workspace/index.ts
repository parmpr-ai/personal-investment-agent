/**
 * Workspace System Export
 */

export type { WorkspaceId, WorkspaceCategory, WorkspaceIconKey, WorkspaceStatus, WorkspaceDefinition } from './workspaceRegistry'
export {
  WORKSPACE_REGISTRY,
  WORKSPACE_MAP,
  ACTIVE_WORKSPACES,
  PLANNED_WORKSPACES,
  MOBILE_WORKSPACES,
  DEFAULT_WORKSPACE_ID,
  isWorkspaceId,
  getWorkspace,
} from './workspaceRegistry'

export type { WorkspaceWidgetId, WidgetSize, WidgetStatus, WidgetCatalogItem } from './widgetCatalog'
export {
  WIDGET_CATALOG,
  WIDGET_MAP,
  WIDGET_CATALOG_MAP,
  AGENT_WIDGETS,
  isWidgetId,
  isKnownWorkspaceWidgetId,
  getWidget,
  getWorkspaceWidgets,
} from './widgetCatalog'

export type { WorkspaceAiContext } from './workspaceAiContext'
export { getWorkspaceAiContext } from './workspaceAiContext'
