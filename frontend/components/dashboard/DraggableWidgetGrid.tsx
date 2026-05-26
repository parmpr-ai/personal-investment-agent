'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import { PiaBadge, PiaButton, PiaWidgetShell } from '../ui-v3'
import { DASHBOARD_WIDGET_MAP } from './widgetRegistry'
import type { DashboardWidgetId, WidgetRenderMap } from './types'

type DraggableWidgetGridProps = {
  order: DashboardWidgetId[]
  widgets: WidgetRenderMap
  hidden?: boolean
  onReorder: (sourceId: DashboardWidgetId, targetId: DashboardWidgetId) => void
  onReset: () => void
  layoutReady: boolean
  headerIcons?: Partial<Record<DashboardWidgetId, ReactNode>>
}

export default function DraggableWidgetGrid({
  order,
  widgets,
  hidden = false,
  onReorder,
  onReset,
  layoutReady,
  headerIcons = {},
}: DraggableWidgetGridProps) {
  const [dragId, setDragId] = useState<DashboardWidgetId | null>(null)
  const [overId, setOverId] = useState<DashboardWidgetId | null>(null)

  function handleDragStart(id: DashboardWidgetId) {
    setDragId(id)
  }

  function handleDragEnd() {
    setDragId(null)
    setOverId(null)
  }

  function handleDrop(targetId: DashboardWidgetId) {
    if (dragId) onReorder(dragId, targetId)
    handleDragEnd()
  }

  return (
    <div className="dashboard-widget-shell">
      <div className="layout-toolbar">
        <div>
          <b>{hidden ? 'Workspace layout' : 'Dashboard layout'}</b>
          <p className="muted">{hidden ? 'Drag sections to reorder your workspace.' : 'Drag widgets by the handle to customize your terminal.'}</p>
        </div>
        <PiaButton type="button" variant="ghost" density="compact" onClick={onReset}>
          Reset layout
        </PiaButton>
      </div>
      <div className={`grid widget-grid ${layoutReady ? 'widget-grid-ready' : ''}`.trim()}>
        {order.map((id) => {
          const meta = DASHBOARD_WIDGET_MAP[id]
          const content = widgets[id]
          if (!meta || !content) return null
          const isDragging = dragId === id
          const isOver = overId === id && dragId && dragId !== id
          return (
            <WidgetSlot
              key={id}
              id={id}
              span={meta.span}
              title={hidden ? meta.privateTitle : meta.title}
              icon={headerIcons[id]}
              isDragging={isDragging}
              isOver={Boolean(isOver)}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={setOverId}
              onDrop={handleDrop}
            >
              {content}
            </WidgetSlot>
          )
        })}
      </div>
    </div>
  )
}

function WidgetSlot({
  id,
  span,
  title,
  icon,
  children,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  id: DashboardWidgetId
  span: string
  title: string
  icon?: ReactNode
  children: ReactNode
  isDragging: boolean
  isOver: boolean
  onDragStart: (id: DashboardWidgetId) => void
  onDragEnd: () => void
  onDragOver: (id: DashboardWidgetId | null) => void
  onDrop: (id: DashboardWidgetId) => void
}) {
  return (
    <PiaWidgetShell
      className={`panel ${span} draggable-panel ${isDragging ? 'is-dragging' : ''} ${isOver ? 'is-drop-target' : ''}`.trim()}
      title={title}
      icon={icon}
      statusBadge={<PiaBadge variant="pia" size="compact">Widget</PiaBadge>}
      actions={
        <button
          type="button"
          className="drag-handle"
          draggable
          aria-label={`Drag ${title}`}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', id)
            onDragStart(id)
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={16} />
        </button>
      }
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(id)
      }}
      onDragLeave={() => onDragOver(null)}
      onDrop={(event) => {
        event.preventDefault()
        onDrop(id)
      }}
    >
      {children}
    </PiaWidgetShell>
  )
}
