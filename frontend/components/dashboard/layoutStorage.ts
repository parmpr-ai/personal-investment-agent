export function normalizeLayoutOrder<T extends string>(saved: unknown, defaults: readonly T[]): T[] {
  if (!Array.isArray(saved)) return [...defaults]
  const allowed = new Set(defaults)
  const seen = new Set<T>()
  const ordered: T[] = []
  for (const entry of saved) {
    if (typeof entry !== 'string') continue
    const id = entry as T
    if (!allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    ordered.push(id)
  }
  for (const id of defaults) {
    if (!seen.has(id)) ordered.push(id)
  }
  return ordered
}

export function readLayoutOrder<T extends string>(storageKey: string, defaults: readonly T[]): T[] {
  if (typeof window === 'undefined') return [...defaults]
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return [...defaults]
    return normalizeLayoutOrder(JSON.parse(raw), defaults)
  } catch {
    return [...defaults]
  }
}

export function writeLayoutOrder<T extends string>(storageKey: string, order: readonly T[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order))
  } catch {}
}

export function reorderItems<T extends string>(order: readonly T[], sourceId: T, targetId: T): T[] {
  if (sourceId === targetId) return [...order]
  const next = order.filter((id) => id !== sourceId)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex < 0) return [...order]
  next.splice(targetIndex, 0, sourceId)
  return next
}

export function moveItem<T extends string>(order: readonly T[], id: T, direction: -1 | 1): T[] {
  const index = order.indexOf(id)
  if (index < 0) return [...order]
  const target = index + direction
  if (target < 0 || target >= order.length) return [...order]
  const next = [...order]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
