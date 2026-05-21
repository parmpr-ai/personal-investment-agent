import type { DashboardWidgetId, MobileHomeSectionId, MobileSectionDefinition, WidgetDefinition } from './types'

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
  { id: 'portfolio-snapshot', title: 'Portfolio Snapshot', privateTitle: 'Overview', span: 'span-8', defaultOrder: 0 },
  { id: 'decision-brief', title: "Today's Decision Brief", privateTitle: 'Workspace', span: 'span-4', defaultOrder: 1 },
  { id: 'positions', title: 'My Positions', privateTitle: 'Overview', span: 'span-8', defaultOrder: 2 },
  { id: 'risk-controls', title: 'Risk Controls', privateTitle: 'Controls', span: 'span-4', defaultOrder: 3 },
  { id: 'news-intelligence', title: 'News Intelligence', privateTitle: 'Workspace', span: 'span-12', defaultOrder: 4 },
  { id: 'exposure-map', title: 'Exposure Map', privateTitle: 'Overview', span: 'span-6', defaultOrder: 5 },
  { id: 'trade-radar', title: 'Trade Radar', privateTitle: 'Activity', span: 'span-6', defaultOrder: 6 },
]

export const MOBILE_HOME_SECTIONS: MobileSectionDefinition[] = [
  { id: 'market-pulse', label: 'Market Pulse', defaultOrder: 0 },
  { id: 'portfolio-insights', label: 'Portfolio Insights', defaultOrder: 1 },
  { id: 'urgent-alerts', label: 'Alerts', defaultOrder: 2 },
  { id: 'daily-brief', label: 'Daily Brief', defaultOrder: 3 },
  { id: 'scanner-setups', label: 'Scanner Setups', defaultOrder: 4 },
  { id: 'watchlist-movers', label: 'Watchlist Movers', defaultOrder: 5 },
]

export const DASHBOARD_LAYOUT_KEY = 'pia.dashboard.layout.v1'
export const MOBILE_HOME_LAYOUT_KEY = 'pia.mobile.home.layout.v1'

export const DEFAULT_DASHBOARD_ORDER: DashboardWidgetId[] = [...DASHBOARD_WIDGETS]
  .sort((a, b) => a.defaultOrder - b.defaultOrder)
  .map((widget) => widget.id)

export const DEFAULT_MOBILE_HOME_ORDER: MobileHomeSectionId[] = [...MOBILE_HOME_SECTIONS]
  .sort((a, b) => a.defaultOrder - b.defaultOrder)
  .map((section) => section.id)

export const DASHBOARD_WIDGET_MAP = Object.fromEntries(DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])) as Record<
  DashboardWidgetId,
  WidgetDefinition
>

export const MOBILE_SECTION_MAP = Object.fromEntries(MOBILE_HOME_SECTIONS.map((section) => [section.id, section])) as Record<
  MobileHomeSectionId,
  MobileSectionDefinition
>
