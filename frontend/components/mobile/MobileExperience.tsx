'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  Home,
  LineChart,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import GlowCard from '../ui/GlowCard'
import IntelligenceBadge from '../ui/IntelligenceBadge'

const API = 'http://127.0.0.1:8000'

const money = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

const pct = (value: unknown) => `${Number(value || 0).toFixed(2)}%`

const marketFallback = [
  { name: 'S&P 500', value: '6,241.80', chg: 0.42 },
  { name: 'Nasdaq', value: '21,108.60', chg: 0.68 },
  { name: 'VIX', value: '14.2', chg: -2.1 },
  { name: 'EUR/USD', value: '1.089', chg: 0.12 },
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
    portfolio_impact: 'Adds cyclical AI beta; keep below current NVDA exposure.',
  },
  {
    ticker: 'GOOGL',
    label: 'Review',
    setup: 'AI search monetization rerating',
    price: 178.42,
    entry_zone: '174-180',
    stop: '169',
    portfolio_impact: 'Improves mega-cap diversification with lower portfolio risk.',
  },
]

const chartSeries = [
  { t: '09:30', v: 100 },
  { t: '10:30', v: 100.8 },
  { t: '11:30', v: 100.2 },
  { t: '12:30', v: 101.4 },
  { t: '14:00', v: 102.1 },
  { t: '16:00', v: 101.7 },
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
  const rows = items.length ? items : marketFallback
  return (
    <section className="mobile-pulse" aria-label="Market pulse">
      {rows.map((item: any) => (
        <article key={item.name} className="mobile-pulse-card">
          <span>{item.name}</span>
          <strong>{item.value}</strong>
          <small className={Number(item.chg) >= 0 ? 'green' : 'red'}>{pct(item.chg)}</small>
        </article>
      ))}
    </section>
  )
}

function PortfolioSnapshot({ portfolio }: { portfolio: any }) {
  return (
    <GlowCard className="mobile-snapshot">
      <div className="mobile-card-head">
        <div>
          <span>Portfolio</span>
          <strong>{money(portfolio.total_value || 58170)}</strong>
        </div>
        <IntelligenceBadge label={portfolio.risk_mode || 'Balanced'} tone="neutral" />
      </div>
      <div className="mobile-snapshot-chart">
        <ResponsiveContainer>
          <AreaChart data={chartSeries}>
            <Tooltip />
            <Area dataKey="v" stroke="#24d18c" fill="#24d18c22" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mobile-snapshot-grid">
        <span>
          Today
          <b className={Number(portfolio.daily_pnl || 420) >= 0 ? 'green' : 'red'}>
            {money(portfolio.daily_pnl || 420)}
          </b>
        </span>
        <span>
          Cash
          <b>{money(portfolio.cash || 6900)}</b>
        </span>
        <span>
          Buying power
          <b>{money(portfolio.buying_power || 18400)}</b>
        </span>
      </div>
    </GlowCard>
  )
}

function UrgentAlerts({ portfolio }: { portfolio: any }) {
  const alerts = portfolio.guardrails?.length
    ? portfolio.guardrails
    : [
        { title: 'NVDA concentration near cap', text: 'Trim or hedge if it closes above the risk threshold.', level: 'warn' },
        { title: 'Fed minutes today', text: 'Avoid oversized entries before the macro release.', level: 'warn' },
      ]

  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Urgent Alerts</h2>
        <Bell size={18} />
      </div>
      <div className="mobile-alert-list">
        {alerts.slice(0, 3).map((alert: any, index: number) => (
          <GlowCard className="mobile-alert" key={`${alert.title}-${index}`}>
            <AlertTriangle size={18} className={alert.level === 'danger' ? 'red' : 'green'} />
            <div>
              <strong>{alert.title}</strong>
              <span>{alert.text}</span>
            </div>
          </GlowCard>
        ))}
      </div>
    </section>
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
      <GlowCard className="mobile-brief">
        {actions.slice(0, 3).map((action: any) => (
          <article key={action.title}>
            <strong>{action.title}</strong>
            <p>{action.text}</p>
          </article>
        ))}
      </GlowCard>
    </section>
  )
}

function OpportunityPreview({ scanner, onSelect }: { scanner: any[]; onSelect: (position: any) => void }) {
  const rows = scanner.length ? scanner : scannerFallback
  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Opportunity Scanner</h2>
        <LineChart size={18} />
      </div>
      <div className="mobile-opportunities">
        {rows.slice(0, 3).map((item: any) => (
          <button key={item.ticker} className="mobile-opportunity" onClick={() => onSelect({ symbol: item.ticker, ...item })}>
            <div>
              <strong>{item.ticker}</strong>
              <span>{item.setup}</span>
            </div>
            <div>
              <b>{money(item.price)}</b>
              <small>{item.label}</small>
            </div>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    </section>
  )
}

function PositionCards({ rows, onSelect }: { rows: any[]; onSelect: (position: any) => void }) {
  const positions = rows.length ? rows : positionFallback
  return (
    <section className="mobile-section">
      <div className="mobile-section-title">
        <h2>Positions</h2>
        <BriefcaseBusiness size={18} />
      </div>
      <div className="mobile-position-list">
        {positions.map((position: any) => {
          const risk = Number(position.risk || 0)
          const change = Number(position.day_change_pct || position.change_pct || 0)
          return (
            <button className="mobile-position-card" key={position.symbol} onClick={() => onSelect(position)}>
              <div className="mobile-position-main">
                <div>
                  <strong>{position.symbol}</strong>
                  <span>{position.name || 'Portfolio holding'}</span>
                </div>
                <div>
                  <b>{money(position.last || position.price || position.market_value)}</b>
                  <small className={change >= 0 ? 'green' : 'red'}>{pct(change)}</small>
                </div>
              </div>
              <div className="mobile-position-meta">
                <span>{pct(position.portfolio_pct)} portfolio</span>
                <IntelligenceBadge label={`${risk || 31} risk`} tone={riskTone(risk || 31)} />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MobileDetailView({ position, onClose }: { position: any; onClose: () => void }) {
  const [tab, setTab] = useState('AI Thesis')
  const [details, setDetails] = useState<any>(null)
  const ticker = position.symbol || position.ticker

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
      <header className="mobile-detail-header">
        <div>
          <span>{position.name || 'Position detail'}</span>
          <h1>{ticker}</h1>
        </div>
        <button onClick={onClose} aria-label="Close detail">
          <X size={20} />
        </button>
      </header>
      <div className="mobile-detail-price">
        <strong>{money(position.last || position.price || details?.watch?.price || 0)}</strong>
        <span className={Number(position.day_change_pct || position.change_pct || 0) >= 0 ? 'green' : 'red'}>
          {pct(position.day_change_pct || position.change_pct || 0)}
        </span>
      </div>
      <section className="mobile-detail-chart">
        <ResponsiveContainer>
          <AreaChart data={chartSeries}>
            <Tooltip />
            <Area dataKey="v" stroke="#60a5fa" fill="#60a5fa24" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
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
      <GlowCard className="mobile-placeholder">
        <strong>{title}</strong>
        <span>Mobile shell ready. Full controls stay in the desktop dashboard for this sprint.</span>
      </GlowCard>
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
      <MarketPulse items={dashboard?.macros?.market_strip || []} />

      {active === 'home' && (
        <>
          <PortfolioSnapshot portfolio={portfolio} />
          <UrgentAlerts portfolio={portfolio} />
          <DailyBrief portfolio={portfolio} />
          <OpportunityPreview scanner={scanner} onSelect={setSelected} />
        </>
      )}

      {active === 'portfolio' && <PositionCards rows={positions} onSelect={setSelected} />}
      {active === 'scanner' && <OpportunityPreview scanner={scanner} onSelect={setSelected} />}
      {active === 'markets' && <MarketPulse items={dashboard?.macros?.market_strip || []} />}
      {active === 'settings' && <PlaceholderPanel title="Settings" />}

      <MobileBottomNav active={active} setActive={setActive} />
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
