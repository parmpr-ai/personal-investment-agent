'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Brain, RotateCcw } from 'lucide-react'
import { WIDGET_CATALOG_MAP, type WidgetCatalogItem } from './widgetCatalog'
import { getWorkspaceAiContext } from './workspaceAiContext'
import { readWorkspaceLayout, resetWorkspaceLayout, writeWorkspaceLayout } from './workspaceLayoutStorage'
import { WORKSPACE_MAP, type WorkspaceDefinition, type WorkspaceId } from './workspaceRegistry'
import type { WorkspaceWidgetId } from './widgetCatalog'

type WorkspaceShellProps = {
  workspaceId: WorkspaceId
  workspace?: WorkspaceDefinition
  hidden?: boolean
  children?: ReactNode
}

const sizeToSpan: Record<WidgetCatalogItem['defaultSize'], string> = {
  sm: 'span-4',
  md: 'span-6',
  lg: 'span-6',
  xl: 'span-12',
}

export default function WorkspaceShell({ workspaceId, workspace: providedWorkspace, hidden = false, children }: WorkspaceShellProps) {
  const workspace = providedWorkspace || WORKSPACE_MAP[workspaceId] || WORKSPACE_MAP.home
  const aiContext = providedWorkspace ? providedWorkspace.defaultAiContext : getWorkspaceAiContext(workspaceId)
  const isStaticWorkspace = Boolean(WORKSPACE_MAP[workspaceId])
  const [layout, setLayout] = useState(() => [...workspace.defaultWidgetIds])

  useEffect(() => {
    if (isStaticWorkspace) {
      setLayout(readWorkspaceLayout(workspaceId))
      return
    }
    try {
      const raw = window.localStorage.getItem(`pia.workspace.layout.v1.${workspaceId}`)
      const saved = raw ? JSON.parse(raw) : null
      setLayout(Array.isArray(saved) ? saved : [...workspace.defaultWidgetIds])
    } catch {
      setLayout([...workspace.defaultWidgetIds])
    }
  }, [isStaticWorkspace, workspace.defaultWidgetIds, workspaceId])

  const widgets = useMemo(
    () => layout.map((id) => WIDGET_CATALOG_MAP[id]).filter((widget): widget is WidgetCatalogItem => Boolean(widget)),
    [layout],
  )

  function resetLayout() {
    if (isStaticWorkspace) setLayout(resetWorkspaceLayout(workspaceId))
    else setLayout([...workspace.defaultWidgetIds])
  }

  useEffect(() => {
    if (isStaticWorkspace) {
      writeWorkspaceLayout(workspaceId, layout)
      return
    }
    try {
      window.localStorage.setItem(`pia.workspace.layout.v1.${workspaceId}`, JSON.stringify(layout as WorkspaceWidgetId[]))
    } catch {}
  }, [isStaticWorkspace, layout, workspaceId])

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
            <h3>{hidden ? 'Workspace widgets' : 'Coming widgets'}</h3>
            <p className="muted">
              {hidden
                ? `${widgets.length} workspace modules`
                : 'This preview is filtered from the workspace widget catalog and will become the customizable workspace layout.'}
            </p>
          </div>
        </div>
      </section>

      {widgets.map((widget) => (
        <section className={`panel ${sizeToSpan[widget.defaultSize]}`} key={widget.id}>
          <div className="section-header">
            <div>
              <h3>{hidden ? 'Workspace widget' : widget.title}</h3>
              <p className="muted">{hidden ? 'Private module preview' : widget.description}</p>
            </div>
            <span className="badge">{widget.status === 'existing' ? 'Existing' : 'Planned'}</span>
          </div>
          <div className="empty-state">
            <b>{hidden ? 'Module preview' : widget.category}</b>
            <p className="muted">
              {hidden
                ? 'Layout state is saved locally for this workspace.'
                : `Default size ${widget.defaultSize.toUpperCase()} · allowed sizes ${widget.allowedSizes.join(', ').toUpperCase()}`}
            </p>
          </div>
        </section>
      ))}
    </div>
  )
}
