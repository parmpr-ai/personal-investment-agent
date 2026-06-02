'use client'

import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { GripVertical, Lock } from 'lucide-react'

export type ReorderItem = { key: string; label: string }

// Watchlist column manager: drag only from the right-side grip; scroll anywhere
// else; keep hidden and visible columns in one list.
export default function ReorderList({ items, hiddenKeys, lockedKeys, onReorder, onToggle, className = '' }: {
  items: ReorderItem[]
  hiddenKeys?: Set<string>
  lockedKeys?: Set<string>
  onReorder: (nextKeys: string[]) => void
  onToggle?: (key: string) => void
  className?: string
}) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const keys = items.map((item) => item.key)

  function reorderTo(key: string, target: string) {
    if (key === target || lockedKeys?.has(key) || lockedKeys?.has(target)) return
    const from = keys.indexOf(key)
    const to = keys.indexOf(target)
    if (from < 0 || to < 0) return
    const next = [...keys]
    next.splice(from, 1)
    next.splice(to, 0, key)
    onReorder(next)
  }

  function onDown(event: PointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    const row = target.closest('[data-key]') as HTMLElement | null
    if (!row?.dataset.key || lockedKeys?.has(row.dataset.key)) return
    dragRef.current = row.dataset.key
    setDragKey(row.dataset.key)
    listRef.current?.setPointerCapture(event.pointerId)
  }

  function onMove(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    const rows = Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (event.clientY >= rect.top && event.clientY < rect.bottom) {
        const targetKey = row.dataset.key
        if (targetKey && targetKey !== dragRef.current) reorderTo(dragRef.current, targetKey)
        break
      }
    }
  }

  function onUp(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragKey(null)
    listRef.current?.releasePointerCapture?.(event.pointerId)
  }

  return (
    <ul
      className={`reorder-list${className ? ` ${className}` : ''}`.trim()}
      ref={listRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {items.map((item) => {
        const on = !hiddenKeys?.has(item.key)
        const locked = Boolean(lockedKeys?.has(item.key))
        return (
          <li className={`reorder-row${dragKey === item.key ? ' dragging' : ''}${locked ? ' locked' : ''}`} key={item.key} data-key={item.key}>
            <span className="reorder-name">
              <span>{item.label}</span>
              {locked ? <Lock size={13} aria-label={`${item.label} locked`} /> : null}
            </span>
            {onToggle ? (
              <button
                type="button"
                className={`reorder-toggle${on ? ' on' : ''}${locked ? ' locked' : ''}`}
                aria-label={locked ? `${item.label} locked on` : `${on ? 'Hide' : 'Show'} ${item.label}`}
                aria-pressed={on}
                disabled={locked}
                onClick={() => !locked && onToggle(item.key)}
              >
                <span>{on ? 'ON' : 'OFF'}</span>
              </button>
            ) : null}
            <span
              className={`reorder-grip${locked ? ' reorder-grip-locked' : ''}`}
              data-grip={locked ? undefined : true}
              role="button"
              tabIndex={locked ? -1 : 0}
              aria-label={locked ? `${item.label} is locked` : `Drag to reorder ${item.label}`}
              aria-disabled={locked}
            >
              <GripVertical size={18} />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
