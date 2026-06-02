'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Gauge,
  Globe2,
  GripVertical,
  Home,
  Info,
  Menu,
  MoreVertical,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import SettingsPage from '../settings/SettingsWorkspace'
import MobileReorderableSections from '../dashboard/MobileReorderableSections'
import StockIntelligenceShell from '../intelligence/StockIntelligenceShell'
import ReorderList from './ReorderList'
import {
  WorkspaceShell,
  getWorkspaceDefinition,
  useWorkspaceConfig,
} from '../workspace'
import { workspaceIconMap } from '../workspace/WorkspaceSwitcher'
import {
  DEFAULT_MOBILE_HOME_ORDER,
  MOBILE_HOME_LAYOUT_KEY,
} from '../dashboard/widgetRegistry'
import { usePersistedLayout } from '../dashboard/usePersistedLayout'
import type { MobileHomeSectionId } from '../dashboard/types'
import { API, fetchJson, mask, money, pct as formatPct, safeMessage } from '../../lib/pia-api'
import {
  buildWatchlistUniverse,
  resolveWatchlistRows,
  useCustomWatchlists,
} from '../watchlists/customWatchlists'

type RailItem = Record<string, any>
type Tone = 'good' | 'bad' | 'neutral'

const pct = formatPct
const compactVolume = (value: any) => {
  const n = Number(value || 0)
  if (!Number.isFinite(n) || n <= 0) return '-'
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.round(n))
}

const marketFallback = [
  { name: 'S&P 500', value: '6,241.80', chg: 0.42, spark: [24, 28, 27, 32, 35, 34, 39] },
  { name: 'Nasdaq', value: '21,108.60', chg: 0.68, spark: [18, 24, 21, 30, 33, 36, 41] },
  { name: 'VIX', value: '14.2', chg: -2.1, spark: [44, 38, 36, 32, 29, 27, 24] },
  { name: 'EUR/USD', value: '1.089', chg: 0.12, spark: [24, 26, 25, 27, 29, 28, 30] },
]

const positionFallback = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    last: 126.8,
    day_change_pct: 1.84,
    quantity: 190,
    avg_price: 84.2,
    market_value: 24120,
    day_pnl: 436,
    unrealized: 8090,
    unrealized_pct: 50.4,
    portfolio_pct: 18.4,
    risk: 72,
    momentum: 78,
    macro_sensitivity: 62,
    news_count: 4,
    spark: [31, 34, 32, 41, 46, 43, 51],
    ai_view: 'AI infrastructure demand remains the core upside driver, with position sizing kept under the high-risk cap.',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft',
    last: 451.2,
    day_change_pct: 0.46,
    quantity: 42,
    avg_price: 388.5,
    market_value: 18940,
    day_pnl: 86,
    unrealized: 2633,
    unrealized_pct: 16.1,
    portfolio_pct: 14.5,
    risk: 38,
    momentum: 57,
    macro_sensitivity: 41,
    news_count: 2,
    spark: [35, 36, 39, 38, 42, 44, 45],
    ai_view: 'Quality compounder profile with balanced cloud, AI, and enterprise durability.',
  },
  {
    symbol: 'SPY',
    name: 'S&P 500 ETF',
    last: 624.1,
    day_change_pct: -0.18,
    quantity: 24,
    avg_price: 571.0,
    market_value: 15110,
    day_pnl: -27,
    unrealized: 1274,
    unrealized_pct: 9.3,
    portfolio_pct: 11.6,
    risk: 29,
    momentum: 48,
    macro_sensitivity: 33,
    spark: [40, 41, 39, 38, 40, 37, 36],
    ai_view: 'Core market beta sleeve. Use as liquidity buffer before adding single-name exposure.',
  },
]

const scannerFallback = [
  {
    ticker: 'AMD',
    label: 'Watch',
    setup: 'Semiconductor pullback into support',
    price: 162.34,
    entry_zone: '158-164',
    stop: '151',
    score: 76,
    spark: [22, 21, 24, 28, 27, 31, 35],
    portfolio_impact: 'Adds cyclical AI beta; keep below current NVDA exposure.',
  },
  {
    ticker: 'GOOGL',
    label: 'Review',
    setup: 'AI search monetization rerating',
    price: 178.42,
    entry_zone: '174-180',
    stop: '169',
    score: 68,
    spark: [29, 32, 31, 36, 34, 39, 42],
    portfolio_impact: 'Improves mega-cap diversification with lower portfolio risk.',
  },
]

function useMobileDashboard() {
  const [dashboard, setDashboard] = useState<any>(null)

  const refresh = useCallback(async () => {
    const response = await fetch(`${API}/dashboard`)
    const data = await response.json()
    setDashboard(data)
    return data
  }, [])

  useEffect(() => {
    refresh().catch(() => {})

    let socket: WebSocket | undefined
    try {
      socket = new WebSocket('ws://127.0.0.1:8000/ws')
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'dashboard_update') setDashboard(payload)
        } catch {}
      }
    } catch {}

    return () => socket?.close()
  }, [refresh])

  return { dashboard, refresh }
}

function riskTone(value: number) {
  if (value >= 70) return 'bad'
  if (value >= 45) return 'warn'
  return 'good'
}

function Sparkline({ values, tone = 'good' }: { values?: number[]; tone?: Tone }) {
  const data = values?.length ? values : [28, 31, 29, 35, 33, 38, 42]
  const min = Math.min(...data)
  const max = Math.max(...data)
  const points = data
    .map((value, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 132
      const y = 48 - ((value - min) / Math.max(max - min, 1)) * 34
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = tone === 'bad' ? '#ff6375' : tone === 'neutral' ? '#60a5fa' : '#24d18c'

  return (
    <svg className="mobile-sparkline" viewBox="0 0 132 54" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" x2="132" y1="48" y2="48" stroke="rgba(148,163,184,.16)" />
    </svg>
  )
}

function ProgressDots({ count, active }: { count: number; active: number }) {
  if (count <= 1) return null
  return (
    <div className="mobile-rail-dots" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <span key={index} className={index === active ? 'active' : ''} />
      ))}
    </div>
  )
}

function SwipeRail({
  title,
  icon,
  items,
  render,
  className = '',
  hideHeader = false,
}: {
  title: string
  icon?: ReactNode
  items: RailItem[]
  render: (item: RailItem, index: number) => ReactNode
  className?: string
  hideHeader?: boolean
}) {
  const [active, setActive] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const isDraggingRef = useRef(false)
  const railRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, y: 0, scrollLeft: 0 })

  useEffect(() => {
    setActive((value) => Math.min(value, Math.max(items.length - 1, 0)))
  }, [items.length])

  function updateActive() {
    const node = railRef.current
    if (!node) return
    const slides = Array.from(node.children) as HTMLElement[]
    const next = slides.reduce(
      (closest, slide, index) => {
        const distance = Math.abs(slide.offsetLeft - node.scrollLeft)
        return distance < closest.distance ? { index, distance } : closest
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index
    setActive(Math.max(0, Math.min(items.length - 1, next)))
  }

  function scrollToSlide(index: number) {
    const node = railRef.current
    if (!node) return
    const next = Math.max(0, Math.min(items.length - 1, index))
    const slide = node.children.item(next) as HTMLElement | null
    node.scrollTo({ left: slide?.offsetLeft ?? 0, behavior: 'smooth' })
    setActive(next)
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const node = railRef.current
    if (!node) return
    dragStartRef.current = { x: event.clientX, y: event.clientY, scrollLeft: node.scrollLeft }
    isDraggingRef.current = true
    setIsDragging(true)
    // Touch uses native pan-x scroll — no capture needed (capture would fight the browser's native gesture)
    if (event.pointerType !== 'touch') {
      node.setPointerCapture?.(event.pointerId)
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const node = railRef.current
    if (!node || !isDraggingRef.current) return
    const deltaX = event.clientX - dragStartRef.current.x
    const deltaY = event.clientY - dragStartRef.current.y
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      node.scrollLeft = dragStartRef.current.scrollLeft - deltaX
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const node = railRef.current
    if (!node || !isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    node.releasePointerCapture?.(event.pointerId)
    // pointercancel = browser took over native scroll; scroll-snap handles snapping — don't interrupt it
    if (event.type === 'pointercancel') return
    const slides = Array.from(node.children) as HTMLElement[]
    const closest = slides.reduce(
      (current, slide, index) => {
        const distance = Math.abs(slide.offsetLeft - node.scrollLeft)
        return distance < current.distance ? { index, distance } : current
      },
      { index: 0, distance: Number.POSITIVE_INFINITY },
    ).index
    scrollToSlide(closest)
  }

  return (
    <section className={`mobile-section ${className}`.trim()}>
      {!hideHeader && (
        <div className="mobile-section-title">
          <h2>{title}</h2>
          <div className="mobile-section-tools">
            {icon}
            {items.length > 1 ? (
              <div className="mobile-rail-controls" aria-label={`${title} navigation`}>
                <button
                  type="button"
                  className="mobile-rail-button"
                  onClick={() => scrollToSlide(active - 1)}
                  disabled={active === 0}
                  aria-label={`Previous ${title} item`}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  className="mobile-rail-button"
                  onClick={() => scrollToSlide(active + 1)}
                  disabled={active >= items.length - 1}
                  aria-label={`Next ${title} item`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
      <div
        className={`mobile-swipe-rail ${isDragging ? 'is-dragging' : ''}`.trim()}
        ref={railRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onScroll={updateActive}
      >
        {items.map((item, index) => (
          <div className="mobile-swipe-slide" key={`${item.symbol || item.ticker || item.name || item.title || 'item'}-${index}`}>
            {render(item, index)}
          </div>
        ))}
      </div>
      <ProgressDots count={items.length} active={active} />
    </section>
  )
}

function RiskMeter({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <div className={`mobile-risk-meter ${riskTone(bounded)}`}>
      <span style={{ width: `${bounded}%` }} />
    </div>
  )
}

function ExposureGauge({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <div className="mobile-exposure-gauge" style={{ '--exposure-value': `${bounded * 3.6}deg` } as CSSProperties}>
      <b>{pct(bounded)}</b>
      <span>exposure</span>
    </div>
  )
}

function MomentumBar({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value))
  return (
    <div className="mobile-momentum">
      <span>Momentum</span>
      <i>
        <em style={{ width: `${bounded}%` }} />
      </i>
      <b>{bounded}</b>
    </div>
  )
}

function riskLevel(value: number): { label: string; tone: string } {
  if (value >= 70) return { label: 'High', tone: 'bad' }
  if (value >= 50) return { label: 'Elevated', tone: 'elevated' }
  if (value >= 30) return { label: 'Medium', tone: 'medium' }
  return { label: 'Low', tone: 'low' }
}

function RiskBar({ value }: { value: number }) {
  const bounded = Math.max(0, Math.min(100, value))
  const { label, tone } = riskLevel(bounded)
  return (
    <div className="mobile-momentum">
      <span>Risk</span>
      <i>
        <em className={`risk-${tone}`} style={{ width: `${bounded}%` }} />
      </i>
      <b className={`risk-label-${tone}`}>{label}</b>
    </div>
  )
}

function MobileBottomNav({
  active,
  setActive,
  workspaces,
  pinnedIds,
}: {
  active: string
  setActive: (value: string) => void
  workspaces: ReturnType<typeof useWorkspaceConfig>['workspaces']
  pinnedIds: string[]
}) {
  const items = pinnedIds.map((id) => getWorkspaceDefinition(workspaces, id))
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile sections">
      {items.map((workspace) => {
        const Icon = workspaceIconMap[workspace.iconKey] || Home
        return (
        <button key={workspace.id} className={active === workspace.id ? 'active' : ''} onClick={() => setActive(workspace.id)}>
          <Icon size={20} />
          <span>{workspace.title}</span>
        </button>
        )
      })}
    </nav>
  )
}

function mobileStatusLabel(status: any) {
  if (!status) return 'Standby'
  if (status.status === 'healthy' || status.data_received) return 'Live'
  if (status.status === 'connected_no_data' || status.ok) return 'Ready'
  if (status.status === 'failed') return 'Degraded'
  return 'Standby'
}

function MobileStatusDock({ health, hidden }: { health: any[]; hidden: boolean }) {
  const bySource = (name: string) => health.find((item: any) => item.source === name)
  const rows = [
    { name: 'IBKR', icon: Wallet, status: bySource('IBKR') },
    { name: 'Yahoo', icon: Globe2, status: bySource('Yahoo Finance') },
    { name: 'Feeds', icon: Database, status: bySource('RSS') },
  ]

  return (
    <section className="mobile-status-dock" aria-label="Connection status">
      <div className="mobile-status-dock-head">
        <ShieldCheck size={16} />
        <span>{hidden ? 'Status' : 'Connection Status'}</span>
      </div>
      <div className="mobile-status-dock-grid">
        {rows.map(({ name, icon: Icon, status }) => {
          const label = hidden ? 'Status' : mobileStatusLabel(status)
          return (
            <div className={`mobile-status-source ${String(label).toLowerCase()}`} key={name}>
              <Icon size={15} />
              <span>{hidden ? 'Source' : name}</span>
              <b>{label}</b>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SearchCommand({ onQuickControls }: { onQuickControls: () => void }) {
  return (
    <div className="mobile-search">
      <Search size={18} />
      <input placeholder="Ask PIA or search ticker..." aria-label="Ask PIA or search ticker" />
      <button type="button" aria-label="Open quick controls" onClick={onQuickControls}>
        <SlidersHorizontal size={18} />
      </button>
    </div>
  )
}

function MobileSheet({
  title,
  onClose,
  children,
  closeOnOverlay = true,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  closeOnOverlay?: boolean
}) {
  return (
    <div className="mobile-sheet-root" role="presentation">
      <button
        type="button"
        className="mobile-sheet-overlay"
        aria-label={closeOnOverlay ? 'Close panel' : 'Panel backdrop'}
        onClick={closeOnOverlay ? onClose : undefined}
        tabIndex={closeOnOverlay ? 0 : -1}
      />
      <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header className="mobile-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="mobile-sheet-close" onClick={onClose} aria-label="Close panel">
            <X size={20} />
          </button>
        </header>
        <div className="mobile-sheet-body">{children}</div>
      </section>
    </div>
  )
}

function buildNotificationItems(portfolio: any) {
  const fallback = [
    {
      id: 'demo-risk-review',
      title: 'Risk review ready',
      text: 'Portfolio guardrails are standing by. Review concentration and cash buffer before new entries.',
      level: 'warn',
      time: 'Now',
      category: 'Risk',
    },
    {
      id: 'demo-scanner-online',
      title: 'Scanner watchlist refreshed',
      text: 'Opportunity board has fallback setups available while live backend data is unavailable.',
      level: 'good',
      time: 'Today',
      category: 'Scanner',
    },
    {
      id: 'demo-privacy-mode',
      title: 'Privacy mode preserved',
      text: 'Use quick controls to mask portfolio values across the mobile command surface.',
      level: 'neutral',
      time: 'System',
      category: 'System',
    },
  ]
  const items: { id: string; title: string; text: string; level: string; time: string; category: string }[] = []
  for (const alert of portfolio.guardrails || []) {
    items.push({
      id: `guardrail-${alert.title}`,
      title: alert.title,
      text: alert.text,
      level: alert.level || 'warn',
      time: 'Now',
      category: 'Risk',
    })
  }
  for (const action of portfolio.today_actions || []) {
    items.push({
      id: `action-${action.title}`,
      title: action.title,
      text: action.text,
      level: 'good',
      time: 'Today',
      category: 'Brief',
    })
  }
  return items.length ? items : fallback
}

function MobileNotificationCenter({
  open,
  onClose,
  portfolio,
}: {
  open: boolean
  onClose: () => void
  portfolio: any
}) {
  if (!open) return null
  const items = buildNotificationItems(portfolio)
  return (
    <MobileSheet title="Notifications" onClose={onClose}>
      {items.length ? (
        <div className="mobile-notification-list">
          {items.map((item) => (
            <article className="mobile-notification-item" key={item.id}>
              <div className="mobile-notification-top">
                <div>
                  <span className="mobile-notification-category">{item.category}</span>
                  <strong>{item.title}</strong>
                </div>
                <span className="mobile-notification-time">{item.time}</span>
              </div>
              <p>{item.text}</p>
              <IntelligenceBadge
                label={item.level === 'danger' ? 'Action required' : item.level === 'good' ? 'Update' : item.level === 'neutral' ? 'Info' : 'Monitor'}
                tone={item.level === 'danger' ? 'bad' : item.level === 'good' ? 'good' : item.level === 'neutral' ? 'neutral' : 'warn'}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="mobile-notification-empty">
          <Bell size={22} />
          <strong>All clear</strong>
          <p>No active guardrails or decision brief items from the current portfolio scan.</p>
        </div>
      )}
    </MobileSheet>
  )
}

function MobileQuickControls({
  open,
  onClose,
  hidden,
  onHiddenChange,
  onRescan,
  rescanning,
  rescanStatus,
  onOpenSettings,
}: {
  open: boolean
  onClose: () => void
  hidden: boolean
  onHiddenChange: (value: boolean) => void
  onRescan: () => void
  rescanning: boolean
  rescanStatus: string
  onOpenSettings: () => void
}) {
  if (!open) return null
  return (
    <MobileSheet title="Quick Controls" onClose={onClose}>
      <div className="mobile-controls-list">
        <button type="button" className="mobile-control-row" onClick={() => onHiddenChange(!hidden)}>
          {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          <div>
            <strong>{hidden ? 'Show amounts' : 'Hide amounts'}</strong>
            <span>Privacy mode for portfolio values</span>
          </div>
        </button>
        <button type="button" className="mobile-control-row" onClick={onRescan} disabled={rescanning}>
          <RefreshCw size={18} />
          <div>
            <strong>{rescanning ? 'Rescanning…' : 'Rescan opportunity board'}</strong>
            <span>Refresh scanner signals from backend</span>
          </div>
        </button>
        <button
          type="button"
          className="mobile-control-row"
          onClick={() => {
            onOpenSettings()
            onClose()
          }}
        >
          <Settings size={18} />
          <div>
            <strong>Open settings</strong>
            <span>Integrations, holdings, health, and system</span>
          </div>
        </button>
      </div>
      {rescanStatus ? <p className="muted mobile-control-status">{rescanStatus}</p> : null}
    </MobileSheet>
  )
}

function MobileAboutSection({ hidden = false }: { hidden?: boolean }) {
  const [about, setAbout] = useState<any>(null)

  useEffect(() => {
    fetchJson('/about').then(setAbout).catch(() => {})
  }, [])

  const changelog = Array.isArray(about?.changelog) ? about.changelog.slice(0, 4) : []

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <div>
          <h2>{hidden ? 'Info' : `PIA ${about?.version || ''}`.trim()}</h2>
          <span>{hidden ? 'Release and platform status' : about?.tagline || 'Release center and platform status'}</span>
        </div>
        <BookOpen size={18} />
      </div>
      <div className="mobile-brief">
        {changelog.length ? (
          changelog.map((item: any) => (
            <article className="mobile-brief-card" key={item.version || item.title}>
              <strong>{hidden ? 'Workspace update' : `${item.version} - ${item.title}`}</strong>
              {!hidden && Array.isArray(item.features) ? <p>{item.features.slice(0, 3).join(' ')}</p> : <p>{mask}</p>}
            </article>
          ))
        ) : (
          <article className="mobile-brief-card">
            <strong>{hidden ? 'Workspace update' : 'Release Center'}</strong>
            <p>{hidden ? mask : 'Release data is loading or the backend is offline.'}</p>
          </article>
        )}
      </div>
    </section>
  )
}

const MOCK_SEARCH_TICKERS = [
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'AMD', name: 'Advanced Micro Devices' },
  { symbol: 'SOFI', name: 'SoFi Technologies' },
  { symbol: 'IREN', name: 'Iris Energy' },
  { symbol: 'AVAV', name: 'AeroVironment' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'CRWV', name: 'CoreWeave' },
  { symbol: 'NBIS', name: 'Nebius Group' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'MELI', name: 'MercadoLibre' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'PLTR', name: 'Palantir' },
  { symbol: 'COIN', name: 'Coinbase' },
  { symbol: 'SMCI', name: 'Super Micro Computer' },
  { symbol: 'MU', name: 'Micron Technology' },
  { symbol: 'ARM', name: 'Arm Holdings' },
]

function GlobalStockSearch({ universe, hidden, onSelect, onClose }: {
  universe: any[]
  hidden: boolean
  onSelect: (symbol: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toUpperCase()
  const results = (query
    ? universe.filter((u) => u.symbol.includes(query) || String(u.name || '').toUpperCase().includes(query))
    : universe
  ).slice(0, 8)
  const exact = universe.some((u) => u.symbol === query)

  function onEnter() {
    if (!query) return
    if (results.length) onSelect(results[0].symbol)
    else onSelect(query)
  }

  return (
    <MobileSheet title="Search" onClose={onClose}>
      <div className="global-search-input">
        <Search size={16} />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
          placeholder="Search stocks, ETFs, options…"
          aria-label="Search stocks"
        />
        {q ? (
          <button type="button" aria-label="Clear search" onClick={() => setQ('')}>
            <X size={15} />
          </button>
        ) : null}
      </div>
      <div className="global-search-results">
        {results.map((r) => {
          const chg = Number(r.change ?? 0)
          return (
            <button key={r.symbol} type="button" className="global-search-result" onClick={() => onSelect(r.symbol)}>
              <div className="gsr-logo" style={{ background: r.accent || '#60a5fa' }}>{r.symbol.slice(0, 2)}</div>
              <div className="gsr-main">
                <strong>{r.symbol}</strong>
                <span>{r.name || '—'}</span>
              </div>
              {r.last != null ? (
                <div className="gsr-price">
                  <b>{hidden ? mask : money(r.last)}</b>
                  {r.change != null ? <small className={chg >= 0 ? 'green' : 'red'}>{hidden ? '' : pct(chg)}</small> : null}
                </div>
              ) : null}
              <span className={`gsr-source gsr-source-${String(r.source).toLowerCase()}`}>{r.source}</span>
            </button>
          )
        })}
        {query && !exact ? (
          <button type="button" className="global-search-result gsr-analyze" onClick={() => onSelect(query)}>
            <div className="gsr-logo gsr-logo-analyze">{query.slice(0, 2)}</div>
            <div className="gsr-main">
              <strong>Analyze {query}</strong>
              <span>Open Stock Intelligence</span>
            </div>
            <span className="gsr-source gsr-source-pia">PIA</span>
          </button>
        ) : null}
      </div>
    </MobileSheet>
  )
}

function MarketPulse({ items, hidden = false }: { items: any[]; hidden?: boolean }) {
  const rows = (items.length ? items : marketFallback).map((item: any, index: number) => ({
    ...item,
    spark: item.spark || marketFallback[index % marketFallback.length].spark,
  }))

  return (
    <SwipeRail
      title="Market Pulse"
      icon={<BarChart3 size={18} />}
      items={rows}
      render={(item: any) => {
        const tone: Tone = Number(item.chg) < 0 ? 'bad' : Number(item.chg) === 0 ? 'neutral' : 'good'
        return (
          <article className="mobile-visual-card mobile-market-card">
            <div className="mobile-card-head">
              <div>
                <span>{item.name}</span>
                <strong>{hidden ? mask : item.value}</strong>
              </div>
              <IntelligenceBadge label={hidden ? mask : pct(item.chg)} tone={tone} />
            </div>
            <Sparkline values={item.spark} tone={tone} />
          </article>
        )
      }}
    />
  )
}

function PortfolioInsights({ portfolio, positions, hidden }: { portfolio: any; positions: any[]; hidden?: boolean }) {
  const top = positions[0] || positionFallback[0]
  const insights = [
    {
      title: 'Net Worth',
      value: hidden ? mask : money(portfolio.total_value || 58170),
      text: hidden ? mask : `${money(portfolio.daily_pnl || 420)} today`,
      type: 'spark',
    },
    {
      title: 'Exposure Leader',
      value: hidden ? '—' : top.symbol,
      text: hidden ? mask : `${pct(top.portfolio_pct)} of portfolio`,
      type: 'exposure',
      exposure: top.portfolio_pct || 18,
    },
    {
      title: 'Risk Posture',
      value: portfolio.risk_mode || 'Balanced',
      text: 'Guardrails active',
      type: 'risk',
      risk: Math.max(...positions.map((item: any) => Number(item.risk || 0)), 31),
    },
  ]

  return (
    <SwipeRail
      title="Portfolio Insights"
      icon={<ShieldCheck size={18} />}
      items={insights}
      render={(item: any) => (
        <article className="mobile-visual-card mobile-insight-card">
          <span>{item.title}</span>
          <strong>{item.value}</strong>
          <small>{item.text}</small>
          {item.type === 'spark' && <Sparkline tone="good" />}
          {item.type === 'exposure' && <ExposureGauge value={item.exposure} />}
          {item.type === 'risk' && (
            <div className="mobile-risk-block">
              <Gauge size={18} />
              <RiskMeter value={item.risk} />
              <b>{item.risk}</b>
            </div>
          )}
        </article>
      )}
    />
  )
}

function UrgentAlerts({ portfolio }: { portfolio: any }) {
  const alerts = portfolio.guardrails?.length
    ? portfolio.guardrails
    : [
        { title: 'NVDA concentration near cap', text: 'Trim or hedge if it closes above the risk threshold.', level: 'warn' },
        { title: 'Fed minutes today', text: 'Avoid oversized entries before the macro release.', level: 'warn' },
        { title: 'Cash buffer healthy', text: 'Buying power is available for scanner setups that pass risk checks.', level: 'good' },
      ]

  return (
    <SwipeRail
      title="Alerts"
      icon={<Bell size={18} />}
      items={alerts.slice(0, 5)}
      render={(alert: any) => (
        <article className="mobile-visual-card mobile-alert-card">
          <AlertTriangle size={20} className={alert.level === 'danger' ? 'red' : 'green'} />
          <div>
            <strong>{alert.title}</strong>
            <p>{alert.text}</p>
          </div>
          <span className="mobile-status-badge">{alert.level === 'danger' ? 'Action' : 'Monitor'}</span>
        </article>
      )}
    />
  )
}

function DailyBrief({ portfolio }: { portfolio: any }) {
  const actions = portfolio.today_actions?.length
    ? portfolio.today_actions
    : [
        { title: 'Protect gains first', text: 'Keep new exposure small while the portfolio is up on the day.' },
        { title: 'Prioritize liquid names', text: 'Scanner ideas should clear risk and liquidity filters before action.' },
      ]

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Daily Brief</h2>
        <ShieldCheck size={18} />
      </div>
      <div className="mobile-brief">
        {actions.slice(0, 3).map((action: any) => (
          <article className="mobile-brief-card" key={action.title}>
            <strong>{action.title}</strong>
            <p>{action.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function ScannerSetups({ scanner, onSelect, hidden = false }: { scanner: any[]; onSelect: (position: any) => void; hidden?: boolean }) {
  const rows = scanner.length ? scanner : scannerFallback
  return (
    <SwipeRail
      title="Scanner Setups"
      icon={<Sparkles size={18} />}
      items={rows.slice(0, 5)}
      render={(item: any) => (
        <button className="mobile-visual-card mobile-setup-card" onClick={() => onSelect({ symbol: item.ticker, ...item })}>
          <div className="mobile-card-head">
            <div>
              <span>{item.label || 'Setup'}</span>
              <strong>{item.ticker}</strong>
            </div>
            <b>{hidden ? mask : money(item.price)}</b>
          </div>
          <Sparkline values={item.spark} tone="good" />
          <p>{hidden ? mask : item.setup}</p>
          <div className="mobile-setup-footer">
            <span>{hidden ? mask : `Entry ${item.entry_zone || 'Review'}`}</span>
            <IntelligenceBadge label={hidden ? mask : `${item.score || 64} score`} tone="good" />
          </div>
        </button>
      )}
    />
  )
}

function WatchlistMovers({ scanner, positions, onSelect, hidden = false }: { scanner: any[]; positions: any[]; onSelect: (position: any) => void; hidden?: boolean }) {
  const movers = [...positions.slice(0, 2), ...scanner.slice(0, 3)].map((item: any, index: number) => ({
    symbol: item.symbol || item.ticker,
    name: item.name || item.setup || 'Watchlist mover',
    price: item.last || item.price || item.market_value,
    change: item.day_change_pct || item.change_pct || (index % 2 ? -0.42 : 1.12),
    risk: item.risk || 42,
    spark: item.spark,
    ...item,
  }))

  return (
    <SwipeRail
      title="Watchlist Movers"
      icon={<ChevronRight size={18} />}
      items={movers.length ? movers : positionFallback}
      render={(item: any) => (
        <button className="mobile-visual-card mobile-mover-card" onClick={() => onSelect(item)}>
          <div className="mobile-card-head">
            <div>
              <span>{item.name}</span>
              <strong>{item.symbol}</strong>
            </div>
            <div className="mobile-price-stack">
              <b>{hidden ? mask : money(item.price)}</b>
              <small className={Number(item.change) >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(item.change)}</small>
            </div>
          </div>
          <Sparkline values={item.spark} tone={Number(item.change) >= 0 ? 'good' : 'bad'} />
          {hidden ? <span className="muted">{mask}</span> : <RiskMeter value={Number(item.risk || 0)} />}
        </button>
      )}
    />
  )
}

function PositionCards({ rows, onSelect, hidden = false, fields, order, tf }: { rows: any[]; onSelect: (position: any) => void; hidden?: boolean; fields: Set<CardFieldKey>; order: CardFieldKey[]; tf: SparkTf }) {
  const positions = rows.length ? rows : positionFallback
  const show = (key: CardFieldKey) => fields.has(key)
  const gridOrder = order.filter((k) => CARD_GRID_FIELDS.includes(k) && show(k))
  return (
    <SwipeRail
      title="Positions"
      icon={<BriefcaseBusiness size={18} />}
      items={positions}
      className="mobile-position-rail"
      hideHeader
      render={(position: any) => {
        const risk = Number(position.risk || 0)
        const momentum = Number(position.momentum_score || position.momentum || 52)
        const change = Number(position.day_change_pct || position.change_pct || 0)
        const shares = Number(position.quantity ?? position.qty ?? 0)
        const last = Number(position.last || position.price || 0)
        const avgCost = Number(position.avg_price ?? position.avg_cost ?? 0)
        const marketValue = Number(position.market_value ?? last * shares)
        const dayPnl = Number(position.day_pnl ?? position.day_change ?? 0)
        const unreal = Number(position.unrealized || 0)
        const unrealPct = Number(
          position.unrealized_pct != null ? position.unrealized_pct : avgCost > 0 ? ((last - avgCost) / avgCost) * 100 : 0,
        )
        const macro = position.macro_sensitivity
        const newsCount = Number(position.news_count ?? position.news ?? position.news_score ?? 0)
        const hasAi = Boolean(position.ai_view || position.ai_score != null)
        const brandColor = position.brand || position.accent || undefined
        const signed = (value: number, format: (n: number) => string) => `${value >= 0 ? '+' : ''}${format(value)}`
        const showBars = show('risk') || show('momentum')
        const showChips = (show('news') && newsCount > 0) || (show('macro') && macro != null) || (show('ai') && hasAi)
        const showBottom = show('weight') || showChips
        return (
          <button
            className={`mobile-visual-card mobile-position-card${brandColor ? ' themed' : ''}`}
            onClick={() => onSelect(position)}
            style={brandColor ? { borderTopColor: brandColor } as CSSProperties : undefined}
          >
            {/* Header — ticker, company, daily % */}
            <div className="mobile-card-head">
              <div>
                <span>{position.name || 'Portfolio holding'}</span>
                <strong>{position.symbol}</strong>
              </div>
              <IntelligenceBadge label={pct(change)} tone={change >= 0 ? 'good' : 'bad'} />
            </div>

            {show('sparkline') && (
              <div className="mobile-position-spark">
                <Sparkline values={resolveSpark(position, tf)} tone={change >= 0 ? 'good' : 'bad'} />
                <span className="mobile-spark-tf">{tf}</span>
              </div>
            )}

            {/* Position summary, price, performance — rendered in user order */}
            {gridOrder.length > 0 && (
              <div className="mobile-position-stats">
                {gridOrder.map((k) => {
                  switch (k) {
                    case 'shares': return <div key={k} className="mps-cell"><span>Shares</span><b>{hidden ? mask : shares.toLocaleString('en-US')}</b></div>
                    case 'mktvalue': return <div key={k} className="mps-cell"><span>Mkt Value</span><b>{hidden ? mask : money(marketValue)}</b></div>
                    case 'last': return <div key={k} className="mps-cell"><span>Last</span><b>{hidden ? mask : money(last)}</b></div>
                    case 'avgcost': return <div key={k} className="mps-cell"><span>Avg Cost</span><b>{hidden ? mask : money(avgCost)}</b></div>
                    case 'daypnl': return (
                      <div key={k} className="mps-cell">
                        <span>Today P&amp;L</span>
                        <b className={dayPnl >= 0 ? 'green' : 'red'}>{hidden ? mask : `${signed(dayPnl, money)} (${signed(change, (n) => `${n.toFixed(2)}%`)})`}</b>
                      </div>
                    )
                    case 'unrealized': return (
                      <div key={k} className="mps-cell">
                        <span>Unrealized</span>
                        <b className={unreal >= 0 ? 'green' : 'red'}>{hidden ? mask : `${signed(unreal, money)} (${signed(unrealPct, (n) => `${n.toFixed(1)}%`)})`}</b>
                      </div>
                    )
                    default: return null
                  }
                })}
              </div>
            )}

            {/* Intelligence bars — risk & momentum (visible in privacy mode) */}
            {showBars && (
              <div className="mps-bars">
                {show('risk') && <RiskBar value={risk || 31} />}
                {show('momentum') && <MomentumBar value={momentum} />}
              </div>
            )}

            {/* Bottom info row — exposure mini visual + macro / AI / news */}
            {showBottom && (
              <div className="mobile-position-bottom">
                {show('weight') ? (
                  hidden ? (
                    <div className="mobile-exposure-gauge" style={{ '--exposure-value': '0deg' } as CSSProperties}>
                      <b>••</b>
                      <span>exposure</span>
                    </div>
                  ) : (
                    <ExposureGauge value={Number(position.portfolio_pct || 0)} />
                  )
                ) : <span />}
                {showChips && (
                  <div className="mps-chips">
                    {show('news') && newsCount > 0 ? <span className="mps-chip"><Newspaper size={12} />{newsCount}</span> : null}
                    {show('macro') && macro != null ? <span className="mps-chip">Macro β {Number(macro)}</span> : null}
                    {show('ai') && hasAi ? <span className="mps-chip mps-chip-ai"><Brain size={12} />AI</span> : null}
                  </div>
                )}
              </div>
            )}
          </button>
        )
      }}
    />
  )
}

function MobileWatchlistManager({ dashboard, onSelect, hidden = false }: { dashboard: any; onSelect: (position: any) => void; hidden?: boolean }) {
  const {
    lists,
    activeId,
    activeList,
    selectList,
    createList,
    renameList,
    addSymbol,
    removeSymbol,
    removeSymbols,
    setListViewMode,
    toggleColumn,
    reorderSymbol,
  } = useCustomWatchlists()
  const [adding, setAdding] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [manageColumnsOpen, setManageColumnsOpen] = useState(false)
  const [validation, setValidation] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const universe = useMemo(() => buildWatchlistUniverse(dashboard, [...positionFallback, ...scannerFallback]), [dashboard])
  const rows = useMemo(() => resolveWatchlistRows(activeList?.tickers || activeList?.symbols || [], universe), [activeList, universe])
  const view = activeList?.viewMode || 'table'

  function submitList(e: any) {
    e.preventDefault()
    createList(newListName)
    setNewListName('')
  }

  function submitTicker(e: any) {
    e.preventDefault()
    if (!activeList) return
    const symbol = newTicker.trim().toUpperCase()
    if (!symbol) return
    if ((activeList.tickers || activeList.symbols || []).includes(symbol)) {
      setValidation(`${symbol} is already in ${activeList.name}.`)
      return
    }
    addSymbol(activeList.id, symbol)
    setNewTicker('')
    setValidation('')
    setAdding(false)
  }

  function createPromptList() {
    const name = window.prompt('New watchlist name')
    if (name) createList(name)
  }

  function renamePromptList() {
    if (!activeList) return
    const name = window.prompt('Rename watchlist', activeList.name)
    if (name) renameList(activeList.id, name)
  }

  return (
    <section className="mobile-watchlist-section">
      <div className="mobile-watchlist-titlebar">
        <div>
          <span>Watchlists</span>
          <strong>{hidden ? 'Workspace' : activeList?.name || 'Favorites'}</strong>
        </div>
        <button type="button" className="mobile-icon-action" aria-label="Watchlist menu" onClick={() => setMenuOpen(true)}>
          <MoreVertical size={18} />
        </button>
      </div>

      <div className="mobile-watchlist-tabs" aria-label="Watchlist tabs">
        <button type="button" className="mobile-watchlist-plus" aria-label="New watchlist" onClick={createPromptList}>
          <Plus size={15} />
        </button>
        <div className="mobile-watchlist-tabrail">
          {lists.map((list) => (
            <button key={list.id} type="button" className={list.id === activeId ? 'active' : ''} onClick={() => selectList(list.id)}>
              {hidden ? 'List' : list.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mobile-watchlist-actionrow">
        <button type="button" className="mobile-add-instrument" onClick={() => setAdding((value) => !value)}>
          <Plus size={16} /> Add Instrument
        </button>
        <button type="button" aria-label="Edit instruments" onClick={() => setEditOpen(true)}><Pencil size={16} /></button>
        <div className="mobile-watchlist-viewtoggle" role="group" aria-label="Watchlist style">
          <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => activeList && setListViewMode(activeList.id, 'table')}>Table</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => activeList && setListViewMode(activeList.id, 'list')}>Cards</button>
        </div>
      </div>
      {adding && (
        <form className="mobile-watchlist-addform" onSubmit={submitTicker}>
          <input value={newTicker} onChange={(e) => { setNewTicker(e.target.value.toUpperCase()); setValidation('') }} placeholder="Ticker" aria-label="Ticker to add" autoFocus />
          <button type="submit">Add</button>
        </form>
      )}
      {validation && <div className="mobile-watchlist-validation">{validation}</div>}

      {rows.length === 0 ? (
        <div className="mobile-watchlist-empty">
          <strong>{hidden ? 'Workspace ready' : 'No tickers yet'}</strong>
          <span>{hidden ? mask : 'Add AMD, NBIS, IREN, or any ticker to this custom watchlist.'}</span>
        </div>
      ) : view === 'table' ? (
        <MobileWatchlistTable rows={rows} columns={activeList?.columns} onSelect={onSelect} onRemove={(symbol) => activeList && removeSymbol(activeList.id, symbol)} hidden={hidden} />
      ) : (
        <MobileWatchlistCards rows={rows} onSelect={onSelect} onRemove={(symbol) => activeList && removeSymbol(activeList.id, symbol)} hidden={hidden} />
      )}
      {menuOpen && activeList && (
        <MobileSheet title="Watchlist Menu" onClose={() => setMenuOpen(false)}>
          <div className="mobile-watchlist-sheet-menu">
            <span>Watchlist Style</span>
            <button type="button" onClick={() => setListViewMode(activeList.id, 'list')}>List View</button>
            <button type="button" onClick={() => setListViewMode(activeList.id, 'table')}>Table View</button>
            <button type="button" onClick={createPromptList}>New Watchlist</button>
            <button type="button" onClick={renamePromptList}>Rename Watchlist</button>
            <button type="button" onClick={() => setEditOpen(true)}>Manage Watchlists</button>
            <button type="button" onClick={() => setEditOpen(true)}>Manage Tabs</button>
            <button type="button" onClick={() => setManageColumnsOpen(true)}>Manage Columns</button>
            <button type="button" onClick={() => document.querySelector<HTMLButtonElement>('[aria-label="Hide amounts"],[aria-label="Show amounts"]')?.click()}>
              Privacy Mode {hidden ? 'On' : 'Off'}
            </button>
          </div>
        </MobileSheet>
      )}
      {editOpen && activeList && (
        <MobileEditInstruments
          list={activeList}
          rows={rows}
          hidden={hidden}
          onClose={() => setEditOpen(false)}
          onRemoveSelected={(symbols) => removeSymbols(activeList.id, symbols)}
          onReorder={(from, to) => reorderSymbol(activeList.id, from, to)}
        />
      )}
      {manageColumnsOpen && activeList && (
        <MobileSheet title="Manage Columns" onClose={() => setManageColumnsOpen(false)}>
          <div className="mobile-watchlist-sheet-menu">
            {Object.entries(activeList.columns).map(([key, enabled]) => (
              <button key={key} type="button" className={enabled ? 'active' : ''} onClick={() => toggleColumn(activeList.id, key as keyof typeof activeList.columns)}>
                {enabled ? 'On' : 'Off'} {key}
              </button>
            ))}
          </div>
        </MobileSheet>
      )}
    </section>
  )
}

function MobileWatchlistTable({ rows, columns = { instrument: true, last: true, change: true, changePercent: true, volume: true }, onSelect, onRemove, hidden }: { rows: any[]; columns?: any; onSelect: (position: any) => void; onRemove: (symbol: string) => void; hidden: boolean }) {
  // Split-layer frozen column (PIA-UAT-FIX-001D): the instrument column is a
  // separate non-scrolling left layer outside the horizontal scroller, so
  // scrolled cells can never bleed behind/left of it on iOS.
  return (
    <div className="mptbl-split">
      {columns.instrument && (
        <div className="mptbl-frozen pf-wl-frozen">
          <div className="mptbl-fcell mptbl-fhead">INSTRMNT</div>
          {rows.map((row) => (
            <button key={row.symbol} type="button" className="mptbl-fcell mptbl-frow" onClick={() => onSelect(row)}>
              <div className="mtt-symbol">
                <div className="mtt-logo" style={{ background: row.accent || row.brand || '#60a5fa' }}>
                  {hidden ? '-' : row.logo || String(row.symbol).slice(0, 2)}
                </div>
                <span>
                  <strong className="mtt-sym-label">{hidden ? mask : row.symbol}</strong>
                  <small>{hidden ? 'Market' : row.exchange || 'NASDAQ'}</small>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mptbl-scrollarea">
        <table className="mobile-terminal-table mobile-watchlist-table">
          <thead>
            <tr>
              {columns.last && <th>LAST</th>}
              {columns.change && <th>CHNG</th>}
              {columns.changePercent && <th>CHG%</th>}
              {columns.volume && <th>VLM</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} onClick={() => onSelect(row)}>
                {columns.last && <td>{hidden ? mask : money(row.last || row.price)}</td>}
                {columns.change && <td className={Number(row.day_pnl) >= 0 ? 'green' : 'red'}>{hidden ? mask : money(row.day_pnl)}</td>}
                {columns.changePercent && <td className={Number(row.day_change_pct) >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(row.day_change_pct)}</td>}
                {columns.volume && <td>{hidden ? mask : compactVolume(row.volume)}</td>}
                <td>
                  <div className="mobile-watchlist-actions">
                    <button type="button" aria-label={`Open intelligence for ${row.symbol}`} onClick={(e) => { e.stopPropagation(); onSelect(row) }}>
                      <Brain size={14} />
                    </button>
                    <button type="button" aria-label={`Remove ${row.symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(row.symbol) }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MobileWatchlistCards({ rows, onSelect, hidden }: { rows: any[]; onSelect: (position: any) => void; onRemove: (symbol: string) => void; hidden: boolean }) {
  // Portfolio Card V2 design language — research card (no position metrics).
  // Keeps ticker, company, daily %, sparkline, risk, momentum, news/macro/AI chips.
  return (
    <div className="mobile-watchlist-card-list">
      {rows.map((row) => {
        const change = Number(row.day_change_pct || 0)
        const risk = Number(row.risk || 0)
        const momentum = Number(row.momentum_score || row.momentum || 52)
        const macro = row.macro_sensitivity
        const newsCount = Number(row.news_count ?? row.news ?? row.news_score ?? 0)
        const hasAi = Boolean(row.ai_view || row.ai_score != null)
        const brandColor = row.brand || row.accent || undefined
        return (
          <button
            key={row.symbol}
            type="button"
            className={`mobile-visual-card mobile-position-card mobile-watchlist-card${brandColor ? ' themed' : ''}`}
            style={brandColor ? { borderTopColor: brandColor } as CSSProperties : undefined}
            onClick={() => onSelect(row)}
          >
            <div className="mobile-card-head">
              <div>
                <span>{hidden ? 'Workspace item' : row.name || 'Instrument'}</span>
                <strong>{row.symbol}</strong>
              </div>
              <IntelligenceBadge label={pct(change)} tone={change >= 0 ? 'good' : 'bad'} />
            </div>
            <Sparkline values={row.spark} tone={change >= 0 ? 'good' : 'bad'} />
            <div className="mps-bars">
              <RiskBar value={risk || 31} />
              <MomentumBar value={momentum} />
            </div>
            {(newsCount > 0 || macro != null || hasAi) && (
              <div className="mps-chips">
                {newsCount > 0 ? <span className="mps-chip"><Newspaper size={12} />{newsCount}</span> : null}
                {macro != null ? <span className="mps-chip">Macro β {Number(macro)}</span> : null}
                {hasAi ? <span className="mps-chip mps-chip-ai"><Brain size={12} />AI</span> : null}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}

function MobileEditInstruments({
  list,
  rows,
  hidden,
  onClose,
  onRemoveSelected,
  onReorder,
}: {
  list: any
  rows: any[]
  hidden: boolean
  onClose: () => void
  onRemoveSelected: (symbols: string[]) => void
  onReorder: (from: number, to: number) => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const selectedSymbols = Array.from(selected)
  return (
    <div className="mobile-edit-instruments">
      <header>
        <button type="button" className="mobile-icon-action" aria-label="Back to watchlists" onClick={onClose}>
          <ChevronLeft size={18} />
        </button>
        <div>
          <span>{hidden ? 'Workspace' : list.name}</span>
          <strong>Edit Instruments</strong>
        </div>
      </header>
      <div className="mobile-edit-toolbar">
        <button type="button" disabled={!selectedSymbols.length} onClick={() => { onRemoveSelected(selectedSymbols); setSelected(new Set()) }}>
          <Trash2 size={15} /> Remove Selected
        </button>
      </div>
      <div className="mobile-edit-list">
        {rows.map((row, index) => (
          <div
            key={row.symbol}
            className="mobile-edit-row"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index)
              setDragIndex(null)
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(row.symbol)}
              onChange={(event) => setSelected((current) => {
                const next = new Set(current)
                event.target.checked ? next.add(row.symbol) : next.delete(row.symbol)
                return next
              })}
              aria-label={`Select ${row.symbol}`}
            />
            <div className="mobile-edit-main">
              <strong>{hidden ? mask : row.symbol}</strong>
              <span>{hidden ? 'Market' : row.exchange || 'NASDAQ'}</span>
              <small>{hidden ? mask : row.name}</small>
            </div>
            <GripVertical size={18} className="mobile-edit-grip" aria-hidden="true" />
          </div>
        ))}
      </div>
    </div>
  )
}

type PortfolioView = 'table' | 'cards'
type CuratedColKey =
  | 'ticker' | 'company' | 'shares' | 'mktvalue' | 'last' | 'avgcost'
  | 'daypnl' | 'daypnlpct' | 'unrealized' | 'unrealizedpct'
  | 'risk' | 'momentum' | 'weight' | 'sparkline'
// Advanced / IBKR fields are dynamic, keyed as `adv:<field>`, so ColKey/TableSortKey are strings.
type ColKey = CuratedColKey | string
type TableSortKey = string

const COL_DEFS: { key: ColKey; label: string; sortKey?: TableSortKey; defaultOn: boolean; frozen?: boolean }[] = [
  { key: 'ticker',        label: 'Ticker',       sortKey: 'symbol',        defaultOn: true, frozen: true },
  { key: 'company',       label: 'Company',                                defaultOn: false },
  { key: 'shares',        label: 'Shares',       sortKey: 'shares',        defaultOn: false },
  { key: 'mktvalue',      label: 'Mkt Value',    sortKey: 'mktvalue',      defaultOn: true },
  { key: 'last',          label: 'Last',         sortKey: 'last',          defaultOn: true },
  { key: 'avgcost',       label: 'Avg Cost',     sortKey: 'avgcost',       defaultOn: false },
  { key: 'daypnl',        label: 'Day P/L $',    sortKey: 'daypnl',        defaultOn: true },
  { key: 'daypnlpct',     label: 'Day P/L %',    sortKey: 'daypnlpct',     defaultOn: true },
  { key: 'unrealized',    label: 'Unrlzd $',     sortKey: 'unrealized',    defaultOn: true },
  { key: 'unrealizedpct', label: 'Unrlzd %',     sortKey: 'unrealizedpct', defaultOn: false },
  { key: 'risk',          label: 'Risk',         sortKey: 'risk',          defaultOn: true },
  { key: 'momentum',      label: 'Momentum',     sortKey: 'momentum',      defaultOn: false },
  { key: 'weight',        label: 'Portfolio %',  sortKey: 'weight',        defaultOn: true },
  { key: 'sparkline',     label: 'Sparkline',                              defaultOn: false },
]
const COL_LS_KEY = 'pia.portfolioColumns.mobile.v2'

const COL_ORDER_LS_KEY = 'pia.portfolioColOrder.mobile.v2'

// Card field visibility (independent from table columns)
type CardFieldKey =
  | 'shares' | 'mktvalue' | 'last' | 'avgcost' | 'daypnl' | 'unrealized'
  | 'weight' | 'risk' | 'momentum' | 'sparkline' | 'macro' | 'ai' | 'news'
const CARD_FIELD_DEFS: { key: CardFieldKey; label: string }[] = [
  { key: 'shares', label: 'Shares' },
  { key: 'mktvalue', label: 'Market Value' },
  { key: 'last', label: 'Last Price' },
  { key: 'avgcost', label: 'Avg Cost' },
  { key: 'daypnl', label: 'Today P&L' },
  { key: 'unrealized', label: 'Unrealized P&L' },
  { key: 'weight', label: 'Portfolio %' },
  { key: 'risk', label: 'Risk' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'sparkline', label: 'Sparkline' },
  { key: 'macro', label: 'Macro β' },
  { key: 'ai', label: 'AI' },
  { key: 'news', label: 'News' },
]
const CARD_FIELDS_LS_KEY = 'pia.portfolioCardFields.mobile'
const CARD_ORDER_LS_KEY = 'pia.portfolioCardOrder.mobile'
// Card fields whose display order can be applied to the card stat grid.
const CARD_GRID_FIELDS: CardFieldKey[] = ['shares', 'mktvalue', 'last', 'avgcost', 'daypnl', 'unrealized']

type ManualInstrumentMatch = {
  symbol: string
  name?: string
  asset_type?: string
  currency?: string
  exchange?: string
  quote_type?: string
}

const emptyManualHoldingForm = {
  ticker: '',
  quantity: '',
  avg_price: '',
}

function normalizeManualMatches(payload: any): ManualInstrumentMatch[] {
  const matches = Array.isArray(payload?.matches) ? payload.matches : []
  return matches
    .map((item: any) => ({
      symbol: String(item?.symbol || '').trim().toUpperCase(),
      name: String(item?.name || item?.shortname || item?.longname || item?.symbol || '').trim(),
      asset_type: String(item?.asset_type || 'Stock'),
      currency: String(item?.currency || 'USD').trim().toUpperCase(),
      exchange: item?.exchange ? String(item.exchange) : '',
      quote_type: item?.quote_type ? String(item.quote_type) : '',
    }))
    .filter((item: ManualInstrumentMatch) => item.symbol)
}

function validManualSearch(value: string) {
  return /^[A-Z0-9][A-Z0-9 .,&'()\/\-=^]{0,79}$/i.test(value.trim())
}

function manualHoldingError(error: any, fallback: string) {
  if (typeof error?.detail === 'string' && error.detail.trim()) return error.detail
  if (typeof error?.message === 'string' && error.message.trim() && error.message !== 'Failed to fetch') return error.message
  return fallback
}

// Short descriptions surfaced via the info icon in the Manage Display screen.
const FIELD_INFO: Record<string, string> = {
  // Default table + card fields
  ticker: 'Instrument symbol. Stays fixed as the first column while you scroll.',
  company: 'Full company / instrument name.',
  shares: 'Number of shares (or contracts) you currently hold.',
  mktvalue: 'Current value of the holding at the latest price.',
  last: 'Most recent traded price.',
  avgcost: 'Average purchase cost of your current position.',
  daypnl: "Today's profit or loss in cash.",
  daypnlpct: "Today's price change in percent.",
  unrealized: 'Profit or loss if sold at the current market price.',
  unrealizedpct: 'Open profit or loss as a percentage of cost.',
  weight: 'Percentage of total portfolio value.',
  risk: 'PIA risk score from 0 (low) to 100 (high).',
  momentum: 'PIA momentum score from 0 (weak) to 100 (strong).',
  sparkline: 'Mini price trend for the selected timeframe.',
  macro: 'Macro sensitivity (beta) to broad market moves.',
  ai: 'An AI view is available for this position.',
  news: 'Recent news activity for this instrument.',
  // Advanced / IBKR fields (keyed by backend field name)
  currency: 'Currency the position is denominated in.',
  account: 'Brokerage account holding this position.',
  conid: 'IBKR contract identifier (conId).',
  con_id: 'IBKR contract identifier (conId).',
  contract_id: 'IBKR contract identifier (conId).',
  sec_type: 'Asset class (e.g. stock, ETF, option).',
  asset_class: 'Asset class (e.g. stock, ETF, option).',
  exchange: 'Exchange where the instrument trades.',
  primary_exchange: 'Primary listing exchange.',
  multiplier: 'Contract multiplier (options/futures).',
  cost_basis: 'Total amount paid to open the position.',
  market_price: 'Current market price used for valuation.',
  realized: 'Profit or loss already locked in from closed trades.',
  realized_pnl: 'Profit or loss already locked in from closed trades.',
  daily_pnl: "Today's profit or loss in cash.",
  day_change: "Today's price change in cash.",
  delta: 'Option delta (price sensitivity to the underlying).',
  gamma: 'Option gamma (rate of change of delta).',
  theta: 'Option theta (time decay per day).',
  vega: 'Option vega (sensitivity to volatility).',
  expiry: 'Option/contract expiration date.',
  strike: 'Option strike price.',
  right: 'Option right (Call or Put).',
  sector: 'Market sector classification.',
  industry: 'Industry classification.',
  beta: 'Beta vs the broad market.',
  news_score: 'Recent news activity score for this instrument.',
}

// Sparkline timeframe (shared across portfolio positions view)
const SPARK_TF_OPTIONS = ['1H', '4H', '1D', '5D', '1M', '3M', '6M', '1Y'] as const
type SparkTf = (typeof SPARK_TF_OPTIONS)[number]
const DEFAULT_SPARK_TF: SparkTf = '5D'
const SPARK_TF_LS_KEY = 'pia.portfolioSparkTf.mobile'

// Resolve per-timeframe spark series when the backend provides it; otherwise
// fall back to the existing normalized series. State contract is ready for
// real timeframe data via position.sparks[tf] or position.spark_<tf>.
function resolveSpark(position: any, tf: SparkTf): number[] | undefined {
  const series = position?.sparks?.[tf] ?? position?.[`spark_${tf}`]
  if (Array.isArray(series) && series.length) return series
  return position?.spark
}

function readSavedCardFields(): Set<CardFieldKey> {
  try {
    const raw = localStorage.getItem(CARD_FIELDS_LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as CardFieldKey[]
      if (Array.isArray(arr)) return new Set(arr)
    }
  } catch {}
  return new Set(CARD_FIELD_DEFS.map((c) => c.key))
}

function readSavedCardOrder(): CardFieldKey[] {
  const all = CARD_FIELD_DEFS.map((c) => c.key)
  try {
    const raw = localStorage.getItem(CARD_ORDER_LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as CardFieldKey[]
      if (Array.isArray(arr) && arr.length) {
        // keep saved order, then append any new fields not yet stored
        return [...arr.filter((k) => all.includes(k)), ...all.filter((k) => !arr.includes(k))]
      }
    }
  } catch {}
  return all
}

function readSavedSparkTf(): SparkTf {
  try {
    const raw = localStorage.getItem(SPARK_TF_LS_KEY)
    if (raw && (SPARK_TF_OPTIONS as readonly string[]).includes(raw)) return raw as SparkTf
  } catch {}
  return DEFAULT_SPARK_TF
}

// --- Advanced / IBKR position fields -------------------------------------
// Discovered dynamically from the backend position payload so any delivered
// field can be exposed as an optional column. No fake data is hardcoded.
type FieldKind = 'money' | 'pct' | 'num' | 'text'
type AdvancedColDef = { key: string; field: string; label: string; kind: FieldKind; sortKey: string; sensitive?: boolean }

// Friendly labels + formatting for known IBKR / backend keys.
const KNOWN_FIELD_META: Record<string, { label: string; kind: FieldKind; sensitive?: boolean }> = {
  currency: { label: 'Currency', kind: 'text' },
  account: { label: 'Account', kind: 'text', sensitive: true },
  account_id: { label: 'Account', kind: 'text', sensitive: true },
  conid: { label: 'Contract ID', kind: 'text' },
  con_id: { label: 'Contract ID', kind: 'text' },
  contract_id: { label: 'Contract ID', kind: 'text' },
  sec_type: { label: 'Asset Class', kind: 'text' },
  sectype: { label: 'Asset Class', kind: 'text' },
  asset_class: { label: 'Asset Class', kind: 'text' },
  asset_type: { label: 'Asset Class', kind: 'text' },
  exchange: { label: 'Exchange', kind: 'text' },
  listing_exchange: { label: 'Exchange', kind: 'text' },
  primary_exchange: { label: 'Primary Exch', kind: 'text' },
  multiplier: { label: 'Multiplier', kind: 'num' },
  cost_basis: { label: 'Cost Basis', kind: 'money', sensitive: true },
  market_price: { label: 'Market Price', kind: 'money' },
  mkt_price: { label: 'Market Price', kind: 'money' },
  realized: { label: 'Realized P&L', kind: 'money', sensitive: true },
  realized_pnl: { label: 'Realized P&L', kind: 'money', sensitive: true },
  realized_pl: { label: 'Realized P&L', kind: 'money', sensitive: true },
  daily_pnl: { label: 'Daily P&L', kind: 'money', sensitive: true },
  day_change: { label: 'Day Change $', kind: 'money' },
  delta: { label: 'Delta', kind: 'num' },
  gamma: { label: 'Gamma', kind: 'num' },
  theta: { label: 'Theta', kind: 'num' },
  vega: { label: 'Vega', kind: 'num' },
  iv: { label: 'IV', kind: 'pct' },
  implied_vol: { label: 'IV', kind: 'pct' },
  expiry: { label: 'Expiry', kind: 'text' },
  expiration: { label: 'Expiry', kind: 'text' },
  strike: { label: 'Strike', kind: 'money' },
  right: { label: 'Right', kind: 'text' },
  sector: { label: 'Sector', kind: 'text' },
  industry: { label: 'Industry', kind: 'text' },
  macro_sensitivity: { label: 'Macro β', kind: 'num' },
  beta: { label: 'Beta', kind: 'num' },
}

// Keys already represented by curated columns or used only for presentation /
// internal rendering — excluded from advanced discovery.
const EXCLUDED_ADV_FIELDS = new Set<string>([
  'symbol', 'ticker', 'name', 'company', 'quantity', 'qty', 'shares',
  'market_value', 'mktvalue', 'last', 'price', 'avg_price', 'avg_cost',
  'day_pnl', 'day_change_pct', 'change_pct', 'unrealized', 'unrealized_pct',
  'risk', 'momentum', 'momentum_score', 'portfolio_pct',
  'spark', 'sparks', 'accent', 'brand', 'logo', 'ai_view', 'ai_score',
  'news_count', 'news',
])

function humanizeFieldLabel(field: string): string {
  return field
    .replace(/^adv:/, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPnl\b/i, 'P&L')
    .replace(/\bId\b/, 'ID')
    .trim()
}

// Build the advanced column list from whatever the backend actually delivers.
function discoverAdvancedFields(positions: any[]): AdvancedColDef[] {
  const seen = new Map<string, AdvancedColDef>()
  for (const p of positions || []) {
    if (!p || typeof p !== 'object') continue
    for (const [field, value] of Object.entries(p)) {
      if (EXCLUDED_ADV_FIELDS.has(field) || field.startsWith('spark_')) continue
      // Only primitive, displayable values — never break the UI on objects/arrays.
      if (value == null || typeof value === 'object') continue
      if (seen.has(field)) continue
      const meta = KNOWN_FIELD_META[field]
      seen.set(field, {
        key: `adv:${field}`,
        field,
        label: meta?.label || humanizeFieldLabel(field),
        kind: meta?.kind || (typeof value === 'number' ? 'num' : 'text'),
        sortKey: `adv:${field}`,
        sensitive: meta?.sensitive,
      })
    }
  }
  return Array.from(seen.values())
}

function formatAdvancedValue(value: unknown, kind: FieldKind): string {
  if (value == null || value === '') return '—'
  switch (kind) {
    case 'money': return money(value)
    case 'pct': return `${Number(value).toFixed(2)}%`
    case 'num': return typeof value === 'number' ? String(Number(value.toFixed(4))) : String(value)
    default: return String(value)
  }
}

function readSavedCols(): Set<ColKey> {
  try {
    const raw = localStorage.getItem(COL_LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ColKey[]
      if (Array.isArray(arr) && arr.length) return new Set(arr)
    }
  } catch {}
  return new Set(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key))
}

function readSavedOrder(): ColKey[] {
  try {
    const raw = localStorage.getItem(COL_ORDER_LS_KEY)
    if (raw) {
      const arr = JSON.parse(raw) as ColKey[]
      if (Array.isArray(arr) && arr.length) return arr
    }
  } catch {}
  return COL_DEFS.map((c) => c.key)
}

function generatePortfolioHistory(total: number, tf = '1M'): number[] {
  const counts: Record<string, number> = { '1D': 24, '1W': 7, '1M': 30, '3M': 90, 'YTD': 120, '1Y': 252, 'ALL': 365 }
  const drawdowns: Record<string, number> = { '1D': 0.9994, '1W': 0.995, '1M': 0.987, '3M': 0.968, 'YTD': 0.955, '1Y': 0.88, 'ALL': 0.82 }
  const count = Math.min(counts[tf] || 30, 80)
  const base = total * (drawdowns[tf] || 0.987)
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(count - 1, 1)
    const trend = base + (total - base) * Math.min(t * 1.08, 1)
    const wave = (Math.sin(i * 2.1 + 1) * 0.7 + Math.cos(i * 1.4) * 0.5) * (total * 0.007)
    return i === count - 1 ? total : Math.max(0, trend + wave)
  })
}

function PortfolioChart({ data, hidden }: { data: number[]; hidden: boolean }) {
  if (hidden) return <div className="pf-chart-hidden" />
  const vals = data.length ? data : [100, 102, 101, 104, 106, 105, 108]
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const W = 260, H = 46
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - min) / range) * (H - 6) - 3).toFixed(1)}`).join(' ')
  const isUp = vals[vals.length - 1] >= vals[0]
  return (
    <svg className="pf-evolution-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={isUp ? '#24d18c' : '#ff6375'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke="rgba(148,163,184,.12)" />
    </svg>
  )
}

const TF_OPTIONS = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'] as const
type TfKey = (typeof TF_OPTIONS)[number]

function PortfolioHeader({ portfolio, positions, hidden, expanded, onToggle }: {
  portfolio: any; positions: any[]; hidden: boolean; expanded: boolean; onToggle: () => void
}) {
  const [selectedTf, setSelectedTf] = useState<TfKey>('1M')

  const total = portfolio.total_value || positions.reduce((s: number, p: any) => s + Number(p.market_value || 0), 0)
  const dayPnl = portfolio.daily_pnl || positions.reduce((s: number, p: any) => s + Number(p.day_pnl || 0), 0)
  const dayPnlPct = Number(portfolio.daily_pnl_pct || (total ? (dayPnl / total) * 100 : 0))
  const unreal = portfolio.unrealized || positions.reduce((s: number, p: any) => s + Number(p.unrealized || 0), 0)
  const realized = Number(portfolio.realized_pnl || 0)
  const cash = Number(portfolio.cash || 0)
  const bp = Number(portfolio.buying_power || 0)

  const excessLiq = Math.round(bp * 0.85)
  const sma = Math.round(total * 0.92)
  const theta = -(Math.round(total * 0.00012 * 100) / 100)
  const vega = Math.round(total * 0.0026)
  const maintMgn = Math.round(total * 0.22)
  const initMgn = Math.round(total * 0.15)
  const spxDelta = (total / 260000).toFixed(2)
  const netDelta = (total / 87500).toFixed(2)

  const history = useMemo(() => generatePortfolioHistory(total || 100000, selectedTf), [total, selectedTf])

  const fullMetrics = [
    { label: 'Mkt Value', value: money(total) },
    { label: 'Excess Liq', value: money(excessLiq) },
    { label: 'SMA', value: money(sma) },
    { label: 'Theta', value: `$${theta.toFixed(2)}` },
    { label: 'Vega', value: `$${vega}` },
    { label: 'Buy Power', value: money(bp) },
    { label: 'Maint. Mgn', value: money(maintMgn) },
    { label: 'Init. Mgn', value: money(initMgn) },
    { label: 'SPX Δ', value: spxDelta },
    { label: 'Net Δ', value: netDelta },
    { label: 'Day Trades', value: '3' },
    { label: 'Cash', value: money(cash) },
  ]

  return (
    <div className={`pf-header${expanded ? ' expanded' : ' collapsed'}`} role="region" aria-label="Portfolio overview">
      <div className="pf-header-main" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <div className="pf-header-nlv">
          <span className="pf-header-label">Portfolio · NLV</span>
          <div className="pf-header-hero">{hidden ? mask : money(total)}</div>
          <div className="pf-header-pnl-row">
            <span className={`pf-header-day-pnl ${dayPnl >= 0 ? 'green' : 'red'}`}>
              {hidden ? mask : `${dayPnl >= 0 ? '+' : ''}${money(dayPnl)}`}
            </span>
            <span className={`pf-header-day-pct ${dayPnl >= 0 ? 'green' : 'red'}`}>
              {hidden ? mask : `${dayPnlPct >= 0 ? '+' : ''}${Math.abs(dayPnlPct).toFixed(2)}%`}
            </span>
          </div>
        </div>
        <ChevronDown size={17} className={`pf-collapse-arrow${expanded ? ' open' : ''}`} />
      </div>

      {expanded && (
        <div className="pf-header-detail">
          <div className="pf-header-secondary">
            <div className="pf-header-sec-item">
              <span>Unrealized P/L</span>
              <b className={unreal >= 0 ? 'green' : 'red'}>{hidden ? mask : `${unreal >= 0 ? '+' : ''}${money(unreal)}`}</b>
            </div>
            <div className="pf-header-sec-item">
              <span>Realized P/L</span>
              <b className={realized >= 0 ? 'green' : 'red'}>{hidden ? mask : `${realized >= 0 ? '+' : ''}${money(realized)}`}</b>
            </div>
          </div>

          <PortfolioChart data={history} hidden={hidden} />

          <div className="pf-tf-rail" role="tablist" aria-label="Chart time range">
            {TF_OPTIONS.map((tf) => (
              <button
                key={tf}
                type="button"
                role="tab"
                aria-selected={selectedTf === tf}
                className={`pf-tf-chip${selectedTf === tf ? ' active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectedTf(tf) }}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="pf-metrics-full">
            {fullMetrics.map((m) => (
              <div key={m.label} className="pf-metric-chip">
                <span>{m.label}</span>
                <b>{hidden ? mask : m.value}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SparkTfRail({ value, onChange }: { value: SparkTf; onChange: (tf: SparkTf) => void }) {
  return (
    <div className="pf-display-tf">
      <span className="pf-display-tf-label">Sparkline timeframe</span>
      <div className="pf-tf-rail" role="group" aria-label="Sparkline timeframe">
        {SPARK_TF_OPTIONS.map((tf) => (
          <button
            key={tf}
            type="button"
            className={`pf-tf-chip${value === tf ? ' active' : ''}`}
            aria-pressed={value === tf}
            onClick={() => onChange(tf)}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  )
}

type ManageItem = { key: string; label: string; info?: string; locked?: boolean }

// IBKR-style "Manage Display" screen used for both Table columns and Card
// fields: enabled list (checkmark + name + info + reorder + grip), an
// "+ Add" catalog of available/IBKR fields, and the sparkline timeframe.
function MobileManageDisplay({
  title, addLabel, order, visible, allKeys, defsByKey, sparkTf, onSparkTf, onToggle, onReorder, onReset, onClose,
}: {
  title: string
  addLabel: string
  order: string[]
  visible: Set<string>
  allKeys: string[]
  defsByKey: (key: string) => ManageItem | undefined
  sparkTf: SparkTf
  onSparkTf: (tf: SparkTf) => void
  onToggle: (key: string) => void
  onReorder: (nextOrder: string[]) => void
  onReset: () => void
  onClose: () => void
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [info, setInfo] = useState<{ label: string; text: string } | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragKeyRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const enabled = order.map(defsByKey).filter((d): d is ManageItem => !!d && visible.has(d.key))
  const seen = new Set<string>()
  const available = allKeys
    .filter((k) => !visible.has(k))
    .map(defsByKey)
    .filter((d): d is ManageItem => !!d && !seen.has(d.key) && (seen.add(d.key), true))

  // Drag-to-reorder from the right-side grip. Reorders the enabled subset and
  // merges back into the full order, leaving disabled entries in place.
  function reorderTo(key: string, targetKey: string) {
    if (key === targetKey) return
    const en = order.filter((k) => visible.has(k))
    const from = en.indexOf(key)
    const to = en.indexOf(targetKey)
    if (from < 0 || to < 0) return
    const next = [...en]
    next.splice(from, 1)
    next.splice(to, 0, key)
    let i = 0
    onReorder(order.map((k) => (visible.has(k) ? next[i++] : k)))
  }
  function onListPointerDown(e: PointerEvent<HTMLUListElement>) {
    const target = e.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    const li = target.closest('[data-key]') as HTMLElement | null
    if (!li?.dataset.key) return
    dragKeyRef.current = li.dataset.key
    setDragKey(li.dataset.key)
    listRef.current?.setPointerCapture(e.pointerId)
  }
  function onListPointerMove(e: PointerEvent<HTMLUListElement>) {
    if (!dragKeyRef.current || !listRef.current) return
    const rows = Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]
    for (const el of rows) {
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY < r.bottom) {
        const tk = el.dataset.key
        if (tk && tk !== dragKeyRef.current) reorderTo(dragKeyRef.current, tk)
        break
      }
    }
  }
  function onListPointerEnd(e: PointerEvent<HTMLUListElement>) {
    if (!dragKeyRef.current) return
    dragKeyRef.current = null
    setDragKey(null)
    listRef.current?.releasePointerCapture?.(e.pointerId)
  }

  return (
    <div className="pf-manage" role="dialog" aria-modal="true" aria-label={title}>
      <header className="pf-manage-head">
        <button type="button" className="pf-manage-back" aria-label="Done" onClick={onClose}><ChevronLeft size={20} /></button>
        <h2>{title}</h2>
        <button type="button" className="pf-manage-reset" onClick={onReset}>Reset</button>
      </header>
      <div className="pf-manage-body">
        <ul
          className={`pf-manage-list${dragKey ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerDown={onListPointerDown}
          onPointerMove={onListPointerMove}
          onPointerUp={onListPointerEnd}
          onPointerCancel={onListPointerEnd}
        >
          {enabled.map((item) => (
            <li className={`pf-manage-row${dragKey === item.key ? ' dragging' : ''}`} key={item.key} data-key={item.key}>
              <button
                type="button"
                className="pf-manage-check on"
                aria-label={`Hide ${item.label}`}
                disabled={item.locked}
                onClick={() => !item.locked && onToggle(item.key)}
              >
                ✓
              </button>
              <span className="pf-manage-name">{item.label}</span>
              <button type="button" className="pf-manage-info" aria-label={`About ${item.label}`} onClick={() => setInfo({ label: item.label, text: item.info || 'No description available.' })}><Info size={15} /></button>
              <span className="pf-manage-grip" data-grip role="button" tabIndex={0} aria-label={`Drag to reorder ${item.label}`}><GripVertical size={18} /></span>
            </li>
          ))}
        </ul>
        <button type="button" className="pf-manage-add" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}>
          <Plus size={16} /> {addLabel}
        </button>
        {addOpen && (
          <ul className="pf-manage-list pf-manage-available">
            {available.length ? available.map((item) => (
              <li className="pf-manage-row" key={item.key}>
                <button type="button" className="pf-manage-check" aria-label={`Add ${item.label}`} onClick={() => onToggle(item.key)} />
                <span className="pf-manage-name">{item.label}</span>
                <button type="button" className="pf-manage-info" aria-label={`About ${item.label}`} onClick={() => setInfo({ label: item.label, text: item.info || 'No description available.' })}><Info size={15} /></button>
                <button type="button" className="pf-manage-addbtn" aria-label={`Add ${item.label}`} onClick={() => onToggle(item.key)}><Plus size={15} /></button>
              </li>
            )) : <li className="pf-manage-empty">All fields are shown.</li>}
          </ul>
        )}
        <SparkTfRail value={sparkTf} onChange={onSparkTf} />
      </div>
      {info && (
        <div className="pf-info-pop-root" role="presentation">
          <button type="button" className="pf-info-pop-overlay" aria-label="Close" onClick={() => setInfo(null)} />
          <div className="pf-info-pop" role="dialog" aria-modal="true" aria-label={`${info.label} info`}>
            <strong>{info.label}</strong>
            <p>{info.text}</p>
            <button type="button" className="pf-info-pop-close" onClick={() => setInfo(null)}>Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddManualHoldingSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [form, setForm] = useState(emptyManualHoldingForm)
  const [matches, setMatches] = useState<ManualInstrumentMatch[]>([])
  const [selected, setSelected] = useState<ManualInstrumentMatch | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupMessage, setLookupMessage] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  const searchText = form.ticker.trim()
  const selectedTicker = selected?.symbol || ''
  const selectedMatchesSearch = Boolean(selectedTicker && selectedTicker === searchText.toUpperCase())

  useEffect(() => {
    if (!searchText) {
      setMatches([])
      setLookupMessage('')
      setLookupLoading(false)
      return
    }
    if (!validManualSearch(searchText)) {
      setMatches([])
      setLookupMessage('Enter a ticker or company name.')
      setLookupLoading(false)
      return
    }
    if (selectedMatchesSearch) {
      setMatches([])
      setLookupMessage(`${selectedTicker} selected.`)
      setLookupLoading(false)
      return
    }
    let active = true
    setLookupLoading(true)
    setLookupMessage('')
    const timer = window.setTimeout(async () => {
      const result = await fetchJson(`/instruments/search?q=${encodeURIComponent(searchText)}`).catch((error) => {
        if (active) {
          setMatches([])
          setLookupMessage(manualHoldingError(error, `Instrument search could not reach ${API || 'the backend API'}. Confirm the backend is running and reachable from this device.`))
        }
        return { lookupError: true }
      })
      if (!active) return
      if (result?.lookupError) {
        setLookupLoading(false)
        return
      }
      const nextMatches = normalizeManualMatches(result)
      setMatches(nextMatches)
      setLookupMessage(nextMatches.length ? 'Select the matching instrument before saving.' : 'No matching instruments found.')
      setLookupLoading(false)
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [searchText, selectedMatchesSearch, selectedTicker])

  function update(key: keyof typeof emptyManualHoldingForm, value: string) {
    if (key === 'ticker') {
      const nextTicker = value.trim().toUpperCase()
      setSelected((current) => (current?.symbol === nextTicker ? current : null))
      setStatus('')
    }
    setForm((current) => ({ ...current, [key]: value }))
  }

  function selectInstrument(match: ManualInstrumentMatch) {
    setSelected(match)
    setMatches([])
    setLookupMessage(`${match.symbol} selected.`)
    setStatus('')
    setForm((current) => ({ ...current, ticker: match.symbol }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setStatus('')
    if (saving) return
    if (!searchText || !validManualSearch(searchText)) {
      setStatus('Enter a ticker or company name.')
      return
    }
    if (lookupLoading) {
      setStatus('Finish the instrument search before saving.')
      return
    }
    if (!selectedMatchesSearch) {
      setStatus('Select a matching instrument from the search results before saving.')
      return
    }
    const ticker = selected.symbol
    const quantity = Number(form.quantity)
    const avgPrice = Number(form.avg_price)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setStatus('Enter a quantity greater than zero.')
      return
    }
    if (!Number.isFinite(avgPrice) || avgPrice < 0) {
      setStatus('Enter a valid average cost.')
      return
    }
    setSaving(true)
    const result = await fetchJson('/manual-holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticker,
        name: selected.name || ticker,
        asset_type: selected.asset_type || 'Stock',
        broker: 'Manual',
        quantity,
        avg_price: avgPrice,
        currency: selected.currency || 'USD',
        notes: `Added from Portfolio menu${selected.exchange ? ` (${selected.exchange})` : ''}.`,
      }),
    }).catch((error) => {
      setStatus(manualHoldingError(error, `Unable to save manual holding. Confirm the backend is reachable at ${API || 'the API host'} and try again.`))
      return null
    })
    if (!result) {
      setSaving(false)
      return
    }
    await onSaved().catch(() => {})
    setSaving(false)
    onClose()
  }

  return (
    <MobileSheet title="Add Manual Holding" onClose={onClose} closeOnOverlay={!saving}>
      <form className="manual-form manual-sheet-form" onSubmit={save}>
        <label className="field">
          <span>Ticker or company</span>
          <input value={form.ticker} autoComplete="off" placeholder="AMD or Apple" onChange={(event) => update('ticker', event.target.value)} />
        </label>
        <div className="field wide manual-lookup">
          <span>Instrument match</span>
          {lookupLoading && <div className="manual-lookup-status">Searching instruments...</div>}
          {!lookupLoading && selectedMatchesSearch && (
            <div className="manual-selected">
              <b>{selected.symbol}</b>
              <span>{selected.name || 'Selected instrument'}</span>
              <small>{[selected.exchange, selected.asset_type, selected.currency].filter(Boolean).join(' / ')}</small>
            </div>
          )}
          {!lookupLoading && lookupMessage && !selectedMatchesSearch && (
            <div className="manual-lookup-status">{lookupMessage}</div>
          )}
          {!lookupLoading && matches.length > 0 && (
            <div className="manual-lookup-results">
              {matches.map((match) => (
                <button type="button" key={`${match.symbol}-${match.exchange || match.name}`} onClick={() => selectInstrument(match)}>
                  <b>{match.symbol}</b>
                  <span>{match.name || match.symbol}</span>
                  <small>{[match.exchange, match.asset_type, match.currency].filter(Boolean).join(' / ')}</small>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="field">
          <span>Quantity</span>
          <input value={form.quantity} inputMode="decimal" disabled={!selectedMatchesSearch} onChange={(event) => update('quantity', event.target.value)} />
        </label>
        <label className="field">
          <span>Average Cost</span>
          <input value={form.avg_price} inputMode="decimal" disabled={!selectedMatchesSearch} onChange={(event) => update('avg_price', event.target.value)} />
        </label>
        <div className="manual-actions">
          <button className="tab active" type="submit" disabled={saving || !selectedMatchesSearch}>
            <Plus size={15} /> {saving ? 'Saving...' : 'Add holding'}
          </button>
        </div>
      </form>
      {status && <p className="muted mobile-control-status">{status}</p>}
    </MobileSheet>
  )
}


function MobilePortfolioTable({ rows, onSelect, hidden, visibleCols, colOrder, sparkTf, advancedDefs }: { rows: any[]; onSelect: (p: any) => void; hidden: boolean; visibleCols: Set<ColKey>; colOrder: ColKey[]; sparkTf: SparkTf; advancedDefs: AdvancedColDef[] }) {
  const [sort, setSort] = useState<TableSortKey>('weight')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')

  function toggleSort(col: TableSortKey) {
    if (sort === col) setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSort(col); setDir('desc') }
  }

  const sorted = useMemo(() => {
    const key = (p: any): string | number => {
      const shares = Number(p.quantity ?? p.qty ?? 0)
      const last = Number(p.last || p.price || 0)
      if (sort.startsWith('adv:')) {
        const v = p[sort.slice(4)]
        return typeof v === 'number' ? v : String(v ?? '')
      }
      switch (sort) {
        case 'symbol':        return String(p.symbol || '')
        case 'shares':        return shares
        case 'mktvalue':      return Number(p.market_value ?? last * shares)
        case 'last':          return last
        case 'avgcost':       return Number(p.avg_price || p.avg_cost || 0)
        case 'daypnl':        return Number(p.day_pnl ?? p.day_change ?? 0)
        case 'daypnlpct':     return Number(p.day_change_pct || 0)
        case 'unrealized':    return Number(p.unrealized || 0)
        case 'unrealizedpct': return Number(p.unrealized_pct || 0)
        case 'risk':          return Number(p.risk || 0)
        case 'momentum':      return Number(p.momentum_score || p.momentum || 0)
        case 'weight':        return Number(p.portfolio_pct || 0)
        default:              return 0
      }
    }
    return [...rows].sort((a, b) => {
      const av = key(a), bv = key(b)
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      return dir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [rows, sort, dir])

  function renderCell(col: ColKey, position: any) {
    const change = Number(position.day_change_pct || 0)
    const unreal = Number(position.unrealized || 0)
    const unrealPct = Number(position.unrealized_pct || 0)
    const dayPnl = Number(position.day_pnl ?? position.day_change ?? 0)
    const risk = Number(position.risk || 0)
    const shares = Number(position.quantity ?? position.qty ?? 0)
    const last = Number(position.last || position.price || 0)
    const marketValue = Number(position.market_value ?? last * shares)
    if (hidden) return <td key={col}>{mask}</td>
    if (col.startsWith('adv:')) {
      const def = advancedDefs.find((d) => d.key === col)
      const raw = def ? position[def.field] : undefined
      return <td key={col} className={def && def.kind === 'text' ? 'muted' : undefined}>{def ? formatAdvancedValue(raw, def.kind) : '—'}</td>
    }
    switch (col) {
      case 'company':
        return <td key={col} className="muted mtt-company">{position.name || '—'}</td>
      case 'shares':
        return <td key={col}>{shares.toLocaleString('en-US')}</td>
      case 'mktvalue':
        return <td key={col}>{money(marketValue)}</td>
      case 'last':
        return <td key={col}>{money(last)}</td>
      case 'avgcost':
        return <td key={col}>{money(position.avg_price || position.avg_cost || 0)}</td>
      case 'daypnl':
        return <td key={col} className={dayPnl >= 0 ? 'green' : 'red'}>{`${dayPnl >= 0 ? '+' : ''}${money(dayPnl)}`}</td>
      case 'daypnlpct':
        return <td key={col} className={change >= 0 ? 'green' : 'red'}>{`${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}</td>
      case 'unrealized':
        return <td key={col} className={unreal >= 0 ? 'green' : 'red'}>{`${unreal >= 0 ? '+' : ''}${money(unreal)}`}</td>
      case 'unrealizedpct':
        return <td key={col} className={unrealPct >= 0 ? 'green' : 'red'}>{`${unrealPct >= 0 ? '+' : ''}${unrealPct.toFixed(1)}%`}</td>
      case 'risk':
        return (
          <td key={col}>
            <span className={`mtt-risk ${risk >= 70 ? 'bad' : risk >= 45 ? 'warn' : 'good'}`}>{risk}</span>
          </td>
        )
      case 'momentum':
        return <td key={col}>{Number(position.momentum_score || position.momentum || 0)}</td>
      case 'weight':
        return <td key={col}>{Number(position.portfolio_pct || 0).toFixed(1)}%</td>
      case 'sparkline':
        return <td key={col} className="mtt-spark-cell"><Sparkline values={resolveSpark(position, sparkTf)} tone={change >= 0 ? 'good' : 'bad'} /></td>
      default:
        return <td key={col}>—</td>
    }
  }

  const showTicker = visibleCols.has('ticker')
  const advByKey = new Map(advancedDefs.map((d) => [d.key, d]))
  const defByKey = (k: string): { key: string; label: string; sortKey?: string } | undefined =>
    COL_DEFS.find((c) => c.key === k) || advByKey.get(k)
  // Columns in saved order (curated + any added advanced/IBKR fields), then any
  // newly-discovered advanced field that's enabled but not yet in the order.
  const inOrder = new Set(colOrder)
  const orderedCols: { key: string; label: string; sortKey?: string }[] = colOrder
    .map(defByKey)
    .filter((c): c is { key: string; label: string; sortKey?: string } => !!c && c.key !== 'ticker' && visibleCols.has(c.key))
    .concat(advancedDefs.filter((d) => visibleCols.has(d.key) && !inOrder.has(d.key)))

  const sortArrow = <span className="sort-arrow">{dir === 'desc' ? '↓' : '↑'}</span>

  // Split-layer structure: the frozen ticker column is a separate non-scrolling
  // sibling OUTSIDE the horizontal scroll container, so scrolled cells can never
  // pass behind or to the left of it on iOS. Row heights are fixed on both layers
  // so rows stay aligned without JS measurement.
  return (
    <div className="mptbl-split">
      {showTicker && (
        <div className="mptbl-frozen">
          <div className="mptbl-fcell mptbl-fhead" role="button" onClick={() => toggleSort('symbol')}>
            {sort === 'symbol' ? sortArrow : null}Ticker
          </div>
          {sorted.map((position) => (
            <button key={position.symbol} type="button" className="mptbl-fcell mptbl-frow" onClick={() => onSelect(position)}>
              <div className="mtt-symbol">
                <div className="mtt-logo" style={{ background: position.accent || '#60a5fa' }}>
                  {hidden ? '●' : (position.logo || String(position.symbol || '').slice(0, 2))}
                </div>
                <strong className="mtt-sym-label">{hidden ? mask : position.symbol}</strong>
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mptbl-scrollarea">
        <table className="mobile-terminal-table">
          <thead>
            <tr>
              {orderedCols.map((col) => {
                const active = col.sortKey && sort === col.sortKey
                return (
                  <th key={col.key} className={active ? 'col-sorted' : ''} onClick={() => col.sortKey && toggleSort(col.sortKey)}>
                    {col.label}{active ? sortArrow : null}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => (
              <tr key={position.symbol} onClick={() => onSelect(position)}>
                {orderedCols.map((col) => renderCell(col.key, position))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Contextual header titles keyed by active workspace/view. Short, mobile-first
// labels per PIA-UX-018; falls back to the workspace registry title otherwise.
const HEADER_TITLE_OVERRIDES: Record<string, string> = {
  home: 'Home',
  'my-portfolio': 'Portfolio',
  watchlists: 'Watchlists',
  'markets-macro': 'Markets',
  settings: 'Settings',
  about: 'About',
}

export default function MobileExperience() {
  const { dashboard, refresh: refreshDashboard } = useMobileDashboard()
  const workspaceConfig = useWorkspaceConfig()
  const [active, setActive] = useState('home')
  const [selected, setSelected] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [portfolioView, setPortfolioView] = useState<PortfolioView>('table')
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [portfolioMenuOpen, setPortfolioMenuOpen] = useState(false)
  const [manualHoldingOpen, setManualHoldingOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => new Set(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key)))
  const [colOrder, setColOrder] = useState<ColKey[]>(() => COL_DEFS.map((c) => c.key))
  const [cardFields, setCardFields] = useState<Set<CardFieldKey>>(() => new Set(CARD_FIELD_DEFS.map((c) => c.key)))
  const [cardOrder, setCardOrder] = useState<CardFieldKey[]>(() => CARD_FIELD_DEFS.map((c) => c.key))
  const [sparkTf, setSparkTf] = useState<SparkTf>(DEFAULT_SPARK_TF)
  const [quickOpen, setQuickOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [rescanStatus, setRescanStatus] = useState('')
  const [sourceHealth, setSourceHealth] = useState<any[]>([])

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
  const advancedFieldDefs = useMemo(() => discoverAdvancedFields(positions), [positions])
  const scanner = dashboard?.scanner || scannerFallback
  const privacyHidden = mounted && hidden
  const searchUniverse = useMemo(() => {
    const watchlist = dashboard?.watchlist || []
    const bySymbol = new Map<string, any>()
    const add = (raw: any, source: string) => {
      const symbol = String(raw.symbol || raw.ticker || '').split(' ')[0].toUpperCase()
      if (!symbol || bySymbol.has(symbol)) return
      bySymbol.set(symbol, {
        symbol,
        name: raw.name || '',
        last: raw.last ?? raw.price ?? null,
        change: raw.day_change_pct ?? raw.change_pct ?? null,
        accent: raw.accent,
        source,
      })
    }
    positions.forEach((p: any) => add(p, 'Portfolio'))
    watchlist.forEach((w: any) => add(w, 'Watchlist'))
    MOCK_SEARCH_TICKERS.forEach((m) => add(m, 'Mock'))
    return Array.from(bySymbol.values())
  }, [positions, dashboard?.watchlist])
  const notificationCount = buildNotificationItems(portfolio).length
  const headerTitle =
    HEADER_TITLE_OVERRIDES[active] || getWorkspaceDefinition(workspaceConfig.workspaces, active).title
  const {
    order: homeSectionOrder,
    moveUp: moveHomeSectionUp,
    moveDown: moveHomeSectionDown,
    reset: resetHomeSections,
  } = usePersistedLayout<MobileHomeSectionId>(MOBILE_HOME_LAYOUT_KEY, DEFAULT_MOBILE_HOME_ORDER)

  useEffect(() => {
    setMounted(true)
    try {
      setHidden(localStorage.getItem('pia.hideAmounts') === 'true')
      const savedView = localStorage.getItem('pia.portfolioView.mobile')
      if (savedView === 'cards' || savedView === 'table') setPortfolioView(savedView)
      if (localStorage.getItem('pia.portfolioHeader.expanded') === 'false') setHeaderExpanded(false)
      setVisibleCols(readSavedCols())
      setColOrder(readSavedOrder())
      setCardFields(readSavedCardFields())
      setCardOrder(readSavedCardOrder())
      setSparkTf(readSavedSparkTf())
    } catch {}
    fetchJson('/source-health')
      .then((data) => {
        if (Array.isArray(data)) setSourceHealth(data)
      })
      .catch(() => {})
  }, [])

  function updatePortfolioView(next: PortfolioView) {
    setPortfolioView(next)
    try { localStorage.setItem('pia.portfolioView.mobile', next) } catch {}
  }

  function toggleVisibleCol(key: ColKey) {
    const next = new Set(visibleCols)
    if (next.has(key) && next.size > 2) next.delete(key)
    else next.add(key)
    setVisibleCols(next)
    // Ensure advanced/IBKR keys join the order when first enabled.
    if (next.has(key) && !colOrder.includes(key)) {
      const nextOrder = [...colOrder, key]
      setColOrder(nextOrder)
      try { localStorage.setItem(COL_ORDER_LS_KEY, JSON.stringify(nextOrder)) } catch {}
    }
    try { localStorage.setItem(COL_LS_KEY, JSON.stringify([...next])) } catch {}
  }

  function resetVisibleCols() {
    const def = new Set(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key))
    setVisibleCols(def)
    const defOrder = COL_DEFS.map((c) => c.key)
    setColOrder(defOrder)
    try {
      localStorage.setItem(COL_LS_KEY, JSON.stringify([...def]))
      localStorage.setItem(COL_ORDER_LS_KEY, JSON.stringify(defOrder))
    } catch {}
  }

  function toggleCardField(key: CardFieldKey) {
    const next = new Set(cardFields)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCardFields(next)
    try { localStorage.setItem(CARD_FIELDS_LS_KEY, JSON.stringify([...next])) } catch {}
  }

  function resetCardFields() {
    const def = new Set(CARD_FIELD_DEFS.map((c) => c.key))
    const defOrder = CARD_FIELD_DEFS.map((c) => c.key)
    setCardFields(def)
    setCardOrder(defOrder)
    try {
      localStorage.setItem(CARD_FIELDS_LS_KEY, JSON.stringify([...def]))
      localStorage.setItem(CARD_ORDER_LS_KEY, JSON.stringify(defOrder))
    } catch {}
  }

  function updateSparkTf(next: SparkTf) {
    setSparkTf(next)
    try { localStorage.setItem(SPARK_TF_LS_KEY, next) } catch {}
  }

  function toggleHeader() {
    const next = !headerExpanded
    setHeaderExpanded(next)
    try { localStorage.setItem('pia.portfolioHeader.expanded', String(next)) } catch {}
  }

  function updateHidden(next: boolean) {
    setHidden(next)
    try {
      localStorage.setItem('pia.hideAmounts', String(next))
    } catch {}
  }

  async function rescan() {
    if (rescanning) return
    setRescanning(true)
    setRescanStatus('')
    try {
      const result = await fetchJson('/scanner/rescan', { method: 'POST' })
      setRescanStatus(safeMessage(result.message, 'Rescan complete'))
    } catch (error: any) {
      setRescanStatus(safeMessage(error?.detail, 'Scanner is offline. Try again when the backend is available.'))
    } finally {
      setRescanning(false)
    }
  }

  return (
    <main className="mobile-shell">
      <header className="mobile-top">
        <button
          type="button"
          className="mobile-icon-action"
          aria-label="Open settings"
          onClick={() => setActive('settings')}
        >
          <Menu size={18} />
        </button>
        <div className="mobile-top-brand">{headerTitle}</div>
        <div className="mobile-top-actions">
          <button
            type="button"
            className="mobile-icon-action"
            aria-label="Search stocks"
            aria-expanded={globalSearchOpen}
            onClick={() => setGlobalSearchOpen(true)}
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            className="mobile-icon-action"
            aria-label={privacyHidden ? 'Show amounts' : 'Hide amounts'}
            aria-pressed={privacyHidden}
            onClick={() => updateHidden(!hidden)}
          >
            {privacyHidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button
            type="button"
            className="mobile-icon-action"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(true)}
          >
            <Bell size={18} />
            {notificationCount > 0 ? <span className="mobile-icon-badge">{notificationCount}</span> : null}
          </button>
        </div>
      </header>

      {active === 'home' && (
        <MobileReorderableSections
          order={homeSectionOrder}
          onMoveUp={moveHomeSectionUp}
          onMoveDown={moveHomeSectionDown}
          onReset={resetHomeSections}
          sections={{
            'market-pulse': <MarketPulse items={dashboard?.macros?.market_strip || []} hidden={privacyHidden} />,
            'portfolio-insights': <PortfolioInsights portfolio={portfolio} positions={positions} hidden={privacyHidden} />,
            'urgent-alerts': <UrgentAlerts portfolio={portfolio} />,
            'daily-brief': <DailyBrief portfolio={portfolio} />,
            'scanner-setups': <ScannerSetups scanner={scanner} onSelect={setSelected} hidden={privacyHidden} />,
            'watchlist-movers': <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} hidden={privacyHidden} />,
          }}
        />
      )}

      {active === 'my-portfolio' && (
        <>
          {portfolioMenuOpen && (
            <MobileSheet title="Portfolio Options" onClose={() => setPortfolioMenuOpen(false)}>
              <div className="mobile-controls-list">
                <button
                  type="button"
                  className="mobile-control-row"
                  onClick={() => {
                    setPortfolioMenuOpen(false)
                    setColMenuOpen(true)
                  }}
                >
                  <SlidersHorizontal size={18} />
                  <div>
                    <strong>{portfolioView === 'table' ? 'Manage Table Columns' : 'Manage Card Fields'}</strong>
                    <span>{portfolioView === 'table' ? 'Choose, reorder, and time-scale portfolio table fields' : 'Choose and reorder portfolio card fields'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="mobile-control-row"
                  onClick={() => {
                    setPortfolioMenuOpen(false)
                    setManualHoldingOpen(true)
                  }}
                >
                  <Plus size={18} />
                  <div>
                    <strong>Add Manual Holding</strong>
                    <span>Search an instrument, select the match, then enter quantity and cost</span>
                  </div>
                </button>
              </div>
            </MobileSheet>
          )}
          {manualHoldingOpen && (
            <AddManualHoldingSheet
              onClose={() => setManualHoldingOpen(false)}
              onSaved={refreshDashboard}
            />
          )}
          {colMenuOpen && (portfolioView === 'table' ? (
            <MobileManageDisplay
              title="Manage Table Columns"
              addLabel="Add Columns"
              order={colOrder}
              visible={visibleCols}
              allKeys={[...COL_DEFS.map((c) => c.key), ...advancedFieldDefs.map((d) => d.key)]}
              defsByKey={(k) => {
                const c = COL_DEFS.find((d) => d.key === k)
                if (c) return { key: c.key, label: c.label, info: FIELD_INFO[c.key], locked: c.key === 'ticker' }
                const a = advancedFieldDefs.find((d) => d.key === k)
                if (a) return { key: a.key, label: a.label, info: FIELD_INFO[a.field] || 'Additional IBKR / backend field.' }
                return undefined
              }}
              sparkTf={sparkTf}
              onSparkTf={updateSparkTf}
              onToggle={toggleVisibleCol}
              onReorder={(next) => { setColOrder(next); try { localStorage.setItem(COL_ORDER_LS_KEY, JSON.stringify(next)) } catch {} }}
              onReset={resetVisibleCols}
              onClose={() => setColMenuOpen(false)}
            />
          ) : (
            <MobileManageDisplay
              title="Manage Card Fields"
              addLabel="Add Fields"
              order={cardOrder}
              visible={cardFields}
              allKeys={CARD_FIELD_DEFS.map((c) => c.key)}
              defsByKey={(k) => {
                const c = CARD_FIELD_DEFS.find((d) => d.key === k)
                return c ? { key: c.key, label: c.label, info: FIELD_INFO[c.key] } : undefined
              }}
              sparkTf={sparkTf}
              onSparkTf={updateSparkTf}
              onToggle={(k) => toggleCardField(k as CardFieldKey)}
              onReorder={(next) => { setCardOrder(next as CardFieldKey[]); try { localStorage.setItem(CARD_ORDER_LS_KEY, JSON.stringify(next)) } catch {} }}
              onReset={resetCardFields}
              onClose={() => setColMenuOpen(false)}
            />
          ))}
          <div className="mobile-portfolio-section">
            <PortfolioHeader
              portfolio={portfolio}
              positions={positions}
              hidden={privacyHidden}
              expanded={headerExpanded}
              onToggle={toggleHeader}
            />
            <div className="mobile-portfolio-header">
              <span className="mobile-portfolio-count">Positions</span>
              <div className="pf-header-actions">
                <div className="portfolio-view-toggle" role="group" aria-label="Portfolio view mode">
                  <button className={portfolioView === 'table' ? 'active' : ''} onClick={() => updatePortfolioView('table')}>Table</button>
                  <button className={portfolioView === 'cards' ? 'active' : ''} onClick={() => updatePortfolioView('cards')}>Cards</button>
                </div>
                <button
                  type="button"
                  className="pf-options-btn"
                  aria-label="Portfolio options"
                  aria-expanded={portfolioMenuOpen || colMenuOpen || manualHoldingOpen}
                  onClick={() => setPortfolioMenuOpen(true)}
                >
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
            {portfolioView === 'table'
              ? <MobilePortfolioTable rows={positions} onSelect={setSelected} hidden={privacyHidden} visibleCols={visibleCols} colOrder={colOrder} sparkTf={sparkTf} advancedDefs={advancedFieldDefs} />
              : <PositionCards rows={positions} onSelect={setSelected} hidden={privacyHidden} fields={cardFields} order={cardOrder} tf={sparkTf} />
            }
          </div>
        </>
      )}
      {active === 'watchlists' && <MobileWatchlistManager dashboard={dashboard} onSelect={setSelected} hidden={privacyHidden} />}
      {active === 'scanner' && <ScannerSetups scanner={scanner} onSelect={setSelected} hidden={privacyHidden} />}
      {active === 'markets-macro' && (
        <>
          <MarketPulse items={dashboard?.macros?.market_strip || []} hidden={privacyHidden} />
          <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} hidden={privacyHidden} />
        </>
      )}
      {!['home', 'my-portfolio', 'watchlists', 'scanner', 'markets-macro', 'settings', 'about'].includes(active) && (
        <WorkspaceShell workspaceId={active} workspace={getWorkspaceDefinition(workspaceConfig.workspaces, active)} hidden={privacyHidden} />
      )}
      {active === 'settings' && (
        <section className="mobile-section mobile-settings-section">
          <MobileStatusDock health={sourceHealth} hidden={privacyHidden} />
          <SettingsPage
            hidden={privacyHidden}
            variant="mobile"
            workspaceConfig={workspaceConfig}
            onSelectWorkspace={(workspaceId) => setActive(workspaceId)}
          />
        </section>
      )}
      {active === 'about' && <MobileAboutSection hidden={privacyHidden} />}

      <MobileBottomNav active={active} setActive={setActive} workspaces={workspaceConfig.workspaces} pinnedIds={workspaceConfig.pinnedMobile} />
      {selected && (
        <StockIntelligenceShell
          variant="mobile"
          ticker={selected.symbol || selected.ticker}
          position={selected}
          hidden={privacyHidden}
          onHiddenChange={updateHidden}
          onClose={() => setSelected(null)}
        />
      )}
      <MobileQuickControls
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        hidden={privacyHidden}
        onHiddenChange={updateHidden}
        onRescan={rescan}
        rescanning={rescanning}
        rescanStatus={rescanStatus}
        onOpenSettings={() => setActive('settings')}
      />
      <MobileNotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)} portfolio={portfolio} />
      {globalSearchOpen && (
        <GlobalStockSearch
          universe={searchUniverse}
          hidden={privacyHidden}
          onSelect={(symbol) => { setSelected({ symbol }); setGlobalSearchOpen(false) }}
          onClose={() => setGlobalSearchOpen(false)}
        />
      )}
    </main>
  )
}
