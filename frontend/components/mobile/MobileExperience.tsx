'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Cpu,
  Gauge,
  Home,
  Landmark,
  MoreVertical,
  Newspaper,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'

const API = 'http://127.0.0.1:8000'

type RailItem = Record<string, any>
type Tone = 'good' | 'bad' | 'neutral'

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

const pct = (value: unknown) => `${Number(value || 0).toFixed(2)}%`

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
  const railRef = useRef<HTMLDivElement>(null)

  function updateActive() {
    const node = railRef.current
    if (!node) return
    const width = node.firstElementChild?.clientWidth || node.clientWidth
    const next = Math.round(node.scrollLeft / Math.max(width + 12, 1))
    setActive(Math.max(0, Math.min(items.length - 1, next)))
  }

  return (
    <section className={`mobile-section ${className}`.trim()}>
      <div className="mobile-section-title">
        <h2>{title}</h2>
        {icon}
      </div>
      <div className="mobile-swipe-rail" ref={railRef} onScroll={updateActive}>
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

function SearchCommand() {
  return (
    <div className="mobile-search">
      <Search size={18} />
      <input placeholder="Ask PIA or search ticker..." aria-label="Ask PIA or search ticker" />
      <button aria-label="Open filters">
        <SlidersHorizontal size={18} />
      </button>
    </div>
  )
}

function MarketPulse({ items }: { items: any[] }) {
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
                <strong>{item.value}</strong>
              </div>
              <IntelligenceBadge label={pct(item.chg)} tone={tone} />
            </div>
            <Sparkline values={item.spark} tone={tone} />
          </article>
        )
      }}
    />
  )
}

function PortfolioInsights({ portfolio, positions }: { portfolio: any; positions: any[] }) {
  const top = positions[0] || positionFallback[0]
  const insights = [
    { title: 'Net Worth', value: money(portfolio.total_value || 58170), text: `${money(portfolio.daily_pnl || 420)} today`, type: 'spark' },
    { title: 'Exposure Leader', value: top.symbol, text: `${pct(top.portfolio_pct)} of portfolio`, type: 'exposure', exposure: top.portfolio_pct || 18 },
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

function ScannerSetups({ scanner, onSelect }: { scanner: any[]; onSelect: (position: any) => void }) {
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
            <b>{money(item.price)}</b>
          </div>
          <Sparkline values={item.spark} tone="good" />
          <p>{item.setup}</p>
          <div className="mobile-setup-footer">
            <span>Entry {item.entry_zone || 'Review'}</span>
            <IntelligenceBadge label={`${item.score || 64} score`} tone="good" />
          </div>
        </button>
      )}
    />
  )
}

function WatchlistMovers({ scanner, positions, onSelect }: { scanner: any[]; positions: any[]; onSelect: (position: any) => void }) {
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
              <b>{money(item.price)}</b>
              <small className={Number(item.change) >= 0 ? 'green' : 'red'}>{pct(item.change)}</small>
            </div>
          </div>
          <Sparkline values={item.spark} tone={Number(item.change) >= 0 ? 'good' : 'bad'} />
          <RiskMeter value={Number(item.risk || 0)} />
        </button>
      )}
    />
  )
}

function PositionCards({ rows, onSelect }: { rows: any[]; onSelect: (position: any) => void }) {
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
        return (
          <button className="mobile-visual-card mobile-position-card" onClick={() => onSelect(position)}>
            <div className="mobile-card-head">
              <div>
                <span>{position.name || 'Portfolio holding'}</span>
                <strong>{position.symbol}</strong>
              </div>
              <div className="mobile-price-stack">
                <b>{money(position.last || position.price || position.market_value)}</b>
                <small className={change >= 0 ? 'green' : 'red'}>{pct(change)}</small>
              </div>
            </div>
            <Sparkline values={position.spark} tone={change >= 0 ? 'good' : 'bad'} />
            <div className="mobile-position-footer">
              <ExposureGauge value={Number(position.portfolio_pct || 0)} />
              <div>
                <IntelligenceBadge label={`${risk || 31} risk`} tone={riskTone(risk || 31)} />
                <MomentumBar value={Number(position.momentum_score || position.momentum || 52)} />
              </div>
            </div>
          </button>
        )
      }}
    />
  )
}

function BullSVG({ size = 90 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.88)} viewBox="0 0 110 97" fill="none">
      <defs>
        <filter id="bull-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="bull-floor" cx="50%" cy="100%" r="50%">
          <stop offset="0%" stopColor="#24d18c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#24d18c" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* floor glow */}
      <ellipse cx="55" cy="93" rx="38" ry="6" fill="url(#bull-floor)" />
      <g filter="url(#bull-glow)" stroke="#24d18c" strokeLinejoin="round" strokeLinecap="round">
        {/* body */}
        <polygon points="38,24 86,16 92,50 80,66 34,64 28,44" fill="#24d18c18" strokeWidth="1.6" />
        {/* internal body facets */}
        <line x1="38" y1="24" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="86" y1="16" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="92" y1="50" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="80" y1="66" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="34" y1="64" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="28" y1="44" x2="60" y2="48" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        {/* head */}
        <polygon points="6,36 38,24 28,44 4,52" fill="#24d18c20" strokeWidth="1.6" />
        <line x1="6" y1="36" x2="22" y2="40" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        <line x1="28" y1="44" x2="22" y2="40" stroke="#24d18c" strokeWidth="0.7" opacity="0.5" />
        {/* snout */}
        <polygon points="0,48 6,36 4,52 0,56" fill="#24d18c28" strokeWidth="1.2" />
        {/* horn L */}
        <polyline points="14,28 2,6 22,22" strokeWidth="2" />
        {/* horn R */}
        <polyline points="26,22 26,2 38,18" strokeWidth="2" />
        {/* front leg 1 */}
        <polygon points="32,64 40,64 39,86 31,86" fill="#24d18c14" strokeWidth="1.4" />
        {/* front leg 2 */}
        <polygon points="44,64 52,64 51,86 43,86" fill="#24d18c14" strokeWidth="1.4" />
        {/* back leg 1 */}
        <polygon points="66,64 74,64 75,86 67,86" fill="#24d18c14" strokeWidth="1.4" />
        {/* back leg 2 */}
        <polygon points="76,62 84,62 86,84 78,84" fill="#24d18c14" strokeWidth="1.4" />
        {/* tail */}
        <path d="M89,18 Q102,8 98,0" strokeWidth="1.8" fill="none" />
        {/* eye */}
        <circle cx="14" cy="40" r="2.2" fill="#24d18c" stroke="none" />
        {/* highlight dots */}
        <circle cx="60" cy="30" r="1.2" fill="#24d18c" stroke="none" opacity="0.6" />
        <circle cx="75" cy="22" r="0.9" fill="#24d18c" stroke="none" opacity="0.5" />
      </g>
    </svg>
  )
}

function BearSVG({ size = 90 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 1.02)} viewBox="0 0 100 102" fill="none">
      <defs>
        <filter id="bear-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="bear-floor" cx="50%" cy="100%" r="50%">
          <stop offset="0%" stopColor="#ff6375" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff6375" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* floor glow */}
      <ellipse cx="50" cy="97" rx="34" ry="5" fill="url(#bear-floor)" />
      <g filter="url(#bear-glow)" stroke="#ff6375" strokeLinejoin="round" strokeLinecap="round">
        {/* body */}
        <polygon points="22,70 50,60 78,70 76,90 50,96 24,90" fill="#ff637518" strokeWidth="1.6" />
        {/* body facets */}
        <line x1="22" y1="70" x2="50" y2="78" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="78" y1="70" x2="50" y2="78" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="76" y1="90" x2="50" y2="78" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="24" y1="90" x2="50" y2="78" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="50" y1="60" x2="50" y2="78" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        {/* head */}
        <polygon points="30,36 50,28 70,36 68,56 50,62 32,56" fill="#ff637518" strokeWidth="1.6" />
        {/* head facets */}
        <line x1="30" y1="36" x2="50" y2="46" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="70" y1="36" x2="50" y2="46" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="68" y1="56" x2="50" y2="46" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        <line x1="32" y1="56" x2="50" y2="46" stroke="#ff6375" strokeWidth="0.7" opacity="0.5" />
        {/* ear L */}
        <polygon points="28,32 36,20 44,30" fill="#ff637522" strokeWidth="1.4" />
        {/* ear R */}
        <polygon points="56,30 64,20 72,32" fill="#ff637522" strokeWidth="1.4" />
        {/* snout */}
        <polygon points="40,50 60,50 58,60 42,60" fill="#ff637530" strokeWidth="1.2" />
        {/* nose */}
        <ellipse cx="50" cy="50" rx="5" ry="3.5" fill="#ff6375" stroke="none" />
        {/* arm L */}
        <polygon points="14,66 24,62 22,84 12,86" fill="#ff637514" strokeWidth="1.4" />
        {/* arm R */}
        <polygon points="76,62 86,66 88,86 78,84" fill="#ff637514" strokeWidth="1.4" />
        {/* leg L */}
        <polygon points="30,90 42,90 40,102 28,102" fill="#ff637514" strokeWidth="1.4" />
        {/* leg R */}
        <polygon points="58,90 70,90 72,102 60,102" fill="#ff637514" strokeWidth="1.4" />
        {/* eyes */}
        <circle cx="42" cy="40" r="2.5" fill="#ff6375" stroke="none" />
        <circle cx="58" cy="40" r="2.5" fill="#ff6375" stroke="none" />
        {/* highlight dots */}
        <circle cx="50" cy="32" r="1.2" fill="#ff6375" stroke="none" opacity="0.6" />
        <circle cx="62" cy="28" r="0.9" fill="#ff6375" stroke="none" opacity="0.5" />
      </g>
    </svg>
  )
}

function RadarChart({ metrics, size = 150 }: { metrics: { label: string; value: number }[]; size?: number }) {
  if (!metrics.length) return null
  const count = metrics.length
  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.35
  const point = (r: number, i: number): [number, number] => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const gridPts = [0.25, 0.5, 0.75, 1].map(f => metrics.map((_, i) => point(f * maxR, i)) as [number, number][])
  const dataPts = metrics.map((m, i) => point((Math.min(Math.max(Number(m.value), 0), 100) / 100) * maxR, i)) as [number, number][]

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      {gridPts.map((pts, gi) => (
        <polygon key={gi} points={poly(pts)} fill="none" stroke="rgba(96,165,250,.1)" strokeWidth={0.8} />
      ))}
      {metrics.map((_, i) => {
        const [x, y] = point(maxR, i)
        return <line key={i} x1={cx} y1={cy} x2={x.toFixed(1)} y2={y.toFixed(1)} stroke="rgba(96,165,250,.08)" strokeWidth={0.8} />
      })}
      <polygon points={poly(dataPts)} fill="rgba(36,209,140,.13)" stroke="#24d18c" strokeWidth={1.8} strokeLinejoin="round" />
      {dataPts.map(([x, y], i) => <circle key={i} cx={x.toFixed(1)} cy={y.toFixed(1)} r={3.5} fill="#24d18c" />)}
      {metrics.map((m, i) => {
        const labelR = maxR + 18
        const [lx, ly] = point(labelR, i)
        const words = m.label.split(' ')
        return (
          <text key={i} textAnchor="middle" fill="#64748b" fontSize={7.5} fontWeight={500}>
            {words.map((w, wi) => (
              <tspan key={wi} x={lx.toFixed(1)} dy={wi === 0 ? `${ly - (words.length - 1) * 4.5}` : 9}>{w}</tspan>
            ))}
          </text>
        )
      })}
    </svg>
  )
}

function RingGauge({
  value,
  max = 100,
  size = 88,
  color,
  thickness = 9,
  label,
}: {
  value: number
  max?: number
  size?: number
  color: string
  thickness?: number
  label?: string
}) {
  const r = (size - thickness) / 2
  const circ = 2 * Math.PI * r
  const fill = (Math.min(Math.max(value, 0), max) / max) * circ
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#18212d" strokeWidth={thickness} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness}
          strokeDasharray={`${fill.toFixed(1)} ${circ.toFixed(1)}`} strokeLinecap="round"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: Math.round(size * 0.26), fontWeight: 800, color, lineHeight: 1 }}>{value}</span>
        {label && <span style={{ fontSize: Math.round(size * 0.12), color: 'var(--muted)', marginTop: 2, textAlign: 'center' }}>{label}</span>}
      </div>
    </div>
  )
}

function MobileSection({
  title,
  badge,
  collapsed,
  onToggle,
  children,
}: {
  title: string
  badge?: string
  collapsed?: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div style={{ background: 'linear-gradient(160deg,#0d1827 0%,#080d14 100%)', border: '1px solid rgba(96,165,250,.12)', borderRadius: 20, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'transparent', border: 0, color: '#eef4fb', cursor: 'pointer' }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.2 }}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {badge && collapsed && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,.12)', borderRadius: 999, padding: '2px 8px' }}>{badge}</span>
          )}
          {collapsed ? <ChevronDown size={15} color="rgba(148,163,184,.5)" /> : <ChevronUp size={15} color="rgba(148,163,184,.5)" />}
        </div>
      </button>
      {!collapsed && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
    </div>
  )
}

function MobileResearchContent({ data }: { data: any }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (key: string) => setCollapsed((s) => ({ ...s, [key]: !s[key] }))

  if (!data) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
        Loading research data…
      </div>
    )
  }

  const scores = data.scores || {}
  const thesis = data.investment_thesis || {}
  const fin = data.financial_health || {}
  const growth = data.growth || {}
  const moat = data.moat || {}
  const valuation = data.valuation || {}
  const institutional = data.institutional || {}
  const competitive = data.competitive || {}
  const risk = data.risk || {}
  const bullbear = data.bull_bear || {}

  const tone = (s: number) => (s >= 80 ? '#24d18c' : s >= 60 ? '#fbbf24' : '#ff6375')
  const toneBg = (s: number) => s >= 80 ? 'rgba(36,209,140,.12)' : s >= 60 ? 'rgba(251,191,36,.12)' : 'rgba(255,99,117,.12)'
  const toneLabel = (s: number) => (s >= 80 ? 'Strong' : s >= 60 ? 'Moderate' : 'Weak')

  const aiScore = scores.ai_score || 0
  const verdict = aiScore >= 75 ? 'BUY' : aiScore >= 55 ? 'HOLD' : 'SELL'
  const verdictColor = aiScore >= 75 ? '#24d18c' : aiScore >= 55 ? '#fbbf24' : '#ff6375'
  const verdictLabel = aiScore >= 80 ? 'Strong Conviction' : aiScore >= 65 ? 'Moderate Conviction' : aiScore >= 55 ? 'Low Conviction' : 'Cautious'

  const scoreCards = [
    { icon: <Cpu size={16} />, label: 'AI Score', score: scores.ai_score },
    { icon: <ShieldCheck size={16} />, label: 'Confidence', score: scores.confidence },
    { icon: <Zap size={16} />, label: 'Events', score: scores.events },
    { icon: <Target size={16} />, label: 'Overall', score: scores.overall },
  ]

  return (
    <div style={{ display: 'grid', gap: 10 }}>

      {/* ── Research Hero ── */}
      <div style={{ background: 'linear-gradient(145deg,#0d1827,#080d14)', border: '1px solid rgba(96,165,250,.15)', borderRadius: 20, padding: '16px 12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr', alignItems: 'center' }}>
          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>AI VERDICT</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: verdictColor, lineHeight: 1, display: 'block' }}>{verdict}</span>
            <span style={{ fontSize: 9, color: verdictColor, display: 'block', marginTop: 4 }}>{verdictLabel}</span>
          </div>
          <div style={{ height: 44, background: 'rgba(96,165,250,.1)', borderRadius: 1 }} />
          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>CONVICTION</span>
            <span style={{ fontSize: 28, fontWeight: 900, color: tone(aiScore), lineHeight: 1, display: 'block' }}>{aiScore}</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginTop: 4 }}>/100 · {toneLabel(aiScore)}</span>
          </div>
          <div style={{ height: 44, background: 'rgba(96,165,250,.1)', borderRadius: 1 }} />
          <div style={{ textAlign: 'center', padding: '0 8px' }}>
            <span style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>EXPECTED RETURN</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#24d18c', lineHeight: 1, display: 'block' }}>{valuation.upside || '—'}</span>
            <span style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginTop: 4 }}>12M Target</span>
          </div>
        </div>
      </div>

      {/* ── Evidence & Data ── */}
      <div style={{ background: 'linear-gradient(145deg,#0d1827,#080d14)', border: '1px solid rgba(96,165,250,.12)', borderRadius: 20, padding: '14px 14px 13px' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eef4fb', display: 'block', marginBottom: 14 }}>Evidence &amp; Data</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {([
            { Icon: Brain,     label: 'AI Sentiment',       score: scores.ai_score,   color: '#a78bfa' },
            { Icon: Users,     label: 'Analyst Sentiment',  score: scores.confidence, color: '#60a5fa' },
            { Icon: Newspaper, label: 'News Sentiment',     score: scores.events,     color: '#fbbf24' },
            { Icon: Landmark,  label: 'Institutional Flow', score: scores.overall,    color: '#24d18c' },
          ] as const).map(({ Icon, label, score, color }) => {
            const s = score || 0
            const sent = s >= 70 ? 'Positive' : s >= 50 ? 'Neutral' : 'Negative'
            const sentColor = s >= 70 ? '#24d18c' : s >= 50 ? '#fbbf24' : '#ff6375'
            const shortLabel = label.split(' ').pop()!
            return (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}18`, border: `1px solid ${color}28`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 7px', color }}>
                  <Icon size={20} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#eef4fb', display: 'block', lineHeight: 1 }}>{s}</span>
                <span style={{ fontSize: 8, color: 'var(--muted)', display: 'block', marginTop: 1 }}>/100</span>
                <span style={{ fontSize: 9, color: sentColor, display: 'block', marginTop: 4, fontWeight: 700 }}>{sent}</span>
                <span style={{ fontSize: 8, color: 'var(--muted)', display: 'block', marginTop: 2, lineHeight: 1.2 }}>{shortLabel}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>AI Confidence in Verdict</span>
          <div style={{ flex: 1, height: 6, background: '#121a25', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${scores.overall || 0}%`, background: 'linear-gradient(90deg,#24d18c,#60a5fa)', borderRadius: 'inherit' }} />
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#24d18c', whiteSpace: 'nowrap' }}>
            {(scores.overall || 0) >= 70 ? 'High' : (scores.overall || 0) >= 50 ? 'Medium' : 'Low'} ({scores.overall || 0}%)
          </span>
        </div>
      </div>

      {/* ── Financial Health ── */}
      {(fin.market_cap || fin.revenue || fin.cash || fin.margin) && (
        <MobileSection title="Financial Health" badge={fin.margin || undefined} collapsed={collapsed['fin']} onToggle={() => toggle('fin')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Market Cap', value: fin.market_cap, color: '#60a5fa' },
              { label: 'Revenue', value: fin.revenue, color: '#24d18c' },
              { label: 'Cash', value: fin.cash, color: '#a78bfa' },
              { label: 'Net Margin', value: fin.margin, color: '#fbbf24' },
            ].filter((m) => m.value).map((m) => (
              <div key={m.label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '12px 12px 10px' }}>
                <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 5, fontWeight: 500 }}>{m.label}</span>
                <b style={{ fontSize: 20, display: 'block', color: m.color, lineHeight: 1 }}>{m.value}</b>
              </div>
            ))}
          </div>
          {fin.updated && <p style={{ margin: '10px 0 0', fontSize: 10, color: 'var(--muted)' }}>Updated {fin.updated} · {fin.source}</p>}
        </MobileSection>
      )}

      {/* ── Growth Engine ── */}
      {growth.drivers?.length > 0 && (
        <MobileSection title="Growth Engine" collapsed={collapsed['growth']} onToggle={() => toggle('growth')}>
          <div style={{ display: 'grid', gap: 13 }}>
            {growth.drivers.map((d: any) => (
              <div key={d.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#c4d4e8', fontWeight: 500 }}>{d.label}</span>
                  <b style={{ fontSize: 12, color: '#24d18c' }}>{d.value}%</b>
                </div>
                <div style={{ height: 10, background: '#121a25', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(Number(d.value), 100)}%`, background: 'linear-gradient(90deg,#3b82f6,#24d18c)', borderRadius: 'inherit', boxShadow: '0 0 8px rgba(36,209,140,.25)' }} />
                </div>
              </div>
            ))}
          </div>
        </MobileSection>
      )}

      {/* ── Moat Analysis ── */}
      {(moat.score != null || moat.metrics?.length > 0) && (
        <MobileSection title="Moat Analysis" badge={moat.score != null ? `${moat.score}/100` : undefined} collapsed={collapsed['moat']} onToggle={() => toggle('moat')}>
          {moat.metrics?.length >= 3 ? (
            /* Radar layout */
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <RadarChart
                metrics={(moat.metrics || []).map((m: any) => ({ label: m.label, value: Number(m.value) }))}
                size={154}
              />
              <div style={{ flex: 1, textAlign: 'center' }}>
                {moat.score != null && (
                  <>
                    <span style={{ fontSize: 38, fontWeight: 800, color: tone(moat.score || 0), lineHeight: 1, display: 'block' }}>{moat.score}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 3 }}>/100</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: tone(moat.score || 0), display: 'block', marginTop: 6 }}>
                      {(moat.score || 0) >= 80 ? 'Wide Moat' : (moat.score || 0) >= 60 ? 'Narrow Moat' : 'Weak Moat'}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginTop: 2 }}>{toneLabel(moat.score || 0)}</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* Fallback: ring + bars */
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              {moat.score != null && (
                <RingGauge value={moat.score || 0} size={92} color={tone(moat.score || 0)} thickness={10} label={toneLabel(moat.score || 0)} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {(moat.metrics || []).map((m: any) => (
                  <div key={m.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{m.label}</span>
                      <b style={{ fontSize: 11, color: '#eef4fb' }}>{m.value}</b>
                    </div>
                    <div style={{ height: 6, background: '#121a25', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(Number(m.value), 100)}%`, background: 'linear-gradient(90deg,#60a5fa,#a78bfa)', borderRadius: 'inherit' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </MobileSection>
      )}

      {/* ── Valuation ── */}
      {valuation.fair_value_dcf != null && (
        <MobileSection title="Valuation" badge={valuation.upside || undefined} collapsed={collapsed['val']} onToggle={() => toggle('val')}>
          <div style={{ background: 'rgba(36,209,140,.05)', border: '1px solid rgba(36,209,140,.18)', borderRadius: 16, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4, fontWeight: 600, letterSpacing: 0.4 }}>UPSIDE POTENTIAL</span>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#24d18c', lineHeight: 1 }}>{valuation.upside}</span>
            </div>
            <Sparkles size={38} color="rgba(36,209,140,.28)" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 12px' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fair Value (DCF)</span>
              <b style={{ fontSize: 20, display: 'block', color: '#eef4fb' }}>{valuation.fair_value_dcf}</b>
            </div>
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 12, padding: '12px 12px' }}>
              <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Fair Value (P/E)</span>
              <b style={{ fontSize: 20, display: 'block', color: '#eef4fb' }}>{valuation.fair_value_pe}</b>
            </div>
          </div>
          {valuation.metrics?.length > 0 && (
            <div style={{ display: 'grid', gap: 1 }}>
              {valuation.metrics.map((m: any) => (
                <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <span style={{ color: '#94a3b8' }}>{m.label}</span>
                  <b style={{ color: '#eef4fb' }}>{m.value}</b>
                </div>
              ))}
            </div>
          )}
        </MobileSection>
      )}

      {/* ── Institutional Thesis ── */}
      {institutional.ownership_pct != null && (
        <MobileSection title="Institutional Thesis" badge={`${institutional.ownership_pct}% owned`} collapsed={collapsed['inst']} onToggle={() => toggle('inst')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* Left: top take quote */}
            <div>
              <p style={{ fontSize: 9, color: 'var(--muted)', margin: '0 0 7px', fontWeight: 600, letterSpacing: 0.3 }}>TOP INSTITUTIONAL TAKE</p>
              <div style={{ background: 'rgba(167,139,250,.07)', border: '1px solid rgba(167,139,250,.18)', borderRadius: 12, padding: '10px 10px 8px', minHeight: 90 }}>
                {thesis.summary ? (
                  <p style={{ margin: 0, fontSize: 10, color: '#c4d4e8', lineHeight: 1.55, fontStyle: 'italic' }}>
                    &ldquo;{thesis.summary.slice(0, 120)}{thesis.summary.length > 120 ? '…' : ''}&rdquo;
                  </p>
                ) : (institutional.bull_points || []).slice(0, 2).map((pt: string, i: number) => (
                  <p key={i} style={{ margin: i > 0 ? '5px 0 0' : 0, fontSize: 10, color: '#c4d4e8', lineHeight: 1.45 }}>• {pt}</p>
                ))}
              </div>
            </div>
            {/* Right: donut ring + legend */}
            <div>
              <p style={{ fontSize: 9, color: 'var(--muted)', margin: '0 0 7px', fontWeight: 600, letterSpacing: 0.3 }}>INSTITUTIONAL OWNERSHIP</p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <RingGauge value={institutional.ownership_pct || 0} size={78} color="#60a5fa" thickness={9} label={`${institutional.ownership_pct}%`} />
                <div style={{ display: 'grid', gap: 4, width: '100%' }}>
                  {[
                    { label: 'Bull View', color: '#24d18c', pts: institutional.bull_points?.length || 0 },
                    { label: 'Bear View', color: '#ff6375', pts: institutional.bear_points?.length || 0 },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: 9, color: '#94a3b8', flex: 1 }}>{item.label}</span>
                      <b style={{ fontSize: 9, color: item.color }}>{item.pts} pts</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </MobileSection>
      )}

      {/* ── Competitive Comparison ── */}
      {competitive.rows?.length > 0 && (
        <MobileSection title="Competitive Comparison" collapsed={collapsed['comp']} onToggle={() => toggle('comp')}>
          <div style={{ overflowX: 'auto', marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480, fontSize: 11 }}>
              <thead>
                <tr>
                  {(competitive.columns || []).map((col: string) => (
                    <th key={col} style={{ textAlign: col === 'Company' ? 'left' : 'right', color: 'var(--muted)', fontWeight: 600, padding: '5px 8px', whiteSpace: 'nowrap', fontSize: 10, letterSpacing: 0.3 }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitive.rows.map((row: any) => (
                  <tr key={row.Company} style={{ background: row.highlight ? 'rgba(96,165,250,.06)' : 'transparent' }}>
                    {(competitive.columns || []).map((col: string) => {
                      const val = row[col] ?? '—'
                      const isComp = col === 'Company'
                      const isRevGrowth = col === 'Rev Growth'
                      const color = isRevGrowth
                        ? String(val).startsWith('+') ? '#24d18c' : '#ff6375'
                        : isComp && row.highlight ? '#60a5fa' : '#c4d4e8'
                      return (
                        <td key={col} style={{ textAlign: isComp ? 'left' : 'right', padding: '8px 8px', color, fontWeight: isComp ? 700 : 400, borderBottom: '1px solid rgba(31,42,55,.5)', whiteSpace: 'nowrap' }}>
                          {val}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MobileSection>
      )}

      {/* ── Risk Analysis ── */}
      {risk.categories?.length > 0 && (
        <MobileSection title="Risk Analysis" badge={risk.score != null ? `${risk.score} risk` : undefined} collapsed={collapsed['risk']} onToggle={() => toggle('risk')}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            {risk.score != null && (
              <RingGauge
                value={risk.score || 0}
                size={92}
                color={(risk.score || 0) >= 70 ? '#ff6375' : '#fbbf24'}
                thickness={10}
                label={(risk.score || 0) >= 70 ? 'High Risk' : 'Moderate'}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              {risk.categories.map((c: any) => {
                const riskColor = c.tone === 'red' ? '#ff6375' : c.tone === 'amber' ? '#fbbf24' : '#24d18c'
                return (
                  <div key={c.label} style={{ marginBottom: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{c.label}</span>
                      <b style={{ fontSize: 11, color: riskColor }}>{c.value}</b>
                    </div>
                    <div style={{ height: 7, background: '#121a25', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(Number(c.value), 100)}%`, background: riskColor, borderRadius: 'inherit', opacity: 0.85 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </MobileSection>
      )}

      {/* ── Scenario Outlook ── */}
      {bullbear.bull_probability != null && (
        <MobileSection title="Scenario Outlook" badge={`${bullbear.bull_probability || 0}% bull bias`} collapsed={collapsed['bb']} onToggle={() => toggle('bb')}>
          <style>{`
            @keyframes bb-bull-in { from { transform: translateX(-36px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes bb-bear-in { from { transform: translateX(36px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes bb-bull-nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(7px); } }
            @keyframes bb-bear-nudge { 0%,100% { transform: translateX(0); } 50% { transform: translateX(-7px); } }
          `}</style>

          {/* Animated hero — geometric SVG bull vs bear */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 18px', gap: 6 }}>

            {/* Bull hero */}
            <div style={{ animation: 'bb-bull-in 0.45s ease-out both', flex: 1 }}>
              <div style={{ animation: 'bb-bull-nudge 1.8s ease-in-out 0.55s infinite' }}>
                <div style={{ background: 'linear-gradient(160deg,rgba(36,209,140,.12),rgba(7,20,14,.8))', border: '1px solid rgba(36,209,140,.25)', borderRadius: 20, padding: '14px 6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <BullSVG size={86} />
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#24d18c', letterSpacing: -0.5, lineHeight: 1 }}>{bullbear.bull_probability || 0}%</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(36,209,140,.65)', letterSpacing: 2 }}>BULL</span>
                </div>
              </div>
            </div>

            {/* VS divider */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,.1)' }} />
              <span style={{ fontSize: 9, fontWeight: 900, color: 'rgba(148,163,184,.25)', letterSpacing: 3 }}>VS</span>
              <div style={{ width: 1, height: 20, background: 'rgba(148,163,184,.1)' }} />
            </div>

            {/* Bear hero */}
            <div style={{ animation: 'bb-bear-in 0.45s ease-out both', flex: 1 }}>
              <div style={{ animation: 'bb-bear-nudge 1.8s ease-in-out 0.55s infinite' }}>
                <div style={{ background: 'linear-gradient(160deg,rgba(255,99,117,.12),rgba(20,7,10,.8))', border: '1px solid rgba(255,99,117,.25)', borderRadius: 20, padding: '14px 6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <BearSVG size={86} />
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#ff6375', letterSpacing: -0.5, lineHeight: 1 }}>{100 - (bullbear.bull_probability || 0)}%</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,99,117,.65)', letterSpacing: 2 }}>BEAR</span>
                </div>
              </div>
            </div>

          </div>

          {/* Scenario % bars (12M) */}
          {(() => {
            const bull = Math.round((bullbear.bull_probability || 50) * 0.5)
            const base = 50
            const bear = 100 - bull - base
            return [
              { label: 'Bull Case', pct: bull, color: '#24d18c', emoji: '🐂' },
              { label: 'Base Case', pct: base, color: '#60a5fa', emoji: '🌐' },
              { label: 'Bear Case', pct: Math.max(bear, 0), color: '#ff6375', emoji: '🐻' },
            ].map(({ label, pct, color, emoji }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{emoji}</span>
                <span style={{ fontSize: 11, color: '#94a3b8', width: 65, flexShrink: 0 }}>{label}</span>
                <div style={{ flex: 1, height: 8, background: '#121a25', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 'inherit', opacity: 0.85 }} />
                </div>
                <b style={{ fontSize: 12, color, width: 30, textAlign: 'right', flexShrink: 0 }}>{pct}%</b>
              </div>
            ))
          })()}

          {valuation.upside && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 11, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Expected Value</span>
              <b style={{ fontSize: 15, color: '#24d18c' }}>{valuation.upside}</b>
            </div>
          )}

          {/* Scenario text cards */}
          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {(['bull', 'base', 'bear'] as const).map((key) => {
              const text = bullbear.scenarios?.[key]
              if (!text) return null
              const color = key === 'bull' ? '#24d18c' : key === 'bear' ? '#ff6375' : '#60a5fa'
              const bg = key === 'bull' ? 'rgba(36,209,140,.05)' : key === 'bear' ? 'rgba(255,99,117,.05)' : 'rgba(96,165,250,.05)'
              const border = key === 'bull' ? 'rgba(36,209,140,.2)' : key === 'bear' ? 'rgba(255,99,117,.2)' : 'rgba(96,165,250,.2)'
              return (
                <div key={key} style={{ background: bg, border: `1px solid ${border}`, borderLeft: `3px solid ${color}`, borderRadius: 14, padding: '10px 12px' }}>
                  <b style={{ fontSize: 10, color, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>{key.toUpperCase()} CASE</b>
                  <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>{text}</p>
                </div>
              )
            })}
          </div>
        </MobileSection>
      )}

      {/* ── What Could Change This View ── */}
      {(thesis.key_drivers?.length > 0 || thesis.break_thesis?.length > 0) && (
        <MobileSection title="What Could Change This View" collapsed={collapsed['change']} onToggle={() => toggle('change')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {thesis.key_drivers?.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <TrendingUp size={13} color="#24d18c" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#24d18c' }}>What Would Increase Conviction</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                  {thesis.key_drivers.map((d: string) => (
                    <li key={d} style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4, paddingLeft: 10, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, top: 4, width: 4, height: 4, borderRadius: '50%', background: '#24d18c', display: 'block' }} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {thesis.break_thesis?.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <TrendingDown size={13} color="#ff6375" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#ff6375' }}>What Would Decrease Conviction</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                  {thesis.break_thesis.map((d: string) => (
                    <li key={d} style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.4, paddingLeft: 10, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, top: 4, width: 4, height: 4, borderRadius: '50%', background: '#ff6375', display: 'block' }} />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </MobileSection>
      )}
    </div>
  )
}

function MobileDetailView({ position, onClose }: { position: any; onClose: () => void }) {
  const [tab, setTab] = useState('Overview')
  const [details, setDetails] = useState<any>(null)
  const [research, setResearch] = useState<any>(null)
  const [showMenu, setShowMenu] = useState(false)
  const ticker = position.symbol || position.ticker
  const change = Number(position.day_change_pct || position.change_pct || position.change || 0)

  useEffect(() => {
    if (!ticker) return
    fetch(`${API}/stock/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setDetails)
      .catch(() => {})
    fetch(`${API}/research/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then(setResearch)
      .catch(() => {})
  }, [ticker])

  const tabs = ['Overview', 'Research', 'Portfolio', 'History']
  const aiScore = research?.scores?.ai_score || 0
  const verdict = aiScore >= 75 ? 'BUY' : aiScore >= 55 ? 'HOLD' : aiScore > 0 ? 'SELL' : '—'
  const verdictColor = aiScore >= 75 ? '#24d18c' : aiScore >= 55 ? '#fbbf24' : aiScore > 0 ? '#ff6375' : '#64748b'

  return (
    <div className="mobile-detail" role="dialog" aria-modal="true" aria-label={`${ticker} details`}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0 14px', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#eef4fb', lineHeight: 1.1 }}>{ticker}</h1>
          <span style={{ fontSize: 12, color: '#64748b', display: 'block', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {position.name || 'Position detail'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {aiScore > 0 && (
            <span style={{ border: `1.5px solid ${verdictColor}`, borderRadius: 10, padding: '4px 11px', fontSize: 13, fontWeight: 800, color: verdictColor, letterSpacing: 0.3 }}>
              {verdict}
            </span>
          )}
          <button
            onClick={() => setShowMenu(v => !v)}
            aria-label="More options"
            style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(148,163,184,.2)', background: '#111820', color: '#eef4fb', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <MoreVertical size={17} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close detail"
            style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid rgba(148,163,184,.2)', background: '#111820', color: '#eef4fb', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* ── Tabs (underline style) ── */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(148,163,184,.12)', marginBottom: 16, gap: 0 }}>
        {tabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            style={{
              flex: 1,
              padding: '0 0 11px',
              background: 'transparent',
              border: 0,
              borderBottom: `2px solid ${tab === item ? '#60a5fa' : 'transparent'}`,
              marginBottom: -1,
              color: tab === item ? '#eef4fb' : '#64748b',
              fontWeight: tab === item ? 700 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'color .15s,border-color .15s',
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {/* ── Three-dot menu sheet ── */}
      {showMenu && (
        <>
          <div
            onClick={() => setShowMenu(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.55)' }}
          />
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 'min(520px,100vw)', zIndex: 41, background: '#0d1827', borderRadius: '24px 24px 0 0', border: '1px solid rgba(96,165,250,.15)', borderBottom: 0, padding: '20px 20px 36px' }}>
            <div style={{ width: 36, height: 4, background: 'rgba(148,163,184,.3)', borderRadius: 999, margin: '0 auto 18px' }} />
            <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#eef4fb' }}>{ticker} · Options</h3>
            {[
              { icon: <SlidersHorizontal size={16} />, label: 'Customize Research View', sub: 'Show/hide sections and reorder' },
              { icon: <Bell size={16} />, label: 'Set Price Alert', sub: `Notify when ${ticker} hits a target` },
              { icon: <Target size={16} />, label: 'Update Price Target', sub: 'Edit your thesis target' },
              { icon: <AlertTriangle size={16} />, label: 'Mark as Watch Only', sub: 'Remove from active portfolio' },
            ].map(({ icon, label, sub }) => (
              <button
                key={label}
                onClick={() => setShowMenu(false)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0', background: 'transparent', border: 0, borderBottom: '1px solid rgba(148,163,184,.08)', color: '#eef4fb', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(96,165,250,.1)', display: 'grid', placeItems: 'center', flexShrink: 0, color: '#60a5fa' }}>{icon}</span>
                <div>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{label}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#64748b', marginTop: 2 }}>{sub}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <section className="mobile-detail-panel" style={tab === 'Research' ? { background: 'transparent', border: 'none', padding: 0 } : { padding: '14px 0' }}>
        {tab === 'Overview' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ background: 'linear-gradient(135deg,rgba(96,165,250,.08),rgba(36,209,140,.04))', border: '1px solid rgba(96,165,250,.15)', borderRadius: 18, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Sparkles size={13} color="#60a5fa" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#60a5fa', letterSpacing: 0.5 }}>AI THESIS</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: '#c4d4e8', lineHeight: 1.65 }}>
                {details?.position?.ai_view || position.ai_view || details?.forecast?.base || 'PIA has no saved thesis yet. Treat this as a watch item until catalyst, valuation, and risk checks agree.'}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Portfolio Weight', value: pct(position.portfolio_pct) },
                { label: 'Risk Score', value: String(position.risk || 31) },
                { label: 'Stop Level', value: position.stop || '—' },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '10px 8px 8px', textAlign: 'center' }}>
                  <b style={{ fontSize: 15, display: 'block', color: '#eef4fb', lineHeight: 1 }}>{m.value}</b>
                  <span style={{ fontSize: 8, color: 'var(--muted)', display: 'block', marginTop: 5, lineHeight: 1.2 }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'Research' && <MobileResearchContent data={research} />}
        {tab === 'Portfolio' && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Market Value', value: money(position.market_value || 0), color: '#60a5fa' },
                { label: 'Portfolio %', value: pct(position.portfolio_pct), color: '#a78bfa' },
                { label: 'Day Change', value: `${Number(position.day_change_pct || 0).toFixed(2)}%`, color: change >= 0 ? '#24d18c' : '#ff6375' },
                { label: 'Momentum', value: `${position.momentum || position.momentum_score || 52}/100`, color: '#fbbf24' },
              ].map(m => (
                <div key={m.label} style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 14, padding: '12px 12px 10px' }}>
                  <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{m.label}</span>
                  <b style={{ fontSize: 18, color: m.color, lineHeight: 1 }}>{m.value}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'History' && (
          <div className="mobile-news-list">
            {(details?.news?.length ? details.news : [{ title: 'No fresh news loaded', impact: 'Neutral', action: 'Monitor only' }]).map(
              (item: any) => (
                <article key={item.title}>
                  <strong>{item.title}</strong>
                  <span>{item.impact} · {item.action}</span>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function PlaceholderPanel({ title }: { title: string }) {
  return (
    <section className="mobile-section">
      <article className="mobile-visual-card mobile-placeholder">
        <strong>{title}</strong>
        <span>Mobile shell ready. Full controls stay in the desktop dashboard for this sprint.</span>
      </article>
    </section>
  )
}

export default function MobileExperience() {
  const dashboard = useMobileDashboard()
  const [active, setActive] = useState('home')
  const [selected, setSelected] = useState<any>(null)

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
  const scanner = dashboard?.scanner || scannerFallback

  return (
    <main className="mobile-shell">
      <header className="mobile-top">
        <div>
          <span>Mitsos - PIA</span>
          <h1>Mobile Command</h1>
        </div>
        <button aria-label="Notifications">
          <Bell size={19} />
        </button>
      </header>
      <SearchCommand />

      {active === 'home' && (
        <>
          <MarketPulse items={dashboard?.macros?.market_strip || []} />
          <PortfolioInsights portfolio={portfolio} positions={positions} />
          <UrgentAlerts portfolio={portfolio} />
          <DailyBrief portfolio={portfolio} />
          <ScannerSetups scanner={scanner} onSelect={setSelected} />
          <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} />
        </>
      )}

      {active === 'portfolio' && <PositionCards rows={positions} onSelect={setSelected} />}
      {active === 'scanner' && <ScannerSetups scanner={scanner} onSelect={setSelected} />}
      {active === 'markets' && (
        <>
          <MarketPulse items={dashboard?.macros?.market_strip || []} />
          <WatchlistMovers scanner={scanner} positions={positions} onSelect={setSelected} />
        </>
      )}
      {active === 'settings' && <PlaceholderPanel title="Settings" />}

      <MobileBottomNav active={active} setActive={setActive} />
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
