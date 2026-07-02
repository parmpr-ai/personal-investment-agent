'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Gauge,
  Home,
  Play,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  TrendingUp,
  Trophy,
  Wallet,
  X,
  Zap,
} from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'

const API       = process.env.NEXT_PUBLIC_API_URL       ?? 'http://127.0.0.1:8000'
const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

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

      {whyMoving && (
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '12px' }}>
          <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, marginBottom: '6px' }}>WHY MOVING</div>
          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: 0, lineHeight: 1.5 }}>{whyMoving}</p>
        </div>
      )}

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

// ─── Pill helpers ─────────────────────────────────────────────────────────────

function RiskModePill({ mode }: { mode: string }) {
  const config: Record<string, [string, string]> = {
    AGGRESSIVE:   ['#ff6375', 'rgba(255,99,117,0.14)'],
    NORMAL:       ['#24d18c', 'rgba(36,209,140,0.14)'],
    CONSERVATIVE: ['#fbbf24', 'rgba(251,191,36,0.14)'],
    DEFENSIVE:    ['#a78bfa', 'rgba(167,139,250,0.14)'],
  }
  const [color, bg] = config[mode] ?? ['#8fa2b5', 'rgba(148,163,184,0.12)']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
      color, background: bg, border: `1px solid ${color}44`, letterSpacing: '0.03em',
    }}>
      <Zap size={9} />
      {mode}
    </span>
  )
}

function TradeStylePill({ style }: { style: string }) {
  const config: Record<string, [string, string]> = {
    DAY_TRADE:      ['#60a5fa', 'rgba(96,165,250,0.14)'],
    SWING_TRADE:    ['#24d18c', 'rgba(36,209,140,0.14)'],
    POSITION_TRADE: ['#a78bfa', 'rgba(167,139,250,0.14)'],
  }
  const label: Record<string, string> = {
    DAY_TRADE: 'DAY', SWING_TRADE: 'SWING', POSITION_TRADE: 'POSITION',
  }
  const [color, bg] = config[style] ?? ['#8fa2b5', 'rgba(148,163,184,0.12)']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 7px', borderRadius: '999px', fontSize: '10px', fontWeight: 700,
      color, background: bg, border: `1px solid ${color}44`,
    }}>
      {label[style] || style}
    </span>
  )
}

// ─── Agent tab data ───────────────────────────────────────────────────────────

function useAgentData() {
  const [agentStatus, setAgentStatus]   = useState<any>(null)
  const [backtest, setBacktest]         = useState<any>(null)
  const [decisions, setDecisions]       = useState<any[]>([])
  const [closedTrades, setClosedTrades] = useState<any[]>([])
  const [attribution, setAttribution]   = useState<any>(null)
  const [equityCurve, setEquityCurve]   = useState<any[]>([])
  const [toggling, setToggling]         = useState(false)

  useEffect(() => {
    const fetchAll = () => {
      fetch(`${AGENT_API}/agent/status`).then(r => r.json()).then(setAgentStatus).catch(() => {})
      fetch(`${AGENT_API}/agent/decisions?limit=10`).then(r => r.json()).then(d => {
        setDecisions(Array.isArray(d) ? d : [])
      }).catch(() => {})
      fetch(`${AGENT_API}/agent/paper/closed?limit=20`).then(r => r.json()).then(d => {
        setClosedTrades(Array.isArray(d) ? d : [])
      }).catch(() => {})
      fetch(`${AGENT_API}/agent/attribution?limit=200`).then(r => r.json()).then(d => {
        if (d && typeof d === 'object') setAttribution(d)
      }).catch(() => {})
      fetch(`${AGENT_API}/agent/analytics/pnl?hours=72`).then(r => r.json()).then(d => {
        setEquityCurve(Array.isArray(d) ? d : [])
      }).catch(() => {})
    }

    fetchAll()
    fetch(`${AGENT_API}/agent/backtest/status`).then(r => r.json()).then(d => {
      if (d?.status === 'completed') setBacktest(d)
    }).catch(() => {})

    const timer = setInterval(fetchAll, 30_000)
    return () => clearInterval(timer)
  }, [])

  const toggleAgent = async () => {
    if (toggling) return
    setToggling(true)
    try {
      const running = !!agentStatus?.running
      await fetch(`${AGENT_API}${running ? '/agent/stop' : '/agent/start'}`, { method: 'POST' })
      await new Promise(r => setTimeout(r, 900))
      const fresh = await fetch(`${AGENT_API}/agent/status`).then(r => r.json()).catch(() => null)
      if (fresh) setAgentStatus(fresh)
    } finally {
      setToggling(false)
    }
  }

  return { agentStatus, backtest, decisions, closedTrades, attribution, equityCurve, toggleAgent, toggling }
}

// ─── Equity Curve Chart ───────────────────────────────────────────────────────

function EquityCurveChart({ data }: { data: any[] }) {
  if (!data.length) return null

  const values = data.map(d => Number(d.portfolio_value || 0)).filter(v => v > 0)
  if (values.length < 2) return null

  const W = 320, H = 80
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const last = values[values.length - 1]
  const first = values[0]
  const netPct = ((last - first) / first) * 100
  const up = netPct >= 0

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W
    const y = H - ((v - min) / range) * (H - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const fillPts = `0,${H} ${pts} ${W},${H}`

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Equity Curve · 72h</h2>
        <TrendingUp size={18} />
      </div>
      <div style={{
        background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: '18px', padding: '14px 14px 10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px', fontWeight: 800 }}>
            {last.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: up ? '#24d18c' : '#ff6375' }}>
            {up ? '+' : ''}{netPct.toFixed(2)}%
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="ecGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={up ? '#24d18c' : '#ff6375'} stopOpacity="0.25" />
              <stop offset="100%" stopColor={up ? '#24d18c' : '#ff6375'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={fillPts} fill="url(#ecGrad)" />
          <polyline points={pts} fill="none" stroke={up ? '#24d18c' : '#ff6375'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{data[0]?.ts ? new Date(data[0].ts).toLocaleDateString() : ''}</span>
          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{data[data.length - 1]?.ts ? new Date(data[data.length - 1].ts).toLocaleDateString() : 'now'}</span>
        </div>
      </div>
    </section>
  )
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

// ─── Decisions Feed ───────────────────────────────────────────────────────────

function DecisionsFeed({ decisions }: { decisions: any[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  if (!decisions.length) return null

  const toggle = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const actionColor = (a: string) =>
    a === 'BUY' ? '#24d18c' : a === 'SELL' || a === 'SHORT' ? '#ff6375' : '#fbbf24'

  const styleLabel: Record<string, string> = {
    DAY_TRADE: 'DAY', SWING_TRADE: 'SWING', POSITION_TRADE: 'POS',
  }
  const styleColor: Record<string, string> = {
    DAY_TRADE: '#60a5fa', SWING_TRADE: '#24d18c', POSITION_TRADE: '#a78bfa',
  }

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Recent Decisions</h2>
        <Activity size={18} />
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {decisions.slice(0, 8).map((d: any, i: number) => {
          const isOpen = expanded.has(i)
          const ac = actionColor(d.action || 'HOLD')
          const sc = styleColor[d.trade_style] || '#8fa2b5'
          const sl = styleLabel[d.trade_style] || ''
          const conf = Number(d.confidence || 0)
          const ts = (() => {
            try { return new Date(d.ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
          })()

          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              style={{
                width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              }}
            >
              <div style={{
                padding: '11px 13px',
                background: isOpen ? 'rgba(96,165,250,0.06)' : '#0b1119',
                border: `1px solid ${isOpen ? 'rgba(96,165,250,0.28)' : 'rgba(148,163,184,0.14)'}`,
                borderRadius: '14px',
                transition: 'background 0.18s, border-color 0.18s',
              }}>
                {/* Row 1 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{
                      fontWeight: 800, fontSize: '13px', color: ac,
                      background: `${ac}18`, borderRadius: '6px', padding: '1px 6px',
                      flexShrink: 0,
                    }}>{d.action || 'HOLD'}</span>
                    <span style={{ fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>{d.ticker || '—'}</span>
                    {sl && (
                      <span style={{
                        fontSize: '10px', fontWeight: 700, color: sc,
                        background: `${sc}18`, borderRadius: '5px', padding: '1px 5px', flexShrink: 0,
                      }}>{sl}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{ts}</span>
                    {isOpen ? <ChevronUp size={14} color="#8fa2b5" /> : <ChevronDown size={14} color="#8fa2b5" />}
                  </div>
                </div>

                {/* Row 2: confidence bar + ML probability badge */}
                {conf > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '7px' }}>
                    <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${conf * 100}%`, background: conf >= 0.7 ? '#24d18c' : conf >= 0.5 ? '#fbbf24' : '#ff6375', borderRadius: 'inherit' }} />
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>{(conf * 100).toFixed(0)}%</span>
                    {d.ml_prob != null && (() => {
                      const mp = Number(d.ml_prob)
                      const mlColor = mp >= 0.7 ? '#24d18c' : mp >= 0.5 ? '#fbbf24' : '#ff6375'
                      return (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, color: mlColor,
                          background: `${mlColor}18`, border: `1px solid ${mlColor}44`,
                          borderRadius: '5px', padding: '1px 5px', flexShrink: 0,
                        }}>
                          ML {(mp * 100).toFixed(0)}%
                        </span>
                      )
                    })()}
                  </div>
                )}

                {/* Expandable reasoning */}
                {isOpen && d.reasoning && (
                  <div style={{
                    marginTop: '10px', paddingTop: '10px',
                    borderTop: '1px solid rgba(148,163,184,0.12)',
                    fontSize: '12px', color: 'var(--muted)', lineHeight: 1.55,
                  }}>
                    {d.reasoning}
                  </div>
                )}
                {isOpen && d.blocked_reason && (
                  <div style={{
                    marginTop: '8px', padding: '7px 9px',
                    background: 'rgba(255,99,117,0.08)', borderRadius: '8px',
                    fontSize: '11px', color: '#ff6375',
                  }}>
                    Blocked: {d.blocked_reason}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ─── Closed Trades Mini ───────────────────────────────────────────────────────

function MiniClosedTrades({ trades }: { trades: any[] }) {
  if (!trades.length) return null

  const wins  = trades.filter(t => Number(t.pnl || 0) > 0).length
  const total = trades.length
  const totalPnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0)
  const winRate = total > 0 ? (wins / total * 100).toFixed(0) : '0'
  const pnlColor = totalPnl >= 0 ? '#24d18c' : '#ff6375'

  const styleLabel: Record<string, string> = { DAY_TRADE: 'D', SWING_TRADE: 'SW', POSITION_TRADE: 'P' }
  const styleColor: Record<string, string> = { DAY_TRADE: '#60a5fa', SWING_TRADE: '#24d18c', POSITION_TRADE: '#a78bfa' }

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Closed Trades</h2>
        <Trophy size={18} />
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px',
      }}>
        <div style={{ background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)', borderRadius: '12px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: pnlColor }}>
            {totalPnl >= 0 ? '+' : ''}${Math.abs(totalPnl).toFixed(0)}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Total P&L</div>
        </div>
        <div style={{ background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)', borderRadius: '12px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: Number(winRate) >= 50 ? '#24d18c' : '#fbbf24' }}>
            {winRate}%
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Win Rate</div>
        </div>
        <div style={{ background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)', borderRadius: '12px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#60a5fa' }}>{total}</div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>Trades</div>
        </div>
      </div>

      {/* Recent trades list */}
      <div style={{ display: 'grid', gap: '7px' }}>
        {trades.slice(0, 6).map((t: any, i: number) => {
          const pnl = Number(t.pnl || 0)
          const pnlPct = Number(t.pnl_pct || 0)
          const pc = pnl >= 0 ? '#24d18c' : '#ff6375'
          const sl = styleLabel[t.trade_style] || ''
          const sc = styleColor[t.trade_style] || '#8fa2b5'
          const holdStr = t.hold_days != null
            ? t.hold_days < 1 ? `${t.hold_hours}h` : `${t.hold_days}d`
            : ''

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '9px 12px', background: '#0b1119',
              border: '1px solid rgba(148,163,184,0.12)', borderRadius: '12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <span style={{
                  width: '32px', height: '32px', borderRadius: '9px', flexShrink: 0,
                  background: pnl >= 0 ? 'rgba(36,209,140,0.1)' : 'rgba(255,99,117,0.1)',
                  border: `1px solid ${pc}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 700, color: pc,
                }}>{(t.ticker || '?').slice(0, 4)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>{t.ticker}</span>
                    <span style={{ fontSize: '10px', color: t.side === 'LONG' ? '#24d18c' : '#ff6375', fontWeight: 600 }}>
                      {t.side}
                    </span>
                    {sl && (
                      <span style={{ fontSize: '9px', fontWeight: 700, color: sc, background: `${sc}18`, borderRadius: '4px', padding: '1px 4px' }}>
                        {sl}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '1px' }}>
                    {holdStr && <><Clock size={9} style={{ display: 'inline', marginRight: '2px' }} />{holdStr} · </>}
                    ${(t.entry_price || 0).toFixed(2)} → ${(t.close_price || 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13px', color: pc }}>
                  {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(0)}
                </div>
                <div style={{ fontSize: '10px', color: pc }}>
                  {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Attribution Mini ─────────────────────────────────────────────────────────

function MiniAttribution({ attribution }: { attribution: any }) {
  if (!attribution) return null

  const byTag: Record<string, any> = attribution.by_tag || {}
  const topTags = Object.entries(byTag)
    .filter(([, v]: [string, any]) => v.total >= 2)
    .sort(([, a]: [string, any], [, b]: [string, any]) => (b.win_rate || 0) - (a.win_rate || 0))
    .slice(0, 5)

  if (!topTags.length) return null

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Signal Attribution</h2>
        <Zap size={18} />
      </div>
      <div style={{
        background: '#0b1119', border: '1px solid rgba(148,163,184,0.14)',
        borderRadius: '18px', padding: '14px',
      }}>
        <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '10px', fontWeight: 600, letterSpacing: '0.04em' }}>
          WIN RATE BY INDICATOR
        </div>
        <div style={{ display: 'grid', gap: '9px' }}>
          {topTags.map(([tag, v]: [string, any]) => {
            const wr = Number(v.win_rate || 0)
            const barColor = wr >= 60 ? '#24d18c' : wr >= 45 ? '#fbbf24' : '#ff6375'
            return (
              <div key={tag} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 36px', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tag}
                </span>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${wr}%`, background: barColor, borderRadius: 'inherit', transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: barColor, textAlign: 'right' }}>{wr.toFixed(0)}%</span>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(148,163,184,0.1)', fontSize: '11px', color: 'var(--muted)' }}>
          {attribution.total_attributed || 0} attributed trades · {Object.keys(byTag).length} signals tracked
        </div>
      </div>
    </section>
  )
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ agentStatus }: { agentStatus: any }) {
  const riskMode   = agentStatus?.risk_mode || '—'
  const tradeStyle = agentStatus?.trade_style || '—'
  const regime     = agentStatus?.regime || '—'
  const cycleCount = agentStatus?.cycle_count ?? '—'

  const items = [
    { label: 'Mode', value: 'Paper Trading', color: '#60a5fa' },
    { label: 'Risk Mode', value: riskMode, color: '#fbbf24' },
    { label: 'Trade Style', value: (tradeStyle || '').replace(/_/g, ' '), color: '#a78bfa' },
    { label: 'Market Regime', value: (regime || '').replace(/_/g, ' '), color: '#24d18c' },
    { label: 'Total Cycles', value: String(cycleCount), color: '#8fa2b5' },
    { label: 'Capital', value: '$100,000', color: '#fbbf24' },
  ]

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Agent Settings</h2>
        <Settings size={18} />
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        <div style={{
          background: 'linear-gradient(180deg,rgba(17,25,37,.98),rgba(7,11,17,.98))',
          border: '1px solid rgba(148,163,184,0.16)', borderRadius: '20px', padding: '16px',
        }}>
          <div style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600, marginBottom: '12px', letterSpacing: '0.04em' }}>
            CURRENT STATE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {items.map(({ label, value, color }) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '10px',
              }}>
                <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px' }}>{label}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,99,117,0.06)', border: '1px solid rgba(255,99,117,0.2)',
          borderRadius: '16px', padding: '14px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#ff6375', marginBottom: '6px' }}>
            REAL IBKR DISABLED
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)', lineHeight: 1.5 }}>
            This agent runs in paper trading mode only. Real IBKR connectivity is permanently disabled for safety.
          </p>
        </div>

        <div style={{
          background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)',
          borderRadius: '16px', padding: '14px',
        }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#a78bfa', marginBottom: '8px' }}>
            RISK FRAMEWORK
          </div>
          {[
            ['Risk Modes', 'AGGRESSIVE / NORMAL / CONSERVATIVE / DEFENSIVE'],
            ['Sizing', 'Beta-adjusted + Kelly fraction'],
            ['Circuit Breaker', '-8% daily drawdown'],
            ['Overnight Filter', 'Closes risky positions before EOD'],
            ['Attribution', 'Per-signal win rate tracking'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '7px' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: '11px', color: 'var(--text)', textAlign: 'right', fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Agent Quick Card (home tab) ──────────────────────────────────────────────

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
        style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <article className="mobile-visual-card" style={{
          border: circuitBroken
            ? '1px solid rgba(255,99,117,0.45)'
            : running
            ? '1px solid rgba(36,209,140,0.22)'
            : '1px solid rgba(148,163,184,0.14)',
        }}>
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

// ─── Agent View (full agent tab) ──────────────────────────────────────────────

function AgentView({
  agentStatus,
  backtest,
  decisions,
  closedTrades,
  attribution,
  equityCurve,
  toggleAgent,
  toggling,
}: {
  agentStatus: any
  backtest: any
  decisions: any[]
  closedTrades: any[]
  attribution: any
  equityCurve: any[]
  toggleAgent: () => void
  toggling: boolean
}) {
  const portfolio  = agentStatus?.paper_portfolio || {}
  const running    = !!agentStatus?.running
  const regime     = (agentStatus?.regime as string) || 'UNKNOWN'
  const riskMode   = (agentStatus?.risk_mode as string) || ''
  const tradeStyle = (agentStatus?.trade_style as string) || ''
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
      {/* ── Hero card with toggle ── */}
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
            {/* START / STOP toggle */}
            <button
              onClick={toggleAgent}
              disabled={toggling}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700, cursor: toggling ? 'not-allowed' : 'pointer',
                background: running ? 'rgba(255,99,117,0.14)' : 'rgba(36,209,140,0.14)',
                border: `1px solid ${running ? 'rgba(255,99,117,0.4)' : 'rgba(36,209,140,0.4)'}`,
                color: running ? '#ff6375' : '#24d18c',
                opacity: toggling ? 0.6 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {toggling
                ? <span style={{ width: '12px', height: '12px', borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                : running ? <Square size={12} /> : <Play size={12} />
              }
              {running ? 'STOP' : 'START'}
            </button>
            <RegimePill regime={regime} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '22px', fontWeight: 700, color: retColor(totalRet) }}>
            {fmtRet(totalRet)}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            total · VIX {vix.toFixed(1)}
          </span>
          {riskMode && <RiskModePill mode={riskMode} />}
          {tradeStyle && <TradeStylePill style={tradeStyle} />}
        </div>
      </article>

      {/* ── Stats grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '18px' }}>
        <StatChip label="Open Longs"  value={longs}     color="#24d18c" />
        <StatChip label="Positions"   value={positions} color="#a78bfa" />
        <StatChip label="Open Shorts" value={shorts}    color="#ff6375" />
        <StatChip label="Cash"        value={`$${(cash / 1000).toFixed(1)}k`}  color="#8fa2b5" />
        <StatChip label="Mode"        value="paper"     color="#60a5fa" />
        <StatChip label="Cycles"      value={agentStatus?.cycle_count ?? '—'} color="#fbbf24" />
      </div>

      {/* ── Equity curve ── */}
      <EquityCurveChart data={equityCurve} />

      {/* ── Open positions mini list ── */}
      {(portfolio.positions || []).length > 0 && (
        <section className="mobile-section">
          <div className="mobile-section-title">
            <h2>Open Positions</h2>
            <Activity size={18} />
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {(portfolio.positions as any[]).slice(0, 6).map((p: any, i: number) => {
              const pnl  = Number(p.unrealized_pnl || 0)
              const pct2 = Number(p.pnl_pct || 0)
              const isLong = (p.side || '').toUpperCase() === 'LONG'
              const holdStr = (() => {
                try {
                  if (!p.entry_ts) return ''
                  const h = (Date.now() - new Date(p.entry_ts).getTime()) / 3_600_000
                  return h < 24 ? `${h.toFixed(0)}h` : `${(h / 24).toFixed(1)}d`
                } catch { return '' }
              })()

              return (
                <div key={`${p.ticker}-${i}`} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 12px', background: '#0b1119',
                  border: '1px solid rgba(148,163,184,0.14)', borderRadius: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <span style={{
                      width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
                      background: isLong ? 'rgba(36,209,140,0.12)' : 'rgba(255,99,117,0.12)',
                      border: `1px solid ${isLong ? 'rgba(36,209,140,0.3)' : 'rgba(255,99,117,0.3)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700,
                      color: isLong ? '#24d18c' : '#ff6375',
                    }}>
                      {(p.ticker || '?').slice(0, 4)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{p.ticker}</span>
                        {p.trade_style && <TradeStylePill style={p.trade_style} />}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px' }}>
                        {p.qty} · {isLong ? 'LONG' : 'SHORT'} · ${(p.avg_price || 0).toFixed(2)}
                        {holdStr && <> · <Clock size={9} style={{ display: 'inline', margin: '0 1px 0 3px' }} />{holdStr}</>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
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

      {/* ── Decisions feed ── */}
      <DecisionsFeed decisions={decisions} />

      {/* ── Closed trades ── */}
      <MiniClosedTrades trades={closedTrades} />

      {/* ── Attribution ── */}
      <MiniAttribution attribution={attribution} />

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
                    <McStatBox label="Worst (P5)"   value={fmtRet(ret.p5)}  color="#ff6375" />
                    <McStatBox label="Median (P50)" value={fmtRet(ret.p50)} color="#eef4fb" />
                    <McStatBox label="Best (P95)"   value={fmtRet(ret.p95)} color="#24d18c" />
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Worst DD:&nbsp;<span style={{ color: '#ff6375', fontWeight: 600 }}>{dd?.p5_worst?.toFixed(1)}%</span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                      Median DD:&nbsp;<span style={{ color: '#fbbf24', fontWeight: 600 }}>{dd?.median?.toFixed(1)}%</span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{mc.strategy}</span>
                  </div>
                </article>
              )
            }

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
                  <McStatBox label="Sharpe"   value={(s.sharpe || 0).toFixed(2)}          color={(s.sharpe || 0) >= 1 ? '#24d18c' : '#fbbf24'} />
                  <McStatBox label="Win Rate" value={`${(s.win_rate || 0).toFixed(0)}%`}  color={(s.win_rate || 0) >= 50 ? '#24d18c' : '#ff6375'} />
                  <McStatBox label="Max DD"   value={`${(s.max_dd || 0).toFixed(1)}%`}    color="#ff6375" />
                </div>

                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--muted)' }}>
                  {s.trades} trades · vs SPY&nbsp;
                  <span style={{ color: beating ? '#24d18c' : '#ff6375', fontWeight: 700 }}>
                    {beating ? `+${alpha.toFixed(1)}% alpha` : `${alpha.toFixed(1)}% vs SPY`}
                  </span>
                  &nbsp;· Calmar {(s.calmar || 0).toFixed(2)}
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
          <div style={{
            border: '1px dashed rgba(148,163,184,0.22)', borderRadius: '18px',
            padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px',
          }}>
            No backtest data — run backtest from the desktop Agent tab.
          </div>
        </section>
      )}
    </>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function MobileExperience() {
  const dashboard = useMobileDashboard()
  const { agentStatus, backtest, decisions, closedTrades, attribution, equityCurve, toggleAgent, toggling } = useAgentData()
  const [active, setActive] = useState('home')
  const [selected, setSelected] = useState<any>(null)

  const portfolio    = dashboard?.portfolio || {}
  const positions    = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
  const scanner      = dashboard?.scanner || scannerFallback
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
      </header>
      <SearchCommand />

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

      {active === 'agent' && (
        <AgentView
          agentStatus={agentStatus}
          backtest={backtest}
          decisions={decisions}
          closedTrades={closedTrades}
          attribution={attribution}
          equityCurve={equityCurve}
          toggleAgent={toggleAgent}
          toggling={toggling}
        />
      )}

      {active === 'scanner'  && <ScannerSetups scanner={scanner} onSelect={setSelected} />}
      {active === 'settings' && <SettingsPanel agentStatus={agentStatus} />}

      <MobileBottomNav active={active} setActive={setActive} agentRunning={agentRunning} />
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
