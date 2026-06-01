'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Brain, RotateCcw } from 'lucide-react'
import { WIDGET_CATALOG_MAP, type WidgetCatalogItem, type WorkspaceWidgetId } from './widgetCatalog'
import { getWorkspaceAiContext } from './workspaceAiContext'
import {
  moveWidgetInLayout,
  readHiddenWidgets,
  readWorkspaceLayout,
  reorderWidgetInLayout,
  resetHiddenWidgets,
  resetWorkspaceLayout,
  writeHiddenWidgets,
  writeWorkspaceLayout,
  type WidgetMove,
} from './workspaceLayoutStorage'
import { WORKSPACE_MAP, type WorkspaceDefinition, type WorkspaceId } from './workspaceRegistry'
import WorkspaceWidgetGrid from './WorkspaceWidgetGrid'

type WorkspaceShellProps = {
  workspaceId: WorkspaceId
  workspace?: WorkspaceDefinition
  hidden?: boolean
  children?: ReactNode
}

export default function WorkspaceShell({ workspaceId, workspace: providedWorkspace, hidden = false, children }: WorkspaceShellProps) {
  const workspace = providedWorkspace || WORKSPACE_MAP[workspaceId] || WORKSPACE_MAP.home
  const aiContext = providedWorkspace ? providedWorkspace.defaultAiContext : getWorkspaceAiContext(workspaceId)
  // PIA-BUG-027: system and custom workspaces share one safe storage path. Custom workspaces
  // (whose ids are absent from WORKSPACE_MAP) pass their own seed widgets via fallbackDefaults,
  // and no widget is dropped by a per-workspace allowlist during normalization.
  const defaultWidgetIds = workspace.defaultWidgetIds
  // PIA-BUG-030A: `order` rides the existing layout contract; `hiddenWidgets` is a companion set so
  // removal persists (normalizeLayoutOrder otherwise re-appends removed defaults on reload).
  const [order, setOrder] = useState<WorkspaceWidgetId[]>(() => [...defaultWidgetIds])
  const [hiddenWidgets, setHiddenWidgets] = useState<WorkspaceWidgetId[]>([])

  useEffect(() => {
    setOrder(readWorkspaceLayout(workspaceId, defaultWidgetIds))
    setHiddenWidgets(readHiddenWidgets(workspaceId))
  }, [defaultWidgetIds, workspaceId])

  useEffect(() => {
    writeWorkspaceLayout(workspaceId, order, defaultWidgetIds)
  }, [defaultWidgetIds, order, workspaceId])

  useEffect(() => {
    writeHiddenWidgets(workspaceId, hiddenWidgets)
  }, [hiddenWidgets, workspaceId])

  const hiddenSet = useMemo(() => new Set(hiddenWidgets), [hiddenWidgets])
  const visibleLayout = useMemo(() => order.filter((id) => !hiddenSet.has(id)), [order, hiddenSet])
  const widgets = useMemo(
    () => visibleLayout.map((id) => WIDGET_CATALOG_MAP[id]).filter((widget): widget is WidgetCatalogItem => Boolean(widget)),
    [visibleLayout],
  )

  // Reorder/move operate on the visible order; hidden widgets are retained at the tail so the layout
  // contract keeps every default present (no re-append surprises) while staying filtered from view.
  function applyVisibleOrder(nextVisible: WorkspaceWidgetId[]) {
    setOrder([...nextVisible, ...order.filter((id) => hiddenSet.has(id))])
  }
  function handleMove(id: WorkspaceWidgetId, move: WidgetMove) {
    applyVisibleOrder(moveWidgetInLayout(visibleLayout, id, move))
  }
  function handleReorder(sourceId: WorkspaceWidgetId, targetId: WorkspaceWidgetId) {
    applyVisibleOrder(reorderWidgetInLayout(visibleLayout, sourceId, targetId))
  }
  function handleRemove(id: WorkspaceWidgetId) {
    setHiddenWidgets((current) => (current.includes(id) ? current : [...current, id]))
  }
  function resetLayout() {
    setOrder(resetWorkspaceLayout(workspaceId, defaultWidgetIds))
    setHiddenWidgets(resetHiddenWidgets(workspaceId))
  }

  return (
    <div className="grid" data-workspace-id={workspaceId} data-ai-context={aiContext}>
      <section className="panel span-12">
        <div className="section-header">
          <div>
            <span className="badge">{workspace.category}</span>
            <h3 style={{ marginTop: 10 }}>{hidden ? 'Workspace' : workspace.title}</h3>
            <p className="muted">{hidden ? 'Private workspace context' : workspace.description}</p>
          </div>
          <button className="tab" type="button" onClick={resetLayout}>
            <RotateCcw size={15} /> Reset workspace
          </button>
        </div>
        <div className="empty-state">
          <div className="action" style={{ margin: 0 }}>
            <Brain size={18} className="green" />
            <div>
              <b>{hidden ? 'AI Core context' : 'Workspace-aware AI Core'}</b>
              <div className="muted">{hidden ? 'Context is scoped to this workspace.' : aiContext}</div>
            </div>
          </div>
        </div>
      </section>

      {children ? (
        <section className="panel span-12">
          <div className="section-header">
            <div>
              <h3>{hidden ? 'Workspace module' : 'Live module'}</h3>
              <p className="muted">
                {hidden ? 'Private live workspace content' : 'Current working PIA functionality reused inside the V3 workspace system.'}
              </p>
            </div>
          </div>
          {children}
        </section>
      ) : null}

      <section className="panel span-12">
        <div className="section-header">
          <div>
            <h3>{hidden ? 'Workspace widgets' : 'Workspace widgets'}</h3>
            <p className="muted">
              {hidden
                ? `${widgets.length} workspace modules`
                : 'Drag to reorder or right-click a widget for actions. On mobile, long-press a widget to edit.'}
            </p>
          </div>
        </div>
      </section>

      <WorkspaceWidgetGrid widgets={widgets} hidden={hidden} onMove={handleMove} onReorder={handleReorder} onRemove={handleRemove} />
    </div>
  )
}
