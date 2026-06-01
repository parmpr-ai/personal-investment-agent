'use client'

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDownToLine, ArrowUpToLine, ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react'
import type { WidgetCatalogItem, WorkspaceWidgetId } from './widgetCatalog'
import type { WidgetMove } from './workspaceLayoutStorage'
import WidgetContextMenu from './WidgetContextMenu'

const sizeToSpan: Record<WidgetCatalogItem['defaultSize'], string> = {
  sm: 'span-4',
  md: 'span-6',
  lg: 'span-6',
  xl: 'span-12',
}

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 8

type WorkspaceWidgetGridProps = {
  widgets: WidgetCatalogItem[]
  hidden?: boolean
  onMove: (id: WorkspaceWidgetId, move: WidgetMove) => void
  onReorder: (sourceId: WorkspaceWidgetId, targetId: WorkspaceWidgetId) => void
  onRemove: (id: WorkspaceWidgetId) => void
}

export default function WorkspaceWidgetGrid({ widgets, hidden = false, onMove, onReorder, onRemove }: WorkspaceWidgetGridProps) {
  const [editMode, setEditMode] = useState(false)
  const [menu, setMenu] = useState<{ id: WorkspaceWidgetId; x: number; y: number } | null>(null)
  const [dragId, setDragId] = useState<WorkspaceWidgetId | null>(null)
  const [overId, setOverId] = useState<WorkspaceWidgetId | null>(null)
  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const lastPointerType = useRef<string>('mouse')

  useEffect(() => {
    if (!widgets.length && editMode) setEditMode(false)
  }, [widgets.length, editMode])

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
    pressStart.current = null
  }

  function handlePointerDown(event: ReactPointerEvent) {
    lastPointerType.current = event.pointerType
    if (event.pointerType !== 'touch') return
    pressStart.current = { x: event.clientX, y: event.clientY }
    pressTimer.current = window.setTimeout(() => {
      setEditMode(true)
      clearPress()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (!pressStart.current) return
    const dx = Math.abs(event.clientX - pressStart.current.x)
    const dy = Math.abs(event.clientY - pressStart.current.y)
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPress()
  }

  const total = widgets.length

  if (!total) {
    return (
      <section className="panel span-12">
        <div className="empty-state">
          <b>{hidden ? 'No visible modules' : 'No widgets in this workspace'}</b>
          <p className="muted">{hidden ? 'Layout is saved locally.' : 'Use Reset workspace to restore the default widgets.'}</p>
        </div>
      </section>
    )
  }

  return (
    <>
      {editMode ? (
        <section className="panel span-12 ws-edit-banner">
          <span>{hidden ? 'Edit mode' : 'Widget edit mode — reorder or remove widgets'}</span>
          <button type="button" className="tab active" onClick={() => setEditMode(false)}>
            Done
          </button>
        </section>
      ) : null}

      {widgets.map((widget, index) => {
        const isDragging = dragId === widget.id
        const isOver = overId === widget.id && dragId && dragId !== widget.id
        return (
          <section
            key={widget.id}
            className={`panel ${sizeToSpan[widget.defaultSize]} ws-widget${editMode ? ' ws-widget-editing' : ''}${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drop-target' : ''}`.trim()}
            onContextMenu={(event) => {
              event.preventDefault()
              if (lastPointerType.current === 'touch') return
              setMenu({ id: widget.id, x: event.clientX, y: event.clientY })
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onDragOver={(event) => {
              if (dragId) {
                event.preventDefault()
                setOverId(widget.id)
              }
            }}
            onDragLeave={() => setOverId((current) => (current === widget.id ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              if (dragId && dragId !== widget.id) onReorder(dragId, widget.id)
              setDragId(null)
              setOverId(null)
            }}
          >
            <div className="section-header">
              <div>
                <h3>{hidden ? 'Workspace widget' : widget.title}</h3>
                <p className="muted">{hidden ? 'Private module preview' : widget.description}</p>
              </div>
              <div className="ws-widget-headmeta">
                <span className="badge">{widget.status === 'existing' ? 'Existing' : 'Planned'}</span>
                {!editMode ? (
                  <button
                    type="button"
                    className="ws-widget-draghandle"
                    draggable
                    aria-label={`Drag ${widget.title} to reorder`}
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', widget.id)
                      setDragId(widget.id)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setOverId(null)
                    }}
                  >
                    <GripVertical size={15} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="empty-state">
              <b>{hidden ? 'Module preview' : widget.category}</b>
              <p className="muted">
                {hidden
                  ? 'Layout state is saved locally for this workspace.'
                  : `Default size ${widget.defaultSize.toUpperCase()} · allowed sizes ${widget.allowedSizes.join(', ').toUpperCase()}`}
              </p>
            </div>

            {editMode ? (
              <div className="ws-widget-controls" role="group" aria-label={`Reorder ${widget.title}`}>
                <button type="button" disabled={index === 0} aria-label="Move to top" onClick={(event) => { event.stopPropagation(); onMove(widget.id, 'top') }}>
                  <ArrowUpToLine size={15} />
                </button>
                <button type="button" disabled={index === 0} aria-label="Move up" onClick={(event) => { event.stopPropagation(); onMove(widget.id, 'up') }}>
                  <ChevronUp size={15} />
                </button>
                <button type="button" disabled={index === total - 1} aria-label="Move down" onClick={(event) => { event.stopPropagation(); onMove(widget.id, 'down') }}>
                  <ChevronDown size={15} />
                </button>
                <button type="button" disabled={index === total - 1} aria-label="Move to bottom" onClick={(event) => { event.stopPropagation(); onMove(widget.id, 'bottom') }}>
                  <ArrowDownToLine size={15} />
                </button>
                <button type="button" className="ws-widget-remove" aria-label={`Remove ${widget.title}`} onClick={(event) => { event.stopPropagation(); onRemove(widget.id) }}>
                  <Trash2 size={15} />
                </button>
              </div>
            ) : null}
          </section>
        )
      })}

      {menu ? (
        <WidgetContextMenu
          x={menu.x}
          y={menu.y}
          index={widgets.findIndex((widget) => widget.id === menu.id)}
          total={total}
          onMove={(move) => {
            onMove(menu.id, move)
            setMenu(null)
          }}
          onRemove={() => {
            onRemove(menu.id)
            setMenu(null)
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  )
}
