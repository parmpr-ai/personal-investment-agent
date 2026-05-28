'use client'

import { useState } from 'react'
import { BarChart3, Bell, Building2, Eye, Gauge, Shield, Target, X } from 'lucide-react'
import { PiaBadge, PiaButton, PiaCard, PiaTabs, PiaWidgetShell } from '../ui-v3'
import { mask, money, pct } from '../../lib/pia-api'
import TickerNewsList from './TickerNewsList'
import TickerVideosList from './TickerVideosList'
import { PRIVATE_TAB_LABELS, STOCK_PANEL_TABS, type StockPanelTab } from './panelRegistry'
import { useStockIntelligence } from './useStockIntelligence'

let lastActiveStockPanelTab: StockPanelTab = 'Quote'
const timeframes = ['Intraday', 'Swing', 'Position'] as const
type Timeframe = (typeof timeframes)[number]

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function formatDistance(level: number, last: number) {
  if (!level || !last) return 'n/a'
  const distance = ((level - last) / last) * 100
  return `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`
}

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

function ConfidenceMeter({ value, hidden }: { value: number; hidden: boolean }) {
  const score = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="stock-confidence-meter">
      <div>
        <span>{hidden ? 'Confidence' : 'Technical confidence'}</span>
        <b>{hidden ? mask : `${score}/100`}</b>
      </div>
      <i>
        <em style={{ width: `${score}%` }} />
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

function buildTechnicalPlan(technical: any, source: any, last: number, timeframe: Timeframe) {
  const baseSupport = numeric(technical.support, last * 0.96)
  const baseResistance = numeric(technical.resistance, last * 1.07)
  const volatility = Math.max(1.4, Math.min(5.5, Number(source.risk || 45) / 18))
  const modeFactor = timeframe === 'Intraday' ? 0.45 : timeframe === 'Position' ? 1.75 : 1
  const supportLevels = [
    numeric(technical.support_1, baseSupport),
    numeric(technical.support_2, last * (1 - (volatility * modeFactor) / 100)),
    numeric(technical.support_3, last * (1 - (volatility * modeFactor * 1.8) / 100)),
  ].sort((a, b) => b - a)
  const resistanceLevels = [
    numeric(technical.resistance_1, baseResistance),
    numeric(technical.resistance_2, last * (1 + (volatility * modeFactor) / 100)),
    numeric(technical.resistance_3, last * (1 + (volatility * modeFactor * 1.85) / 100)),
  ].sort((a, b) => a - b)
  const strength = Math.round(
    Math.max(10, Math.min(96, Number(source.momentum_score || source.momentum || 50) * 0.58 + (100 - Number(source.risk || 45)) * 0.22 + Math.abs(Number(technical.day_change_pct || 0)) * 1.6)),
  )
  const conservativeEntry = Math.min(last, supportLevels[0] * 1.012)
  const aggressiveEntry = last > resistanceLevels[0] ? last : Math.min(last * 1.006, resistanceLevels[0] * 1.002)
  const invalidation = supportLevels[1] || supportLevels[0] * 0.975
  const riskPerShare = Math.max(0.01, conservativeEntry - invalidation)
  const rewardPerShare = Math.max(0.01, resistanceLevels[1] - conservativeEntry)
  const rr = rewardPerShare / riskPerShare

  return {
    supportLevels,
    resistanceLevels,
    strength,
    conservativeEntry,
    aggressiveEntry,
    invalidation,
    takeProfitZones: [resistanceLevels[0], resistanceLevels[1], resistanceLevels[2]],
    confidence: Math.round(Math.max(15, Math.min(92, strength - Number(source.risk || 45) * 0.12 + (rr >= 2 ? 8 : 0)))),
    implication:
      strength >= 72
        ? 'Constructive setup: favor pullback entries or breakout confirmation, with invalidation defined before sizing.'
        : strength >= 52
          ? 'Neutral-to-positive: wait for price to respect support or reclaim resistance before adding risk.'
          : 'Low conviction: preserve capital until price improves and the stop distance tightens.',
    aiSummary:
      timeframe === 'Intraday'
        ? 'Intraday mode prioritizes nearby support, fast invalidation, and smaller target bands.'
        : timeframe === 'Position'
          ? 'Position mode widens the level map and requires patience around support tests and target zones.'
          : 'Swing mode balances entry quality, support defense, and reward-to-risk before initiating.',
    riskReward: rr >= 2 ? `Reward/risk is acceptable at ${rr.toFixed(1)}:1 if entry is near support.` : `Reward/risk is thin at ${rr.toFixed(1)}:1; avoid chasing into resistance.`,
  }
}

function DetailGrid({ rows, hidden }: { rows: { label: string; value: string; placeholder?: boolean }[]; hidden: boolean }) {
  return (
    <div className="stock-detail-grid">
      {rows.map((row) => (
        <div className={row.placeholder ? 'is-placeholder' : ''} key={row.label}>
          <span>{row.label}</span>
          <b>{hidden ? mask : row.value}</b>
        </div>
      ))}
    </div>
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
  const [tab, setTab] = useState<StockPanelTab>(() => (STOCK_PANEL_TABS.includes(lastActiveStockPanelTab) ? lastActiveStockPanelTab : 'Quote'))
  const [timeframe, setTimeframe] = useState<Timeframe>('Swing')
  const { loading, source, position, intelligence, newsIntelligence } = useStockIntelligence(ticker, seedPosition)

  const symbol = String(ticker || '').split(' ')[0]
  const name = String(source.name || seedPosition?.name || 'Position')
  const last = Number(source.last || source.price || seedPosition?.last || 0)
  const change = Number(source.day_change_pct || source.change_pct || source.change || 0)
  const unrealized = Number(source.unrealized || 0)
  const overview = intelligence?.overview || {}
  const technical = intelligence?.technical || {}
  const techPlan = buildTechnicalPlan(technical, source, last || 100, timeframe)
  const company = intelligence?.company || source.company || {}
  const fundamentals = intelligence?.fundamentals || source.fundamentals || {}
  const targets = intelligence?.targets || source.targets || {}
  const isPlaceholderCompany = !intelligence?.company && !source.company

  const tabLabel = (value: StockPanelTab) => (hidden ? PRIVATE_TAB_LABELS[value] : value)
  const handleTabChange = (value: StockPanelTab) => {
    lastActiveStockPanelTab = value
    setTab(value)
  }

  return (
    <div className={`stock-intel-panel ${variant === 'mobile' ? 'stock-intel-panel-mobile' : 'stock-intel-panel-desktop'}`.trim()}>
      <header className="stock-intel-header">
        <div className="stock-intel-title-block">
          <div className="stock-intel-identity">
            <div className="stock-intel-symbol-mark" aria-hidden="true">
              {hidden ? '*' : symbol.slice(0, 2)}
            </div>
            <div>
              <span className="stock-intel-kicker">{hidden ? 'Workspace' : name}</span>
              <h2>{hidden ? mask : symbol}</h2>
            </div>
          </div>
          <div className="stock-intel-market-line">
            <div className="stock-intel-price-row">
              <strong>{hidden ? mask : money(last)}</strong>
              <small className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : pct(change)}</small>
              {position ? (
                <PiaBadge variant={unrealized >= 0 ? 'bullish' : 'bearish'} size="compact">
                  {hidden ? mask : `${unrealized >= 0 ? '+' : ''}${money(unrealized)} P/L`}
                </PiaBadge>
              ) : null}
            </div>
            <div className="stock-intel-summary-row">
              <span>{hidden ? 'Overview' : `${pct(source.portfolio_pct || 0)} weight`}</span>
              <span>{hidden ? 'Controls' : `Risk ${source.risk || 0}`}</span>
              <span>{hidden ? 'Workspace' : `Momentum ${source.momentum_score || source.momentum || 0}`}</span>
            </div>
          </div>
        </div>
        <button type="button" className="stock-intel-close" onClick={onClose} aria-label="Close intelligence panel">
          <X size={variant === 'mobile' ? 22 : 16} />
        </button>
      </header>

      <div className="stock-intel-quick-actions">
        <PiaButton type="button" variant="secondary" density="compact" icon={<Eye size={15} />} disabled title="Planned">
          {hidden ? 'Monitor' : 'Watch'}
          <span className="stock-intel-action-state">Planned</span>
        </PiaButton>
        <PiaButton type="button" variant="secondary" density="compact" icon={<Bell size={15} />} disabled title="Planned">
          {hidden ? 'Alerts' : 'Set alert'}
          <span className="stock-intel-action-state">Planned</span>
        </PiaButton>
        <PiaButton type="button" variant="secondary" density="compact" icon={<Shield size={15} />} disabled title="Planned">
          {hidden ? 'Controls' : 'Risk check'}
          <span className="stock-intel-action-state">Planned</span>
        </PiaButton>
      </div>

      <PiaTabs
        className="stock-intel-tabs"
        ariaLabel="Stock intelligence tabs"
        activeId={tab}
        onChange={(value) => handleTabChange(value as StockPanelTab)}
        tabs={STOCK_PANEL_TABS.map((item) => ({ id: item, label: tabLabel(item) }))}
      />

      <div className="stock-intel-body">
        {loading ? <p className="muted">Loading intelligence workspace...</p> : null}

        {!loading && tab === 'Quote' && (
          <div className="stock-intel-section">
            <PiaWidgetShell title={hidden ? 'Workspace summary' : 'AI quote overview'} statusBadge={<PiaBadge variant="ai">PIA AI</PiaBadge>} density="compact">
              <p>{hidden ? mask : overview.summary || 'Quote, position, and current market context for this symbol.'}</p>
            </PiaWidgetShell>
            <div className="stock-intel-facts">
              <article>
                <span>{hidden ? 'Signal' : 'Why moving'}</span>
                <p>{hidden ? mask : overview.why_moving || 'No live catalyst attached to the current scan.'}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Momentum state'}</span>
                <p>{hidden ? mask : overview.momentum_state || technical.momentum_state || 'Neutral momentum until live data updates.'}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Macro sensitivity'}</span>
                <p>{hidden ? mask : overview.macro_sensitivity || `${source.macro_sensitivity || 0}/100 sensitivity score`}</p>
              </article>
              <article>
                <span>{hidden ? 'Workspace' : 'Earnings proximity'}</span>
                <p>{hidden ? mask : overview.earnings_proximity || 'Next earnings placeholder is tracked in Company.'}</p>
              </article>
            </div>
          </div>
        )}

        {!loading && tab === 'Technical' && (
          <div className="stock-intel-section stock-intel-technical-layout">
            <PiaCard className="stock-intel-chart-card" title={hidden ? 'Workspace chart' : 'Institutional chart'} badge={<PiaBadge variant="info">Live</PiaBadge>}>
              <TradingViewChart ticker={symbol} hidden={hidden} />
            </PiaCard>
            <PiaCard className="stock-intel-tech-card" title={hidden ? 'Workspace plan' : 'Trade decision snapshot'} badge={<PiaBadge variant="ai">{hidden ? 'AI' : timeframe}</PiaBadge>}>
              <div className="stock-timeframe-tabs">
                {timeframes.map((item) => (
                  <button key={item} type="button" className={timeframe === item ? 'active' : ''} onClick={() => setTimeframe(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <ConfidenceMeter value={techPlan.confidence} hidden={hidden} />
              <div className="stock-trade-implication">
                <span>{hidden ? 'Decision' : 'Trade implication'}</span>
                <b>{hidden ? mask : techPlan.implication}</b>
              </div>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Trend', value: String(technical.trend || 'Neutral') },
                  { label: 'Strength', value: `${techPlan.strength}/100` },
                  { label: 'Conservative entry', value: money(techPlan.conservativeEntry) },
                  { label: 'Aggressive entry', value: money(techPlan.aggressiveEntry) },
                  { label: 'Invalidation', value: money(techPlan.invalidation) },
                  { label: 'Risk/reward', value: techPlan.riskReward },
                ]}
              />
            </PiaCard>
            <PiaCard className="stock-intel-tech-card" title={hidden ? 'Levels' : 'Support levels'}>
              <div className="stock-level-list">
                {techPlan.supportLevels.map((level, index) => (
                  <div key={`support-${index}`}>
                    <span>S{index + 1}</span>
                    <b>{hidden ? mask : money(level)}</b>
                    <small>{hidden ? mask : `${formatDistance(level, last)} from price`}</small>
                  </div>
                ))}
              </div>
            </PiaCard>
            <PiaCard className="stock-intel-tech-card" title={hidden ? 'Levels' : 'Resistance / take-profit zones'}>
              <div className="stock-level-list">
                {techPlan.takeProfitZones.map((level, index) => (
                  <div key={`target-${index}`}>
                    <span>{index === 0 ? `R${index + 1}` : `TP${index}`}</span>
                    <b>{hidden ? mask : money(level)}</b>
                    <small>{hidden ? mask : `${formatDistance(level, last)} from price`}</small>
                  </div>
                ))}
              </div>
            </PiaCard>
            <PiaCard className="stock-intel-tech-card" title={hidden ? 'AI summary' : 'AI interpretation summary'}>
              <p>{hidden ? mask : techPlan.aiSummary}</p>
              <MetricRow label={hidden ? 'Overview' : 'Day change'} value={Math.abs(Number(technical.day_change_pct || change || 0))} tone={change >= 0 ? 'green' : 'red'} hidden={hidden} />
              <MetricRow label={hidden ? 'Controls' : 'Risk score'} value={Number(source.risk || 0)} tone="red" hidden={hidden} />
            </PiaCard>
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

        {!loading && tab === 'Company' && (
          <div className="stock-company-hub">
            <PiaCard title={hidden ? 'About' : 'About'} badge={isPlaceholderCompany ? <PiaBadge variant="warning">Mock</PiaBadge> : <PiaBadge variant="info">Company</PiaBadge>}>
              <div className="stock-company-about">
                <Building2 size={20} />
                <p>{hidden ? mask : company.description || `${name} company profile placeholder until live fundamentals are connected.`}</p>
              </div>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Sector', value: company.sector || source.sector || 'Technology', placeholder: !company.sector && !source.sector },
                  { label: 'Industry', value: company.industry || source.industry || 'Application software / listed equity', placeholder: !company.industry && !source.industry },
                  { label: 'HQ', value: company.hq || 'Placeholder HQ', placeholder: !company.hq },
                  { label: 'CEO', value: company.ceo || 'Placeholder CEO', placeholder: !company.ceo },
                  { label: 'Employees', value: String(company.employees || 'Placeholder'), placeholder: !company.employees },
                  { label: 'Exchange', value: source.exchange || company.exchange || 'NASDAQ', placeholder: !source.exchange && !company.exchange },
                ]}
              />
            </PiaCard>
            <PiaCard title="Earnings" badge={<PiaBadge variant="neutral">{hidden ? 'Data' : 'Estimate vs actual'}</PiaBadge>}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'EPS estimate', value: String(fundamentals.eps_estimate || 'Placeholder'), placeholder: !fundamentals.eps_estimate },
                  { label: 'EPS actual', value: String(fundamentals.eps_actual || 'Placeholder'), placeholder: !fundamentals.eps_actual },
                  { label: 'Surprise', value: String(fundamentals.eps_surprise_pct || 'Placeholder %'), placeholder: !fundamentals.eps_surprise_pct },
                  { label: 'Next earnings', value: String(fundamentals.next_earnings || 'Placeholder date'), placeholder: !fundamentals.next_earnings },
                ]}
              />
            </PiaCard>
            <PiaCard title="Financials" badge={<BarChart3 size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Revenue', value: String(fundamentals.revenue || 'Placeholder'), placeholder: !fundamentals.revenue },
                  { label: 'Net income', value: String(fundamentals.net_income || 'Placeholder'), placeholder: !fundamentals.net_income },
                  { label: 'EBITDA', value: String(fundamentals.ebitda || 'Placeholder'), placeholder: !fundamentals.ebitda },
                  { label: 'Free cash flow', value: String(fundamentals.free_cash_flow || 'Placeholder'), placeholder: !fundamentals.free_cash_flow },
                  { label: 'Margins', value: String(fundamentals.margins || 'Placeholder'), placeholder: !fundamentals.margins },
                ]}
              />
            </PiaCard>
            <PiaCard title="Key Ratios" badge={<Gauge size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'PE', value: String(fundamentals.pe || 'Placeholder'), placeholder: !fundamentals.pe },
                  { label: 'Forward PE', value: String(fundamentals.forward_pe || 'Placeholder'), placeholder: !fundamentals.forward_pe },
                  { label: 'PEG', value: String(fundamentals.peg || 'Placeholder'), placeholder: !fundamentals.peg },
                  { label: 'EV/EBITDA', value: String(fundamentals.ev_ebitda || 'Placeholder'), placeholder: !fundamentals.ev_ebitda },
                  { label: 'ROE', value: String(fundamentals.roe || 'Placeholder'), placeholder: !fundamentals.roe },
                  { label: 'Debt/Equity', value: String(fundamentals.debt_equity || 'Placeholder'), placeholder: !fundamentals.debt_equity },
                  { label: 'FCF Yield', value: String(fundamentals.fcf_yield || 'Placeholder'), placeholder: !fundamentals.fcf_yield },
                ]}
              />
            </PiaCard>
            <PiaCard title="Targets" badge={<Target size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Consensus', value: String(targets.consensus || 'Mock consensus'), placeholder: !targets.consensus },
                  { label: 'Bull', value: String(targets.bull || 'Mock bull case'), placeholder: !targets.bull },
                  { label: 'Base', value: String(targets.base || 'Mock base case'), placeholder: !targets.base },
                  { label: 'Bear', value: String(targets.bear || 'Mock bear case'), placeholder: !targets.bear },
                  { label: 'Upside/downside', value: String(targets.upside_downside || 'Mock range'), placeholder: !targets.upside_downside },
                ]}
              />
              <p className="muted">{hidden ? mask : 'Targets are marked mock/placeholder until analyst target data is connected.'}</p>
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Videos' && <TickerVideosList ticker={symbol} companyName={name} hidden={hidden} />}
      </div>
    </div>
  )
}
