'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
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
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'

const API       = process.env.NEXT_PUBLIC_API_URL       ?? 'http://127.0.0.1:8000'
const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

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

const navItems = [
  ['home', 'Home', Home],
  ['portfolio', 'Portfolio', Wallet],
  ['agent', 'Agent', Bot],
  ['scanner', 'Scanner', Sparkles],
  ['settings', 'Settings', Settings],
] as const

function useMobileDashboard() {
  const [dashboard, setDashboard] = useState<any>(null)

  useEffect(() => {
    fetch(`${API}/dashboard`)
      .then((response) => response.json())
      .then(setDashboard)
      .catch(() => {})

    let socket: WebSocket | undefined
    try {
      socket = new WebSocket(process.env.NEXT_PUBLIC_WS_URL ?? 'ws://127.0.0.1:8000/ws')
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.type === 'dashboard_update') setDashboard(payload)
        } catch {}
      }
    } catch {}

    return () => socket?.close()
  }, [])

  return dashboard
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

function MobileBottomNav({ active, setActive, agentRunning }: { active: string; setActive: (value: string) => void; agentRunning?: boolean }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile sections">
      {navItems.map(([id, label, Icon]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}
          style={{ position: 'relative' }}>
          <Icon size={20} />
          <span>{label}</span>
          {id === 'agent' && (
            <span style={{
              position: 'absolute',
              top: '6px',
              right: '18px',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: agentRunning ? '#24d18c' : '#374151',
              boxShadow: agentRunning ? '0 0 6px #24d18c' : 'none',
            }} />
          )}
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
function fmtMobileTs(ts: string | null | undefined): string {
  if (!ts) return '—'
  try {
    const age = Date.now() - new Date(ts).getTime()
    if (age < 60_000) return 'just now'
    if (age < 3_600_000) return `${Math.round(age / 60_000)}m ago`
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  } catch { return ts }
}

function MobileStatusDock({ health, hidden, portfolioSource, portfolio }: { health: any[]; hidden: boolean; portfolioSource?: string; portfolio?: any }) {
  const bySource = (name: string) => health.find((item: any) => item.source === name)
  const ibkrLive = portfolioSource === 'IBKR_LIVE'
  const ibkrHybrid = String(portfolioSource || '').includes('HYBRID')
  const badge = resolvePortfolioBadge(portfolio?.source, portfolio?.mode, { pricesLive: portfolio?.pricesLive, fallbackActive: portfolio?.fallback_active })
  const rows = [
    { name: 'IBKR', icon: Wallet, status: ibkrLive ? { status: 'healthy', data_received: true } : ibkrHybrid ? { status: 'degraded', data_received: false } : bySource('IBKR') },
    { name: 'Yahoo', icon: Globe2, status: bySource('Yahoo Finance') },
    { name: 'Feeds', icon: Database, status: bySource('RSS') },
  ]

  return (
    <section className="mobile-status-dock" aria-label="Connection status">
      <div className="mobile-status-dock-head">
        <ShieldCheck size={16} />
        <span>{hidden ? 'Status' : 'Connection Status'}</span>
        {!hidden && <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: badge.variant === 'ibkr' ? 'rgba(96,165,250,.12)' : badge.variant === 'warning' ? 'rgba(251,191,36,.12)' : 'rgba(100,116,139,.1)', color: badge.variant === 'ibkr' ? '#60a5fa' : badge.variant === 'warning' ? '#fbbf24' : '#94a3b8' }}>{badge.label}</span>}
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
      {!hidden && String(portfolio?.mode || '').toLowerCase() !== 'mock' && ['LAST_KNOWN', 'NO_DATA', 'STALE'].includes(String(portfolio?.priceSource || portfolio?.quoteProvider || '').toUpperCase()) && (
        <div className="mobile-fallback-strip">⚠ Prices may be stale{portfolio?.pricesLastRefresh ? ` — updated ${fmtMobileTs(portfolio.pricesLastRefresh)}` : ''}</div>
      )}
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
  ;(portfolio.guardrails || []).forEach((alert: any, i: number) => {
    items.push({
      id: `guardrail-${i}`,
      title: alert.title,
      text: alert.text,
      level: alert.level || 'warn',
      time: 'Now',
      category: 'Risk',
    })
  })
  ;(portfolio.today_actions || []).forEach((action: any, i: number) => {
    items.push({
      id: `action-${i}`,
      title: action.title,
      text: action.text,
      level: 'good',
      time: 'Today',
      category: 'Brief',
    })
  })
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
  const { currency, toggle: toggleCurrency, fmt } = useCurrency(Number(portfolio.fxRate || 0.87), portfolio.baseCurrency || 'USD')
  const insights = [
    {
      title: 'Net Worth',
      value: hidden ? mask : fmt(portfolio.total_value || 0),
      text: hidden ? mask : `${fmt(portfolio.daily_pnl || 0)} today`,
      type: 'spark',
      currency,
      onToggle: toggleCurrency,
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span>{item.title}</span>
            {item.type === 'spark' && item.onToggle && (
              <button
                type="button"
                className={`cur-chip cur-chip-mobile${item.currency === 'EUR' ? ' eur' : ''}`}
                onClick={(e) => { e.stopPropagation(); item.onToggle() }}
              >
                {item.currency === 'USD' ? '$ USD' : '€ EUR'}
              </button>
            )}
          </div>
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

function formatOptionSymbol(position: any): string {
  const base = String(position.underlying || String(position.symbol || '').split(' ')[0] || position.symbol || '')
  const strike = position.strike ? String(position.strike) : ''
  const rawPc = position.call_put || position.callPut || position.put_call || ''
  const pc = rawPc ? String(rawPc).charAt(0).toUpperCase() : ''
  const meta = strike && pc ? `${strike}${pc}` : pc || strike
  const expRaw = position.expiry || position.last_trade_date || ''
  let expStr = ''
  if (expRaw) {
    const d = new Date(expRaw)
    if (!isNaN(d.getTime())) {
      const mo = d.toLocaleString('en-US', { month: 'short' }).toUpperCase().slice(0, 3)
      expStr = ` ${mo}${String(d.getFullYear()).slice(2)}`
    }
  }
  return (`${base} ${meta}${expStr}`.trim()) || String(position.symbol || '')
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

  const risk = position.risk ?? null
  const momentum = position.momentum_score ?? position.momentum ?? null
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
          {show('risk') && (risk != null ? <RiskBar value={Number(risk)} /> : <span className="muted">Risk unavailable</span>)}
          {show('momentum') && (momentum != null ? <MomentumBar value={Number(momentum)} /> : <span className="muted">Momentum unavailable</span>)}
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
    const getTrack = () => el.querySelector<HTMLElement>('.card-pager-track')
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
          <strong>{hidden ? mask : resolveAssetClass(position) === 'option' ? formatOptionSymbol(position) : position.symbol}</strong>
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
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PIA] PositionCards mounted')
      return () => console.debug('[PIA] PositionCards unmounted')
    }
    return undefined
  }, [])
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

function ScenarioPill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      fontSize: '10px', fontWeight: 700, color, background: bg, border: `1px solid ${color}44`,
    }}>{label}</span>
  )
}

function AIIntelligenceWidget({ details, position }: { details: any; position: any }) {
  const forecast = details?.forecast || {}
  const watch    = details?.watch || {}
  const thesis   = details?.thesis || []
  const score    = Number(watch.score || position.momentum_score || 0)
  const aiView   = details?.position?.ai_view || position.ai_view || ''
  const whyMoving = details?.position?.why_moving || position.why_moving || ''

  const scoreColor = score >= 70 ? '#24d18c' : score >= 50 ? '#fbbf24' : '#fb7185'
  const scoreBg    = score >= 70 ? 'rgba(36,209,140,0.1)' : score >= 50 ? 'rgba(251,191,36,0.1)' : 'rgba(251,113,133,0.1)'
  const action     = watch.action || position.action || 'MONITOR'
  const actionColor = action === 'BUY' || action === 'SWING WATCH' ? '#24d18c' : action === 'SELL' ? '#fb7185' : '#fbbf24'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* Signal row */}
      {score > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px 12px',
        }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%', flexShrink: 0,
            background: scoreBg, border: `2px solid ${scoreColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', fontWeight: 800, color: scoreColor,
          }}>{score}</div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '3px' }}>PIA Signal</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: actionColor }}>{action}</div>
            {watch.reason && <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{watch.reason}</div>}
          </div>
        </div>
      )}

      {/* AI View */}
      {(aiView || thesis.length > 0) && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px' }}>
          <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Sparkles size={12} /> AI THESIS
          </div>
          {thesis.length > 0 ? (
            thesis.slice(0, 1).map((t: any) => (
              <div key={t.title}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)', marginBottom: '4px' }}>{t.title}</div>
                <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{t.summary || t.full_text}</p>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{aiView}</p>
          )}
        </div>
      )}

      {/* Why Moving */}
      {whyMoving && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px' }}>
          <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>WHY MOVING</div>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{whyMoving}</p>
        </div>
      )}

      {/* Bull / Base / Bear */}
      {(forecast.bull || forecast.base || forecast.bear) && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 600, marginBottom: '10px' }}>SCENARIOS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {forecast.bull && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ScenarioPill label="BULL" color="#24d18c" bg="rgba(36,209,140,0.1)" />
                <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4, flex: 1 }}>{forecast.bull}</span>
              </div>
            )}
            {forecast.base && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ScenarioPill label="BASE" color="#fbbf24" bg="rgba(251,191,36,0.1)" />
                <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4, flex: 1 }}>{forecast.base}</span>
              </div>
            )}
            {forecast.bear && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <ScenarioPill label="BEAR" color="#fb7185" bg="rgba(251,113,133,0.1)" />
                <span style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4, flex: 1 }}>{forecast.bear}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Entry / Target / Stop */}
      {(position.entry || position.target || position.stop) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: 'Entry', value: position.entry, color: '#38bdf8' },
            { label: 'Target', value: position.target, color: '#24d18c' },
            { label: 'Stop', value: position.stop, color: '#fb7185' },
          ].map(({ label, value, color }) => value && (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
              padding: '8px 6px', textAlign: 'center',
            }}>
              <div style={{ fontSize: '11px', color }}>{label}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--fg)', marginTop: '2px' }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {!aiView && thesis.length === 0 && !forecast.base && (
        <p style={{ fontSize: '12px', color: 'var(--muted)', textAlign: 'center', padding: '24px 0' }}>
          PIA has no saved thesis yet. Treat this as a watch item until catalyst, valuation, and risk checks agree.
        </p>
      )}
    </div>
  )
}

function MobileDetailView({ position, onClose }: { position: any; onClose: () => void }) {
  const [tab, setTab] = useState('Intelligence')
  const [details, setDetails] = useState<any>(null)
  const ticker = position.symbol || position.ticker
  const change = Number(position.day_change_pct || position.change_pct || position.change || 0)

  useEffect(() => {
    if (!ticker) return
    fetch(`${API}/stock/${encodeURIComponent(ticker)}`)
      .then((response) => response.json())
      .then(setDetails)
      .catch(() => {})
  }, [ticker])

  const tabs = ['Intelligence', 'News', 'Risk']

  return (
    <div className="mobile-detail" role="dialog" aria-modal="true" aria-label={`${ticker} details`}>
      <button className="mobile-detail-close" onClick={onClose} aria-label="Close detail">
        <X size={22} />
      </button>
      <header className="mobile-detail-hero">
        <div>
          <span>{position.name || 'Position detail'}</span>
          <h1>{ticker}</h1>
          <div className="mobile-detail-price">
            <strong>{money(position.last || position.price || details?.watch?.price || 0)}</strong>
            <small className={change >= 0 ? 'green' : 'red'}>{pct(change)}</small>
          </div>
        </div>
        <Sparkline values={position.spark} tone={change >= 0 ? 'good' : 'bad'} />
      </header>
      <section className="mobile-detail-chart">
        <Sparkline values={[31, 35, 33, 42, 45, 44, 52, 57, 54]} tone={change >= 0 ? 'good' : 'bad'} />
        <div className="mobile-detail-chart-meta">
          <span>Chart-first view</span>
          <b>{change >= 0 ? 'Constructive tape' : 'Pressure zone'}</b>
        </div>
      </section>
      <div className="mobile-detail-tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </div>
      <section className="mobile-detail-panel">
        {tab === 'Intelligence' && (
          <AIIntelligenceWidget details={details} position={position} />
        )}
        {tab === 'News' && (
          <div className="mobile-news-list">
            {(details?.news?.length ? details.news : [{ title: 'No fresh news loaded', impact: 'Neutral', action: 'Monitor only' }]).map(
              (item: any) => (
                <article key={item.title}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.impact} · {item.action}
                  </span>
                </article>
              ),
            )}
          </div>
        )}
        {tab === 'Risk' && (
          <div className="mobile-risk-grid">
            <span>
              Portfolio weight
              <b>{pct(position.portfolio_pct)}</b>
            </span>
            <span>
              Risk score
              <b>{position.risk || 31}</b>
            </span>
            <span>
              Macro sensitivity
              <b>{position.macro_sensitivity || '—'}</b>
            </span>
            <span>
              Momentum
              <b>{position.momentum_score || position.momentum || 52}</b>
            </span>
            <span>
              Stop discipline
              <b>{position.stop || 'Required'}</b>
            </span>
            <span>
              Entry zone
              <b>{position.entry || '—'}</b>
            </span>
          </div>
        )}
      </section>
    </div>
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

// ─── Agent tab data ───────────────────────────────────────────────────────────

function useAgentData() {
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [backtest, setBacktest] = useState<any>(null)

  useEffect(() => {
    const fetchAll = () => {
      fetch(`${AGENT_API}/agent/status`).then(r => r.json()).then(setAgentStatus).catch(() => {})
    }
    fetchAll()
    fetch(`${AGENT_API}/agent/backtest/status`).then(r => r.json()).then(d => {
      if (d?.status === 'completed') setBacktest(d)
    }).catch(() => {})

    const timer = setInterval(fetchAll, 30_000)
    return () => clearInterval(timer)
  }, [])

  return { agentStatus, backtest }
}

function RegimePill({ regime }: { regime: string }) {
  const colors: Record<string, [string, string]> = {
    BULL_TREND:   ['#24d18c', 'rgba(36,209,140,0.14)'],
    BEAR_TREND:   ['#fb7185', 'rgba(251,113,133,0.14)'],
    CHOPPY_RANGE: ['#fbbf24', 'rgba(251,191,36,0.14)'],
    CRISIS:       ['#ff6375', 'rgba(255,99,117,0.18)'],
  }
  const [color, bg] = colors[regime] ?? ['#8fa2b5', 'rgba(148,163,184,0.12)']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
      color, background: bg, border: `1px solid ${color}44`,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      {regime.replace(/_/g, ' ')}
    </span>
  )
}

function StatChip({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div style={{
      background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)',
      borderRadius: '14px', padding: '10px 6px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '16px', fontWeight: 800, color, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '3px', lineHeight: 1.3 }}>{label}</div>
    </div>
  )
}

function McStatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      flex: '1', textAlign: 'center', padding: '9px 4px',
      background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

function AgentQuickCard({ agentStatus, onTap }: { agentStatus: any; onTap: () => void }) {
  const running     = !!agentStatus?.running
  const port        = agentStatus?.paper_portfolio || {}
  const totalValue  = Number(port.total_value || 0)
  const totalRet    = Number(port.total_return_pct || 0)
  const summary     = agentStatus?.last_summary || {}
  const executed    = summary.executed ?? null
  const decisions   = summary.decisions ?? null
  const dailyPnl    = summary.daily_pnl_pct ?? null
  const circuitBroken = summary.circuit_broken === true
  const regime      = (agentStatus?.regime as string) || null
  const lastCycle   = agentStatus?.last_cycle
  const retColor    = totalRet >= 0 ? '#24d18c' : '#ff6375'

  const colors: Record<string, [string, string]> = {
    BULL_TREND:   ['#24d18c', 'rgba(36,209,140,0.14)'],
    BEAR_TREND:   ['#fb7185', 'rgba(251,113,133,0.14)'],
    CHOPPY_RANGE: ['#fbbf24', 'rgba(251,191,36,0.14)'],
    CRISIS:       ['#ff6375', 'rgba(255,99,117,0.18)'],
  }
  const [regimeColor, regimeBg] = (regime && colors[regime]) ? colors[regime] : ['#8fa2b5', 'rgba(148,163,184,0.12)']

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>AI Agent</h2>
        <Bot size={18} />
      </div>
      <button
        onClick={onTap}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        }}
      >
        <article className="mobile-visual-card" style={{
          border: circuitBroken
            ? '1px solid rgba(255,99,117,0.45)'
            : running
            ? '1px solid rgba(36,209,140,0.22)'
            : '1px solid rgba(148,163,184,0.14)',
        }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              {totalValue > 0 ? (
                <>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '3px' }}>Paper Portfolio</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                    {totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: retColor, marginTop: '2px' }}>
                    {totalRet >= 0 ? '+' : ''}{totalRet.toFixed(2)}% total
                    {dailyPnl !== null && (
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: Number(dailyPnl) >= 0 ? '#22c55e' : '#ef4444' }}>
                        Day: {Number(dailyPnl) >= 0 ? '+' : ''}{Number(dailyPnl).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: 'var(--muted)' }}>
                  {agentStatus === null ? 'Connecting…' : 'No data yet'}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
                background: running ? 'rgba(36,209,140,0.14)' : 'rgba(148,163,184,0.1)',
                border: `1px solid ${running ? 'rgba(36,209,140,0.4)' : 'rgba(148,163,184,0.25)'}`,
                color: running ? '#24d18c' : '#8fa2b5',
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: running ? '#24d18c' : '#8fa2b5',
                  boxShadow: running ? '0 0 6px #24d18c' : 'none',
                }} />
                {running ? 'RUNNING' : 'STOPPED'}
              </span>
              {circuitBroken && (
                <span style={{
                  fontSize: '11px', fontWeight: 700, color: '#ff6375',
                  background: 'rgba(255,99,117,0.12)', padding: '3px 8px', borderRadius: '999px',
                  border: '1px solid rgba(255,99,117,0.3)',
                }}>
                  ⛔ Circuit Breaker
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          {(executed !== null || decisions !== null || regime) && (
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {decisions !== null && (
                <div style={{ textAlign: 'center', minWidth: '44px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#60a5fa' }}>{decisions}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Decisions</div>
                </div>
              )}
              {executed !== null && (
                <div style={{ textAlign: 'center', minWidth: '44px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#24d18c' }}>{executed}</div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)' }}>Executed</div>
                </div>
              )}
              {regime && (
                <span style={{
                  marginLeft: 'auto',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
                  color: regimeColor, background: regimeBg, border: `1px solid ${regimeColor}44`,
                }}>
                  {regime.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(148,163,184,0.1)' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
              {lastCycle
                ? `Last cycle: ${(() => { try { return new Date(lastCycle).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) } catch { return lastCycle } })()}`
                : 'No cycles yet'}
            </span>
            <span style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600 }}>View Agent →</span>
          </div>
        </article>
      </button>
    </section>
  )
}

function AgentView({ agentStatus, backtest }: { agentStatus: any; backtest: any }) {

  const portfolio  = agentStatus?.paper_portfolio || {}
  const running    = !!agentStatus?.running
  const regime     = (agentStatus?.regime as string) || 'UNKNOWN'
  const vix        = Number(agentStatus?.macros?.vix || 0)
  const totalValue = Number(portfolio.total_value || 100_000)
  const totalRet   = Number(portfolio.total_return_pct || 0)
  const cash       = Number(portfolio.cash || 0)
  const longs      = Array.isArray(portfolio.longs) ? portfolio.longs.length : 0
  const shorts     = Array.isArray(portfolio.shorts) ? portfolio.shorts.length : 0
  const positions  = (portfolio.positions || []).length

  const mc          = backtest?.monte_carlo || {}
  const bestStrat   = Array.isArray(backtest?.strategies) ? backtest.strategies[0] : null
  const spyBm       = backtest?.spy_benchmark || {}

  const retColor = (v: number) => (v >= 0 ? '#24d18c' : '#ff6375')
  const fmtRet   = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

  return (
    <>
      {/* ── Hero status card ── */}
      <article className="mobile-visual-card" style={{ marginBottom: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
          <div>
            <span style={{ display: 'block', color: 'var(--muted)', fontSize: '12px', marginBottom: '4px' }}>
              Autonomous Agent
            </span>
            <strong style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              {totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
            </strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', paddingTop: '2px' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
              background: running ? 'rgba(36,209,140,0.14)' : 'rgba(148,163,184,0.1)',
              border: `1px solid ${running ? 'rgba(36,209,140,0.4)' : 'rgba(148,163,184,0.25)'}`,
              color: running ? '#24d18c' : '#8fa2b5',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: running ? '#24d18c' : '#8fa2b5' }} />
              {running ? 'RUNNING' : 'STOPPED'}
            </span>
            <RegimePill regime={regime} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: retColor(totalRet) }}>
            {fmtRet(totalRet)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            total return · VIX {vix.toFixed(1)}
          </span>
        </div>
      </article>

      {/* ── 6-chip stats grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '18px' }}>
        <StatChip label="Open Longs"  value={longs}     color="#24d18c" />
        <StatChip label="Positions"   value={positions} color="#a78bfa" />
        <StatChip label="Open Shorts" value={shorts}    color="#ff6375" />
        <StatChip label="Cash"        value={`$${(cash / 1000).toFixed(1)}k`}  color="#8fa2b5" />
        <StatChip label="Mode"        value="paper"     color="#60a5fa" />
        <StatChip label="Cycles"      value={agentStatus?.cycle_count ?? '—'} color="#fbbf24" />
      </div>

      {/* ── Backtest + Monte Carlo swipe rail ── */}
      {bestStrat ? (
        <SwipeRail
          title="Backtest · 2-year"
          icon={<TrendingUp size={18} />}
          items={[
            { _type: 'strategy' },
            ...(mc.final_return_pct ? [{ _type: 'mc' }] : []),
          ]}
          render={(item: any) => {
            if (item._type === 'mc') {
              const ret = mc.final_return_pct as Record<string, number>
              const dd  = mc.max_drawdown_pct  as Record<string, number>
              return (
                <article className="mobile-visual-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>Monte Carlo</span>
                      <strong style={{ fontSize: '14px', fontWeight: 700 }}>1 000 bootstrap paths</strong>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: 700,
                      color: (mc.prob_loss_pct ?? 0) > 25 ? '#ff6375' : '#24d18c',
                    }}>
                      P(loss) {(mc.prob_loss_pct ?? 0).toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                    <McStatBox label="Worst (P5)"  value={fmtRet(ret.p5)}  color="#ff6375" />
                    <McStatBox label="Median (P50)" value={fmtRet(ret.p50)} color="#eef4fb" />
                    <McStatBox label="Best (P95)"  value={fmtRet(ret.p95)} color="#24d18c" />
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Worst DD:&nbsp;
                      <span style={{ color: '#ff6375', fontWeight: 600 }}>{dd?.p5_worst?.toFixed(1)}%</span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Median DD:&nbsp;
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>{dd?.median?.toFixed(1)}%</span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      {mc.strategy}
                    </span>
                  </div>
                </article>
              )
            }

            // Best strategy card
            const s = bestStrat
            const alpha = (s.total_return || 0) - (spyBm?.total_return_pct || 0)
            const beating = alpha > 0
            return (
              <article className="mobile-visual-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ display: 'block', color: 'var(--muted)', fontSize: '12px' }}>Best Strategy</span>
                    <strong style={{ fontSize: '16px', fontWeight: 800 }}>{s.name}</strong>
                  </div>
                  <IntelligenceBadge
                    label={fmtRet(s.total_return || 0)}
                    tone={(s.total_return || 0) >= 0 ? 'good' : 'bad'}
                  />
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: '12px' }}>
                  <McStatBox label="Sharpe"   value={(s.sharpe || 0).toFixed(2)} color={(s.sharpe || 0) >= 1 ? '#24d18c' : '#fbbf24'} />
                  <McStatBox label="Win Rate" value={`${(s.win_rate || 0).toFixed(0)}%`} color={(s.win_rate || 0) >= 50 ? '#24d18c' : '#ff6375'} />
                  <McStatBox label="Max DD"   value={`${(s.max_dd || 0).toFixed(1)}%`} color="#ff6375" />
                </div>

                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                  {s.trades} trades&nbsp;·&nbsp;vs SPY&nbsp;
                  <span style={{ color: beating ? '#24d18c' : '#ff6375', fontWeight: 700 }}>
                    {beating ? `+${alpha.toFixed(1)}% alpha` : `${alpha.toFixed(1)}% vs SPY`}
                  </span>
                  &nbsp;·&nbsp;Calmar {(s.calmar || 0).toFixed(2)}
                </div>
              </article>
            )
          }}
        />
      ) : (
        <section className="mobile-section">
          <div className="mobile-section-title">
            <h2>Backtest</h2>
            <TrendingUp size={18} />
          </div>
          <div style={{ border: '1px dashed rgba(148,163,184,0.22)', borderRadius: '18px', padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px' }}>
            No backtest data — run backtest from the desktop Agent tab.
          </div>
        </section>
      )}

      {/* ── Open positions mini list ── */}
      {(portfolio.positions || []).length > 0 && (
        <section className="mobile-section">
          <div className="mobile-section-title">
            <h2>Open Positions</h2>
            <Activity size={18} />
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {(portfolio.positions as any[]).slice(0, 5).map((p: any, i: number) => {
              const pnl = Number(p.unrealized_pnl || 0)
              const pct2 = Number(p.pnl_pct || 0)
              const isLong = (p.side || '').toUpperCase() === 'LONG'
              return (
                <div key={`${p.ticker}-${i}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: '#0b1119',
                  border: '1px solid rgba(148,163,184,0.14)', borderRadius: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '36px', height: '36px', borderRadius: '10px',
                      background: isLong ? 'rgba(36,209,140,0.12)' : 'rgba(255,99,117,0.12)',
                      border: `1px solid ${isLong ? 'rgba(36,209,140,0.3)' : 'rgba(255,99,117,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 700,
                      color: isLong ? '#24d18c' : '#ff6375', flexShrink: 0,
                    }}>
                      {(p.ticker || '?').slice(0, 4)}
                    </span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.ticker}</div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        {p.qty} · {isLong ? 'LONG' : 'SHORT'} · entry ${(p.avg_price || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: retColor(pnl) }}>
                      {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
                    </div>
                    <div style={{ fontSize: '11px', color: retColor(pct2) }}>
                      {fmtRet(pct2)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

export default function MobileExperience() {
  const dashboard = useMobileDashboard()
  const { agentStatus, backtest } = useAgentData()
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
  const hasSeenDashboardRef = useRef(false)
  const prevHasDashboardRef = useRef(false)
  const lastLivePositionsRef = useRef<any[] | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[PIA] MobileExperience mounted')
      return () => console.debug('[PIA] MobileExperience unmounted')
    }
    return undefined
  }, [])

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(
    () => {
      const next = dedupePortfolioPositions(portfolio.positions || [])
      const liveMode =
        portfolio.source === 'IBKR_LIVE' ||
        portfolio.mode === 'ibkr-live' ||
        String(portfolio.source || '').includes('HYBRID') ||
        String(portfolio.mode || '').includes('HYBRID') ||
        portfolio.source === 'LAST_UPDATE' ||
        portfolio.mode === 'last-update' ||
        portfolio.source === 'MANUAL_HOLDINGS_LIVE_QUOTES'
      if (liveMode) {
        if (next.length) {
          lastLivePositionsRef.current = next
          return next
        }
        if (lastLivePositionsRef.current?.length) return lastLivePositionsRef.current
      }
      if (next.length) return next
      return portfolio.source === 'MOCK' || portfolio.mode === 'mock' ? positionFallback : []
    },
    [portfolio.positions, portfolio.source, portfolio.mode],
  )
  useEffect(() => {
    const hasDashboard = Boolean(dashboard)
    if (hasDashboard) hasSeenDashboardRef.current = true
    if (process.env.NODE_ENV !== 'production' && hasSeenDashboardRef.current && prevHasDashboardRef.current !== hasDashboard) {
      console.debug('[PIA] MobileExperience loading state toggled after initial load', { hasDashboard })
    }
    prevHasDashboardRef.current = hasDashboard
  }, [dashboard])
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
      const cls = resolveAssetClass(p)
      if (positionFilter === 'options') return cls === 'option'
      if (positionFilter === 'crypto') return cls === 'crypto'
      return cls === 'stock'
    })
  }, [positions, positionFilter])
  const advancedFieldDefs = useMemo(() => discoverAdvancedFields(positions), [positions])
  const scanner = dashboard?.scanner || scannerFallback
  const agentRunning = agentStatus?.running === true

  return (
    <main className="mobile-shell">
      <header className="mobile-top">
        <div>
          <span>PIA</span>
          <h1>Mobile Command</h1>
        </div>
        <button aria-label="Notifications">
          <Bell size={19} />
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

      {backendStatus === 'unavailable' && (
        <div className="mobile-backend-offline" role="alert">
          Backend unavailable — data may be stale
        </div>
      )}

      {active === 'home' && (
        <>
          <MarketPulse items={dashboard?.macros?.market_strip || []} />
          <AgentQuickCard agentStatus={agentStatus} onTap={() => setActive('agent')} />
          <PortfolioInsights portfolio={portfolio} positions={positions} />
          <UrgentAlerts portfolio={portfolio} />
          <DailyBrief portfolio={portfolio} />
          <ScannerSetups scanner={scanner} onSelect={setSelected} />
          <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} />
        </>
      )}

      {active === 'portfolio' && <PositionCards rows={positions} onSelect={setSelected} />}
      {active === 'agent'     && <AgentView agentStatus={agentStatus} backtest={backtest} />}
      {active === 'scanner'   && <ScannerSetups scanner={scanner} onSelect={setSelected} />}
      {active === 'settings'  && <PlaceholderPanel title="Settings" />}

      <MobileBottomNav active={active} setActive={setActive} agentRunning={agentRunning} />
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
