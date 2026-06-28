// Self-contained workspace + widget registry for the mobile workspace.

export type WorkspaceId = string

export type WorkspaceIconKey =
  | 'home' | 'wallet' | 'list' | 'scan' | 'globe'
  | 'cpu' | 'calendar' | 'trending-up' | 'bitcoin' | 'brain' | 'book-open'

export type WorkspaceDefinition = {
  id: WorkspaceId
  title: string
  description: string
  iconKey: WorkspaceIconKey
  defaultWidgetIds: readonly WorkspaceWidgetId[]
  mobilePriority: number
  status: 'active' | 'planned'
}

export type WorkspaceWidgetId =
  | 'portfolio-snapshot' | 'decision-brief' | 'positions' | 'risk-controls'
  | 'news-intelligence' | 'exposure-map' | 'trade-radar'
  | 'watchlist-movers' | 'market-pulse' | 'macro-calendar'
  | 'scanner-setups' | 'earnings-calendar' | 'swing-trade-planner'
  | 'crypto-market-map' | 'ai-infrastructure-map' | 'trade-coach'
  | 'academy-lessons' | 'analyst-targets' | 'unified-intelligence-feed'
  | 'sector-industry-heatmap' | 'tradingview-chart'
  | 'agent-status'

export type WidgetDef = {
  id: WorkspaceWidgetId
  title: string
  icon: string
  description: string
  category: 'portfolio' | 'intelligence' | 'risk' | 'markets' | 'scanner' | 'trading' | 'education' | 'agent'
  status: 'existing' | 'planned'
}

export const WORKSPACE_REGISTRY: readonly WorkspaceDefinition[] = [
  {
    id: 'home',
    title: 'Home',
    description: 'Primary command center',
    iconKey: 'home',
    defaultWidgetIds: ['portfolio-snapshot', 'decision-brief', 'risk-controls', 'trade-radar', 'news-intelligence'],
    mobilePriority: 1,
    status: 'active',
  },
  {
    id: 'my-portfolio',
    title: 'Portfolio',
    description: 'Holdings, exposure, risk',
    iconKey: 'wallet',
    defaultWidgetIds: ['portfolio-snapshot', 'positions', 'exposure-map', 'risk-controls'],
    mobilePriority: 2,
    status: 'active',
  },
  {
    id: 'agent',
    title: 'Agent',
    description: 'Autonomous trading agent',
    iconKey: 'cpu',
    defaultWidgetIds: ['agent-status'],
    mobilePriority: 3,
    status: 'active',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Setups and opportunities',
    iconKey: 'scan',
    defaultWidgetIds: ['trade-radar', 'scanner-setups', 'analyst-targets'],
    mobilePriority: 4,
    status: 'active',
  },
  {
    id: 'markets-macro',
    title: 'Markets',
    description: 'Macro and market context',
    iconKey: 'globe',
    defaultWidgetIds: ['market-pulse', 'macro-calendar', 'sector-industry-heatmap', 'news-intelligence'],
    mobilePriority: 5,
    status: 'active',
  },
  {
    id: 'watchlists',
    title: 'Watchlists',
    description: 'Tracked symbols',
    iconKey: 'list',
    defaultWidgetIds: ['watchlist-movers', 'news-intelligence'],
    mobilePriority: 6,
    status: 'active',
  },
  {
    id: 'ai-infrastructure',
    title: 'AI Infra',
    description: 'AI infrastructure theme',
    iconKey: 'cpu',
    defaultWidgetIds: ['ai-infrastructure-map', 'news-intelligence'],
    mobilePriority: 7,
    status: 'active',
  },
  {
    id: 'swing-trades',
    title: 'Swings',
    description: 'Swing trade planning',
    iconKey: 'trending-up',
    defaultWidgetIds: ['scanner-setups', 'swing-trade-planner', 'trade-radar'],
    mobilePriority: 8,
    status: 'active',
  },
  {
    id: 'earnings-week',
    title: 'Earnings',
    description: 'Earnings calendar & catalysts',
    iconKey: 'calendar',
    defaultWidgetIds: ['earnings-calendar', 'analyst-targets'],
    mobilePriority: 9,
    status: 'active',
  },
  {
    id: 'crypto',
    title: 'Crypto',
    description: 'Crypto market context',
    iconKey: 'bitcoin',
    defaultWidgetIds: ['crypto-market-map', 'news-intelligence'],
    mobilePriority: 10,
    status: 'active',
  },
  {
    id: 'trade-coach',
    title: 'Coach',
    description: 'Decision coaching',
    iconKey: 'brain',
    defaultWidgetIds: ['trade-coach', 'decision-brief', 'risk-controls'],
    mobilePriority: 11,
    status: 'active',
  },
]

export const WORKSPACE_MAP = Object.fromEntries(
  WORKSPACE_REGISTRY.map((ws) => [ws.id, ws])
) as Record<WorkspaceId, WorkspaceDefinition>

export const DEFAULT_WORKSPACE_ID: WorkspaceId = 'home'

export const DEFAULT_PINNED: WorkspaceId[] = ['home', 'my-portfolio', 'agent', 'scanner', 'markets-macro']

export const WIDGET_CATALOG: readonly WidgetDef[] = [
  { id: 'portfolio-snapshot', title: 'Portfolio Snapshot', icon: '📊', description: 'Value, daily P&L, cash, allocation overview', category: 'portfolio', status: 'existing' },
  { id: 'decision-brief',     title: 'Decision Brief',    icon: '🎯', description: 'Action-oriented daily brief from the rule engine', category: 'intelligence', status: 'existing' },
  { id: 'positions',          title: 'My Positions',      icon: '📋', description: 'Holdings table with P&L and risk metrics', category: 'portfolio', status: 'existing' },
  { id: 'risk-controls',      title: 'Risk Controls',     icon: '🛡️', description: 'Guardrails, alerts and risk-control outputs', category: 'risk', status: 'existing' },
  { id: 'trade-radar',        title: 'Trade Radar',       icon: '🎯', description: 'Current scanner and opportunity cards', category: 'scanner', status: 'existing' },
  { id: 'news-intelligence',  title: 'News Intelligence', icon: '📰', description: 'PIA Digest and structured news intelligence', category: 'intelligence', status: 'existing' },
  { id: 'exposure-map',       title: 'Exposure Map',      icon: '🗺️', description: 'Portfolio concentration breakdown', category: 'portfolio', status: 'existing' },
  { id: 'agent-status',       title: 'Agent Status',      icon: '🤖', description: 'Autonomous agent portfolio and backtest results', category: 'agent', status: 'existing' },
  { id: 'market-pulse',       title: 'Market Pulse',      icon: '📈', description: 'Key index, rate, volatility indicators', category: 'markets', status: 'planned' },
  { id: 'macro-calendar',     title: 'Macro Calendar',    icon: '📅', description: 'Economic releases and central-bank events', category: 'markets', status: 'planned' },
  { id: 'scanner-setups',     title: 'Scanner Setups',    icon: '🔍', description: 'Filtered rule-engine setups with scoring', category: 'scanner', status: 'planned' },
  { id: 'watchlist-movers',   title: 'Watchlist Movers',  icon: '⚡', description: 'Top watchlist movers and opportunity signals', category: 'portfolio', status: 'planned' },
  { id: 'analyst-targets',    title: 'Analyst Targets',   icon: '🎯', description: 'Per-stock target prices and revisions', category: 'intelligence', status: 'planned' },
  { id: 'earnings-calendar',  title: 'Earnings Calendar', icon: '📆', description: 'Earnings week watchlist and catalysts', category: 'markets', status: 'planned' },
  { id: 'swing-trade-planner',title: 'Swing Planner',     icon: '📐', description: 'Entry zones, stops, targets, trade journaling', category: 'trading', status: 'planned' },
  { id: 'sector-industry-heatmap', title: 'Sector Heatmap', icon: '🌡️', description: 'Sector and industry rotation heatmap', category: 'markets', status: 'planned' },
  { id: 'tradingview-chart',  title: 'TradingView Chart', icon: '📉', description: 'TradingView-powered chart module', category: 'trading', status: 'planned' },
  { id: 'crypto-market-map',  title: 'Crypto Map',        icon: '₿',  description: 'Crypto majors, funding, volatility', category: 'markets', status: 'planned' },
  { id: 'ai-infrastructure-map', title: 'AI Infra Map',   icon: '🖥️', description: 'AI infrastructure stocks and capex chains', category: 'markets', status: 'planned' },
  { id: 'trade-coach',        title: 'Trade Coach',       icon: '🧠', description: 'Decision review, risk prompts, journaling', category: 'trading', status: 'planned' },
  { id: 'unified-intelligence-feed', title: 'Unified Feed', icon: '📡', description: 'Unified intelligence stream from all sources', category: 'intelligence', status: 'planned' },
  { id: 'academy-lessons',    title: 'Academy',           icon: '📚', description: 'Learning paths and investment education', category: 'education', status: 'planned' },
]

export const WIDGET_MAP = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w])
) as Record<WorkspaceWidgetId, WidgetDef>

export function isKnownWidgetId(id: string): id is WorkspaceWidgetId {
  return id in WIDGET_MAP
}
