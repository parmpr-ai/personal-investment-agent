import type { ReactNode } from 'react'

export type DashboardWidgetId =
  | 'portfolio-snapshot'
  | 'decision-brief'
  | 'positions'
  | 'risk-controls'
  | 'news-intelligence'
  | 'exposure-map'
  | 'trade-radar'

export type MobileHomeSectionId =
  | 'market-pulse'
  | 'portfolio-insights'
  | 'urgent-alerts'
  | 'daily-brief'
  | 'scanner-setups'
  | 'watchlist-movers'

export type WidgetDefinition = {
  id: DashboardWidgetId
  title: string
  privateTitle: string
  span: 'span-4' | 'span-6' | 'span-8' | 'span-12'
  defaultOrder: number
}

export type MobileSectionDefinition = {
  id: MobileHomeSectionId
  label: string
  defaultOrder: number
}

export type WidgetRenderMap = Partial<Record<DashboardWidgetId, ReactNode>>

export type MobileSectionRenderMap = Partial<Record<MobileHomeSectionId, ReactNode>>
