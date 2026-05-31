import { normalizeLayoutOrder } from '../dashboard/layoutStorage'
import { WIDGET_CATALOG_MAP, isKnownWorkspaceWidgetId, type WorkspaceWidgetId } from './widgetCatalog'
import { WORKSPACE_MAP, type WorkspaceId } from './workspaceRegistry'

export const WORKSPACE_LAYOUT_STORAGE_PREFIX = 'pia.workspace.layout.v1'

export function getWorkspaceLayoutStorageKey(workspaceId: WorkspaceId) {
  return `${WORKSPACE_LAYOUT_STORAGE_PREFIX}.${workspaceId}`
}

// Null-safe: custom (`custom-*`) workspace ids are not in WORKSPACE_MAP, so their
// defaults must be supplied by the caller (see the fallbackDefaults parameter below).
export function getWorkspaceDefaultWidgetIds(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  return [...(WORKSPACE_MAP[workspaceId]?.defaultWidgetIds ?? [])]
}

// PIA-BUG-027 / PIA-ARCH-001-FINAL §2.2: `supportedWorkspaces` is a recommendation hint,
// NOT a placement filter. This accessor powers "recommended widgets" surfaces only and
// must never be used to drop saved widgets during normalization.
export function getWorkspaceSupportedWidgetIds(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  return Object.values(WIDGET_CATALOG_MAP)
    .filter((widget) => widget.supportedWorkspaces.includes(workspaceId))
    .map((widget) => widget.id)
}

// PIA-BUG-027: widgets are validated by KNOWN-ID only. Any known catalog widget is valid in
// any workspace (no per-workspace allowlist). `fallbackDefaults` lets custom workspaces — whose
// ids are absent from WORKSPACE_MAP — pass their own seed widgets through the same safe path.
export function normalizeWorkspaceLayout(
  saved: unknown,
  workspaceId: WorkspaceId,
  fallbackDefaults?: readonly WorkspaceWidgetId[],
): WorkspaceWidgetId[] {
  const rawDefaults = fallbackDefaults ?? getWorkspaceDefaultWidgetIds(workspaceId)
  const validDefaults = rawDefaults.filter(isKnownWorkspaceWidgetId)
  const savedIds = Array.isArray(saved)
    ? saved.filter((id): id is WorkspaceWidgetId => typeof id === 'string' && isKnownWorkspaceWidgetId(id))
    : []

  return normalizeLayoutOrder(savedIds, validDefaults)
}

export function readWorkspaceLayout(workspaceId: WorkspaceId, fallbackDefaults?: readonly WorkspaceWidgetId[]): WorkspaceWidgetId[] {
  if (typeof window === 'undefined') return normalizeWorkspaceLayout(undefined, workspaceId, fallbackDefaults)
  try {
    const raw = window.localStorage.getItem(getWorkspaceLayoutStorageKey(workspaceId))
    if (!raw) return normalizeWorkspaceLayout(undefined, workspaceId, fallbackDefaults)
    return normalizeWorkspaceLayout(JSON.parse(raw), workspaceId, fallbackDefaults)
  } catch {
    return normalizeWorkspaceLayout(undefined, workspaceId, fallbackDefaults)
  }
}

export function writeWorkspaceLayout(workspaceId: WorkspaceId, layout: readonly WorkspaceWidgetId[], fallbackDefaults?: readonly WorkspaceWidgetId[]) {
  if (typeof window === 'undefined') return
  try {
    const normalized = normalizeWorkspaceLayout([...layout], workspaceId, fallbackDefaults)
    window.localStorage.setItem(getWorkspaceLayoutStorageKey(workspaceId), JSON.stringify(normalized))
  } catch {}
}

export function resetWorkspaceLayout(workspaceId: WorkspaceId, fallbackDefaults?: readonly WorkspaceWidgetId[]): WorkspaceWidgetId[] {
  const defaults = normalizeWorkspaceLayout(undefined, workspaceId, fallbackDefaults)
  if (typeof window === 'undefined') return defaults
  try {
    window.localStorage.removeItem(getWorkspaceLayoutStorageKey(workspaceId))
  } catch {}
  return defaults
}
