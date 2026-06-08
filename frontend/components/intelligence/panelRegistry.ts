export const STOCK_PANEL_TABS = ['Overview', 'Chart', 'News', 'Financials', 'Analysis'] as const

export type StockPanelTab = (typeof STOCK_PANEL_TABS)[number]

export const PRIVATE_TAB_LABELS: Record<StockPanelTab, string> = {
  Overview: 'Overview',
  Chart: 'Chart',
  News: 'Updates',
  Financials: 'Financials',
  Analysis: 'Analysis',
}
