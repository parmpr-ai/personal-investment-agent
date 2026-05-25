export const STOCK_PANEL_TABS = ['Overview', 'News', 'Videos', 'Technical', 'Scenarios', 'Actions'] as const

export type StockPanelTab = (typeof STOCK_PANEL_TABS)[number]

export const FUTURE_STOCK_PANEL_TABS = ['Earnings', 'Macro exposure', 'Options flow'] as const

export const PRIVATE_TAB_LABELS: Record<StockPanelTab, string> = {
  Overview: 'Overview',
  News: 'Updates',
  Videos: 'Research',
  Technical: 'Workspace',
  Scenarios: 'Workspace',
  Actions: 'Controls',
}
