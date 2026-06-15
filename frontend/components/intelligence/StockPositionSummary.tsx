'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { CalendarDays, GripVertical, Info, MessageSquare, MoreHorizontal, ShieldAlert, TrendingUp, X } from 'lucide-react'
import { mask, money } from '../../lib/pia-api'

const EMPTY = '-'
const STORAGE_KEY = 'pia.positionSummary.mobile.v1'

type MetricKey =
  | 'marketValue'
  | 'pnl'
  | 'pnlPct'
  | 'portfolioPct'
  | 'shares'
  | 'avgCost'
  | 'costBasis'
  | 'todayPnl'
  | 'realizedPnl'
  | 'unrealizedPnl'

type Tone = 'positive' | 'negative' | 'neutral' | 'accent'
type MetricValue = { label: string; value: string; sub?: string; tone: Tone; subTone?: Tone }
type Prefs = { order: MetricKey[]; hidden: MetricKey[] }
type Insight = { icon: 'trend' | 'sentiment' | 'risk'; text: string }
type NewsItem = { headline: string; time: string }
type PositionSummaryData = {
  metrics: Record<MetricKey, MetricValue>
  weekPct: number
  weekPnl: number
  journey: number[]
  insights: Insight[]
  news: NewsItem[]
}

const DEFAULT_ORDER: MetricKey[] = [
  'marketValue',
  'pnl',
  'pnlPct',
  'portfolioPct',
  'shares',
  'avgCost',
  'costBasis',
  'todayPnl',
  'realizedPnl',
  'unrealizedPnl',
]

const DEFAULT_PREFS: Prefs = { order: DEFAULT_ORDER, hidden: [] }

const METRIC_LABELS: Record<MetricKey, { compact: string; customize: string }> = {
  marketValue: { compact: 'MV', customize: 'Market Value (MV)' },
  pnl: { compact: 'P&L', customize: 'P&L (Value)' },
  pnlPct: { compact: 'P&L %', customize: 'P&L %' },
  portfolioPct: { compact: 'Portfolio %', customize: 'Portfolio %' },
  shares: { compact: 'Shares', customize: 'Shares' },
  avgCost: { compact: 'Avg Cost', customize: 'Avg Cost' },
  costBasis: { compact: 'Cost Basis', customize: 'Cost Basis' },
  todayPnl: { compact: "Today's P&L", customize: "Today's P&L" },
  realizedPnl: { compact: 'Realized P&L', customize: 'Realized P&L' },
  unrealizedPnl: { compact: 'Unrealized P&L', customize: 'Unrealized P&L' },
}

function hasValue(value: unknown) {
  return value != null && value !== '' && !(typeof value === 'number' && Number.isNaN(value))
}

function numberValue(value: unknown): number | null {
  if (!hasValue(value)) return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = numberValue(value)
    if (parsed != null) return parsed
  }
  return null
}

function hasPositionSummaryData(source: any) {
  const shares = firstNumber(source.quantity, source.qty, source.shares)
  if (shares != null && Math.abs(shares) > 0) return true
  const marketValue = firstNumber(source.market_value, source.mktvalue)
  const costBasis = firstNumber(source.cost_basis)
  return Boolean(source.manual) || Boolean((marketValue != null && Math.abs(marketValue) > 0) || (costBasis != null && Math.abs(costBasis) > 0))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function toneFrom(value: number | null | undefined): Tone {
  if (value == null || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'negative'
}

function sign(value: number) {
  return value > 0 ? '+' : value < 0 ? '-' : ''
}

function compactSuffix(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1000000000) return `${(abs / 1000000000).toFixed(2)}B`
  if (abs >= 1000000) return `${(abs / 1000000).toFixed(2)}M`
  if (abs >= 1000) return `${(abs / 1000).toFixed(2)}K`
  return abs.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatMoney(value: number | null, hidden: boolean, signed = false, compact = false) {
  if (hidden) return mask
  if (value == null) return EMPTY
  const prefix = signed ? sign(value) : value < 0 ? '-' : ''
  const abs = Math.abs(value)
  return `${prefix}${compact && abs >= 1000 ? `$${compactSuffix(abs)}` : money(abs)}`
}

function formatNumber(value: number | null, hidden: boolean) {
  if (hidden) return mask
  if (value == null) return EMPTY
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function formatPct(value: number | null, hidden: boolean, signed = false) {
  if (hidden) return mask
  if (value == null) return EMPTY
  const prefix = signed ? sign(value) : value < 0 ? '-' : ''
  return `${prefix}${Math.abs(value).toFixed(2)}%`
}

function formatMove(value: number | null, hidden: boolean) {
  if (hidden) return mask
  if (value == null) return ''
  if (value === 0) return '0.00%'
  return `${value > 0 ? '↑' : '↓'} ${Math.abs(value).toFixed(2)}%`
}

function normalizePrefs(value: Partial<Prefs> | null | undefined): Prefs {
  const sourceOrder = Array.isArray(value?.order) ? value!.order : []
  const sourceHidden = Array.isArray(value?.hidden) ? value!.hidden : []
  const order = [...sourceOrder.filter((key): key is MetricKey => DEFAULT_ORDER.includes(key as MetricKey))]
  for (const key of DEFAULT_ORDER) {
    if (!order.includes(key)) order.push(key)
  }
  const hidden = sourceHidden.filter((key): key is MetricKey => DEFAULT_ORDER.includes(key as MetricKey))
  return { order, hidden: [...new Set(hidden)] }
}

function readPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try {
    return normalizePrefs(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null'))
  } catch {
    return DEFAULT_PREFS
  }
}

function buildJourney(marketValue: number, weekPct: number) {
  const base = marketValue || 1
  const start = base / (1 + weekPct / 100)
  const points: number[] = []
  for (let i = 0; i < 42; i += 1) {
    const t = i / 41
    const wobble = Math.sin(t * Math.PI * 5.5) * base * 0.006 + Math.sin(t * Math.PI * 13) * base * 0.003
    const dip = -Math.exp(-Math.pow((t - 0.28) / 0.13, 2)) * base * 0.018
    const lift = Math.exp(-Math.pow((t - 0.76) / 0.18, 2)) * base * 0.011
    points.push(start + (base - start) * t + wobble + dip + lift)
  }
  points[points.length - 1] = base
  return points
}

function buildInsights(weekPct: number, pnl: number | null, healthScore: number): Insight[] {
  const ins1 = weekPct > 1.5
    ? 'Strong upward momentum with increasing volume.'
    : weekPct > 0
    ? 'Moderate upward momentum this week.'
    : weekPct < -1.5
    ? 'Downward momentum - position under pressure.'
    : 'Price action is consolidating this week.'
  const ins2 = pnl != null && pnl > 0
    ? 'Positive sentiment and news catalysts.'
    : pnl != null && pnl < 0
    ? 'Negative sentiment may be weighing on position.'
    : 'Sentiment remains neutral on this position.'
  const ins3 = healthScore >= 75
    ? 'Risk level is low - position in good health.'
    : healthScore >= 55
    ? 'Risk level is moderate - monitor volatility.'
    : 'Risk level is elevated - consider position sizing.'
  return [
    { icon: 'trend', text: ins1 },
    { icon: 'sentiment', text: ins2 },
    { icon: 'risk', text: ins3 },
  ]
}

function buildSummaryData(source: any, hidden: boolean): PositionSummaryData {
  const shares = firstNumber(source.quantity, source.qty, source.shares)
  const avgCost = firstNumber(source.avg_price, source.avg_cost, source.avgCost)
  const current = firstNumber(source.last, source.price, source.market_price, source.regularMarketPrice) || avgCost || 0
  const multiplier = String(source.sec_type || source.asset_type || '').toUpperCase() === 'OPT' ? 100 : 1
  const computedCost = avgCost != null && shares != null ? avgCost * shares * multiplier : null
  const costBasis = firstNumber(source.cost_basis, computedCost) || 0
  const computedMarket = shares != null && current ? shares * current * multiplier : null
  const marketValue = firstNumber(source.market_value, source.mktvalue, source.marketValue, computedMarket) || 0
  const unrealized = firstNumber(source.unrealized, source.unrealized_pnl, source.unrealizedPNL, marketValue && costBasis ? marketValue - costBasis : null)
  const realized = firstNumber(source.realized, source.realized_pnl, source.realizedPNL, 0)
  const dayPct = firstNumber(source.day_change_pct, source.change_pct, source.daily_change_pct)
  const dayPnl = firstNumber(source.day_pnl, source.day_change, source.daily_pnl, marketValue && dayPct != null ? (marketValue * dayPct) / 100 : null)
  const unrealizedPct = firstNumber(source.unrealized_pct, source.pnl_pct, costBasis ? ((unrealized || 0) / costBasis) * 100 : null)
  const realizedPct = firstNumber(source.realized_pct, realized != null && costBasis ? (realized / costBasis) * 100 : null)
  const pnl = firstNumber(source.pnl, source.total_pnl, source.totalPnl, unrealized)
  const pnlPct = firstNumber(source.pnl_pct, unrealizedPct)
  const portfolioPct = firstNumber(source.portfolio_pct, source.weight, source.allocation_pct)
  const weekPct = firstNumber(source.week_change_pct, source.week_pct, dayPct != null ? clamp(dayPct * 1.9, -9.5, 9.5) : pnlPct != null ? clamp(pnlPct / 10, -9.5, 9.5) : 0) || 0
  const weekPnl = marketValue ? (marketValue * weekPct) / 100 : 0
  const risk = firstNumber(source.risk, source.risk_score)
  const momentum = firstNumber(source.momentum_score, source.momentum)
  const healthScore = Math.round(clamp(72 + Math.max(0, pnlPct || 0) * 0.25 + Math.max(0, (momentum || 0) - 50) * 0.18 - Math.max(0, (risk || 0) - 75) * 0.25, 0, 100))

  const rawNews = source.news_catalysts || source.news_items || source.news || []
  const news: NewsItem[] = Array.isArray(rawNews)
    ? rawNews.slice(0, 3).map((n: any) => ({
        headline: String(n.headline || n.title || n.summary || n),
        time: String(n.time || n.published_at || n.published || ''),
      }))
    : []

  return {
    weekPct,
    weekPnl,
    journey: buildJourney(marketValue, weekPct),
    insights: buildInsights(weekPct, pnl, healthScore),
    news,
    metrics: {
      marketValue: { label: METRIC_LABELS.marketValue.compact, value: formatMoney(marketValue, hidden, false, true), sub: formatMove(dayPct, hidden), tone: 'neutral', subTone: toneFrom(dayPct) },
      pnl: { label: METRIC_LABELS.pnl.compact, value: formatMoney(pnl, hidden, true, true), sub: formatMove(pnlPct, hidden), tone: toneFrom(pnl), subTone: toneFrom(pnlPct) },
      pnlPct: { label: METRIC_LABELS.pnlPct.compact, value: formatPct(pnlPct, hidden, true), sub: formatMove(dayPct, hidden), tone: toneFrom(pnlPct), subTone: toneFrom(dayPct) },
      portfolioPct: { label: METRIC_LABELS.portfolioPct.compact, value: formatPct(portfolioPct, hidden), tone: 'accent' },
      shares: { label: METRIC_LABELS.shares.compact, value: formatNumber(shares, hidden), tone: 'neutral' },
      avgCost: { label: METRIC_LABELS.avgCost.compact, value: formatMoney(avgCost, hidden), tone: 'neutral' },
      costBasis: { label: METRIC_LABELS.costBasis.compact, value: formatMoney(costBasis, hidden, false, true), tone: 'neutral' },
      todayPnl: { label: METRIC_LABELS.todayPnl.compact, value: formatMoney(dayPnl, hidden, true), sub: formatMove(dayPct, hidden), tone: toneFrom(dayPnl), subTone: toneFrom(dayPct) },
      realizedPnl: { label: METRIC_LABELS.realizedPnl.compact, value: formatMoney(realized, hidden, true, true), sub: formatMove(realizedPct, hidden), tone: toneFrom(realized), subTone: toneFrom(realizedPct) },
      unrealizedPnl: { label: METRIC_LABELS.unrealizedPnl.compact, value: formatMoney(unrealized, hidden, true, true), sub: formatMove(unrealizedPct, hidden), tone: toneFrom(unrealized), subTone: toneFrom(unrealizedPct) },
    },
  }
}

function MetricCell({ metric }: { metric: MetricValue }) {
  return (
    <div className={`sps-metric ${metric.tone}`}>
      <span>{metric.label}</span>
      <b>{metric.value}</b>
      {metric.sub ? <small className={metric.subTone || 'neutral'}>{metric.sub}</small> : null}
    </div>
  )
}

function MetricRows({ keys, metrics, className = '' }: { keys: MetricKey[]; metrics: Record<MetricKey, MetricValue>; className?: string }) {
  const rows = [keys.slice(0, 4), keys.slice(4, 7), keys.slice(7, 10)].filter((row) => row.length > 0)
  return (
    <div className={`sps-metric-rows${className ? ` ${className}` : ''}`.trim()}>
      {rows.map((row, index) => (
        <div className={`sps-metric-row sps-metric-row-${row.length}`} key={`${index}-${row.join('-')}`}>
          {row.map((key) => <MetricCell key={key} metric={metrics[key]} />)}
        </div>
      ))}
    </div>
  )
}

function PositionJourneyChart({ points }: { points: number[] }) {
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = Math.max(1, max - min)
  const coords = points.map((value, index) => {
    const x = (index / Math.max(1, points.length - 1)) * 320
    const y = 132 - ((value - min) / range) * 104
    return { x, y, value }
  })
  const zero = points[0]
  const zeroY = 132 - ((zero - min) / range) * 104

  return (
    <div className="sps-chart">
      <svg viewBox="0 0 320 160" role="img" aria-label="One week position value evolution">
        <defs>
          <linearGradient id="spsGreenFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(36,209,140,.3)" />
            <stop offset="100%" stopColor="rgba(36,209,140,0)" />
          </linearGradient>
        </defs>
        <line x1="0" x2="320" y1={zeroY} y2={zeroY} className="sps-chart-zero" />
        <polygon points={`0,142 ${coords.map((point) => `${point.x},${point.y}`).join(' ')} 320,142`} className="sps-chart-fill" />
        {coords.slice(1).map((point, index) => {
          const prev = coords[index]
          const rising = point.value >= prev.value
          return (
            <line
              key={`${index}-${point.x}`}
              x1={prev.x}
              y1={prev.y}
              x2={point.x}
              y2={point.y}
              className={rising ? 'sps-chart-up' : 'sps-chart-down'}
            />
          )
        })}
      </svg>
      <div className="sps-chart-days" aria-hidden="true">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'TODAY'].map((day) => <span key={day}>{day}</span>)}
      </div>
    </div>
  )
}

function InsightIcon({ icon }: { icon: Insight['icon'] }) {
  if (icon === 'trend') return <TrendingUp size={15} />
  if (icon === 'sentiment') return <MessageSquare size={15} />
  return <ShieldAlert size={15} />
}

function DetailSheet({ data, hidden, keys, onClose }: { data: PositionSummaryData; hidden: boolean; keys: MetricKey[]; onClose: () => void }) {
  const weekTone = toneFrom(data.weekPnl)
  return (
    <div className="sps-detail-root" role="presentation">
      <button type="button" className="sps-sheet-overlay" aria-label="Close position summary details" onClick={onClose} />
      <section className="sps-detail-sheet" role="dialog" aria-modal="true" aria-label="Position Summary Details">
        <header className="sps-sheet-head">
          <h3>Position Summary</h3>
          <button type="button" className="sps-sheet-close" aria-label="Close position summary details" onClick={onClose}>
            <X size={24} />
          </button>
        </header>

        <MetricRows keys={keys} metrics={data.metrics} className="sps-detail-metrics" />

        <div className="sps-range-tabs" aria-label="Position value timeframe">
          {['1D', '1W', '1M', '3M', 'YTD', '1Y', 'ALL'].map((item) => (
            <button key={item} type="button" className={item === '1W' ? 'active' : ''} aria-pressed={item === '1W'}>
              {item}
            </button>
          ))}
          <button type="button" aria-label="Calendar">
            <CalendarDays size={17} />
          </button>
        </div>

        <section className="sps-evolution">
          <header>
            <h4>Performance (1W) <Info size={13} className="sps-info-icon" /></h4>
            <strong className={weekTone}>{formatPct(data.weekPct, hidden, true)}</strong>
          </header>
          <PositionJourneyChart points={data.journey} />
        </section>

        <div className="sps-bottom-grid">
          <section className="sps-key-insights">
            <h4>Key Insights</h4>
            {data.insights.map((ins, i) => (
              <div key={i} className={`sps-insight-item${i === 0 ? ' first' : ''}`}>
                <span className={`sps-insight-icon${ins.icon === 'risk' ? ' risk' : ''}`}>
                  <InsightIcon icon={ins.icon} />
                </span>
                <p>{ins.text}</p>
              </div>
            ))}
          </section>
          <section className="sps-news-catalysts">
            <h4>Top News / Catalysts</h4>
            {data.news.length > 0
              ? data.news.map((n, i) => (
                  <div key={i} className={`sps-news-item${i === 0 ? ' first' : ''}`}>
                    <p>{n.headline}</p>
                    {n.time ? <span>{n.time}</span> : null}
                  </div>
                ))
              : <p className="sps-news-empty">No recent news</p>}
          </section>
        </div>
      </section>
    </div>
  )
}

function CustomizeSheet({
  prefs,
  onChange,
  onReset,
  onClose,
}: {
  prefs: Prefs
  onChange: (next: Prefs) => void
  onReset: () => void
  onClose: () => void
}) {
  const hiddenSet = new Set(prefs.hidden)
  const [dragKey, setDragKey] = useState<MetricKey | null>(null)
  const dragRef = useRef<MetricKey | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  function toggle(key: MetricKey) {
    const nextHidden = new Set(prefs.hidden)
    if (nextHidden.has(key)) nextHidden.delete(key)
    else nextHidden.add(key)
    onChange({ order: prefs.order, hidden: [...nextHidden] })
  }

  function reorderTo(key: MetricKey, targetKey: MetricKey) {
    if (key === targetKey) return
    const next = [...prefs.order]
    const from = next.indexOf(key)
    const to = next.indexOf(targetKey)
    if (from < 0 || to < 0) return
    next.splice(from, 1)
    next.splice(to, 0, key)
    onChange({ order: next, hidden: prefs.hidden })
  }

  function onDown(event: PointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    event.preventDefault()
    const row = target.closest('[data-key]') as HTMLElement | null
    const key = row?.dataset.key as MetricKey | undefined
    if (!key || !DEFAULT_ORDER.includes(key)) return
    dragRef.current = key
    setDragKey(key)
    listRef.current?.setPointerCapture?.(event.pointerId)
  }

  function onMove(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    event.preventDefault()
    const rows = Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (event.clientY >= rect.top && event.clientY < rect.bottom) {
        const targetKey = row.dataset.key as MetricKey | undefined
        if (targetKey && targetKey !== dragRef.current) reorderTo(dragRef.current, targetKey)
        break
      }
    }
  }

  function onUp(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragKey(null)
    try {
      listRef.current?.releasePointerCapture?.(event.pointerId)
    } catch {}
  }

  return (
    <div className="sps-custom-root" role="presentation">
      <button type="button" className="sps-sheet-overlay" aria-label="Close position summary customization" onClick={onClose} />
      <section className="sps-custom-sheet" role="dialog" aria-modal="true" aria-label="Customize Position Summary">
        <header className="sps-custom-head">
          <button type="button" className="sps-custom-close" aria-label="Close customize" onClick={onClose}>
            <X size={24} />
          </button>
          <h3>Customize</h3>
          <button type="button" className="sps-custom-reset" onClick={onReset}>Reset</button>
        </header>
        <div className="sps-custom-subhead">
          <strong>Sort / Order</strong>
          <span>Drag to reorder</span>
        </div>
        <ul
          className={`sps-custom-list${dragKey ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {prefs.order.map((key) => {
            const on = !hiddenSet.has(key)
            return (
              <li className={`sps-custom-row${dragKey === key ? ' dragging' : ''}`} key={key} data-key={key}>
                <span>{METRIC_LABELS[key].customize}</span>
                <button type="button" className={`skm-edit-toggle${on ? ' on' : ''}`} aria-label={`${on ? 'Hide' : 'Show'} ${METRIC_LABELS[key].customize}`} aria-pressed={on} onClick={() => toggle(key)}>
                  <span />
                </button>
                <button type="button" className="stock-reorder-grip sps-custom-grip" data-grip aria-label={`Drag to reorder ${METRIC_LABELS[key].customize}`}>
                  <GripVertical size={22} />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="sps-custom-tip">
          <Info size={14} className="sps-tip-icon" />
          Tip: Changes are saved automatically
        </p>
      </section>
    </div>
  )
}

export default function StockPositionSummary({ source, hidden }: { source: any; hidden: boolean }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useEffect(() => {
    setPrefs(readPrefs())
  }, [])

  const data = useMemo(() => buildSummaryData(source, hidden), [source, hidden])
  const visibleKeys = prefs.order.filter((key) => !prefs.hidden.includes(key))

  if (!hasPositionSummaryData(source)) return null

  function commitPrefs(nextPrefs: Prefs) {
    const normalized = normalizePrefs(nextPrefs)
    setPrefs(normalized)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } catch {}
  }

  function resetPrefs() {
    commitPrefs(DEFAULT_PREFS)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    setDetailsOpen(true)
  }

  return (
    <>
      <section className="sps" aria-label="Position summary" role="button" tabIndex={0} onClick={() => setDetailsOpen(true)} onKeyDown={onKeyDown}>
        <header className="sps-head">
          <h3>Position Summary</h3>
          <button
            type="button"
            className="sps-menu"
            aria-label="Customize Position Summary"
            onClick={(event) => {
              event.stopPropagation()
              setCustomizeOpen(true)
            }}
          >
            <MoreHorizontal size={23} />
          </button>
        </header>
        <MetricRows keys={visibleKeys} metrics={data.metrics} />
      </section>

      {detailsOpen ? <DetailSheet data={data} hidden={hidden} keys={visibleKeys} onClose={() => setDetailsOpen(false)} /> : null}
      {customizeOpen ? <CustomizeSheet prefs={prefs} onChange={commitPrefs} onReset={resetPrefs} onClose={() => setCustomizeOpen(false)} /> : null}
    </>
  )
}
