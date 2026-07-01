'use client'

/**
 * Workspace Renderer - Renders widgets for a given workspace
 */

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import type { WorkspaceWidgetId } from './widgetCatalog'
import { getWorkspace } from './workspaceRegistry'
import type { WorkspaceId } from './workspaceRegistry'

const AgentPaperTradingWidget = dynamic(() => import('../widgets/AgentPaperTradingWidget'), {
  loading: () => <WidgetLoading />,
  ssr: false,
})

const WIDGET_COMPONENTS: Record<WorkspaceWidgetId, React.ComponentType> = {
  'agent-training-status': () => <div className="p-4">Training Status Widget</div>,
  'agent-backtest-results': () => <div className="p-4">Backtest Results Widget</div>,
  'agent-performance': () => <div className="p-4">Live Performance Widget</div>,
  'agent-decisions': () => <div className="p-4">Trading Decisions Widget</div>,
  'agent-paper-trading': AgentPaperTradingWidget,
  'agent-settings': () => <div className="p-4">Agent Settings Widget</div>,
}

function WidgetLoading() {
  return (
    <div className="w-full bg-slate-900 border border-slate-700 rounded-lg p-8 flex items-center justify-center">
      <div className="text-slate-400">Loading widget...</div>
    </div>
  )
}

interface WorkspaceRendererProps {
  workspaceId: WorkspaceId
}

export function WorkspaceRenderer({ workspaceId }: WorkspaceRendererProps) {
  const workspace = getWorkspace(workspaceId)

  if (!workspace) {
    return (
      <div className="p-4 text-red-500">
        Workspace "{workspaceId}" not found
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 p-4">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">
          {workspace.icon} {workspace.title}
        </h1>
        <p className="text-slate-400 mt-2">{workspace.description}</p>
      </div>

      <div className="space-y-4">
        {workspace.widgets.map((widgetId) => {
          const Widget = WIDGET_COMPONENTS[widgetId as WorkspaceWidgetId]
          if (!Widget) return null

          return (
            <Suspense key={widgetId} fallback={<WidgetLoading />}>
              <div className="w-full bg-slate-900 border border-slate-700 rounded-lg overflow-hidden">
                <Widget />
              </div>
            </Suspense>
          )
        })}
      </div>
    </div>
  )
}

export default WorkspaceRenderer
