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
  ChevronRight,
  Gauge,
  Home,
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

function MobileDetailView({ position, onClose }: { position: any; onClose: () => void }) {
  const [tab, setTab] = useState('AI Thesis')
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

  const tabs = ['AI Thesis', 'News', 'Risk']

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
        {tab === 'AI Thesis' && (
          <p>
            {details?.position?.ai_view ||
              position.ai_view ||
              details?.forecast?.base ||
              'PIA has no saved thesis yet. Treat this as a watch item until catalyst, valuation, and risk checks agree.'}
          </p>
        )}
        {tab === 'News' && (
          <div className="mobile-news-list">
            {(details?.news?.length ? details.news : [{ title: 'No fresh news loaded', impact: 'Neutral', action: 'Monitor only' }]).map(
              (item: any) => (
                <article key={item.title}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.impact} - {item.action}
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
              Stop discipline
              <b>{position.stop || 'Required'}</b>
            </span>
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

// ─── Agent tab data ───────────────────────────────────────────────────────────

function useAgentData() {
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [backtest, setBacktest] = useState<any>(null)

  useEffect(() => {
    const fetchAll = () => {
      fetch(`${API}/agent/status`).then(r => r.json()).then(setAgentStatus).catch(() => {})
    }
    fetchAll()
    fetch(`${API}/agent/backtest/status`).then(r => r.json()).then(d => {
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
  const summary     = agentStatus?.last_cycle_summary || {}
  const executed    = summary.executed ?? null
  const decisions   = summary.decisions ?? null
  const dailyPnl    = summary.daily_pnl_pct ?? null
  const circuitBroken = summary.circuit_broken === true
  const regime      = (agentStatus?.last_regime as string) || null
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
  const regime     = (agentStatus?.last_regime as string) || 'UNKNOWN'
  const vix        = Number(agentStatus?.last_vix || 0)
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

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
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
      {active === 'agent'     && <AgentView agentStatus={agentStatus} backtest={backtest} />}
      {active === 'scanner'   && <ScannerSetups scanner={scanner} onSelect={setSelected} />}
      {active === 'settings'  && <PlaceholderPanel title="Settings" />}

      <MobileBottomNav active={active} setActive={setActive} agentRunning={agentRunning} />
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
