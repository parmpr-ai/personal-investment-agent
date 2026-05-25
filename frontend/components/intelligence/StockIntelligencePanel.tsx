'use client'

import { useState } from 'react'
import { Bell, Eye, Shield, TrendingUp, X } from 'lucide-react'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import GlowCard from '../ui/GlowCard'
import { mask, money, pct } from '../../lib/pia-api'
import TickerNewsList from './TickerNewsList'
import { FUTURE_STOCK_PANEL_TABS, PRIVATE_TAB_LABELS, STOCK_PANEL_TABS, type StockPanelTab } from './panelRegistry'
import { useStockIntelligence } from './useStockIntelligence'

let lastActiveStockPanelTab: StockPanelTab = 'Overview'

function MetricRow({ label, value, tone = 'blue', hidden }: { label: string; value: number; tone?: string; hidden: boolean }) {
  return (
    <div className="metric-bar">
      <div>
        <span>{label}</span>
        <b>{hidden ? mask : pct(value)}</b>
      </div>
      <i>
        <em className={tone} style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </i>
    </div>
  )
}

function TradingViewChart({ ticker, hidden }: { ticker: string; hidden: boolean }) {
  if (hidden) {
    return (
      <div className="stock-intel-chart-placeholder">
        <span>{mask}</span>
      </div>
    )
  }

  const symbol = encodeURIComponent(`NASDAQ:${String(ticker || '').split(' ')[0]}`)
  return (
    <iframe
      title={`${ticker} TradingView chart`}
      className="stock-intel-chart-frame"
      src={`https://s.tradingview.com/widgetembed/?symbol=${symbol}&interval=D&theme=dark&style=1&hide_top_toolbar=1&hide_side_toolbar=1&allow_symbol_change=0&save_image=0`}
    />
  )
}

export default function StockIntelligencePanel({
  ticker,
  seedPosition,
  hidden,
  onClose,
  variant,
}: {
  ticker: string
  seedPosition?: Record<string, unknown> | null
  hidden: boolean
  onClose: () => void
  variant: 'desktop' | 'mobile'
}) {
  const [tab, setTab] = useState<StockPanelTab>(() => lastActiveStockPanelTab)
  const { loading, source, position, intelligence, newsIntelligence } = useStockIntelligence(ticker, seedPosition)

  const symbol = String(ticker || '').split(' ')[0]
  const name = String(source.name || 'Position')
  const last = Number(source.last || source.price || 0)
  const change = Number(source.day_change_pct || source.change_pct || source.change || 0)
  const unrealized = Number(source.unrealized || 0)
  const overview = intelligence?.overview || {}
  const technical = intelligence?.technical || {}
  const scenarios = intelligence?.scenarios || []
  const actions = intelligence?.actions || []

  const tabLabel = (value: StockPanelTab) => (hidden ? PRIVATE_TAB_LABELS[value] : value)
  const handleTabChange = (value: StockPanelTab) => {
    lastActiveStockPanelTab = value
    setTab(value)
  }

  return (
    <div className={`stock-intel-panel ${variant === 'mobile' ? 'stock-intel-panel-mobile' : 'stock-intel-panel-desktop'}`.trim()}>
      <header className="stock-intel-header">
        <div>
          <span className="stock-intel-kicker">{hidden ? 'Workspace' : name}</span>
          <h2>{hidden ? mask : symbol}</h2>
          <div className="stock-intel-price-row">
            <strong>{hidden ? mask : money(last)}</strong>
            <small className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(change)}</small>
            {position ? (
              <IntelligenceBadge
                label={hidden ? mask : `${unrealized >= 0 ? '+' : ''}${money(unrealized)} P/L`}
                tone={unrealized >= 0 ? 'good' : 'bad'}
              />
            ) : null}
          </div>
          <div className="stock-intel-summary-row">
            <span>{hidden ? 'Overview' : `${pct(source.portfolio_pct || 0)} weight`}</span>
            <span>{hidden ? 'Controls' : `Risk ${source.risk || 0}`}</span>
            <span>{hidden ? 'Workspace' : `Momentum ${source.momentum_score || source.momentum || 0}`}</span>
          </div>
        </div>
        <button type="button" className="stock-intel-close" onClick={onClose} aria-label="Close intelligence panel">
          <X size={variant === 'mobile' ? 22 : 16} />
        </button>
      </header>

      <div className="stock-intel-quick-actions">
        <button type="button" className="tab">
          <Eye size={15} /> {hidden ? 'Monitor' : 'Watch'}
        </button>
        <button type="button" className="tab">
          <Bell size={15} /> {hidden ? 'Alerts' : 'Set alert'}
        </button>
        <button type="button" className="tab">
          <Shield size={15} /> {hidden ? 'Controls' : 'Risk check'}
        </button>
      </div>

      <div className="stock-intel-tabs">
        {STOCK_PANEL_TABS.map((item) => (
          <button key={item} type="button" className={`tab ${tab === item ? 'active' : ''}`} onClick={() => handleTabChange(item)}>
            {tabLabel(item)}
          </button>
        ))}
      </div>

      <div className="stock-intel-body">
        {loading ? <p className="muted">Loading intelligence workspace…</p> : null}

        {!loading && tab === 'Overview' && (
          <div className="stock-intel-section">
            <GlowCard>
              <h3>{hidden ? 'Workspace summary' : 'AI overview'}</h3>
              <p>{hidden ? mask : overview.summary}</p>
            </GlowCard>
            <div className="stock-intel-facts">
              <article>
                <span>{hidden ? 'Signal' : 'Why moving'}</span>
                <p>{hidden ? mask : overview.why_moving}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Momentum state'}</span>
                <p>{hidden ? mask : overview.momentum_state}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Macro sensitivity'}</span>
                <p>{hidden ? mask : overview.macro_sensitivity}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Earnings proximity'}</span>
                <p>{hidden ? mask : overview.earnings_proximity}</p>
              </article>
              <article>
                <span>{hidden ? 'Controls' : 'Volatility / risk'}</span>
                <p>{hidden ? mask : overview.volatility_state}</p>
              </article>
            </div>
          </div>
        )}

        {!loading && tab === 'News' && (
          <TickerNewsList
            items={newsIntelligence.items || []}
            digest={newsIntelligence.digest || ''}
            isDemo={Boolean(newsIntelligence.is_demo)}
            hidden={hidden}
          />
        )}

        {!loading && tab === 'Technical' && (
          <div className="stock-intel-section">
            <GlowCard className="stock-intel-chart-card">
              <h3>{hidden ? 'Workspace chart' : 'TradingView chart'}</h3>
              <TradingViewChart ticker={symbol} hidden={hidden} />
            </GlowCard>
            <GlowCard>
              <h3>{hidden ? 'Workspace trend' : 'Technical snapshot'}</h3>
              <div className="stock-intel-tech-grid">
                <span>
                  {hidden ? 'Signal' : 'Trend'}
                  <b>{hidden ? mask : technical.trend}</b>
                </span>
                <span>
                  {hidden ? 'Workspace' : 'Momentum'}
                  <b>{hidden ? mask : technical.momentum_state}</b>
                </span>
                <span>
                  {hidden ? 'Level' : 'Support'}
                  <b>{hidden ? mask : technical.support}</b>
                </span>
                <span>
                  {hidden ? 'Level' : 'Resistance'}
                  <b>{hidden ? mask : technical.resistance}</b>
                </span>
              </div>
            </GlowCard>
            <MetricRow label={hidden ? 'Overview' : 'Day change'} value={Math.abs(Number(technical.day_change_pct || 0))} tone={change >= 0 ? 'green' : 'red'} hidden={hidden} />
            <MetricRow label={hidden ? 'Controls' : 'Risk score'} value={Number(source.risk || 0)} tone="red" hidden={hidden} />
            <MetricRow label={hidden ? 'Workspace' : 'Macro sensitivity'} value={Number(source.macro_sensitivity || 0)} tone="violet" hidden={hidden} />
          </div>
        )}

        {!loading && tab === 'Scenarios' && (
          <div className="stock-intel-scenarios">
            {scenarios.map((scenario: any) => (
              <GlowCard key={scenario.label}>
                <div className="stock-intel-scenario-head">
                  <b>{hidden ? 'Workspace scenario' : scenario.label}</b>
                  <IntelligenceBadge label={hidden ? mask : scenario.probability} tone={scenario.label === 'Bullish' ? 'good' : scenario.label === 'Bearish' ? 'bad' : 'neutral'} />
                </div>
                <p>{hidden ? mask : scenario.text}</p>
              </GlowCard>
            ))}
          </div>
        )}

        {!loading && tab === 'Actions' && (
          <div className="stock-intel-actions">
            {actions.map((action: any) => (
              <article className="action" key={action.label}>
                <TrendingUp size={18} className="green" />
                <div>
                  <b>{hidden ? 'Control item' : action.label}</b>
                  <div className="muted">{hidden ? mask : action.detail}</div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="stock-intel-future-tabs">
        <span className="muted">{hidden ? 'Coming soon' : 'Future tabs'}</span>
        <div>
          {FUTURE_STOCK_PANEL_TABS.map((item) => (
            <span className="stock-intel-future-pill" key={item}>
              {item}
            </span>
          ))}
        </div>
      </footer>
    </div>
  )
}
