'use client'

import { useCallback, useEffect, useState } from 'react'
import { moveItem, readLayoutOrder, reorderItems, writeLayoutOrder } from './layoutStorage'

export function usePersistedLayout<T extends string>(storageKey: string, defaultOrder: readonly T[]) {
  const [mounted, setMounted] = useState(false)
  const [order, setOrder] = useState<T[]>([...defaultOrder])

  useEffect(() => {
    setMounted(true)
    setOrder(readLayoutOrder(storageKey, defaultOrder))
  }, [storageKey, defaultOrder])

  const persist = useCallback(
    (next: T[]) => {
      setOrder(next)
      if (mounted) writeLayoutOrder(storageKey, next)
    },
    [mounted, storageKey],
  )

  const reorder = useCallback(
    (sourceId: T, targetId: T) => {
      persist(reorderItems(order, sourceId, targetId))
    },
    [order, persist],
  )

  const moveUp = useCallback(
    (id: T) => {
      persist(moveItem(order, id, -1))
    },
    [order, persist],
  )

  const moveDown = useCallback(
    (id: T) => {
      persist(moveItem(order, id, 1))
    },
    [order, persist],
  )

  const reset = useCallback(() => {
    persist([...defaultOrder])
  }, [defaultOrder, persist])

  return { order, mounted, reorder, moveUp, moveDown, reset }
}
