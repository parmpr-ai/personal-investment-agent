'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, BarChart3, Bell, Gauge, Info, MoreVertical, Star, Target } from 'lucide-react'
import { PiaBadge, PiaCard, PiaTabs } from '../ui-v3'
import { mask, money, pct } from '../../lib/pia-api'
import TickerNewsList from './TickerNewsList'
import { PRIVATE_TAB_LABELS, STOCK_PANEL_TABS, type StockPanelTab } from './panelRegistry'
import StockAiIntelligenceWidget from './StockAiIntelligenceWidget'
import StockKeyMetrics from './StockKeyMetrics'
import StockPositionSummary from './StockPositionSummary'
import { useStockIntelligence } from './useStockIntelligence'
import CompanyLogo from './CompanyLogo'

let lastActiveStockPanelTab: StockPanelTab = 'Overview'
const timeframes = ['Intraday', 'Swing', 'Position'] as const
type Timeframe = (typeof timeframes)[number]
const ANALYSIS_SUB_TABS = [
  { id: 'analystTargets', label: 'Analyst Targets' },
  { id: 'aiAnalysis', label: 'AI Analysis' },
  { id: 'risks', label: 'Risks' },
  { id: 'valuation', label: 'Valuation' },
] as const
type AnalysisSubTab = (typeof ANALYSIS_SUB_TABS)[number]['id']
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

const marketPick = (source: any, keys: string[]) => {
  for (const key of keys) {
    const fundamentals = source?.fundamentals?.[key]
    if (fundamentals != null && fundamentals !== '') return fundamentals
    const company = source?.company?.[key]
    if (company != null && company !== '') return company
    const direct = source?.[key]
    if (direct != null && direct !== '') return direct
  }
  return undefined
}

function marketNumber(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function TodayRangeHero({ source, hidden }: { source: any; hidden: boolean }) {
  const low = marketNumber(marketPick(source, ['day_low', 'dayLow', 'regular_market_day_low', 'regularMarketDayLow', 'low']))
  const high = marketNumber(marketPick(source, ['day_high', 'dayHigh', 'regular_market_day_high', 'regularMarketDayHigh', 'high']))
  const current = marketNumber(marketPick(source, ['last', 'price', 'market_price', 'marketPrice', 'last_price', 'lastPrice', 'regularMarketPrice']))

  if (hidden) {
    return (
      <div className="stock-intel-today-range">
        <div className="stock-intel-range-head">
          <span>Today's Range</span>
        </div>
        <div className="stock-intel-range-row">
          <b>{mask}</b>
          <div className="stock-intel-hero-range-track" />
          <b>{mask}</b>
        </div>
      </div>
    )
  }

  if (low == null || high == null || high <= low) {
    return (
      <div className="stock-intel-today-range stock-intel-today-range-empty">
        <div className="stock-intel-range-head">
          <span>Today's Range</span>
        </div>
        <div className="stock-intel-range-row">
          <b>{EMPTY}</b>
          <div className="stock-intel-hero-range-track" />
          <b>{EMPTY}</b>
        </div>
      </div>
    )
  }

  const marker = Math.max(0, Math.min(100, (((current ?? low) - low) / (high - low)) * 100))
  return (
    <div className="stock-intel-today-range" aria-label={`Today range ${money(low)} to ${money(high)}`}>
      <div className="stock-intel-range-head">
        <span>Today's Range</span>
      </div>
      <div className="stock-intel-range-row">
        <b>{money(low)}</b>
        <div className="stock-intel-hero-range-track">
          <i className="stock-intel-range-marker" style={{ left: `${marker}%` }} aria-hidden="true" />
        </div>
        <b>{money(high)}</b>
      </div>
    </div>
  )
}

function strictNumber(value: unknown) {
  if (value == null || value === '') return null
  const cleaned = String(value).replace(/[^0-9.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function analystValue(source: any, keys: string[]) {
  const bundle = source?.analyst_targets || source?.analystTargets || source?.fundamentals?.analyst_targets || source?.fundamentals?.analystTargets || {}
  for (const key of keys) {
    const nested = bundle?.[key]
    if (nested != null && nested !== '') return nested
    const fundamentals = source?.fundamentals?.[key]
    if (fundamentals != null && fundamentals !== '') return fundamentals
    const direct = source?.[key]
    if (direct != null && direct !== '') return direct
  }
  return undefined
}

function analystDistributionValue(source: any, keys: string[]) {
  const bundle = source?.analyst_targets || source?.analystTargets || source?.fundamentals?.analyst_targets || source?.fundamentals?.analystTargets || {}
  const distribution = bundle?.rating_distribution || bundle?.ratingDistribution || source?.recommendationTrend || source?.fundamentals?.recommendationTrend || {}
  for (const key of keys) {
    const value = distribution?.[key] ?? bundle?.[key] ?? source?.fundamentals?.[key] ?? source?.[key]
    if (value != null && value !== '') return value
  }
  return undefined
}

function analystTargetsData(source: any) {
  const current = strictNumber(analystValue(source, ['current_price', 'currentPrice', 'last', 'price', 'regularMarketPrice']))
  const average = strictNumber(analystValue(source, ['average_target', 'averageTarget', 'targetMeanPrice', 'target_mean_price']))
  const low = strictNumber(analystValue(source, ['low_target', 'lowTarget', 'targetLowPrice', 'target_low_price']))
  const high = strictNumber(analystValue(source, ['high_target', 'highTarget', 'targetHighPrice', 'target_high_price']))
  const count = strictNumber(analystValue(source, ['analyst_count', 'analystCount', 'numberOfAnalystOpinions']))
  const recommendationMean = strictNumber(analystValue(source, ['recommendation_mean', 'recommendationMean']))
  const rawRating = analystValue(source, ['consensus_rating', 'consensusRating', 'recommendationKey', 'average_analyst_rating', 'averageAnalystRating'])
  const rating = rawRating ? titleCase(String(rawRating)) : recommendationMean != null ? `Mean ${recommendationMean.toFixed(1)}` : ''
  const strongBuy = strictNumber(analystDistributionValue(source, ['strong_buy', 'strongBuy', 'analyst_strong_buy_count']))
  const buyOnly = strictNumber(analystDistributionValue(source, ['buy_only', 'buyOnly', 'buy_raw', 'analyst_buy_only_count']))
  const buy = strictNumber(analystDistributionValue(source, ['buy', 'buy_count', 'buyCount', 'analyst_buy_count']))
  const hold = strictNumber(analystDistributionValue(source, ['hold', 'hold_count', 'holdCount', 'analyst_hold_count']))
  const sellOnly = strictNumber(analystDistributionValue(source, ['sell_only', 'sellOnly', 'sell_raw', 'analyst_sell_only_count']))
  const strongSell = strictNumber(analystDistributionValue(source, ['strong_sell', 'strongSell', 'analyst_strong_sell_count']))
  const sell = strictNumber(analystDistributionValue(source, ['sell', 'sell_count', 'sellCount', 'analyst_sell_count']))
  const upside = average != null && current ? ((average - current) / current) * 100 : strictNumber(analystValue(source, ['upside_downside_pct', 'upsideDownsidePct', 'analyst_upside_pct']))
  const difference = average != null && current != null ? average - current : null
  const hasData = [average, low, high, count, strongBuy, buyOnly, buy, hold, sellOnly, strongSell, sell].some((value) => value != null) || Boolean(rating)
  return { current, average, low, high, upside, difference, rating, count, strongBuy, buyOnly, buy, hold, sellOnly, strongSell, sell, hasData }
}

function analystDetailContainers(source: any) {
  const fundamentals = source?.fundamentals || {}
  const intelligence = source?.intelligence || {}
  return [
    source?.analyst_targets,
    source?.analystTargets,
    fundamentals?.analyst_targets,
    fundamentals?.analystTargets,
    intelligence?.analyst_targets,
    intelligence?.analystTargets,
    source,
    fundamentals,
    intelligence,
  ].filter(Boolean)
}

function analystDetailRows(source: any) {
  const keys = [
    'details',
    'detail',
    'history',
    'analyst_history',
    'analystHistory',
    'analystPriceTargets',
    'analyst_price_targets',
    'priceTargetHistory',
    'price_target_history',
    'upgradeDowngradeHistory',
    'upgrade_downgrade_history',
  ]
  const rows: any[] = []
  for (const container of analystDetailContainers(source)) {
    if (Array.isArray(container)) {
      rows.push(...container)
      continue
    }
    for (const key of keys) {
      const value = container?.[key]
      if (Array.isArray(value)) rows.push(...value)
      else if (Array.isArray(value?.history)) rows.push(...value.history)
      else if (Array.isArray(value?.items)) rows.push(...value.items)
      else if (Array.isArray(value?.rows)) rows.push(...value.rows)
      else if (value && typeof value === 'object') rows.push(value)
    }
  }

  return rows
    .map((row) => {
      const previousTarget = strictNumber(row?.previous_target ?? row?.previousTarget ?? row?.from_target ?? row?.fromTarget ?? row?.target_from ?? row?.targetFrom ?? row?.old_target ?? row?.oldTarget)
      const newTarget = strictNumber(row?.new_target ?? row?.newTarget ?? row?.target_price ?? row?.targetPrice ?? row?.priceTarget ?? row?.target ?? row?.to_price ?? row?.toPrice ?? row?.target_to ?? row?.targetTo)
      const firm = row?.firm ?? row?.source ?? row?.company ?? row?.brokerage
      const analyst = row?.analyst ?? row?.analyst_name ?? row?.analystName
      const rating = row?.rating ?? row?.toGrade ?? row?.to_grade ?? row?.grade ?? row?.recommendation
      const rawDate = row?.date ?? row?.published_at ?? row?.publishedAt ?? row?.reportDate ?? row?.actionDate ?? row?.epochGradeDate
      const action = normalizeAnalystAction(row?.action ?? row?.type ?? row?.event)
      const date = formatAnalystDate(rawDate)
      const age = formatAnalystAge(rawDate)
      return {
        firm: firm ? String(firm) : '',
        analyst: analyst ? String(analyst) : '',
        previousTarget,
        newTarget,
        rating: rating ? String(rating) : '',
        date,
        age,
        action,
      }
    })
    .filter((row) => row.firm || row.analyst || row.previousTarget != null || row.newTarget != null || row.rating || row.date || row.action)
    .slice(0, 8)
}

function normalizeAnalystAction(value: unknown) {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''
  const mapped: Record<string, string> = {
    up: 'Raised',
    raised: 'Raised',
    raise: 'Raised',
    down: 'Lowered',
    lowered: 'Lowered',
    lower: 'Lowered',
    main: 'Reiterated',
    reiterate: 'Reiterated',
    reiterated: 'Reiterated',
    init: 'Initiated',
    initiated: 'Initiated',
    initiate: 'Initiated',
  }
  return mapped[raw] || titleCase(raw)
}

function parseAnalystDate(value: unknown) {
  if (value == null || value === '') return ''
  const numericValue = typeof value === 'number' ? value : Number(value)
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue > 100000000000 ? numericValue : numericValue * 1000)
    : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAnalystDate(value: unknown) {
  const date = parseAnalystDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAnalystAge(value: unknown) {
  const date = parseAnalystDate(value)
  if (!date) return ''
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  return days <= 0 ? 'Today' : `${days}d`
}

function AnalystTargetsWidget({ source, hidden, onOpen }: { source: any; hidden: boolean; onOpen?: () => void }) {
  const data = analystTargetsData(source)
  if (!data.hasData) {
    return (
      <button type="button" className="stock-analyst-targets stock-analyst-targets-empty stock-analyst-targets-action" aria-label="Open analyst targets details" onClick={onOpen}>
        <p>{hidden ? mask : 'Analyst targets unavailable'}</p>
      </button>
    )
  }

  const rangeReady = data.low != null && data.high != null && data.high > data.low
  const rangeMin = rangeReady ? data.low || 0 : 0
  const rangeMax = rangeReady ? data.high || 0 : 0
  const marker = (value: number | null) => {
    if (!rangeReady || value == null) return 0
    return Math.max(0, Math.min(100, ((value - rangeMin) / (rangeMax - rangeMin)) * 100))
  }
  const ratingRows = [
    { label: 'Buy', value: data.buy, className: 'buy' },
    { label: 'Hold', value: data.hold, className: 'hold' },
    { label: 'Sell', value: data.sell, className: 'sell' },
  ].filter((item) => item.value != null)
  const ratingTotal = ratingRows.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const targetPercent = (value: number | null) => data.current ? ((Number(value) - data.current) / data.current) * 100 : null
  const targetRows = [
    data.low != null ? { label: 'Bear', value: data.low, percent: targetPercent(data.low) } : null,
    data.average != null ? { label: 'Base', value: data.average, percent: targetPercent(data.average) } : null,
    data.high != null ? { label: 'Bull', value: data.high, percent: targetPercent(data.high) } : null,
  ].filter(Boolean) as { label: string; value: number; percent: number | null }[]
  const current = data.current
  const baseTarget = data.average
  const currentBelowBasePercent = current != null && baseTarget != null ? ((baseTarget - current) / current) * 100 : null
  const targetTone = data.upside != null ? (data.upside > 2 ? 'positive' : data.upside < -2 ? 'negative' : 'warning') : ''
  // kept for potential future use; not applied to root widget border
  const _consensusTone = currentBelowBasePercent
  const percentLabel = (value: number | null) => value == null ? '' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  const _signedDifference = data.difference == null ? '' : `${data.difference >= 0 ? '+' : '-'}${money(Math.abs(data.difference))}`
  const upsideLabel = data.upside == null ? '' : `${data.upside >= 0 ? '+' : ''}${data.upside.toFixed(1)}%`

  const _avgMarkerPct = data.average != null ? marker(data.average) : 50
  const fmt = (value: number | null) => value == null ? '' : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const outOfRangeLow = rangeReady && data.current != null && data.current < (data.low || 0)
  const outOfRangeHigh = rangeReady && data.current != null && data.current > (data.high || 0)
  const currentMarkerPct = data.current != null ? Math.max(0, Math.min(100, marker(data.current))) : null
  const aboveLabelTransform = currentMarkerPct == null ? 'translateX(-50%)' : currentMarkerPct <= 8 ? 'translateX(0%)' : currentMarkerPct >= 92 ? 'translateX(-100%)' : 'translateX(-50%)'
  const rangeSpan = (data.high ?? 0) - (data.low ?? 0)
  const oorLowPct = outOfRangeLow && rangeSpan > 0 && data.current != null && data.low != null
    ? Math.min(60, ((data.low - data.current) / rangeSpan) * 100)
    : 0
  const oorHighPct = outOfRangeHigh && rangeSpan > 0 && data.current != null && data.high != null
    ? Math.min(60, ((data.current - data.high) / rangeSpan) * 100)
    : 0

    return (
    <button
      type="button"
      className="stock-analyst-targets stock-analyst-targets-action"
      aria-label="Open analyst targets details"
      onClick={onOpen}
    >
      {/* Block 1: IBKR-style Target + Consensus header */}
      <div className="sat-main sat-main-primary">
        {/* Target card — integrated header band, thick colored border */}
        {data.average != null ? (
          <div className={`sat-target-ibkr${targetTone ? ` sat-target-ibkr-${targetTone}` : ''}`}>
            <div className="sat-target-ibkr-hdr"><span>Target</span></div>
            <div className="sat-target-ibkr-body">
              <strong className="sat-target-ibkr-val">{hidden ? mask : fmt(data.average)}</strong>
              {data.upside != null ? <span className={`sat-target-ibkr-pct${targetTone ? ` sat-tip-${targetTone}` : ''}`}>{hidden ? mask : `${data.upside >= 0 ? '▲' : '▼'} ${upsideLabel}`}</span> : null}
            </div>
          </div>
        ) : null}
        {/* Consensus card — neutral border, no tone coloring */}
        {data.rating ? (
          <div className="sat-consensus-ibkr" aria-label="Consensus rating">
            <div className="sat-consensus-ibkr-hdr">
              <span>Consensus</span>
              <Info size={10} />
            </div>
            <div className="sat-consensus-ibkr-body">
              <strong className="sat-consensus-ibkr-val">{hidden ? mask : data.rating}</strong>
              {data.count != null ? <span className="sat-consensus-ibkr-count">{hidden ? mask : `Based on ${Math.trunc(data.count)} Analyst Ratings`}</span> : null}
            </div>
            {ratingRows.length > 0 ? (
              <div className="sat-consensus-strip" aria-hidden="true">
                {ratingRows.map((item) => (
                  <em key={item.label} className={`sat-cs-${item.className}`} style={{ flexGrow: Number(item.value || 0) }} />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Block 2: Range visualization */}
      {rangeReady ? (
        <div className="sat-range-v2">
          {/* Arrow only above the track */}
          {currentMarkerPct != null ? (
            <div className="sat-range-v2-above-wrap">
              <div className="sat-range-v2-above" style={{ left: `${currentMarkerPct}%`, transform: aboveLabelTransform }}>
                <em className="sat-above-arrow">▲</em>
              </div>
            </div>
          ) : null}
          {/* Track with proportional OOR dashed extensions */}
          <div className="sat-range-v2-track">
            {outOfRangeLow ? <i className="sat-oor-line sat-oor-left" style={{ width: `${oorLowPct}%` }} aria-hidden="true" /> : null}
            {outOfRangeHigh ? <i className="sat-oor-line sat-oor-right" style={{ width: `${oorHighPct}%` }} aria-hidden="true" /> : null}
          </div>
          {/* All labels below the track */}
          <div className="sat-range-v2-labels">
            <div className="sat-rv2-lbl sat-rv2-lbl-bear">
              <b>{hidden ? mask : fmt(data.low || 0)}</b>
              <span>{hidden ? mask : percentLabel(targetPercent(data.low))}</span>
              <em className="sat-rv2-bear">Bear</em>
            </div>
            {currentMarkerPct != null ? (
              <div className="sat-rv2-lbl sat-rv2-lbl-cur" style={{ left: `${currentMarkerPct}%`, transform: aboveLabelTransform }}>
                <b>{hidden ? mask : fmt(data.current)}</b>
                <span>{hidden ? mask : upsideLabel}</span>
                <em className="sat-rv2-cur-lbl">Current</em>
              </div>
            ) : null}
            <div className="sat-rv2-lbl sat-rv2-lbl-bull">
              <b>{hidden ? mask : fmt(data.high || 0)}</b>
              <span>{hidden ? mask : percentLabel(targetPercent(data.high))}</span>
              <em className="sat-rv2-bull">Bull</em>
            </div>
          </div>
        </div>
      ) : null}

      {/* Block 3: Analyst distribution — keep existing bars */}
      {ratingRows.length ? (
        <div className="sat-ratings" aria-label="Analyst rating distribution">
          {ratingRows.map((item) => (
            <div className="sat-rating" key={item.label}>
              <span>{item.label}</span>
              <i><em className={item.className} style={{ width: `${hidden || !ratingTotal ? 0 : Math.max(6, (Number(item.value || 0) / ratingTotal) * 100)}%` }} /></i>
              <b>{hidden ? mask : Math.trunc(Number(item.value || 0))}</b>
            </div>
          ))}
        </div>
      ) : null}
    </button>
  )
}

function AnalystTargetsDetail({ source, hidden }: { source: any; hidden: boolean }) {
  const data = analystTargetsData(source)
  const rows = analystDetailRows(source)
  const targetPercent = (value: number | null) => data.current ? ((Number(value) - data.current) / data.current) * 100 : null
  const percentLabel = (value: number | null) => value == null ? '' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
  const detailRows = [
    data.high != null ? { label: 'Bull', value: data.high, percent: targetPercent(data.high) } : null,
    data.average != null ? { label: 'Base', value: data.average, percent: targetPercent(data.average) } : null,
    data.low != null ? { label: 'Bear', value: data.low, percent: targetPercent(data.low) } : null,
  ].filter(Boolean) as { label: string; value: number; percent: number | null }[]
  const recommendationRows = [
    { label: 'Strong Buy', value: data.strongBuy },
    { label: 'Buy', value: data.buyOnly ?? (data.strongBuy == null ? data.buy : null) },
    { label: 'Hold', value: data.hold },
    { label: 'Sell', value: data.sellOnly ?? (data.strongSell == null ? data.sell : null) },
    { label: 'Strong Sell', value: data.strongSell },
  ].filter((row) => row.value != null)
  const hasSummary = detailRows.length > 0 || recommendationRows.length > 0 || Boolean(data.rating)
  return (
    <PiaCard className="stock-intel-tech-card stock-analyst-detail-card" title={hidden ? 'Workspace' : 'Analyst Targets'}>
      {hasSummary ? (
        <div className="sat-analysis-detail">
          {data.average != null || data.rating ? (
            <section className="sat-consensus-panel" aria-label="Analyst consensus">
              <span>Consensus</span>
              {data.average != null ? <b>{hidden ? mask : money(data.average)}</b> : null}
              {data.rating ? <strong>{hidden ? mask : data.rating}</strong> : null}
              {data.count != null ? <small>{hidden ? mask : `${Math.trunc(data.count)} Analysts`}</small> : null}
            </section>
          ) : null}
          {detailRows.length ? (
            <div className="sat-analysis-grid sat-analysis-targets" aria-label="Bull base bear analyst targets">
              {detailRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <b className="sat-target-value">
                    <span>{hidden ? mask : money(row.value)}</span>
                    {row.percent != null ? <small>{hidden ? mask : percentLabel(row.percent)}</small> : null}
                  </b>
                </div>
              ))}
            </div>
          ) : null}
          {data.rating || recommendationRows.length ? (
            <section className="sat-recommendation-summary" aria-label="Analyst ratings">
              <h4>Distribution</h4>
              {data.rating ? <strong>{hidden ? mask : data.rating}</strong> : null}
              {recommendationRows.length ? (
                <div className="sat-recommendation-grid">
                  {recommendationRows.map((row) => (
                    <div key={row.label}>
                      <span>{row.label}</span>
                      <b>{hidden ? mask : Math.trunc(Number(row.value || 0))}</b>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : (
        <p className="stock-analyst-detail-empty">{hidden ? mask : 'Analyst target details unavailable from the current provider.'}</p>
      )}
      <section className="sat-history" aria-label="Analyst history">
        <h4>Analyst History</h4>
        {rows.length ? (
          <div className="sat-history-table" role="table">
            <div className="sat-history-head" role="row">
              <span>Firm</span>
              <span>Rating</span>
              <span>Target Change</span>
              <span>Date</span>
            </div>
            {rows.map((row, index) => (
              <div className="sat-history-row" role="row" key={`${row.firm || row.analyst || row.rating || 'analyst'}-${row.date || index}`}>
                <span>{hidden ? mask : row.firm || row.analyst || EMPTY}</span>
                <b>{hidden ? mask : row.rating || row.action || EMPTY}</b>
                <strong>{hidden ? mask : row.previousTarget != null || row.newTarget != null ? `${row.previousTarget != null ? money(row.previousTarget) : EMPTY} -> ${row.newTarget != null ? money(row.newTarget) : EMPTY}` : EMPTY}</strong>
                <em>{hidden ? mask : row.age || row.date || EMPTY}</em>
              </div>
            ))}
          </div>
        ) : (
          <p className="stock-analyst-detail-empty">{hidden ? mask : 'Analyst history not available'}</p>
        )}
      </section>
    </PiaCard>
  )
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

const TV_EXCHANGE_ALIASES: Record<string, string> = {
  NAS: 'NASDAQ',
  NMS: 'NASDAQ',
  NCM: 'NASDAQ',
  NGM: 'NASDAQ',
  NASDAQ: 'NASDAQ',
  NYQ: 'NYSE',
  NYSE: 'NYSE',
  ASE: 'AMEX',
  AMEX: 'AMEX',
  ARCA: 'AMEX',
}

const TV_SYMBOL_DEFAULT_EXCHANGES: Record<string, string[]> = {
  TE: ['NYSE', 'NASDAQ', 'AMEX'],
  TSM: ['NYSE', 'NASDAQ'],
  IONQ: ['NYSE', 'NASDAQ'],
  QBTS: ['NYSE', 'NASDAQ'],
  NKE: ['NYSE', 'NASDAQ'],
  ZETA: ['NYSE', 'NASDAQ'],
}

function normalizeTvExchange(value: unknown) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return null
  return TV_EXCHANGE_ALIASES[raw] || TV_EXCHANGE_ALIASES[raw.replace(/[^A-Z]/g, '')] || null
}

function tradingViewSymbols(rawSymbol: string, source?: any) {
  const exchanges: string[] = []
  const add = (value: unknown) => {
    const exchange = normalizeTvExchange(value)
    if (exchange && !exchanges.includes(exchange)) exchanges.push(exchange)
  }

  ;(TV_SYMBOL_DEFAULT_EXCHANGES[rawSymbol] || []).forEach(add)
  ;[
    source?.exchange,
    source?.primary_exchange,
    source?.primaryExchange,
    source?.listing_exchange,
    source?.market,
    source?.fullExchangeName,
  ].forEach(add)
  ;['NASDAQ', 'NYSE', 'AMEX'].forEach(add)

  return exchanges.map((exchange) => `${exchange}:${rawSymbol}`)
}

function TradingViewChart({ ticker, hidden, source }: { ticker: string; hidden: boolean; source?: any }) {
  const rawSymbol = String(ticker || '').split(' ')[0].toUpperCase()
  const symbols = tradingViewSymbols(rawSymbol, source)
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const symbol = symbols[Math.min(attempt, Math.max(symbols.length - 1, 0))] || `NASDAQ:${rawSymbol}`

  useEffect(() => {
    setAttempt(0)
    setLoaded(false)
  }, [rawSymbol, symbols.join('|')])

  useEffect(() => {
    if (hidden || loaded || attempt >= symbols.length - 1) return
    const timeout = window.setTimeout(() => {
      setAttempt((current) => current + 1)
    }, attempt === 0 ? 4200 : 6800)
    return () => window.clearTimeout(timeout)
  }, [attempt, hidden, loaded, symbols.length])

  if (hidden) {
    return (
      <div className="stock-intel-chart-placeholder">
        <span>{mask}</span>
      </div>
    )
  }

  const encoded = encodeURIComponent(symbol)
  const frameId = `pia-tv-${rawSymbol}-${attempt}`
  return (
    <div className="stock-intel-chart-wrap">
      {!loaded ? <div className="stock-intel-chart-loading">Loading chart...</div> : null}
      <iframe
        key={frameId}
        id={frameId}
        title={`${rawSymbol} TradingView chart`}
        className="stock-intel-chart-frame"
        src={`https://s.tradingview.com/widgetembed/?frameElementId=${frameId}&symbol=${encoded}&interval=D&theme=dark&style=1&hide_top_toolbar=1&hide_side_toolbar=1&allow_symbol_change=0&save_image=0&withdateranges=1&hideideas=1&timezone=Etc%2FUTC`}
        loading="eager"
        referrerPolicy="origin"
        allowFullScreen
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          setAttempt((current) => Math.min(current + 1, Math.max(symbols.length - 1, 0)))
        }}
      />
    </div>
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
  const [analysisSubTab, setAnalysisSubTab] = useState<AnalysisSubTab>('analystTargets')
  const [timeframe, setTimeframe] = useState<Timeframe>('Swing')
  const [analysisFocus, setAnalysisFocus] = useState<'analystTargets' | null>(null)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const analystTargetsRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastScrollTopRef = useRef(0)
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
  useEffect(() => {
    if (tab !== 'Analysis' || analysisFocus !== 'analystTargets') return
    const frame = window.requestAnimationFrame(() => {
      analystTargetsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      analystTargetsRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [analysisFocus, tab])

  useEffect(() => {
    if (variant !== 'mobile') {
      setHeaderCollapsed(false)
      return
    }
    const body = bodyRef.current
    if (!body) return

    let frame = 0
    lastScrollTopRef.current = body.scrollTop

    const handleScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const nextScrollTop = body.scrollTop
        const delta = nextScrollTop - lastScrollTopRef.current
        lastScrollTopRef.current = nextScrollTop

        if (nextScrollTop <= 24) {
          setHeaderCollapsed(false)
          return
        }
        if (delta > 2) setHeaderCollapsed(true)
        else if (delta < -2) setHeaderCollapsed(false)
      })
    }

    body.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      body.removeEventListener('scroll', handleScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [variant])

  const handleTabChange = (value: StockPanelTab, focus: 'analystTargets' | null = null) => {
    lastActiveStockPanelTab = value
    if (value === 'Analysis' && (focus === 'analystTargets' || tab !== 'Analysis')) setAnalysisSubTab('analystTargets')
    setAnalysisFocus(value === 'Analysis' ? focus : null)
    setTab(value)
  }
  const openAnalystTargetsDetail = () => handleTabChange('Analysis', 'analystTargets')
  const handleAnalysisSubTabChange = (value: AnalysisSubTab) => {
    setAnalysisSubTab(value)
    setAnalysisFocus(value === 'analystTargets' ? 'analystTargets' : null)
  }

  const isCompactHeader = variant === 'mobile' && headerCollapsed
  const panelClassName = [
    'stock-intel-panel',
    variant === 'mobile' ? 'stock-intel-panel-mobile' : 'stock-intel-panel-desktop',
    isCompactHeader ? 'stock-intel-panel-header-collapsed' : '',
  ].filter(Boolean).join(' ')
  const changeTone = change >= 0 ? 'green' : 'red'

  return (
    <div className={panelClassName}>
      <section className="stock-intel-hero-card" aria-label="Stock header and key metrics">
        <div className="stock-intel-expanded-header-content" aria-hidden={isCompactHeader}>
          <div className="stock-intel-expanded-header-inner">
            <header className="stock-intel-header">
              <button type="button" className="stock-intel-close" onClick={onClose} aria-label="Close intelligence panel" tabIndex={isCompactHeader ? -1 : undefined}>
                <ArrowLeft size={variant === 'mobile' ? 22 : 18} />
              </button>
              <div className="stock-intel-title-block">
                <div className="stock-intel-identity">
                  <CompanyLogo source={{ ...source, company }} symbol={symbol} hidden={hidden} className="stock-intel-symbol-mark" />
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
                  <small className={changeTone}>{hidden ? mask : `${change >= 0 ? '+' : ''}${pct(change)}`}</small>
                  {position ? (
                    <PiaBadge variant={unrealized >= 0 ? 'bullish' : 'bearish'} size="compact">
                      {hidden ? mask : `${unrealized >= 0 ? '+' : ''}${money(unrealized)} P/L`}
                    </PiaBadge>
                  ) : null}
                </div>
              </div>
              <div className="stock-intel-quote-rail">
                <div className="stock-intel-mini-spark" aria-hidden="true">
                  <MiniSpark source={{ ...source, ...fundamentals }} hidden={hidden} />
                </div>
              </div>
            </div>

            <TodayRangeHero source={{ ...source, fundamentals }} hidden={hidden} />

            <StockKeyMetrics source={{ ...source, fundamentals, company }} hidden={hidden} ticker={symbol} />
          </div>
        </div>

        <div className="stock-intel-compact-header-shell" aria-hidden={!isCompactHeader}>
          <header className="stock-intel-compact-header">
            <div className="stock-intel-compact-quote">
              <div className="stock-intel-compact-row">
                <strong className="stock-intel-compact-symbol">{hidden ? mask : symbol}</strong>
                <small className={`stock-intel-compact-change ${changeTone}`}>{hidden ? mask : `${change >= 0 ? '+' : ''}${pct(change)}`}</small>
              </div>
              <div className="stock-intel-compact-row">
                <span className="stock-intel-compact-price">{hidden ? mask : money(last)}</span>
              </div>
            </div>
            <button type="button" className="stock-intel-icon-action stock-intel-compact-more" aria-label="More stock actions" disabled title="Planned">
              <MoreVertical size={20} />
            </button>
          </header>
        </div>
      </section>

      <PiaTabs
        className="stock-intel-tabs"
        ariaLabel="Stock intelligence tabs"
        activeId={tab}
        onChange={(value) => handleTabChange(value as StockPanelTab)}
        tabs={STOCK_PANEL_TABS.map((item) => ({ id: item, label: tabLabel(item) }))}
      />

      <div className="stock-intel-body" ref={bodyRef}>
        {loading ? <p className="muted">Loading intelligence workspace...</p> : null}

        {!loading && tab === 'Overview' && (
          <div className="stock-intel-section stock-overview-v2">
            {position ? <StockPositionSummary source={{ ...source, ...position }} hidden={hidden} /> : null}

            <StockAiIntelligenceWidget source={source} overview={overview} technical={technical} targets={targets} hidden={hidden} />

            <AnalystTargetsWidget source={{ ...source, ...fundamentals, fundamentals, intelligence }} hidden={hidden} onOpen={openAnalystTargetsDetail} />

            <PiaCard title={hidden ? 'Updates' : 'Recent News'}>
              <RecentNewsPreview items={newsIntelligence.items || []} hidden={hidden} />
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Chart' && (
          <div className="stock-intel-section">
            <PiaCard className="stock-intel-chart-card" title={hidden ? 'Workspace chart' : 'Price Chart'}>
              <TradingViewChart ticker={symbol} source={{ ...source, fundamentals }} hidden={hidden} />
            </PiaCard>
          </div>
        )}

        {!loading && tab === 'Analysis' && (
          <div className="stock-intel-section stock-intel-technical-layout stock-analysis-layout">
            <div className="stock-analysis-shell">
              <div className="stock-analysis-subtabs" role="tablist" aria-label="Analysis sections">
                {ANALYSIS_SUB_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={analysisSubTab === item.id}
                    className={analysisSubTab === item.id ? 'active' : ''}
                    onClick={() => handleAnalysisSubTabChange(item.id)}
                  >
                    {hidden ? 'Workspace' : item.label}
                  </button>
                ))}
              </div>

              <div className="stock-analysis-panel">
                {analysisSubTab === 'analystTargets' && (
                  <div ref={analystTargetsRef} className={`stock-analysis-anchor${analysisFocus === 'analystTargets' ? ' is-selected' : ''}`} tabIndex={-1}>
                    <AnalystTargetsDetail source={{ ...source, ...fundamentals, fundamentals, intelligence }} hidden={hidden} />
                  </div>
                )}

                {analysisSubTab === 'aiAnalysis' && (
                  <div className="stock-analysis-card-stack">
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
                    <PiaCard className="stock-intel-tech-card" title={hidden ? 'AI summary' : 'AI interpretation summary'}>
                      <p>{hidden ? mask : techPlan.aiSummary}</p>
                      <MetricRow label={hidden ? 'Overview' : 'Day change'} value={Math.abs(Number(technical.day_change_pct || change || 0))} tone={change >= 0 ? 'green' : 'red'} hidden={hidden} />
                      <MetricRow label={hidden ? 'Controls' : 'Risk score'} value={Number(source.risk || 0)} tone="red" hidden={hidden} />
                    </PiaCard>
                  </div>
                )}

                {analysisSubTab === 'risks' && (
                  <div className="stock-analysis-card-stack">
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
                  </div>
                )}

                {analysisSubTab === 'valuation' && (
                  <div className="stock-analysis-card-stack">
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
                  </div>
                )}
              </div>
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

      </div>
    </div>
  )
}
