'use client'

import { useEffect, useRef } from 'react'
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import type { WidgetMove } from './workspaceLayoutStorage'

type WidgetContextMenuProps = {
  x: number
  y: number
  index: number
  total: number
  onMove: (move: WidgetMove) => void
  onRemove: () => void
  onClose: () => void
}

export default function WidgetContextMenu({ x, y, index, total, onMove, onRemove, onClose }: WidgetContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const atTop = index <= 0
  const atBottom = index >= total - 1
  const viewportW = typeof window === 'undefined' ? 9999 : window.innerWidth
  const viewportH = typeof window === 'undefined' ? 9999 : window.innerHeight
  const style = { left: Math.min(x, viewportW - 220), top: Math.min(y, viewportH - 240) }

  return (
    <div ref={ref} className="ws-widget-menu" style={style} role="menu" aria-label="Widget actions">
      <button type="button" role="menuitem" disabled={atTop} onClick={() => onMove('top')}>
        <ArrowUpToLine size={15} /> Move to top
      </button>
      <button type="button" role="menuitem" disabled={atTop} onClick={() => onMove('up')}>
        <ChevronUp size={15} /> Move up
      </button>
      <button type="button" role="menuitem" disabled={atBottom} onClick={() => onMove('down')}>
        <ChevronDown size={15} /> Move down
      </button>
      <button type="button" role="menuitem" disabled={atBottom} onClick={() => onMove('bottom')}>
        <ArrowDownToLine size={15} /> Move to bottom
      </button>
      <div className="ws-widget-menu-sep" />
      <button type="button" role="menuitem" className="ws-widget-menu-danger" onClick={onRemove}>
        <Trash2 size={15} /> Remove from workspace
      </button>
    </div>
  )
}
