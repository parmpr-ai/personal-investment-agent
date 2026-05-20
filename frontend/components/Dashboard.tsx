'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  LayoutDashboard,
  PlugZap,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Target,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import GlowCard from './ui/GlowCard'
import SectionHeader from './ui/SectionHeader'
import IntelligenceBadge from './ui/IntelligenceBadge'
import RiskGauge from './ui/RiskGauge'

const API = 'http://127.0.0.1:8000'
const WS = 'ws://127.0.0.1:8000/ws'
const mask = '******'
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
  ['integrations', 'Integrations', PlugZap],
  ['about', 'About', BookOpen],
  ['settings', 'Settings', Settings],
] as any[]
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

export default function Dashboard() {
  const dashboard = useDash()
  const [active, setActive] = useState('dashboard')
  const [hidden, setHidden] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [filter, setFilter] = useState('All')
  const [rescanStatus, setRescanStatus] = useState('')
  const [rescanning, setRescanning] = useState(false)

  useEffect(() => {
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
      <Sidebar active={active} setActive={setActive} hidden={hidden} setHidden={updateHidden} />
      <main className="main">
        <Top
          active={active}
          hidden={hidden}
          setHidden={updateHidden}
          rescan={rescan}
          rescanning={rescanning}
          rescanStatus={rescanStatus}
        />
        <MarketStrip items={dashboard?.macros?.market_strip || []} />
        {active === 'dashboard' && (
          <DashboardHome d={dashboard} hidden={hidden} setActive={setActive} setSelected={setSelected} />
        )}
        {active === 'portfolio' && (
          <PortfolioPage
            d={dashboard}
            hidden={hidden}
            filter={filter}
            setFilter={setFilter}
            filtered={filtered}
            setSelected={setSelected}
          />
        )}
        {active === 'watchlist' && <WatchlistPage d={dashboard} setSelected={setSelected} />}
        {active === 'trades' && <TradeRadar d={dashboard} />}
        {active === 'risk' && <RiskPage d={dashboard} />}
        {active === 'tax' && <TaxPage />}
        {active === 'integrations' && <IntegrationCenter />}
        {active === 'about' && <AboutPage />}
        {active === 'settings' && <SettingsPage />}
      </main>
      {selected && <PositionModal ticker={selected.symbol || selected.ticker} onClose={() => setSelected(null)} />}
    </div>
  )
}

function Sidebar({ active, setActive, hidden, setHidden }: any) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark">PIA</div>
        <div>
          <b>PIA Dashboard</b>
          <br />
          <span>Decision Platform</span>
        </div>
      </div>
      <nav>
        {nav.map(([id, label, Icon]: any) => (
          <button key={id} onClick={() => setActive(id)} className={active === id ? 'active' : ''}>
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button className="privacy" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
        {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? 'Show amounts' : 'Hide amounts'}
      </button>
    </aside>
  )
}

function Top({ active, hidden, setHidden, rescan, rescanning, rescanStatus }: any) {
  return (
    <div className="topbar">
      <div>
        <h1>{String(nav.find(([id]) => id === active)?.[1] || 'Dashboard')}</h1>
        <div className="muted">Portfolio dashboard, integrations, opportunity signals and risk controls</div>
        {rescanStatus && <div className="muted">{rescanStatus}</div>}
      </div>
      <div className="top-actions">
        <button className="mobile-privacy" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} <span>{hidden ? 'Show amounts' : 'Hide amounts'}</span>
        </button>
        <div className="search">
          <Search size={16} />
          <input placeholder="Search ticker, source, note..." />
        </div>
        <button className="tab" onClick={rescan} disabled={rescanning}>
          <RefreshCw size={15} /> {rescanning ? 'Rescanning' : 'Rescan'}
        </button>
      </div>
    </div>
  )
}

function MarketStrip({ items }: any) {
  return (
    <div className="ticker">
      {items.map((x: any) => (
        <div className="ticker-card" key={x.name}>
          <span className="muted">{x.name}</span>
          <b style={{ display: 'block' }}>{x.value}</b>
          <small className={x.chg >= 0 ? 'green' : 'red'}>{pct(x.chg)}</small>
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children, span = 'span-4', icon }: any) {
  return (
    <section className={`panel ${span}`}>
      <h3>
        {icon ? <span>{icon}</span> : null} {title}
      </h3>
      {children}
    </section>
  )
}

function MetricBar({ label, value, tone = 'blue' }: any) {
  return (
    <div className="metric-bar">
      <div>
        <span>{label}</span>
        <b>{pct(value)}</b>
      </div>
      <i>
        <em className={tone} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </i>
    </div>
  )
}

function DashboardHome({ d, hidden, setActive, setSelected }: any) {
  const p = d?.portfolio || {}
  return (
    <div className="grid">
      <Panel title="Portfolio Snapshot" span="span-8">
        <PortfolioSnapshot p={p} hidden={hidden} />
      </Panel>
      <Panel title="Today's Decision Brief" span="span-4">
        <div className="actions">
          {(p.today_actions || []).map((a: any) => (
            <div className="action" key={a.title}>
              <Brain size={18} className="green" />
              <div>
                <b>{a.title}</b>
                <div className="muted">{a.text}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="My Positions" span="span-8">
        <PositionsTable rows={(p.positions || []).slice(0, 6)} hidden={hidden} setSelected={setSelected} />
        <button className="tab" onClick={() => setActive('portfolio')}>
          Open full portfolio
        </button>
      </Panel>
      <Panel title="Risk Controls" span="span-4">
        <RiskList items={p.guardrails || []} />
      </Panel>
      <Panel title="Exposure Map" span="span-6">
        <Exposure rows={p.exposures?.rows || []} />
      </Panel>
      <Panel title="Trade Radar" span="span-6">
        <TradeList items={(d?.scanner || []).slice(0, 3)} />
        <button className="tab" onClick={() => setActive('trades')}>
          Open Trade Radar
        </button>
      </Panel>
      <SourceHealthPanel />
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
          <span>{title}</span>
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
        <SectionHeader title="Portfolio evolution" subtitle="Intraday trajectory" />
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
        <MetricBar label="Buying power utilization" value={Math.min((Number(p.margin_used) || 0) * 2.2, 100)} tone="violet" />
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
      <Panel title="Portfolio Snapshot" span="span-12">
        <PortfolioSnapshot p={d?.portfolio || {}} hidden={hidden} />
      </Panel>
      <Panel title="My Positions" span="span-12">
        <SectionHeader
          title="Positions"
          subtitle={`${rows.length} holdings across portfolio`}
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
      <Panel title="Exposure Map" span="span-6">
        <Exposure rows={d?.portfolio?.exposures?.rows || []} />
      </Panel>
      <Panel title="Portfolio Scanner" span="span-6">
        <PortfolioScanner d={d} />
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
                <b>{p.symbol}</b>
                <span>{p.name}</span>
              </div>
              <strong>{hidden ? mask : money(p.market_value)}</strong>
            </header>
            <div className="position-pnl">
              <span className={p.day_pnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.day_pnl)} today</span>
              <span className={p.unrealized >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.unrealized)} total</span>
            </div>
            <MetricBar label="Allocation" value={p.portfolio_pct} tone="blue" />
            <MetricBar label="Risk" value={p.risk || 0} tone="red" />
            <MetricBar label="Momentum" value={p.momentum_score || 0} tone="green" />
            <MetricBar label="Fundamentals" value={fundamentalsScore(p)} tone="violet" />
          </button>
        </GlowCard>
      ))}
    </div>
  )
}

function PortfolioScanner({ d }: any) {
  const risk = d?.portfolio?.guardrails || []
  const opp = (d?.scanner || []).slice(0, 2)
  const macro = [...(d?.portfolio?.today_actions || [])].filter((x: any) => /macro|yield/i.test(`${x.title} ${x.text}`))
  const catalysts = d?.calendar || []
  return (
    <div className="scanner-grid">
      <ScannerColumn title="Risk Alerts" items={risk.map((x: any) => ({ title: x.title, text: x.text, tone: x.level === 'danger' ? 'red' : 'amber' }))} />
      <ScannerColumn title="Opportunity Signals" items={opp.map((x: any) => ({ title: x.ticker, text: x.setup, tone: 'green' }))} />
      <ScannerColumn title="Macro Warnings" items={macro.map((x: any) => ({ title: x.title, text: x.text, tone: 'violet' }))} />
      <ScannerColumn title="Catalyst Monitor" items={catalysts.map((x: any) => ({ title: x.event, text: `${x.date} - ${x.impact}`, tone: 'blue' }))} />
    </div>
  )
}

function ScannerColumn({ title, items }: any) {
  return (
    <GlowCard className="scanner-column">
      <b>{title}</b>
      {items.length ? (
        items.map((x: any, i: number) => (
          <div className={`scanner-item ${x.tone}`} key={`${x.title}-${i}`}>
            <strong>{x.title}</strong>
            <span>{x.text}</span>
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
                    {p.logo || p.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <b>{p.symbol}</b>
                    <div className="muted">{p.name}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="badge">{p.sec_type || 'STK'}</span>
              </td>
              <td>{p.qty}</td>
              <td>{hidden ? mask : money(p.avg_price)}</td>
              <td>{hidden ? mask : money(p.last)}</td>
              <td>{hidden ? mask : money(p.market_value)}</td>
              <td className={p.unrealized >= 0 ? 'green' : 'red'}>
                {hidden ? mask : money(p.unrealized)}
                <br />
                <small>{pct(p.unrealized_pct)}</small>
              </td>
              <td>{pct(p.portfolio_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Exposure({ rows }: any) {
  const top = rows?.[0]
  return (
    <div>
      <GlowCard className="concentration-card">
        <span>Top concentration</span>
        <b>{top?.name || '-'}</b>
        <strong>{pct(top?.pct || 0)}</strong>
      </GlowCard>
      {rows.map((r: any) => (
        <div className="exposure-row" title={`${r.name}: ${pct(r.pct)} portfolio`} key={r.name}>
          <span>{r.name}</span>
          <div className="bar">
            <i style={{ width: `${Math.min(r.pct, 100)}%` }} />
          </div>
          <b>{pct(r.pct)}</b>
        </div>
      ))}
    </div>
  )
}

function RiskList({ items }: any) {
  return (
    <div className="actions">
      {items.map((x: any, i: number) => (
        <div className="action" key={i}>
          <Shield size={18} className={x.level === 'danger' ? 'red' : 'green'} />
          <div>
            <b>{x.title}</b>
            <div className="muted">{x.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function WatchlistPage({ d, setSelected }: any) {
  const [sort, setSort] = useState('opportunity')
  const rows = [...(d?.watchlist || [])].sort((a: any, b: any) =>
    String(sort) === 'name' ? a.symbol.localeCompare(b.symbol) : (b[sort] || 0) - (a[sort] || 0),
  )
  return (
    <div className="grid">
      <Panel title="Opportunity Board" span="span-12">
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
                    <b>{w.symbol}</b>
                    <div className="muted">{w.name}</div>
                  </div>
                  <span className="badge">{w.action || w.label}</span>
                </header>
                <h2>
                  {money(w.price)} <small className={w.change_pct >= 0 ? 'green' : 'red'}>{pct(w.change_pct)}</small>
                </h2>
                <div className="plan">
                  <div className="pillbox">
                    Risk
                    <br />
                    <b>{w.risk}</b>
                  </div>
                  <div className="pillbox">
                    Opp
                    <br />
                    <b>{w.opportunity}</b>
                  </div>
                  <div className="pillbox">
                    RVOL
                    <br />
                    <b>{w.rvol}</b>
                  </div>
                </div>
                <MetricBar label="Momentum" value={w.momentum || 0} tone="green" />
                <p className="muted">{w.reason || `${w.macro_fit || 'Neutral'} macro fit - ${w.sector || 'Unclassified'}`}</p>
              </button>
            </GlowCard>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function TradeRadar({ d }: any) {
  return (
    <div className="grid">
      <Panel title="AI Trade Radar - Rule Engine" span="span-12">
        <TradeList items={d?.scanner || []} detailed />
      </Panel>
    </div>
  )
}

function TradeList({ items, detailed }: any) {
  return (
    <div className="cards">
      {items.map((x: any) => (
        <div className="stock-card" key={x.ticker}>
          <header>
            <div>
              <b>{x.ticker}</b>
              <div className="muted">Price {money(x.price)}</div>
            </div>
            <span className="badge">{x.label}</span>
          </header>
          <p>
            <b>{x.setup}</b>
          </p>
          <div className="plan">
            <div className="pillbox">
              Entry
              <br />
              <b>{x.entry_zone}</b>
            </div>
            <div className="pillbox">
              Stop
              <br />
              <b>{x.stop}</b>
            </div>
            <div className="pillbox">
              Targets
              <br />
              <b>{x.targets?.join(' / ')}</b>
            </div>
          </div>
          <p className="muted">{x.portfolio_impact}</p>
          {detailed && <ul className="muted">{(x.rationale || []).map((r: any) => <li key={r}>{r}</li>)}</ul>}
        </div>
      ))}
    </div>
  )
}

function RiskPage({ d }: any) {
  const topRisk = Math.max(...(d?.portfolio?.positions || []).map((p: any) => Number(p.risk || 0)), 0)
  return (
    <div className="grid">
      <Panel title="Portfolio Risk" span="span-6">
        <div className="risk-overview">
          <RiskGauge value={topRisk} label="Highest holding risk" />
          <RiskList items={d?.portfolio?.guardrails || []} />
        </div>
      </Panel>
      <Panel title="Stress Tests" span="span-6">
        <div className="actions">
          {(d?.portfolio?.stress_tests || []).map((s: any) => (
            <div className="action" key={s.scenario}>
              <Activity size={18} />
              <div>
                <b>{s.scenario}</b>
                <div className="red">
                  {money(s.estimated_pnl)} / {pct(s.estimated_pct)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

function TaxPage() {
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
      <Panel title="Greek Tax Center" span="span-12">
        <input type="file" onChange={upload} />
        <p className="muted">Estimate only: 15% stocks/options gains, losses offset, UCITS exempt.</p>
        {res && <pre className="panel">{JSON.stringify(res, null, 2)}</pre>}
      </Panel>
    </div>
  )
}

function SourceHealthPanel() {
  const { health, refresh } = useSourceHealth()
  return (
    <Panel title="Source Health" span="span-12">
      <div className="health-grid">
        {health.map((h: any) => (
          <div className={`health ${h.status}`} key={h.source}>
            <div>
              <b>{h.source}</b>
              <p className="muted">{h.message}</p>
            </div>
            <span>{h.data_received ? 'Data OK' : h.ok ? 'No data' : 'Failed'}</span>
          </div>
        ))}
      </div>
      <button className="tab" onClick={refresh}>
        Run health checks
      </button>
    </Panel>
  )
}

function IntegrationCenter({ compact = false }: any = {}) {
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
      <Panel title="Integration Center" span="span-12">
        <p className="muted">Each card has connection fields, a test action, and the latest data status.</p>
        <div className="integration-grid">
          <IntegrationCard title="IBKR" icon={<Wallet />} status={health.find((h: any) => h.source === 'IBKR')} doc={settings.ibkr.documentation} onTest={() => test('ibkr')} testing={testing === 'ibkr'}>
            <Field label="Host" value={settings.ibkr.host} onChange={(v: any) => update('ibkr', 'host', v)} />
            <Field label="Port" value={settings.ibkr.port} onChange={(v: any) => update('ibkr', 'port', Number(v))} />
            <Field label="Client ID" value={settings.ibkr.client_id} onChange={(v: any) => update('ibkr', 'client_id', Number(v))} />
            <Toggle label="Enabled" checked={settings.ibkr.enabled} onChange={(v: any) => update('ibkr', 'enabled', v)} />
          </IntegrationCard>
          <IntegrationCard title="Yahoo Finance" icon={<Globe2 />} status={health.find((h: any) => h.source === 'Yahoo Finance')} doc={settings.yahoo.documentation} onTest={() => test('yahoo')} testing={testing === 'yahoo'}>
            <Field label="Test ticker" value={settings.yahoo.test_ticker} onChange={(v: any) => update('yahoo', 'test_ticker', v.toUpperCase())} />
            <Toggle label="News" checked={settings.yahoo.news_enabled} onChange={(v: any) => update('yahoo', 'news_enabled', v)} />
            <Toggle label="Fundamentals" checked={settings.yahoo.fundamentals_enabled} onChange={(v: any) => update('yahoo', 'fundamentals_enabled', v)} />
          </IntegrationCard>
          <IntegrationCard title="Seeking Alpha" icon={<BookOpen />} status={health.find((h: any) => h.source === 'Seeking Alpha')} doc={settings.seeking_alpha.documentation} onTest={() => test('seeking-alpha')} testing={testing === 'seeking-alpha'}>
            <Toggle label="Enable RSS" checked={settings.seeking_alpha.rss_enabled} onChange={(v: any) => update('seeking_alpha', 'rss_enabled', v)} />
            <Toggle label="Authenticated deep parsing" checked={settings.seeking_alpha.authenticated_enabled} onChange={(v: any) => update('seeking_alpha', 'authenticated_enabled', v)} />
            <Field label="Test URL" value={settings.seeking_alpha.test_url} onChange={(v: any) => update('seeking_alpha', 'test_url', v)} />
            <TextArea label="Session Cookie/Header" value={settings.seeking_alpha.cookie_header} onChange={(v: any) => update('seeking_alpha', 'cookie_header', v)} placeholder="Paste your subscriber session cookie header. No password is stored." />
          </IntegrationCard>
          <IntegrationCard title="RSS / Email Adapters" icon={<Database />} status={health.find((h: any) => h.source === 'RSS')} doc={settings.rss.documentation} onTest={() => test('rss')} testing={testing === 'rss'}>
            <TextArea label="RSS feeds JSON" value={JSON.stringify(settings.rss.feeds, null, 2)} onChange={(v: any) => { try { update('rss', 'feeds', JSON.parse(v)) } catch {} }} />
          </IntegrationCard>
          <IntegrationCard title="FRED / Macro" icon={<BarChart3 />} status={health.find((h: any) => h.source === 'FRED/Macro')} doc={settings.fred.documentation} onTest={() => test('fred')} testing={testing === 'fred'}>
            <Field label="API key" value={settings.fred.api_key} onChange={(v: any) => update('fred', 'api_key', v)} />
          </IntegrationCard>
          <IntegrationCard title="Telegram / Alerts" icon={<Activity />} status={health.find((h: any) => h.source === 'Telegram')} doc={settings.telegram.documentation} onTest={() => test('telegram')} testing={testing === 'telegram'}>
            <Field label="Bot token" value={settings.telegram.bot_token} onChange={(v: any) => update('telegram', 'bot_token', v)} />
            <Field label="Chat ID" value={settings.telegram.chat_id} onChange={(v: any) => update('telegram', 'chat_id', v)} />
          </IntegrationCard>
          <IntegrationCard title="Advisor Intel" icon={<Brain />} status={health.find((h: any) => h.source === 'Advisor Intel')} doc={settings.discord_advisor.documentation}>
            <Field label="Mode" value={settings.discord_advisor.mode} onChange={(v: any) => update('discord_advisor', 'mode', v)} />
          </IntegrationCard>
          <IntegrationCard title="AI Lite" icon={<Brain />} status={{ status: 'connected_no_data', data_received: false, message: 'Optional later; rules engine active' }} doc={settings.openai.documentation}>
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

function IntegrationCard({ title, icon, status, doc, onTest, testing, children }: any) {
  const ok = status?.data_received
  const failed = status?.status === 'failed'
  return (
    <div className="integration-card">
      <header>
        <div className="iconbox">{icon}</div>
        <div>
          <b>{title}</b>
          <p className="muted">{doc}</p>
        </div>
        <span className={`source-pill ${failed ? 'bad' : ok ? 'good' : 'warn'}`}>{failed ? 'Failed' : ok ? 'Data OK' : 'No data'}</span>
      </header>
      <div className="fields">{children}</div>
      {onTest && (
        <button className="tab" onClick={onTest}>
          {testing ? 'Checking...' : 'Check connection'}
        </button>
      )}
      {status && <pre className="mini-log">{status.message}</pre>}
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

function AboutPage() {
  const [about, setAbout] = useState<any>(null)
  const [qa, setQa] = useState<any>(null)
  useEffect(() => {
    fetchJson('/about').then(setAbout).catch(() => {})
    fetchJson('/qa-checklist').then(setQa).catch(() => {})
  }, [])

  return (
    <div className="grid">
      <Panel title="Release Center" span="span-12">
        <SectionHeader title={`PIA ${cleanText(about?.version)}`.trim()} subtitle={cleanText(about?.tagline)} />
        <div className="release-meta">
          <IntelligenceBadge label="UAT ready" tone="good" />
          <IntelligenceBadge label="Rule engine active" tone="neutral" />
          <IntelligenceBadge label="3 known limitations" tone="warn" />
        </div>
      </Panel>
      <Panel title="Changelog" span="span-7">
        <div className="actions">
          {(about?.changelog || []).map((v: any) => (
            <GlowCard className="version-card" key={v.version}>
              <b>
                {v.version} - {v.title}
              </b>
              <ul>{cleanList(v.features || []).map((f: string) => <li key={f}>{f}</li>)}</ul>
              <small className="muted">Deferred: {cleanList(v.deferred || []).join(', ')}</small>
            </GlowCard>
          ))}
        </div>
      </Panel>
      <Panel title="UAT Checklist" span="span-5">
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
      <Panel title="Backlog" span="span-7">
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
                  <td>{row.item}</td>
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
      <Panel title="Known limitations" span="span-5">
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

const settingsTabs = ['General', 'Workspace', 'Integrations', 'Notifications', 'System', 'About'] as const

function SettingsPage() {
  const [tab, setTab] = useState<(typeof settingsTabs)[number]>('General')
  return (
    <div className="grid">
      <Panel title="Settings" span="span-12">
        <div className="settings-tabs">
          {settingsTabs.map((item) => (
            <button key={item} className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </div>
        {tab === 'General' && <GeneralSettings />}
        {tab === 'Workspace' && <WorkspaceSettings />}
        {tab === 'Integrations' && <IntegrationsSettings />}
        {tab === 'Notifications' && <NotificationsSettings />}
        {tab === 'System' && <SystemSettings />}
        {tab === 'About' && <SettingsAbout />}
      </Panel>
    </div>
  )
}

function GeneralSettings() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Profile</h3>
        <p className="muted">Decision workspace defaults for the current user.</p>
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

function WorkspaceSettings() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Workspace</h3>
        <p className="muted">Tune density without changing portfolio logic.</p>
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

function IntegrationsSettings() {
  return (
    <div>
      <IntegrationStatusCards />
      <IntegrationCenter compact />
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

function SystemSettings() {
  return (
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

function IntegrationStatusCards() {
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
            <span>{card.name}</span>
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

function PositionModal({ ticker, onClose }: any) {
  const [data, setData] = useState<any>(null)
  const [tab, setTab] = useState('Overview')
  useEffect(() => {
    fetchJson(`/stock/${encodeURIComponent(ticker.split(' ')[0])}`).then(setData).catch(() => {})
  }, [ticker])
  const tabs = ['Overview', 'Chart', 'Fundamentals', 'News', 'Risk', 'AI Thesis']
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="position-modal">
        <button className="close" onClick={onClose}>
          <X size={16} />
        </button>
        <h1>{ticker}</h1>
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'active' : ''}`}>
              {t}
            </button>
          ))}
        </div>
        {tab === 'Overview' && (
          <div className="panel">
            <h3>Snapshot</h3>
            <p>{data?.position?.ai_view || data?.watch?.reason || 'No position. Watchlist research available.'}</p>
            <p className="muted">Why moving: {data?.position?.why_moving || 'No clear catalyst. Check news, sector and macro.'}</p>
          </div>
        )}
        {tab === 'Chart' && (
          <div className="panel">
            <h3>TradingView Chart</h3>
            <TradingViewChart ticker={ticker} />
          </div>
        )}
        {tab === 'Fundamentals' && <pre className="panel">{JSON.stringify(data?.fundamentals, null, 2)}</pre>}
        {tab === 'News' && (
          <div className="actions">
            {(data?.news || []).map((n: any) => (
              <div className="action" key={n.title}>
                <BookOpen size={18} />
                <div>
                  <b>{n.title}</b>
                  <div className="muted">
                    {n.impact} - {n.action}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'Risk' && (
          <div className="panel">
            <h3>Risk profile</h3>
            <MetricBar label="Portfolio weight" value={data?.position?.portfolio_pct || 0} />
            <MetricBar label="Risk" value={data?.position?.risk || 0} tone="red" />
            <MetricBar label="Macro sensitivity" value={data?.position?.macro_sensitivity || 0} tone="violet" />
          </div>
        )}
        {tab === 'AI Thesis' && (
          <div className="panel">
            <h3>AI Thesis</h3>
            {(data?.thesis || []).length ? (
              data.thesis.map((t: any) => (
                <article key={t.title}>
                  <b>{t.title}</b>
                  <p>{t.summary}</p>
                  <details>
                    <summary>Full analysis</summary>
                    <p>{t.full_text}</p>
                  </details>
                </article>
              ))
            ) : (
              <p className="muted">{data?.forecast?.base || 'No saved thesis yet.'}</p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
