'use client'

import type { ComponentType } from 'react'
import { Brain, Newspaper } from 'lucide-react'
import DraggableWidgetGrid from './DraggableWidgetGrid'
import {
  DASHBOARD_LAYOUT_KEY,
  DEFAULT_DASHBOARD_ORDER,
} from './widgetRegistry'
import { usePersistedLayout } from './usePersistedLayout'
import type { DashboardWidgetId, WidgetRenderMap } from './types'

type DashboardHomeProps = {
  d: any
  hidden: boolean
  setActive: (id: string) => void
  setSelected: (row: any) => void
  newsIntel: { items: any[]; digest: string; isDemo: boolean }
  components: {
    PortfolioSnapshot: ComponentType<{ p: any; hidden: boolean; showMarginDiscipline?: boolean }>
    PositionsTable: ComponentType<{ rows: any[]; hidden: boolean; setSelected: (row: any) => void }>
    RiskList: ComponentType<{ items: any[]; hidden: boolean }>
    NewsIntelligencePanel: ComponentType<any>
    Exposure: ComponentType<{ rows: any[]; hidden: boolean }>
    TradeList: ComponentType<{ items: any[]; hidden: boolean }>
  }
  mask: string
}

export default function DashboardHome({ d, hidden, setActive, setSelected, newsIntel, components, mask }: DashboardHomeProps) {
  const p = d?.portfolio || {}
  const { order, mounted, reorder, reset } = usePersistedLayout<DashboardWidgetId>(DASHBOARD_LAYOUT_KEY, DEFAULT_DASHBOARD_ORDER)

  const {
    PortfolioSnapshot,
    PositionsTable,
    RiskList,
    NewsIntelligencePanel,
    Exposure,
    TradeList,
  } = components

  const widgets: WidgetRenderMap = {
    'portfolio-snapshot': <PortfolioSnapshot p={p} hidden={hidden} showMarginDiscipline={false} />,
    'decision-brief': (
      <div className="actions">
        {(p.today_actions || []).map((a: any) => (
          <div className="action" key={a.title}>
            <Brain size={18} className="green" />
            <div>
              <b>{hidden ? 'Workspace item' : a.title}</b>
              <div className="muted">{hidden ? mask : a.text}</div>
            </div>
          </div>
        ))}
      </div>
    ),
    positions: (
      <>
        <PositionsTable rows={(p.positions || []).slice(0, 6)} hidden={hidden} setSelected={setSelected} />
        <button className="tab" type="button" onClick={() => setActive('portfolio')}>
          {hidden ? 'Open overview' : 'Open full portfolio'}
        </button>
      </>
    ),
    'risk-controls': <RiskList items={p.guardrails || []} hidden={hidden} />,
    'news-intelligence': (
      <NewsIntelligencePanel
        items={newsIntel?.items || []}
        digest={newsIntel?.digest || ''}
        isDemo={Boolean(newsIntel?.isDemo)}
        hidden={hidden}
      />
    ),
    'exposure-map': <Exposure rows={p.exposures?.rows || []} hidden={hidden} />,
    'trade-radar': (
      <>
        <TradeList items={(d?.scanner || []).slice(0, 3)} hidden={hidden} />
        <button className="tab" type="button" onClick={() => setActive('trades')}>
          {hidden ? 'Open activity' : 'Open Trade Radar'}
        </button>
      </>
    ),
  }

  return (
    <DraggableWidgetGrid
      order={order}
      widgets={widgets}
      hidden={hidden}
      onReorder={reorder}
      onReset={reset}
      layoutReady={mounted}
      headerIcons={{ 'news-intelligence': <Newspaper size={16} /> }}
    />
  )
}
