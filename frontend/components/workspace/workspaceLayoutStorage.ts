import { normalizeLayoutOrder } from '../dashboard/layoutStorage'
import { WIDGET_CATALOG_MAP, isKnownWorkspaceWidgetId, type WorkspaceWidgetId } from './widgetCatalog'
import { WORKSPACE_MAP, type WorkspaceId } from './workspaceRegistry'

export const WORKSPACE_LAYOUT_STORAGE_PREFIX = 'pia.workspace.layout.v1'

export function getWorkspaceLayoutStorageKey(workspaceId: WorkspaceId) {
  return `${WORKSPACE_LAYOUT_STORAGE_PREFIX}.${workspaceId}`
}

export function getWorkspaceDefaultWidgetIds(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  return [...WORKSPACE_MAP[workspaceId].defaultWidgetIds]
}

export function getWorkspaceSupportedWidgetIds(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  return Object.values(WIDGET_CATALOG_MAP)
    .filter((widget) => widget.supportedWorkspaces.includes(workspaceId))
    .map((widget) => widget.id)
}

export function normalizeWorkspaceLayout(saved: unknown, workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  const defaults = getWorkspaceDefaultWidgetIds(workspaceId)
  const supported = new Set(getWorkspaceSupportedWidgetIds(workspaceId))
  const validDefaults = defaults.filter((id) => supported.has(id))
  const savedIds = Array.isArray(saved)
    ? saved.filter((id): id is WorkspaceWidgetId => typeof id === 'string' && isKnownWorkspaceWidgetId(id) && supported.has(id))
    : []

  return normalizeLayoutOrder(savedIds, validDefaults)
}

export function readWorkspaceLayout(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  if (typeof window === 'undefined') return getWorkspaceDefaultWidgetIds(workspaceId)
  try {
    const raw = window.localStorage.getItem(getWorkspaceLayoutStorageKey(workspaceId))
    if (!raw) return normalizeWorkspaceLayout(undefined, workspaceId)
    return normalizeWorkspaceLayout(JSON.parse(raw), workspaceId)
  } catch {
    return normalizeWorkspaceLayout(undefined, workspaceId)
  }
}

export function writeWorkspaceLayout(workspaceId: WorkspaceId, layout: readonly WorkspaceWidgetId[]) {
  if (typeof window === 'undefined') return
  try {
    const normalized = normalizeWorkspaceLayout([...layout], workspaceId)
    window.localStorage.setItem(getWorkspaceLayoutStorageKey(workspaceId), JSON.stringify(normalized))
  } catch {}
}

export function resetWorkspaceLayout(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  const defaults = normalizeWorkspaceLayout(undefined, workspaceId)
  if (typeof window === 'undefined') return defaults
  try {
    window.localStorage.removeItem(getWorkspaceLayoutStorageKey(workspaceId))
  } catch {}
  return defaults
}
