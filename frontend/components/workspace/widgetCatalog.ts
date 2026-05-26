import type { WorkspaceId } from './workspaceRegistry'

export type WorkspaceWidgetId =
  | 'portfolio-snapshot'
  | 'decision-brief'
  | 'positions'
  | 'risk-controls'
  | 'news-intelligence'
  | 'exposure-map'
  | 'trade-radar'
  | 'watchlist-movers'
  | 'watchlist-manager'
  | 'market-pulse'
  | 'macro-calendar'
  | 'scanner-setups'
  | 'earnings-calendar'
  | 'swing-trade-planner'
  | 'crypto-market-map'
  | 'ai-infrastructure-map'
  | 'trade-coach'
  | 'academy-lessons'
  | 'analyst-targets'
  | 'unified-intelligence-feed'
  | 'sector-industry-heatmap'
  | 'tradingview-chart'

export type WidgetCategory =
  | 'portfolio'
  | 'intelligence'
  | 'risk'
  | 'markets'
  | 'scanner'
  | 'watchlist'
  | 'trading'
  | 'education'
  | 'charting'

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl'

export type WidgetStatus = 'existing' | 'planned'

export type WidgetCatalogItem = {
  id: WorkspaceWidgetId
  title: string
  category: WidgetCategory
  description: string
  allowedSizes: readonly WidgetSize[]
  defaultSize: WidgetSize
  supportedWorkspaces: readonly WorkspaceId[]
  status: WidgetStatus
}

const coreWorkspaces: WorkspaceId[] = ['home', 'my-portfolio']
const marketWorkspaces: WorkspaceId[] = ['home', 'markets-macro', 'scanner', 'watchlists']
const tradingWorkspaces: WorkspaceId[] = ['scanner', 'swing-trades', 'trade-coach', 'home']

export const WIDGET_CATALOG: readonly WidgetCatalogItem[] = [
  {
    id: 'portfolio-snapshot',
    title: 'Portfolio Snapshot',
    category: 'portfolio',
    description: 'Current portfolio value, daily P/L, cash, buying power, and allocation overview.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: coreWorkspaces,
    status: 'existing',
  },
  {
    id: 'decision-brief',
    title: "Today's Decision Brief",
    category: 'intelligence',
    description: 'Action-oriented daily portfolio brief from the current PIA rule engine.',
    allowedSizes: ['sm', 'md', 'lg'],
    defaultSize: 'md',
    supportedWorkspaces: ['home', 'trade-coach'],
    status: 'existing',
  },
  {
    id: 'positions',
    title: 'My Positions',
    category: 'portfolio',
    description: 'Holdings table reused from the current dashboard and portfolio experience.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: coreWorkspaces,
    status: 'existing',
  },
  {
    id: 'risk-controls',
    title: 'Risk Controls',
    category: 'risk',
    description: 'Guardrails, alerts, and current risk-control outputs.',
    allowedSizes: ['sm', 'md', 'lg'],
    defaultSize: 'md',
    supportedWorkspaces: ['home', 'my-portfolio', 'trade-coach'],
    status: 'existing',
  },
  {
    id: 'news-intelligence',
    title: 'News Intelligence',
    category: 'intelligence',
    description: 'PIA Digest and structured news intelligence from the existing news endpoint.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['home', 'watchlists', 'markets-macro', 'ai-infrastructure', 'crypto'],
    status: 'existing',
  },
  {
    id: 'exposure-map',
    title: 'Exposure Map',
    category: 'portfolio',
    description: 'Portfolio concentration and exposure breakdown from current holdings data.',
    allowedSizes: ['md', 'lg'],
    defaultSize: 'md',
    supportedWorkspaces: ['home', 'my-portfolio', 'markets-macro'],
    status: 'existing',
  },
  {
    id: 'trade-radar',
    title: 'Trade Radar',
    category: 'trading',
    description: 'Current scanner and opportunity cards reused from the dashboard.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'md',
    supportedWorkspaces: tradingWorkspaces,
    status: 'existing',
  },
  {
    id: 'watchlist-movers',
    title: 'Watchlist Movers',
    category: 'watchlist',
    description: 'Top watchlist movers and ranked opportunity signals.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: ['home', 'watchlists'],
    status: 'planned',
  },
  {
    id: 'watchlist-manager',
    title: 'Watchlist Manager',
    category: 'watchlist',
    description: 'Add, remove, sort, logo, and mini-chart management for custom watchlists.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['watchlists'],
    status: 'planned',
  },
  {
    id: 'market-pulse',
    title: 'Market Pulse',
    category: 'markets',
    description: 'Market strip and key index, rate, volatility, and liquidity indicators.',
    allowedSizes: ['sm', 'md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: marketWorkspaces,
    status: 'planned',
  },
  {
    id: 'macro-calendar',
    title: 'Macro Calendar',
    category: 'markets',
    description: 'Economic releases, rates, inflation, central-bank events, and macro risk windows.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: ['markets-macro', 'home'],
    status: 'planned',
  },
  {
    id: 'scanner-setups',
    title: 'Scanner Setups',
    category: 'scanner',
    description: 'Filtered rule-engine setups, catalysts, and opportunity/risk scoring.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['scanner', 'swing-trades', 'home'],
    status: 'planned',
  },
  {
    id: 'earnings-calendar',
    title: 'Earnings Calendar',
    category: 'markets',
    description: 'Earnings week watchlist, portfolio exposure, pre/post-market reactions, and catalysts.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['earnings-week', 'watchlists'],
    status: 'planned',
  },
  {
    id: 'swing-trade-planner',
    title: 'Swing Trade Planner',
    category: 'trading',
    description: 'Entry zones, stops, targets, checklist state, and active swing-trade planning.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['swing-trades', 'trade-coach'],
    status: 'planned',
  },
  {
    id: 'crypto-market-map',
    title: 'Crypto Market Map',
    category: 'markets',
    description: 'Crypto majors, sector rotation, funding, volatility, and cross-asset risk state.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['crypto'],
    status: 'planned',
  },
  {
    id: 'ai-infrastructure-map',
    title: 'AI Infrastructure Map',
    category: 'markets',
    description: 'AI infrastructure stocks, semiconductors, cloud, power, data center, and capex chains.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['ai-infrastructure'],
    status: 'planned',
  },
  {
    id: 'trade-coach',
    title: 'Trade Coach',
    category: 'trading',
    description: 'Decision review, risk prompts, journal checkpoints, and future voice mode.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: ['trade-coach', 'swing-trades'],
    status: 'planned',
  },
  {
    id: 'academy-lessons',
    title: 'Academy Lessons',
    category: 'education',
    description: 'Learning paths, playbooks, and structured investment education content.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['academy'],
    status: 'planned',
  },
  {
    id: 'analyst-targets',
    title: 'Analyst Targets Intelligence',
    category: 'intelligence',
    description: 'Per-stock target prices, revisions, consensus bands, and target change context.',
    allowedSizes: ['md', 'lg', 'xl'],
    defaultSize: 'lg',
    supportedWorkspaces: ['my-portfolio', 'watchlists', 'scanner', 'earnings-week'],
    status: 'planned',
  },
  {
    id: 'unified-intelligence-feed',
    title: 'Unified Intelligence Feed',
    category: 'intelligence',
    description: 'Unified Yahoo, Discord, Seeking Alpha, Reuters, PIA, X, and IBKR intelligence stream.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['home', 'my-portfolio', 'watchlists', 'markets-macro', 'ai-infrastructure', 'crypto'],
    status: 'planned',
  },
  {
    id: 'sector-industry-heatmap',
    title: 'Sector & Industry Heatmap',
    category: 'markets',
    description: 'Sector, industry, and theme heatmaps for market breadth and rotation.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['markets-macro', 'scanner', 'watchlists'],
    status: 'planned',
  },
  {
    id: 'tradingview-chart',
    title: 'TradingView Chart',
    category: 'charting',
    description: 'TradingView-powered chart module for technical analysis and workspace charting.',
    allowedSizes: ['lg', 'xl'],
    defaultSize: 'xl',
    supportedWorkspaces: ['my-portfolio', 'watchlists', 'scanner', 'markets-macro', 'swing-trades', 'crypto'],
    status: 'planned',
  },
] as const

export const WIDGET_CATALOG_MAP = Object.fromEntries(WIDGET_CATALOG.map((widget) => [widget.id, widget])) as Record<
  WorkspaceWidgetId,
  WidgetCatalogItem
>

export function getWidgetsForWorkspace(workspaceId: WorkspaceId): WidgetCatalogItem[] {
  return WIDGET_CATALOG.filter((widget) => widget.supportedWorkspaces.includes(workspaceId))
}

export function isKnownWorkspaceWidgetId(id: string): id is WorkspaceWidgetId {
  return id in WIDGET_CATALOG_MAP
}
