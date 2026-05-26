import type { WorkspaceWidgetId } from './widgetCatalog'

export type WorkspaceId =
  | 'home'
  | 'my-portfolio'
  | 'watchlists'
  | 'scanner'
  | 'markets-macro'
  | 'ai-infrastructure'
  | 'earnings-week'
  | 'swing-trades'
  | 'crypto'
  | 'trade-coach'
  | 'academy'

export type WorkspaceCategory = 'primary' | 'portfolio' | 'research' | 'trading' | 'education' | 'alternative'

export type WorkspaceIconKey =
  | 'home'
  | 'wallet'
  | 'list'
  | 'scan'
  | 'globe'
  | 'cpu'
  | 'calendar'
  | 'trending-up'
  | 'bitcoin'
  | 'brain'
  | 'book-open'

export type WorkspaceStatus = 'active' | 'planned'

export type WorkspaceDefinition = {
  id: WorkspaceId
  title: string
  description: string
  iconKey: WorkspaceIconKey
  category: WorkspaceCategory
  defaultWidgetIds: readonly WorkspaceWidgetId[]
  defaultAiContext: string
  mobilePriority: number
  status: WorkspaceStatus
}

export const WORKSPACE_REGISTRY: readonly WorkspaceDefinition[] = [
  {
    id: 'home',
    title: 'Home',
    description: 'Primary command center for portfolio state, decision brief, risk controls, news, and trade radar.',
    iconKey: 'home',
    category: 'primary',
    defaultWidgetIds: [
      'portfolio-snapshot',
      'decision-brief',
      'positions',
      'risk-controls',
      'news-intelligence',
      'exposure-map',
      'trade-radar',
    ],
    defaultAiContext: 'Focus on the full portfolio, priority actions, current risks, market context, and the next best decision.',
    mobilePriority: 1,
    status: 'active',
  },
  {
    id: 'my-portfolio',
    title: 'My Portfolio',
    description: 'Holdings, exposure, risk, targets, charting, and portfolio-specific intelligence.',
    iconKey: 'wallet',
    category: 'portfolio',
    defaultWidgetIds: ['portfolio-snapshot', 'positions', 'exposure-map', 'risk-controls', 'analyst-targets', 'tradingview-chart'],
    defaultAiContext: 'Analyze holdings, sizing, exposures, unrealized P/L, risk controls, and per-stock target changes.',
    mobilePriority: 2,
    status: 'active',
  },
  {
    id: 'watchlists',
    title: 'Watchlists',
    description: 'Custom watchlists, movers, logos, mini charts, and intelligence for tracked symbols.',
    iconKey: 'list',
    category: 'research',
    defaultWidgetIds: ['watchlist-movers', 'watchlist-manager', 'news-intelligence', 'analyst-targets', 'tradingview-chart'],
    defaultAiContext: 'Rank watchlist symbols by opportunity, risk, news, revisions, relative strength, and upcoming catalysts.',
    mobilePriority: 3,
    status: 'active',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Rule-engine setups, market scans, technical context, and target intelligence.',
    iconKey: 'scan',
    category: 'research',
    defaultWidgetIds: ['trade-radar', 'scanner-setups', 'analyst-targets', 'sector-industry-heatmap', 'tradingview-chart'],
    defaultAiContext: 'Evaluate current setups, catalysts, risk/reward, sector context, liquidity, and clear disqualification rules.',
    mobilePriority: 4,
    status: 'active',
  },
  {
    id: 'markets-macro',
    title: 'Markets & Macro',
    description: 'Macro dashboard for rates, volatility, sector rotation, breadth, and global market context.',
    iconKey: 'globe',
    category: 'research',
    defaultWidgetIds: ['market-pulse', 'macro-calendar', 'sector-industry-heatmap', 'news-intelligence', 'tradingview-chart'],
    defaultAiContext: 'Summarize macro conditions, market breadth, cross-asset risk, rotation, and portfolio implications.',
    mobilePriority: 5,
    status: 'active',
  },
  {
    id: 'ai-infrastructure',
    title: 'AI Infrastructure',
    description: 'AI infrastructure theme workspace for semiconductors, cloud, power, data centers, and capex chains.',
    iconKey: 'cpu',
    category: 'research',
    defaultWidgetIds: ['ai-infrastructure-map', 'news-intelligence', 'unified-intelligence-feed'],
    defaultAiContext: 'Track AI infrastructure supply chains, capex, demand, competitive positioning, and valuation risk.',
    mobilePriority: 8,
    status: 'active',
  },
  {
    id: 'earnings-week',
    title: 'Earnings Week',
    description: 'Earnings calendar, owned exposure, watchlist catalysts, revisions, and post-earnings reaction tracking.',
    iconKey: 'calendar',
    category: 'research',
    defaultWidgetIds: ['earnings-calendar', 'analyst-targets', 'news-intelligence'],
    defaultAiContext: 'Prioritize earnings events by exposure, expectations, revisions, implied move, and post-report action.',
    mobilePriority: 6,
    status: 'active',
  },
  {
    id: 'swing-trades',
    title: 'Swing Trades',
    description: 'Planning workspace for swing setups, entries, exits, stops, targets, and journaling.',
    iconKey: 'trending-up',
    category: 'trading',
    defaultWidgetIds: ['scanner-setups', 'swing-trade-planner', 'trade-radar', 'tradingview-chart'],
    defaultAiContext: 'Assess swing trade readiness, entry quality, stop distance, target ladder, risk size, and invalidation.',
    mobilePriority: 7,
    status: 'active',
  },
  {
    id: 'crypto',
    title: 'Crypto',
    description: 'Crypto market context, majors, volatility, funding, rotation, and intelligence.',
    iconKey: 'bitcoin',
    category: 'alternative',
    defaultWidgetIds: ['crypto-market-map', 'news-intelligence', 'unified-intelligence-feed', 'tradingview-chart'],
    defaultAiContext: 'Summarize crypto trend, liquidity, volatility, risk appetite, key levels, and cross-asset correlation.',
    mobilePriority: 9,
    status: 'active',
  },
  {
    id: 'trade-coach',
    title: 'Trade Coach',
    description: 'Decision coaching, journaling, checklist review, behavioral guardrails, and future voice mode.',
    iconKey: 'brain',
    category: 'trading',
    defaultWidgetIds: ['trade-coach', 'decision-brief', 'risk-controls', 'swing-trade-planner'],
    defaultAiContext: 'Coach the user through decision quality, sizing, thesis, invalidation, emotional state, and risk discipline.',
    mobilePriority: 10,
    status: 'active',
  },
  {
    id: 'academy',
    title: 'Academy',
    description: 'Investment education, playbooks, lessons, reviews, and structured learning paths.',
    iconKey: 'book-open',
    category: 'education',
    defaultWidgetIds: ['academy-lessons'],
    defaultAiContext: 'Teach concepts with practical PIA examples, portfolio-aware lessons, and clear next exercises.',
    mobilePriority: 11,
    status: 'active',
  },
] as const

export const WORKSPACE_MAP = Object.fromEntries(WORKSPACE_REGISTRY.map((workspace) => [workspace.id, workspace])) as Record<
  WorkspaceId,
  WorkspaceDefinition
>

export const ACTIVE_WORKSPACES = WORKSPACE_REGISTRY.filter((workspace) => workspace.status === 'active')

export const PLANNED_WORKSPACES = WORKSPACE_REGISTRY.filter((workspace) => workspace.status === 'planned')

export const DEFAULT_WORKSPACE_ID: WorkspaceId = 'home'

export function isWorkspaceId(id: string): id is WorkspaceId {
  return id in WORKSPACE_MAP
}
