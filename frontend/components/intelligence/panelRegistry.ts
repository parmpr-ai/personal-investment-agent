export const STOCK_PANEL_TABS = ['Quote', 'Technical', 'News', 'Company', 'Videos'] as const

export type StockPanelTab = (typeof STOCK_PANEL_TABS)[number]

export const PRIVATE_TAB_LABELS: Record<StockPanelTab, string> = {
  Quote: 'Overview',
  Technical: 'Workspace',
  News: 'Updates',
  Company: 'Company',
  Videos: 'Research',
}
