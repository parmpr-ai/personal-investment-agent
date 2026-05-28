'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
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
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import SettingsPage from '../settings/SettingsWorkspace'
import MobileReorderableSections from '../dashboard/MobileReorderableSections'
import StockIntelligenceShell from '../intelligence/StockIntelligenceShell'
import {
  DEFAULT_MOBILE_HOME_ORDER,
  MOBILE_HOME_LAYOUT_KEY,
} from '../dashboard/widgetRegistry'
import { usePersistedLayout } from '../dashboard/usePersistedLayout'
import type { MobileHomeSectionId } from '../dashboard/types'
import { API, fetchJson, mask, money, pct as formatPct, safeMessage } from '../../lib/pia-api'

type RailItem = Record<string, any>
type Tone = 'good' | 'bad' | 'neutral'

const pct = formatPct

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
    market_value: 24120,
    portfolio_pct: 18.4,
    risk: 72,
    momentum: 78,
    spark: [31, 34, 32, 41, 46, 43, 51],
    ai_view: 'AI infrastructure demand remains the core upside driver, with position sizing kept under the high-risk cap.',
  },
  {
    symbol: 'MSFT',
    name: 'Microsoft',
    last: 451.2,
    day_change_pct: 0.46,
    market_value: 18940,
    portfolio_pct: 14.5,
    risk: 38,
    momentum: 57,
    spark: [35, 36, 39, 38, 42, 44, 45],
    ai_view: 'Quality compounder profile with balanced cloud, AI, and enterprise durability.',
  },
  {
    symbol: 'SPY',
    name: 'S&P 500 ETF',
    last: 624.1,
    day_change_pct: -0.18,
    market_value: 15110,
    portfolio_pct: 11.6,
    risk: 29,
    momentum: 48,
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
  ['scanner', 'Scanner', Sparkles],
  ['markets', 'Markets', BarChart3],
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
      socket = new WebSocket('ws://127.0.0.1:8000/ws')
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
}: {
  title: string
  icon?: ReactNode
  items: RailItem[]
  render: (item: RailItem, index: number) => ReactNode
  className?: string
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

function MobileBottomNav({ active, setActive }: { active: string; setActive: (value: string) => void }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile sections">
      {navItems.map(([id, label, Icon]) => (
        <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}>
          <Icon size={20} />
          <span>{label}</span>
        </button>
      ))}
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
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="mobile-sheet-root" role="presentation">
      <button type="button" className="mobile-sheet-overlay" aria-label="Close panel" onClick={onClose} />
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

  return (
    <MobileSheet title="Search" onClose={onClose}>
      <div className="global-search-input">
        <Search size={16} />
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
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

function PositionCards({ rows, onSelect, hidden = false }: { rows: any[]; onSelect: (position: any) => void; hidden?: boolean }) {
  const positions = rows.length ? rows : positionFallback
  return (
    <SwipeRail
      title="Positions"
      icon={<BriefcaseBusiness size={18} />}
      items={positions}
      className="mobile-position-rail"
      render={(position: any) => {
        const risk = Number(position.risk || 0)
        const change = Number(position.day_change_pct || position.change_pct || 0)
        const unreal = Number(position.unrealized || 0)
        const unrealPct = Number(position.unrealized_pct || 0)
        const brandColor = position.brand || position.accent || undefined
        return (
          <button
            className={`mobile-visual-card mobile-position-card${brandColor ? ' themed' : ''}`}
            onClick={() => onSelect(position)}
            style={brandColor ? { borderTopColor: brandColor } as CSSProperties : undefined}
          >
            <div className="mobile-card-head">
              <div>
                <span>{position.name || 'Portfolio holding'}</span>
                <strong>{hidden ? mask : position.symbol}</strong>
              </div>
              <div className="mobile-price-stack">
                <b>{hidden ? mask : money(position.last || position.price || position.market_value)}</b>
                <small className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(change)}</small>
              </div>
            </div>
            <Sparkline values={position.spark} tone={change >= 0 ? 'good' : 'bad'} />
            {position.unrealized !== undefined && (
              <div className="mobile-position-pnl">
                <span className={unreal >= 0 ? 'green' : 'red'}>
                  {hidden ? mask : `${unreal >= 0 ? '+' : ''}${money(unreal)}`}
                </span>
                <small className={unrealPct >= 0 ? 'green' : 'red'}>
                  {hidden ? mask : `${unrealPct >= 0 ? '+' : ''}${unrealPct.toFixed(1)}%`}
                </small>
              </div>
            )}
            <div className="mobile-position-footer">
              {hidden ? <span className="muted">{mask}</span> : <ExposureGauge value={Number(position.portfolio_pct || 0)} />}
              <div>
                {hidden ? <span className="muted">{mask}</span> : <RiskBar value={risk || 31} />}
                {hidden ? <span className="muted">{mask}</span> : <MomentumBar value={Number(position.momentum_score || position.momentum || 52)} />}
              </div>
            </div>
          </button>
        )
      }}
    />
  )
}

type PortfolioView = 'table' | 'cards'
type ColKey = 'price' | 'change' | 'pnl' | 'daypnl' | 'weight' | 'risk' | 'avgcost' | 'sector' | 'macro'
type TableSortKey = 'symbol' | 'last' | 'change' | 'pnl' | 'daypnl' | 'weight' | 'risk' | 'avgcost'

const COL_DEFS: { key: ColKey; label: string; sortKey?: TableSortKey; defaultOn: boolean }[] = [
  { key: 'price',   label: 'Price',      sortKey: 'last',    defaultOn: true },
  { key: 'change',  label: 'Chg %',      sortKey: 'change',  defaultOn: true },
  { key: 'pnl',     label: 'Unrlzd',     sortKey: 'pnl',     defaultOn: true },
  { key: 'daypnl',  label: 'Day P/L',    sortKey: 'daypnl',  defaultOn: true },
  { key: 'weight',  label: 'Wt %',       sortKey: 'weight',  defaultOn: true },
  { key: 'risk',    label: 'Risk',       sortKey: 'risk',    defaultOn: true },
  { key: 'avgcost', label: 'Avg Cost',   sortKey: 'avgcost', defaultOn: false },
  { key: 'sector',  label: 'Sector',                         defaultOn: false },
  { key: 'macro',   label: 'Macro β',                        defaultOn: false },
]
const COL_LS_KEY = 'pia.portfolioColumns.mobile'

const COL_ORDER_LS_KEY = 'pia.portfolioColOrder.mobile'

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

function PortfolioColumnSheet({ visible, order, onToggle, onReorder, onReset, onClose }: {
  visible: Set<ColKey>
  order: ColKey[]
  onToggle: (key: ColKey) => void
  onReorder: (next: ColKey[]) => void
  onReset: () => void
  onClose: () => void
}) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const pointerRef = useRef<{ id: number; idx: number } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  function onListPointerDown(e: PointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (!target.closest('[data-drag-handle]')) return
    const row = target.closest('[data-ci]') as HTMLElement
    if (!row) return
    const idx = parseInt(row.dataset.ci || '0', 10)
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    pointerRef.current = { id: e.pointerId, idx }
    setActiveIdx(idx)
  }

  function onListPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current || !listRef.current) return
    const y = e.clientY
    const items = listRef.current.querySelectorAll('[data-ci]') as NodeListOf<HTMLElement>
    let targetIdx = pointerRef.current.idx
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect()
      if (y >= rect.top && y < rect.bottom) targetIdx = i
    })
    if (targetIdx !== pointerRef.current.idx) {
      const next = [...order]
      const [item] = next.splice(pointerRef.current.idx, 1)
      next.splice(targetIdx, 0, item)
      onReorder(next)
      pointerRef.current.idx = targetIdx
      setActiveIdx(targetIdx)
    }
  }

  function onListPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!pointerRef.current) return
    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
    pointerRef.current = null
    setActiveIdx(null)
  }

  return (
    <MobileSheet title="Columns" onClose={onClose}>
      <div
        ref={listRef}
        className="pf-col-list"
        style={{ touchAction: 'none' }}
        onPointerDown={onListPointerDown}
        onPointerMove={onListPointerMove}
        onPointerUp={onListPointerUp}
        onPointerCancel={onListPointerUp}
      >
        {order.map((key, idx) => {
          const col = COL_DEFS.find((c) => c.key === key)
          if (!col) return null
          const on = visible.has(key)
          return (
            <div key={key} data-ci={String(idx)} className={`pf-col-row${activeIdx === idx ? ' dragging' : ''}`}>
              <div data-drag-handle className="pf-col-drag-handle" style={{ touchAction: 'none' }}>
                <GripVertical size={14} />
              </div>
              <button
                type="button"
                className={`pf-col-toggle${on ? ' active' : ''}`}
                onClick={() => !pointerRef.current && onToggle(key)}
              >
                <span className="pf-col-check">{on ? '✓' : ''}</span>
                {col.label}
              </button>
            </div>
          )
        })}
        <button type="button" className="pf-col-reset" onClick={onReset}>Reset to defaults</button>
      </div>
    </MobileSheet>
  )
}

function MobilePortfolioTable({ rows, onSelect, hidden, visibleCols, colOrder }: { rows: any[]; onSelect: (p: any) => void; hidden: boolean; visibleCols: Set<ColKey>; colOrder: ColKey[] }) {
  const [sort, setSort] = useState<TableSortKey>('weight')
  const [dir, setDir] = useState<'desc' | 'asc'>('desc')

  function toggleSort(col: TableSortKey) {
    if (sort === col) setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSort(col); setDir('desc') }
  }

  const sorted = useMemo(() => {
    const key = (p: any): string | number => {
      switch (sort) {
        case 'symbol':  return String(p.symbol || '')
        case 'last':    return Number(p.last || p.price || 0)
        case 'change':  return Number(p.day_change_pct || 0)
        case 'pnl':     return Number(p.unrealized || 0)
        case 'daypnl':  return Number(p.day_pnl || 0)
        case 'weight':  return Number(p.portfolio_pct || 0)
        case 'risk':    return Number(p.risk || 0)
        case 'avgcost': return Number(p.avg_price || p.avg_cost || 0)
        default:        return 0
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
    const dayPnl = Number(position.day_pnl || 0)
    const risk = Number(position.risk || 0)
    if (hidden) return <td key={col}>{mask}</td>
    switch (col) {
      case 'price':
        return <td key={col}>{money(position.last || position.price || 0)}</td>
      case 'change':
        return <td key={col} className={change >= 0 ? 'green' : 'red'}>{pct(change)}</td>
      case 'pnl':
        return (
          <td key={col} className={unreal >= 0 ? 'green' : 'red'}>
            {`${unreal >= 0 ? '+' : ''}${money(unreal)}`}
            {unrealPct !== 0 && <><br /><small style={{ fontSize: 10, opacity: .72 }}>{unrealPct >= 0 ? '+' : ''}{unrealPct.toFixed(1)}%</small></>}
          </td>
        )
      case 'daypnl':
        return <td key={col} className={dayPnl >= 0 ? 'green' : 'red'}>{`${dayPnl >= 0 ? '+' : ''}${money(dayPnl)}`}</td>
      case 'weight':
        return <td key={col}>{Number(position.portfolio_pct || 0).toFixed(1)}%</td>
      case 'risk':
        return (
          <td key={col}>
            <span className={`mtt-risk ${risk >= 70 ? 'bad' : risk >= 45 ? 'warn' : 'good'}`}>{risk}</span>
          </td>
        )
      case 'avgcost':
        return <td key={col}>{money(position.avg_price || position.avg_cost || 0)}</td>
      case 'sector':
        return <td key={col} className="muted" style={{ fontSize: 11 }}>{String(position.sector || '—')}</td>
      case 'macro':
        return <td key={col}>{Number(position.macro_sensitivity || 0)}</td>
      default:
        return <td key={col}>—</td>
    }
  }

  const orderedCols = colOrder
    .map((k) => COL_DEFS.find((c) => c.key === k))
    .filter((c): c is (typeof COL_DEFS)[number] => !!c && visibleCols.has(c.key))

  return (
    <div className="mobile-terminal-wrap">
      <table className="mobile-terminal-table">
        <thead>
          <tr>
            <th className="mtt-col-frozen" onClick={() => toggleSort('symbol')}>
              {sort === 'symbol' ? <span className="sort-arrow">{dir === 'desc' ? '↓' : '↑'}</span> : null}Sym
            </th>
            {orderedCols.map((col) => {
              const active = col.sortKey && sort === col.sortKey
              return (
                <th key={col.key} className={active ? 'col-sorted' : ''} onClick={() => col.sortKey && toggleSort(col.sortKey)}>
                  {col.label}{active ? <span className="sort-arrow">{dir === 'desc' ? '↓' : '↑'}</span> : null}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((position) => (
            <tr key={position.symbol} onClick={() => onSelect(position)}>
              <td className="mtt-col-frozen">
                <div className="mtt-symbol">
                  <div className="mtt-logo" style={{ background: position.accent || '#60a5fa' }}>
                    {hidden ? '●' : (position.logo || String(position.symbol || '').slice(0, 2))}
                  </div>
                  <strong className="mtt-sym-label">{hidden ? mask : position.symbol}</strong>
                </div>
              </td>
              {orderedCols.map((col) => renderCell(col.key, position))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function MobileExperience() {
  const dashboard = useMobileDashboard()
  const [active, setActive] = useState('home')
  const [selected, setSelected] = useState<any>(null)
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [portfolioView, setPortfolioView] = useState<PortfolioView>('table')
  const [headerExpanded, setHeaderExpanded] = useState(true)
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  const [visibleCols, setVisibleCols] = useState<Set<ColKey>>(() => new Set(COL_DEFS.filter((c) => c.defaultOn).map((c) => c.key)))
  const [colOrder, setColOrder] = useState<ColKey[]>(() => COL_DEFS.map((c) => c.key))
  const [quickOpen, setQuickOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [rescanning, setRescanning] = useState(false)
  const [rescanStatus, setRescanStatus] = useState('')
  const [sourceHealth, setSourceHealth] = useState<any[]>([])

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
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

  function updateColOrder(next: ColKey[]) {
    setColOrder(next)
    try { localStorage.setItem(COL_ORDER_LS_KEY, JSON.stringify(next)) } catch {}
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
        <div className="mobile-top-brand">PIA</div>
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

      {active === 'portfolio' && (
        <>
          {colMenuOpen && (
            <PortfolioColumnSheet
              visible={visibleCols}
              order={colOrder}
              onToggle={toggleVisibleCol}
              onReorder={updateColOrder}
              onReset={resetVisibleCols}
              onClose={() => setColMenuOpen(false)}
            />
          )}
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
                {portfolioView === 'table' && (
                  <button type="button" className="pf-columns-btn" onClick={() => setColMenuOpen(true)}>
                    <SlidersHorizontal size={13} /> Cols
                  </button>
                )}
                <div className="portfolio-view-toggle" role="group" aria-label="Portfolio view mode">
                  <button className={portfolioView === 'table' ? 'active' : ''} onClick={() => updatePortfolioView('table')}>Table</button>
                  <button className={portfolioView === 'cards' ? 'active' : ''} onClick={() => updatePortfolioView('cards')}>Cards</button>
                </div>
              </div>
            </div>
            {portfolioView === 'table'
              ? <MobilePortfolioTable rows={positions} onSelect={setSelected} hidden={privacyHidden} visibleCols={visibleCols} colOrder={colOrder} />
              : <PositionCards rows={positions} onSelect={setSelected} hidden={privacyHidden} />
            }
          </div>
        </>
      )}
      {active === 'scanner' && <ScannerSetups scanner={scanner} onSelect={setSelected} hidden={privacyHidden} />}
      {active === 'markets' && (
        <>
          <MarketPulse items={dashboard?.macros?.market_strip || []} hidden={privacyHidden} />
          <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} hidden={privacyHidden} />
        </>
      )}
      {active === 'settings' && (
        <section className="mobile-section mobile-settings-section">
          <MobileStatusDock health={sourceHealth} hidden={privacyHidden} />
          <SettingsPage hidden={privacyHidden} variant="mobile" />
        </section>
      )}

      <MobileBottomNav active={active} setActive={setActive} />
      {selected && (
        <StockIntelligenceShell
          variant="mobile"
          ticker={selected.symbol || selected.ticker}
          position={selected}
          hidden={privacyHidden}
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
