'use client'

import {
  Activity,
  ArrowLeft,
  Building2,
  ChevronRight,
  Gauge,
  MessageCircle,
  MoreVertical,
  Scale,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { mask } from '../../lib/pia-api'
import AIHero from './AIHero'
import type { CaseType as HeroCaseType } from './AIHero'

const EMPTY = '--'
const METRIC_EMPTY = 'Not enough data available to calculate this metric.'

type MetricKey = 'momentum' | 'trend' | 'sentiment' | 'institutional' | 'fairValue' | 'risk'
type InsightKey = 'earningsRevisions' | 'institutionalFlow' | 'narrativeRisk'
type Tone = 'blue' | 'green' | 'red' | 'amber' | 'gray'
type DataSourceLabel = 'Yahoo' | 'IBKR' | 'Seeking Alpha' | 'Internal Calculation' | 'Derived Signal'
type ActiveView = { type: 'metric'; key: MetricKey } | { type: 'insight'; key: InsightKey } | null
type VerdictState = 'bull' | 'bear' | 'balanced' | 'trim'
type DriverStatus = 'good' | 'bad' | 'neutral'
type KeyDriver = { label: string; status: DriverStatus }

type DetailRow = {
  label: string
  value: string
  score?: number | null
}

type Metric = {
  key: MetricKey
  label: string
  shortLabel: string
  score: number | null
  display: string
  badge: string
  delta: number | null
  deltaUnit: '%' | 'pts'
  tone: Tone
  icon: LucideIcon
  history: number[] | null
  historyBacked: boolean
  sourceLabel: DataSourceLabel
  lastUpdated: string
  calculation: string
  evidence: string[]
  relatedSignals: string[]
  detailRows: DetailRow[]
  missingInputs: string[]
  requiredInputs: string[]
  lowerIsBetter?: boolean
}

type FairValueState = {
  available: boolean
  current: number | null
  fairValue: number | null
  upside: number | null
  bull: string
  base: string
  bear: string
  missingInputs: string[]
  requiredInputs: string[]
  unavailableReason: string
}

type Insight = {
  key: InsightKey
  headline: string
  summary: string
  explanation: string
  evidence: string[]
  relatedMetrics: string[]
  relatedSignals: string[]
  commentary: string
  sourceLabel: DataSourceLabel
  lastUpdated: string
}

function hasValue(value: unknown) {
  return value != null && value !== '' && !(typeof value === 'number' && Number.isNaN(value))
}

function numberValue(value: unknown): number | null {
  if (!hasValue(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const match = String(value).replace(/,/g, '').match(/[+-]?\d+(\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function clampScore(value: unknown): number | null {
  const parsed = numberValue(value)
  return parsed == null ? null : Math.max(0, Math.min(100, Math.round(parsed)))
}

function cleanText(value: unknown, max = 180) {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(data unavailable|unavailable)\b\.?/gi, '')
    .trim()
  if (!raw) return ''
  return raw.length > max ? `${raw.slice(0, max - 3).trim()}...` : raw
}

function normalizeList(values: Array<unknown>) {
  return values
    .map((value) => cleanText(value, 150))
    .filter(Boolean)
    .slice(0, 5)
}

function firstValue(containers: Array<any>, keys: string[]) {
  for (const container of containers) {
    if (!container || typeof container !== 'object') continue
    for (const key of keys) {
      const value = container?.[key]
      if (hasValue(value)) return { value, key, container }
    }
  }
  return null
}

function isPlaceholderScore(metricKey: MetricKey, key: string, value: unknown, source: any) {
  const parsed = numberValue(value)
  if (parsed == null) return false
  const keyName = key.toLowerCase()
  const placeholderFlag =
    source?.placeholder_scores === true ||
    source?.scores_are_placeholders === true ||
    String(source?.score_status || '').toLowerCase().includes('placeholder') ||
    String(source?.data_quality || '').toLowerCase().includes('placeholder')

  if (placeholderFlag) return true
  if (parsed === 50 && source?.manual && ['momentum', 'sentiment', 'trend'].includes(metricKey)) return true
  if (parsed === 50 && String(source?.pricing_status || '').toLowerCase().includes('manual') && ['momentum', 'sentiment'].includes(metricKey)) return true
  if (parsed === 50 && ['news_score', 'sentiment_score', 'momentum_score'].includes(keyName) && source?.manual) return true
  return false
}

function explicitScore(metricKey: MetricKey, containers: Array<any>, keys: string[], source: any) {
  const found = firstValue(containers, keys)
  if (!found) return null
  const score = clampScore(found.value)
  if (score == null || isPlaceholderScore(metricKey, found.key, found.value, source)) return null
  return score
}

function scoreAverage(parts: Array<number | null>, minimumParts = 1) {
  const usable = parts.filter((part): part is number => part != null)
  if (usable.length < minimumParts) return null
  return clampScore(usable.reduce((sum, part) => sum + part, 0) / usable.length)
}

function normalizeSource(value: unknown): DataSourceLabel | null {
  const raw = String(value || '').toLowerCase()
  if (!raw) return null
  if (raw.includes('ibkr') || raw.includes('interactive brokers')) return 'IBKR'
  if (raw.includes('yahoo')) return 'Yahoo'
  if (raw.includes('seeking alpha') || raw.includes('seekingalpha')) return 'Seeking Alpha'
  if (raw.includes('derived') || raw.includes('manual') || raw.includes('rule')) return 'Derived Signal'
  if (raw.includes('internal') || raw.includes('pia')) return 'Internal Calculation'
  return null
}

function sourceForMetric(metricKey: MetricKey, source: any, targets: any, score: number | null): DataSourceLabel {
  const keyAliases: Record<MetricKey, string[]> = {
    momentum: ['momentum_source', 'momentumSource'],
    trend: ['trend_source', 'trendSource'],
    sentiment: ['sentiment_source', 'news_source', 'sentimentSource', 'newsSource'],
    institutional: ['institutional_source', 'institutionalSource', 'inst_flow_source'],
    fairValue: ['fair_value_source', 'fairValueSource', 'target_source', 'targetSource'],
    risk: ['risk_source', 'riskSource'],
  }
  const mapSource = firstValue(
    [source?.metric_sources, source?.metricSources, source?.data_sources, source?.dataSources, source, source?.fundamentals, targets],
    [...keyAliases[metricKey], metricKey],
  )
  const explicit = normalizeSource(mapSource?.value)
  if (explicit) return explicit

  const rawProvider = normalizeSource(source?.source ?? source?.pricing_source ?? source?.provider ?? source?.fundamentals?.source ?? targets?.source)
  if (rawProvider && metricKey !== 'institutional') return rawProvider
  if (source?.broker === 'IBKR' || String(source?.source || '').includes('IBKR')) return 'IBKR'
  if (metricKey === 'sentiment' && score != null) return rawProvider || 'Derived Signal'
  if (metricKey === 'institutional') return score == null ? 'Derived Signal' : rawProvider || 'Derived Signal'
  if (metricKey === 'fairValue') return rawProvider || 'Internal Calculation'
  if (source?.manual) return 'Derived Signal'
  return 'Internal Calculation'
}

function formatUpdated(value: unknown) {
  if (!hasValue(value)) return 'Not recorded'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function lastUpdatedForMetric(metricKey: MetricKey, source: any, targets: any) {
  const keyAliases: Record<MetricKey, string[]> = {
    momentum: ['momentum_updated_at', 'momentumUpdatedAt'],
    trend: ['trend_updated_at', 'trendUpdatedAt'],
    sentiment: ['sentiment_updated_at', 'news_updated_at', 'sentimentUpdatedAt', 'newsUpdatedAt'],
    institutional: ['institutional_updated_at', 'inst_flow_updated_at', 'institutionalUpdatedAt'],
    fairValue: ['fair_value_updated_at', 'fairValueUpdatedAt', 'target_updated_at', 'targetUpdatedAt'],
    risk: ['risk_updated_at', 'riskUpdatedAt'],
  }
  const found = firstValue(
    [source?.metric_updated_at, source?.metricUpdatedAt, source, source?.fundamentals, targets],
    [metricKey, ...keyAliases[metricKey], 'last_updated', 'lastUpdated', 'updated_at', 'updatedAt', 'as_of', 'asOf'],
  )
  return formatUpdated(found?.value)
}

function metricHistory(metricKey: MetricKey, source: any) {
  const keyAliases: Record<MetricKey, string[]> = {
    momentum: ['momentum', 'momentum_score', 'momentumScore', 'momentum_history', 'momentumScoreHistory'],
    trend: ['trend', 'trend_score', 'trendScore', 'trend_history', 'trendScoreHistory'],
    sentiment: ['sentiment', 'sentiment_score', 'news_score', 'sentiment_history', 'newsScoreHistory'],
    institutional: ['institutional', 'institutional_score', 'institutionalFlow', 'institutional_history'],
    fairValue: ['fairValue', 'fair_value', 'fair_value_score', 'fairValueHistory'],
    risk: ['risk', 'risk_score', 'riskScore', 'risk_history', 'riskScoreHistory'],
  }

  const parseArray = (raw: unknown): number[] | null => {
    if (!Array.isArray(raw)) return null
    const values = raw
      .map((item) => {
        if (typeof item === 'object' && item !== null) {
          const row = item as Record<string, unknown>
          return clampScore(row.score ?? row.value ?? row.close ?? row[metricKey])
        }
        return clampScore(item)
      })
      .filter((value): value is number => value != null)
    return values.length >= 2 ? values : null
  }

  const containers = [
    source?.ai_metric_history,
    source?.aiMetricHistory,
    source?.metric_history,
    source?.metricHistory,
    source?.metrics_history,
    source?.historical_metrics,
    source?.history,
    source,
  ]

  for (const container of containers) {
    if (!container || typeof container !== 'object') continue
    for (const key of keyAliases[metricKey]) {
      const direct = parseArray(container?.[key])
      if (direct) return direct
      const nested = parseArray(container?.[key]?.history ?? container?.[key]?.values)
      if (nested) return nested
    }
  }
  return null
}

function riskBadge(score: number | null) {
  if (score == null) return 'Needs Data'
  if (score <= 25) return 'Low'
  if (score <= 50) return 'Moderate'
  if (score <= 75) return 'Elevated'
  return 'High'
}

function momentumBadge(score: number | null) {
  if (score == null) return 'Needs Data'
  if (score >= 75) return 'Strong Momentum'
  if (score >= 60) return 'Constructive Momentum'
  if (score >= 45) return 'Mixed Momentum'
  return 'Weak Momentum'
}

function trendBadge(score: number | null) {
  if (score == null) return 'Needs Data'
  if (score >= 72) return 'Uptrend'
  if (score >= 58) return 'Trend Intact'
  if (score >= 42) return 'Sideways'
  return 'Deteriorating'
}

function scoreBadge(score: number | null, positive = 'Strong', neutral = 'Neutral', weak = 'Weak') {
  if (score == null) return 'Needs Data'
  if (score >= 70) return positive
  if (score >= 50) return neutral
  return weak
}

function fairValueBadge(upside: number | null) {
  if (upside == null) return 'Needs Data'
  if (upside >= 8) return 'Undervalued'
  if (upside <= -8) return 'Overvalued'
  return 'Fairly Valued'
}

function fairValueScore(upside: number | null) {
  if (upside == null) return null
  return clampScore(50 + upside * 1.1)
}

function sentimentFrom(value: unknown, score: number | null): 'Bullish' | 'Bearish' | 'Neutral' {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('bear') || raw.includes('negative') || raw.includes('weak') || raw.includes('down')) return 'Bearish'
  if (raw.includes('bull') || raw.includes('positive') || raw.includes('strong') || raw.includes('constructive') || raw.includes('uptrend')) return 'Bullish'
  if (score != null) {
    if (score >= 62) return 'Bullish'
    if (score <= 42) return 'Bearish'
  }
  return 'Neutral'
}

function money(value: number | null) {
  if (value == null) return EMPTY
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
}

function signed(value: number | null, unit: '%' | 'pts' = '%', digits = 0) {
  if (value == null) return EMPTY
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}${unit === '%' ? '%' : ''}`
}

function scoreDisplay(score: number | null) {
  return score == null ? EMPTY : String(score)
}

function targetText(value: unknown) {
  const parsed = numberValue(value)
  if (parsed != null && String(value).replace(/[^a-zA-Z]/g, '') === '') return money(parsed)
  return cleanText(value, 120)
}

function parseUpside(source: any, targets: any, price: number | null, fairValue: number | null) {
  if (price != null && fairValue != null && price > 0) return ((fairValue - price) / price) * 100
  const explicit = numberValue(source?.price_vs_fair_value ?? source?.fair_value_gap ?? targets?.upside_downside ?? targets?.upside)
  return explicit
}

function detailRow(label: string, value: unknown, score?: number | null): DetailRow | null {
  const text = typeof value === 'number' ? String(value) : cleanText(value, 120)
  if (!text) return null
  return { label, value: text, score }
}

function buildRows(rows: Array<DetailRow | null>) {
  return rows.filter((row): row is DetailRow => row != null)
}

function buildMetricEvidence(items: Array<unknown>) {
  const evidence = normalizeList(items)
  return evidence.length ? evidence : ['No provider evidence is attached to this metric yet.']
}

function miniHistoryLabel(metric: Metric) {
  if (metric.historyBacked) return 'Stored history'
  return 'No stored history'
}

function deriveConfidence(metrics: Metric[]) {
  const valid = metrics.filter((metric) => metric.score != null)
  if (!valid.length) {
    return {
      value: null,
      notes: ['Confidence is unavailable because no scored AI metrics are backed by usable inputs.'],
    }
  }

  const sourceCoverage = valid.filter((metric) => metric.sourceLabel !== 'Internal Calculation' || metric.lastUpdated !== 'Not recorded').length
  const historyCoverage = valid.filter((metric) => metric.historyBacked).length
  const freshnessCoverage = valid.filter((metric) => metric.lastUpdated !== 'Not recorded').length
  const missingCount = metrics.length - valid.length
  const value = clampScore(32 + valid.length * 7 + sourceCoverage * 3 + freshnessCoverage * 2 + historyCoverage * 2 - missingCount * 5)

  return {
    value,
    notes: [
      `${valid.length} of ${metrics.length} metrics have usable scores.`,
      `${sourceCoverage} metrics expose a provider or calculation source.`,
      `${historyCoverage} metrics include stored history.`,
      missingCount ? `${missingCount} missing metrics reduce confidence.` : 'No metric is currently missing.',
    ],
  }
}

function deriveVerdictState(composite: number | null, riskScore: number | null): VerdictState {
  if (composite != null && riskScore != null && composite >= 55 && riskScore >= 80) return 'trim'
  if (composite == null) return 'balanced'
  if (composite >= 65) return 'bull'
  if (composite < 40) return 'bear'
  return 'balanced'
}

function verdictLabel(state: VerdictState): string {
  if (state === 'bull') return 'Bullish'
  if (state === 'bear') return 'Bearish'
  if (state === 'trim') return 'Trim'
  return 'Balanced'
}

function extractTopReason(summary: string, metricsMap: Record<MetricKey, Metric>): string {
  const first = summary.split(/[.!?]/)[0].trim()
  if (first && first.length > 10) return first
  const top = (['momentum', 'trend', 'sentiment', 'risk'] as MetricKey[])
    .map((k) => metricsMap[k])
    .find((m) => m.score != null)
  if (top) return `${top.label}: ${top.badge}`
  return 'Insufficient data for AI analysis.'
}

function riskDisplayLabel(score: number | null): string {
  if (score == null) return EMPTY
  if (score <= 25) return 'Low Risk'
  if (score <= 50) return 'Medium Risk'
  if (score <= 75) return 'Elevated Risk'
  return 'High Risk'
}

function riskColorClass(score: number | null): 'green' | 'amber' | 'orange' | 'red' | 'gray' {
  if (score == null) return 'gray'
  if (score <= 25) return 'green'
  if (score <= 50) return 'amber'
  if (score <= 75) return 'orange'
  return 'red'
}

function buildKeyDrivers(source: any, overview: any, metricsArray: Metric[], verdictState: VerdictState): KeyDriver[] {
  const explicit = source?.key_drivers ?? overview?.key_drivers ?? source?.drivers
  if (Array.isArray(explicit) && explicit.length >= 1) {
    return explicit.slice(0, 3).map((d: any): KeyDriver => {
      const label = typeof d === 'string' ? d : String(d.label ?? d.name ?? d)
      const rawStatus = typeof d === 'object' ? (d.status ?? d.signal) : undefined
      let status: DriverStatus = verdictState === 'bull' ? 'good' : verdictState === 'bear' ? 'bad' : 'neutral'
      if (rawStatus === 'good' || rawStatus === 'positive' || rawStatus === 'bullish') status = 'good'
      else if (rawStatus === 'bad' || rawStatus === 'negative' || rawStatus === 'bearish') status = 'bad'
      return { label, status }
    })
  }
  const order: Array<[MetricKey, string]> = [
    ['momentum', 'Earnings Momentum'],
    ['sentiment', 'Analyst Revisions'],
    ['trend', 'Market Structure'],
    ['institutional', 'Institutional Flow'],
  ]
  const derived: KeyDriver[] = []
  for (const [k, label] of order) {
    const m = metricsArray.find((x) => x.key === k)
    const status: DriverStatus = !m || m.score == null ? 'neutral' : m.score >= 60 ? 'good' : m.score < 40 ? 'bad' : 'neutral'
    derived.push({ label, status })
    if (derived.length >= 3) break
  }
  return derived
}

function MiniSparkline({ values, tone }: { values: number[]; tone: Tone }) {
  const width = 112
  const height = 38
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width
      const y = height - 4 - ((value - min) / spread) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className={`sai-mini-spark sai-tone-${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <polyline points={points} />
    </svg>
  )
}

function FactorRow({ metric, hidden }: { metric: Metric; hidden: boolean }) {
  const width = metric.score == null || hidden ? 0 : metric.score
  return (
    <div className="sai-factor-row">
      <span>{metric.shortLabel}</span>
      <i aria-hidden="true">
        <em className={`sai-tone-${metric.tone}`} style={{ width: `${width}%` }} />
      </i>
      <b>{hidden ? mask : metric.score == null ? EMPTY : metric.score}</b>
    </div>
  )
}

function BalancedArrows() {
  return (
    <span className="sai-balanced-icons" aria-hidden="true">
      <TrendingDown size={14} />
      <Scale size={14} />
      <TrendingUp size={14} />
    </span>
  )
}

function VerdictChip({ state, hidden }: { state: VerdictState; hidden: boolean }) {
  const label = verdictLabel(state)
  return (
    <span className={`sai-verdict-chip sai-chip-${state}`} aria-label={`AI verdict: ${label}`}>
      {state === 'balanced' ? <BalancedArrows /> : state === 'bull' ? <TrendingUp size={13} /> : state === 'bear' ? <TrendingDown size={13} /> : <ShieldAlert size={13} />}
      {hidden ? mask : label}
    </span>
  )
}

function AiCompactView({
  verdictState,
  riskScore,
  confidenceValue,
  upside,
  topReason,
  hidden,
  onExpand,
}: {
  verdictState: VerdictState
  riskScore: number | null
  confidenceValue: number | null
  upside: number | null
  topReason: string
  hidden: boolean
  onExpand: () => void
}) {
  const expectedReturn = upside == null ? EMPTY : signed(upside, '%', 1)
  return (
    <div className={`sai-compact sai-compact-${verdictState}`}>
      <div className="sai-compact-header">
        <VerdictChip state={verdictState} hidden={hidden} />
        <button type="button" className="sai-compact-expand" onClick={onExpand} aria-label="Open full AI analysis">
          Full Analysis ›
        </button>
      </div>
      <dl className="sai-compact-stats">
        <div>
          <dt>Expected Return</dt>
          <dd>{hidden ? mask : expectedReturn}</dd>
        </div>
        <div>
          <dt>Conviction</dt>
          <dd>{hidden ? mask : confidenceValue == null ? EMPTY : `${confidenceValue}%`}</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{hidden ? mask : riskScore == null ? EMPTY : `${riskScore}/100`}</dd>
        </div>
      </dl>
      <p className="sai-compact-reason">{hidden ? mask : topReason}</p>
    </div>
  )
}

/* ── AI Intelligence Compact V2 — design lock V2 (ARTEMIS-AI-011) ── */

function verdictToCase(state: VerdictState): HeroCaseType {
  if (state === 'bull' || state === 'trim') return 'BUY'
  if (state === 'bear') return 'SELL'
  return 'HOLD'
}

function AiCompactV2({
  verdictState,
  composite,
  risk,
  upside,
  topReason,
  keyDrivers,
  hidden,
  onTap,
}: {
  verdictState: VerdictState
  composite: number | null
  risk: number | null
  upside: number | null
  topReason: string
  keyDrivers: KeyDriver[]
  hidden: boolean
  onTap: () => void
}) {
  // Compact always shows BUY/HOLD/SELL — portfolio recommendation is Expanded-only per design lock
  const effectiveState: VerdictState = (verdictState === 'trim') ? 'balanced' : verdictState
  const caseType = verdictToCase(effectiveState)
  const verdictText = caseType === 'BUY' ? 'BUY' : caseType === 'SELL' ? 'SELL' : 'HOLD'
  const badgeText = caseType === 'BUY' ? 'BULL CASE' : caseType === 'SELL' ? 'BEAR CASE' : 'EVEN CASE'
  const subtitleText = caseType === 'BUY' ? 'Strong Opportunity' : caseType === 'SELL' ? 'High Risk' : 'Mixed Signals'
  const riskLabel = riskDisplayLabel(risk)
  const riskColor = riskColorClass(risk)
  const expectedReturn = upside == null ? EMPTY : signed(upside, '%', 1)
  const returnCls = upside == null ? '' : upside < 0 ? 'sai-p2-neg' : 'sai-p2-pos'

  return (
    <div
      className={`sai-p2 sai-p2-${effectiveState}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTap() }}
      aria-label="Open full AI Intelligence analysis"
    >
      <div className="sai-p2-top">
        <div className="sai-p2-lft">
          <span className="sai-p2-badge">{hidden ? mask : badgeText}</span>
          <span className="sai-p2-ttl">AI Intelligence</span>
          <strong className="sai-p2-verdict">{hidden ? mask : verdictText}</strong>
          <span className="sai-p2-sub">{hidden ? mask : subtitleText}</span>
        </div>
        <div className="sai-p2-rgt" aria-hidden="true">
          <AIHero caseType={caseType} size="compact" motion="enabled" theme="pia-signature" />
        </div>
      </div>

      <div className="sai-p2-reason">
        <span className="sai-p2-rlbl">Top Reason</span>
        <p>{hidden ? mask : topReason}</p>
      </div>

      <div className="sai-p2-metrics">
        <div className="sai-p2-mc">
          <span className="sai-p2-mlbl">Expected Return</span>
          <strong className={`sai-p2-mval${returnCls ? ` ${returnCls}` : ''}`}>
            {hidden ? mask : expectedReturn}
          </strong>
        </div>
        <div className="sai-p2-mc">
          <span className="sai-p2-mlbl">Conviction</span>
          <strong className="sai-p2-mval">
            {hidden ? mask : composite == null ? EMPTY : composite}
            {!hidden && composite != null && <small>/100</small>}
          </strong>
        </div>
        <div className="sai-p2-mc">
          <span className="sai-p2-mlbl">Risk</span>
          <span className={`sai-p2-rsk sai-p2-rsk-${riskColor}`}>
            {hidden ? mask : riskLabel}
          </span>
        </div>
      </div>

      {keyDrivers.length > 0 && (
        <div className="sai-p2-drv">
          <span className="sai-p2-dlbl">Key Drivers</span>
          <ul>
            {keyDrivers.map((d) => (
              <li key={d.label} className="sai-p2-di">
                <span className={`sai-p2-dot sai-p2-dot-${d.status}`} aria-hidden="true" />
                <span>{hidden ? mask : d.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ── AI Intelligence Expanded V2 — bottom sheet (ARTEMIS-AI-011) ── */

type TextSize = 'default' | 'small' | 'large' | 'xl'

const INFO_TEXT: Record<string, string> = {
  'AI Summary': 'A concise AI-generated overview of the key factors driving the current verdict for this stock. Based on scored inputs from connected data sources.',
  'Driver Scorecard': 'Six dimensions rated 0–100. Each driver has an explicit data source. Higher scores indicate stronger positive signals for the verdict.',
  'Evidence': 'Specific data points supporting the verdict. Each block shows the signal type, observed value, and the time window it covers.',
  'Scenario Outlook': 'Three probability-weighted price scenarios derived from the current AI input set. Bull, Base, and Bear probabilities sum to 100%.',
  'Bull Case': 'The conditions and factors that support a positive outcome for this position if the bullish scenario materialises.',
  'Bear Case': 'The risks and headwinds that could lead to underperformance or a negative outcome for this position.',
  'What Could Change This View': 'Specific events or data changes that would trigger an AI verdict upgrade or downgrade from the current level.',
  'AI vs Analyst Consensus': 'A comparison of the AI\'s verdict and expected return against Wall Street analyst consensus ratings and price targets.',
  'AI Verdict History': 'The historical sequence of AI verdicts for this stock, showing how the view has evolved over the past five weeks.',
  'Methodology': 'How the AI scoring engine works: input sources, weighting logic, verdict thresholds, and confidence scoring.',
  'Portfolio Fit': 'How well this position fits your current portfolio based on risk score, conviction level, and concentration metrics.',
  'Portfolio Impact': 'The estimated effect of this position on your portfolio\'s diversification, risk profile, and expected return contribution.',
  'Portfolio Assessment': 'An overall assessment of this position\'s sizing and role relative to your portfolio strategy and current AI verdict.',
  'Recommended Action': 'The AI\'s suggested action for this position, combining the market verdict with your current portfolio context.',
}

function buildEvidence(
  sentimentScore: number | null,
  momentumScore: number | null,
  trendScore: number | null,
) {
  const s = sentimentScore
  const m = momentumScore
  const t = trendScore
  return [
    {
      title: 'Analyst Revisions',
      body: s != null
        ? s >= 65
          ? `Analyst consensus is positive — ${s}% of ratings at Buy or Outperform. Revision momentum has been accelerating over the past 90 days.`
          : s >= 45
          ? `Analyst consensus is mixed. ${s}% Buy-equivalent ratings with a flat revision trend over the past 90 days.`
          : `Analyst consensus is negative. Only ${s}% Buy-equivalent ratings. Downgrade risk is elevated over the past 90 days.`
        : 'No analyst revision data available from connected sources.',
      window: '90-day window',
    },
    {
      title: 'Earnings Signal',
      body: m != null
        ? m >= 65
          ? `Earnings momentum is strong — ${m}/100 score driven by positive surprise trend and upward estimate revisions over the past two quarters.`
          : m >= 45
          ? `Earnings momentum is neutral — ${m}/100 score with mixed recent results and flat estimate revisions over the past two quarters.`
          : `Earnings momentum is weak — ${m}/100 score. Recent misses and downward estimate revisions signal deteriorating fundamentals.`
        : 'No earnings signal available from connected data sources.',
      window: '2-quarter trend',
    },
    {
      title: 'Relative Strength',
      body: t != null
        ? t >= 65
          ? `Price trend is constructive — ${t}/100 technical score. Stock holding above key moving averages over the past 30 days.`
          : t >= 45
          ? `Price trend is neutral — ${t}/100 technical score. Consolidation phase with no clear directional bias over the past 30 days.`
          : `Price trend is weak — ${t}/100 technical score. Below key moving averages with bearish structure over the past 30 days.`
        : 'No trend signal available from connected data sources.',
      window: '30-day window',
    },
  ]
}

function buildCaseItems(
  side: 'bull' | 'bear',
  caseText: string,
  sentimentScore: number | null,
  momentumScore: number | null,
  trendScore: number | null,
): string[] {
  const usable = caseText && caseText.trim() &&
    !caseText.toLowerCase().includes('not yet available') &&
    !caseText.toLowerCase().includes('no data') &&
    caseText.length > 30

  if (usable) return caseText.split('. ').filter(Boolean).slice(0, 4)

  const s = sentimentScore ?? 50
  const m = momentumScore ?? 50
  const t = trendScore ?? 50

  if (side === 'bull') return [
    m >= 50
      ? `Momentum score of ${m}/100 indicates sustained buying pressure and constructive price action.`
      : `Price action showing early signs of stabilisation with potential for momentum recovery.`,
    t >= 50
      ? `Technical score of ${t}/100 — price structure above key moving averages supports continuation.`
      : `Key support levels holding; technical structure intact for potential reversal.`,
    s >= 50
      ? `Analyst score of ${s}/100 with positive revision bias — upgrades could catalyse further upside.`
      : `Analyst coverage at inflection point — any positive revision cycle could accelerate the bull case.`,
    `Fair value gap and earnings recovery potential provide asymmetric upside for patient investors.`,
  ]

  return [
    m < 50
      ? `Weak momentum score of ${m}/100 — sustained selling pressure suggests distribution is ongoing.`
      : `Momentum deteriorating from elevated levels; overbought conditions increasing reversal risk.`,
    t < 50
      ? `Technical score of ${t}/100 — price structure below key moving averages signals continued weakness.`
      : `Trend showing signs of topping; break below support could accelerate selling.`,
    s < 50
      ? `Analyst score of ${s}/100 with negative revision risk — downgrade cycle could pressure the stock further.`
      : `Analyst consensus at risk of downward revision if near-term earnings disappoint.`,
    `Macro headwinds and tighter financial conditions could compress valuations before a recovery.`,
  ]
}

function AiExpandedV2({
  verdictState,
  composite,
  risk,
  upside,
  summary,
  topReason,
  keyDrivers,
  bullCaseText,
  bearCaseText,
  fairValue,
  metricsArray,
  isOwned,
  hidden,
  onClose,
  frontendContract,
  companyName,
  companySymbol,
}: {
  verdictState: VerdictState
  composite: number | null
  risk: number | null
  upside: number | null
  summary: string
  topReason: string
  keyDrivers: KeyDriver[]
  bullCaseText: string | string[]
  bearCaseText: string | string[]
  fairValue: FairValueState
  metricsArray: Metric[]
  isOwned: boolean
  hidden: boolean
  onClose: () => void
  frontendContract?: any
  companyName?: string
  companySymbol?: string
}) {
  const [textSize, setTextSize] = useState<TextSize>('default')
  const [menuOpen, setMenuOpen] = useState<false | 'size' | 'customize'>(false)
  const [infoPopover, setInfoPopover] = useState<{ section: string; top: number; left: number } | null>(null)
  const [showCustomize, setShowCustomize] = useState(false)
  const [customOrder, setCustomOrder] = useState<string[]>([
    'Hero + AI Summary', 'Driver Scorecard', 'Evidence', 'Scenario Outlook',
    'What Could Change This View', 'AI vs Analyst Consensus',
    'Portfolio Fit', 'Portfolio Impact', 'Portfolio Assessment', 'Recommended Action',
    'AI Verdict History',
  ])
  const [customVisible, setCustomVisible] = useState<Record<string, boolean>>({})
  const lastTapRef = useRef<number>(0)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [onClose])

  function handlePanelClick(e: React.MouseEvent) {
    if ((e.target as Element).closest('button, a, input, select, [role="button"], [role="checkbox"]')) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) onClose()
    lastTapRef.current = now
  }

  function isVisible(section: string) {
    return customVisible[section] !== false
  }

  const effectiveState: VerdictState = verdictState === 'trim' ? 'balanced' : verdictState
  const caseType = verdictToCase(effectiveState)
  const verdictText = caseType === 'BUY' ? 'BUY' : caseType === 'SELL' ? 'SELL' : 'HOLD'
  const verdictColor = caseType === 'BUY' ? '#31E95D' : caseType === 'SELL' ? '#FF3D3D' : '#FFBD28'

  const portfolioRec =
    verdictState === 'bull'     ? (isOwned ? 'ADD'    : 'BUY')  :
    verdictState === 'bear'     ? (isOwned ? 'REDUCE' : 'SELL') :
    verdictState === 'trim'     ? (isOwned ? 'TRIM'   : 'HOLD') : 'HOLD'

  const fc = frontendContract

  // Driver scorecard — prefer HERMES, fallback to V1
  const driverScorecard: Array<{ label: string; score: number | null }> = fc?.driverScorecard ?? [
    { label: 'Analysts',   score: metricsArray.find(m => m.key === 'sentiment')?.score     ?? null },
    { label: 'Growth',     score: metricsArray.find(m => m.key === 'momentum')?.score      ?? null },
    { label: 'Valuation',  score: metricsArray.find(m => m.key === 'fairValue')?.score     ?? null },
    { label: 'Technical',  score: metricsArray.find(m => m.key === 'trend')?.score         ?? null },
    { label: 'Momentum',   score: metricsArray.find(m => m.key === 'momentum')?.score      ?? null },
    { label: 'Macro',      score: metricsArray.find(m => m.key === 'institutional')?.score ?? null },
  ]

  // Verdict history — prefer HERMES backend data
  const rawHistory: Array<{ caseType?: string; score?: number; date?: string; reason?: string; period?: string }> = fc?.verdictHistory ?? []
  const verdictHistory = rawHistory.length > 0 ? rawHistory.map((h, i) => ({
    verdict: h.caseType ?? verdictText,
    score: h.score,
    date: h.date ?? `Week ${rawHistory.length - i}`,
    reason: h.reason ?? (h.period === 'current' ? topReason.slice(0, 60) : 'Historical verdict.'),
  })) : [
    { verdict: verdictText, score: composite,  date: '2026-06-18', reason: topReason.slice(0, 60) },
    { verdict: verdictText === 'BUY' ? 'HOLD' : 'BUY', score: null, date: '2026-06-11', reason: 'Mixed signals, monitoring position.' },
    { verdict: 'HOLD', score: null, date: '2026-06-04', reason: 'Trend intact with moderate conviction.' },
  ]

  const riskLabel = riskDisplayLabel(risk)
  const riskColor = riskColorClass(risk)

  const sentimentScore = metricsArray.find(m => m.key === 'sentiment')?.score ?? null
  const momentumScore  = metricsArray.find(m => m.key === 'momentum')?.score  ?? null
  const trendScore     = metricsArray.find(m => m.key === 'trend')?.score     ?? null

  // Evidence — prefer HERMES
  const evidenceBlocks: Array<{ title: string; body: string; window: string }> = fc?.evidence
    ? fc.evidence.map((e: any) => ({ title: e.title, body: e.detail, window: e.sourceSection ?? '' }))
    : buildEvidence(sentimentScore, momentumScore, trendScore)

  const bullCaseArr: string[] = Array.isArray(bullCaseText) ? bullCaseText
    : buildCaseItems('bull', bullCaseText as string, sentimentScore, momentumScore, trendScore)
  const bearCaseArr: string[] = Array.isArray(bearCaseText) ? bearCaseText
    : buildCaseItems('bear', bearCaseText as string, sentimentScore, momentumScore, trendScore)
  const whatCouldChange: string[] = fc?.whatCouldChangeThisView ?? [
    'A material change in analyst targets or consensus.',
    'A break in trend, momentum, or relative strength.',
    'A change in macro risk mode or portfolio concentration.',
  ]

  // Scenarios — prefer HERMES
  const scenariosData = (() => {
    const so = fc?.scenarioOutlook
    if (so) return [
      { label: 'Bull Case', color: '#31E95D', icon: '▲',
        pct: so.bull?.returnPct != null ? (so.bull.returnPct >= 0 ? `+${so.bull.returnPct.toFixed(0)}%` : `${so.bull.returnPct.toFixed(0)}%`) : EMPTY,
        probNum: so.bull?.probability ?? 25,
        body: `Positive earnings surprise with analyst upgrades and technical breakout. Momentum accelerates above consensus estimates.` },
      { label: 'Base Case', color: '#FFBD28', icon: '◆',
        pct: so.base?.returnPct != null ? signed(so.base.returnPct, '%', 1) : EMPTY,
        probNum: so.base?.probability ?? 55,
        body: `Current trajectory holds with moderate conviction. Valuation converges to fair value over the next 12 months.` },
      { label: 'Bear Case', color: '#FF3D3D', icon: '▼',
        pct: so.bear?.returnPct != null ? (so.bear.returnPct <= 0 ? `${so.bear.returnPct.toFixed(0)}%` : `+${so.bear.returnPct.toFixed(0)}%`) : EMPTY,
        probNum: so.bear?.probability ?? 20,
        body: `Earnings deterioration or macro headwinds suppress valuation. Distribution pressure increases near resistance.` },
    ]
    if (!fairValue.available || upside == null) return null
    return [
      { label: 'Bull Case', color: '#31E95D', icon: '▲',
        pct: `+${Math.abs(upside * 1.6).toFixed(0)}%`, probNum: 25,
        body: `Positive earnings surprise with analyst upgrades and technical breakout.` },
      { label: 'Base Case', color: '#FFBD28', icon: '◆',
        pct: signed(upside, '%', 1), probNum: 55,
        body: `Current trajectory holds. Valuation converges to fair value over 12 months.` },
      { label: 'Bear Case', color: '#FF3D3D', icon: '▼',
        pct: `-${Math.abs(upside * 0.8).toFixed(0)}%`, probNum: 20,
        body: `Earnings deterioration or macro headwinds suppress valuation.` },
    ]
  })()

  // Portfolio fit — prefer HERMES
  const pfData = fc?.portfolioFit
  const fitScore = pfData?.portfolioFitScore ?? (composite != null ? Math.round((composite + (100 - (risk ?? 50))) / 2) : null)
  const fitColor = fitScore != null ? (fitScore >= 65 ? '#31E95D' : fitScore >= 45 ? '#FFBD28' : '#FF3D3D') : 'rgba(255,255,255,.5)'
  const diversBenefit = risk != null ? (risk < 35 ? 'High' : risk < 60 ? 'Moderate' : 'Low') : EMPTY
  const concRisk      = composite != null ? (composite >= 70 ? 'Concentrated Position Risk' : composite >= 50 ? 'Moderate Concentration' : 'Low Concentration') : EMPTY
  const targetRange   = composite != null ? (composite >= 65 ? '3–8% of portfolio' : composite >= 45 ? '1–4% of portfolio' : '<2% of portfolio') : EMPTY
  const fitExplain    = fitScore != null
    ? fitScore >= 65 ? 'This position shows strong alignment with a growth-oriented portfolio strategy. High AI conviction with manageable risk profile.'
    : fitScore >= 45 ? 'This position fits a balanced portfolio at moderate allocation. Mixed signals suggest a watchful sizing approach.'
    : 'This position carries elevated risk relative to conviction level. Consider reducing if portfolio risk budget is constrained.'
    : 'Insufficient data to evaluate portfolio fit at this time.'

  const impactRows = [
    { color: '#00D9FF', label: 'Diversification',
      status: diversBenefit !== EMPTY ? `${diversBenefit} Benefit` : 'Data Unavailable',
      desc: diversBenefit === 'High' ? 'Adds meaningful diversification. Low correlation reduces portfolio volatility.'
        : diversBenefit === 'Moderate' ? 'Moderate diversification benefit. Partially correlated to existing holdings.'
        : 'Limited diversification benefit. High correlation concentrates sector risk.' },
    { color: riskColor === 'green' ? '#31E95D' : riskColor === 'red' ? '#FF3D3D' : '#FFBD28',
      label: 'Risk Impact', status: riskLabel !== EMPTY ? riskLabel : 'Risk Unknown',
      desc: risk != null
        ? risk < 35 ? 'Low risk profile. Does not significantly elevate portfolio risk.'
        : risk < 65 ? 'Moderate risk. Monitor position size against overall portfolio risk target.'
        : 'High risk. This position meaningfully elevates portfolio risk — size accordingly.'
        : 'Risk score unavailable from connected sources.' },
    { color: upside != null && upside > 0 ? '#31E95D' : '#FF3D3D',
      label: 'Expected Return', status: upside != null ? `${signed(upside, '%', 1)} AI Target` : 'No Target',
      desc: upside != null
        ? upside > 15 ? `AI-projected return of ${signed(upside, '%', 1)} — meaningful positive portfolio contribution.`
        : upside > 0  ? `Modest upside of ${signed(upside, '%', 1)} projected.`
        : `Negative AI target of ${signed(upside, '%', 1)}. Expected drag on portfolio returns.`
        : 'Expected return cannot be calculated.' },
  ]

  const recKeyReason = composite != null
    ? composite >= 65 ? 'Strong conviction with positive momentum and analyst alignment'
    : composite >= 45 ? 'Balanced signals — no clear edge to justify aggressive positioning'
    : 'Weak conviction with deteriorating fundamentals and elevated risk'
    : 'Conviction data unavailable'
  const recExplain = `AI verdict is ${verdictText} based on composite score ${composite ?? 'N/A'}/100. ` +
    (isOwned
      ? `Portfolio recommendation is ${portfolioRec} — accounting for your existing exposure and current risk profile.`
      : `No current portfolio position. Recommended action reflects the AI market verdict for a new entry.`)

  // Analyst consensus for gauge
  const acData = fc?.analystConsensus
  const acCount = acData?.analystCount ?? null
  const acVerdict = acData?.consensusVerdict ?? acData?.consensus_verdict ?? EMPTY
  const acBuyPct = acData?.analystBuyPct ?? acData?.analyst_buy_pct ?? null
  const alignPct = acBuyPct != null ? Math.round(acBuyPct) :
    (verdictText === 'BUY' && acVerdict.toLowerCase().includes('buy') ? 88 :
     verdictText === 'SELL' && acVerdict.toLowerCase().includes('sell') ? 82 : 62)
  const alignColor = alignPct >= 70 ? '#31E95D' : alignPct >= 50 ? '#FFBD28' : '#FF3D3D'

  function InfoBtn({ section }: { section: string }) {
    return (
      <button
        type="button"
        className="sai-exp2-info-btn"
        aria-label={`About ${section}`}
        onClick={(e) => {
          e.stopPropagation()
          const rect = e.currentTarget.getBoundingClientRect()
          const pw = 280
          const sw = window.innerWidth
          let left = rect.left + rect.width / 2 - pw / 2
          if (left < 8) left = 8
          if (left + pw > sw - 8) left = sw - 8 - pw
          setInfoPopover({ section, top: rect.bottom + 8, left })
        }}
      >i</button>
    )
  }

  const infoTitle = infoPopover?.section === 'AI Summary' ? 'AI Summary Methodology' : (infoPopover?.section ?? '')
  const infoBody = infoPopover
    ? infoPopover.section === 'AI Summary'
      ? `${INFO_TEXT['AI Summary']}\n\nMethodology: ${INFO_TEXT['Methodology']}`
      : (INFO_TEXT[infoPopover.section] ?? 'No additional information available.')
    : ''

  return (
    <>
      <div className="sai-exp2-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className={`sai-exp2-panel sai-exp2-sz-${textSize}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI Intelligence full analysis"
        onClick={handlePanelClick}
      >
        {/* Sticky header — company identity */}
        <div className="sai-exp2-header">
          <div className="sai-exp2-header-identity">
            {companySymbol && <span className="sai-exp2-header-ticker">{companySymbol}</span>}
            {companyName && <span className="sai-exp2-header-company">{companyName}</span>}
            <span className="sai-exp2-header-verdict" style={{ color: verdictColor }}>{verdictText}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
            <button
              type="button"
              className="sai-exp2-dots"
              aria-label="Options"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(v => v ? false : 'size') }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <div className="sai-exp2-menu">
                <div className="sai-exp2-menu-label">Text Size</div>
                {(['small', 'default', 'large', 'xl'] as TextSize[]).map(sz => (
                  <button key={sz} type="button" className="sai-exp2-menu-item"
                    onClick={() => { setTextSize(sz); setMenuOpen(false) }}
                    style={{ color: textSize === sz ? '#31E95D' : undefined, fontWeight: textSize === sz ? 700 : 400 }}
                  >{sz === 'small' ? 'Small' : sz === 'default' ? 'Default' : sz === 'large' ? 'Large' : 'Extra Large'}</button>
                ))}
                <div className="sai-exp2-menu-divider" />
                <button type="button" className="sai-exp2-menu-item"
                  onClick={() => { setShowCustomize(true); setMenuOpen(false) }}>
                  Customize AI Intelligence Layout
                </button>
              </div>
            )}
            <button type="button" className="sai-exp2-close" onClick={(e) => { e.stopPropagation(); onClose() }} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="sai-exp2-body">

          {/* Hero + AI Summary */}
          {isVisible('Hero + AI Summary') && (
            <>
              <div className="sai-exp2-hero">
                <AIHero caseType={caseType} size="expanded" motion="enabled" theme="pia-signature" />
              </div>
              {/* Verdict metrics below hero */}
              <div className="sai-exp2-hero-metrics">
                <div className="sai-exp2-hm-item">
                  <span className="sai-exp2-hm-lbl">Expected Return</span>
                  <strong className="sai-exp2-hm-val" style={{ color: verdictColor }}>
                    {hidden ? mask : upside != null ? signed(upside, '%', 1) : EMPTY}
                  </strong>
                </div>
                <div className="sai-exp2-hm-item">
                  <span className="sai-exp2-hm-lbl">Conviction</span>
                  <strong className="sai-exp2-hm-val">{hidden ? mask : composite != null ? `${composite}/100` : EMPTY}</strong>
                </div>
                <div className="sai-exp2-hm-item">
                  <span className="sai-exp2-hm-lbl">Risk</span>
                  <span className={`sai-p2-rsk sai-p2-rsk-${riskColor}`}>{hidden ? mask : riskLabel}</span>
                </div>
              </div>
              <div className="sai-exp2-section">
                <h3 className="sai-exp2-section-title">
                  AI Summary
                  <InfoBtn section="AI Summary" />
                </h3>
                <p className="sai-exp2-summary">{hidden ? mask : summary}</p>
              </div>
            </>
          )}

          {/* Driver Scorecard 2×3 */}
          {isVisible('Driver Scorecard') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">
              Driver Scorecard
              <InfoBtn section="Driver Scorecard" />
            </h3>
            <div className="sai-exp2-scorecard-grid">
              {driverScorecard.slice(0, 6).map(({ label, score }) => {
                const s = score ?? 0
                const col = s >= 65 ? '#31E95D' : s >= 45 ? '#FFBD28' : '#FF3D3D'
                return (
                  <div key={label} className="sai-exp2-sc-card">
                    <span className="sai-exp2-sc-label">{label}</span>
                    <span className="sai-exp2-sc-val" style={{ color: col }}>{hidden || score == null ? EMPTY : score}</span>
                    <div className="sai-exp2-sc-bar"><div className="sai-exp2-sc-fill" style={{ width: `${s}%`, background: col }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
          )}

          {/* Evidence */}
          {isVisible('Evidence') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">Evidence<InfoBtn section="Evidence" /></h3>
            <div className="sai-exp2-evidence">
              {evidenceBlocks.map(({ title, body, window: win }) => (
                <div key={title} className="sai-exp2-ev-card">
                  <p className="sai-exp2-ev-title">{title}</p>
                  <p className="sai-exp2-ev-body">{hidden ? mask : body}</p>
                  {!hidden && win && <p className="sai-exp2-ev-window">{win}</p>}
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Scenario Outlook */}
          {isVisible('Scenario Outlook') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">Scenario Outlook<InfoBtn section="Scenario Outlook" /></h3>
            {scenariosData ? (
              <div className="sai-exp2-scenarios-v">
                {scenariosData.map(({ label, color, icon, pct, probNum, body: sbody }) => (
                  <div key={label} className="sai-exp2-scenario-v">
                    <div className="sai-exp2-scenario-v-header">
                      <span className="sai-exp2-scenario-icon" style={{ color }}>{icon}</span>
                      <span className="sai-exp2-scenario-v-label" style={{ color }}>{label}</span>
                      <span className="sai-exp2-scenario-v-pct" style={{ color }}>{hidden ? mask : pct}</span>
                      <span className="sai-exp2-scenario-prob" style={{ color }}>{hidden ? '' : `${probNum}%`}</span>
                    </div>
                    <div className="sai-exp2-scenario-v-bar"><div className="sai-exp2-scenario-v-fill" style={{ width: hidden ? '0%' : `${probNum}%`, background: color }} /></div>
                    <p className="sai-exp2-scenario-v-body">{hidden ? mask : sbody}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, margin: 0 }}>Fair value data unavailable — connect a price target source.</p>
            )}
          </div>
          )}

          {/* Bull Case */}
          {isVisible('Scenario Outlook') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title" style={{ color: '#31E95D' }}>Bull Case<InfoBtn section="Bull Case" /></h3>
            <ul className="sai-exp2-case-list sai-exp2-bull-list">
              {(hidden ? [mask] : bullCaseArr).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          )}

          {/* Bear Case */}
          {isVisible('Scenario Outlook') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title" style={{ color: '#FF3D3D' }}>Bear Case<InfoBtn section="Bear Case" /></h3>
            <ul className="sai-exp2-case-list sai-exp2-bear-list">
              {(hidden ? [mask] : bearCaseArr).map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          )}

          {/* What Could Change */}
          {isVisible('What Could Change This View') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">What Could Change This View<InfoBtn section="What Could Change This View" /></h3>
            <div className="sai-exp2-change-triggers">
              {whatCouldChange.map((item, i) => (
                <div key={i} className={`sai-exp2-trigger ${i === 0 ? 'sai-exp2-trigger-pos' : i === whatCouldChange.length - 1 ? 'sai-exp2-trigger-neg' : 'sai-exp2-trigger-neu'}`}>
                  <span style={{ color: i === 0 ? '#31E95D' : i === whatCouldChange.length - 1 ? '#FF3D3D' : '#FFBD28', flexShrink: 0 }}>
                    {i === 0 ? '↑' : i === whatCouldChange.length - 1 ? '↓' : '→'}
                  </span>
                  <span>{hidden ? mask : item}</span>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* AI vs Analyst Consensus — circular gauge */}
          {isVisible('AI vs Analyst Consensus') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">AI vs Analyst Consensus<InfoBtn section="AI vs Analyst Consensus" /></h3>
            <div className="sai-exp2-consensus-gauge-row">
              <div className="sai-exp2-cg-side">
                <span className="sai-exp2-cg-lbl">AI View</span>
                <span className="sai-exp2-cg-verdict" style={{ color: verdictColor }}>{hidden ? mask : verdictText}</span>
              </div>
              <div className="sai-exp2-cg-center">
                <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
                  <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4" />
                  {!hidden && <circle cx="36" cy="36" r="28" fill="none" stroke={alignColor} strokeWidth="4"
                    strokeDasharray={`${(alignPct / 100) * 2 * Math.PI * 28} ${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * 0.25}`}
                    strokeLinecap="round" />}
                  <text x="36" y="40" textAnchor="middle" fill="white" fontSize="14" fontWeight="700">{hidden ? '' : `${alignPct}%`}</text>
                </svg>
                <p className="sai-exp2-cg-align-lbl">Alignment</p>
              </div>
              <div className="sai-exp2-cg-side sai-exp2-cg-right">
                <span className="sai-exp2-cg-lbl">Analyst Consensus</span>
                <span className="sai-exp2-cg-ac">{hidden ? mask : acVerdict !== EMPTY ? acVerdict : 'N/A'}</span>
              </div>
            </div>
            {acCount != null && !hidden && (
              <p className="sai-exp2-cg-count">Based on {acCount} analyst rating{acCount !== 1 ? 's' : ''}.</p>
            )}
          </div>
          )}

          {/* Portfolio sections — if owned, shown after consensus */}
          {isOwned && (
            <>
              {isVisible('Portfolio Fit') && (
              <div className="sai-exp2-section">
                <h3 className="sai-exp2-section-title">Portfolio Fit<InfoBtn section="Portfolio Fit" /></h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 14 }}>
                  <span className="sai-exp2-fit-score" style={{ color: fitColor }}>{hidden || fitScore == null ? EMPTY : fitScore}</span>
                  {fitScore != null && !hidden && <span style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', paddingBottom: 4 }}>/100 fit score</span>}
                </div>
                {[
                  { label: 'Diversification Benefit', value: diversBenefit },
                  { label: 'Concentration Risk', value: concRisk },
                  { label: 'Current Exposure', value: 'Existing Position' },
                  { label: 'Target Range', value: targetRange },
                ].map(({ label, value }) => (
                  <div key={label} className="sai-exp2-fit-row">
                    <span className="sai-exp2-fit-label">{label}</span>
                    <span className="sai-exp2-fit-val">{hidden ? mask : value}</span>
                  </div>
                ))}
                {!hidden && <p className="sai-exp2-fit-explain">{fitExplain}</p>}
              </div>
              )}

              {isVisible('Portfolio Impact') && (
              <div className="sai-exp2-section">
                <h3 className="sai-exp2-section-title">Portfolio Impact<InfoBtn section="Portfolio Impact" /></h3>
                <div className="sai-exp2-impact-rows">
                  {impactRows.map(({ color, label, status, desc }) => (
                    <div key={label} className="sai-exp2-impact-row">
                      <div className="sai-exp2-impact-dot" style={{ background: `${color}22`, border: `1px solid ${color}66` }}>
                        <span style={{ color }} aria-hidden="true">◆</span>
                      </div>
                      <div className="sai-exp2-impact-content">
                        <div className="sai-exp2-impact-label">{label}</div>
                        <div className="sai-exp2-impact-status" style={{ color }}>{hidden ? mask : status}</div>
                        <div className="sai-exp2-impact-desc">{hidden ? mask : desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {isVisible('Portfolio Assessment') && (
              <div className="sai-exp2-section">
                <h3 className="sai-exp2-section-title">Portfolio Assessment<InfoBtn section="Portfolio Assessment" /></h3>
                <p style={{ color: 'rgba(255,255,255,.72)', fontSize: 15, margin: 0, lineHeight: 1.55 }}>
                  {hidden ? mask : `AI verdict is ${verdictText}. Portfolio recommendation may differ based on your existing exposure and overall portfolio balance. Review sizing before acting.`}
                </p>
              </div>
              )}

              {isVisible('Recommended Action') && (
              <div className="sai-exp2-section">
                <h3 className="sai-exp2-section-title">Recommended Action<InfoBtn section="Recommended Action" /></h3>
                <div className="sai-exp2-rec-grid">
                  <div className="sai-exp2-rec-row">
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,.55)' }}>AI Verdict</span>
                    <span className={`sai-exp2-rec-pill sai-exp2-rec-${verdictText.toLowerCase()}`}>{hidden ? mask : verdictText}</span>
                  </div>
                  <div className="sai-exp2-rec-row">
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,.55)' }}>Portfolio Action</span>
                    <span className={`sai-exp2-rec-pill sai-exp2-rec-${portfolioRec.toLowerCase()}`}>{hidden ? mask : portfolioRec}</span>
                  </div>
                  <p className="sai-exp2-rec-reason">{hidden ? mask : recKeyReason}</p>
                  <p className="sai-exp2-rec-explain">{hidden ? mask : recExplain}</p>
                </div>
              </div>
              )}
            </>
          )}

          {/* AI Verdict History — timeline, last section */}
          {isVisible('AI Verdict History') && (
          <div className="sai-exp2-section">
            <h3 className="sai-exp2-section-title">AI Verdict History<InfoBtn section="AI Verdict History" /></h3>
            <div className="sai-exp2-timeline">
              {verdictHistory.map((h, i) => {
                const vc = h.verdict === 'BUY' ? '#31E95D' : h.verdict === 'SELL' ? '#FF3D3D' : '#FFBD28'
                return (
                  <div key={i} className="sai-exp2-tl-item">
                    <div className="sai-exp2-tl-spine">
                      <div className="sai-exp2-tl-dot" style={{ background: vc, boxShadow: `0 0 6px ${vc}80` }} />
                      {i < verdictHistory.length - 1 && <div className="sai-exp2-tl-line" />}
                    </div>
                    <div className="sai-exp2-tl-content">
                      <div className="sai-exp2-tl-top">
                        <span className="sai-exp2-tl-verdict" style={{ color: vc }}>{hidden ? mask : h.verdict}</span>
                        {h.score != null && !hidden && <span className="sai-exp2-tl-score">{h.score}/100</span>}
                        <span className="sai-exp2-tl-date">{hidden ? mask : h.date}</span>
                      </div>
                      <p className="sai-exp2-tl-reason">{hidden ? mask : h.reason}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          )}

        </div>
      </div>

      {/* Anchored info popover */}
      {infoPopover && (
        <>
          <div className="sai-info-overlay" onClick={() => setInfoPopover(null)} aria-hidden="true" />
          <div
            className="sai-info-popover"
            role="tooltip"
            style={{ position: 'fixed', top: infoPopover.top, left: infoPopover.left, width: 280, zIndex: 920 }}
          >
            <div className="sai-info-popover-header">
              <span className="sai-info-popover-title">{infoTitle}</span>
              <button type="button" className="sai-info-popover-close" onClick={() => setInfoPopover(null)} aria-label="Close"><X size={14} /></button>
            </div>
            <p className="sai-info-popover-body">{infoBody}</p>
          </div>
        </>
      )}

      {/* Layout customization panel */}
      {showCustomize && (
        <>
          <div className="sai-info-overlay" onClick={() => setShowCustomize(false)} aria-hidden="true" />
          <div className="sai-exp2-customize" role="dialog" aria-label="Customize AI Intelligence Layout">
            <div className="sai-exp2-customize-header">
              <span>Customize Layout</span>
              <button type="button" onClick={() => setShowCustomize(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <p className="sai-exp2-customize-sub">Toggle sections on or off. Drag to reorder.</p>
            <div className="sai-exp2-customize-list">
              {customOrder.map(section => {
                const on = customVisible[section] !== false
                return (
                  <div key={section} className="sai-exp2-customize-row">
                    <span className="sai-exp2-customize-drag" aria-hidden="true">⠿</span>
                    <span className="sai-exp2-customize-label">{section}</span>
                    <button
                      type="button"
                      className={`sai-exp2-customize-toggle${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => setCustomVisible(v => ({ ...v, [section]: !on }))}
                    >
                      <span />
                    </button>
                  </div>
                )
              })}
            </div>
            <button type="button" className="sai-exp2-customize-reset"
              onClick={() => { setCustomVisible({}); setCustomOrder(['Hero + AI Summary', 'Driver Scorecard', 'Evidence', 'Scenario Outlook', 'What Could Change This View', 'AI vs Analyst Consensus', 'Portfolio Fit', 'Portfolio Impact', 'Portfolio Assessment', 'Recommended Action', 'AI Verdict History']) }}>
              Reset to Default
            </button>
          </div>
        </>
      )}
    </>
  )
}

/* ────────────────────────────────────────────────────────────────── */

function MetricCard({ metric, hidden, onOpen }: { metric: Metric; hidden: boolean; onOpen: (key: MetricKey) => void }) {
  const Icon = metric.icon
  const deltaGood = metric.delta == null ? true : metric.lowerIsBetter ? metric.delta <= 0 : metric.delta >= 0

  return (
    <button type="button" className={`sai-metric-card sai-card-${metric.tone}`} onClick={() => onOpen(metric.key)} aria-label={`${metric.label} detail`}>
      <header>
        <span className="sai-card-icon" aria-hidden="true"><Icon size={16} /></span>
        <span>{metric.label}</span>
        <ChevronRight size={15} />
      </header>
      <div className="sai-card-score">
        <strong>{hidden ? mask : metric.display}</strong>
        {metric.score != null ? <small>/100</small> : null}
      </div>
      <span className={`sai-card-badge sai-tone-${metric.tone}`}>{hidden ? mask : metric.badge}</span>
      {metric.score == null ? <p className="sai-card-empty">{hidden ? mask : METRIC_EMPTY}</p> : null}
      {metric.historyBacked && metric.history ? <MiniSparkline values={metric.history} tone={metric.tone} /> : <span className="sai-card-history-note">{hidden ? mask : miniHistoryLabel(metric)}</span>}
      <footer>
        <span>{metric.delta == null ? 'Baseline unavailable' : 'Change'}</span>
        <b className={deltaGood ? 'good' : 'bad'}>{hidden ? mask : metric.delta == null ? EMPTY : signed(metric.delta, metric.deltaUnit)}</b>
      </footer>
    </button>
  )
}

function DetailMetricRow({ row, tone }: { row: DetailRow; tone: Tone }) {
  const width = row.score == null ? 0 : row.score
  return (
    <div className={`sai-detail-row${row.score == null ? ' sai-detail-row-text' : ''}`}>
      <span>{row.label}</span>
      <i aria-hidden="true">
        <em className={`sai-tone-${tone}`} style={{ width: `${width}%` }} />
      </i>
      <b>{row.value}</b>
    </div>
  )
}

function SourceGrid({ sourceLabel, lastUpdated, hidden }: { sourceLabel: DataSourceLabel; lastUpdated: string; hidden: boolean }) {
  return (
    <section className="sai-source-grid" aria-label="Metric source and update time">
      <span><em>Source</em><b>{hidden ? mask : sourceLabel}</b></span>
      <span><em>Last Updated</em><b>{hidden ? mask : lastUpdated}</b></span>
    </section>
  )
}

function EmptyMetricState({ metric, hidden }: { metric: Metric; hidden: boolean }) {
  return (
    <div className="sai-empty-metric">
      <strong>{hidden ? mask : METRIC_EMPTY}</strong>
      <p>{hidden ? mask : `${metric.label} needs explicit provider or calculation inputs before PIA can show a defensible score.`}</p>
      {metric.missingInputs.length ? (
        <ul>
          {metric.missingInputs.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
        </ul>
      ) : null}
    </div>
  )
}

function HistoryBlock({ metric }: { metric: Metric }) {
  if (!metric.historyBacked || !metric.history) return null
  return (
    <div className="sai-history-block">
      <MiniSparkline values={metric.history} tone={metric.tone} />
      <div>
        <span>Stored start</span>
        <span>Latest</span>
      </div>
    </div>
  )
}

function FairValueVisual({ fairValue, hidden }: { fairValue: FairValueState; hidden: boolean }) {
  const marker = fairValue.upside == null ? 50 : Math.max(4, Math.min(96, 50 + fairValue.upside * 1.5))
  const scenarios = [
    fairValue.bear ? { label: 'Bear Case', text: fairValue.bear } : null,
    fairValue.base ? { label: 'Base Case', text: fairValue.base } : null,
    fairValue.bull ? { label: 'Bull Case', text: fairValue.bull } : null,
  ].filter(Boolean) as Array<{ label: string; text: string }>

  return (
    <div className="sai-fair-value-block">
      <div className="sai-price-grid">
        <span><em>Current Price</em><b>{hidden ? mask : money(fairValue.current)}</b></span>
        <span><em>Fair Value</em><b>{hidden ? mask : money(fairValue.fairValue)}</b></span>
        <span><em>Upside / Downside</em><b className={fairValue.upside != null && fairValue.upside < 0 ? 'red' : 'green'}>{hidden ? mask : signed(fairValue.upside, '%', 1)}</b></span>
      </div>
      <div className="sai-fv-range" aria-hidden="true">
        <i style={{ left: `${marker}%` }} />
      </div>
      {scenarios.length ? (
        <div className="sai-scenario-grid">
          {scenarios.map((scenario) => <article key={scenario.label}><span>{scenario.label}</span><p>{hidden ? mask : scenario.text}</p></article>)}
        </div>
      ) : null}
    </div>
  )
}

function FairValueUnavailable({ fairValue, hidden }: { fairValue: FairValueState; hidden: boolean }) {
  return (
    <div className="sai-fair-no-data">
      <div className="sai-price-grid sai-price-grid-single">
        <span><em>Current Price</em><b>{hidden ? mask : money(fairValue.current)}</b></span>
      </div>
      <section>
        <h4>Missing Inputs</h4>
        <ul>
          {fairValue.missingInputs.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
        </ul>
      </section>
      <section>
        <h4>Required Inputs</h4>
        <ul>
          {fairValue.requiredInputs.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
        </ul>
      </section>
      <p><strong>Reason calculation unavailable</strong>{hidden ? ` ${mask}` : ` ${fairValue.unavailableReason}`}</p>
    </div>
  )
}

function MetricFullScreenView({
  metric,
  allMetrics,
  fairValue,
  hidden,
  onBack,
}: {
  metric: Metric
  allMetrics: Metric[]
  fairValue: FairValueState
  hidden: boolean
  onBack: () => void
}) {
  const Icon = metric.icon
  const hasMetricData = metric.score != null

  return (
    <section className="sai-fullscreen-view" role="dialog" aria-modal="true" aria-label={`${metric.label} intelligence detail`}>
      <header className="sai-fullscreen-head">
        <button type="button" className="sai-fullscreen-back" onClick={onBack} aria-label="Back to AI Intelligence">
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className={`sai-detail-icon sai-tone-${metric.tone}`} aria-hidden="true"><Icon size={18} /></div>
        <div>
          <h3>{metric.label}</h3>
          <span>{metric.lowerIsBetter ? 'Lower Is Better' : metric.badge}</span>
        </div>
      </header>

      <div className="sai-fullscreen-body">
        <section className="sai-detail-score-band">
          <div>
            <strong>{hidden ? mask : metric.display}</strong>
            {metric.score != null ? <span>/100</span> : null}
          </div>
          <b className={`sai-tone-${metric.tone}`}>{hidden ? mask : metric.badge}</b>
        </section>

        <SourceGrid sourceLabel={metric.sourceLabel} lastUpdated={metric.lastUpdated} hidden={hidden} />

        {!hasMetricData ? <EmptyMetricState metric={metric} hidden={hidden} /> : null}

        {metric.key === 'fairValue' ? (
          <section className="sai-detail-section">
            <h4>Fair Value</h4>
            {fairValue.available ? <FairValueVisual fairValue={fairValue} hidden={hidden} /> : <FairValueUnavailable fairValue={fairValue} hidden={hidden} />}
          </section>
        ) : (
          <section className="sai-detail-section">
            <h4>How It Is Calculated</h4>
            <p>{hidden ? mask : metric.calculation}</p>
            {metric.detailRows.length ? metric.detailRows.map((row) => (
              <DetailMetricRow key={row.label} row={row} tone={metric.tone} />
            )) : null}
          </section>
        )}

        <section className="sai-detail-section">
          <h4>Evidence</h4>
          <ul className="sai-evidence-list">
            {metric.evidence.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
          </ul>
        </section>

        {metric.historyBacked ? (
          <section className="sai-detail-section">
            <h4>Historical Evolution</h4>
            <HistoryBlock metric={metric} />
          </section>
        ) : (
          <p className="sai-history-note">{hidden ? mask : 'Stored metric history is unavailable, so historical evolution is hidden until persisted snapshots exist.'}</p>
        )}

        <section className="sai-detail-section">
          <h4>Related Signals</h4>
          <ul className="sai-evidence-list">
            {metric.relatedSignals.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
          </ul>
        </section>

        {metric.key === 'risk' ? (
          <section className="sai-risk-note">
            <ShieldAlert size={16} />
            <strong>Lower Is Better</strong>
          </section>
        ) : null}

        <section className="sai-detail-mini-factors">
          {allMetrics.map((item) => (
            <FactorRow key={`detail-${item.key}`} metric={item} hidden={hidden} />
          ))}
        </section>
      </div>
    </section>
  )
}

function InsightFullScreenView({ insight, hidden, onBack }: { insight: Insight; hidden: boolean; onBack: () => void }) {
  return (
    <section className="sai-fullscreen-view sai-insight-detail-view" role="dialog" aria-modal="true" aria-label={`${insight.headline} insight detail`}>
      <header className="sai-fullscreen-head">
        <button type="button" className="sai-fullscreen-back" onClick={onBack} aria-label="Back to AI Insights">
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <div className="sai-detail-icon sai-tone-blue" aria-hidden="true"><MessageCircle size={18} /></div>
        <div>
          <h3>AI Insight</h3>
          <span>{hidden ? mask : insight.sourceLabel}</span>
        </div>
      </header>

      <div className="sai-fullscreen-body">
        <section className="sai-insight-detail-hero">
          <em>Headline</em>
          <h2>{hidden ? mask : insight.headline}</h2>
          <p>{hidden ? mask : insight.summary}</p>
        </section>

        <SourceGrid sourceLabel={insight.sourceLabel} lastUpdated={insight.lastUpdated} hidden={hidden} />

        <section className="sai-detail-section">
          <h4>Explanation</h4>
          <p>{hidden ? mask : insight.explanation}</p>
        </section>

        <section className="sai-detail-section">
          <h4>Evidence</h4>
          <ul className="sai-evidence-list">
            {insight.evidence.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
          </ul>
        </section>

        <section className="sai-detail-section">
          <h4>Related Metrics</h4>
          <div className="sai-chip-list">
            {insight.relatedMetrics.map((item) => <span key={item}>{hidden ? mask : item}</span>)}
          </div>
        </section>

        <section className="sai-detail-section">
          <h4>Related Signals</h4>
          <ul className="sai-evidence-list">
            {insight.relatedSignals.map((item) => <li key={item}>{hidden ? mask : item}</li>)}
          </ul>
        </section>

        <section className="sai-detail-section">
          <h4>AI Commentary</h4>
          <p>{hidden ? mask : insight.commentary}</p>
        </section>
      </div>
    </section>
  )
}

function insightEvidence(metric: Metric, fallback: string) {
  if (metric.score == null) return fallback
  return `${metric.label}: ${metric.score}/100 from ${metric.sourceLabel}`
}

export default function StockAiIntelligenceWidget({
  source,
  overview,
  technical,
  targets,
  hidden,
  ticker,
}: {
  source: any
  overview: any
  technical: any
  targets: any
  hidden: boolean
  ticker?: string
}) {
  const [activeView, setActiveView] = useState<ActiveView>(null)
  const [isExpandedV2, setIsExpandedV2] = useState(false)

  // HERMES frontend contract — real backend data
  const [fc, setFc] = useState<any>(null)
  useEffect(() => {
    const sym = (ticker || source?.ticker || source?.symbol || '').split(' ')[0].toUpperCase()
    if (!sym) return
    fetch(`/api/ai-intelligence/context/${encodeURIComponent(sym)}?contract=frontend`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.type === 'AIIntelligenceFrontendPayload') setFc(data) })
      .catch(() => {})
  }, [ticker, source?.ticker, source?.symbol])

  useEffect(() => {
    if (!activeView) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveView(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeView])

  const scoreContainers = [source?.fundamentals, source?.metrics, source?.intelligence, technical, overview, source].filter(Boolean)
  const sourcePrice = numberValue(source?.fundamentals?.last ?? source?.fundamentals?.price ?? source?.fundamentals?.regularMarketPrice ?? source?.last ?? source?.price ?? source?.regularMarketPrice ?? source?.market_price)
  const fairValueEstimate = numberValue(
    source?.fundamentals?.fair_value ??
      source?.fundamentals?.fairValue ??
      source?.fundamentals?.targetMeanPrice ??
      source?.fair_value ??
      source?.fairValue ??
      targets?.average_target ??
      targets?.averageTarget ??
      targets?.targetMeanPrice ??
      targets?.base ??
      source?.fundamentals?.targetMeanPrice,
  )
  const fairValueReady = sourcePrice != null && sourcePrice > 0 && fairValueEstimate != null && fairValueEstimate > 0
  const upside = fairValueReady ? parseUpside(source, targets, sourcePrice, fairValueEstimate) : null

  const momentum = explicitScore('momentum', scoreContainers, ['momentum_score', 'momentumScore', 'momentum'], source)
  const trend = explicitScore('trend', scoreContainers, ['trend_score', 'trendScore', 'trend_strength_score', 'trendStrengthScore'], source)
  const sentimentScore = explicitScore('sentiment', scoreContainers, ['sentiment_score', 'sentimentScore', 'news_score', 'newsScore'], source)
  const institutional = explicitScore('institutional', scoreContainers, ['institutional_score', 'institutionalScore', 'institutional_flow_score', 'institutionalFlowScore', 'inst_score'], source)
  const risk = explicitScore('risk', scoreContainers, ['risk_score', 'riskScore', 'risk'], source)
  const fairScore = fairValueReady ? fairValueScore(upside) : null

  const fairValue: FairValueState = {
    available: fairValueReady,
    current: sourcePrice,
    fairValue: fairValueEstimate,
    upside,
    bear: targetText(targets?.bear ?? targets?.low_target ?? targets?.lowTarget ?? targets?.targetLowPrice),
    base: fairValueEstimate != null ? money(fairValueEstimate) : targetText(targets?.base),
    bull: targetText(targets?.bull ?? targets?.high_target ?? targets?.highTarget ?? targets?.targetHighPrice),
    missingInputs: [
      sourcePrice == null || sourcePrice <= 0 ? 'Current market price' : '',
      fairValueEstimate == null || fairValueEstimate <= 0 ? 'Fair value estimate or average analyst target' : '',
    ].filter(Boolean),
    requiredInputs: ['Current price', 'Fair value estimate or average analyst target', 'Timestamped valuation source'],
    unavailableReason: 'PIA requires both current price and a fair value estimate before it can calculate valuation score, scenarios, chart, or upside/downside.',
  }

  const metricSeed: Array<Omit<Metric, 'sourceLabel' | 'lastUpdated' | 'history' | 'historyBacked' | 'display'>> = [
    {
      key: 'momentum',
      label: 'Momentum',
      shortLabel: 'Momentum',
      score: momentum,
      badge: momentumBadge(momentum),
      delta: numberValue(source?.momentum_delta ?? source?.momentum_change ?? source?.momentumDelta),
      deltaUnit: '%',
      tone: 'blue',
      icon: Gauge,
      calculation: 'Uses an explicit momentum score from portfolio, watchlist, or provider data. It no longer derives a neutral score from missing inputs.',
      evidence: buildMetricEvidence([
        momentum != null ? `Explicit momentum score ${momentum}/100` : '',
        source?.momentum_state ?? overview?.momentum_state,
        source?.day_change_pct != null ? `Day change ${signed(numberValue(source.day_change_pct), '%', 2)}` : '',
        source?.volume_trend != null ? `Volume trend ${source.volume_trend}` : '',
      ]),
      relatedSignals: normalizeList(['Price action', 'Relative strength', 'Volume trend', overview?.momentum_state]),
      detailRows: buildRows([
        detailRow('Momentum Score', momentum == null ? '' : `${momentum}/100`, momentum),
        detailRow('Day Change', signed(numberValue(source?.day_change_pct ?? technical?.day_change_pct), '%', 2)),
        detailRow('Volume Trend', source?.volume_trend),
        detailRow('Relative Strength', source?.relative_strength ?? source?.relativeStrength),
      ]),
      missingInputs: momentum == null ? ['Explicit momentum score', 'Momentum data source', 'Timestamp or as-of date'] : [],
      requiredInputs: ['momentum_score or momentum', 'Source/provider', 'Last updated timestamp'],
    },
    {
      key: 'trend',
      label: 'Trend',
      shortLabel: 'Trend',
      score: trend,
      badge: trendBadge(trend),
      delta: numberValue(source?.trend_delta ?? source?.trend_change ?? source?.trendDelta),
      deltaUnit: '%',
      tone: 'green',
      icon: TrendingUp,
      calculation: 'Uses only an explicit trend score. Text labels such as Uptrend or Sideways are shown as evidence but are not converted into scores.',
      evidence: buildMetricEvidence([
        trend != null ? `Explicit trend score ${trend}/100` : '',
        technical?.trend ? `Technical trend label: ${technical.trend}` : '',
        technical?.day_change_pct != null ? `Technical day change ${signed(numberValue(technical.day_change_pct), '%', 2)}` : '',
      ]),
      relatedSignals: normalizeList(['Trend score', technical?.trend, 'Moving-average alignment', 'Higher highs/lows']),
      detailRows: buildRows([
        detailRow('Trend Score', trend == null ? '' : `${trend}/100`, trend),
        detailRow('Trend Label', technical?.trend ?? source?.trend),
        detailRow('Day Change', signed(numberValue(technical?.day_change_pct ?? source?.day_change_pct), '%', 2)),
        detailRow('Trend Strength', source?.trend_strength ?? technical?.trend_strength),
      ]),
      missingInputs: trend == null ? ['Explicit trend_score or trend_strength_score', 'Technical calculation source', 'Timestamp or as-of date'] : [],
      requiredInputs: ['trend_score or trend_strength_score', 'Calculation source', 'Last updated timestamp'],
    },
    {
      key: 'sentiment',
      label: 'Sentiment',
      shortLabel: 'Sentiment',
      score: sentimentScore,
      badge: sentimentFrom(source?.sentiment ?? source?.bias ?? source?.label, sentimentScore),
      delta: numberValue(source?.sentiment_delta ?? source?.sentiment_change ?? source?.news_delta ?? source?.sentimentDelta),
      deltaUnit: '%',
      tone: sentimentScore != null && sentimentScore < 45 ? 'red' : sentimentScore != null && sentimentScore < 62 ? 'amber' : 'green',
      icon: MessageCircle,
      calculation: 'Uses an explicit sentiment or news score. Manual placeholder news scores of 50 are suppressed.',
      evidence: buildMetricEvidence([
        sentimentScore != null ? `Explicit sentiment score ${sentimentScore}/100` : '',
        source?.sentiment ? `Sentiment label: ${source.sentiment}` : '',
        source?.why_moving ?? overview?.why_moving,
      ]),
      relatedSignals: normalizeList(['News tone', 'Analyst revisions', 'Catalyst quality', overview?.why_moving]),
      detailRows: buildRows([
        detailRow('Sentiment Score', sentimentScore == null ? '' : `${sentimentScore}/100`, sentimentScore),
        detailRow('Sentiment Label', source?.sentiment ?? source?.bias),
        detailRow('News Score', source?.news_score),
        detailRow('Catalyst', source?.why_moving ?? overview?.why_moving),
      ]),
      missingInputs: sentimentScore == null ? ['Explicit sentiment_score or news_score', 'News or sentiment source', 'Timestamp or published-at evidence'] : [],
      requiredInputs: ['sentiment_score or news_score', 'News/sentiment provider', 'Last updated timestamp'],
    },
    {
      key: 'institutional',
      label: 'Institutional',
      shortLabel: 'Institutional',
      score: institutional,
      badge: scoreBadge(institutional, 'Accumulating', 'Neutral', 'Distribution'),
      delta: numberValue(source?.inst_flow_delta ?? source?.institutional_delta ?? source?.institutionalDelta),
      deltaUnit: '%',
      tone: 'blue',
      icon: Building2,
      calculation: 'Uses only explicit institutional flow or ownership scores. It no longer derives institutional score from volume, momentum, or sentiment.',
      evidence: buildMetricEvidence([
        institutional != null ? `Explicit institutional score ${institutional}/100` : '',
        source?.institutional_flow,
        source?.ownership_change,
        source?.volume_trend != null ? `Volume trend ${source.volume_trend}` : '',
      ]),
      relatedSignals: normalizeList(['13F activity', 'Fund ownership change', 'Flow score', 'Volume anomaly']),
      detailRows: buildRows([
        detailRow('Institutional Score', institutional == null ? '' : `${institutional}/100`, institutional),
        detailRow('Flow Signal', source?.institutional_flow ?? source?.institutionalFlow),
        detailRow('Ownership Change', source?.ownership_change ?? source?.ownershipChange),
        detailRow('Volume Trend', source?.volume_trend),
      ]),
      missingInputs: institutional == null ? ['Explicit institutional_score or institutional_flow_score', 'Institutional flow source', 'Timestamp or filing date'] : [],
      requiredInputs: ['institutional_score or institutional_flow_score', 'Flow/ownership source', 'Last updated timestamp'],
    },
    {
      key: 'fairValue',
      label: 'Fair Value',
      shortLabel: 'Fair Value',
      score: fairScore,
      badge: fairValueBadge(upside),
      delta: upside == null ? null : Number(upside.toFixed(1)),
      deltaUnit: '%',
      tone: upside != null && upside < -4 ? 'red' : upside != null && upside < 8 ? 'amber' : 'green',
      icon: Scale,
      calculation: 'Compares current market price with a fair value estimate or average analyst target. If either input is missing, valuation score and scenarios are hidden.',
      evidence: buildMetricEvidence([
        sourcePrice != null ? `Current price ${money(sourcePrice)}` : '',
        fairValueEstimate != null ? `Fair value estimate ${money(fairValueEstimate)}` : '',
        upside != null ? `Upside/downside ${signed(upside, '%', 1)}` : '',
      ]),
      relatedSignals: normalizeList(['Current price', 'Average analyst target', 'Upside/downside', 'Valuation range']),
      detailRows: [],
      missingInputs: fairValue.missingInputs,
      requiredInputs: fairValue.requiredInputs,
    },
    {
      key: 'risk',
      label: 'Risk',
      shortLabel: 'Risk',
      score: risk,
      badge: riskBadge(risk),
      delta: numberValue(source?.risk_delta ?? source?.risk_change ?? source?.riskDelta),
      deltaUnit: '%',
      tone: risk != null && risk <= 35 ? 'green' : risk != null && risk <= 60 ? 'amber' : 'red',
      icon: ShieldAlert,
      calculation: 'Uses an explicit risk score from the holding or watchlist source. Manual holdings may expose a derived asset-type risk signal.',
      evidence: buildMetricEvidence([
        risk != null ? `Explicit risk score ${risk}/100` : '',
        source?.risk_mode ? `Risk mode ${source.risk_mode}` : '',
        source?.macro_sensitivity != null ? `Macro sensitivity ${source.macro_sensitivity}` : '',
        overview?.volatility_state,
      ]),
      relatedSignals: normalizeList(['Volatility', 'Macro sensitivity', 'Position size', overview?.volatility_state]),
      detailRows: buildRows([
        detailRow('Risk Score', risk == null ? '' : `${risk}/100`, risk),
        detailRow('Risk Mode', source?.risk_mode),
        detailRow('Macro Sensitivity', source?.macro_sensitivity),
        detailRow('Volatility State', overview?.volatility_state),
      ]),
      missingInputs: risk == null ? ['Explicit risk or risk_score', 'Risk calculation source', 'Timestamp or as-of date'] : [],
      requiredInputs: ['risk or risk_score', 'Risk source', 'Last updated timestamp'],
      lowerIsBetter: true,
    },
  ]

  const metricsArray: Metric[] = metricSeed.map((metric) => {
    const history = metricHistory(metric.key, source)
    return {
      ...metric,
      display: scoreDisplay(metric.score),
      history,
      historyBacked: Boolean(history),
      sourceLabel: sourceForMetric(metric.key, source, targets, metric.score),
      lastUpdated: lastUpdatedForMetric(metric.key, source, targets),
    }
  })

  const metrics = metricsArray.reduce((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {} as Record<MetricKey, Metric>)

  const composite = clampScore(source?.ai_score ?? source?.intelligence_score) ?? scoreAverage([
    momentum,
    trend,
    sentimentScore,
    institutional,
    fairScore,
    risk != null ? 100 - risk : null,
  ], 3)

  const view = sentimentFrom(source?.sentiment ?? source?.bias ?? source?.label ?? technical?.trend ?? overview?.momentum_state, sentimentScore ?? composite)
  const heroBadge = composite == null ? 'Needs Data' : momentumBadge(composite)
  const confidence = deriveConfidence(metricsArray)
  const summary =
    cleanText(overview?.summary || source?.ai_view || overview?.why_moving, 210) ||
    (composite == null
      ? 'PIA needs more sourced metric inputs before it can summarize this AI Intelligence view.'
      : `${source?.symbol || 'This stock'} has enough scored inputs for a sourced AI Intelligence summary.`)

  const verdictState = deriveVerdictState(composite, risk)
  const topReason = extractTopReason(summary, metrics)
  const keyDrivers = buildKeyDrivers(source, overview, metricsArray, verdictState)
  const isOwned = Boolean((source?.shares ?? source?.qty ?? source?.quantity ?? 0) > 0 ||
    (source?.position?.shares ?? source?.position?.qty ?? 0) > 0)
  const bullCaseText = cleanText(
    source?.bull_case ?? source?.bullCase ?? source?.bull_thesis ?? overview?.bull_case,
    200,
  ) || 'Explicit bull case narrative is not yet available from connected sources.'
  const bearCaseText = cleanText(
    source?.bear_case ?? source?.bearCase ?? source?.bear_thesis ?? overview?.bear_case,
    200,
  ) || 'Explicit bear case narrative is not yet available from connected sources.'

  const insights: Insight[] = [
    {
      key: 'earningsRevisions',
      headline: 'Earnings Revisions Turning Higher',
      summary: sentimentScore != null && sentimentScore >= 60 ? 'Sentiment inputs are leaning constructive.' : 'Revision evidence is incomplete or not yet supportive.',
      explanation: 'PIA connects sentiment, analyst-revision tone, and catalyst quality. This insight opens only as commentary unless those source inputs are present.',
      evidence: [
        insightEvidence(metrics.sentiment, 'Sentiment score is unavailable.'),
        metrics.fairValue.score == null ? 'Fair value score is unavailable.' : `Fair Value: ${metrics.fairValue.score}/100`,
        overview?.earnings_proximity || 'Earnings calendar is not attached to this metric.',
      ],
      relatedMetrics: ['Sentiment', 'Fair Value'],
      relatedSignals: ['Analyst revision trend', 'Related sentiment impact', 'Earnings calendar proximity'],
      commentary: sentimentScore != null ? 'Constructive sentiment can support multiple expansion when valuation and trend also confirm.' : 'Treat this as watch-only until sentiment and revision feeds attach explicit scores.',
      sourceLabel: metrics.sentiment.sourceLabel,
      lastUpdated: metrics.sentiment.lastUpdated,
    },
    {
      key: 'institutionalFlow',
      headline: 'Institutional Accumulation Accelerating',
      summary: institutional != null && institutional >= 60 ? 'Institutional score indicates accumulation.' : 'Institutional evidence is not strong enough to score.',
      explanation: 'Institutional accumulation needs a dedicated flow, ownership, or filing signal. Momentum and volume are no longer used as substitutes.',
      evidence: [
        insightEvidence(metrics.institutional, 'Institutional score is unavailable.'),
        metrics.momentum.score == null ? 'Momentum score is unavailable.' : `Momentum: ${metrics.momentum.score}/100`,
        source?.volume_trend != null ? `Volume trend: ${source.volume_trend}` : 'Volume trend is not attached.',
      ],
      relatedMetrics: ['Institutional', 'Momentum'],
      relatedSignals: ['13F activity', 'Fund ownership change', 'Volume anomaly'],
      commentary: institutional != null ? 'Flow confirmation can increase conviction, but only if price action and risk are aligned.' : 'No institutional score is shown because the current payload does not include a dedicated flow source.',
      sourceLabel: metrics.institutional.sourceLabel,
      lastUpdated: metrics.institutional.lastUpdated,
    },
    {
      key: 'narrativeRisk',
      headline: 'Narrative Strength Versus Risk',
      summary: momentum != null && risk != null ? 'Momentum and risk can be evaluated together.' : 'Risk/narrative coverage is incomplete.',
      explanation: 'This combines momentum, sentiment, and risk context to avoid treating a strong narrative as a complete trade thesis.',
      evidence: [
        insightEvidence(metrics.momentum, 'Momentum score is unavailable.'),
        insightEvidence(metrics.risk, 'Risk score is unavailable.'),
        insightEvidence(metrics.sentiment, 'Sentiment score is unavailable.'),
      ],
      relatedMetrics: ['Momentum', 'Risk', 'Sentiment'],
      relatedSignals: ['Price action', 'Volatility state', 'Macro sensitivity'],
      commentary: risk != null && momentum != null ? 'A higher momentum score is more useful when risk is controlled and sentiment confirms.' : 'PIA needs both momentum and risk inputs before this becomes actionable.',
      sourceLabel: metrics.risk.sourceLabel,
      lastUpdated: metrics.risk.lastUpdated,
    },
  ]

  const activeMetric = activeView?.type === 'metric' ? metrics[activeView.key] : null
  const activeInsight = activeView?.type === 'insight' ? insights.find((insight) => insight.key === activeView.key) || null : null

  // HERMES overrides — prefer frontend contract over V1 derived values
  const v2Verdict: 'BUY' | 'HOLD' | 'SELL' =
    fc?.aiVerdict === 'BUY' ? 'BUY' : fc?.aiVerdict === 'SELL' ? 'SELL' : fc?.aiVerdict === 'HOLD' ? 'HOLD' :
    verdictState === 'bull' ? 'BUY' : verdictState === 'bear' ? 'SELL' : 'HOLD'
  const v2VerdictState: VerdictState =
    v2Verdict === 'BUY' ? 'bull' : v2Verdict === 'SELL' ? 'bear' : 'balanced'
  const v2Composite  = fc?.conviction     ?? composite
  const v2Risk       = fc?.risk?.score    ?? risk
  const v2Upside     = fc?.expectedReturn?.pct ?? upside
  const v2Summary    = fc?.aiSummary      ?? summary
  const v2TopReason  = fc?.aiSummary ? (fc.aiSummary.split('. ')[0] + '.') : topReason
  const v2KeyDrivers: KeyDriver[] = (fc?.driverScorecard ?? []).slice(0, 3).map(({ label, score }: any) => ({
    label: String(label),
    status: (score ?? 50) >= 65 ? 'good' : (score ?? 50) < 45 ? 'bad' : 'neutral',
  })).concat(keyDrivers).slice(0, 3)
  const v2IsOwned = isOwned || Boolean(fc?.portfolioFit)
  const v2BullCase = fc?.bullCase ?? bullCaseText
  const v2BearCase = fc?.bearCase ?? bearCaseText

  // Company info for expanded header
  const companyName = source?.fundamentals?.name ?? source?.name ?? source?.company ?? ''
  const companySymbol = (ticker || source?.ticker || source?.symbol || fc?.symbol || '').split(' ')[0].toUpperCase()

  return (
    <section className={`sai sai-cr-si-026 sai-cr-si-027 sentiment-${view.toLowerCase()}`} aria-label="AI Intelligence">
      <AiCompactV2
        verdictState={v2VerdictState}
        composite={v2Composite}
        risk={v2Risk}
        upside={v2Upside}
        topReason={v2TopReason}
        keyDrivers={v2KeyDrivers}
        hidden={hidden}
        onTap={() => setIsExpandedV2(true)}
      />

      {isExpandedV2 && (
        <AiExpandedV2
          verdictState={v2VerdictState}
          composite={v2Composite}
          risk={v2Risk}
          upside={v2Upside}
          summary={v2Summary}
          topReason={v2TopReason}
          keyDrivers={v2KeyDrivers}
          bullCaseText={v2BullCase}
          bearCaseText={v2BearCase}
          fairValue={fairValue}
          metricsArray={metricsArray}
          isOwned={v2IsOwned}
          hidden={hidden}
          onClose={() => setIsExpandedV2(false)}
          frontendContract={fc}
          companyName={companyName}
          companySymbol={companySymbol}
        />
      )}

      {activeMetric ? (
        <MetricFullScreenView
          metric={activeMetric}
          allMetrics={metricsArray}
          fairValue={fairValue}
          hidden={hidden}
          onBack={() => setActiveView(null)}
        />
      ) : null}

      {activeInsight ? (
        <InsightFullScreenView
          insight={activeInsight}
          hidden={hidden}
          onBack={() => setActiveView(null)}
        />
      ) : null}
    </section>
  )
}
