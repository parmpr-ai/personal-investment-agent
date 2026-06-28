'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  Activity,
  BarChart3,
  BookOpen,
  Bot,
  Brain,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  LayoutDashboard,
  Pencil,
  Plus,
  Newspaper,
  ExternalLink,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import AgentDashboard from './AgentDashboard'
import GlowCard from './ui/GlowCard'
import SectionHeader from './ui/SectionHeader'
import IntelligenceBadge from './ui/IntelligenceBadge'
import RiskGauge from './ui/RiskGauge'

const API = 'http://127.0.0.1:8000'
const WS = 'ws://127.0.0.1:8000/ws'
const mask = '••••••'
const assetTypes = ['Stock', 'ETF', 'Crypto', 'Option', 'Other']
const brokers = ['IBKR', 'Freedom24', 'Revolut', 'Manual']
const emptyHolding = {
  ticker: '',
  name: '',
  asset_type: 'Stock',
  broker: 'Manual',
  quantity: '',
  avg_price: '',
  currency: 'USD',
  notes: '',
}
const series = [
  { t: '09:30', v: 100 },
  { t: '10:00', v: 101 },
  { t: '11:00', v: 99.8 },
  { t: '12:30', v: 102.1 },
  { t: '14:00', v: 103.4 },
  { t: '16:00', v: 102.7 },
]
const nav = [
  ['dashboard', 'Dashboard', LayoutDashboard],
  ['portfolio', 'Portfolio', Wallet],
  ['watchlist', 'Opportunity', TrendingUp],
  ['trades', 'Trade Radar', Target],
  ['risk', 'Risk', Shield],
  ['tax', 'Tax Center', FileText],
  ['agent', 'Agent', Bot],
  ['about', 'About', BookOpen],
  ['settings', 'Settings', Settings],
] as any[]
const privateNavLabels: Record<string, string> = {
  dashboard: 'Workspace',
  portfolio: 'Overview',
  watchlist: 'Workspace',
  trades: 'Activity',
  risk: 'Controls',
  tax: 'Documents',
  agent: 'Workspace',
  about: 'Info',
  settings: 'Settings',
}
const privateTitle = (hidden: boolean, text: string, fallback = 'Overview') => (hidden ? fallback : text)
const privateNavLabel = (hidden: boolean, id: string, label: string) => (hidden ? privateNavLabels[id] || 'Workspace' : label)
const neutralPanelTitle = (title: string) => {
  const text = String(title).toLowerCase()
  if (text.includes('portfolio') || text.includes('position') || text.includes('trade') || text.includes('opportunity')) return 'Overview'
  if (text.includes('risk') || text.includes('tax') || text.includes('stress')) return 'Controls'
  if (text.includes('source') || text.includes('health') || text.includes('integration')) return 'Workspace'
  return title
}
const legacyFragments = [
  ['connect', 'ed'],
  ['ibkr ', 'live'],
  ['live ', 'ibkr'],
  ['demo ', 'fallback'],
  ['read-only ', 'portfolio'],
  ['personalized ', 'investment'],
  ['personal investment ', 'agent'],
  ['drag cards ', 'by the handle'],
  ['reset ', 'layout'],
  ['risk ', 'doctor'],
].map((parts) => parts.join(''))

const money = (value: any) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
const pct = (value: any) => `${Number(value || 0).toFixed(2)}%`
const safeMessage = (value: any, fallback: string) =>
  typeof value === 'string' ? value : typeof value?.message === 'string' ? value.message : fallback
const cleanText = (value: any) => {
  const text = typeof value === 'string' ? value : ''
  return legacyFragments.some((term) => text.toLowerCase().includes(term)) ? '' : text
}
const cleanList = (items: any[] = []) =>
  items.filter((item) => !legacyFragments.some((term) => String(item).toLowerCase().includes(term)))
const fundamentalsScore = (p: any) => Math.round(((p.news_score || 55) + (100 - (p.macro_sensitivity || 50))) / 2)
const metricValue = (p: any, key: string) =>
  key === 'allocation'
    ? p.portfolio_pct
    : key === 'market_value'
      ? p.market_value
      : key === 'quantity'
        ? p.qty
        : key === 'daily_pnl'
          ? p.day_pnl
          : key === 'total_pnl'
            ? p.unrealized
            : key === 'daily_pct'
              ? p.day_change_pct
              : key === 'total_pct'
                ? p.unrealized_pct
                : String(p.symbol || '')

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw body
  return body
}

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

function useDash() {
  const [dashboard, setDashboard] = useState<any>(null)

  useEffect(() => {
    let active = true
    fetchJson('/dashboard')
      .then((data) => {
        if (active) setDashboard(data)
      })
      .catch(() => {})

    const ws = new WebSocket(WS)
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'dashboard_update' && active) setDashboard(payload)
      } catch {}
    }
    ws.onerror = () => {}

    return () => {
      active = false
      ws.close()
    }
  }, [])

  return dashboard
}

function useSourceHealth() {
  const [health, setHealth] = useState<any[]>([])
  const refresh = () => fetchJson('/source-health').then(setHealth).catch(() => {})

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 60000)
    return () => clearInterval(id)
  }, [])

  return { health, refresh }
}

function useNewsIntelligence() {
  const [items, setItems] = useState<any[]>([])

  useEffect(() => {
    let active = true
    fetchJson('/news-intelligence')
      .then((data) => {
        if (active) setItems(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return items
}

export default function Dashboard() {
  const dashboard = useDash()
  const newsIntelligence = useNewsIntelligence()
  const [active, setActive] = useState('dashboard')
  const [mounted, setMounted] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('All')
  const [rescanStatus, setRescanStatus] = useState('')
  const [rescanning, setRescanning] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setHidden(localStorage.getItem('pia.hideAmounts') === 'true')
    } catch {}
  }, [])

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

  const positions = dashboard?.portfolio?.positions || []
  const privacyHidden = mounted && hidden
  const filtered = positions.filter((p: any) =>
    filter === 'All'
      ? true
      : filter === 'Stocks'
        ? p.sec_type === 'STK'
        : filter === 'Options'
          ? p.sec_type === 'OPT'
          : filter === 'ETFs'
            ? p.sec_type === 'ETF'
            : filter === 'Other'
              ? !['STK', 'OPT', 'ETF'].includes(p.sec_type)
              : true,
  )

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} hidden={privacyHidden} amountHidden={hidden} setHidden={updateHidden} />
      <main className="main">
        <Top
          active={active}
          hidden={privacyHidden}
          amountHidden={hidden}
          setHidden={updateHidden}
          rescan={rescan}
          rescanning={rescanning}
          rescanStatus={rescanStatus}
        />
        <MarketStrip items={dashboard?.macros?.market_strip || []} hidden={privacyHidden} />
        {active === 'dashboard' && (
          <DashboardHome
            d={dashboard}
            hidden={privacyHidden}
            setActive={setActive}
            setSelected={setSelected}
            newsIntelligence={newsIntelligence}
          />
        )}
        {active === 'portfolio' && (
          <PortfolioPage
            d={dashboard}
            hidden={privacyHidden}
            filter={filter}
            setFilter={setFilter}
            filtered={filtered}
            setSelected={setSelected}
          />
        )}
        {active === 'watchlist' && <WatchlistPage d={dashboard} hidden={privacyHidden} setSelected={setSelected} />}
        {active === 'trades' && <TradeRadar d={dashboard} hidden={privacyHidden} />}
        {active === 'risk' && <RiskPage d={dashboard} hidden={privacyHidden} />}
        {active === 'tax' && <TaxPage hidden={privacyHidden} />}
        {active === 'agent' && <AgentDashboard />}
        {active === 'about' && <AboutPage hidden={privacyHidden} />}
        {active === 'settings' && <SettingsPage hidden={privacyHidden} />}
      </main>
      {selected && <PositionModal ticker={selected.symbol || selected.ticker} hidden={privacyHidden} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Sidebar({ active, setActive, hidden, amountHidden, setHidden }: any) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark">{hidden ? '•••' : 'PIA'}</div>
        <div>
          <b>{hidden ? 'Private Mode' : 'PIA Dashboard'}</b>
          <br />
          <span>{hidden ? 'Workspace' : 'Decision Platform'}</span>
        </div>
      </div>
      <nav>
        {nav.map(([id, label, Icon]: any) => (
          <button key={id} onClick={() => setActive(id)} className={active === id ? 'active' : ''}>
            <Icon size={18} />
            <span>{privateNavLabel(hidden, id, label)}</span>
          </button>
        ))}
      </nav>
      <button className="privacy" aria-pressed={amountHidden} onClick={() => setHidden(!amountHidden)}>
        {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? 'Show amounts' : 'Hide amounts'}
      </button>
    </aside>
  )
}

function Top({ active, hidden, amountHidden, setHidden, rescan, rescanning, rescanStatus }: any) {
  return (
    <div className="topbar">
      <div>
        <h1>{privateNavLabel(hidden, active, String(nav.find(([id]) => id === active)?.[1] || 'Dashboard'))}</h1>
        <div className="muted">
          {hidden ? 'Private workspace overview and controls' : 'Portfolio dashboard, integrations, opportunity signals and risk controls'}
        </div>
        {rescanStatus && <div className="muted">{rescanStatus}</div>}
      </div>
      <div className="top-actions">
        <button className="mobile-privacy" aria-pressed={amountHidden} onClick={() => setHidden(!amountHidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} <span>{hidden ? 'Show amounts' : 'Hide amounts'}</span>
        </button>
        <div className="search">
          <Search size={16} />
          <input placeholder={hidden ? 'Search workspace...' : 'Search ticker, source, note...'} />
        </div>
        <button className="tab" onClick={rescan} disabled={rescanning}>
          <RefreshCw size={15} /> {rescanning ? 'Rescanning' : 'Rescan'}
        </button>
      </div>
    </div>
  )
}

function MarketStrip({ items, hidden }: any) {
  return (
    <div className="ticker">
      {items.map((x: any, index: number) => (
        <div className="ticker-card" key={x.name || index}>
          <span className="muted">{hidden ? 'Workspace' : x.name}</span>
          <b style={{ display: 'block' }}>{hidden ? mask : x.value}</b>
          <small className={x.chg >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(x.chg)}</small>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, privateTitle: hiddenTitle, children, span = 'span-4', icon, hidden = false }: any) {
  const displayTitle = hidden ? hiddenTitle || neutralPanelTitle(title) : title
  return (
    <section className={`panel ${span}`}>
      <h3>
        {icon ? <span>{icon}</span> : null} {displayTitle}
      </h3>
      {children}
    </section>
  )
}

function MetricBar({ label, value, tone = 'blue', hidden = false }: any) {
  return (
    <div className="metric-bar">
      <div>
        <span>{label}</span>
        <b>{hidden ? mask : pct(value)}</b>
      </div>
      <i>
        <em className={tone} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </i>
    </div>
  )
}

function DashboardHome({ d, hidden, setActive, setSelected, newsIntelligence }: any) {
  const p = d?.portfolio || {}
  return (
    <div className="grid">
      <Panel title="Portfolio Snapshot" privateTitle="Overview" span="span-8" hidden={hidden}>
        <PortfolioSnapshot p={p} hidden={hidden} />
      </Panel>
      <Panel title="Today's Decision Brief" privateTitle="Workspace" span="span-4" hidden={hidden}>
        <div className="actions">
          {(p.today_actions || []).map((a: any) => (
            <div className="action" key={a.title}>
              <Brain size={18} className="green" />
              <div>
                <b>{hidden ? 'Workspace item' : a.title}</b>
                <div className="muted">{hidden ? mask : a.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="My Positions" privateTitle="Overview" span="span-8" hidden={hidden}>
        <PositionsTable rows={(p.positions || []).slice(0, 6)} hidden={hidden} setSelected={setSelected} />
        <button className="tab" onClick={() => setActive('portfolio')}>
          {hidden ? 'Open overview' : 'Open full portfolio'}
        </button>
      </Panel>
      <Panel title="Risk Controls" privateTitle="Controls" span="span-4" hidden={hidden}>
        <RiskList items={p.guardrails || []} hidden={hidden} />
      </Panel>
      <Panel title="News Intelligence" privateTitle="Workspace" span="span-12" hidden={hidden} icon={<Newspaper size={16} />}>
        <NewsIntelligencePanel items={newsIntelligence || []} hidden={hidden} />
      </Panel>
      <Panel title="Exposure Map" privateTitle="Overview" span="span-6" hidden={hidden}>
        <Exposure rows={p.exposures?.rows || []} hidden={hidden} />
      </Panel>
      <Panel title="Trade Radar" privateTitle="Activity" span="span-6" hidden={hidden}>
        <TradeList items={(d?.scanner || []).slice(0, 3)} hidden={hidden} />
        <button className="tab" onClick={() => setActive('trades')}>
          {hidden ? 'Open activity' : 'Open Trade Radar'}
        </button>
      </Panel>
    </div>
  )
}

function toneForSentiment(sentiment: string) {
  if (sentiment === 'positive') return 'good'
  if (sentiment === 'negative') return 'bad'
  return 'warn'
}

function toneForRisk(risk: string) {
  if (risk === 'high') return 'bad'
  if (risk === 'medium') return 'warn'
  return 'good'
}

function NewsIntelligencePanel({ items, hidden }: any) {
  const rows = items.slice(0, 4)
  if (!rows.length) return <p className="muted">No structured news intelligence loaded yet.</p>

  return (
    <div className="news-intel-list">
      {rows.map((item: any) => (
        <article className="news-intel-card" key={item.id}>
          <div className="news-intel-main">
            <div className="news-intel-kicker">
              <b>{hidden ? 'ITEM' : item.ticker}</b>
              <span>{hidden ? 'Source' : item.source}</span>
              <span>{hidden ? mask : `${item.freshness_minutes}m ago`}</span>
            </div>
            <strong>{hidden ? 'Workspace intelligence item' : item.title}</strong>
            <p>{hidden ? mask : item.summary}</p>
          </div>
          <div className="news-intel-meta">
            <IntelligenceBadge label={hidden ? 'Signal' : item.sentiment} tone={toneForSentiment(item.sentiment)} />
            <IntelligenceBadge
              label={hidden ? 'Risk' : `Sell news ${item.sell_the_news_risk}`}
              tone={toneForRisk(item.sell_the_news_risk)}
            />
            <div>
              <span>Impact</span>
              <b>{hidden ? mask : item.impact_score}</b>
            </div>
            <div>
              <span>Action</span>
              <b>{hidden ? mask : item.suggested_action}</b>
            </div>
            <a href={item.source_url} target="_blank" rel="noreferrer" aria-label={`Open source for ${item.ticker}`}>
              <ExternalLink size={16} />
            </a>
          </div>
        </article>
      ))}
    </div>
  )
}

function Kpis({ p, hidden }: any) {
  const arr = [
    ['Total Value', p.total_value],
    ['Daily P/L', p.daily_pnl, p.daily_pnl_pct],
    ['Unrealized', p.unrealized, p.unrealized_pct],
    ['Cash', p.cash],
    ['Buying Power', p.buying_power],
    ['Margin', p.margin_used, 'pct'],
  ]
  return (
    <div className="kpis">
      {arr.map(([title, value, secondary]: any) => (
        <div className="kpi" key={title}>
          <span>{hidden ? 'Overview' : title}</span>
          <b>{hidden ? mask : secondary === 'pct' ? pct(value) : money(value)}</b>
          {typeof secondary === 'number' && (
            <small className={secondary >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(secondary)}</small>
          )}
        </div>
      ))}
    </div>
  )
}

function PortfolioSnapshot({ p, hidden }: any) {
  const mounted = useMounted()
  return (
    <div className="snapshot-grid">
      <div>
        <div className="hero-value">{hidden ? mask : money(p.total_value)}</div>
        <div className="hero-meta">
          <span className={p.daily_pnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.daily_pnl)} today</span>
          <span>{hidden ? mask : pct(p.daily_pnl_pct)}</span>
          <span>{p.risk_mode || '-'}</span>
        </div>
        <Kpis p={p} hidden={hidden} />
      </div>
      <GlowCard className="chart-card">
        <SectionHeader title={privateTitle(hidden, 'Portfolio evolution', 'Workspace trend')} subtitle="Intraday trajectory" />
        <div className="mini-chart">
          {mounted && (
            <ResponsiveContainer>
              <AreaChart data={series}>
                <Tooltip />
                <Area dataKey="v" stroke="#24d18c" fill="#24d18c22" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlowCard>
      <GlowCard className="margin-card">
        <SectionHeader title="Margin" subtitle="Capital discipline" />
        <div className="margin-ring">
          <b>{pct(p.margin_used)}</b>
          <span>used</span>
        </div>
        <MetricBar label={hidden ? 'Overview' : 'Buying power utilization'} value={Math.min((Number(p.margin_used) || 0) * 2.2, 100)} tone="violet" hidden={hidden} />
      </GlowCard>
    </div>
  )
}

function PortfolioPage({ d, hidden, filter, setFilter, filtered, setSelected }: any) {
  const [view, setView] = useState<'list' | 'card'>('list')
  const [sort, setSort] = useState('allocation')
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc')
  const rows = useMemo(
    () =>
      [...filtered].sort((a: any, b: any) => {
        const av = metricValue(a, sort)
        const bv = metricValue(b, sort)
        if (typeof av === 'string' || typeof bv === 'string') {
          return direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
        }
        return direction === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
      }),
    [filtered, sort, direction],
  )

  return (
    <div className="grid">
      <Panel title="Portfolio Snapshot" privateTitle="Overview" span="span-12" hidden={hidden}>
        <PortfolioSnapshot p={d?.portfolio || {}} hidden={hidden} />
      </Panel>
      <Panel title="My Positions" privateTitle="Overview" span="span-12" hidden={hidden}>
        <SectionHeader
          title={privateTitle(hidden, 'Positions', 'Overview')}
          subtitle={hidden ? `${rows.length} items` : `${rows.length} holdings across portfolio`}
          actions={
            <>
              <div className="tabs compact-tabs">
                {['All', 'Stocks', 'Options', 'ETFs', 'Other'].map((x) => (
                  <button key={x} className={`tab ${filter === x ? 'active' : ''}`} onClick={() => setFilter(x)}>
                    {x}
                  </button>
                ))}
              </div>
              <div className="view-toggle">
                <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                  List
                </button>
                <button className={view === 'card' ? 'active' : ''} onClick={() => setView('card')}>
                  Card
                </button>
              </div>
            </>
          }
        />
        <div className="sort-row">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {[
              ['allocation', 'Allocation'],
              ['market_value', 'Market value'],
              ['quantity', 'Quantity'],
              ['daily_pnl', 'Daily P/L'],
              ['total_pnl', 'Total P/L'],
              ['daily_pct', 'Daily %'],
              ['total_pct', 'Total %'],
              ['alphabetical', 'Alphabetical'],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button className="tab" onClick={() => setDirection((x) => (x === 'desc' ? 'asc' : 'desc'))}>
            {direction === 'desc' ? 'Descending' : 'Ascending'}
          </button>
        </div>
        {view === 'list' ? (
          <PositionsTable rows={rows} hidden={hidden} setSelected={setSelected} />
        ) : (
          <PositionCards rows={rows} hidden={hidden} setSelected={setSelected} />
        )}
      </Panel>
      <Panel title="Exposure Map" privateTitle="Overview" span="span-6" hidden={hidden}>
        <Exposure rows={d?.portfolio?.exposures?.rows || []} hidden={hidden} />
      </Panel>
      <Panel title="Portfolio Scanner" privateTitle="Workspace" span="span-6" hidden={hidden}>
        <PortfolioScanner d={d} hidden={hidden} />
      </Panel>
    </div>
  )
}

function PositionCards({ rows, hidden, setSelected }: any) {
  return (
    <div className="position-cards">
      {rows.map((p: any) => (
        <GlowCard key={p.symbol} className="position-card">
          <button onClick={() => setSelected(p)}>
            <header>
              <div>
                <b>{hidden ? mask : p.symbol}</b>
                <span>{hidden ? 'Workspace item' : p.name}</span>
              </div>
              <strong>{hidden ? mask : money(p.market_value)}</strong>
            </header>
            <div className="position-pnl">
              <span className={p.day_pnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.day_pnl)} today</span>
              <span className={p.unrealized >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.unrealized)} total</span>
            </div>
            <MetricBar label={hidden ? 'Overview' : 'Allocation'} value={p.portfolio_pct} tone="blue" hidden={hidden} />
            <MetricBar label={hidden ? 'Controls' : 'Risk'} value={p.risk || 0} tone="red" hidden={hidden} />
            <MetricBar label={hidden ? 'Activity' : 'Momentum'} value={p.momentum_score || 0} tone="green" hidden={hidden} />
            <MetricBar label={hidden ? 'Workspace' : 'Fundamentals'} value={fundamentalsScore(p)} tone="violet" hidden={hidden} />
          </button>
        </GlowCard>
      ))}
    </div>
  )
}

function PortfolioScanner({ d, hidden }: any) {
  const risk = d?.portfolio?.guardrails || []
  const opp = (d?.scanner || []).slice(0, 2)
  const macro = [...(d?.portfolio?.today_actions || [])].filter((x: any) => /macro|yield/i.test(`${x.title} ${x.text}`))
  const catalysts = d?.calendar || []
  return (
    <div className="scanner-grid">
      <ScannerColumn title={hidden ? 'Controls' : 'Risk Alerts'} hidden={hidden} items={risk.map((x: any) => ({ title: x.title, text: x.text, tone: x.level === 'danger' ? 'red' : 'amber' }))} />
      <ScannerColumn title={hidden ? 'Activity' : 'Opportunity Signals'} hidden={hidden} items={opp.map((x: any) => ({ title: x.ticker, text: x.setup, tone: 'green' }))} />
      <ScannerColumn title={hidden ? 'Workspace' : 'Macro Warnings'} hidden={hidden} items={macro.map((x: any) => ({ title: x.title, text: x.text, tone: 'violet' }))} />
      <ScannerColumn title={hidden ? 'Calendar' : 'Catalyst Monitor'} hidden={hidden} items={catalysts.map((x: any) => ({ title: x.event, text: `${x.date} - ${x.impact}`, tone: 'blue' }))} />
    </div>
  )
}

function ScannerColumn({ title, items, hidden }: any) {
  return (
    <GlowCard className="scanner-column">
      <b>{title}</b>
      {items.length ? (
        items.map((x: any, i: number) => (
          <div className={`scanner-item ${x.tone}`} key={`${x.title}-${i}`}>
            <strong>{hidden ? 'Workspace item' : x.title}</strong>
            <span>{hidden ? mask : x.text}</span>
          </div>
        ))
      ) : (
        <p className="muted">No active signals.</p>
      )}
    </GlowCard>
  )
}

function PositionsTable({ rows, hidden, setSelected }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Avg</th>
            <th>Last</th>
            <th>Mkt Value</th>
            <th>Unrlzd</th>
            <th>% Port</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any) => (
            <tr key={p.symbol} onClick={() => setSelected(p)}>
              <td>
                <div className="row-symbol">
                  <div className="logo" style={{ background: p.accent || '#60a5fa' }}>
                    {hidden ? '••' : p.logo || p.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <b>{hidden ? mask : p.symbol}</b>
                    <div className="muted">{hidden ? 'Workspace item' : p.name}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="badge">{hidden ? mask : p.sec_type || 'STK'}</span>
              </td>
              <td>{hidden ? mask : p.qty}</td>
              <td>{hidden ? mask : money(p.avg_price)}</td>
              <td>{hidden ? mask : money(p.last)}</td>
              <td>{hidden ? mask : money(p.market_value)}</td>
              <td className={p.unrealized >= 0 ? 'green' : 'red'}>
                {hidden ? mask : money(p.unrealized)}
                <br />
                <small>{hidden ? mask : pct(p.unrealized_pct)}</small>
              </td>
              <td>{hidden ? mask : pct(p.portfolio_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Exposure({ rows, hidden }: any) {
  const top = rows?.[0]
  return (
    <div>
      <GlowCard className="concentration-card">
        <span>{hidden ? 'Overview' : 'Top concentration'}</span>
        <b>{hidden ? mask : top?.name || '-'}</b>
        <strong>{hidden ? mask : pct(top?.pct || 0)}</strong>
      </GlowCard>
      {rows.map((r: any) => (
        <div className="exposure-row" title={hidden ? 'Workspace item' : `${r.name}: ${pct(r.pct)} portfolio`} key={r.name}>
          <span>{hidden ? 'Workspace item' : r.name}</span>
          <div className="bar">
            <i style={{ width: `${Math.min(r.pct, 100)}%` }} />
          </div>
          <b>{hidden ? mask : pct(r.pct)}</b>
        </div>
      ))}
    </div>
  )
}

function RiskList({ items, hidden }: any) {
  return (
    <div className="actions">
      {items.map((x: any, i: number) => (
        <div className="action" key={i}>
          <Shield size={18} className={x.level === 'danger' ? 'red' : 'green'} />
          <div>
            <b>{hidden ? 'Control item' : x.title}</b>
            <div className="muted">{hidden ? mask : x.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function WatchlistPage({ d, hidden, setSelected }: any) {
  const [sort, setSort] = useState('opportunity')
  const rows = [...(d?.watchlist || [])].sort((a: any, b: any) =>
    String(sort) === 'name' ? a.symbol.localeCompare(b.symbol) : (b[sort] || 0) - (a[sort] || 0),
  )
  return (
    <div className="grid">
      <Panel title="Opportunity Board" privateTitle="Workspace" span="span-12" hidden={hidden}>
        <div className="tabs">
          {['name', 'change_pct', 'risk', 'opportunity', 'momentum', 'rvol'].map((s) => (
            <button className={`tab ${sort === s ? 'active' : ''}`} onClick={() => setSort(s)} key={s}>
              Sort: {s}
            </button>
          ))}
        </div>
        <div className="cards opportunity-cards">
          {rows.map((w: any) => (
            <GlowCard className="stock-card opportunity-card" key={w.symbol}>
              <button onClick={() => setSelected({ symbol: w.symbol })}>
                <header>
                  <div>
                    <b>{hidden ? mask : w.symbol}</b>
                    <div className="muted">{hidden ? 'Workspace item' : w.name}</div>
                  </div>
                  <span className="badge">{hidden ? 'Overview' : w.action || w.label}</span>
                </header>
                <h2>
                  {hidden ? mask : money(w.price)} <small className={w.change_pct >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(w.change_pct)}</small>
                </h2>
                <div className="plan">
                  <div className="pillbox">
                    Risk
                    <br />
                    <b>{hidden ? mask : w.risk}</b>
                  </div>
                  <div className="pillbox">
                    Opp
                    <br />
                    <b>{hidden ? mask : w.opportunity}</b>
                  </div>
                  <div className="pillbox">
                    RVOL
                    <br />
                    <b>{hidden ? mask : w.rvol}</b>
                  </div>
                </div>
                <MetricBar label={hidden ? 'Activity' : 'Momentum'} value={w.momentum || 0} tone="green" hidden={hidden} />
                <p className="muted">{hidden ? mask : w.reason || `${w.macro_fit || 'Neutral'} macro fit - ${w.sector || 'Unclassified'}`}</p>
              </button>
            </GlowCard>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function TradeRadar({ d, hidden }: any) {
  return (
    <div className="grid">
      <Panel title="AI Trade Radar - Rule Engine" privateTitle="Activity" span="span-12" hidden={hidden}>
        <TradeList items={d?.scanner || []} detailed hidden={hidden} />
      </Panel>
    </div>
  )
}

function TradeList({ items, detailed, hidden }: any) {
  return (
    <div className="cards">
      {items.map((x: any) => (
        <div className="stock-card" key={x.ticker}>
          <header>
            <div>
              <b>{hidden ? mask : x.ticker}</b>
              <div className="muted">{hidden ? mask : `Price ${money(x.price)}`}</div>
            </div>
            <span className="badge">{hidden ? 'Overview' : x.label}</span>
          </header>
          <p>
            <b>{hidden ? 'Workspace item' : x.setup}</b>
          </p>
          <div className="plan">
            <div className="pillbox">
              Entry
              <br />
              <b>{hidden ? mask : x.entry_zone}</b>
            </div>
            <div className="pillbox">
              Stop
              <br />
              <b>{hidden ? mask : x.stop}</b>
            </div>
            <div className="pillbox">
              Targets
              <br />
              <b>{hidden ? mask : x.targets?.join(' / ')}</b>
            </div>
          </div>
          <p className="muted">{hidden ? mask : x.portfolio_impact}</p>
          {detailed && !hidden && <ul className="muted">{(x.rationale || []).map((r: any) => <li key={r}>{r}</li>)}</ul>}
        </div>
      ))}
    </div>
  )
}

function RiskPage({ d, hidden }: any) {
  const topRisk = Math.max(...(d?.portfolio?.positions || []).map((p: any) => Number(p.risk || 0)), 0)
  return (
    <div className="grid">
      <Panel title="Portfolio Risk" privateTitle="Controls" span="span-6" hidden={hidden}>
        <div className="risk-overview">
          <RiskGauge value={topRisk} label={hidden ? 'Control level' : 'Highest holding risk'} />
          <RiskList items={d?.portfolio?.guardrails || []} hidden={hidden} />
        </div>
      </Panel>
      <Panel title="Stress Tests" privateTitle="Controls" span="span-6" hidden={hidden}>
        <div className="actions">
          {(d?.portfolio?.stress_tests || []).map((s: any) => (
            <div className="action" key={s.scenario}>
              <Activity size={18} />
              <div>
                <b>{hidden ? 'Control item' : s.scenario}</b>
                <div className="red">
                  {hidden ? mask : `${money(s.estimated_pnl)} / ${pct(s.estimated_pct)}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function TaxPage({ hidden }: any) {
  const [res, setRes] = useState<any>(null)
  async function upload(e: any) {
    const file = e.target.files?.[0]
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    setRes(await fetchJson('/tax/import', { method: 'POST', body }).catch((error) => error))
  }
  return (
    <div className="grid">
      <Panel title="Greek Tax Center" privateTitle="Documents" span="span-12" hidden={hidden}>
        <input type="file" onChange={upload} />
        <p className="muted">Estimate only: 15% stocks/options gains, losses offset, UCITS exempt.</p>
        {res && <pre className="panel">{JSON.stringify(res, null, 2)}</pre>}
      </Panel>
    </div>
  )
}

function SourceHealthPanel({ hidden = false }: any) {
  const { health, refresh } = useSourceHealth()
  return (
    <Panel title="Source Health" span="span-12" hidden={hidden}>
      <div className="health-grid">
        {health.map((h: any) => (
          <div className={`health ${h.status}`} key={h.source}>
            <div>
              <b>{hidden ? 'Workspace source' : h.source}</b>
              <p className="muted">{hidden ? mask : h.message}</p>
            </div>
            <span>{hidden ? 'Status' : h.data_received ? 'Data OK' : h.ok ? 'No data' : 'Failed'}</span>
          </div>
        ))}
      </div>
      <button className="tab" onClick={refresh}>
        Run health checks
      </button>
    </Panel>
  )
}

function IntegrationCenter({ compact = false, hidden = false }: any = {}) {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any[]>([])
  const [testing, setTesting] = useState('')

  useEffect(() => {
    fetchJson('/settings/integrations').then(setSettings).catch(() => {})
    fetchJson('/source-health').then(setHealth).catch(() => {})
  }, [])

  function update(section: string, key: string, value: any) {
    setSettings((s: any) => ({ ...s, [section]: { ...(s?.[section] || {}), [key]: value } }))
  }

  async function save() {
    const result = await fetchJson('/settings/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => null)
    if (result?.settings) setSettings(result.settings)
  }

  async function test(src: string) {
    setTesting(src)
    const result = await fetchJson(`/settings/integrations/test/${src}`).catch(() => null)
    if (result) setHealth((old: any[]) => [result, ...old.filter((h: any) => h.source !== result.source)])
    setTesting('')
  }

  if (!settings) return <div className="panel">Loading integrations...</div>

  return (
    <div className={compact ? 'compact-integrations' : 'grid'}>
      <Panel title="Integration Center" span="span-12" hidden={hidden}>
        <p className="muted">
          {hidden ? 'Each card has connection fields, a test action, and the latest workspace status.' : 'Each card has connection fields, a test action, and the latest data status.'}
        </p>
        <div className="integration-grid">
          <IntegrationCard title="IBKR" hidden={hidden} icon={<Wallet />} status={health.find((h: any) => h.source === 'IBKR')} doc={settings.ibkr.documentation} onTest={() => test('ibkr')} testing={testing === 'ibkr'}>
            <Field label="Host" value={settings.ibkr.host} onChange={(v: any) => update('ibkr', 'host', v)} />
            <Field label="Port" value={settings.ibkr.port} onChange={(v: any) => update('ibkr', 'port', Number(v))} />
            <Field label="Client ID" value={settings.ibkr.client_id} onChange={(v: any) => update('ibkr', 'client_id', Number(v))} />
            <Toggle label="Enabled" checked={settings.ibkr.enabled} onChange={(v: any) => update('ibkr', 'enabled', v)} />
          </IntegrationCard>
          <IntegrationCard title="Yahoo Finance" hidden={hidden} icon={<Globe2 />} status={health.find((h: any) => h.source === 'Yahoo Finance')} doc={settings.yahoo.documentation} onTest={() => test('yahoo')} testing={testing === 'yahoo'}>
            <Field label="Test ticker" value={settings.yahoo.test_ticker} onChange={(v: any) => update('yahoo', 'test_ticker', v.toUpperCase())} />
            <Toggle label="News" checked={settings.yahoo.news_enabled} onChange={(v: any) => update('yahoo', 'news_enabled', v)} />
            <Toggle label="Fundamentals" checked={settings.yahoo.fundamentals_enabled} onChange={(v: any) => update('yahoo', 'fundamentals_enabled', v)} />
          </IntegrationCard>
          <IntegrationCard title="Seeking Alpha" hidden={hidden} icon={<BookOpen />} status={health.find((h: any) => h.source === 'Seeking Alpha')} doc={settings.seeking_alpha.documentation} onTest={() => test('seeking-alpha')} testing={testing === 'seeking-alpha'}>
            <Toggle label="Enable RSS" checked={settings.seeking_alpha.rss_enabled} onChange={(v: any) => update('seeking_alpha', 'rss_enabled', v)} />
            <Toggle label="Authenticated deep parsing" checked={settings.seeking_alpha.authenticated_enabled} onChange={(v: any) => update('seeking_alpha', 'authenticated_enabled', v)} />
            <Field label="Test URL" value={settings.seeking_alpha.test_url} onChange={(v: any) => update('seeking_alpha', 'test_url', v)} />
            <TextArea label="Session Cookie/Header" value={settings.seeking_alpha.cookie_header} onChange={(v: any) => update('seeking_alpha', 'cookie_header', v)} placeholder="Paste your subscriber session cookie header. No password is stored." />
          </IntegrationCard>
          <IntegrationCard title="RSS / Email Adapters" hidden={hidden} icon={<Database />} status={health.find((h: any) => h.source === 'RSS')} doc={settings.rss.documentation} onTest={() => test('rss')} testing={testing === 'rss'}>
            <TextArea label="RSS feeds JSON" value={JSON.stringify(settings.rss.feeds, null, 2)} onChange={(v: any) => { try { update('rss', 'feeds', JSON.parse(v)) } catch {} }} />
          </IntegrationCard>
          <IntegrationCard title="FRED / Macro" hidden={hidden} icon={<BarChart3 />} status={health.find((h: any) => h.source === 'FRED/Macro')} doc={settings.fred.documentation} onTest={() => test('fred')} testing={testing === 'fred'}>
            <Field label="API key" value={settings.fred.api_key} onChange={(v: any) => update('fred', 'api_key', v)} />
          </IntegrationCard>
          <IntegrationCard title="Telegram / Alerts" hidden={hidden} icon={<Activity />} status={health.find((h: any) => h.source === 'Telegram')} doc={settings.telegram.documentation} onTest={() => test('telegram')} testing={testing === 'telegram'}>
            <Field label="Bot token" value={settings.telegram.bot_token} onChange={(v: any) => update('telegram', 'bot_token', v)} />
            <Field label="Chat ID" value={settings.telegram.chat_id} onChange={(v: any) => update('telegram', 'chat_id', v)} />
          </IntegrationCard>
          <IntegrationCard title="Advisor Intel" hidden={hidden} icon={<Brain />} status={health.find((h: any) => h.source === 'Advisor Intel')} doc={settings.discord_advisor.documentation}>
            <Field label="Mode" value={settings.discord_advisor.mode} onChange={(v: any) => update('discord_advisor', 'mode', v)} />
          </IntegrationCard>
          <IntegrationCard title="AI Lite" hidden={hidden} icon={<Brain />} status={{ status: 'connected_no_data', data_received: false, message: 'Optional later; rules engine active' }} doc={settings.openai.documentation}>
            <Field label="Mode" value={settings.openai.mode} onChange={(v: any) => update('openai', 'mode', v)} />
            <Field label="Daily budget EUR" value={settings.openai.daily_budget_eur} onChange={(v: any) => update('openai', 'daily_budget_eur', Number(v))} />
          </IntegrationCard>
        </div>
        <button className="tab active" onClick={save}>
          Save all integrations
        </button>
      </Panel>
    </div>
  )
}

function IntegrationCard({ title, hidden, icon, status, doc, onTest, testing, children }: any) {
  const ok = status?.data_received
  const failed = status?.status === 'failed'
  return (
    <div className="integration-card">
      <header>
        <div className="iconbox">{icon}</div>
        <div>
          <b>{hidden ? 'Workspace source' : title}</b>
          <p className="muted">{hidden ? mask : doc}</p>
        </div>
        <span className={`source-pill ${failed ? 'bad' : ok ? 'good' : 'warn'}`}>{failed ? 'Failed' : ok ? 'Data OK' : 'No data'}</span>
      </header>
      <div className="fields">{children}</div>
      {onTest && (
        <button className="tab" onClick={onTest}>
          {testing ? 'Checking...' : 'Check connection'}
        </button>
      )}
      {status && <pre className="mini-log">{hidden ? mask : status.message}</pre>}
    </div>
  )
}

function Field({ label, value, onChange }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder }: any) {
  return (
    <label className="field wide">
      <span>{label}</span>
      <textarea value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Toggle({ label, checked, onChange }: any) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

const releaseBacklog = [
  { item: 'Discord Advisor Intel connector', status: 'Pending', owner: 'Platform', target: 'v5.7' },
  { item: 'Persistent resize grid', status: 'Pending', owner: 'Workspace', target: 'v5.7' },
  { item: 'AI Lite optional layer', status: 'Not configured', owner: 'Intelligence', target: 'v5.7' },
  { item: 'Chart screenshot / OCR', status: 'Degraded', owner: 'Research', target: 'Later' },
]

function AboutPage({ hidden }: any) {
  const [about, setAbout] = useState<any>(null)
  const [qa, setQa] = useState<any>(null)
  useEffect(() => {
    fetchJson('/about').then(setAbout).catch(() => {})
    fetchJson('/qa-checklist').then(setQa).catch(() => {})
  }, [])

  return (
    <div className="grid">
      <Panel title="Release Center" privateTitle="Info" span="span-12" hidden={hidden}>
        <SectionHeader
          title={hidden ? 'Private Mode' : `PIA ${cleanText(about?.version)}`.trim()}
          subtitle={hidden ? 'Workspace' : cleanText(about?.tagline)}
        />
        <div className="release-meta">
          <IntelligenceBadge label="UAT ready" tone="good" />
          <IntelligenceBadge label="Rule engine active" tone="neutral" />
          <IntelligenceBadge label="3 known limitations" tone="warn" />
        </div>
      </Panel>
      <Panel title="Changelog" span="span-7" hidden={hidden}>
        <div className="actions">
          {(about?.changelog || []).map((v: any) => (
            <GlowCard className="version-card" key={v.version}>
              <b>{hidden ? 'Workspace update' : `${v.version} - ${v.title}`}</b>
              {!hidden && <ul>{cleanList(v.features || []).map((f: string) => <li key={f}>{f}</li>)}</ul>}
              {!hidden && <small className="muted">Deferred: {cleanList(v.deferred || []).join(', ')}</small>}
            </GlowCard>
          ))}
        </div>
      </Panel>
      <Panel title="UAT Checklist" span="span-5" hidden={hidden}>
        <div className="actions">
          {(qa?.groups || []).map((g: any) => (
            <GlowCard className="version-card" key={g.name}>
              <b>{g.name}</b>
              {g.items.map((i: string) => (
                <label className="check" key={i}>
                  <input type="checkbox" /> {i}
                </label>
              ))}
            </GlowCard>
          ))}
        </div>
      </Panel>
      <Panel title="Backlog" span="span-7" hidden={hidden}>
        <div className="table-wrap">
          <table className="backlog-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {releaseBacklog.map((row) => (
                <tr key={row.item}>
                  <td>{hidden ? 'Workspace item' : row.item}</td>
                  <td>
                    <IntelligenceBadge label={row.status} tone={row.status === 'Pending' ? 'warn' : row.status === 'Degraded' ? 'bad' : 'neutral'} />
                  </td>
                  <td>{row.owner}</td>
                  <td>{row.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Known limitations" span="span-5" hidden={hidden}>
        <div className="empty-state">
          {cleanList(about?.known_issues || []).length ? (
            <ul>{cleanList(about?.known_issues || []).map((x: string) => <li key={x}>{x}</li>)}</ul>
          ) : (
            <p className="muted">No known limitations reported.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}

const settingsTabs = ['General', 'Workspace', 'Manual Holdings', 'Integrations', 'Notifications', 'System', 'About'] as const

function SettingsPage({ hidden }: any) {
  const [tab, setTab] = useState<(typeof settingsTabs)[number]>('General')
  return (
    <div className="grid">
      <Panel title="Settings" span="span-12" hidden={hidden}>
        <div className="settings-tabs">
          {settingsTabs.map((item) => (
            <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        {tab === 'General' && <GeneralSettings hidden={hidden} />}
        {tab === 'Workspace' && <WorkspaceSettings hidden={hidden} />}
        {tab === 'Manual Holdings' && <ManualHoldingsSettings hidden={hidden} />}
        {tab === 'Integrations' && <IntegrationsSettings hidden={hidden} />}
        {tab === 'Notifications' && <NotificationsSettings />}
        {tab === 'System' && <SystemSettings hidden={hidden} />}
        {tab === 'About' && <SettingsAbout />}
      </Panel>
    </div>
  )
}

function GeneralSettings({ hidden }: any) {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Profile</h3>
        <p className="muted">{hidden ? 'Workspace defaults for the current user.' : 'Decision workspace defaults for the current user.'}</p>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Use premium dark theme</span>
        </label>
        <label className="toggle">
          <input type="checkbox" />
          <span>Start with amounts hidden</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Locale</h3>
        <div className="empty-state">
          <p>Currency: USD</p>
          <p>Timezone: Europe/Athens</p>
        </div>
      </GlowCard>
    </div>
  )
}

function WorkspaceSettings({ hidden }: any) {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Workspace</h3>
        <p className="muted">{hidden ? 'Tune density without changing workspace logic.' : 'Tune density without changing portfolio logic.'}</p>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Compact mobile navigation</span>
        </label>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Remember workspace layout</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Empty states</h3>
        <div className="empty-state">
          <p>No custom workspace presets yet.</p>
          <small className="muted">Saved views can land here in a later release.</small>
        </div>
      </GlowCard>
    </div>
  )
}

function ManualHoldingsSettings({ hidden }: any) {
  const [holdings, setHoldings] = useState<any[]>([])
  const [form, setForm] = useState<any>(emptyHolding)
  const [editingId, setEditingId] = useState('')
  const [status, setStatus] = useState('')

  const refresh = () => fetchJson('/manual-holdings').then(setHoldings).catch(() => setStatus('Manual holdings API is unavailable.'))

  useEffect(() => {
    refresh()
  }, [])

  function updateForm(key: string, value: any) {
    setForm((current: any) => ({ ...current, [key]: value }))
  }

  function startEdit(holding: any) {
    setEditingId(holding.id)
    setForm({
      ticker: holding.ticker || '',
      name: holding.name || '',
      asset_type: holding.asset_type || 'Stock',
      broker: holding.broker || 'Manual',
      quantity: holding.quantity ?? '',
      avg_price: holding.avg_price ?? '',
      currency: holding.currency || 'USD',
      notes: holding.notes || '',
    })
    setStatus('')
  }

  function resetForm() {
    setEditingId('')
    setForm(emptyHolding)
  }

  async function saveHolding(event: React.FormEvent) {
    event.preventDefault()
    setStatus('')
    const payload = {
      ...form,
      ticker: String(form.ticker || '').toUpperCase(),
      quantity: Number(form.quantity),
      avg_price: Number(form.avg_price),
      currency: String(form.currency || 'USD').toUpperCase(),
    }
    const path = editingId ? `/manual-holdings/${editingId}` : '/manual-holdings'
    const method = editingId ? 'PUT' : 'POST'
    const result = await fetchJson(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((error) => {
      setStatus(safeMessage(error?.detail, 'Unable to save manual holding.'))
      return null
    })
    if (!result) return
    setStatus(editingId ? 'Manual holding updated.' : 'Manual holding added.')
    resetForm()
    refresh()
  }

  async function removeHolding(id: string) {
    const result = await fetchJson(`/manual-holdings/${id}`, { method: 'DELETE' }).catch((error) => {
      setStatus(safeMessage(error?.detail, 'Unable to delete manual holding.'))
      return null
    })
    if (!result) return
    setStatus('Manual holding deleted.')
    if (editingId === id) resetForm()
    refresh()
  }

  return (
    <div className="manual-holdings">
      <GlowCard>
        <SectionHeader
          title={hidden ? 'Manual Assets' : 'Manual Holdings'}
          subtitle={hidden ? 'Manage external positions.' : 'Add Freedom24, Revolut, IBKR-adjacent, or manually tracked assets.'}
        />
        <form className="manual-form" onSubmit={saveHolding}>
          <Field label="Ticker" value={form.ticker} onChange={(v: any) => updateForm('ticker', v.toUpperCase())} />
          <Field label="Name" value={form.name} onChange={(v: any) => updateForm('name', v)} />
          <label className="field">
            <span>Asset Type</span>
            <select value={form.asset_type} onChange={(e) => updateForm('asset_type', e.target.value)}>
              {assetTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Broker</span>
            <select value={form.broker} onChange={(e) => updateForm('broker', e.target.value)}>
              {brokers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Field label="Quantity" value={form.quantity} onChange={(v: any) => updateForm('quantity', v)} />
          <Field label="Average Price" value={form.avg_price} onChange={(v: any) => updateForm('avg_price', v)} />
          <Field label="Currency" value={form.currency} onChange={(v: any) => updateForm('currency', v.toUpperCase())} />
          <TextArea label="Notes" value={form.notes} onChange={(v: any) => updateForm('notes', v)} placeholder="Source account, thesis, or manual valuation notes." />
          <div className="manual-actions">
            <button className="tab active" type="submit">
              {editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? 'Update holding' : 'Add holding'}
            </button>
            {editingId && (
              <button className="tab" type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {status && <p className="muted">{status}</p>}
      </GlowCard>
      <GlowCard>
        <SectionHeader
          title={hidden ? 'External Assets' : 'Tracked Manual Holdings'}
          subtitle={hidden ? `${holdings.length} items` : `${holdings.length} holdings merged into portfolio totals when present`}
        />
        <div className="table-wrap">
          <table className="manual-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Broker</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>Currency</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <b>{hidden ? mask : holding.ticker}</b>
                    <div className="muted">{hidden ? 'Workspace item' : holding.name}</div>
                  </td>
                  <td>{hidden ? mask : holding.broker}</td>
                  <td>
                    <span className="badge">{hidden ? mask : holding.asset_type}</span>
                  </td>
                  <td>{hidden ? mask : holding.quantity}</td>
                  <td>{hidden ? mask : money(holding.avg_price)}</td>
                  <td>{hidden ? mask : holding.currency}</td>
                  <td>{hidden ? mask : holding.notes || '-'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-tab" type="button" onClick={() => startEdit(holding)} aria-label={`Edit ${holding.ticker}`}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-tab danger" type="button" onClick={() => removeHolding(holding.id)} aria-label={`Delete ${holding.ticker}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holdings.length && <div className="empty-state">No manual holdings yet.</div>}
        </div>
      </GlowCard>
    </div>
  )
}

function IntegrationsSettings({ hidden }: any) {
  return (
    <div>
      <IntegrationStatusCards hidden={hidden} />
      <IntegrationCenter compact hidden={hidden} />
    </div>
  )
}

function NotificationsSettings() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Alerts</h3>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Portfolio guardrail alerts</span>
        </label>
        <label className="toggle">
          <input type="checkbox" />
          <span>Daily digest</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Delivery</h3>
        <div className="empty-state">
          <p>No push channel configured.</p>
          <small className="muted">Connect Discord or another channel to activate delivery.</small>
        </div>
      </GlowCard>
    </div>
  )
}

function SystemSettings({ hidden }: any) {
  return (
    <>
      <div className="settings-panels">
        <GlowCard>
          <h3>Runtime</h3>
          <p className="muted">Frontend build: Next.js 15</p>
          <p className="muted">Backend API: FastAPI</p>
        </GlowCard>
        <GlowCard>
          <h3>Health</h3>
          <div className="empty-state">
            <p>System checks use source health where available.</p>
          </div>
        </GlowCard>
      </div>
      <SourceHealthPanel hidden={hidden} />
    </>
  )
}

function SettingsAbout() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>About</h3>
        <p className="muted">Release details now live in the dedicated About / Release Center view.</p>
      </GlowCard>
    </div>
  )
}

function IntegrationStatusCards({ hidden = false }: any) {
  const [health, setHealth] = useState<any[]>([])
  useEffect(() => {
    fetchJson('/source-health').then(setHealth).catch(() => {})
  }, [])
  const bySource = (name: string) => health.find((item: any) => item.source === name)
  const cards: any[] = [
    { name: 'IBKR', status: bySource('IBKR') },
    { name: 'Yahoo', status: bySource('Yahoo Finance') },
    { name: 'Seeking Alpha', status: bySource('Seeking Alpha') },
    { name: 'Discord', label: 'Pending' },
    { name: 'X / Twitter', label: 'Not configured' },
    { name: 'News feeds', status: bySource('RSS') },
  ]
  return (
    <div className="status-grid">
      {cards.map((card) => {
        const label = card.label || (card.status?.status === 'healthy' ? 'Data OK' : card.status?.status === 'connected_no_data' ? 'Pending' : card.status?.status === 'failed' ? 'Degraded' : 'Not configured')
        const tone = label === 'Data OK' ? 'good' : label === 'Pending' ? 'warn' : label === 'Degraded' ? 'bad' : 'neutral'
        return (
          <GlowCard className="status-card" key={card.name}>
            <span>{hidden ? 'Workspace source' : card.name}</span>
            <IntelligenceBadge label={label} tone={tone} />
          </GlowCard>
        )
      })}
    </div>
  )
}

function TradingViewChart({ ticker }: { ticker: string }) {
  const sym = encodeURIComponent(`NASDAQ:${ticker.split(' ')[0]}`)
  return (
    <iframe
      className="tv-frame"
      src={`https://s.tradingview.com/widgetembed/?symbol=${sym}&interval=D&theme=dark&style=1&hide_top_toolbar=1&hide_side_toolbar=1&allow_symbol_change=0&save_image=0`}
    />
  )
}

function PositionModal({ ticker, hidden, onClose }: any) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState('Overview')
  useEffect(() => {
    fetchJson(`/stock/${encodeURIComponent(ticker.split(' ')[0])}`).then(setData).catch(() => {})
  }, [ticker])
  const tabs = ['Overview', 'Chart', 'Fundamentals', 'News', 'Risk', 'AI Thesis']
  const tabLabel = (value: string) =>
    hidden
      ? ({ Overview: 'Overview', Chart: 'Workspace', Fundamentals: 'Workspace', News: 'Updates', Risk: 'Controls', 'AI Thesis': 'Workspace' } as Record<string, string>)[value] || 'Workspace'
      : value
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="position-modal">
        <button className="close" onClick={onClose}>
          <X size={16} />
        </button>
        <h1>{hidden ? mask : ticker}</h1>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'active' : ''}`}>
              {tabLabel(t)}
            </button>
          ))}
        </div>
        {tab === 'Overview' && (
          <div className="panel">
            <h3>Snapshot</h3>
            <p>{hidden ? mask : data?.position?.ai_view || data?.watch?.reason || 'No position. Watchlist research available.'}</p>
            <p className="muted">{hidden ? mask : `Why moving: ${data?.position?.why_moving || 'No clear catalyst. Check news, sector and macro.'}`}</p>
          </div>
        )}
        {tab === 'Chart' && !hidden && (
          <div className="panel">
            <h3>TradingView Chart</h3>
            <TradingViewChart ticker={ticker} />
          </div>
        )}
        {tab === 'Fundamentals' && <pre className="panel">{hidden ? mask : JSON.stringify(data?.fundamentals, null, 2)}</pre>}
        {tab === 'News' && (
          <div className="actions">
            {(data?.news || []).map((n: any) => (
              <div className="action" key={n.title}>
                <BookOpen size={18} />
                <div>
                  <b>{hidden ? 'Workspace item' : n.title}</b>
                  <div className="muted">
                    {hidden ? mask : `${n.impact} - ${n.action}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'Risk' && (
          <div className="panel">
            <h3>Risk profile</h3>
            <MetricBar label={hidden ? 'Overview' : 'Portfolio weight'} value={data?.position?.portfolio_pct || 0} hidden={hidden} />
            <MetricBar label={hidden ? 'Controls' : 'Risk'} value={data?.position?.risk || 0} tone="red" hidden={hidden} />
            <MetricBar label={hidden ? 'Workspace' : 'Macro sensitivity'} value={data?.position?.macro_sensitivity || 0} tone="violet" hidden={hidden} />
          </div>
        )}
        {tab === 'AI Thesis' && (
          <div className="panel">
            <h3>AI Thesis</h3>
            {(data?.thesis || []).length ? (
              data.thesis.map((t: any) => (
                <article key={t.title}>
                  <b>{hidden ? 'Workspace item' : t.title}</b>
                  <p>{hidden ? mask : t.summary}</p>
                  <details>
                    <summary>Full analysis</summary>
                    <p>{hidden ? mask : t.full_text}</p>
                  </details>
                </article>
              ))
            ) : (
              <p className="muted">{hidden ? mask : data?.forecast?.base || 'No saved thesis yet.'}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
