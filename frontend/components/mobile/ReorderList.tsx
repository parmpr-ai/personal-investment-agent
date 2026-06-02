'use client'

import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'

export type ReorderItem = { key: string; label: string }

// PIA-ARCH-009 — reusable mobile/desktop reorder list.
// Drag only from the right-side grip handle; scroll anywhere else;
// scrollbars hidden; optional per-row visibility checkmark.
export default function ReorderList({ items, hiddenKeys, onReorder, onToggle, className = '' }: {
  items: ReorderItem[]
  hiddenKeys?: Set<string>
  onReorder: (nextKeys: string[]) => void
  onToggle?: (key: string) => void
  className?: string
}) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const keys = items.map((i) => i.key)

  function reorderTo(key: string, target: string) {
    if (key === target) return
    const from = keys.indexOf(key)
    const to = keys.indexOf(target)
    if (from < 0 || to < 0) return
    const next = [...keys]
    next.splice(from, 1)
    next.splice(to, 0, key)
    onReorder(next)
  }
  function onDown(e: PointerEvent<HTMLUListElement>) {
    const t = e.target as HTMLElement
    if (!t.closest('[data-grip]')) return
    const li = t.closest('[data-key]') as HTMLElement | null
    if (!li?.dataset.key) return
    dragRef.current = li.dataset.key
    setDragKey(li.dataset.key)
    listRef.current?.setPointerCapture(e.pointerId)
  }
  function onMove(e: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    const rows = Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]
    for (const el of rows) {
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY < r.bottom) {
        const tk = el.dataset.key
        if (tk && tk !== dragRef.current) reorderTo(dragRef.current, tk)
        break
      }
    }
  }
  function onUp(e: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragKey(null)
    listRef.current?.releasePointerCapture?.(e.pointerId)
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
        return (
          <li className={`reorder-row${dragKey === item.key ? ' dragging' : ''}`} key={item.key} data-key={item.key}>
            {onToggle && (
              <button type="button" className={`reorder-check${on ? ' on' : ''}`} aria-label={`${on ? 'Hide' : 'Show'} ${item.label}`} onClick={() => onToggle(item.key)}>
                {on ? '✓' : ''}
              </button>
            )}
            <span className="reorder-name">{item.label}</span>
            <span className="reorder-grip" data-grip role="button" tabIndex={0} aria-label={`Drag to reorder ${item.label}`}><GripVertical size={18} /></span>
          </li>
        )
      })}
    </ul>
  )
}
