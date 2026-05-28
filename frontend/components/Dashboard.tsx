'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts'
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  FileText,
  Globe2,
  LayoutDashboard,
  Menu,
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
import GlowCard from './ui/GlowCard'
import SectionHeader from './ui/SectionHeader'
import IntelligenceBadge from './ui/IntelligenceBadge'
import RiskGauge from './ui/RiskGauge'
import { PiaBadge, PiaButton, PiaCard, PiaInput, PiaMetric, PiaTabs, PiaWidgetShell } from './ui-v3'
import SettingsPage from './settings/SettingsWorkspace'
import DashboardHome from './dashboard/DashboardHome'
import StockIntelligenceShell from './intelligence/StockIntelligenceShell'
import {
  buildWatchlistUniverse,
  resolveWatchlistRows,
  useCustomWatchlists,
} from './watchlists/customWatchlists'
import {
  DEFAULT_WORKSPACE_ID,
  WORKSPACE_MAP,
  WorkspaceManagerPanel,
  WorkspaceShell,
  WorkspaceSwitcher,
  getWorkspaceDefinition,
  getWorkspaceAiPromptPrefix,
  isWorkspaceId,
  useWorkspaceConfig,
  type WorkspaceId,
} from './workspace'

const API = 'http://127.0.0.1:8000'
const WS = 'ws://127.0.0.1:8000/ws'
const mask = 'â€¢â€¢â€¢â€¢â€¢â€¢'
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

const ACTIVE_WORKSPACE_KEY = 'pia.activeWorkspace.v1'
const toolNav = [
  ['tax', 'Tax Center', FileText],
  ['about', 'About', BookOpen],
  ['settings', 'Settings', Settings],
] as any[]
const legacyWorkspaceMap: Record<string, WorkspaceId> = {
  dashboard: 'home',
  portfolio: 'my-portfolio',
  watchlist: 'watchlists',
  trades: 'scanner',
  risk: 'my-portfolio',
}

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
          : key === 'last'
            ? p.last || p.price
            : key === 'risk'
              ? p.risk
              : key === 'momentum'
                ? p.momentum_score || p.momentum
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

function useNewsIntelligence() {
  const [payload, setPayload] = useState<{ items: any[]; digest: string; isDemo: boolean }>({
    items: [],
    digest: '',
    isDemo: false,
  })

  useEffect(() => {
    let active = true
    fetchJson('/news-intelligence')
      .then((data) => {
        if (!active) return
        if (Array.isArray(data)) {
          setPayload({ items: data, digest: '', isDemo: true })
          return
        }
        setPayload({
          items: Array.isArray(data?.items) ? data.items : [],
          digest: typeof data?.digest === 'string' ? data.digest : '',
          isDemo: Boolean(data?.is_demo),
        })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return payload
}

function useSourceHealthDock() {
  const [health, setHealth] = useState<any[]>([])

  useEffect(() => {
    let active = true
    fetchJson('/source-health')
      .then((data) => {
        if (active && Array.isArray(data)) setHealth(data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return health
}

export default function Dashboard() {
  const dashboard = useDash()
  const newsIntel = useNewsIntelligence()
  const sourceHealth = useSourceHealthDock()
  const workspaceConfig = useWorkspaceConfig()
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<WorkspaceId>(DEFAULT_WORKSPACE_ID)
  const [activeTool, setActiveTool] = useState<'workspace' | 'tax' | 'about' | 'settings'>('workspace')
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
      const hashWorkspace = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('workspace')
      const hashTool = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('tool')
      const savedWorkspace = localStorage.getItem(ACTIVE_WORKSPACE_KEY)
      const nextWorkspace = hashWorkspace
        ? hashWorkspace
        : savedWorkspace
          ? savedWorkspace
          : DEFAULT_WORKSPACE_ID
      setActiveWorkspaceId(nextWorkspace)
      if (hashTool === 'about' || hashTool === 'tax' || hashTool === 'settings') setActiveTool(hashTool)
    } catch {}
  }, [])

  function selectWorkspace(workspaceId: WorkspaceId) {
    setActiveWorkspaceId(workspaceId)
    setActiveTool('workspace')
    try {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, workspaceId)
      window.history.replaceState(null, '', `#workspace=${workspaceId}`)
    } catch {}
  }

  function selectLegacyDestination(id: string) {
    const workspaceId = legacyWorkspaceMap[id]
    if (workspaceId) {
      selectWorkspace(workspaceId)
      return
    }
    if (id === 'tax' || id === 'about' || id === 'settings') {
      setActiveTool(id)
      try {
        window.history.replaceState(null, '', `#tool=${id}`)
      } catch {}
    }
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

  const positions = dashboard?.portfolio?.positions || []
  const privacyHidden = mounted && hidden
  const activeWorkspace = getWorkspaceDefinition(workspaceConfig.workspaces, activeWorkspaceId)
  const sidebarWorkspaces = workspaceConfig.workspaces.filter((workspace) => workspaceConfig.sidebarDesktop.includes(workspace.id))
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
      <Sidebar
        activeWorkspaceId={activeWorkspaceId}
        activeTool={activeTool}
        selectWorkspace={selectWorkspace}
        setActive={selectLegacyDestination}
        workspaceConfig={workspaceConfig}
        sidebarWorkspaces={sidebarWorkspaces}
        hidden={privacyHidden}
        amountHidden={hidden}
        setHidden={updateHidden}
      />
      <main className="main">
        <Top
          workspace={activeWorkspace}
          activeTool={activeTool}
          hidden={privacyHidden}
          amountHidden={hidden}
          setHidden={updateHidden}
          rescan={rescan}
          rescanning={rescanning}
          rescanStatus={rescanStatus}
        />
        <MarketStrip items={dashboard?.macros?.market_strip || []} hidden={privacyHidden} />
        {activeTool === 'workspace' && activeWorkspaceId === 'home' && (
          <DashboardHome
            d={dashboard}
            hidden={privacyHidden}
            setActive={selectLegacyDestination}
            setSelected={setSelected}
            newsIntel={newsIntel}
            mask={mask}
            components={{
              PortfolioSnapshot,
              PositionsTable,
              RiskList,
              NewsIntelligencePanel,
              Exposure,
              TradeList,
            }}
          />
        )}
        {activeTool === 'workspace' && activeWorkspaceId === 'my-portfolio' && (
          <WorkspaceShell workspaceId={activeWorkspaceId} workspace={activeWorkspace} hidden={privacyHidden}>
            <PortfolioPage
              d={dashboard}
              hidden={privacyHidden}
              filter={filter}
              setFilter={setFilter}
              filtered={filtered}
              setSelected={setSelected}
            />
          </WorkspaceShell>
        )}
        {activeTool === 'workspace' && activeWorkspaceId === 'watchlists' && (
          <WorkspaceShell workspaceId={activeWorkspaceId} workspace={activeWorkspace} hidden={privacyHidden}>
            <WatchlistPage d={dashboard} hidden={privacyHidden} setSelected={setSelected} />
          </WorkspaceShell>
        )}
        {activeTool === 'workspace' && activeWorkspaceId === 'scanner' && (
          <WorkspaceShell workspaceId={activeWorkspaceId} workspace={activeWorkspace} hidden={privacyHidden}>
            <TradeRadar d={dashboard} hidden={privacyHidden} />
          </WorkspaceShell>
        )}
        {activeTool === 'workspace' && !['home', 'my-portfolio', 'watchlists', 'scanner'].includes(activeWorkspaceId) && (
          <WorkspaceShell workspaceId={activeWorkspaceId} workspace={activeWorkspace} hidden={privacyHidden} />
        )}
        {activeTool === 'tax' && <TaxPage hidden={privacyHidden} />}
        {activeTool === 'about' && <AboutPage hidden={privacyHidden} />}
        {activeTool === 'settings' && <SettingsPage hidden={privacyHidden} />}
      </main>
      {selected && (
        <StockIntelligenceShell
          variant="desktop"
          ticker={selected.symbol || selected.ticker}
          position={selected}
          hidden={privacyHidden}
          onClose={() => setSelected(null)}
        />
      )}
      <IntegrationStatusDock health={sourceHealth} hidden={privacyHidden} />
    </div>
  )
}

function statusLabel(status: any) {
  if (!status) return 'Standby'
  if (status.status === 'healthy' || status.data_received) return 'Live'
  if (status.status === 'connected_no_data' || status.ok) return 'Ready'
  if (status.status === 'failed') return 'Degraded'
  return 'Standby'
}

function statusTone(label: string) {
  if (label === 'Live') return 'good'
  if (label === 'Ready') return 'warn'
  if (label === 'Degraded') return 'bad'
  return 'neutral'
}

function IntegrationStatusDock({ health = [], hidden = false }: { health?: any[]; hidden?: boolean }) {
  const bySource = (name: string) => health.find((item: any) => item.source === name)
  const items = [
    { name: 'IBKR', icon: Wallet, status: bySource('IBKR') },
    { name: 'Yahoo', icon: Globe2, status: bySource('Yahoo Finance') },
    { name: 'Feeds', icon: Database, status: bySource('RSS') },
  ]

  return (
    <aside className="integration-status-dock" aria-label="Connection status">
      <div className="integration-status-head">
        <Activity size={15} />
        <span>{hidden ? 'Status' : 'Status Dock'}</span>
      </div>
      <div className="integration-status-list">
        {items.map(({ name, icon: Icon, status }) => {
          const label = hidden ? 'Status' : statusLabel(status)
          return (
            <div className="integration-status-item" key={name}>
              <Icon size={15} />
              <span>{hidden ? 'Source' : name}</span>
              <b className={statusTone(label)}>{label}</b>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function Sidebar({ activeWorkspaceId, activeTool, selectWorkspace, setActive, workspaceConfig, sidebarWorkspaces, hidden, amountHidden, setHidden }: any) {
  const [managerOpen, setManagerOpen] = useState(false)
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="mark">{hidden ? 'â€¢â€¢â€¢' : 'PIA'}</div>
        <div>
          <b>{hidden ? 'Private Mode' : 'PIA Workspaces'}</b>
          <br />
          <span>{hidden ? 'Workspace' : 'Decision Platform'}</span>
        </div>
      </div>
      <WorkspaceSwitcher activeWorkspaceId={activeWorkspaceId} onSelect={selectWorkspace} workspaces={sidebarWorkspaces} />
      <button className="workspace-manage-trigger" type="button" onClick={() => setManagerOpen((value) => !value)}>
        <Menu size={16} />
        <span>Manage Workspaces</span>
      </button>
      {managerOpen ? (
        <div className="desktop-workspace-manager">
          <WorkspaceManagerPanel
            config={workspaceConfig}
            variant="desktop"
            onSelectWorkspace={(workspaceId) => {
              selectWorkspace(workspaceId)
              setManagerOpen(false)
            }}
          />
        </div>
      ) : null}
      <div className="side-card">
        <span className="muted">{hidden ? 'Controls' : 'System'}</span>
        <nav>
          {toolNav.map(([id, label, Icon]: any) => (
            <button key={id} onClick={() => setActive(id)} className={activeTool === id ? 'active' : ''}>
              <Icon size={18} />
              <span>{privateNavLabel(hidden, id, label)}</span>
            </button>
          ))}
        </nav>
      </div>
      <button className="privacy" aria-pressed={amountHidden} onClick={() => setHidden(!amountHidden)}>
        {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? 'Show amounts' : 'Hide amounts'}
      </button>
    </aside>
  )
}

function Top({ workspace, activeTool, hidden, amountHidden, setHidden, rescan, rescanning, rescanStatus }: any) {
  const toolLabel = String(toolNav.find(([id]) => id === activeTool)?.[1] || 'Workspace')
  const title = activeTool === 'workspace' ? workspace?.title || 'Home' : toolLabel
  const subtitle =
    activeTool === 'workspace'
      ? getWorkspaceAiPromptPrefix(workspace?.id || DEFAULT_WORKSPACE_ID)
      : 'System tools, settings, release notes and operational controls'

  return (
    <div className="topbar">
      <div className="topbar-title">
        <h1>{hidden ? 'Workspace' : title}</h1>
        <div className="muted">
          {hidden ? 'Private workspace overview and controls' : subtitle}
        </div>
        {rescanStatus && <div className="muted">{rescanStatus}</div>}
      </div>
      <div className="top-actions">
        <button className="mobile-privacy pia-v3-mobile-privacy" aria-pressed={amountHidden} onClick={() => setHidden(!amountHidden)}>
          {hidden ? <Eye size={16} /> : <EyeOff size={16} />} <span>{hidden ? 'Show amounts' : 'Hide amounts'}</span>
        </button>
        <PiaInput
          className="top-search"
          leadingIcon={<Search size={16} />}
          placeholder={hidden ? 'Search workspace...' : 'Search ticker, source, note...'}
          aria-label={hidden ? 'Search workspace' : 'Search ticker, source, note'}
        />
        <PiaButton variant="primary" icon={<RefreshCw size={15} />} onClick={rescan} disabled={rescanning} loading={rescanning}>
          {rescanning ? 'Rescanning' : 'Rescan'}
        </PiaButton>
      </div>
    </div>
  )
}

function MarketStrip({ items = [], hidden }: any) {
  const railRef = useRef<HTMLDivElement>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  function updateScrollState() {
    const node = railRef.current
    if (!node) return
    const maxScroll = node.scrollWidth - node.clientWidth
    setCanScrollPrev(node.scrollLeft > 2)
    setCanScrollNext(node.scrollLeft < maxScroll - 2)
  }

  function scrollMarketPulse(direction: -1 | 1) {
    const node = railRef.current
    if (!node) return
    const firstCard = node.firstElementChild as HTMLElement | null
    const distance = firstCard ? firstCard.offsetWidth + 10 : Math.max(160, Math.floor(node.clientWidth * 0.7))
    node.scrollBy({ left: direction * distance, behavior: 'smooth' })
  }

  useEffect(() => {
    updateScrollState()
    const node = railRef.current
    if (!node) return
    const onResize = () => updateScrollState()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [items.length])

  return (
    <section className="market-strip" aria-label={hidden ? 'Workspace market indicators' : 'Market Pulse'}>
      <button
        type="button"
        className="market-strip-nav"
        onClick={() => scrollMarketPulse(-1)}
        disabled={!canScrollPrev}
        aria-label="Previous market indicators"
      >
        <ChevronLeft size={17} />
      </button>
      <div className="ticker" ref={railRef} onScroll={updateScrollState} tabIndex={0}>
        {items.map((x: any, index: number) => (
          <PiaCard
            className="ticker-card"
            density="compact"
            key={x.name || index}
            title={<span className="muted">{hidden ? 'Workspace' : x.name}</span>}
            metric={
              <PiaMetric
                density="compact"
                label=""
                value={hidden ? mask : x.value}
                delta={hidden ? mask : pct(x.chg)}
                trend={x.chg >= 0 ? 'positive' : 'negative'}
              />
            }
          />
        ))}
      </div>
      <button
        type="button"
        className="market-strip-nav"
        onClick={() => scrollMarketPulse(1)}
        disabled={!canScrollNext}
        aria-label="Next market indicators"
      >
        <ChevronRight size={17} />
      </button>
    </section>
  )
}

function Panel({ title, privateTitle: hiddenTitle, children, span = 'span-4', icon, hidden = false }: any) {
  const displayTitle = hidden ? hiddenTitle || neutralPanelTitle(title) : title
  return (
    <PiaWidgetShell className={`panel ${span}`} icon={icon} title={displayTitle} density="default">
      {children}
    </PiaWidgetShell>
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

function toneForBias(bias: string, sentiment?: string) {
  const value = String(bias || sentiment || '').toLowerCase()
  if (value.includes('bull') || value === 'positive') return 'good'
  if (value.includes('bear') || value === 'negative') return 'bad'
  return 'warn'
}

function toneForPossibleMove(move: string, risk?: string) {
  const value = String(move || risk || '').toLowerCase()
  if (value.includes('fade') || value.includes('pullback') || value === 'high') return 'bad'
  if (value.includes('risk') || value === 'medium') return 'warn'
  return 'good'
}

function newsBiasLabel(item: any) {
  return item.bias || item.sentiment || 'Neutral'
}

function newsConfidence(item: any) {
  return item.confidence ?? item.impact_score ?? 0
}

function newsPossibleMove(item: any) {
  return item.possible_move || item.sell_the_news_risk || 'low'
}

function newsActionLabel(item: any) {
  return item.action_label || item.suggested_action || 'Watch for confirmation'
}

function NewsIntelligencePanel({ items, digest, isDemo, hidden }: any) {
  const rows = items.slice(0, 4)
  if (!rows.length) return <p className="muted">No structured news intelligence loaded yet.</p>

  return (
    <div className="news-intel-stack">
      <section className="news-intel-digest">
        <div className="news-intel-digest-head">
          <span className="news-intel-digest-label">{hidden ? 'Workspace brief' : 'PIA DIGEST'}</span>
          {!hidden && isDemo ? <span className="news-intel-demo-badge">DEMO</span> : null}
        </div>
        <p>{hidden ? mask : digest || 'No digest available for the current scan.'}</p>
      </section>
      <div className="news-intel-list">
        {rows.map((item: any) => {
          const articleUrl = String(item.source_url || '').trim()
          const title = hidden ? 'Workspace intelligence item' : String(item.title || 'Untitled headline')
          return (
            <article className="news-intel-card" key={item.id}>
              <div className="news-intel-main">
                <div className="news-intel-kicker">
                  <b>{hidden ? 'ITEM' : item.ticker}</b>
                  <span>{hidden ? 'Source' : item.source}</span>
                  <span>{hidden ? mask : `${item.freshness_minutes}m ago`}</span>
                </div>
                {hidden || !articleUrl ? (
                  <strong>{title}</strong>
                ) : (
                  <a className="news-intel-title" href={articleUrl} target="_blank" rel="noreferrer">
                    {title}
                  </a>
                )}
                <p>{hidden ? mask : item.summary}</p>
              </div>
              <div className="news-intel-meta">
                <div className="news-intel-field">
                  <span>{hidden ? 'Signal' : 'Bias'}</span>
                  <IntelligenceBadge
                    label={hidden ? mask : newsBiasLabel(item)}
                    tone={toneForBias(newsBiasLabel(item), item.sentiment)}
                  />
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Move' : 'Possible Move'}</span>
                  <IntelligenceBadge
                    label={hidden ? mask : newsPossibleMove(item)}
                    tone={toneForPossibleMove(newsPossibleMove(item), item.sell_the_news_risk)}
                  />
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Level' : 'Confidence'}</span>
                  <b>{hidden ? mask : newsConfidence(item)}</b>
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Next' : 'Action'}</span>
                  <b>{hidden ? mask : newsActionLabel(item)}</b>
                </div>
                {!hidden && articleUrl ? (
                  <a href={articleUrl} target="_blank" rel="noreferrer" aria-label={`Open article for ${item.ticker}`}>
                    <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
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
        <PiaCard className="kpi" density="compact" key={title}>
          <PiaMetric
            density="compact"
            label={hidden ? 'Overview' : title}
            value={hidden ? mask : secondary === 'pct' ? pct(value) : money(value)}
            delta={typeof secondary === 'number' ? (hidden ? mask : pct(secondary)) : undefined}
            trend={typeof secondary === 'number' ? (secondary >= 0 ? 'positive' : 'negative') : 'neutral'}
          />
        </PiaCard>
      ))}
    </div>
  )
}

function PortfolioSnapshot({ p, hidden, showMarginDiscipline = true }: any) {
  const mounted = useMounted()
  const [activeTf, setActiveTf] = useState('1M')
  const tfOptions = ['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL']
  const dayPnlPct = Number(p.daily_pnl_pct || 0)
  const total = Number(p.total_value || 0)
  const bp = Number(p.buying_power || 0)
  const ibkrMetrics = [
    { label: 'Realized P/L', value: '$0.00' },
    { label: 'Excess Liq.', value: money(Math.round(bp * 0.85)) },
    { label: 'SMA', value: money(Math.round(total * 0.92)) },
    { label: 'Theta', value: `$${(-(Math.round(total * 0.00012 * 100) / 100)).toFixed(2)}` },
    { label: 'Vega', value: `$${Math.round(total * 0.0026)}` },
    { label: 'Maint. Mgn', value: money(Math.round(total * 0.22)) },
    { label: 'Init. Mgn', value: money(Math.round(total * 0.15)) },
    { label: 'SPX Δ', value: (total / 260000).toFixed(2) },
    { label: 'Net Δ', value: (total / 87500).toFixed(2) },
    { label: 'Day Trades', value: '3' },
  ]
  return (
    <>
      <div className={showMarginDiscipline ? 'snapshot-grid' : 'snapshot-grid snapshot-grid-main'}>
        <div>
          <div className="hero-value">{hidden ? mask : money(p.total_value)}</div>
          <div className="hero-meta">
            <span className={p.daily_pnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.daily_pnl)} today</span>
            <span className={`snapshot-pnl-pct ${dayPnlPct >= 0 ? 'green' : 'red'}`}>{hidden ? mask : `${dayPnlPct >= 0 ? '+' : ''}${Math.abs(dayPnlPct).toFixed(2)}%`}</span>
            <span>{p.risk_mode || '-'}</span>
          </div>
          <Kpis p={p} hidden={hidden} />
          <div className="snapshot-tf-rail">
            {tfOptions.map((tf) => (
              <button key={tf} type="button" className={`snapshot-tf-chip${activeTf === tf ? ' active' : ''}`} onClick={() => setActiveTf(tf)}>{tf}</button>
            ))}
          </div>
        </div>
        <PiaCard className="chart-card" title={privateTitle(hidden, 'Portfolio evolution', 'Workspace trend')} badge={<PiaBadge variant="info">Intraday</PiaBadge>}>
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
        </PiaCard>
        {showMarginDiscipline ? (
          <PiaCard className="margin-card" title="Margin" badge={<PiaBadge variant="ai">Discipline</PiaBadge>}>
            <div className="margin-ring">
              <b>{pct(p.margin_used)}</b>
              <span>used</span>
            </div>
            <MetricBar
              label={hidden ? 'Overview' : 'Buying power utilization'}
              value={Math.min((Number(p.margin_used) || 0) * 2.2, 100)}
              tone="violet"
              hidden={hidden}
            />
          </PiaCard>
        ) : null}
      </div>
      <div className="snapshot-ibkr-metrics">
        {ibkrMetrics.map((m) => (
          <div key={m.label} className="snapshot-metric-chip">
            <span>{m.label}</span>
            <b>{hidden ? mask : m.value}</b>
          </div>
        ))}
      </div>
    </>
  )
}

function PortfolioPage({ d, hidden, filter, setFilter, filtered, setSelected }: any) {
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [sort, setSort] = useState('allocation')
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pia.portfolioView.desktop')
      if (saved === 'cards' || saved === 'table') setView(saved)
    } catch {}
  }, [])

  function changeView(next: 'table' | 'cards') {
    setView(next)
    try { localStorage.setItem('pia.portfolioView.desktop', next) } catch {}
  }

  function handleColSort(col: string) {
    if (sort === col) setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSort(col); setDirection('desc') }
  }
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
              <PiaTabs
                className="compact-tabs"
                density="compact"
                ariaLabel="Position filter"
                activeId={filter}
                onChange={setFilter}
                tabs={['All', 'Stocks', 'Options', 'ETFs', 'Other'].map((x) => ({ id: x, label: x }))}
              />
              <div className="portfolio-view-toggle" role="group" aria-label="Portfolio view mode">
                <button className={view === 'table' ? 'active' : ''} onClick={() => changeView('table')}>
                  Table
                </button>
                <button className={view === 'cards' ? 'active' : ''} onClick={() => changeView('cards')}>
                  Cards
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
          <PiaButton variant="secondary" density="compact" onClick={() => setDirection((x) => (x === 'desc' ? 'asc' : 'desc'))}>
            {direction === 'desc' ? 'Descending' : 'Ascending'}
          </PiaButton>
        </div>
        {view === 'table' ? (
          <PositionsTable rows={rows} hidden={hidden} setSelected={setSelected} sort={sort} direction={direction} onColSort={handleColSort} />
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
        <PiaCard
          key={p.symbol}
          className={`position-card${p.brand ? ' accented' : ''}`}
          style={p.brand ? ({ '--pos-brand': p.brand } as React.CSSProperties) : undefined}
        >
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
        </PiaCard>
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
    <PiaCard className="scanner-column">
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
    </PiaCard>
  )
}

function PositionsTable({ rows, hidden, setSelected, sort, direction, onColSort }: any) {
  function ColHead({ col, label }: { col: string; label: string }) {
    const active = sort === col
    return (
      <th className={`col-sortable${active ? ' col-sorted' : ''}`} onClick={() => onColSort?.(col)}>
        {label}{active ? <span className="sort-arrow">{direction === 'desc' ? ' ↓' : ' ↑'}</span> : null}
      </th>
    )
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <ColHead col="alphabetical" label="Symbol" />
            <th>Type</th>
            <ColHead col="quantity" label="Qty" />
            <th>Avg</th>
            <th>Last</th>
            <ColHead col="market_value" label="Mkt Value" />
            <ColHead col="total_pnl" label="Unrlzd" />
            <ColHead col="daily_pnl" label="Day P/L" />
            <ColHead col="allocation" label="% Port" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any) => (
            <tr key={p.symbol} onClick={() => setSelected(p)}>
              <td>
                <div className="row-symbol">
                  <div className="logo" style={{ background: p.accent || '#60a5fa' }}>
                    {hidden ? 'â€¢â€¢' : p.logo || p.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <b>{hidden ? mask : p.symbol}</b>
                    <div className="muted">{hidden ? 'Workspace item' : p.name}</div>
                  </div>
                </div>
              </td>
              <td>
                <PiaBadge variant="neutral" size="compact">{hidden ? mask : p.sec_type || 'STK'}</PiaBadge>
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
              <td className={p.day_pnl >= 0 ? 'green' : 'red'}>
                {hidden ? mask : money(p.day_pnl || 0)}
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
      <PiaCard className="concentration-card" density="compact">
        <span>{hidden ? 'Overview' : 'Top concentration'}</span>
        <b>{hidden ? mask : top?.name || '-'}</b>
        <strong>{hidden ? mask : pct(top?.pct || 0)}</strong>
      </PiaCard>
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
  const { lists, activeId, activeList, selectList, createList, addSymbol, removeSymbol } = useCustomWatchlists()
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [sort, setSort] = useState('daily_pct')
  const [direction, setDirection] = useState<'desc' | 'asc'>('desc')
  const [newListName, setNewListName] = useState('')
  const [newTicker, setNewTicker] = useState('')
  const universe = useMemo(() => buildWatchlistUniverse(d), [d])
  const rows = useMemo(() => {
    const resolved = resolveWatchlistRows(activeList?.symbols || [], universe)
    return resolved.sort((a: any, b: any) => {
      const av = metricValue(a, sort)
      const bv = metricValue(b, sort)
      if (typeof av === 'string' || typeof bv === 'string') {
        return direction === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
      }
      return direction === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av)
    })
  }, [activeList, universe, sort, direction])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('pia.watchlistView.desktop')
      if (saved === 'cards' || saved === 'table') setView(saved)
    } catch {}
  }, [])

  function changeView(next: 'table' | 'cards') {
    setView(next)
    try { localStorage.setItem('pia.watchlistView.desktop', next) } catch {}
  }

  function submitList(e: React.FormEvent) {
    e.preventDefault()
    createList(newListName)
    setNewListName('')
  }

  function submitTicker(e: React.FormEvent) {
    e.preventDefault()
    if (!activeList) return
    addSymbol(activeList.id, newTicker)
    setNewTicker('')
  }

  return (
    <div className="grid">
      <Panel title="Watchlists" privateTitle="Workspace" span="span-12" hidden={hidden}>
        <SectionHeader
          title={privateTitle(hidden, 'Custom Watchlists', 'Workspace')}
          subtitle={hidden ? `${rows.length} items` : `${activeList?.name || 'Watchlist'} - ${rows.length} tickers`}
          actions={
            <div className="portfolio-view-toggle" role="group" aria-label="Watchlist view mode">
              <button className={view === 'table' ? 'active' : ''} onClick={() => changeView('table')}>Table</button>
              <button className={view === 'cards' ? 'active' : ''} onClick={() => changeView('cards')}>Cards</button>
            </div>
          }
        />
        <div className="watchlist-toolbar">
          <select value={activeId} onChange={(e) => selectList(e.target.value)} aria-label="Select watchlist">
            {lists.map((list) => (
              <option key={list.id} value={list.id}>{list.name}</option>
            ))}
          </select>
          <form onSubmit={submitList}>
            <PiaInput value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New watchlist" aria-label="New watchlist name" />
            <PiaButton type="submit" density="compact" variant="secondary"><Plus size={14} /> Create</PiaButton>
          </form>
          <form onSubmit={submitTicker}>
            <PiaInput value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="Add ticker" aria-label="Ticker to add" />
            <PiaButton type="submit" density="compact"><Plus size={14} /> Add</PiaButton>
          </form>
        </div>
        <div className="sort-row">
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {[
              ['daily_pct', 'Daily %'],
              ['daily_pnl', 'Daily value'],
              ['last', 'Price'],
              ['risk', 'Risk'],
              ['momentum', 'Momentum'],
              ['alphabetical', 'Alphabetical'],
            ].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <PiaButton variant="secondary" density="compact" onClick={() => setDirection((x) => (x === 'desc' ? 'asc' : 'desc'))}>
            {direction === 'desc' ? 'Descending' : 'Ascending'}
          </PiaButton>
        </div>
        {!activeList || rows.length === 0 ? (
          <div className="empty-state watchlist-empty">
            <b>{hidden ? 'Workspace ready' : 'No tickers in this watchlist yet.'}</b>
            <p className="muted">{hidden ? mask : 'Add AMD, NBIS, IREN, or any ticker to start tracking it here.'}</p>
          </div>
        ) : view === 'table' ? (
          <WatchlistTable rows={rows} hidden={hidden} setSelected={setSelected} onRemove={(symbol: string) => removeSymbol(activeList.id, symbol)} />
        ) : (
          <WatchlistCards rows={rows} hidden={hidden} setSelected={setSelected} onRemove={(symbol: string) => removeSymbol(activeList.id, symbol)} />
        )}
      </Panel>
    </div>
  )
}

function WatchlistTable({ rows, hidden, setSelected, onRemove }: any) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Status</th>
            <th>Last</th>
            <th>Daily %</th>
            <th>Daily Chg</th>
            <th>Risk</th>
            <th>Momentum</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p: any) => (
            <tr key={p.symbol} onClick={() => setSelected(p)}>
              <td>
                <div className="row-symbol">
                  <div className="logo" style={{ background: p.accent || p.brand || '#60a5fa' }}>
                    {hidden ? '..' : p.logo || p.symbol?.slice(0, 2)}
                  </div>
                  <div>
                    <b>{hidden ? mask : p.symbol}</b>
                    <div className="muted">{hidden ? 'Workspace item' : p.name}</div>
                  </div>
                </div>
              </td>
              <td><PiaBadge variant="neutral" size="compact">{hidden ? mask : p.label || p.sec_type || 'Watch'}</PiaBadge></td>
              <td>{hidden ? mask : money(p.last || p.price)}</td>
              <td className={p.day_change_pct >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(p.day_change_pct)}</td>
              <td className={p.day_pnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(p.day_pnl)}</td>
              <td>{hidden ? mask : p.risk || '-'}</td>
              <td>{hidden ? mask : p.momentum_score || p.momentum || '-'}</td>
              <td>
                <div className="watchlist-row-actions">
                  <PiaButton density="compact" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(p) }}>
                    <Brain size={14} /> Intel
                  </PiaButton>
                  <button className="watchlist-remove" type="button" aria-label={`Remove ${p.symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(p.symbol) }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WatchlistCards({ rows, hidden, setSelected, onRemove }: any) {
  return (
    <div className="position-cards">
      {rows.map((p: any) => {
        const change = Number(p.day_change_pct || 0)
        const dayPnl = Number(p.day_pnl || 0)
        return (
          <PiaCard
            key={p.symbol}
            className={`position-card watchlist-position-card${p.brand ? ' accented' : ''}`}
            style={p.brand ? ({ '--pos-brand': p.brand } as React.CSSProperties) : undefined}
          >
            <button onClick={() => setSelected(p)}>
              <header>
                <div>
                  <b>{hidden ? mask : p.symbol}</b>
                  <span>{hidden ? 'Workspace item' : p.name}</span>
                </div>
                <strong>{hidden ? mask : money(p.last || p.price)}</strong>
              </header>
              <div className="position-pnl">
                <span className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(change)} today</span>
                <span className={dayPnl >= 0 ? 'green' : 'red'}>{hidden ? mask : money(dayPnl)}</span>
              </div>
              <MetricBar label={hidden ? 'Controls' : 'Risk'} value={p.risk || 0} tone="red" hidden={hidden} />
              <MetricBar label={hidden ? 'Activity' : 'Momentum'} value={p.momentum_score || p.momentum || 0} tone="green" hidden={hidden} />
              <div className="watchlist-card-actions">
                <PiaBadge variant="info">{hidden ? 'Overview' : p.label || p.sec_type || 'Watch'}</PiaBadge>
                <span>
                  <PiaButton density="compact" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(p) }}>
                    <Brain size={14} /> Intel
                  </PiaButton>
                  <button className="watchlist-remove" type="button" aria-label={`Remove ${p.symbol}`} onClick={(e) => { e.stopPropagation(); onRemove(p.symbol) }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            </button>
          </PiaCard>
        )
      })}
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
        <PiaCard className="stock-card" key={x.ticker}>
          <header>
            <div>
              <b>{hidden ? mask : x.ticker}</b>
              <div className="muted">{hidden ? mask : `Price ${money(x.price)}`}</div>
            </div>
            <PiaBadge variant="ai">{hidden ? 'Overview' : x.label}</PiaBadge>
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
        </PiaCard>
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
