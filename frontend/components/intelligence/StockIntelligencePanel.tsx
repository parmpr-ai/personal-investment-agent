'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, BarChart3, Bell, Gauge, MoreVertical, Star, Target } from 'lucide-react'
import { PiaBadge, PiaCard, PiaTabs } from '../ui-v3'
import { mask, money, pct } from '../../lib/pia-api'
import TickerNewsList from './TickerNewsList'
import { PRIVATE_TAB_LABELS, STOCK_PANEL_TABS, type StockPanelTab } from './panelRegistry'
import StockAiIntelligenceWidget from './StockAiIntelligenceWidget'
import StockKeyMetrics from './StockKeyMetrics'
import StockPositionSummary from './StockPositionSummary'
import { useStockIntelligence } from './useStockIntelligence'

let lastActiveStockPanelTab: StockPanelTab = 'Overview'
const timeframes = ['Intraday', 'Swing', 'Position'] as const
type Timeframe = (typeof timeframes)[number]
const FINANCIAL_UNAVAILABLE = 'Financial data unavailable'
const TARGET_UNAVAILABLE = 'Analyst target data unavailable'
const INITIAL_TAB_ALIASES: Record<string, StockPanelTab> = {
  overview: 'Overview',
  quote: 'Overview',
  chart: 'Chart',
  technical: 'Chart',
  news: 'News',
  financials: 'Financials',
  analysis: 'Analysis',
  ai: 'Analysis',
  'ai coach': 'Analysis',
  options: 'Options',
}
const LOGO_URLS: Record<string, string> = {
  AAPL: 'https://companiesmarketcap.com/img/company-logos/64/AAPL.png',
  AMD: 'https://companiesmarketcap.com/img/company-logos/64/AMD.png',
  GOOG: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.png',
  GOOGL: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.png',
  META: 'https://companiesmarketcap.com/img/company-logos/64/META.png',
  MSFT: 'https://companiesmarketcap.com/img/company-logos/64/MSFT.png',
  NVDA: 'https://companiesmarketcap.com/img/company-logos/64/NVDA.png',
  SOFI: 'https://companiesmarketcap.com/img/company-logos/64/SOFI.png',
  TSLA: 'https://companiesmarketcap.com/img/company-logos/64/TSLA.png',
  TSM: 'https://companiesmarketcap.com/img/company-logos/64/TSM.png',
}
const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple',
  AMD: 'Advanced Micro Devices',
  GOOG: 'Alphabet',
  GOOGL: 'Alphabet',
  META: 'Meta Platforms',
  MSFT: 'Microsoft',
  NVDA: 'NVIDIA',
  SOFI: 'SoFi Technologies',
  TSLA: 'Tesla',
  TSM: 'Taiwan Semiconductor',
}
const EMPTY = '—'

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

// Position Intelligence V2 — decision-support panel built only from existing
// backend/position values. Unavailable values are omitted; no fake data.
function PositionIntelligence({ source, last, hidden }: { source: any; last: number; hidden: boolean }) {
  const shares = Number(source.quantity ?? source.qty ?? 0)
  if (!(shares > 0)) {
    return (
      <PiaCard className="stock-intel-position" title={hidden ? 'Workspace' : 'Your Position'}>
        <p className="sip-empty">No position currently held.</p>
      </PiaCard>
    )
  }
  const avgCost = Number(source.avg_price ?? source.avgCost ?? source.avg_cost ?? 0)
  const marketValue = Number(source.market_value ?? (last && shares ? last * shares : 0))
  const costBasis = Number(source.cost_basis ?? (avgCost && shares ? avgCost * shares : 0))
  const portfolioPct = source.portfolio_pct
  const assetClass = source.sec_type ?? source.asset_class ?? source.sectype
  const sector = source.sector ?? source.industry
  const dayPnl = source.day_pnl ?? source.day_change
  const unrealized = source.unrealized
  const unrealizedPct = source.unrealized_pct
  const realized = source.realized ?? source.realized_pnl
  const risk = source.risk
  const momentum = source.momentum_score ?? source.momentum
  const newsScore = source.news_score ?? source.news_count ?? source.news
  const macro = source.macro_sensitivity

  const has = (v: unknown) => v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
  const signedMoney = (v: number) => `${v >= 0 ? '+' : ''}${money(v)}`
  const signedPct = (v: number) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`

  // AI-style summary from existing values only; omit statements without data.
  const lines: string[] = [`You own ${shares.toLocaleString('en-US')} shares.`]
  if (has(portfolioPct)) lines.push(`Position size is ${Number(portfolioPct).toFixed(1)}% of the portfolio.`)
  if (avgCost > 0) lines.push(`Average cost is ${money(avgCost)}.`)
  if (has(unrealized)) lines.push(`Position is ${Number(unrealized) >= 0 ? 'currently profitable' : 'currently at a loss'}${has(unrealizedPct) ? ` (${signedPct(Number(unrealizedPct))})` : ''}.`)
  if (has(momentum)) lines.push(`Momentum is ${Number(momentum) >= 60 ? 'positive' : Number(momentum) >= 40 ? 'neutral' : 'soft'}.`)

  return (
    <PiaCard
      className="stock-intel-position"
      title={hidden ? 'Workspace' : 'Your Position'}
      badge={has(unrealized) && !hidden ? <PiaBadge variant={Number(unrealized) >= 0 ? 'bullish' : 'bearish'} size="compact">{signedMoney(Number(unrealized))} P/L</PiaBadge> : undefined}
    >
      <div className="sip-grid">
        <div className="sip-cell"><span>Shares</span><b>{hidden ? mask : shares.toLocaleString('en-US')}</b></div>
        {avgCost > 0 && <div className="sip-cell"><span>Avg Cost</span><b>{hidden ? mask : money(avgCost)}</b></div>}
        {costBasis > 0 && <div className="sip-cell"><span>Cost Basis</span><b>{hidden ? mask : money(costBasis)}</b></div>}
        {marketValue > 0 && <div className="sip-cell"><span>Market Value</span><b>{hidden ? mask : money(marketValue)}</b></div>}
        {has(portfolioPct) && <div className="sip-cell"><span>Portfolio %</span><b>{hidden ? mask : `${Number(portfolioPct).toFixed(1)}%`}</b></div>}
        {has(assetClass) && <div className="sip-cell"><span>Asset Class</span><b>{String(assetClass)}</b></div>}
        {has(sector) && <div className="sip-cell"><span>Sector</span><b>{String(sector)}</b></div>}
      </div>

      {(has(dayPnl) || has(unrealized) || has(realized)) && (
        <>
          <div className="sip-subhead">Performance</div>
          <div className="sip-grid">
            {has(dayPnl) && <div className="sip-cell"><span>Today&apos;s P&amp;L</span><b className={Number(dayPnl) >= 0 ? 'green' : 'red'}>{hidden ? mask : signedMoney(Number(dayPnl))}</b></div>}
            {has(unrealized) && <div className="sip-cell"><span>Unrealized P&amp;L</span><b className={Number(unrealized) >= 0 ? 'green' : 'red'}>{hidden ? mask : signedMoney(Number(unrealized))}</b></div>}
            {has(unrealizedPct) && <div className="sip-cell"><span>Unrealized %</span><b className={Number(unrealizedPct) >= 0 ? 'green' : 'red'}>{hidden ? mask : signedPct(Number(unrealizedPct))}</b></div>}
            {has(realized) && <div className="sip-cell"><span>Realized P&amp;L</span><b className={Number(realized) >= 0 ? 'green' : 'red'}>{hidden ? mask : signedMoney(Number(realized))}</b></div>}
          </div>
        </>
      )}

      {(has(risk) || has(momentum) || has(newsScore) || has(macro)) && (
        <>
          <div className="sip-subhead">Intelligence</div>
          <div className="sip-grid sip-intel">
            {has(risk) && <div className="sip-cell"><span>Risk</span><b>{Number(risk)}</b></div>}
            {has(momentum) && <div className="sip-cell"><span>Momentum</span><b>{Number(momentum)}</b></div>}
            {has(newsScore) && <div className="sip-cell"><span>News Score</span><b>{Number(newsScore)}</b></div>}
            {has(macro) && <div className="sip-cell"><span>Macro Sensitivity</span><b>{Number(macro)}</b></div>}
          </div>
        </>
      )}

      {!hidden && (
        <div className="sip-summary">
          {lines.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </PiaCard>
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

function hasDisplayValue(value: unknown) {
  return value != null && value !== '' && !(typeof value === 'number' && Number.isNaN(value))
}

function financialText(value: unknown) {
  return hasDisplayValue(value) ? String(value) : FINANCIAL_UNAVAILABLE
}

function targetText(value: unknown) {
  return hasDisplayValue(value) ? String(value) : TARGET_UNAVAILABLE
}

function textOrDash(value: unknown) {
  return value == null || value === '' ? EMPTY : String(value)
}

function resolveInitialTab(value: unknown): StockPanelTab | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  if (!key) return null
  return STOCK_PANEL_TABS.find((item) => item.toLowerCase() === key) || INITIAL_TAB_ALIASES[key] || null
}

function initialTabFromSeed(seedPosition?: Record<string, unknown> | null): StockPanelTab | null {
  return resolveInitialTab(seedPosition?.initialTab ?? seedPosition?.initial_tab)
}

function logoUrlFor(source: any, symbol: string) {
  const direct = source?.logo_url || source?.logoUrl || source?.company?.logo_url || source?.company?.logoUrl
  if (typeof direct === 'string' && /^https?:\/\//i.test(direct)) return direct
  return LOGO_URLS[String(symbol || '').toUpperCase()]
}

function CompanyLogoMark({ source, symbol, hidden }: { source: any; symbol: string; hidden: boolean }) {
  const logoUrl = hidden ? '' : logoUrlFor(source, symbol)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [logoUrl])

  if (logoUrl && !failed) {
    return (
      <div className="stock-intel-symbol-mark has-logo" aria-hidden="true">
        <img src={logoUrl} alt="" onError={() => setFailed(true)} />
      </div>
    )
  }

  return (
    <div className="stock-intel-symbol-mark" aria-hidden="true">
      {hidden ? '*' : symbol.slice(0, 2)}
    </div>
  )
}

function sparkPoints(values: unknown, width = 120, height = 46) {
  const rows = Array.isArray(values)
    ? values.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : []
  if (rows.length < 2) return ''
  const min = Math.min(...rows)
  const max = Math.max(...rows)
  const spread = max - min || 1
  return rows.map((value, index) => {
    const x = (index / Math.max(rows.length - 1, 1)) * width
    const y = height - 4 - ((value - min) / spread) * (height - 8)
    return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`
  }).join(' ')
}

function MiniSpark({ source, hidden }: { source: any; hidden: boolean }) {
  const points = sparkPoints(source.spark || source.sparkline || source.chart)
  if (hidden) return <span className="stock-intel-spark-empty">{mask}</span>
  if (!points) return <span className="stock-intel-spark-empty">Chart data unavailable</span>
  return (
    <svg viewBox="0 0 120 46" focusable="false">
      <polyline points={points} />
    </svg>
  )
}

function RecentNewsPreview({ items, hidden }: { items: any[]; hidden: boolean }) {
  const rows = items.slice(0, 3)
  if (!rows.length) return <p className="muted">Live news provider unavailable for this symbol right now.</p>
  return (
    <div className="stock-overview-news-list">
      {rows.map((item: any, index: number) => {
        const title = hidden ? mask : String(item.title || 'Untitled headline')
        const source = hidden ? 'Source' : String(item.source || 'PIA')
        const url = String(item.source_url || '').trim()
        return (
          <article key={`${item.id || index}-${item.title || index}`}>
            <span>{source}</span>
            {hidden || !url ? <b>{title}</b> : <a href={url} target="_blank" rel="noreferrer">{title}</a>}
          </article>
        )
      })}
    </div>
  )
}

export default function StockIntelligencePanel({
  ticker,
  seedPosition,
  dashboard,
  hidden,
  onHiddenChange,
  onClose,
  variant,
}: {
  ticker: string
  seedPosition?: Record<string, unknown> | null
  dashboard?: any
  hidden: boolean
  onHiddenChange?: (hidden: boolean) => void
  onClose: () => void
  variant: 'desktop' | 'mobile'
}) {
  const requestedInitialTab = initialTabFromSeed(seedPosition)
  const [tab, setTab] = useState<StockPanelTab>(() => requestedInitialTab || (STOCK_PANEL_TABS.includes(lastActiveStockPanelTab) ? lastActiveStockPanelTab : 'Overview'))
  const [timeframe, setTimeframe] = useState<Timeframe>('Swing')
  const { loading, source, position, intelligence, newsIntelligence } = useStockIntelligence(ticker, seedPosition, dashboard)

  useEffect(() => {
    const nextTab = initialTabFromSeed(seedPosition)
    if (nextTab) setTab(nextTab)
  }, [seedPosition?.initialTab, seedPosition?.initial_tab, ticker])

  const symbol = String(ticker || '').split(' ')[0]
  const company = { ...(source.company || {}), ...(intelligence?.company || {}) }
  const fundamentals = { ...(source.fundamentals || {}), ...(intelligence?.fundamentals || {}) }
  const targets = { ...(source.targets || {}), ...(intelligence?.targets || {}) }
  const name = String(source.name || company.name || seedPosition?.name || COMPANY_NAMES[symbol.toUpperCase()] || 'Position')
  const last = Number(fundamentals.last || fundamentals.price || fundamentals.regularMarketPrice || source.last || source.price || source.regularMarketPrice || seedPosition?.last || 0)
  const change = Number(source.day_change_pct || source.change_pct || source.change || 0)
  const unrealized = Number(source.unrealized || 0)
  const overview = intelligence?.overview || {}
  const technical = intelligence?.technical || {}
  const techPlan = buildTechnicalPlan(technical, source, last || 100, timeframe)

  const tabLabel = (value: StockPanelTab) => (hidden ? PRIVATE_TAB_LABELS[value] : value)
  const handleTabChange = (value: StockPanelTab) => {
    lastActiveStockPanelTab = value
    setTab(value)
  }

  return (
    <div className={`stock-intel-panel ${variant === 'mobile' ? 'stock-intel-panel-mobile' : 'stock-intel-panel-desktop'}`.trim()}>
      <section className="stock-intel-hero-card" aria-label="Stock header and key metrics">
        <header className="stock-intel-header">
          <button type="button" className="stock-intel-close" onClick={onClose} aria-label="Close intelligence panel">
            <ArrowLeft size={variant === 'mobile' ? 22 : 18} />
          </button>
          <div className="stock-intel-title-block">
            <div className="stock-intel-identity">
              <CompanyLogoMark source={{ ...source, company }} symbol={symbol} hidden={hidden} />
              <div className="stock-intel-name-block">
                <div className="stock-intel-name-row">
                  <h2>{hidden ? mask : symbol}</h2>
                  <button type="button" className="stock-intel-inline-action" aria-label={hidden ? 'Monitor' : 'Watch'} disabled title="Planned">
                    <Star size={18} />
                  </button>
                </div>
                <span className="stock-intel-kicker">{hidden ? 'Workspace' : `${name} - ${source.exchange || 'NASDAQ'} - ${source.asset_type || 'Stock'}`}</span>
              </div>
            </div>
          </div>
          <div className="stock-intel-header-actions" aria-label="Stock actions">
            <button type="button" className="stock-intel-icon-action" aria-label={hidden ? 'Alerts' : 'Set alert'} disabled title="Planned">
              <Bell size={18} />
            </button>
            <button type="button" className="stock-intel-icon-action" aria-label="More stock actions" disabled title="Planned">
              <MoreVertical size={18} />
            </button>
          </div>
        </header>

        <div className="stock-intel-market-line">
          <div className="stock-intel-price-block">
            <div className="stock-intel-price-row">
              <strong>{hidden ? mask : money(last)}</strong>
              <span>{hidden ? 'USD' : source.currency || fundamentals.currency || 'USD'}</span>
              <small className={change >= 0 ? 'green' : 'red'}>{hidden ? mask : `${change >= 0 ? '+' : ''}${pct(change)}`}</small>
              {position ? (
                <PiaBadge variant={unrealized >= 0 ? 'bullish' : 'bearish'} size="compact">
                  {hidden ? mask : `${unrealized >= 0 ? '+' : ''}${money(unrealized)} P/L`}
                </PiaBadge>
              ) : null}
            </div>
            <div className="stock-intel-session-line">
              <span>{hidden ? 'Market' : source.market_status || 'Market Open'}</span>
              <span>{hidden ? 'Session' : source.session_note || 'Closes in 1h 18m'}</span>
            </div>
          </div>
          <div className="stock-intel-mini-spark" aria-hidden="true">
            <MiniSpark source={{ ...source, ...fundamentals }} hidden={hidden} />
          </div>
        </div>

        <StockKeyMetrics source={{ ...source, fundamentals, company }} hidden={hidden} ticker={symbol} />
      </section>

      <PiaTabs
        className="stock-intel-tabs"
        ariaLabel="Stock intelligence tabs"
        activeId={tab}
        onChange={(value) => handleTabChange(value as StockPanelTab)}
        tabs={STOCK_PANEL_TABS.map((item) => ({ id: item, label: tabLabel(item) }))}
      />

      <div className="stock-intel-body">
        {loading ? <p className="muted">Loading intelligence workspace...</p> : null}

        {!loading && tab === 'Overview' && (
          <div className="stock-intel-section stock-overview-v2">
            {position ? <StockPositionSummary source={{ ...source, ...position }} hidden={hidden} /> : null}

            <PiaCard className="stock-intel-chart-card" title={hidden ? 'Workspace chart' : 'Price Chart'}>
              <TradingViewChart ticker={symbol} hidden={hidden} />
            </PiaCard>

            <StockAiIntelligenceWidget source={source} overview={overview} technical={technical} targets={targets} hidden={hidden} />

            <PiaCard title={hidden ? 'Updates' : 'Recent News'}>
              <RecentNewsPreview items={newsIntelligence.items || []} hidden={hidden} />
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Chart' && (
          <div className="stock-intel-section">
            <PiaCard className="stock-intel-chart-card" title={hidden ? 'Workspace chart' : 'Price Chart'}>
              <TradingViewChart ticker={symbol} hidden={hidden} />
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Analysis' && (
          <div className="stock-intel-section stock-intel-technical-layout">
            <PiaCard className="stock-intel-tech-card" title={hidden ? 'Workspace plan' : 'Trade Decision Snapshot'} badge={<PiaBadge variant="ai">{hidden ? 'AI' : timeframe}</PiaBadge>}>
              <div className="stock-timeframe-tabs">
                {timeframes.map((item) => (
                  <button key={item} type="button" className={timeframe === item ? 'active' : ''} onClick={() => setTimeframe(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Bias', value: textOrDash(technical.trend || 'Neutral') },
                  { label: 'Confidence', value: `${techPlan.confidence}` },
                  { label: 'Entry', value: `${money(techPlan.conservativeEntry)} - ${money(techPlan.aggressiveEntry)}` },
                  { label: 'Invalid', value: money(techPlan.invalidation) },
                  { label: 'TP', value: techPlan.takeProfitZones.slice(0, 2).map((level) => money(level)).join(' / ') },
                  { label: 'R/R', value: techPlan.riskReward },
                ]}
              />
              <p>{hidden ? mask : techPlan.implication}</p>
            </PiaCard>

            <PiaCard className="stock-intel-tech-card" title={hidden ? 'Workspace' : 'Technical Summary'}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Trend', value: String(technical.trend || 'Neutral') },
                  { label: 'Strength', value: `${techPlan.strength}` },
                  { label: 'Support', value: technical.support ? money(Number(technical.support)) : EMPTY },
                  { label: 'Resistance', value: technical.resistance ? money(Number(technical.resistance)) : EMPTY },
                  { label: 'Macro', value: textOrDash(overview.macro_sensitivity) },
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

        {!loading && tab === 'Financials' && (
          <div className="stock-company-hub">
            <PiaCard title="Earnings" badge={<PiaBadge variant="neutral">{hidden ? 'Data' : 'Estimate vs actual'}</PiaBadge>}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'EPS estimate', value: financialText(fundamentals.eps_estimate), placeholder: !hasDisplayValue(fundamentals.eps_estimate) },
                  { label: 'EPS actual', value: financialText(fundamentals.eps_actual), placeholder: !hasDisplayValue(fundamentals.eps_actual) },
                  { label: 'Surprise', value: financialText(fundamentals.eps_surprise_pct), placeholder: !hasDisplayValue(fundamentals.eps_surprise_pct) },
                  { label: 'Next earnings', value: financialText(fundamentals.next_earnings), placeholder: !hasDisplayValue(fundamentals.next_earnings) },
                ]}
              />
            </PiaCard>
            <PiaCard title="Financials" badge={<BarChart3 size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Revenue', value: financialText(fundamentals.revenue), placeholder: !hasDisplayValue(fundamentals.revenue) },
                  { label: 'Net income', value: financialText(fundamentals.net_income), placeholder: !hasDisplayValue(fundamentals.net_income) },
                  { label: 'EBITDA', value: financialText(fundamentals.ebitda), placeholder: !hasDisplayValue(fundamentals.ebitda) },
                  { label: 'Free cash flow', value: financialText(fundamentals.free_cash_flow), placeholder: !hasDisplayValue(fundamentals.free_cash_flow) },
                  { label: 'Margins', value: financialText(fundamentals.margins), placeholder: !hasDisplayValue(fundamentals.margins) },
                ]}
              />
            </PiaCard>
            <PiaCard title="Key Ratios" badge={<Gauge size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'PE', value: financialText(fundamentals.pe), placeholder: !hasDisplayValue(fundamentals.pe) },
                  { label: 'Forward PE', value: financialText(fundamentals.forward_pe), placeholder: !hasDisplayValue(fundamentals.forward_pe) },
                  { label: 'PEG', value: financialText(fundamentals.peg), placeholder: !hasDisplayValue(fundamentals.peg) },
                  { label: 'EV/EBITDA', value: financialText(fundamentals.ev_ebitda), placeholder: !hasDisplayValue(fundamentals.ev_ebitda) },
                  { label: 'ROE', value: financialText(fundamentals.roe), placeholder: !hasDisplayValue(fundamentals.roe) },
                  { label: 'Debt/Equity', value: financialText(fundamentals.debt_equity), placeholder: !hasDisplayValue(fundamentals.debt_equity) },
                  { label: 'FCF Yield', value: financialText(fundamentals.fcf_yield), placeholder: !hasDisplayValue(fundamentals.fcf_yield) },
                ]}
              />
            </PiaCard>
            <PiaCard title="Targets" badge={<Target size={16} />}>
              <DetailGrid
                hidden={hidden}
                rows={[
                  { label: 'Consensus', value: targetText(targets.consensus), placeholder: !hasDisplayValue(targets.consensus) },
                  { label: 'Bull', value: targetText(targets.bull), placeholder: !hasDisplayValue(targets.bull) },
                  { label: 'Base', value: targetText(targets.base), placeholder: !hasDisplayValue(targets.base) },
                  { label: 'Bear', value: targetText(targets.bear), placeholder: !hasDisplayValue(targets.bear) },
                  { label: 'Upside/downside', value: targetText(targets.upside_downside), placeholder: !hasDisplayValue(targets.upside_downside) },
                ]}
              />
              <p className="muted">{hidden ? mask : 'Analyst target data unavailable from the current provider.'}</p>
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Options' && (
          <div className="stock-intel-section">
            <PiaCard title={hidden ? 'Options' : 'Options'} badge={<PiaBadge variant="warning">Pending</PiaBadge>}>
              <p className="muted">{hidden ? mask : 'Options chain data gathering in progress.'}</p>
            </PiaCard>
          </div>
        )}
      </div>
    </div>
  )
}
