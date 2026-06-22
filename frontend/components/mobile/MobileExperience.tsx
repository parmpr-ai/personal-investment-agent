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
import CompanyLogo from '../intelligence/CompanyLogo'
import { preloadStockIntelligence } from '../intelligence/useStockIntelligence'
import { dedupePortfolioPositions, portfolioSourceBadgeLabel } from '../../lib/pia-api'
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
import { instrumentSearchErrorMessage, searchInstruments, type InstrumentMatch } from '../../lib/instrument-search'
import {
  buildWatchlistUniverse,
  resolveWatchlistRows,
  useCustomWatchlists,
} from '../watchlists/customWatchlists'
import { useDoubleTapToClose } from '../../hooks/useDoubleTapToClose'

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
const compactMoney = (v: any) => {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return null
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6)  return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toFixed(2)}`
}
const lastPriceValue = (item: any) => item?.last ?? item?.price ?? item?.market_price ?? item?.marketPrice ?? 0

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
    const response = await fetch('/api/dashboard', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw data
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
  const onDoubleTap = useDoubleTapToClose(onClose)
  return (
    <div className="mobile-sheet-root" role="presentation">
      <button
        type="button"
        className="mobile-sheet-overlay"
        aria-label={closeOnOverlay ? 'Close panel' : 'Panel backdrop'}
        onClick={closeOnOverlay ? onClose : undefined}
        tabIndex={closeOnOverlay ? 0 : -1}
      />
      <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onDoubleTap}>
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
  const [liveResults, setLiveResults] = useState<InstrumentMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const query = q.trim().toUpperCase()
  const localResults = (query
    ? universe.filter((u) => u.symbol.includes(query) || String(u.name || '').toUpperCase().includes(query))
    : universe
  ).slice(0, 8)
  const results = query && liveResults.length ? liveResults : localResults
  const exact = results.some((u) => String(u.symbol || '').toUpperCase() === query)

  useEffect(() => {
    if (!query) {
      setLiveResults([])
      setMessage('')
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setMessage('')
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchInstruments(query)
        if (!active) return
        setLiveResults(result.matches)
        setMessage(result.matches.length ? '' : 'No matching instruments found.')
      } catch (error) {
        if (!active) return
        setLiveResults([])
        setMessage(instrumentSearchErrorMessage(error, 'Instrument search is unavailable right now.'))
      } finally {
        if (active) setLoading(false)
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

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
        {loading && <div className="manual-lookup-status">Searching instruments...</div>}
        {!loading && message && <div className="manual-lookup-status">{message}</div>}
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
              <span className={`gsr-source gsr-source-${String(r.source || 'search').toLowerCase()}`}>{r.source || r.exchange || 'Search'}</span>
            </button>
          )
        })}
        {query && !loading && !exact && !liveResults.length ? (
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
            <div className="mobile-card-symbol">
              <CompanyLogo source={item} symbol={item.ticker || item.symbol} hidden={hidden} className="mtt-logo" />
              <div>
                <span>{item.label || 'Setup'}</span>
                <strong>{item.ticker}</strong>
              </div>
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
            <div className="mobile-card-symbol">
              <CompanyLogo source={item} symbol={item.symbol} hidden={hidden} className="mtt-logo" />
              <div>
                <span>{item.name}</span>
                <strong>{item.symbol}</strong>
              </div>
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

function PositionCard({
  position, fields, order, tf, grid, hidden, onSelect, onLongPress, context = 'portfolio',
}: {
  position: any; fields: Set<CardFieldKey>; order: CardFieldKey[]
  tf: SparkTf; grid: PortfolioCardGrid; hidden: boolean; onSelect: (p: any) => void
  onLongPress?: (p: any) => void; context?: 'portfolio' | 'watchlist'
}) {
  const pfOnly = context === 'watchlist'
  const show = (key: CardFieldKey) => fields.has(key) && !(pfOnly && (PORTFOLIO_ONLY_KEYS as CardFieldKey[]).includes(key))
  const [page, setPage] = useState(0)
  const bodyRef = useRef<HTMLDivElement>(null)
  const swipedRef = useRef(false)
  const touchState = useRef<{ x: number; y: number; locked: boolean | null; dx: number }>({ x: 0, y: 0, locked: null, dx: 0 })

  const risk = Number(position.risk || 0)
  const momentum = Number(position.momentum_score || position.momentum || 52)
  const change = Number(position.day_change_pct || position.change_pct || 0)
  const shares = Number(position.quantity ?? position.qty ?? 0)
  const last = Number(position.last || position.price || 0)
  const avgCost = Number(position.avg_price ?? position.avg_cost ?? 0)
  const marketValue = Number(position.market_value ?? last * shares)
  const dayPnl = Number(position.day_pnl ?? position.day_change ?? 0)
  const dayChange = Number(position.day_change ?? 0)
  const unreal = Number(position.unrealized || 0)
  const unrealPct = Number(
    position.unrealized_pct != null ? position.unrealized_pct : avgCost > 0 ? ((last - avgCost) / avgCost) * 100 : 0,
  )
  const macro = position.macro_sensitivity
  const newsCount = Number(position.news_count ?? position.news ?? position.news_score ?? 0)
  const hasAi = Boolean(position.ai_view || position.ai_score != null)
  const brandColor = position.brand || position.accent || undefined
  const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? '+' : ''}${fmt(v)}`

  const statsOrder = order.filter((k) => (CARD_STAT_KEYS as CardFieldKey[]).includes(k) && show(k))
  const showBars = show('risk') || show('momentum')
  const showChips = (show('news') && newsCount > 0) || (show('macro') && macro != null) || (show('ai') && hasAi)
  const showBottom = show('weight') || showChips

  function renderStatCell(k: CardFieldKey) {
    switch (k) {
      case 'shares': return <div key={k} className="mps-cell"><span>Shares</span><b>{hidden ? mask : shares.toLocaleString('en-US')}</b></div>
      case 'mktvalue': return <div key={k} className="mps-cell"><span>Mkt Value</span><b>{hidden ? mask : money(marketValue)}</b></div>
      case 'last': return <div key={k} className="mps-cell"><span>Last</span><b>{hidden ? mask : money(last)}</b></div>
      case 'avgcost': return <div key={k} className="mps-cell"><span>Avg Cost</span><b>{hidden ? mask : money(avgCost)}</b></div>
      case 'daypnl': return <div key={k} className="mps-cell"><span>Today P&amp;L</span><b className={dayPnl >= 0 ? 'green' : 'red'}>{hidden ? mask : `${signed(dayPnl, money)} (${signed(change, (n) => `${n.toFixed(2)}%`)})`}</b></div>
      case 'unrealized': return <div key={k} className="mps-cell mps-cell-full"><span>Unrealized</span><b className={unreal >= 0 ? 'green' : 'red'}>{hidden ? mask : `${signed(unreal, money)} (${signed(unrealPct, (n) => `${n.toFixed(1)}%`)})`}</b></div>
      case 'unrealizedpct': return <div key={k} className="mps-cell"><span>Unreal %</span><b className={unrealPct >= 0 ? 'green' : 'red'}>{hidden ? mask : signed(unrealPct, (n) => `${n.toFixed(2)}%`)}</b></div>
      case 'daychange': return <div key={k} className="mps-cell"><span>Day $</span><b className={dayChange >= 0 ? 'green' : 'red'}>{hidden ? mask : signed(dayChange, money)}</b></div>
      case 'daypct': return <div key={k} className="mps-cell"><span>Day %</span><b className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : signed(change, (n) => `${n.toFixed(2)}%`)}</b></div>
      case 'volume': return <div key={k} className="mps-cell"><span>Volume</span><b>{hidden ? mask : position.volume != null ? compactVolume(Number(position.volume)) : '—'}</b></div>
      case 'marketcap': return <div key={k} className="mps-cell"><span>Mkt Cap</span><b>{hidden ? mask : position.market_cap != null ? (compactMoney(position.market_cap) ?? '—') : '—'}</b></div>
      default: return null
    }
  }

  // Sections
  const sparkSection = show('sparkline') ? (
    <div className="mobile-position-spark">
      <Sparkline values={resolveSpark(position, tf)} tone={change >= 0 ? 'good' : 'bad'} />
      <span className="mobile-spark-tf">{tf}</span>
    </div>
  ) : null

  const statsSection = statsOrder.length > 0 ? (
    <div className="mobile-position-stats">{statsOrder.map(renderStatCell)}</div>
  ) : null

  const intelSection = (showBars || showBottom) ? (
    <>
      {showBars && (
        <div className="mps-bars">
          {show('risk') && <RiskBar value={risk || 31} />}
          {show('momentum') && <MomentumBar value={momentum} />}
        </div>
      )}
      {showBottom && (
        <div className="mobile-position-bottom">
          {show('weight') ? (
            hidden ? (
              <div className="mobile-exposure-gauge" style={{ '--exposure-value': '0deg' } as CSSProperties}><b>••</b><span>exposure</span></div>
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
    </>
  ) : null

  // Swipeable pages for 2x2 only
  const usePager = grid === '2x2'
  const pages = usePager
    ? ([sparkSection, statsSection, intelSection] as Array<ReactNode | null>).filter((p) => p != null)
    : []
  const pageCount = pages.length
  const clampedPage = Math.min(page, Math.max(0, pageCount - 1))

  useEffect(() => {
    if (!usePager || pageCount <= 1) return
    const el = bodyRef.current
    if (!el) return
    function getTrack() { return el.querySelector<HTMLElement>('.card-pager-track') }
    function onStart(e: TouchEvent) {
      touchState.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null, dx: 0 }
      const t = getTrack(); if (t) t.style.transition = 'none'
    }
    function onMove(e: TouchEvent) {
      const t = touchState.current
      const dx = e.touches[0].clientX - t.x
      const dy = e.touches[0].clientY - t.y
      if (t.locked === null) {
        if (Math.abs(dx) > Math.abs(dy) + 8) t.locked = true
        else if (Math.abs(dy) > Math.abs(dx) + 8) t.locked = false
      }
      if (t.locked === true) {
        e.preventDefault()
        t.dx = dx
        const track = getTrack()
        if (track) track.style.transform = `translateX(calc(${-clampedPage * 100}% + ${dx}px))`
      }
    }
    function onEnd() {
      const t = touchState.current
      const track = getTrack()
      if (t.locked === true) {
        const targetPage = t.dx < -50
          ? Math.min(clampedPage + 1, pageCount - 1)
          : t.dx > 50 ? Math.max(clampedPage - 1, 0) : clampedPage
        if (track) {
          track.style.transition = ''
          track.style.transform = `translateX(${-targetPage * 100}%)`
        }
        if (Math.abs(t.dx) > 30) swipedRef.current = true
        setPage(targetPage)
      } else {
        if (track) { track.style.transition = ''; track.style.transform = '' }
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [usePager, pageCount, clampedPage])

  const header = (
    <div className="mobile-card-head">
      <div className="mobile-card-symbol">
        <CompanyLogo source={position} symbol={position.symbol} hidden={hidden} className="mtt-logo" />
        <div>
          <strong>{hidden ? mask : position.symbol}</strong>
          <span>{hidden ? 'Workspace item' : position.name || 'Portfolio holding'}</span>
          <small className="mobile-card-last-price">{hidden ? mask : money(last)}</small>
        </div>
      </div>
      <IntelligenceBadge label={pct(change)} tone={change >= 0 ? 'good' : 'bad'} />
    </div>
  )

  return (
    <button
      className={`mobile-visual-card mobile-position-card${brandColor ? ' themed' : ''}${usePager ? ' has-pages' : ''}`}
      onClick={(e) => {
        if (swipedRef.current) { swipedRef.current = false; return }
        onSelect(position)
      }}
      onContextMenu={onLongPress ? (e) => { e.preventDefault(); onLongPress(position) } : undefined}
      style={brandColor ? { borderTopColor: brandColor } as CSSProperties : undefined}
    >
      {header}
      {usePager ? (
        <div className="card-pager" ref={bodyRef}>
          {pageCount > 1 ? (
            <>
              <div className="card-pager-clip">
                <div className="card-pager-track" style={{ transform: `translateX(${-clampedPage * 100}%)` }}>
                  {pages.map((pg, i) => <div key={i} className="card-pager-page">{pg}</div>)}
                </div>
              </div>
              <div className="card-pager-dots">
                {pages.map((_, i) => (
                  <span
                    key={i}
                    className={i === clampedPage ? 'active' : ''}
                    onClick={(e) => { e.stopPropagation(); setPage(i) }}
                  />
                ))}
              </div>
            </>
          ) : pages[0] ?? null}
        </div>
      ) : (
        <>
          {sparkSection}
          {statsSection}
          {intelSection}
        </>
      )}
    </button>
  )
}

function PositionCards({ rows, onSelect, hidden = false, fields, order, tf, grid = '1x1' }: { rows: any[]; onSelect: (position: any) => void; hidden?: boolean; fields: Set<CardFieldKey>; order: CardFieldKey[]; tf: SparkTf; grid?: PortfolioCardGrid }) {
  const positions = rows.length ? rows : positionFallback
  return (
    <SwipeRail
      title="Positions"
      icon={<BriefcaseBusiness size={18} />}
      items={positions}
      className={`mobile-position-rail mobile-position-grid-${grid}`}
      hideHeader
      render={(position: any) => (
        <PositionCard
          position={position}
          fields={fields}
          order={order}
          tf={tf}
          grid={grid}
          hidden={hidden}
          onSelect={onSelect}
        />
      )}
    />
  )
}

const WL_COL_DEFS: { key: string; label: string }[] = [
  { key: 'instrument',  label: 'INSTRUMENT' },
  { key: 'last',        label: 'LAST' },
  { key: 'change',      label: 'CHNG' },
  { key: 'changePercent', label: 'CHG%' },
  { key: 'volume',      label: 'VLM' },
  { key: 'marketCap',   label: 'MKT CAP' },
  { key: 'pe',          label: 'P/E' },
  { key: 'eps',         label: 'EPS' },
  { key: 'beta',        label: 'BETA' },
  { key: 'avgVolume',   label: 'AVG VOL' },
  { key: 'high52w',     label: '52W HI' },
  { key: 'low52w',      label: '52W LO' },
  { key: 'sector',      label: 'SECTOR' },
  { key: 'industry',    label: 'INDUSTRY' },
]
const WL_DATA_KEYS = WL_COL_DEFS.filter((c) => c.key !== 'instrument').map((c) => c.key)
const WL_COL_ORDER_KEY = 'pia.watchlist.colOrder'
function readWlColOrder(): string[] {
  try {
    const raw = localStorage.getItem(WL_COL_ORDER_KEY)
    if (raw) {
      const arr = (JSON.parse(raw) as string[]).filter((k) => WL_DATA_KEYS.includes(k))
      if (arr.length) return ['instrument', ...arr, ...WL_DATA_KEYS.filter((k) => !arr.includes(k))]
    }
  } catch {}
  return ['instrument', ...WL_DATA_KEYS]
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
  const [wlCardManageOpen, setWlCardManageOpen] = useState(false)
  const [validation, setValidation] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const universe = useMemo(() => buildWatchlistUniverse(dashboard, [...positionFallback, ...scannerFallback]), [dashboard])
  const rows = useMemo(() => resolveWatchlistRows(activeList?.tickers || activeList?.symbols || [], universe), [activeList, universe])
  const view = activeList?.viewMode || 'table'
  const [cardGrid, setCardGrid] = useState<PortfolioCardGrid>('1x1')
  const [wlCardPrefs, setWlCardPrefs] = useState<CardPrefs>(() => readWlCardPrefs())
  const wlCardFields = wlCardPrefs[cardGrid].fields
  const wlCardOrder = wlCardPrefs[cardGrid].order
  const [lpTarget, setLpTarget] = useState<any | null>(null)
  const [addPickerSymbol, setAddPickerSymbol] = useState<string | null>(null)
  const listHasSymbol = (list: any, sym: string) => (list?.tickers || list?.symbols || []).includes(sym)
  const [colOrder, setColOrder] = useState<string[]>(['instrument', ...WL_DATA_KEYS])
  const [addMatches, setAddMatches] = useState<InstrumentMatch[]>([])
  const [addLookupLoading, setAddLookupLoading] = useState(false)
  const [addLookupMessage, setAddLookupMessage] = useState('')
  useEffect(() => {
    try { const g = localStorage.getItem('pia.watchlist.cardGrid'); if (g === '1x1' || g === '2x2' || g === '3x3') setCardGrid(g as PortfolioCardGrid) } catch {}
    setColOrder(readWlColOrder())
    setWlCardPrefs(readWlCardPrefs())
  }, [])

  function toggleWlCardField(key: CardFieldKey) {
    const current = wlCardPrefs[cardGrid]
    const next = new Set(current.fields)
    if (next.has(key)) { next.delete(key) } else { next.add(key) }
    const updated = { ...wlCardPrefs, [cardGrid]: { ...current, fields: next } }
    setWlCardPrefs(updated)
    savePrefsToKey(WL_CARD_PREFS_LS_KEY, updated)
  }
  function resetWlCardFields() {
    const fresh = defaultWlCardPrefs()
    const updated = { ...wlCardPrefs, [cardGrid]: fresh[cardGrid] }
    setWlCardPrefs(updated)
    savePrefsToKey(WL_CARD_PREFS_LS_KEY, updated)
  }
  function reorderWlCardFields(next: string[]) {
    const updated = { ...wlCardPrefs, [cardGrid]: { ...wlCardPrefs[cardGrid], order: next as CardFieldKey[] } }
    setWlCardPrefs(updated)
    savePrefsToKey(WL_CARD_PREFS_LS_KEY, updated)
  }
  function reorderCols(next: string[]) {
    setColOrder(next)
    try { localStorage.setItem(WL_COL_ORDER_KEY, JSON.stringify(next.filter((k) => k !== 'instrument'))) } catch {}
  }
  function chooseView(list: any, mode: 'table' | 'list', grid?: PortfolioCardGrid) {
    if (list) setListViewMode(list.id, mode)
    if (grid) { setCardGrid(grid); try { localStorage.setItem('pia.watchlist.cardGrid', grid) } catch {} }
    setMenuOpen(false)
  }

  function submitList(e: any) {
    e.preventDefault()
    createList(newListName)
    setNewListName('')
  }

  function addTickerSymbol(rawSymbol: string) {
    if (!activeList) return
    const symbol = rawSymbol.trim().toUpperCase()
    if (!symbol) return
    if ((activeList.tickers || activeList.symbols || []).includes(symbol)) {
      setValidation(`${symbol} is already in ${activeList.name}.`)
      return
    }
    addSymbol(activeList.id, symbol)
    setNewTicker('')
    setAddMatches([])
    setAddLookupMessage('')
    setValidation('')
    setAdding(false)
  }

  function submitTicker(e: any) {
    e.preventDefault()
    if (addLookupLoading) {
      setValidation('Finish the instrument search before adding.')
      return
    }
    const exact = addMatches.find((match) => match.symbol === newTicker.trim().toUpperCase())
    const match = exact || (addMatches.length === 1 ? addMatches[0] : null)
    if (!match) {
      setValidation(addLookupMessage || 'Select a matching instrument before adding.')
      return
    }
    addTickerSymbol(match.symbol)
  }

  useEffect(() => {
    const query = newTicker.trim()
    if (!adding || !query) {
      setAddMatches([])
      setAddLookupMessage('')
      setAddLookupLoading(false)
      return
    }
    if (!validManualSearch(query)) {
      setAddMatches([])
      setAddLookupMessage('Enter a ticker or company name.')
      setAddLookupLoading(false)
      return
    }
    let active = true
    setAddLookupLoading(true)
    setAddLookupMessage('')
    const timer = window.setTimeout(async () => {
      try {
        const result = await searchInstruments(query)
        if (!active) return
        setAddMatches(result.matches)
        setAddLookupMessage(result.matches.length ? 'Select the matching instrument to add.' : 'No matching instruments found.')
      } catch (error) {
        if (!active) return
        setAddMatches([])
        setAddLookupMessage(instrumentSearchErrorMessage(error, 'Instrument search is unavailable right now.'))
      } finally {
        if (active) setAddLookupLoading(false)
      }
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [adding, newTicker])

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
      </div>

      <div className="mobile-watchlist-tabs" aria-label="Watchlist tabs">
        <div className="mobile-watchlist-tabrail">
          {lists.map((list) => (
            <button key={list.id} type="button" className={list.id === activeId ? 'active' : ''} onClick={() => selectList(list.id)}>
              {hidden ? 'List' : list.name}
            </button>
          ))}
        </div>
        <button type="button" className="mobile-watchlist-plus" aria-label="Add instrument" onClick={() => setAdding(true)}>
          <Plus size={16} />
        </button>
        <button type="button" className="mobile-icon-action mobile-watchlist-menu-btn" aria-label="Watchlist actions" onClick={() => setMenuOpen(true)}>
          <MoreVertical size={18} />
        </button>
      </div>
      {adding && (
        <form className="mobile-watchlist-addform" onSubmit={submitTicker}>
          <input value={newTicker} onChange={(e) => { setNewTicker(e.target.value.toUpperCase()); setValidation('') }} placeholder="Ticker" aria-label="Ticker to add" autoFocus />
          <button type="submit" disabled={addLookupLoading || addMatches.length === 0}>Add</button>
          <button type="button" className="wl-add-cancel" aria-label="Cancel" onClick={() => { setAdding(false); setNewTicker(''); setAddMatches([]); setValidation('') }}>✕</button>
        </form>
      )}
      {adding && addLookupLoading && <div className="manual-lookup-status">Searching instruments...</div>}
      {adding && !addLookupLoading && addLookupMessage && <div className="manual-lookup-status">{addLookupMessage}</div>}
      {adding && !addLookupLoading && addMatches.length > 0 && (
        <div className="manual-lookup-results">
          {addMatches.map((match) => (
            <button type="button" key={`${match.symbol}-${match.exchange || match.name}`} onClick={() => addTickerSymbol(match.symbol)}>
              <b>{match.symbol}</b>
              <span>{match.name || match.symbol}</span>
              <small>{[match.exchange, match.asset_type, match.currency].filter(Boolean).join(' / ')}</small>
            </button>
          ))}
        </div>
      )}
      {validation && <div className="mobile-watchlist-validation">{validation}</div>}

      {rows.length === 0 ? (
        <div className="mobile-watchlist-empty">
          <strong>{hidden ? 'Workspace ready' : 'No tickers yet'}</strong>
          <span>{hidden ? mask : 'Add AMD, NBIS, IREN, or any ticker to this custom watchlist.'}</span>
        </div>
      ) : view === 'table' ? (
        <MobileWatchlistTable rows={rows} columns={activeList?.columns} colOrder={colOrder} onSelect={onSelect} onRemove={(symbol) => activeList && removeSymbol(activeList.id, symbol)} onLongPress={setLpTarget} hidden={hidden} />
      ) : (
        <MobileWatchlistCards rows={rows} onSelect={onSelect} onRemove={(symbol) => activeList && removeSymbol(activeList.id, symbol)} onLongPress={setLpTarget} hidden={hidden} grid={cardGrid} fields={wlCardFields} order={wlCardOrder} />
      )}
      {menuOpen && activeList && (
        <MobileSheet title="Watchlist Actions" onClose={() => setMenuOpen(false)}>
          <div className="mobile-watchlist-sheet-menu">
            <span>View</span>
            <button type="button" className={view === 'table' ? 'active' : ''} onClick={() => chooseView(activeList, 'table')}>Table</button>
            <button type="button" className={view === 'list' && cardGrid === '1x1' ? 'active' : ''} onClick={() => chooseView(activeList, 'list', '1x1')}>Cards 1×1</button>
            <button type="button" className={view === 'list' && cardGrid === '2x2' ? 'active' : ''} onClick={() => chooseView(activeList, 'list', '2x2')}>Cards 2×2</button>
            <button type="button" className={view === 'list' && cardGrid === '3x3' ? 'active' : ''} onClick={() => chooseView(activeList, 'list', '3x3')}>Cards 3×3</button>
            <span>Watchlist</span>
            <button type="button" onClick={() => { setMenuOpen(false); createPromptList() }}>New Watchlist</button>
            <button type="button" onClick={() => { setMenuOpen(false); renamePromptList() }}>Rename Watchlist</button>
            <button type="button" onClick={() => { setMenuOpen(false); setEditOpen(true) }}>Manage Watchlists</button>
            <button type="button" onClick={() => { setMenuOpen(false); setManageColumnsOpen(true) }}>Manage Columns</button>
            {view === 'list' && (
              <button type="button" onClick={() => { setMenuOpen(false); setWlCardManageOpen(true) }}>Manage Card Fields</button>
            )}
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
          <ReorderList
            items={colOrder.map((key) => ({ key, label: WL_COL_DEFS.find((c) => c.key === key)?.label || key }))}
            hiddenKeys={new Set(WL_DATA_KEYS.filter((key) => activeList.columns?.[key] === false))}
            lockedKeys={new Set(['instrument'])}
            onReorder={reorderCols}
            onToggle={(key) => key !== 'instrument' && toggleColumn(activeList.id, key as keyof typeof activeList.columns)}
          />
        </MobileSheet>
      )}
      {wlCardManageOpen && (
        <MobileManageDisplay
          title={`Manage ${cardGrid.toUpperCase()} Card Fields`}
          addLabel="Add Fields"
          order={wlCardOrder}
          visible={wlCardFields}
          allKeys={CARD_FIELD_DEFS.filter((d) => !(PORTFOLIO_ONLY_KEYS as CardFieldKey[]).includes(d.key)).map((d) => d.key)}
          defsByKey={(k) => { const c = CARD_FIELD_DEFS.find((d) => d.key === k); return c ? { key: c.key, label: c.label, info: FIELD_INFO[c.key] } : undefined }}
          sparkTf={DEFAULT_SPARK_TF}
          onSparkTf={() => {}}
          showSparkTf={false}
          onToggle={(k) => toggleWlCardField(k as CardFieldKey)}
          onReorder={reorderWlCardFields}
          onReset={resetWlCardFields}
          templates={CARD_TEMPLATES.map((t) => ({ ...t, fields: t.fields.filter((f) => !(PORTFOLIO_ONLY_KEYS as CardFieldKey[]).includes(f)) }))}
          onApplyTemplate={(keys) => {
            const updated = { ...wlCardPrefs, [cardGrid]: makeCardPrefs(keys, keys, keys)[cardGrid] }
            setWlCardPrefs(updated)
            savePrefsToKey(WL_CARD_PREFS_LS_KEY, updated)
          }}
          onClose={() => setWlCardManageOpen(false)}
        />
      )}
      {lpTarget && (
        <MobileSheet title={hidden ? 'Actions' : (lpTarget.symbol || 'Actions')} onClose={() => setLpTarget(null)}>
          <div className="mobile-watchlist-sheet-menu">
            <button type="button" onClick={() => { const t = lpTarget; setLpTarget(null); onSelect({ ...t, initialTab: 'Technical' }) }}>Open Chart</button>
            <button type="button" onClick={() => { const t = lpTarget; setLpTarget(null); onSelect(t) }}>Open Stock Intelligence</button>
            <button type="button" onClick={() => { const t = lpTarget; setLpTarget(null); onSelect({ ...t, initialTab: 'Analysis' }) }}>AI Coach</button>
            <button type="button" onClick={() => { setAddPickerSymbol(lpTarget.symbol); setLpTarget(null) }}>Add To Watchlist</button>
            <button type="button" className="wl-action-danger" onClick={() => { if (activeList) removeSymbol(activeList.id, lpTarget.symbol); setLpTarget(null) }}>Remove From Watchlist</button>
          </div>
        </MobileSheet>
      )}
      {addPickerSymbol && (
        <MobileSheet title={hidden ? 'Add to list' : `Add ${addPickerSymbol} to…`} onClose={() => setAddPickerSymbol(null)}>
          <div className="mobile-watchlist-sheet-menu">
            {lists.map((list) => {
              const on = listHasSymbol(list, addPickerSymbol)
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`wl-add-row${on ? ' active' : ''}`}
                  aria-pressed={on}
                  onClick={() => (on ? removeSymbol(list.id, addPickerSymbol) : addSymbol(list.id, addPickerSymbol))}
                >
                  <span className="wl-add-check">{on ? '✓' : ''}</span>
                  {hidden ? 'List' : list.name}
                </button>
              )
            })}
            <button type="button" className="pf-col-reset" onClick={() => setAddPickerSymbol(null)}>Done</button>
          </div>
        </MobileSheet>
      )}
    </section>
  )
}

function MobileWatchlistTable({ rows, columns = { instrument: true, last: true, change: true, changePercent: true, volume: true }, colOrder = ['instrument', 'last', 'change', 'changePercent', 'volume'], onSelect, onRemove, onLongPress, hidden }: { rows: any[]; columns?: any; colOrder?: string[]; onSelect: (position: any) => void; onRemove: (symbol: string) => void; onLongPress?: (row: any) => void; hidden: boolean }) {
  // Split-layer frozen column (PIA-UAT-FIX-001D): the instrument column is a
  // separate non-scrolling left layer outside the horizontal scroller, so
  // scrolled cells can never bleed behind/left of it on iOS.
  const WL_TH: Record<string, string> = {
    last: 'LAST', change: 'CHNG', changePercent: 'CHG%', volume: 'VLM',
    marketCap: 'MKT CAP', pe: 'P/E', eps: 'EPS', beta: 'BETA',
    avgVolume: 'AVG VOL', high52w: '52W HI', low52w: '52W LO',
    sector: 'SECTOR', industry: 'INDUSTRY',
  }
  const dataCols = colOrder.filter((k) => k !== 'instrument' && columns[k] !== false)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  function cycleSort(key: string) {
    setSort((s) => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))
  }
  function wlSortVal(row: any, key: string): number {
    switch (key) {
      case 'last':          return Number(row.last || row.price || 0)
      case 'change':        return Number(row.day_pnl || 0)
      case 'changePercent': return Number(row.day_change_pct || 0)
      case 'volume':        return Number(row.volume || 0)
      case 'marketCap':     return Number(row.market_cap || row.marketCap || 0)
      case 'pe':            return Number(row.pe || row.pe_ratio || row.pe_ttm || 0)
      case 'eps':           return Number(row.eps || row.eps_ttm || 0)
      case 'beta':          return Number(row.beta || 0)
      case 'avgVolume':     return Number(row.avg_volume || row.average_volume || 0)
      case 'high52w':       return Number(row.week52_high || row['52w_high'] || row.high_52w || 0)
      case 'low52w':        return Number(row.week52_low || row['52w_low'] || row.low_52w || 0)
      default:              return 0
    }
  }
  const wlCompactMoney = compactMoney
  // Sorting cycles asc -> desc -> default. Both layers use the same sorted array
  // so the frozen Instrument column stays row-aligned. Text keys use localeCompare.
  const sortedRows = sort
    ? [...rows].sort((a, b) => {
        if (sort.key === 'symbol' || sort.key === 'sector' || sort.key === 'industry') {
          const av = String(a[sort.key] || ''), bv = String(b[sort.key] || '')
          return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        }
        return sort.dir === 'asc' ? wlSortVal(a, sort.key) - wlSortVal(b, sort.key) : wlSortVal(b, sort.key) - wlSortVal(a, sort.key)
      })
    : rows
  function wlCell(key: string, row: any) {
    if (hidden) return <td key={key}>{mask}</td>
    switch (key) {
      case 'last':          return <td key={key}>{money(row.last || row.price)}</td>
      case 'change':        return <td key={key} className={Number(row.day_pnl) >= 0 ? 'green' : 'red'}>{money(row.day_pnl)}</td>
      case 'changePercent': return <td key={key} className={Number(row.day_change_pct) >= 0 ? 'green' : 'red'}>{pct(row.day_change_pct)}</td>
      case 'volume':        return <td key={key}>{compactVolume(row.volume)}</td>
      case 'marketCap': {   const v = wlCompactMoney(row.market_cap || row.marketCap); return <td key={key}>{v ?? '—'}</td> }
      case 'pe': {          const v = row.pe ?? row.pe_ratio ?? row.pe_ttm; return <td key={key}>{v != null ? Number(v).toFixed(2) : '—'}</td> }
      case 'eps': {         const v = row.eps ?? row.eps_ttm; return <td key={key}>{v != null ? money(v) : '—'}</td> }
      case 'beta': {        const v = row.beta; return <td key={key}>{v != null ? Number(v).toFixed(2) : '—'}</td> }
      case 'avgVolume': {   const v = row.avg_volume || row.average_volume; return <td key={key}>{v ? compactVolume(v) : '—'}</td> }
      case 'high52w': {     const v = row.week52_high ?? row['52w_high'] ?? row.high_52w; return <td key={key}>{v != null ? money(v) : '—'}</td> }
      case 'low52w': {      const v = row.week52_low ?? row['52w_low'] ?? row.low_52w; return <td key={key}>{v != null ? money(v) : '—'}</td> }
      case 'sector':        return <td key={key} className="muted">{row.sector || '—'}</td>
      case 'industry':      return <td key={key} className="muted">{row.industry || '—'}</td>
      default:              return <td key={key}>—</td>
    }
  }
  return (
    <div className="mptbl-split">
      {columns.instrument && (
        <div className="mptbl-frozen pf-wl-frozen">
          <div
            className={`mptbl-fcell mptbl-fhead wl-th-sort${sort?.key === 'symbol' ? ' sorted' : ''}`}
            role="button"
            aria-sort={sort?.key === 'symbol' ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            onClick={() => cycleSort('symbol')}
          >
            INSTRMNT{sort?.key === 'symbol' ? <span className="wl-sort-arrow">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span> : null}
          </div>
          {sortedRows.map((row) => (
            <button key={row.symbol} type="button" className="mptbl-fcell mptbl-frow" onClick={() => onSelect(row)} onContextMenu={(e) => { e.preventDefault(); onLongPress?.(row) }}>
              <div className="mtt-symbol">
                <CompanyLogo source={row} symbol={row.symbol} hidden={hidden} className="mtt-logo" />
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
              {dataCols.map((key) => (
                <th
                  key={key}
                  className={`wl-th-sort${sort?.key === key ? ' sorted' : ''}`}
                  role="button"
                  aria-sort={sort?.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => cycleSort(key)}
                >
                  {WL_TH[key] || key}
                  <span className="wl-sort-arrow" aria-hidden="true">{sort?.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.symbol} onClick={() => onSelect(row)} onContextMenu={(e) => { e.preventDefault(); onLongPress?.(row) }}>
                {dataCols.map((key) => wlCell(key, row))}
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

function MobileWatchlistCards({
  rows, onSelect, onLongPress, hidden, grid = '1x1', fields, order,
}: {
  rows: any[]; onSelect: (position: any) => void; onRemove: (symbol: string) => void
  onLongPress?: (row: any) => void; hidden: boolean; grid?: PortfolioCardGrid
  fields: Set<CardFieldKey>; order: CardFieldKey[]
}) {
  const gridClass = grid === '2x2' ? ' wl-grid-2' : grid === '3x3' ? ' wl-grid-3' : ''
  return (
    <div className={`mobile-watchlist-card-list${gridClass}`}>
      {rows.map((row) => (
        <PositionCard
          key={row.symbol}
          position={row}
          fields={fields}
          order={order}
          tf="5D"
          grid={grid}
          hidden={hidden}
          context="watchlist"
          onSelect={onSelect}
          onLongPress={onLongPress}
        />
      ))}
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

type PortfolioView = 'table' | 'cards-1x1' | 'cards-2x2' | 'cards-3x3'
type PortfolioCardGrid = '1x1' | '2x2' | '3x3'
const PORTFOLIO_VIEW_OPTIONS: { id: PortfolioView; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'cards-1x1', label: 'Cards 1x1' },
  { id: 'cards-2x2', label: 'Cards 2x2' },
  { id: 'cards-3x3', label: 'Cards 3x3' },
]

function normalizePortfolioView(value: string | null): PortfolioView | null {
  if (value === 'cards') return 'cards-1x1'
  return PORTFOLIO_VIEW_OPTIONS.some((option) => option.id === value) ? (value as PortfolioView) : null
}

function portfolioViewLabel(value: PortfolioView) {
  return PORTFOLIO_VIEW_OPTIONS.find((option) => option.id === value)?.label || 'Table'
}

function portfolioGridFromView(value: PortfolioView): PortfolioCardGrid {
  if (value === 'cards-2x2') return '2x2'
  if (value === 'cards-3x3') return '3x3'
  return '1x1'
}
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
  | 'sparkline'
  | 'shares' | 'mktvalue' | 'last' | 'avgcost' | 'daypnl' | 'unrealized'
  | 'unrealizedpct' | 'daychange' | 'daypct' | 'volume' | 'marketcap'
  | 'weight' | 'risk' | 'momentum' | 'macro' | 'ai' | 'news'
const CARD_FIELD_DEFS: { key: CardFieldKey; label: string }[] = [
  { key: 'sparkline',     label: 'Sparkline' },
  { key: 'shares',        label: 'Shares' },
  { key: 'mktvalue',      label: 'Market Value' },
  { key: 'avgcost',       label: 'Avg Cost' },
  { key: 'daypnl',        label: 'Today P&L' },
  { key: 'unrealized',    label: 'Unrealized P&L' },
  { key: 'unrealizedpct', label: 'Unrealized %' },
  { key: 'daychange',     label: 'Daily $' },
  { key: 'daypct',        label: 'Daily %' },
  { key: 'volume',        label: 'Volume' },
  { key: 'marketcap',     label: 'Market Cap' },
  { key: 'last',          label: 'Last Price' },
  { key: 'weight',        label: 'Portfolio %' },
  { key: 'risk',          label: 'Risk' },
  { key: 'momentum',      label: 'Momentum' },
  { key: 'macro',         label: 'Macro β' },
  { key: 'ai',            label: 'AI' },
  { key: 'news',          label: 'News' },
]
// Stat-cell fields (rendered in the body, not the always-visible header)
const CARD_STAT_KEYS: CardFieldKey[] = [
  'shares', 'mktvalue', 'last', 'avgcost', 'daypnl', 'unrealized',
  'unrealizedpct', 'daychange', 'daypct', 'volume', 'marketcap',
]
const CARD_INTEL_KEYS: CardFieldKey[] = ['risk', 'momentum', 'weight', 'news', 'macro', 'ai']
// Fields that only make sense in a portfolio context (positions with cost basis / shares)
const PORTFOLIO_ONLY_KEYS: CardFieldKey[] = ['shares', 'mktvalue', 'avgcost', 'daypnl', 'unrealized', 'unrealizedpct', 'daychange', 'weight']

const CARD_PREFS_LS_KEY  = 'pia.cardPrefs.v1'
const WL_CARD_PREFS_LS_KEY = 'pia.wlCardPrefs.v1'

// Card templates (preset field sets)
const CARD_TEMPLATES: { id: string; label: string; fields: CardFieldKey[] }[] = [
  { id: 'compact',  label: 'Compact',  fields: ['sparkline'] },
  { id: 'balanced', label: 'Balanced', fields: ['sparkline', 'risk', 'momentum'] },
  { id: 'trader',   label: 'Trader',   fields: ['sparkline', 'daypct', 'volume', 'momentum'] },
  { id: 'investor', label: 'Investor', fields: ['sparkline', 'mktvalue', 'avgcost', 'unrealizedpct', 'risk'] },
]

type CardModeConfig = { fields: Set<CardFieldKey>; order: CardFieldKey[] }
type CardPrefs = Record<PortfolioCardGrid, CardModeConfig>

function makeCardPrefs(by1x1: CardFieldKey[], by2x2: CardFieldKey[], by3x3: CardFieldKey[]): CardPrefs {
  const all = CARD_FIELD_DEFS.map((c) => c.key)
  const mk = (keys: CardFieldKey[]) => ({ fields: new Set(keys), order: [...keys, ...all.filter(k => !keys.includes(k as CardFieldKey))] })
  return { '1x1': mk(by1x1), '2x2': mk(by2x2), '3x3': mk(by3x3) }
}

function defaultCardPrefs(): CardPrefs {
  return makeCardPrefs(
    ['sparkline', 'shares', 'mktvalue', 'avgcost', 'daypnl', 'unrealized', 'weight', 'risk', 'momentum', 'macro', 'ai', 'news'],
    ['sparkline'],
    ['sparkline'],
  )
}

function defaultWlCardPrefs(): CardPrefs {
  return makeCardPrefs(
    ['sparkline', 'risk', 'momentum', 'news', 'macro', 'ai'],
    ['sparkline'],
    ['sparkline'],
  )
}

type ManualInstrumentMatch = InstrumentMatch

const emptyManualHoldingForm = {
  ticker: '',
  quantity: '',
  avg_price: '',
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
  daychange: "Today's price change in dollars.",
  daypct: "Today's price change in percent.",
  volume: 'Number of shares traded today.',
  marketcap: 'Total market capitalisation of the instrument.',
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

function saveCardPrefs(prefs: CardPrefs) { savePrefsToKey(CARD_PREFS_LS_KEY, prefs) }

function loadCardPrefs(lsKey: string, defaultFn: () => CardPrefs): CardPrefs {
  const defaults = defaultFn()
  const all = CARD_FIELD_DEFS.map((c) => c.key)
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, { fields: CardFieldKey[]; order: CardFieldKey[] }>
      const parse = (grid: PortfolioCardGrid): CardModeConfig => {
        const s = saved[grid]
        if (!s) return defaults[grid]
        const fields = Array.isArray(s.fields) ? new Set(s.fields.filter((k): k is CardFieldKey => all.includes(k as CardFieldKey))) : defaults[grid].fields
        const order = Array.isArray(s.order) && s.order.length
          ? [...s.order.filter((k): k is CardFieldKey => all.includes(k as CardFieldKey)), ...all.filter(k => !s.order.includes(k as CardFieldKey))]
          : defaults[grid].order
        return { fields, order }
      }
      return { '1x1': parse('1x1'), '2x2': parse('2x2'), '3x3': parse('3x3') }
    }
  } catch {}
  return defaults
}

function savePrefsToKey(lsKey: string, prefs: CardPrefs) {
  try {
    const s = Object.fromEntries(Object.entries(prefs).map(([g, c]) => [g, { fields: [...(c.fields as Set<string>)], order: c.order }]))
    localStorage.setItem(lsKey, JSON.stringify(s))
  } catch {}
}

function readSavedCardPrefs() { return loadCardPrefs(CARD_PREFS_LS_KEY, defaultCardPrefs) }
function readWlCardPrefs()     { return loadCardPrefs(WL_CARD_PREFS_LS_KEY, defaultWlCardPrefs) }

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
          <div className="pf-header-source-row">
            <span className="badge">{portfolioSourceBadgeLabel(portfolio.source, portfolio.mode)}</span>
            <span className="pf-header-source-time">{hidden ? mask : portfolio.snapshot_timestamp ? `Last updated at ${new Date(portfolio.snapshot_timestamp).toLocaleString()}` : 'Live portfolio'}</span>
          </div>
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
  title, addLabel, order, visible, allKeys, defsByKey, sparkTf, onSparkTf, onToggle, onReorder, onReset, onClose, templates, onApplyTemplate, showSparkTf = true,
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
  templates?: { id: string; label: string; fields: CardFieldKey[] }[]
  onApplyTemplate?: (keys: CardFieldKey[]) => void
  showSparkTf?: boolean
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [info, setInfo] = useState<{ label: string; text: string } | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragKeyRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // All fields stay in the main list regardless of visible state (PORT-002).
  // "Add Columns" only surfaces keys not yet placed in the order at all.
  const enabled = order.map(defsByKey).filter((d): d is ManageItem => !!d)
  const seen = new Set<string>(order)
  const available = allKeys
    .filter((k) => !seen.has(k))
    .map(defsByKey)
    .filter((d): d is ManageItem => !!d)

  // Drag-to-reorder from the right-side grip. Reorders all fields in order
  // (both visible and hidden keep their relative positions).
  function reorderTo(key: string, targetKey: string) {
    if (key === targetKey) return
    const from = order.indexOf(key)
    const to = order.indexOf(targetKey)
    if (from < 0 || to < 0) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, key)
    onReorder(next)
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
        {templates && onApplyTemplate && (
          <div className="card-template-row">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`card-template-btn${[...visible].sort().join(',') === [...new Set(t.fields)].sort().join(',') ? ' active' : ''}`}
                onClick={() => onApplyTemplate(t.fields)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <ul
          className={`pf-manage-list${dragKey ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerDown={onListPointerDown}
          onPointerMove={onListPointerMove}
          onPointerUp={onListPointerEnd}
          onPointerCancel={onListPointerEnd}
        >
          {enabled.map((item) => {
            const on = visible.has(item.key)
            return (
              <li className={`pf-manage-row${dragKey === item.key ? ' dragging' : ''}`} key={item.key} data-key={item.key}>
                <span className="pf-manage-name">{item.label}</span>
                <button type="button" className="pf-manage-info" aria-label={`About ${item.label}`} onClick={() => setInfo({ label: item.label, text: item.info || 'No description available.' })}><Info size={15} /></button>
                <button
                  type="button"
                  className={`pf-manage-check${on ? ' on' : ''}`}
                  aria-label={on ? `Hide ${item.label}` : `Show ${item.label}`}
                  disabled={item.locked}
                  onClick={() => !item.locked && onToggle(item.key)}
                >
                  {on ? '✓' : ''}
                </button>
                <span className="pf-manage-grip" data-grip role="button" tabIndex={0} aria-label={`Drag to reorder ${item.label}`}><GripVertical size={18} /></span>
              </li>
            )
          })}
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
        {showSparkTf !== false && <SparkTfRail value={sparkTf} onChange={onSparkTf} />}
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
      const result = await searchInstruments(searchText).catch((error) => {
        if (active) {
          setMatches([])
          setLookupMessage(instrumentSearchErrorMessage(error, 'Instrument search is unavailable right now.'))
        }
        return null
      })
      if (!active) return
      if (!result) {
        setLookupLoading(false)
        return
      }
      const nextMatches = result.matches
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
    const result = await fetch('/api/manual-holdings', {
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
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw body
      return body
    }).catch((error) => {
      setStatus(manualHoldingError(error, 'Unable to save manual holding. The save proxy could not reach the backend or the backend rejected the holding.'))
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
                <CompanyLogo source={position} symbol={position.symbol} hidden={hidden} className="mtt-logo real-logo" />
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
  const [positionFilter, setPositionFilter] = useState<'all' | 'stocks' | 'options' | 'crypto'>('all')
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [portfolioMenuOpen, setPortfolioMenuOpen] = useState(false)
  const [manualHoldingOpen, setManualHoldingOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => new Set(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key)))
  const [colOrder, setColOrder] = useState<ColKey[]>(() => COL_DEFS.map((c) => c.key))
  const [cardPrefs, setCardPrefs] = useState<CardPrefs>(() => readSavedCardPrefs())
  const currentGrid = portfolioGridFromView(portfolioView)
  const cardFields = cardPrefs[currentGrid].fields
  const cardOrder = cardPrefs[currentGrid].order
  const [sparkTf, setSparkTf] = useState<SparkTf>(DEFAULT_SPARK_TF)
  const [quickOpen, setQuickOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [rescanStatus, setRescanStatus] = useState('')
  const [sourceHealth, setSourceHealth] = useState<any[]>([])

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(
    () => dedupePortfolioPositions(portfolio.positions || (portfolio.source === 'MOCK' || portfolio.mode === 'mock' ? positionFallback : [])),
    [portfolio.positions, portfolio.source, portfolio.mode],
  )
  // Dev/test helper: ?si=NVDA auto-opens SI panel (used by UAT scripts)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const si = params.get('si')
    if (!si) return
    const sym = si.toUpperCase()
    const pos = positionFallback.find((p) => p.symbol === sym) ?? { symbol: sym, quantity: 100, market_value: 10000, avg_price: 100, day_pnl: 50, unrealized: 200 }
    setSelected(pos)
  }, [])
  useEffect(() => {
    if (!positions.length) return
    const symbols = positions
      .map((position: any) => position.symbol || position.ticker || position.underlying)
      .filter(Boolean)
      .slice(0, 12)
    const timer = window.setTimeout(() => {
      symbols.forEach(preloadStockIntelligence)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [positions])
  const filteredPositions = useMemo(() => {
    if (positionFilter === 'all') return positions
    return positions.filter((p: any) => {
      const sym = String(p.symbol || '')
      const isOption = p.asset_class === 'Option' || p.instrument_type === 'OPT' || sym.includes(' ')
      const isCrypto = p.asset_class === 'Crypto' || p.instrument_type === 'CRYPTO' || p.sec_type === 'CRYPTO' || p.asset_class === 'CRYPTO'
      if (positionFilter === 'options') return isOption
      if (positionFilter === 'crypto') return isCrypto
      return !isOption && !isCrypto
    })
  }, [positions, positionFilter])
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
      const savedView = normalizePortfolioView(localStorage.getItem('pia.portfolioView.mobile'))
      if (savedView) setPortfolioView(savedView)
      if (localStorage.getItem('pia.portfolioHeader.expanded') === 'false') setHeaderExpanded(false)
      setVisibleCols(readSavedCols())
      setColOrder(readSavedOrder())
      setCardPrefs(readSavedCardPrefs())
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
    setPortfolioMenuOpen(false)
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
    const grid = portfolioGridFromView(portfolioView)
    const current = cardPrefs[grid]
    const next = new Set(current.fields)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    const updated = { ...cardPrefs, [grid]: { ...current, fields: next } }
    setCardPrefs(updated)
    saveCardPrefs(updated)
  }

  function resetCardFields() {
    const grid = portfolioGridFromView(portfolioView)
    const fresh = defaultCardPrefs()
    const updated = { ...cardPrefs, [grid]: fresh[grid] }
    setCardPrefs(updated)
    saveCardPrefs(updated)
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
              <div className="mobile-watchlist-sheet-menu mobile-portfolio-view-options">
                <span>View</span>
                {PORTFOLIO_VIEW_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={portfolioView === option.id ? 'active' : ''}
                    onClick={() => updatePortfolioView(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
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
              title={`Manage ${currentGrid.toUpperCase()} Card Fields`}
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
              onReorder={(next) => {
                const grid = portfolioGridFromView(portfolioView)
                const updated = { ...cardPrefs, [grid]: { ...cardPrefs[grid], order: next as CardFieldKey[] } }
                setCardPrefs(updated)
                saveCardPrefs(updated)
              }}
              onReset={resetCardFields}
              templates={CARD_TEMPLATES}
              onApplyTemplate={(keys) => {
                const grid = portfolioGridFromView(portfolioView)
                const updated = { ...cardPrefs, [grid]: makeCardPrefs(keys, keys, keys)[grid] }
                setCardPrefs(updated)
                saveCardPrefs(updated)
              }}
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
                <div className="pf-pos-filter" role="group" aria-label="Position type filter">
                  {(['all', 'stocks', 'options', 'crypto'] as const).map((f) => (
                    <button key={f} className={positionFilter === f ? 'active' : ''} onClick={() => setPositionFilter(f)}>
                      {f === 'all' ? 'All' : f === 'stocks' ? 'Stocks' : f === 'options' ? 'Options' : 'Crypto'}
                    </button>
                  ))}
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
              ? <MobilePortfolioTable rows={filteredPositions} onSelect={setSelected} hidden={privacyHidden} visibleCols={visibleCols} colOrder={colOrder} sparkTf={sparkTf} advancedDefs={advancedFieldDefs} />
              : <PositionCards rows={filteredPositions} onSelect={setSelected} hidden={privacyHidden} fields={cardFields} order={cardOrder} tf={sparkTf} grid={portfolioGridFromView(portfolioView)} />
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
        <MobileSheet title="Settings" onClose={() => setActive('home')}>
          <section className="mobile-section mobile-settings-section">
            <MobileStatusDock health={sourceHealth} hidden={privacyHidden} />
            <SettingsPage
              hidden={privacyHidden}
              variant="mobile"
              workspaceConfig={workspaceConfig}
              onSelectWorkspace={(workspaceId) => setActive(workspaceId)}
            />
          </section>
        </MobileSheet>
      )}
      {active === 'about' && <MobileAboutSection hidden={privacyHidden} />}

      <MobileBottomNav active={active} setActive={setActive} workspaces={workspaceConfig.workspaces} pinnedIds={workspaceConfig.pinnedMobile} />
      {selected && (
        <StockIntelligenceShell
          variant="mobile"
          ticker={selected.symbol || selected.ticker}
          position={selected}
          dashboard={dashboard}
          hidden={privacyHidden}
          onHiddenChange={updateHidden}
          onClose={() => setSelected(null)}
          onOpenSearch={() => setGlobalSearchOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
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
