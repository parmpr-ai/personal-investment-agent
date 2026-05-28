'use client'

import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { ArrowRight, Check, GripVertical, Pencil, Pin, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { WORKSPACE_REGISTRY, type WorkspaceDefinition, type WorkspaceIconKey, type WorkspaceId } from './workspaceRegistry'
import { workspaceIconMap } from './WorkspaceSwitcher'
import type { WorkspaceWidgetId } from './widgetCatalog'

export const CUSTOM_WORKSPACES_KEY = 'pia.workspaces.custom'
export const PINNED_MOBILE_KEY = 'pia.workspaces.pinnedMobile'
export const SIDEBAR_DESKTOP_KEY = 'pia.workspaces.sidebarDesktop'
export const WORKSPACE_ORDER_KEY = 'pia.workspaces.order'

const DEFAULT_PINNED_MOBILE: WorkspaceId[] = ['home', 'my-portfolio', 'watchlists', 'scanner', 'markets-macro']
const DEFAULT_ORDER: WorkspaceId[] = WORKSPACE_REGISTRY.map((workspace) => workspace.id)
const DEFAULT_SIDEBAR_DESKTOP: WorkspaceId[] = DEFAULT_ORDER
const MAX_PINNED_MOBILE = 5

const TEMPLATE_WIDGETS: Record<string, readonly WorkspaceWidgetId[]> = {
  blank: ['decision-brief'],
  watchlist: ['watchlist-manager', 'watchlist-movers', 'news-intelligence'],
  portfolio: ['portfolio-snapshot', 'positions', 'risk-controls', 'exposure-map'],
  news: ['news-intelligence', 'unified-intelligence-feed'],
  macro: ['market-pulse', 'macro-calendar', 'sector-industry-heatmap'],
  trade: ['swing-trade-planner', 'scanner-setups', 'trade-radar'],
}

export const CUSTOM_WORKSPACE_TEMPLATES = [
  ['blank', 'Blank'],
  ['watchlist', 'Watchlist'],
  ['portfolio', 'Portfolio analysis'],
  ['news', 'News feed'],
  ['macro', 'Macro dashboard'],
  ['trade', 'Trade setup board'],
] as const

export const CUSTOM_WORKSPACE_ICONS: { key: WorkspaceIconKey; label: string }[] = [
  { key: 'home', label: 'Home' },
  { key: 'wallet', label: 'Portfolio' },
  { key: 'list', label: 'List' },
  { key: 'scan', label: 'Scanner' },
  { key: 'globe', label: 'Macro' },
  { key: 'cpu', label: 'AI' },
  { key: 'calendar', label: 'Events' },
  { key: 'trending-up', label: 'Trades' },
  { key: 'bitcoin', label: 'Crypto' },
  { key: 'brain', label: 'Coach' },
  { key: 'book-open', label: 'Academy' },
]

type CustomWorkspace = WorkspaceDefinition & {
  custom?: true
  accent?: string
  template?: string
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '')
    return parsed || fallback
  } catch {
    return fallback
  }
}

function writeJson<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function uniqueExisting(ids: WorkspaceId[], workspaces: readonly WorkspaceDefinition[]) {
  const valid = new Set(workspaces.map((workspace) => workspace.id))
  const next: WorkspaceId[] = []
  ids.forEach((id) => {
    if (valid.has(id) && !next.includes(id)) next.push(id)
  })
  return next
}

function normalizeOrder(order: WorkspaceId[], workspaces: readonly WorkspaceDefinition[]) {
  const ordered = uniqueExisting(order, workspaces)
  workspaces.forEach((workspace) => {
    if (!ordered.includes(workspace.id)) ordered.push(workspace.id)
  })
  return ordered
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items]
  const boundedTo = Math.max(0, Math.min(next.length - 1, to))
  const [item] = next.splice(from, 1)
  next.splice(boundedTo, 0, item)
  return next
}

export function useWorkspaceConfig() {
  const [custom, setCustom] = useState<CustomWorkspace[]>([])
  const [pinnedMobile, setPinnedMobile] = useState<WorkspaceId[]>(DEFAULT_PINNED_MOBILE)
  const [sidebarDesktop, setSidebarDesktop] = useState<WorkspaceId[]>(DEFAULT_SIDEBAR_DESKTOP)
  const [order, setOrder] = useState<WorkspaceId[]>(DEFAULT_ORDER)
  const [warning, setWarning] = useState('')

  useEffect(() => {
    const savedCustom = readJson<CustomWorkspace[]>(CUSTOM_WORKSPACES_KEY, [])
    const all = [...WORKSPACE_REGISTRY, ...savedCustom]
    setCustom(savedCustom)
    setOrder(normalizeOrder(readJson<WorkspaceId[]>(WORKSPACE_ORDER_KEY, DEFAULT_ORDER), all))
    setPinnedMobile(uniqueExisting(readJson<WorkspaceId[]>(PINNED_MOBILE_KEY, DEFAULT_PINNED_MOBILE), all).slice(0, MAX_PINNED_MOBILE))
    setSidebarDesktop(uniqueExisting(readJson<WorkspaceId[]>(SIDEBAR_DESKTOP_KEY, DEFAULT_SIDEBAR_DESKTOP), all))
  }, [])

  const workspaces = useMemo(() => {
    const all = [...WORKSPACE_REGISTRY, ...custom]
    const normalized = normalizeOrder(order, all)
    return normalized.map((id) => all.find((workspace) => workspace.id === id)).filter((workspace): workspace is WorkspaceDefinition => Boolean(workspace))
  }, [custom, order])

  function persistCustom(next: CustomWorkspace[]) {
    setCustom(next)
    writeJson(CUSTOM_WORKSPACES_KEY, next)
  }

  function persistPinned(next: WorkspaceId[]) {
    const normalized = uniqueExisting(next, workspaces).slice(0, MAX_PINNED_MOBILE)
    setPinnedMobile(normalized)
    writeJson(PINNED_MOBILE_KEY, normalized)
  }

  function persistSidebar(next: WorkspaceId[]) {
    const normalized = uniqueExisting(next, workspaces)
    setSidebarDesktop(normalized)
    writeJson(SIDEBAR_DESKTOP_KEY, normalized)
  }

  function persistOrder(next: WorkspaceId[]) {
    const normalized = normalizeOrder(next, workspaces)
    setOrder(normalized)
    writeJson(WORKSPACE_ORDER_KEY, normalized)
  }

  function togglePinned(id: WorkspaceId) {
    if (pinnedMobile.includes(id)) {
      persistPinned(pinnedMobile.filter((item) => item !== id))
      setWarning('')
      return
    }
    if (pinnedMobile.length >= MAX_PINNED_MOBILE) {
      setWarning('Mobile bottom navigation is limited to 5 workspaces.')
      return
    }
    persistPinned([...pinnedMobile, id])
    setWarning('')
  }

  function toggleSidebar(id: WorkspaceId) {
    if (sidebarDesktop.includes(id)) persistSidebar(sidebarDesktop.filter((item) => item !== id))
    else persistSidebar([...sidebarDesktop, id])
  }

  function createCustom(input: { name: string; iconKey: WorkspaceIconKey; accent: string; template: string }) {
    const title = input.name.trim()
    if (!title) return
    const id = `custom-${Date.now()}`
    const nextWorkspace: CustomWorkspace = {
      id,
      title,
      description: `${CUSTOM_WORKSPACE_TEMPLATES.find(([key]) => key === input.template)?.[1] || 'Custom'} workspace.`,
      iconKey: input.iconKey,
      category: 'research',
      defaultWidgetIds: TEMPLATE_WIDGETS[input.template] || TEMPLATE_WIDGETS.blank,
      defaultAiContext: `Use this custom workspace for ${title}.`,
      mobilePriority: 99,
      status: 'active',
      custom: true,
      accent: input.accent,
      template: input.template,
    }
    const nextCustom = [...custom, nextWorkspace]
    const nextAll = [...WORKSPACE_REGISTRY, ...nextCustom]
    const nextOrder = normalizeOrder([...order, id], nextAll)
    const nextSidebar = uniqueExisting([...sidebarDesktop, id], nextAll)
    persistCustom(nextCustom)
    setOrder(nextOrder)
    writeJson(WORKSPACE_ORDER_KEY, nextOrder)
    setSidebarDesktop(nextSidebar)
    writeJson(SIDEBAR_DESKTOP_KEY, nextSidebar)
  }

  function renameCustom(id: WorkspaceId, title: string) {
    const name = title.trim()
    if (!name) return
    persistCustom(custom.map((workspace) => (workspace.id === id ? { ...workspace, title: name } : workspace)))
  }

  function deleteCustom(id: WorkspaceId) {
    persistCustom(custom.filter((workspace) => workspace.id !== id))
    persistOrder(order.filter((item) => item !== id))
    persistPinned(pinnedMobile.filter((item) => item !== id))
    persistSidebar(sidebarDesktop.filter((item) => item !== id))
  }

  function reset() {
    persistCustom([])
    persistOrder(DEFAULT_ORDER)
    persistPinned(DEFAULT_PINNED_MOBILE)
    persistSidebar(DEFAULT_SIDEBAR_DESKTOP)
    setWarning('')
  }

  return {
    workspaces,
    custom,
    pinnedMobile,
    sidebarDesktop,
    order,
    warning,
    setWarning,
    togglePinned,
    toggleSidebar,
    createCustom,
    renameCustom,
    deleteCustom,
    reset,
    movePinned: (from: number, to: number) => persistPinned(moveItem(pinnedMobile, from, to)),
    moveOrder: (from: number, to: number) => persistOrder(moveItem(order, from, to)),
    setPinnedMobile: persistPinned,
    setSidebarDesktop: persistSidebar,
  }
}

export function getWorkspaceDefinition(workspaces: readonly WorkspaceDefinition[], id: WorkspaceId) {
  return workspaces.find((workspace) => workspace.id === id) || WORKSPACE_REGISTRY[0]
}

function DraggableWorkspaceRows({
  ids,
  workspaces,
  onMove,
  renderAction,
  renderMeta,
}: {
  ids: WorkspaceId[]
  workspaces: readonly WorkspaceDefinition[]
  onMove: (from: number, to: number) => void
  renderAction: (workspace: WorkspaceDefinition) => ReactNode
  renderMeta?: (workspace: WorkspaceDefinition) => ReactNode
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  return (
    <div className="workspace-manager-list">
      {ids.map((id, index) => {
        const workspace = getWorkspaceDefinition(workspaces, id)
        const Icon = workspaceIconMap[workspace.iconKey] || workspaceIconMap.home
        return (
          <div
            className={`workspace-manager-row${dragIndex === index ? ' dragging' : ''}`}
            draggable
            key={id}
            onDragStart={(event: DragEvent<HTMLDivElement>) => {
              setDragIndex(index)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) onMove(dragIndex, index)
              setDragIndex(null)
            }}
            onDragEnd={() => setDragIndex(null)}
          >
            <GripVertical size={15} className="workspace-drag-handle" aria-hidden="true" />
            <Icon size={17} aria-hidden="true" />
            <div className="workspace-manager-row-text">
              <strong>{workspace.title}</strong>
              {renderMeta ? renderMeta(workspace) : <span>{workspace.description}</span>}
            </div>
            {renderAction(workspace)}
          </div>
        )
      })}
    </div>
  )
}

export function WorkspaceManagerPanel({
  config,
  variant = 'mobile',
  onSelectWorkspace,
}: {
  config: ReturnType<typeof useWorkspaceConfig>
  variant?: 'mobile' | 'desktop'
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
}) {
  const [name, setName] = useState('')
  const [iconKey, setIconKey] = useState<WorkspaceIconKey>('list')
  const [accent, setAccent] = useState('#60a5fa')
  const [template, setTemplate] = useState('blank')
  const [editingId, setEditingId] = useState<WorkspaceId | null>(null)
  const [editingName, setEditingName] = useState('')
  const customIds = config.custom.map((workspace) => workspace.id)
  const allIds = config.workspaces.map((workspace) => workspace.id)

  function submitCustom() {
    config.createCustom({ name, iconKey, accent, template })
    setName('')
    setIconKey('list')
    setAccent('#60a5fa')
    setTemplate('blank')
  }

  return (
    <div className={`workspace-manager workspace-manager-${variant}`}>
      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>Pinned Bottom Navigation</h3>
            <span>{config.pinnedMobile.length}/5 mobile buttons</span>
          </div>
          {config.warning ? <b>{config.warning}</b> : null}
        </div>
        <DraggableWorkspaceRows
          ids={config.pinnedMobile}
          workspaces={config.workspaces}
          onMove={config.movePinned}
          renderMeta={() => <span>Visible on mobile bottom nav</span>}
          renderAction={(workspace) => (
            <button type="button" className="workspace-row-action" onClick={() => config.togglePinned(workspace.id)} aria-label={`Unpin ${workspace.title}`}>
              <X size={15} />
            </button>
          )}
        />
      </section>

      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>All Workspaces</h3>
            <span>Pin mobile and show desktop sidebar items</span>
          </div>
        </div>
        <DraggableWorkspaceRows
          ids={allIds}
          workspaces={config.workspaces}
          onMove={config.moveOrder}
          renderMeta={(workspace) => (
            <span>
              {config.pinnedMobile.includes(workspace.id) ? 'Pinned mobile' : 'Menu only'} / {config.sidebarDesktop.includes(workspace.id) ? 'Desktop visible' : 'Desktop hidden'}
            </span>
          )}
          renderAction={(workspace) => {
            const pinned = config.pinnedMobile.includes(workspace.id)
            const disablePin = !pinned && config.pinnedMobile.length >= MAX_PINNED_MOBILE
            return (
              <div className="workspace-row-actions">
                {onSelectWorkspace ? (
                  <button
                    type="button"
                    className="workspace-row-action"
                    onClick={() => onSelectWorkspace(workspace.id)}
                    aria-label={`Open ${workspace.title}`}
                  >
                    <ArrowRight size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`workspace-row-action${pinned ? ' active' : ''}`}
                  onClick={() => config.togglePinned(workspace.id)}
                  disabled={disablePin}
                  aria-label={`${pinned ? 'Unpin' : 'Pin'} ${workspace.title}`}
                >
                  <Pin size={15} />
                </button>
                <button
                  type="button"
                  className={`workspace-row-action${config.sidebarDesktop.includes(workspace.id) ? ' active' : ''}`}
                  onClick={() => config.toggleSidebar(workspace.id)}
                  aria-label={`${config.sidebarDesktop.includes(workspace.id) ? 'Hide' : 'Show'} ${workspace.title} on desktop`}
                >
                  <Check size={15} />
                </button>
              </div>
            )
          }}
        />
      </section>

      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>Custom Workspaces</h3>
            <span>Create a local workspace</span>
          </div>
        </div>
        <div className="workspace-create-grid">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" aria-label="Workspace name" />
          <select value={iconKey} onChange={(event) => setIconKey(event.target.value as WorkspaceIconKey)} aria-label="Workspace icon">
            {CUSTOM_WORKSPACE_ICONS.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <input value={accent} onChange={(event) => setAccent(event.target.value)} type="color" aria-label="Workspace accent" />
          <select value={template} onChange={(event) => setTemplate(event.target.value)} aria-label="Workspace template">
            {CUSTOM_WORKSPACE_TEMPLATES.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <button type="button" className="workspace-create-button" onClick={submitCustom}>
            <Plus size={15} /> Add workspace
          </button>
        </div>
        {customIds.length ? (
          <div className="workspace-manager-list">
            {config.custom.map((workspace) => {
              const Icon = workspaceIconMap[workspace.iconKey] || workspaceIconMap.home
              const editing = editingId === workspace.id
              return (
                <div className="workspace-manager-row" key={workspace.id}>
                  <span className="workspace-custom-accent" style={{ background: workspace.accent || '#60a5fa' }} />
                  <Icon size={17} aria-hidden="true" />
                  <div className="workspace-manager-row-text">
                    {editing ? (
                      <input value={editingName} onChange={(event) => setEditingName(event.target.value)} aria-label={`Rename ${workspace.title}`} />
                    ) : (
                      <>
                        <strong>{workspace.title}</strong>
                        <span>{workspace.template || 'custom'} template</span>
                      </>
                    )}
                  </div>
                  <div className="workspace-row-actions">
                    {editing ? (
                      <button
                        type="button"
                        className="workspace-row-action active"
                        onClick={() => {
                          config.renameCustom(workspace.id, editingName)
                          setEditingId(null)
                        }}
                        aria-label={`Save ${workspace.title}`}
                      >
                        <Check size={15} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="workspace-row-action"
                        onClick={() => {
                          setEditingId(workspace.id)
                          setEditingName(workspace.title)
                        }}
                        aria-label={`Rename ${workspace.title}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button type="button" className="workspace-row-action danger" onClick={() => config.deleteCustom(workspace.id)} aria-label={`Delete ${workspace.title}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>Manage</h3>
            <span>Reset workspace order, visibility, pins, and custom workspaces</span>
          </div>
        </div>
        <button type="button" className="workspace-reset-button" onClick={config.reset}>
          <RotateCcw size={15} /> Reset to defaults
        </button>
      </section>
    </div>
  )
}
