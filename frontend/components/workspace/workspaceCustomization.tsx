'use client'

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
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
    if (!title) return null
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
    return id
  }

  function renameCustom(id: WorkspaceId, title: string) {
    const name = title.trim()
    if (!name) return
    persistCustom(custom.map((workspace) => (workspace.id === id ? { ...workspace, title: name } : workspace)))
  }

  function deleteCustom(id: WorkspaceId) {
    const nextCustom = custom.filter((workspace) => workspace.id !== id)
    const nextAll = [...WORKSPACE_REGISTRY, ...nextCustom]
    const nextOrder = normalizeOrder(order.filter((item) => item !== id), nextAll)
    const nextPinned = uniqueExisting(pinnedMobile.filter((item) => item !== id), nextAll).slice(0, MAX_PINNED_MOBILE)
    const nextSidebar = uniqueExisting(sidebarDesktop.filter((item) => item !== id), nextAll)
    persistCustom(nextCustom)
    setOrder(nextOrder)
    writeJson(WORKSPACE_ORDER_KEY, nextOrder)
    setPinnedMobile(nextPinned)
    writeJson(PINNED_MOBILE_KEY, nextPinned)
    setSidebarDesktop(nextSidebar)
    writeJson(SIDEBAR_DESKTOP_KEY, nextSidebar)
    setWarning('')
  }

  function removeWorkspace(id: WorkspaceId, surface: 'desktop' | 'mobile' | 'all' = 'all') {
    if (custom.some((workspace) => workspace.id === id)) {
      deleteCustom(id)
      return
    }
    if (surface !== 'mobile') persistSidebar(sidebarDesktop.filter((item) => item !== id))
    if (surface !== 'desktop') persistPinned(pinnedMobile.filter((item) => item !== id))
    setWarning('System workspace hidden. Reset to defaults restores system workspaces.')
  }

  function reset() {
    const all = [...WORKSPACE_REGISTRY, ...custom]
    const customIds = custom.map((workspace) => workspace.id)
    const orderedCustomIds = [
      ...order.filter((id) => customIds.includes(id)),
      ...customIds.filter((id) => !order.includes(id)),
    ]
    const sidebarCustomIds = sidebarDesktop.filter((id) => customIds.includes(id))
    const pinnedCustomIds = pinnedMobile.filter((id) => customIds.includes(id))
    const nextOrder = normalizeOrder([...DEFAULT_ORDER, ...orderedCustomIds], all)
    const nextSidebar = uniqueExisting([...DEFAULT_SIDEBAR_DESKTOP, ...sidebarCustomIds], all)
    const nextPinned = uniqueExisting([...DEFAULT_PINNED_MOBILE, ...pinnedCustomIds], all).slice(0, MAX_PINNED_MOBILE)
    setOrder(nextOrder)
    writeJson(WORKSPACE_ORDER_KEY, nextOrder)
    setSidebarDesktop(nextSidebar)
    writeJson(SIDEBAR_DESKTOP_KEY, nextSidebar)
    setPinnedMobile(nextPinned)
    writeJson(PINNED_MOBILE_KEY, nextPinned)
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
    removeWorkspace,
    reset,
    movePinned: (from: number, to: number) => persistPinned(moveItem(pinnedMobile, from, to)),
    moveSidebar: (from: number, to: number) => persistSidebar(moveItem(sidebarDesktop, from, to)),
    moveOrder: (from: number, to: number) => persistOrder(moveItem(workspaces.map((workspace) => workspace.id), from, to)),
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
  onClose,
}: {
  config: ReturnType<typeof useWorkspaceConfig>
  variant?: 'mobile' | 'desktop'
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
  onClose?: () => void
}) {
  const [name, setName] = useState('')
  const [iconKey, setIconKey] = useState<WorkspaceIconKey>('home')
  const [accent, setAccent] = useState('#60a5fa')
  const [template, setTemplate] = useState('blank')
  const [editingId, setEditingId] = useState<WorkspaceId | null>(null)
  const [editingName, setEditingName] = useState('')
  const [createdId, setCreatedId] = useState<WorkspaceId | null>(null)
  const customRowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const isDesktop = variant === 'desktop'
  const customIds = config.custom.map((workspace) => workspace.id)
  const allIds = config.workspaces.map((workspace) => workspace.id)

  useEffect(() => {
    if (!createdId) return
    const row = customRowRefs.current[createdId]
    if (!row) return
    row.scrollIntoView({ block: 'center', behavior: 'smooth' })
    row.focus({ preventScroll: true })
  }, [config.custom.length, createdId])

  function confirmRemoveWorkspace(workspace: WorkspaceDefinition, surface: 'desktop' | 'mobile' | 'all' = 'all') {
    const isCustom = config.custom.some((item) => item.id === workspace.id)
    const confirmed = window.confirm(
      isCustom
        ? `Delete custom workspace "${workspace.title}"? Its saved widget layout entries are left untouched.`
        : surface === 'desktop'
          ? `Hide "${workspace.title}" from desktop navigation? Reset to defaults will restore it.`
          : surface === 'mobile'
            ? `Remove "${workspace.title}" from mobile navigation? Reset to defaults will restore it if it is a default mobile workspace.`
            : `Hide "${workspace.title}" from visible navigation? Reset to defaults will restore system workspaces.`,
    )
    if (!confirmed) return
    config.removeWorkspace(workspace.id, surface)
    if (createdId === workspace.id) setCreatedId(null)
  }

  function submitCustom() {
    const createdId = config.createCustom({ name, iconKey, accent, template })
    if (!createdId) return
    setName('')
    setIconKey('home')
    setAccent('#60a5fa')
    setTemplate('blank')
    setCreatedId(createdId)
  }

  return (
    <div className={`workspace-manager workspace-manager-${variant}`}>
      {onClose ? (
        <div className="workspace-manager-exit">
          <button type="button" className="workspace-manager-cancel" onClick={onClose}>
            Cancel
          </button>
          <div className="workspace-manager-exit-actions">
            <button type="button" className="workspace-manager-done" onClick={onClose}>
              Done
            </button>
            <button type="button" className="workspace-manager-close" onClick={onClose} aria-label="Close workspace system">
              <X size={15} />
            </button>
          </div>
        </div>
      ) : null}

      {isDesktop ? (
        <section className="workspace-manager-section">
          <div className="workspace-manager-title">
            <div>
              <h3>Desktop Navigation</h3>
              <span>{config.sidebarDesktop.length} visible workspaces. No mobile pin limit.</span>
            </div>
          </div>
          <DraggableWorkspaceRows
            ids={config.sidebarDesktop}
            workspaces={config.workspaces}
            onMove={config.moveSidebar}
            renderMeta={(workspace) => <span>{workspace.description}</span>}
            renderAction={(workspace) => (
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
                  className="workspace-row-action danger"
                  onClick={() => confirmRemoveWorkspace(workspace, 'desktop')}
                  aria-label={`Remove ${workspace.title} from desktop navigation`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          />
        </section>
      ) : (
        <section className="workspace-manager-section">
          <div className="workspace-manager-title">
            <div>
              <h3>Mobile Navigation</h3>
              <span>{config.pinnedMobile.length}/5 pinned workspaces</span>
            </div>
            {config.warning ? <b>{config.warning}</b> : null}
          </div>
          <DraggableWorkspaceRows
            ids={config.pinnedMobile}
            workspaces={config.workspaces}
            onMove={config.movePinned}
            renderMeta={() => <span>Visible on mobile bottom nav</span>}
            renderAction={(workspace) => (
              <button
                type="button"
                className="workspace-row-action danger"
                onClick={() => confirmRemoveWorkspace(workspace, 'mobile')}
                aria-label={`Remove ${workspace.title} from mobile navigation`}
              >
                <Trash2 size={15} />
              </button>
            )}
          />
        </section>
      )}

      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>Workspace Catalog</h3>
            <span>{isDesktop ? 'Show or hide desktop navigation items' : 'Pin mobile and show desktop navigation items'}</span>
          </div>
        </div>
        <DraggableWorkspaceRows
          ids={allIds}
          workspaces={config.workspaces}
          onMove={config.moveOrder}
          renderMeta={(workspace) => (
            <span>
              {isDesktop
                ? config.sidebarDesktop.includes(workspace.id) ? 'Desktop visible' : 'Desktop hidden'
                : `${config.pinnedMobile.includes(workspace.id) ? 'Pinned mobile' : 'Menu only'} / ${config.sidebarDesktop.includes(workspace.id) ? 'Desktop visible' : 'Desktop hidden'}`}
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
                {!isDesktop ? (
                  <button
                    type="button"
                    className={`workspace-row-action${pinned ? ' active' : ''}`}
                    onClick={() => config.togglePinned(workspace.id)}
                    disabled={disablePin}
                    aria-label={`${pinned ? 'Unpin' : 'Pin'} ${workspace.title}`}
                  >
                    <Pin size={15} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`workspace-row-action${config.sidebarDesktop.includes(workspace.id) ? ' active' : ''}`}
                  onClick={() => config.toggleSidebar(workspace.id)}
                  aria-label={`${config.sidebarDesktop.includes(workspace.id) ? 'Hide' : 'Show'} ${workspace.title} on desktop navigation`}
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  className="workspace-row-action danger"
                  onClick={() => confirmRemoveWorkspace(workspace, 'all')}
                  aria-label={`Remove ${workspace.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )
          }}
        />
      </section>

      <section className="workspace-manager-section">
        <div className="workspace-manager-title">
          <div>
            <h3>Create Workspace</h3>
            <span>Create a local workspace with a seeded starting layout</span>
          </div>
        </div>
        <div className="workspace-create-grid">
          <label className="workspace-create-field workspace-create-name">
            <span>Workspace name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Workspace name" />
          </label>
          <label className="workspace-create-field">
            <span>Icon</span>
            <select value={iconKey} onChange={(event) => setIconKey(event.target.value as WorkspaceIconKey)}>
              {CUSTOM_WORKSPACE_ICONS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="workspace-create-field workspace-color-field">
            <span>Accent</span>
            <input value={accent} onChange={(event) => setAccent(event.target.value)} type="color" />
          </label>
          <label className="workspace-create-field workspace-template-field">
            <span>Starting layout</span>
            <select value={template} onChange={(event) => setTemplate(event.target.value)}>
              {CUSTOM_WORKSPACE_TEMPLATES.map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="workspace-create-button" onClick={submitCustom}>
            <Plus size={15} /> Create workspace
          </button>
        </div>
        {customIds.length ? (
          <div className="workspace-manager-list">
            {config.custom.map((workspace) => {
              const Icon = workspaceIconMap[workspace.iconKey] || workspaceIconMap.home
              const editing = editingId === workspace.id
              return (
                <div
                  className="workspace-manager-row"
                  key={workspace.id}
                  ref={(node) => {
                    customRowRefs.current[workspace.id] = node
                  }}
                  tabIndex={createdId === workspace.id ? -1 : undefined}
                >
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
                    <button type="button" className="workspace-row-action danger" onClick={() => confirmRemoveWorkspace(workspace, 'all')} aria-label={`Delete ${workspace.title}`}>
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
            <h3>System Maintenance</h3>
            <span>Restore system defaults while preserving custom workspaces</span>
          </div>
        </div>
        <button type="button" className="workspace-reset-button" onClick={config.reset}>
          <RotateCcw size={15} /> Reset to defaults
        </button>
      </section>
    </div>
  )
}
