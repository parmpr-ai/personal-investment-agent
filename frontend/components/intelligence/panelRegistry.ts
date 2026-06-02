export const STOCK_PANEL_TABS = ['Overview', 'Chart', 'News', 'Company', 'Financials', 'Analysis', 'Options', 'Video', 'Notes'] as const

export type StockPanelTab = (typeof STOCK_PANEL_TABS)[number]

export const PRIVATE_TAB_LABELS: Record<StockPanelTab, string> = {
  Overview: 'Overview',
  Chart: 'Chart',
  News: 'Updates',
  Company: 'Company',
  Financials: 'Financials',
  Analysis: 'Analysis',
  Options: 'Options',
  Video: 'Research',
  Notes: 'Notes',
}
