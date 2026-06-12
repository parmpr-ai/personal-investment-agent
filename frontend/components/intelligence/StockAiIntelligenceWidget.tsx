'use client'

import {
  Activity,
  Building2,
  ChevronRight,
  Clock,
  Gauge,
  Info,
  MessageCircle,
  Scale,
  ShieldAlert,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties } from 'react'
import { mask } from '../../lib/pia-api'

const EMPTY = '-'
const METRIC_EMPTY = 'Not enough data available to calculate this metric.'

type MetricKey = 'momentum' | 'trend' | 'sentiment' | 'institutional' | 'fairValue' | 'risk'
type Tone = 'blue' | 'green' | 'red' | 'amber' | 'gray'

type DetailRow = {
  label: string
  score: number | null
  contribution?: number | null
  value?: string
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
  spark: number[]
  lowerIsBetter?: boolean
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

function scoreFromParts(parts: Array<number | null>, fallback: number | null = null) {
  const usable = parts.filter((part): part is number => part != null)
  if (!usable.length) return fallback
  return clampScore(usable.reduce((sum, part) => sum + part, 0) / usable.length)
}

function cleanText(value: unknown, max = 180) {
  const raw = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\b(data unavailable|unavailable)\b\.?/gi, '')
    .trim()
  if (!raw) return ''
  return raw.length > max ? `${raw.slice(0, max - 3).trim()}...` : raw
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

function deriveTrend(technical: any, source: any): number | null {
  const explicit = clampScore(technical?.trend_score ?? source?.trend_score ?? source?.trend_strength)
  if (explicit != null) return explicit

  const trendText = String(technical?.trend || source?.trend || '').toLowerCase()
  if (trendText.includes('strong') && trendText.includes('up')) return 78
  if (trendText.includes('uptrend')) return 74
  if (trendText.includes('mild uptrend')) return 64
  if (trendText.includes('sideways')) return 50
  if (trendText.includes('pullback')) return 40
  if (trendText.includes('downtrend')) return 28

  const change = numberValue(technical?.day_change_pct ?? source?.day_change_pct ?? source?.change_pct)
  if (change == null) return null
  return clampScore(52 + change * 8)
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

function updatedLabel(source: any) {
  const raw = source?.last_updated ?? source?.updated_at ?? source?.as_of
  if (!hasValue(raw)) return '2m ago'
  const date = new Date(String(raw))
  if (Number.isNaN(date.getTime())) return String(raw)
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function formatTargetCase(value: unknown, fallback: string) {
  const text = cleanText(value, 120)
  return text || fallback
}

function buildSpark(score: number | null, delta: number | null, lowerIsBetter = false) {
  const base = score ?? 50
  const drift = delta ?? (lowerIsBetter ? 3 : 6)
  const direction = lowerIsBetter ? -drift : drift
  return [
    base - direction * 0.8 - 6,
    base - direction * 0.5 - 2,
    base - direction * 0.3 + 3,
    base - direction * 0.15 - 1,
    base + direction * 0.1 + 2,
    base + direction * 0.35,
    base + direction * 0.55 + 4,
    base + direction * 0.75,
    base + direction,
  ].map((value) => Math.max(4, Math.min(96, Math.round(value))))
}

function contributionRows(score: number | null, labels: string[], weights: number[]): DetailRow[] {
  return labels.map((label, index) => {
    if (score == null) return { label, score: null, contribution: null }
    const contribution = Math.max(1, Math.round(score * weights[index]))
    return {
      label,
      score: Math.max(8, Math.min(100, Math.round((contribution / Math.max(1, score * Math.max(...weights))) * 88))),
      contribution,
    }
  })
}

function parseUpside(source: any, targets: any, price: number | null, fairValue: number | null) {
  const explicit = numberValue(source?.price_vs_fair_value ?? source?.fair_value_gap ?? targets?.upside_downside ?? targets?.upside)
  if (explicit != null) return explicit
  if (price != null && fairValue != null && price > 0) return ((fairValue - price) / price) * 100
  return null
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
      <MiniSparkline values={metric.spark} tone={metric.tone} />
      <footer>
        <span>vs. 3M avg</span>
        <b className={deltaGood ? 'good' : 'bad'}>{hidden ? mask : signed(metric.delta, metric.deltaUnit)}</b>
      </footer>
    </button>
  )
}

function DetailMetricRow({ row, tone }: { row: DetailRow; tone: Tone }) {
  const width = row.score == null ? 0 : row.score
  const display = row.value ?? (row.contribution == null ? EMPTY : `+${row.contribution}`)
  return (
    <div className="sai-detail-row">
      <span>{row.label}</span>
      <i aria-hidden="true">
        <em className={`sai-tone-${tone}`} style={{ width: `${width}%` }} />
      </i>
      <b>{display}</b>
    </div>
  )
}

function EmptyMetricState({ label }: { label: string }) {
  return (
    <div className="sai-empty-metric">
      <strong>{METRIC_EMPTY}</strong>
      <p>{label} needs enough price history, volume, and provider inputs before PIA can calculate a reliable score.</p>
    </div>
  )
}

function HistoryBlock({ metric }: { metric: Metric }) {
  return (
    <div className="sai-history-block">
      <MiniSparkline values={metric.spark} tone={metric.tone} />
      <div>
        <span>3M</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function FairValueVisual({
  current,
  fairValue,
  upside,
  bull,
  base,
  bear,
  hidden,
}: {
  current: number | null
  fairValue: number | null
  upside: number | null
  bull: string
  base: string
  bear: string
  hidden: boolean
}) {
  const marker = upside == null ? 50 : Math.max(4, Math.min(96, 50 + upside * 1.5))

  return (
    <div className="sai-fair-value-block">
      <div className="sai-price-grid">
        <span><em>Current Price</em><b>{hidden ? mask : money(current)}</b></span>
        <span><em>Fair Value</em><b>{hidden ? mask : money(fairValue)}</b></span>
        <span><em>Upside / Downside</em><b className={upside != null && upside < 0 ? 'red' : 'green'}>{hidden ? mask : signed(upside, '%', 1)}</b></span>
      </div>
      <div className="sai-fv-range" aria-hidden="true">
        <i style={{ left: `${marker}%` }} />
      </div>
      <div className="sai-scenario-grid">
        <article><span>Bear Case</span><p>{hidden ? mask : bear}</p></article>
        <article><span>Base Case</span><p>{hidden ? mask : base}</p></article>
        <article><span>Bull Case</span><p>{hidden ? mask : bull}</p></article>
      </div>
    </div>
  )
}

function MetricDetailSheet({
  metric,
  allMetrics,
  detailRows,
  fairValue,
  hidden,
  onClose,
}: {
  metric: Metric
  allMetrics: Record<MetricKey, Metric>
  detailRows: Record<MetricKey, DetailRow[]>
  fairValue: {
    current: number | null
    fairValue: number | null
    upside: number | null
    bull: string
    base: string
    bear: string
  }
  hidden: boolean
  onClose: () => void
}) {
  const Icon = metric.icon
  const hasMetricData = metric.score != null
  const commentary: Record<MetricKey, string> = {
    momentum: 'Price action is strongest when moving averages, volume trend, and relative strength confirm the same direction.',
    trend: 'The trend remains useful when higher highs, higher lows, ADX, and moving-average alignment agree.',
    sentiment: 'News tone, analyst revisions, social flow, and insider activity help identify whether the narrative is improving or fading.',
    institutional: 'Institutional accumulation can support follow-through when fund ownership and volume signals move together.',
    fairValue: 'Fair value compares current price against base-case estimates and scenario targets before sizing new risk.',
    risk: 'Risk combines volatility, beta, balance-sheet stress, earnings stability, and drawdown behavior. Lower Is Better.',
  }

  return (
    <>
      <button type="button" className="sai-detail-backdrop" aria-label="Close metric detail" onClick={onClose} />
      <section className="sai-detail-sheet" role="dialog" aria-modal="true" aria-label={`${metric.label} detail`}>
        <header className="sai-detail-head">
          <div className={`sai-detail-icon sai-tone-${metric.tone}`} aria-hidden="true"><Icon size={18} /></div>
          <div>
            <h3>{metric.label}</h3>
            {metric.key === 'risk' ? <span>Lower Is Better</span> : null}
          </div>
          <button type="button" className="sai-detail-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>

        <div className="sai-detail-body">
          <section className="sai-detail-score-band">
            <div>
              <strong>{hidden ? mask : metric.display}</strong>
              {metric.score != null ? <span>/100</span> : null}
            </div>
            <b className={`sai-tone-${metric.tone}`}>{hidden ? mask : metric.badge}</b>
          </section>

          {!hasMetricData ? <EmptyMetricState label={metric.label} /> : null}

          {metric.key === 'fairValue' ? (
            <section className="sai-detail-section">
              <h4>Fair Value Range</h4>
              <FairValueVisual {...fairValue} hidden={hidden} />
            </section>
          ) : (
            <section className="sai-detail-section">
              <h4>How It Is Calculated</h4>
              {detailRows[metric.key].map((row) => (
                <DetailMetricRow key={row.label} row={row} tone={metric.tone} />
              ))}
            </section>
          )}

          {metric.key === 'momentum' ? (
            <section className="sai-detail-section">
              <h4>Contribution Breakdown</h4>
              {detailRows.momentum.map((row) => (
                <DetailMetricRow key={`contribution-${row.label}`} row={row} tone="blue" />
              ))}
            </section>
          ) : null}

          <section className="sai-detail-section">
            <h4>Historical Evolution</h4>
            <HistoryBlock metric={metric} />
          </section>

          <section className="sai-detail-section">
            <h4>{metric.key === 'momentum' || metric.key === 'fairValue' ? 'Why It Matters' : 'AI Commentary'}</h4>
            <p>{hidden ? mask : commentary[metric.key]}</p>
          </section>

          {metric.key === 'risk' ? (
            <section className="sai-risk-note">
              <ShieldAlert size={16} />
              <strong>Lower Is Better</strong>
            </section>
          ) : null}

          <section className="sai-detail-mini-factors">
            {Object.values(allMetrics).map((item) => (
              <FactorRow key={`sheet-${item.key}`} metric={item} hidden={hidden} />
            ))}
          </section>
        </div>
      </section>
    </>
  )
}

export default function StockAiIntelligenceWidget({
  source,
  overview,
  technical,
  targets,
  hidden,
}: {
  source: any
  overview: any
  technical: any
  targets: any
  hidden: boolean
}) {
  const [activeSheet, setActiveSheet] = useState<MetricKey | null>(null)

  useEffect(() => {
    if (!activeSheet) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveSheet(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeSheet])

  const sourcePrice = numberValue(source?.last ?? source?.price ?? source?.regularMarketPrice ?? source?.market_price)
  const targetBase = numberValue(source?.fair_value ?? targets?.average_target ?? targets?.averageTarget ?? targets?.base)
  const fairValueEstimate = targetBase ?? null
  const upside = parseUpside(source, targets, sourcePrice, fairValueEstimate)

  const momentum = clampScore(source?.momentum_score ?? source?.momentum)
  const trend = deriveTrend(technical, source)
  const sentimentScore = clampScore(source?.sentiment_score ?? source?.news_score)
  const risk = clampScore(source?.risk)
  const institutional = clampScore(
    source?.institutional_score ??
      source?.institutional_flow_score ??
      scoreFromParts([
        clampScore(source?.volume_trend),
        momentum != null ? Math.round(momentum * 0.82) : null,
        sentimentScore != null ? Math.round(sentimentScore * 0.72) : null,
      ]),
  )
  const fairScore = fairValueScore(upside)
  const composite = clampScore(
    source?.ai_score ??
      source?.intelligence_score ??
      scoreFromParts([
        momentum,
        trend,
        sentimentScore,
        institutional,
        fairScore,
        risk != null ? 100 - risk : null,
      ], 78),
  )

  const view = sentimentFrom(source?.sentiment ?? source?.bias ?? source?.label ?? technical?.trend ?? overview?.momentum_state, sentimentScore ?? composite)
  const heroBadge = momentumBadge(momentum ?? composite)
  const confidence = clampScore(source?.confidence ?? (composite != null ? composite + 4 : null)) ?? 82
  const updated = updatedLabel(source)
  const summary =
    cleanText(overview?.summary || source?.ai_view || overview?.why_moving, 210) ||
    `${source?.symbol || 'This stock'} continues to show ${heroBadge.toLowerCase()} with improving price action, supportive sentiment, and disciplined risk context.`

  const metricsArray: Metric[] = [
    {
      key: 'momentum',
      label: 'Momentum',
      shortLabel: 'Momentum',
      score: momentum,
      display: scoreDisplay(momentum),
      badge: momentumBadge(momentum),
      delta: numberValue(source?.momentum_delta ?? source?.momentum_change) ?? (momentum == null ? null : Math.round((momentum - 50) / 1.6)),
      deltaUnit: '%',
      tone: 'blue',
      icon: Gauge,
      spark: buildSpark(momentum, numberValue(source?.momentum_delta ?? source?.momentum_change)),
    },
    {
      key: 'trend',
      label: 'Trend',
      shortLabel: 'Trend',
      score: trend,
      display: scoreDisplay(trend),
      badge: trendBadge(trend),
      delta: numberValue(source?.trend_delta ?? source?.trend_change) ?? (trend == null ? null : Math.round((trend - 50) / 2)),
      deltaUnit: '%',
      tone: 'green',
      icon: TrendingUp,
      spark: buildSpark(trend, numberValue(source?.trend_delta ?? source?.trend_change)),
    },
    {
      key: 'sentiment',
      label: 'Sentiment',
      shortLabel: 'Sentiment',
      score: sentimentScore,
      display: scoreDisplay(sentimentScore),
      badge: sentimentFrom(source?.sentiment, sentimentScore),
      delta: numberValue(source?.sentiment_delta ?? source?.sentiment_change) ?? (sentimentScore == null ? null : Math.round((sentimentScore - 50) / 2.2)),
      deltaUnit: '%',
      tone: sentimentScore != null && sentimentScore < 45 ? 'red' : sentimentScore != null && sentimentScore < 62 ? 'amber' : 'green',
      icon: MessageCircle,
      spark: buildSpark(sentimentScore, numberValue(source?.sentiment_delta ?? source?.sentiment_change)),
    },
    {
      key: 'institutional',
      label: 'Institutional',
      shortLabel: 'Institutional',
      score: institutional,
      display: scoreDisplay(institutional),
      badge: scoreBadge(institutional, 'Accumulating', 'Neutral', 'Distribution'),
      delta: numberValue(source?.inst_flow_delta ?? source?.institutional_delta) ?? (institutional == null ? null : Math.round((institutional - 50) / 2.4)),
      deltaUnit: '%',
      tone: 'blue',
      icon: Building2,
      spark: buildSpark(institutional, numberValue(source?.inst_flow_delta ?? source?.institutional_delta)),
    },
    {
      key: 'fairValue',
      label: 'Fair Value',
      shortLabel: 'Fair Value',
      score: fairScore,
      display: scoreDisplay(fairScore),
      badge: fairValueBadge(upside),
      delta: upside == null ? null : Math.round(upside),
      deltaUnit: '%',
      tone: upside != null && upside < -4 ? 'red' : upside != null && upside < 8 ? 'amber' : 'green',
      icon: Scale,
      spark: buildSpark(fairScore, upside == null ? null : Math.round(upside)),
    },
    {
      key: 'risk',
      label: 'Risk',
      shortLabel: 'Risk',
      score: risk,
      display: scoreDisplay(risk),
      badge: riskBadge(risk),
      delta: numberValue(source?.risk_delta ?? source?.risk_change) ?? (risk == null ? null : Math.round((risk - 50) / 2)),
      deltaUnit: '%',
      tone: risk != null && risk <= 35 ? 'green' : risk != null && risk <= 60 ? 'amber' : 'red',
      icon: ShieldAlert,
      spark: buildSpark(risk, numberValue(source?.risk_delta ?? source?.risk_change), true),
      lowerIsBetter: true,
    },
  ]

  const metrics = metricsArray.reduce((acc, metric) => {
    acc[metric.key] = metric
    return acc
  }, {} as Record<MetricKey, Metric>)

  const detailRows: Record<MetricKey, DetailRow[]> = {
    momentum: contributionRows(
      momentum,
      ['Price vs 20DMA', 'Price vs 50DMA', 'Price vs 200DMA', 'Volume Trend', 'Relative Strength'],
      [0.26, 0.23, 0.17, 0.16, 0.18],
    ),
    trend: contributionRows(
      trend,
      ['Higher Highs', 'Higher Lows', 'ADX', 'Moving Average Alignment', 'Trend Consistency'],
      [0.22, 0.2, 0.18, 0.22, 0.18],
    ),
    sentiment: contributionRows(
      sentimentScore,
      ['News Sentiment', 'Analyst Revisions', 'Social Sentiment', 'Insider Activity'],
      [0.35, 0.3, 0.2, 0.15],
    ),
    institutional: contributionRows(
      institutional,
      ['13F Activity', 'Fund Ownership Change', 'Volume Anomaly', 'Dark Pool Signal'],
      [0.34, 0.28, 0.22, 0.16],
    ),
    fairValue: [],
    risk: contributionRows(
      risk,
      ['Volatility', 'Beta', 'Debt Level', 'Earnings Stability', 'Drawdown Risk'],
      [0.26, 0.18, 0.16, 0.18, 0.22],
    ),
  }

  const fairValue = {
    current: sourcePrice,
    fairValue: fairValueEstimate,
    upside,
    bull: formatTargetCase(targets?.bull, 'Bull case depends on stronger growth, higher estimates, and multiple expansion.'),
    base: formatTargetCase(targets?.base ?? targets?.average_target, 'Base case reflects the current fair value estimate.'),
    bear: formatTargetCase(targets?.bear, 'Bear case reflects lower demand, weaker margins, or multiple compression.'),
  }

  const insights = [
    {
      title: 'Earnings Revisions Turning Higher',
      text: sentimentScore != null && sentimentScore >= 60 ? 'Analyst and news tone are leaning constructive.' : 'Revision signals need more confirmation before they become a tailwind.',
    },
    {
      title: 'Institutional Accumulation Accelerating',
      text: institutional != null && institutional >= 60 ? 'Flow proxies support the current price action.' : 'Flow data is mixed and should be confirmed with volume.',
    },
    {
      title: 'AI Demand Remains Strong Tailwind',
      text: momentum != null && momentum >= 60 ? 'Momentum is aligned with the core growth narrative.' : 'The narrative remains relevant, but price confirmation is still developing.',
    },
  ]

  const activeMetric = activeSheet ? metrics[activeSheet] : null

  return (
    <section className={`sai sai-cr-si-026 sentiment-${view.toLowerCase()}`} aria-label="AI Intelligence">
      <header className="sai-shell-head">
        <div className="sai-shell-title">
          <span>AI Intelligence</span>
          <Info size={14} aria-hidden="true" />
        </div>
        <div className="sai-live">
          <i aria-hidden="true" />
          <span>Live Analysis</span>
        </div>
      </header>

      <div className="sai-hero-v2">
        <div className="sai-hero-score">
          <div className="sai-gauge" style={{ '--sai-score': `${hidden || composite == null ? 0 : composite}%` } as CSSProperties}>
            <strong>{hidden ? mask : composite ?? EMPTY}</strong>
            <span>/100</span>
          </div>
          <b>{hidden ? mask : heroBadge}</b>
        </div>

        <div className="sai-hero-view">
          <h3>{hidden ? mask : heroBadge}</h3>
          <span className={`sai-view-badge sai-view-${view.toLowerCase()}`}>{hidden ? mask : view}</span>
          <em>Executive Summary</em>
          <p>{hidden ? mask : summary}</p>
          <div className="sai-hero-meta">
            <span><Activity size={13} /> Confidence {hidden ? mask : `${confidence}%`}</span>
            <span><Clock size={13} /> Updated {hidden ? mask : updated}</span>
          </div>
        </div>

        <div className="sai-hero-factors" aria-label="AI Intelligence factor scores">
          {metricsArray.map((metric) => (
            <FactorRow key={metric.key} metric={metric} hidden={hidden} />
          ))}
        </div>
      </div>

      <div className="sai-metric-carousel" aria-label="AI Intelligence metric cards">
        {metricsArray.map((metric) => (
          <MetricCard key={metric.key} metric={metric} hidden={hidden} onOpen={setActiveSheet} />
        ))}
      </div>

      <section className="sai-insights" aria-label="AI Insights">
        <h3>AI Insights</h3>
        <div className="sai-insight-list">
          {insights.map((insight) => (
            <article key={insight.title} className="sai-insight-item">
              <div>
                <strong>{hidden ? mask : insight.title}</strong>
                <p>{hidden ? mask : insight.text}</p>
              </div>
              <ChevronRight size={16} aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      {activeMetric ? (
        <MetricDetailSheet
          metric={activeMetric}
          allMetrics={metrics}
          detailRows={detailRows}
          fairValue={fairValue}
          hidden={hidden}
          onClose={() => setActiveSheet(null)}
        />
      ) : null}
    </section>
  )
}
