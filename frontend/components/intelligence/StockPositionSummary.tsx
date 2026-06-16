'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { GripVertical, Info, MoreHorizontal, Settings2, X } from 'lucide-react'
import { getApiBase, mask, money } from '../../lib/pia-api'
import { useDoubleTapToClose } from '../../hooks/useDoubleTapToClose'

const EMPTY = '-'
const COMPACT_STORAGE_KEY = 'pia.positionSummary.mobile.v2'
const EXPANDED_STORAGE_KEY = 'pia.positionSummaryExpanded.v1'

// ── Compact metric types ───────────────────────────────────────────────────────

type MetricKey =
  | 'marketValue' | 'pnl' | 'pnlPct' | 'portfolioPct' | 'shares'
  | 'avgCost' | 'costBasis' | 'todayPnl' | 'realizedPnl' | 'unrealizedPnl'

type Tone = 'positive' | 'negative' | 'neutral' | 'accent'
type MetricValue = { label: string; value: string; sub?: string; tone: Tone; subTone?: Tone }
type Prefs = { order: MetricKey[]; hidden: MetricKey[] }

// ── Section types ──────────────────────────────────────────────────────────────

type SectionKey =
  | 'positionHealth' | 'positionAnalytics' | 'positionValueEvolution'
  | 'costBasisAnalysis' | 'positionContribution' | 'tradeTimeline'

type SectionPrefs = { order: SectionKey[]; hidden: SectionKey[] }

// Pinned: always visible. Optional: user-controlled via Customize View.
const PINNED_SECTIONS: SectionKey[] = ['positionHealth', 'positionValueEvolution']
const OPTIONAL_SECTIONS: SectionKey[] = ['positionAnalytics', 'costBasisAnalysis', 'positionContribution', 'tradeTimeline']
const DEFAULT_SECTION_PREFS: SectionPrefs = { order: [...OPTIONAL_SECTIONS], hidden: [] }

const SECTION_LABELS: Record<SectionKey, string> = {
  positionHealth:         'Position Health',
  positionAnalytics:      'Position Analytics',
  positionValueEvolution: 'Position Value Evolution',
  costBasisAnalysis:      'Cost Basis Analysis',
  positionContribution:   'Position Contribution',
  tradeTimeline:          'Trade Timeline',
}

// ── Compact metric constants ───────────────────────────────────────────────────

const DEFAULT_ORDER: MetricKey[] = [
  'shares', 'avgCost', 'todayPnl',
  'pnl', 'pnlPct', 'marketValue',
  'costBasis', 'unrealizedPnl', 'portfolioPct',
  'realizedPnl',
]
const DEFAULT_PREFS: Prefs = { order: DEFAULT_ORDER, hidden: [] }

const METRIC_LABELS: Record<MetricKey, { compact: string; customize: string }> = {
  marketValue:  { compact: 'MV',            customize: 'Market Value (MV)' },
  pnl:          { compact: 'P&L',           customize: 'P&L (Value)' },
  pnlPct:       { compact: 'P&L %',         customize: 'P&L %' },
  portfolioPct: { compact: 'Portfolio %',   customize: 'Portfolio %' },
  shares:       { compact: 'Shares',        customize: 'Shares' },
  avgCost:      { compact: 'Avg Cost',      customize: 'Avg Cost' },
  costBasis:    { compact: 'Cost Basis',    customize: 'Cost Basis' },
  todayPnl:     { compact: "Today's P&L",  customize: "Today's P&L" },
  realizedPnl:  { compact: 'Realized P&L', customize: 'Realized P&L' },
  unrealizedPnl:{ compact: 'Unrealized P&L', customize: 'Unrealized P&L' },
}

// ── Analytics data types ───────────────────────────────────────────────────────

type TradeRecord = {
  date: string | null; datetime: string | null; side: string
  quantity: number; price: number; commission: number | null; realized_pnl: number | null
}

type SnapshotRecord = {
  date: string; market_value: number; quantity: number; avg_cost: number; unrealized_pnl: number
}

type AnalyticsSummary = {
  first_buy_date: string | null
  best_day: { date: string; change: number } | null
  worst_day: { date: string; change: number } | null
  total_return: number | null; total_return_pct: number | null
  trade_count: number; total_quantity_bought: number | null; avg_buy_price: number | null
}

type AnalyticsData = {
  data_quality: 'complete' | 'partial' | 'no_data'
  position_value_series: SnapshotRecord[]
  trades: TradeRecord[]
  summary: AnalyticsSummary
} | null

type HealthFactor = { label: string; rating: string; tone: Tone }
type HealthData = { score: number; status: string; statusTone: Tone; subtext: string; factors: HealthFactor[] }
type StripItem = { label: string; value: string; sub?: string; tone: Tone; subTone?: Tone }
type ChartMarker = { pct: number; label: 'B' | 'A' | 'T' | 'S'; tone: Tone; trade: TradeRecord }

type PositionDisplayData = {
  summary: AnalyticsSummary
  trades: TradeRecord[]
  snapshots: SnapshotRecord[]
  isSample: boolean
  winRate: number | null
  winDetails: string | null
}

// ── Sample fallback data (used when no real analytics data is available) ───────

const SAMPLE_ANALYTICS_SUMMARY: AnalyticsSummary = {
  first_buy_date: '2023-01-12',
  best_day: { date: '2024-04-16', change: 1240 },
  worst_day: { date: '2024-03-05', change: -890 },
  total_return: 18740,
  total_return_pct: 142.38,
  trade_count: 6,
  total_quantity_bought: 150,
  avg_buy_price: 165.08,
}

const SAMPLE_TRADES: TradeRecord[] = [
  { date: '2023-01-12', datetime: '2023-01-12T14:30:00Z', side: 'BUY',  quantity: 50, price: 120.50, commission: null, realized_pnl: null },
  { date: '2023-05-08', datetime: '2023-05-08T10:15:00Z', side: 'BUY',  quantity: 25, price: 142.30, commission: null, realized_pnl: null },
  { date: '2023-09-18', datetime: '2023-09-18T13:45:00Z', side: 'BUY',  quantity: 25, price: 168.75, commission: null, realized_pnl: null },
  { date: '2024-02-02', datetime: '2024-02-02T11:00:00Z', side: 'SELL', quantity: 25, price: 215.40, commission: null, realized_pnl: 1872.50 },
  { date: '2024-04-05', datetime: '2024-04-05T15:20:00Z', side: 'BUY',  quantity: 50, price: 221.35, commission: null, realized_pnl: null },
  { date: '2024-06-01', datetime: '2024-06-01T09:30:00Z', side: 'SELL', quantity: 25, price: 240.00, commission: null, realized_pnl: 1087.50 },
]

// Monthly snapshots from Jan 2023 to Jun 2026, plus weekly for 1W range
const _SAMPLE_MV: Array<[string, number]> = [
  ['2023-01-12',  6025], ['2023-02-01',  6380], ['2023-03-01',  6820],
  ['2023-04-01',  7210], ['2023-05-01',  7100], ['2023-05-08', 11490],
  ['2023-06-01', 12080], ['2023-07-01', 12950], ['2023-08-01', 13540],
  ['2023-09-01', 13620], ['2023-09-18', 18610], ['2023-10-01', 19200],
  ['2023-11-01', 21040], ['2023-12-01', 22310], ['2024-01-01', 23840],
  ['2024-02-01', 24100], ['2024-02-02', 16155], ['2024-03-01', 16900],
  ['2024-04-01', 16650], ['2024-04-05', 28420], ['2024-04-16', 29580],
  ['2024-05-01', 30100], ['2024-06-01', 24000], ['2024-07-01', 25300],
  ['2024-08-01', 26140], ['2024-09-01', 25410], ['2024-10-01', 26200],
  ['2024-11-01', 27050], ['2024-12-01', 26440], ['2025-01-01', 27800],
  ['2025-02-01', 28300], ['2025-03-01', 27500], ['2025-03-05', 26610],
  ['2025-04-01', 27350], ['2025-05-01', 28100], ['2025-06-01', 29380],
  ['2025-07-01', 31200], ['2025-08-01', 32800], ['2025-09-01', 33900],
  ['2025-10-01', 35200], ['2025-11-01', 36100], ['2025-12-01', 36850],
  ['2026-01-01', 37300], ['2026-02-01', 37700], ['2026-03-01', 38150],
  ['2026-04-01', 37600], ['2026-05-01', 37940], ['2026-06-01', 38190],
  ['2026-06-09', 38310], ['2026-06-10', 38240], ['2026-06-11', 38350],
  ['2026-06-12', 38420], ['2026-06-13', 38380], ['2026-06-14', 38500],
  ['2026-06-16', 38440],
]

const SAMPLE_SNAPSHOTS: SnapshotRecord[] = _SAMPLE_MV.map(([date, mv]) => ({
  date,
  market_value: mv,
  quantity: 100,
  avg_cost: 197.00,
  unrealized_pnl: mv - 19700,
}))

// ── Utility functions ──────────────────────────────────────────────────────────

function hasValue(v: unknown) {
  return v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}

function numberValue(v: unknown): number | null {
  if (!hasValue(v)) return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function firstNumber(...values: unknown[]) {
  for (const v of values) { const n = numberValue(v); if (n != null) return n }
  return null
}

function hasPositionSummaryData(source: any) {
  const shares = firstNumber(source.quantity, source.qty, source.shares)
  if (shares != null && Math.abs(shares) > 0) return true
  const mv = firstNumber(source.market_value, source.mktvalue)
  const cb = firstNumber(source.cost_basis)
  return Boolean(source.manual) || Boolean((mv != null && Math.abs(mv) > 0) || (cb != null && Math.abs(cb) > 0))
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }
function toneFrom(v: number | null | undefined): Tone { return v == null || v === 0 ? 'neutral' : v > 0 ? 'positive' : 'negative' }
function sign(v: number) { return v > 0 ? '+' : v < 0 ? '-' : '' }

function compactSuffix(v: number) {
  const a = Math.abs(v)
  if (a >= 1e9) return `${(a / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(a / 1e6).toFixed(2)}M`
  if (a >= 1000) return `${(a / 1000).toFixed(2)}K`
  return a.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

function formatMoney(v: number | null, hidden: boolean, signed = false, compact = false) {
  if (hidden) return mask
  if (v == null) return EMPTY
  const prefix = signed ? sign(v) : v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return `${prefix}${compact && abs >= 1000 ? `$${compactSuffix(abs)}` : money(abs)}`
}

function formatNumber(v: number | null, hidden: boolean) {
  if (hidden) return mask
  if (v == null) return EMPTY
  return v.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function formatPct(v: number | null, hidden: boolean, signed = false) {
  if (hidden) return mask
  if (v == null) return EMPTY
  const prefix = signed ? sign(v) : v < 0 ? '-' : ''
  return `${prefix}${Math.abs(v).toFixed(2)}%`
}

// Global fix: no directional arrows — sign + color carries direction.
function formatMove(v: number | null, hidden: boolean) {
  if (hidden) return mask
  if (v == null) return ''
  if (v === 0) return '0.00%'
  return `${v > 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}%`
}

function fmtShortDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  } catch { return d }
}

// ── Prefs helpers ──────────────────────────────────────────────────────────────

function normalizePrefs(v: Partial<Prefs> | null | undefined): Prefs {
  const so = Array.isArray(v?.order) ? v!.order : []
  const sh = Array.isArray(v?.hidden) ? v!.hidden : []
  const order = [...so.filter((k): k is MetricKey => DEFAULT_ORDER.includes(k as MetricKey))]
  for (const k of DEFAULT_ORDER) { if (!order.includes(k)) order.push(k) }
  const hidden = sh.filter((k): k is MetricKey => DEFAULT_ORDER.includes(k as MetricKey))
  return { order, hidden: [...new Set(hidden)] }
}

function readPrefs(): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  try { return normalizePrefs(JSON.parse(window.localStorage.getItem(COMPACT_STORAGE_KEY) || 'null')) }
  catch { return DEFAULT_PREFS }
}

function normalizeSectionPrefs(v: Partial<SectionPrefs> | null | undefined): SectionPrefs {
  const so = Array.isArray(v?.order) ? v!.order : []
  const sh = Array.isArray(v?.hidden) ? v!.hidden : []
  // Only optional sections can be in order/hidden
  const order = [...so.filter((k): k is SectionKey => OPTIONAL_SECTIONS.includes(k as SectionKey))]
  for (const k of OPTIONAL_SECTIONS) { if (!order.includes(k)) order.push(k) }
  const hidden = sh.filter((k): k is SectionKey => OPTIONAL_SECTIONS.includes(k as SectionKey))
  return { order, hidden: [...new Set(hidden)] }
}

function readSectionPrefs(): SectionPrefs {
  if (typeof window === 'undefined') return DEFAULT_SECTION_PREFS
  try { return normalizeSectionPrefs(JSON.parse(window.localStorage.getItem(EXPANDED_STORAGE_KEY) || 'null')) }
  catch { return DEFAULT_SECTION_PREFS }
}

// ── Data builders ──────────────────────────────────────────────────────────────

function buildSummaryData(source: any, hidden: boolean) {
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

  return {
    weekPct,
    metrics: {
      marketValue:  { label: METRIC_LABELS.marketValue.compact,  value: formatMoney(marketValue, hidden, false, true), sub: formatMove(dayPct, hidden), tone: 'neutral' as Tone, subTone: toneFrom(dayPct) },
      pnl:          { label: METRIC_LABELS.pnl.compact,          value: formatMoney(pnl, hidden, true, true),          sub: formatMove(pnlPct, hidden),  tone: toneFrom(pnl), subTone: toneFrom(pnlPct) },
      pnlPct:       { label: METRIC_LABELS.pnlPct.compact,       value: formatPct(pnlPct, hidden, true),                sub: formatMove(dayPct, hidden),  tone: toneFrom(pnlPct), subTone: toneFrom(dayPct) },
      portfolioPct: { label: METRIC_LABELS.portfolioPct.compact, value: formatPct(portfolioPct, hidden),                tone: 'accent' as Tone },
      shares:       { label: METRIC_LABELS.shares.compact,       value: formatNumber(shares, hidden),                   tone: 'neutral' as Tone },
      avgCost:      { label: METRIC_LABELS.avgCost.compact,      value: formatMoney(avgCost, hidden),                   tone: 'neutral' as Tone },
      costBasis:    { label: METRIC_LABELS.costBasis.compact,    value: formatMoney(costBasis, hidden, false, true),    tone: 'neutral' as Tone },
      todayPnl:     { label: METRIC_LABELS.todayPnl.compact,     value: formatMoney(dayPnl, hidden, true),              sub: formatMove(dayPct, hidden),  tone: toneFrom(dayPnl), subTone: toneFrom(dayPct) },
      realizedPnl:  { label: METRIC_LABELS.realizedPnl.compact,  value: formatMoney(realized, hidden, true, true),      sub: formatMove(realizedPct, hidden), tone: toneFrom(realized), subTone: toneFrom(realizedPct) },
      unrealizedPnl:{ label: METRIC_LABELS.unrealizedPnl.compact,value: formatMoney(unrealized, hidden, true, true),    sub: formatMove(unrealizedPct, hidden), tone: toneFrom(unrealized), subTone: toneFrom(unrealizedPct) },
    } as Record<MetricKey, MetricValue>,
  }
}

function buildStripItems(source: any, hidden: boolean): StripItem[] {
  const shares = firstNumber(source.quantity, source.qty, source.shares)
  const avgCost = firstNumber(source.avg_price, source.avg_cost, source.avgCost)
  const current = firstNumber(source.last, source.price, source.market_price) || avgCost || 0
  const multiplier = String(source.sec_type || '').toUpperCase() === 'OPT' ? 100 : 1
  const computedCost = avgCost != null && shares != null ? avgCost * shares * multiplier : null
  const costBasis = firstNumber(source.cost_basis, computedCost) || 0
  const computedMarket = shares != null && current ? shares * current * multiplier : null
  const marketValue = firstNumber(source.market_value, source.mktvalue, computedMarket) || 0
  const pnl = firstNumber(source.pnl, source.unrealized_pnl, source.unrealized, marketValue && costBasis ? marketValue - costBasis : null)
  const pnlPct = firstNumber(source.pnl_pct, source.unrealized_pct, costBasis ? ((pnl || 0) / costBasis) * 100 : null)
  const dayPct = firstNumber(source.day_change_pct, source.change_pct)
  const portfolioPct = firstNumber(source.portfolio_pct, source.weight)

  return [
    { label: 'Market Value',   value: formatMoney(marketValue, hidden, false, true), sub: dayPct != null ? formatMove(dayPct, hidden) : undefined, tone: 'neutral', subTone: toneFrom(dayPct) },
    { label: 'P&L',            value: formatMoney(pnl, hidden, true, true), sub: pnlPct != null ? formatMove(pnlPct, hidden) : undefined, tone: toneFrom(pnl), subTone: toneFrom(pnlPct) },
    { label: 'Return',         value: formatPct(pnlPct, hidden, true), sub: dayPct != null ? formatMove(dayPct, hidden) : undefined, tone: toneFrom(pnlPct), subTone: toneFrom(dayPct) },
    { label: 'Portfolio Wt.',  value: formatPct(portfolioPct, hidden), tone: 'accent' },
    { label: 'Shares',         value: formatNumber(shares, hidden), tone: 'neutral' },
    { label: 'Avg Cost',       value: formatMoney(avgCost, hidden), tone: 'neutral' },
    { label: 'Price',          value: formatMoney(current, hidden), tone: 'neutral' },
    { label: 'Cost Basis',     value: formatMoney(costBasis, hidden, false, true), tone: 'neutral' },
  ]
}

function buildDisplayData(analytics: AnalyticsData): PositionDisplayData {
  if (analytics && analytics.data_quality !== 'no_data' &&
      (analytics.position_value_series.length > 1 || analytics.trades.length > 0)) {
    const trades = analytics.trades
    const closing = trades.filter(t => t.realized_pnl != null)
    const winRate = closing.length > 0
      ? Math.round(closing.filter(t => (t.realized_pnl ?? 0) > 0).length / closing.length * 100)
      : null
    return { summary: analytics.summary, trades, snapshots: analytics.position_value_series, isSample: false, winRate, winDetails: null }
  }
  return { summary: SAMPLE_ANALYTICS_SUMMARY, trades: SAMPLE_TRADES, snapshots: SAMPLE_SNAPSHOTS, isSample: true, winRate: 78, winDetails: '46 Wins / 13 Losses' }
}

function computePositionHealth(source: any): HealthData {
  const pnlPct  = firstNumber(source.pnl_pct, source.unrealized_pct) ?? 0
  const portPct = firstNumber(source.portfolio_pct, source.weight) ?? 15
  const dayPct  = firstNumber(source.day_change_pct, source.change_pct) ?? 0
  const weekPct = firstNumber(source.week_change_pct, source.week_pct, dayPct * 1.9) ?? 0

  const profScore = pnlPct > 30 ? 95 : pnlPct > 20 ? 88 : pnlPct > 10 ? 78 : pnlPct > 0 ? 65 : pnlPct > -10 ? 45 : 25
  const sizeScore = portPct > 40 ? 55 : portPct > 30 ? 68 : portPct > 15 ? 85 : portPct > 5 ? 82 : 70
  const trendScore = weekPct > 3 ? 92 : weekPct > 1 ? 82 : weekPct > -1 ? 72 : weekPct > -3 ? 58 : 40
  const cbScore = pnlPct > 30 ? 92 : pnlPct > 20 ? 84 : pnlPct > 10 ? 74 : pnlPct > 0 ? 62 : 40
  const ddScore = weekPct > -3 ? 86 : weekPct > -7 ? 70 : 50

  const ratingOf = (s: number) => s >= 88 ? 'Excellent' : s >= 80 ? 'Strong' : s >= 70 ? 'Healthy' : s >= 58 ? 'Moderate' : s >= 45 ? 'Weak' : 'Critical'
  const toneOf = (s: number): Tone => s >= 72 ? 'positive' : s >= 55 ? 'neutral' : 'negative'
  const ddRating = (s: number) => s >= 82 ? 'Low Risk' : s >= 65 ? 'Moderate' : 'Elevated'

  const score = Math.round(profScore * 0.30 + sizeScore * 0.20 + trendScore * 0.18 + cbScore * 0.17 + ddScore * 0.15)
  const status = score >= 88 ? 'Excellent' : score >= 74 ? 'Healthy' : score >= 58 ? 'Watch' : 'Risky'
  const statusTone: Tone = score >= 74 ? 'positive' : score >= 58 ? 'neutral' : 'negative'
  const subtext = score >= 88 ? 'Your position is healthy' : score >= 74 ? 'Position performing well' : score >= 58 ? 'Monitor your position' : 'Position needs attention'

  return {
    score, status, statusTone, subtext,
    factors: [
      { label: 'Profitability',        rating: ratingOf(profScore),  tone: toneOf(profScore) },
      { label: 'Size',                 rating: ratingOf(sizeScore),  tone: toneOf(sizeScore) },
      { label: 'Trend',                rating: ratingOf(trendScore), tone: toneOf(trendScore) },
      { label: 'Cost Basis Advantage', rating: ratingOf(cbScore),    tone: toneOf(cbScore) },
      { label: 'Drawdown',             rating: ddRating(ddScore),    tone: toneOf(ddScore) },
    ],
  }
}

// ── useAnalyticsData ───────────────────────────────────────────────────────────

function useAnalyticsData(symbol: string | null): AnalyticsData {
  const [data, setData] = useState<AnalyticsData>(null)
  useEffect(() => {
    if (!symbol) return
    fetch(`${getApiBase()}/positions/${encodeURIComponent(symbol)}/history?range=ALL`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setData(d) })
      .catch(() => null)
  }, [symbol])
  return data
}

// ── Chart helpers ──────────────────────────────────────────────────────────────

function filterSeriesByRange(series: SnapshotRecord[], range: string): SnapshotRecord[] {
  if (range === 'ALL') return series
  const now = new Date()
  const cutoffs: Record<string, Date> = {
    '1W':  new Date(now.getTime() - 7 * 86400000),
    '1M':  new Date(now.getTime() - 30 * 86400000),
    '3M':  new Date(now.getTime() - 90 * 86400000),
    'YTD': new Date(now.getFullYear(), 0, 1),
    '1Y':  new Date(now.getTime() - 365 * 86400000),
  }
  const cutoff = cutoffs[range]
  if (!cutoff) return series
  const filtered = series.filter(s => new Date(s.date) >= cutoff)
  return filtered.length > 1 ? filtered : series
}

function buildTradeMarkers(series: SnapshotRecord[], trades: TradeRecord[]): ChartMarker[] {
  if (!series.length || !trades.length) return []
  const dates = series.map(s => s.date)
  const markers: ChartMarker[] = []
  let buyCount = 0
  for (const t of trades) {
    if (!t.date) continue
    let idx = dates.findIndex(d => d >= t.date!)
    if (idx < 0) idx = dates.length - 1
    const pct = idx / Math.max(1, dates.length - 1)
    if (t.side === 'BUY') {
      buyCount++
      markers.push({ pct, label: buyCount === 1 ? 'B' : 'A', tone: 'positive', trade: t })
    } else if (t.side === 'SELL') {
      const hasLaterBuy = trades.some(x => x.side === 'BUY' && x.date && t.date && x.date > t.date)
      markers.push({ pct, label: hasLaterBuy ? 'T' : 'S', tone: 'negative', trade: t })
    }
  }
  return markers
}

// ── Marker detail card ─────────────────────────────────────────────────────────

function MarkerDetailCard({ marker, hidden, onClose }: { marker: ChartMarker; hidden: boolean; onClose: () => void }) {
  const typeMap: Record<string, string> = { B: 'Buy', A: 'Add', T: 'Trim', S: 'Sell' }
  const clsMap: Record<string, string>  = { B: 'buy', A: 'add', T: 'trim', S: 'sell' }
  const type = typeMap[marker.label] || marker.label
  const cls  = clsMap[marker.label]  || 'neutral'
  const t = marker.trade
  const amount = t.quantity * t.price
  return (
    <div className="spse-marker-card">
      <button type="button" className="spse-marker-card-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
      <div className={`spse-marker-card-type ${cls}`}>{type}</div>
      <div className="spse-marker-card-row">
        <span className="spse-marker-card-lbl">Shares</span>
        <span className="spse-marker-card-val">{t.quantity} @ {formatMoney(t.price, hidden)}</span>
        <span className="spse-marker-card-lbl">Date</span>
        <span className="spse-marker-card-val">{fmtShortDate(t.date)}</span>
        <span className="spse-marker-card-lbl">Amount</span>
        <span className="spse-marker-card-val">{formatMoney(amount, hidden, false, true)}</span>
      </div>
    </div>
  )
}

// ── Evolution chart ────────────────────────────────────────────────────────────

function EvolutionChart({ points, markers, currentLabel, onMarkerTap }: {
  points: number[]; markers: ChartMarker[]; currentLabel: string
  onMarkerTap: (m: ChartMarker) => void
}) {
  if (points.length < 2) {
    return <p className="spse-evo-no-data">No position history yet. Connect IBKR to build your chart.</p>
  }
  const W = 340, H = 160, pad = 14
  const min = Math.min(...points), max = Math.max(...points)
  const range = Math.max(1, max - min)
  const chartH = H - pad * 2

  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * W,
    y: H - pad - ((v - min) / range) * chartH,
  }))

  const linePath = `M ${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`
  const areaPath = `M 0,${H} L ${coords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')} L ${W},${H} Z`
  const markerColor = (t: Tone) => t === 'positive' ? '#24d18c' : t === 'negative' ? '#f87171' : '#fbbf24'
  const last = coords[coords.length - 1]

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="spse-evo-chart" aria-label="Position value evolution chart">
        <defs>
          <linearGradient id="spseGradFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(36,209,140,.22)" />
            <stop offset="100%" stopColor="rgba(36,209,140,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#spseGradFill)" />
        <path d={linePath} fill="none" stroke="#24d18c" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {markers.map((m, i) => {
          const xIdx = Math.min(Math.round(m.pct * (coords.length - 1)), coords.length - 1)
          const c = coords[xIdx]
          const col = markerColor(m.tone)
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => onMarkerTap(m)}>
              <circle cx={c.x} cy={c.y} r={12} fill="transparent" />
              <circle cx={c.x} cy={c.y} r={5} fill={col} stroke="#07111d" strokeWidth="1.5" />
              <text x={c.x} y={c.y - 9} fill={col} fontSize="9" fontWeight="800" textAnchor="middle">{m.label}</text>
            </g>
          )
        })}
        <text x={last.x - 2} y={last.y - 10} fill="#f8fbff" fontSize="9" fontWeight="800" textAnchor="end">
          {currentLabel}
        </text>
      </svg>
      <div className="spse-evo-legend">
        <span className="spse-evo-legend-item"><span className="spse-evo-legend-dot buy" />Buy</span>
        <span className="spse-evo-legend-item"><span className="spse-evo-legend-dot add" />Add</span>
        <span className="spse-evo-legend-item"><span className="spse-evo-legend-dot trim" />Trim</span>
        <span className="spse-evo-legend-item"><span className="spse-evo-legend-dot sell" />Sell</span>
      </div>
    </>
  )
}

// ── Section block — no collapse, title only ────────────────────────────────────

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="spse-section">
      <div className="spse-section-head">
        <h4>{title}</h4>
      </div>
      <div className="spse-section-body">{children}</div>
    </section>
  )
}

// ── Section content components ─────────────────────────────────────────────────

function PositionHealthSection({ health }: { health: HealthData }) {
  return (
    <div className="spse-health">
      <div className="spse-health-score">
        <div className="spse-health-ring" style={{ '--score': `${health.score}%` } as CSSProperties}>
          <div className="spse-health-ring-inner">
            <span className="spse-health-num">{health.score}</span>
            <small className="spse-health-denom">/100</small>
          </div>
        </div>
        <div className="spse-health-label">
          <strong className={health.statusTone}>{health.status}</strong>
          <p>{health.subtext}</p>
        </div>
      </div>
      <div className="spse-health-factors">
        {health.factors.map(f => (
          <div key={f.label} className="spse-health-factor">
            <span>{f.label}</span>
            <b className={f.tone}>{f.rating}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function PositionAnalyticsSection({ displayData, hidden }: {
  displayData: PositionDisplayData; hidden: boolean
}) {
  const { summary, winRate, winDetails } = displayData
  const bestChange  = summary?.best_day?.change ?? null
  const worstChange = summary?.worst_day?.change ?? null

  const firstBuyDate = summary?.first_buy_date ?? null
  const holdingDays = firstBuyDate
    ? Math.floor((Date.now() - new Date(firstBuyDate).getTime()) / 86400000)
    : null
  const holdingRange = firstBuyDate ? `${fmtShortDate(firstBuyDate)} – Today` : null

  return (
    <div className="spse-analytics-cards">
      <div className="spse-analytics-card">
        <span>Best Day</span>
        <b className={toneFrom(bestChange)}>{bestChange != null ? formatMoney(bestChange, hidden, true) : EMPTY}</b>
        <small>{fmtShortDate(summary?.best_day?.date ?? null)}</small>
      </div>
      <div className="spse-analytics-card">
        <span>Worst Day</span>
        <b className={toneFrom(worstChange)}>{worstChange != null ? formatMoney(worstChange, hidden, true) : EMPTY}</b>
        <small>{fmtShortDate(summary?.worst_day?.date ?? null)}</small>
      </div>
      <div className="spse-analytics-card">
        <span>Holding Period</span>
        <b className="neutral">{holdingDays != null ? `${holdingDays} Days` : EMPTY}</b>
        {holdingRange && <small>{holdingRange}</small>}
      </div>
      <div className="spse-analytics-card">
        <span>Win Rate</span>
        <b className="neutral">{winRate != null ? `${winRate}%` : EMPTY}</b>
        {winDetails && <small>{winDetails}</small>}
      </div>
    </div>
  )
}

function PositionValueEvolutionSection({ displayData, hidden, source }: {
  displayData: PositionDisplayData; hidden: boolean; source: any
}) {
  const [range, setRange] = useState('ALL')
  const [activeMarker, setActiveMarker] = useState<ChartMarker | null>(null)
  const RANGES = ['1W', '1M', '3M', 'YTD', '1Y', 'ALL']

  const chartPoints = useMemo(() => {
    const filtered = filterSeriesByRange(displayData.snapshots, range)
    return filtered.length >= 2 ? filtered.map(s => s.market_value) : []
  }, [displayData.snapshots, range])

  const markers = useMemo((): ChartMarker[] => {
    const filtered = filterSeriesByRange(displayData.snapshots, range)
    if (filtered.length < 2) return []
    const cutoffDate = filtered[0].date
    const filteredTrades = displayData.trades.filter(t => t.date && t.date >= cutoffDate)
    return buildTradeMarkers(filtered, filteredTrades)
  }, [displayData, range])

  const marketValue = firstNumber(source.market_value, source.mktvalue) || 0
  const currentLabel = hidden ? '••' : `$${compactSuffix(marketValue)}`

  function handleMarkerTap(m: ChartMarker) {
    setActiveMarker(prev => prev?.trade === m.trade ? null : m)
  }

  return (
    <>
      <div className="spse-range-tabs">
        {RANGES.map(r => (
          <button key={r} type="button" className={`spse-range-tab${range === r ? ' active' : ''}`}
            onClick={() => { setRange(r); setActiveMarker(null) }}>
            {r}
          </button>
        ))}
      </div>
      <EvolutionChart points={chartPoints} markers={markers} currentLabel={currentLabel} onMarkerTap={handleMarkerTap} />
      {activeMarker && <MarkerDetailCard marker={activeMarker} hidden={hidden} onClose={() => setActiveMarker(null)} />}
    </>
  )
}

function CostBasisAnalysisSection({ source, hidden }: { source: any; hidden: boolean }) {
  const avgCost = firstNumber(source.avg_price, source.avg_cost, source.avgCost) ?? 0
  const current = firstNumber(source.last, source.price, source.market_price) || avgCost || 0
  const gainPct  = avgCost > 0 ? ((current - avgCost) / avgCost) * 100 : null
  const isGain   = (gainPct ?? 0) >= 0
  const barMax   = Math.max(current, avgCost * 1.5, avgCost + 1)
  const fillPct  = avgCost > 0 ? clamp(((current - avgCost) / (barMax - avgCost)) * 100, 0, 100) : 0

  return (
    <>
      <div className="spse-cost-items">
        <div className="spse-cost-item">
          <span>Current Price</span><b>{formatMoney(current, hidden)}</b>
        </div>
        <div className="spse-cost-item">
          <span>Avg Cost</span><b>{formatMoney(avgCost, hidden)}</b>
        </div>
        <div className="spse-cost-item">
          <span>Gain vs Cost</span><b className={isGain ? 'positive' : 'negative'}>{formatPct(gainPct, hidden, true)}</b>
        </div>
      </div>
      <div className="spse-cost-bar-wrap">
        <div className="spse-cost-bar-track">
          <div className={`spse-cost-bar-fill${isGain ? '' : ' negative'}`} style={{ width: `${fillPct}%` }} />
        </div>
        <div className="spse-cost-bar-labels">
          <span>Avg {formatMoney(avgCost, hidden)}</span>
          <span>{formatMoney(current, hidden)}</span>
        </div>
      </div>
    </>
  )
}

function PositionContributionSection({ source, hidden, totalPositions }: { source: any; hidden: boolean; totalPositions: number }) {
  const portfolioPct = firstNumber(source.portfolio_pct, source.weight) ?? null
  const rank = firstNumber(source.portfolio_rank, source.rank) ?? null
  const contribution = portfolioPct != null ? portfolioPct * 0.55 : null
  const barFill = portfolioPct != null ? clamp(portfolioPct, 0, 100) : 0

  return (
    <>
      <div className="spse-contrib-items">
        <div className="spse-contrib-item">
          <span>Portfolio Weight</span><b className="accent">{formatPct(portfolioPct, hidden)}</b>
        </div>
        <div className="spse-contrib-item">
          <span>Portfolio Rank</span>
          <b>{rank != null ? `#${rank} of ${totalPositions || '—'}` : EMPTY}</b>
        </div>
        <div className="spse-contrib-item">
          <span>Contribution to Portfolio</span><b>{formatPct(contribution, hidden)}</b>
        </div>
      </div>
      <div className="spse-contrib-bar-track">
        <div className="spse-contrib-bar-fill" style={{ width: `${barFill}%` }} />
      </div>
    </>
  )
}

function TradeTimelineSection({ displayData, hidden }: { displayData: PositionDisplayData; hidden: boolean }) {
  const { trades, summary } = displayData

  function classifyTrade(index: number): { label: string; cls: string } {
    const t = trades[index]
    if (t.side === 'SELL') {
      return trades.slice(index + 1).some(x => x.side === 'BUY')
        ? { label: 'Trim', cls: 'trim' }
        : { label: 'Sell', cls: 'sell' }
    }
    return trades.slice(0, index).filter(x => x.side === 'BUY').length === 0
      ? { label: 'Buy', cls: 'buy' }
      : { label: 'Add', cls: 'add' }
  }

  return (
    <>
      <div className="spse-timeline">
        {trades.map((t, i) => {
          const { label, cls } = classifyTrade(i)
          const amount = t.quantity * t.price
          return (
            <div key={i} className="spse-timeline-row">
              <span className="spse-timeline-date">{fmtShortDate(t.date)}</span>
              <span className={`spse-timeline-type ${cls}`}>{label}</span>
              <span className="spse-timeline-shares">{t.quantity}</span>
              <span className="spse-timeline-price">{formatMoney(t.price, hidden)}</span>
              <span className="spse-timeline-amount">{formatMoney(amount, hidden, false, true)}</span>
            </div>
          )
        })}
      </div>
      {(summary?.total_quantity_bought != null || summary?.avg_buy_price != null) && (
        <div className="spse-timeline-footer">
          {summary?.total_quantity_bought != null && (
            <span>Total: <b>{summary.total_quantity_bought} shares</b></span>
          )}
          {summary?.avg_buy_price != null && (
            <span>Avg Buy: <b>{formatMoney(summary.avg_buy_price, hidden)}</b></span>
          )}
        </div>
      )}
    </>
  )
}

// ── Section Customize Sheet ────────────────────────────────────────────────────

function SectionCustomizeSheet({ prefs, onChange, onReset, onClose }: {
  prefs: SectionPrefs; onChange: (next: SectionPrefs) => void; onReset: () => void; onClose: () => void
}) {
  const hiddenSet = new Set(prefs.hidden)
  const [dragKey, setDragKey] = useState<SectionKey | null>(null)
  const dragRef = useRef<SectionKey | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const onDoubleTap = useDoubleTapToClose(onClose)

  function toggleSection(key: SectionKey) {
    const next = new Set(prefs.hidden)
    if (next.has(key)) next.delete(key); else next.add(key)
    onChange({ ...prefs, hidden: [...next] })
  }

  function reorderTo(key: SectionKey, targetKey: SectionKey) {
    if (key === targetKey) return
    const next = [...prefs.order]
    const from = next.indexOf(key), to = next.indexOf(targetKey)
    if (from < 0 || to < 0) return
    next.splice(from, 1); next.splice(to, 0, key)
    onChange({ ...prefs, order: next })
  }

  function onDown(event: PointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    event.preventDefault()
    const row = target.closest('[data-key]') as HTMLElement | null
    const key = row?.dataset.key as SectionKey | undefined
    if (!key || !OPTIONAL_SECTIONS.includes(key)) return
    dragRef.current = key; setDragKey(key)
    listRef.current?.setPointerCapture?.(event.pointerId)
  }

  function onMove(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    event.preventDefault()
    for (const row of Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]) {
      const rect = row.getBoundingClientRect()
      if (event.clientY >= rect.top && event.clientY < rect.bottom) {
        const tKey = row.dataset.key as SectionKey | undefined
        if (tKey && tKey !== dragRef.current) reorderTo(dragRef.current, tKey)
        break
      }
    }
  }

  function onUp(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null; setDragKey(null)
    try { listRef.current?.releasePointerCapture?.(event.pointerId) } catch {}
  }

  return (
    <div className="spse-cust-root" role="presentation">
      <button type="button" className="sps-sheet-overlay" aria-label="Close section customization" onClick={onClose} />
      <section className="spse-cust-sheet" role="dialog" aria-modal="true" aria-label="Customize sections" onClick={onDoubleTap}>
        <header className="spse-cust-head">
          <h3>Customize View</h3>
          <button type="button" className="spse-cust-reset" onClick={onReset}>Reset</button>
          <button type="button" className="spse-cust-close" aria-label="Close" onClick={onClose}>
            <X size={24} />
          </button>
        </header>

        <div className="spse-cust-subhead spse-cust-subhead-pinned">
          <strong>Always Visible</strong>
        </div>
        <div className="spse-cust-pinned-group">
          {PINNED_SECTIONS.map(key => (
            <div className="spse-cust-pinned-row" key={key}>
              <span>{SECTION_LABELS[key]}</span>
              <span className="spse-cust-pinned-badge">Always visible</span>
            </div>
          ))}
        </div>

        <div className="spse-cust-subhead">
          <strong>Optional Sections</strong>
          <span>Drag to reorder</span>
        </div>
        <ul
          className={`spse-cust-list${dragKey ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {prefs.order.map(key => {
            const on = !hiddenSet.has(key)
            return (
              <li className={`spse-cust-row${dragKey === key ? ' dragging' : ''}`} key={key} data-key={key}>
                <span>{SECTION_LABELS[key]}</span>
                <button type="button" className={`skm-edit-toggle${on ? ' on' : ''}`} aria-label={`${on ? 'Hide' : 'Show'} ${SECTION_LABELS[key]}`} aria-pressed={on} onClick={() => toggleSection(key)}>
                  <span />
                </button>
                <button type="button" className="spse-cust-grip stock-reorder-grip" data-grip aria-label={`Drag to reorder ${SECTION_LABELS[key]}`}>
                  <GripVertical size={22} />
                </button>
              </li>
            )
          })}
        </ul>
        <p className="spse-cust-tip">
          <Info size={14} className="sps-tip-icon" />
          Changes are saved automatically
        </p>
      </section>
    </div>
  )
}

// ── Expanded Sheet V3 ──────────────────────────────────────────────────────────

function ExpandedSheetV3({ source, hidden, onClose, totalPositions }: {
  source: any; hidden: boolean; onClose: () => void; totalPositions: number
}) {
  const [sectionPrefs, setSectionPrefs] = useState<SectionPrefs>(DEFAULT_SECTION_PREFS)
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const onDoubleTap = useDoubleTapToClose(onClose)

  useEffect(() => { setSectionPrefs(readSectionPrefs()) }, [])

  const symbol: string = source?.ticker || source?.symbol || source?.underlying || ''
  const analytics = useAnalyticsData(symbol || null)
  const stripItems  = useMemo(() => buildStripItems(source, hidden), [source, hidden])
  const health      = useMemo(() => computePositionHealth(source), [source])
  const displayData = useMemo(() => buildDisplayData(analytics), [analytics])

  function commitSectionPrefs(next: SectionPrefs) {
    const n = normalizeSectionPrefs(next)
    setSectionPrefs(n)
    try { window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(n)) } catch {}
  }

  const hiddenSet = new Set(sectionPrefs.hidden)

  function renderSection(key: SectionKey) {
    if (hiddenSet.has(key)) return null
    switch (key) {
      case 'positionHealth':
        return <SectionBlock key={key} title="Position Health"><PositionHealthSection health={health} /></SectionBlock>
      case 'positionValueEvolution':
        return <SectionBlock key={key} title="Position Value Evolution"><PositionValueEvolutionSection displayData={displayData} hidden={hidden} source={source} /></SectionBlock>
      case 'positionAnalytics':
        return <SectionBlock key={key} title="Position Analytics"><PositionAnalyticsSection displayData={displayData} hidden={hidden} /></SectionBlock>
      case 'costBasisAnalysis':
        return <SectionBlock key={key} title="Cost Basis Analysis"><CostBasisAnalysisSection source={source} hidden={hidden} /></SectionBlock>
      case 'positionContribution':
        return <SectionBlock key={key} title="Position Contribution"><PositionContributionSection source={source} hidden={hidden} totalPositions={totalPositions} /></SectionBlock>
      case 'tradeTimeline':
        return <SectionBlock key={key} title="Trade Timeline"><TradeTimelineSection displayData={displayData} hidden={hidden} /></SectionBlock>
      default:
        return null
    }
  }

  // Render order: pinned sections first, then optional (in user-defined order, minus hidden)
  const renderOrder: SectionKey[] = [
    ...PINNED_SECTIONS,
    ...sectionPrefs.order.filter(k => !hiddenSet.has(k)),
  ]

  return (
    <>
      <div className="sps-detail-root" role="presentation">
        <button type="button" className="sps-sheet-overlay" aria-label="Close position summary" onClick={onClose} />
        <section className="spse-sheet" role="dialog" aria-modal="true" aria-label="Position Summary" onClick={onDoubleTap}>
          <header className="spse-head">
            <h3>Position Summary</h3>
            <div className="spse-head-actions">
              <button type="button" className="spse-customize-btn" onClick={e => { e.stopPropagation(); setCustomizeOpen(true) }}>
                <Settings2 size={14} />
                Customize View
              </button>
              <button type="button" className="sps-sheet-close" aria-label="Close" onClick={onClose}>
                <X size={24} />
              </button>
            </div>
          </header>

          {/* 2×4 metrics grid — all 8 visible, no horizontal scroll */}
          <div className="spse-strip" role="list" aria-label="Position metrics">
            {stripItems.map((item, i) => (
              <div key={i} className="spse-strip-item" role="listitem">
                <span className="spse-strip-label">{item.label}</span>
                <b className={`spse-strip-value ${item.tone}`}>{item.value}</b>
                {item.sub ? <small className={`spse-strip-sub ${item.subTone || 'neutral'}`}>{item.sub}</small> : null}
              </div>
            ))}
          </div>

          <div className="spse-sections">
            {renderOrder.map(key => renderSection(key))}
          </div>

          <p className="spse-footer">
            <Info size={12} className="spse-footer-icon" />
            Your position history and analytics
          </p>
        </section>
      </div>

      {customizeOpen && (
        <SectionCustomizeSheet
          prefs={sectionPrefs}
          onChange={commitSectionPrefs}
          onReset={() => commitSectionPrefs(DEFAULT_SECTION_PREFS)}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </>
  )
}

// ── MetricCell & MetricRows (compact view — unchanged) ─────────────────────────

function MetricCell({ metric }: { metric: MetricValue }) {
  return (
    <div className={`sps-metric ${metric.tone}`}>
      <span>{metric.label}</span>
      <b>{metric.value}</b>
      {metric.sub ? <small className={metric.subTone || 'neutral'}>{metric.sub}</small> : null}
    </div>
  )
}

function MetricRows({ keys, metrics, className = '', compact = false }: {
  keys: MetricKey[]; metrics: Record<MetricKey, MetricValue>; className?: string; compact?: boolean
}) {
  const displayKeys = compact ? keys.slice(0, 9) : keys
  const rows = compact
    ? [displayKeys.slice(0, 3), displayKeys.slice(3, 6), displayKeys.slice(6, 9)].filter(r => r.length > 0)
    : [displayKeys.slice(0, 4), displayKeys.slice(4, 7), displayKeys.slice(7, 10)].filter(r => r.length > 0)
  const base = `sps-metric-rows${compact ? ' sps-compact-grid' : ''}${className ? ` ${className}` : ''}`
  return (
    <div className={base.trim()}>
      {rows.map((row, i) => (
        <div className={`sps-metric-row sps-metric-row-${row.length}`} key={`${i}-${row.join('-')}`}>
          {row.map(key => <MetricCell key={key} metric={metrics[key]} />)}
        </div>
      ))}
    </div>
  )
}

// ── Compact Customize Sheet (unchanged logic) ──────────────────────────────────

const MAX_COMPACT_METRICS = 9

function CustomizeSheet({ prefs, onChange, onReset, onClose }: {
  prefs: Prefs; onChange: (next: Prefs) => void; onReset: () => void; onClose: () => void
}) {
  const hiddenSet = new Set(prefs.hidden)
  const [dragKey, setDragKey] = useState<MetricKey | null>(null)
  const [maxWarning, setMaxWarning] = useState(false)
  const dragRef = useRef<MetricKey | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const warnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDoubleTap = useDoubleTapToClose(onClose)

  function showMaxWarning() {
    setMaxWarning(true)
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current)
    warnTimerRef.current = setTimeout(() => setMaxWarning(false), 2000)
  }

  function toggle(key: MetricKey) {
    const nextHidden = new Set(prefs.hidden)
    if (nextHidden.has(key)) {
      const currentVisible = prefs.order.length - nextHidden.size
      if (currentVisible >= MAX_COMPACT_METRICS) { showMaxWarning(); return }
      nextHidden.delete(key)
    } else {
      nextHidden.add(key)
    }
    onChange({ order: prefs.order, hidden: [...nextHidden] })
  }

  function reorderTo(key: MetricKey, targetKey: MetricKey) {
    if (key === targetKey) return
    const next = [...prefs.order]
    const from = next.indexOf(key), to = next.indexOf(targetKey)
    if (from < 0 || to < 0) return
    next.splice(from, 1); next.splice(to, 0, key)
    onChange({ order: next, hidden: prefs.hidden })
  }

  function onDown(event: PointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    event.preventDefault()
    const row = target.closest('[data-key]') as HTMLElement | null
    const key = row?.dataset.key as MetricKey | undefined
    if (!key || !DEFAULT_ORDER.includes(key)) return
    dragRef.current = key; setDragKey(key)
    listRef.current?.setPointerCapture?.(event.pointerId)
  }

  function onMove(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    event.preventDefault()
    for (const row of Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]) {
      const rect = row.getBoundingClientRect()
      if (event.clientY >= rect.top && event.clientY < rect.bottom) {
        const tKey = row.dataset.key as MetricKey | undefined
        if (tKey && tKey !== dragRef.current) reorderTo(dragRef.current, tKey)
        break
      }
    }
  }

  function onUp(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null; setDragKey(null)
    try { listRef.current?.releasePointerCapture?.(event.pointerId) } catch {}
  }

  return (
    <div className="sps-custom-root" role="presentation">
      <button type="button" className="sps-sheet-overlay" aria-label="Close position summary customization" onClick={onClose} />
      <section className="sps-custom-sheet" role="dialog" aria-modal="true" aria-label="Customize Position Summary" onClick={onDoubleTap}>
        <header className="sps-custom-head">
          <h3>Customize</h3>
          <button type="button" className="sps-custom-reset" onClick={onReset}>Reset</button>
          <button type="button" className="sps-custom-close" aria-label="Close customize" onClick={onClose}>
            <X size={24} />
          </button>
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
          {prefs.order.map(key => {
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
      {maxWarning && (
        <div className="sps-max-warning" role="alert" aria-live="assertive">
          <strong>Maximum reached</strong>
          <span>You can select up to 9 metrics.</span>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function StockPositionSummary({
  source,
  hidden,
  totalPositions = 0,
}: {
  source: any
  hidden: boolean
  totalPositions?: number
}) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useEffect(() => { setPrefs(readPrefs()) }, [])

  const data = useMemo(() => buildSummaryData(source, hidden), [source, hidden])
  const visibleKeys = prefs.order.filter(k => !prefs.hidden.includes(k))

  if (!hasPositionSummaryData(source)) return null

  function commitPrefs(nextPrefs: Prefs) {
    const normalized = normalizePrefs(nextPrefs)
    setPrefs(normalized)
    try { window.localStorage.setItem(COMPACT_STORAGE_KEY, JSON.stringify(normalized)) } catch {}
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
            onClick={e => { e.stopPropagation(); setCustomizeOpen(true) }}
          >
            <MoreHorizontal size={23} />
          </button>
        </header>
        <MetricRows keys={visibleKeys} metrics={data.metrics} compact />
      </section>

      {detailsOpen ? (
        <ExpandedSheetV3 source={source} hidden={hidden} onClose={() => setDetailsOpen(false)} totalPositions={totalPositions} />
      ) : null}
      {customizeOpen ? (
        <CustomizeSheet prefs={prefs} onChange={commitPrefs} onReset={() => commitPrefs(DEFAULT_PREFS)} onClose={() => setCustomizeOpen(false)} />
      ) : null}
    </>
  )
}
