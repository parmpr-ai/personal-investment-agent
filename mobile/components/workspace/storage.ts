// Self-contained localStorage layer for mobile workspace layout.

import { isKnownWidgetId, WORKSPACE_MAP, DEFAULT_PINNED, type WorkspaceId, type WorkspaceWidgetId } from './registry'

const LAYOUT_PREFIX  = 'pia.ws.layout.v1'
const HIDDEN_PREFIX  = 'pia.ws.hidden.v1'
const PINNED_KEY     = 'pia.ws.pinnedMobile'
const ACTIVE_KEY     = 'pia.ws.activeWorkspace'

function normalizeOrder(saved: WorkspaceWidgetId[], defaults: WorkspaceWidgetId[]): WorkspaceWidgetId[] {
  const valid = saved.filter(isKnownWidgetId)
  const extra = defaults.filter((id) => !valid.includes(id))
  return [...valid, ...extra]
}

function safeGet(key: string): unknown {
  if (typeof window === 'undefined') return null
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function safeSet(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

function safeRemove(key: string) {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(key) } catch {}
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function readLayout(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  const defaults = [...(WORKSPACE_MAP[workspaceId]?.defaultWidgetIds ?? [])]
  const raw = safeGet(`${LAYOUT_PREFIX}.${workspaceId}`)
  const saved = Array.isArray(raw) ? (raw as string[]).filter(isKnownWidgetId) : []
  return normalizeOrder(saved, defaults)
}

export function writeLayout(workspaceId: WorkspaceId, layout: WorkspaceWidgetId[]) {
  const defaults = [...(WORKSPACE_MAP[workspaceId]?.defaultWidgetIds ?? [])]
  safeSet(`${LAYOUT_PREFIX}.${workspaceId}`, normalizeOrder(layout, defaults))
}

export function resetLayout(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  safeRemove(`${LAYOUT_PREFIX}.${workspaceId}`)
  safeRemove(`${HIDDEN_PREFIX}.${workspaceId}`)
  return [...(WORKSPACE_MAP[workspaceId]?.defaultWidgetIds ?? [])]
}

// ─── Hidden set ──────────────────────────────────────────────────────────────

export function readHidden(workspaceId: WorkspaceId): WorkspaceWidgetId[] {
  const raw = safeGet(`${HIDDEN_PREFIX}.${workspaceId}`)
  return Array.isArray(raw) ? (raw as string[]).filter(isKnownWidgetId) : []
}

export function writeHidden(workspaceId: WorkspaceId, hidden: WorkspaceWidgetId[]) {
  safeSet(`${HIDDEN_PREFIX}.${workspaceId}`, hidden)
}

// ─── Move helpers ─────────────────────────────────────────────────────────────

export type MoveDir = 'up' | 'down' | 'top' | 'bottom'

export function moveWidget(layout: WorkspaceWidgetId[], id: WorkspaceWidgetId, dir: MoveDir): WorkspaceWidgetId[] {
  const i = layout.indexOf(id)
  if (i === -1) return layout
  const next = [...layout]
  next.splice(i, 1)
  const target = dir === 'top' ? 0 : dir === 'bottom' ? next.length : dir === 'up' ? Math.max(0, i - 1) : Math.min(next.length, i + 1)
  next.splice(target, 0, id)
  return next
}

// ─── Pinned workspaces ────────────────────────────────────────────────────────

export function readPinned(): WorkspaceId[] {
  const raw = safeGet(PINNED_KEY)
  return Array.isArray(raw) && raw.length ? (raw as string[]) : [...DEFAULT_PINNED]
}

export function writePinned(pinned: WorkspaceId[]) {
  safeSet(PINNED_KEY, pinned)
}

// ─── Active workspace ─────────────────────────────────────────────────────────

export function readActive(): WorkspaceId {
  return (safeGet(ACTIVE_KEY) as string) || 'home'
}

export function writeActive(id: WorkspaceId) {
  safeSet(ACTIVE_KEY, id)
}
