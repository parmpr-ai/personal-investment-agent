import { normalizeLayoutOrder, reorderItems } from '../dashboard/layoutStorage'
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

// --- PIA-BUG-030A: widget management helpers (pure list mutations + hidden set) ---

export type WidgetMove = 'top' | 'up' | 'down' | 'bottom'

export function moveWidgetInLayout(
  layout: readonly WorkspaceWidgetId[],
  id: WorkspaceWidgetId,
  move: WidgetMove,
): WorkspaceWidgetId[] {
  const index = layout.indexOf(id)
  if (index === -1) return [...layout]
  const next = [...layout]
  next.splice(index, 1)
  const target =
    move === 'top'
      ? 0
      : move === 'bottom'
        ? next.length
        : move === 'up'
          ? Math.max(0, index - 1)
          : Math.min(next.length, index + 1)
  next.splice(target, 0, id)
  return next
}

export function reorderWidgetInLayout(
  layout: readonly WorkspaceWidgetId[],
  sourceId: WorkspaceWidgetId,
  targetId: WorkspaceWidgetId,
): WorkspaceWidgetId[] {
  return reorderItems(layout, sourceId, targetId)
}

// Remove/hide is tracked in a companion key. `writeWorkspaceLayout` (the layout-order contract)
// re-appends any default widget missing from the saved order via normalizeLayoutOrder, so a removed
// default would otherwise reappear on reload. The hidden set lets removal persist while the order
// contract, custom-safe seeding (fallbackDefaults), and reset behavior remain unchanged.
export const WORKSPACE_HIDDEN_STORAGE_PREFIX = 'pia.workspace.hidden.v1'

export function getWorkspaceHiddenStorageKey(workspaceId: WorkspaceId) {
  return `${WORKSPACE_HIDDEN_STORAGE_PREFIX}.${workspaceId}`
}

export function readHiddenWidgets(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(getWorkspaceHiddenStorageKey(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((id): id is WorkspaceWidgetId => typeof id === 'string' && isKnownWorkspaceWidgetId(id))
      : []
  } catch {
    return []
  }
}

export function writeHiddenWidgets(workspaceId: WorkspaceId, hidden: readonly WorkspaceWidgetId[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getWorkspaceHiddenStorageKey(workspaceId), JSON.stringify([...hidden]))
  } catch {}
}

export function resetHiddenWidgets(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  if (typeof window === 'undefined') return []
  try {
    window.localStorage.removeItem(getWorkspaceHiddenStorageKey(workspaceId))
  } catch {}
  return []
}
