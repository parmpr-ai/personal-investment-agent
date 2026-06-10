'use client'

import { ChevronRight, X } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { mask } from '../../lib/pia-api'

const DASH = '—'

// ── Helpers ──────────────────────────────────────────────────

function hasValue(v: unknown) {
  return v != null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}

function numberValue(v: unknown): number | null {
  if (!hasValue(v)) return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function clampScore(v: unknown): number | null {
  const n = numberValue(v)
  return n == null ? null : Math.max(0, Math.min(100, Math.round(n)))
}

function cleanText(v: unknown, max = 150) {
  const t = String(v || '').replace(/\s+/g, ' ').trim()
  return t ? (t.length > max ? `${t.slice(0, max - 3).trim()}…` : t) : ''
}

function sentimentFrom(v: unknown, score: number | null): 'Bullish' | 'Bearish' | 'Neutral' {
  const r = String(v || '').toLowerCase()
  if (r.includes('bear') || r.includes('negative') || r.includes('weak') || r.includes('down')) return 'Bearish'
  if (r.includes('bull') || r.includes('positive') || r.includes('strong') || r.includes('constructive') || r.includes('uptrend')) return 'Bullish'
  if (score != null) {
    if (score >= 65) return 'Bullish'
    if (score <= 40) return 'Bearish'
  }
  return 'Neutral'
}

function deriveTrend(technical: any, source: any): number | null {
  const explicit = clampScore(technical?.trend_score ?? source?.trend_score)
  if (explicit != null) return explicit
  const t = String(technical?.trend || '').toLowerCase()
  if (t.includes('uptrend') && !t.includes('mild')) return 76
  if (t.includes('mild uptrend')) return 62
  if (t.includes('sideways')) return 50
  if (t.includes('pullback')) return 38
  if (t.includes('downtrend')) return 24
  return null
}

function riskLabel(risk: number | null): string {
  if (risk == null) return DASH
  if (risk <= 25) return 'Low'
  if (risk <= 50) return 'Moderate'
  if (risk <= 75) return 'High'
  return 'Very High'
}

function flowDir(v: unknown): 'inflow' | 'outflow' | 'neutral' | null {
  if (!hasValue(v)) return null
  const r = String(v).toLowerCase()
  if (r.includes('inflow') || r.includes('positive') || r.includes('buy')) return 'inflow'
  if (r.includes('outflow') || r.includes('negative') || r.includes('sell')) return 'outflow'
  const n = numberValue(v)
  if (n != null) return n > 0 ? 'inflow' : n < 0 ? 'outflow' : 'neutral'
  return 'neutral'
}

function signedPct(v: unknown): string | null {
  const n = numberValue(v)
  if (n == null) return null
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function deltaStr(n: number): string {
  return `${n >= 0 ? '+' : ''}${Math.round(Math.abs(n))}`
}

// ── Static copy ───────────────────────────────────────────────

type KpiId = 'composite' | 'momentum' | 'trend' | 'sentiment' | 'inst-flow' | 'price-fv'

const KPI_WHY: Record<KpiId, string> = {
  composite: 'The composite AI score combines momentum, trend, sentiment and risk into a single rules-based decision-support signal. Higher scores reflect more favourable conditions across all four factors.',
  momentum: 'Momentum gauges the strength and persistence of recent price action relative to historical averages. High scores indicate sustained directional movement supported by volume.',
  trend: 'Trend strength measures the consistency and duration of the prevailing price direction using moving average alignment and rate-of-change metrics.',
  sentiment: 'Sentiment reflects the aggregated tone of news flow, analyst commentary and market positioning signals. High scores indicate predominantly positive market narrative.',
  'inst-flow': 'Institutional flow tracks estimated net buying and selling activity from institutional participants. Sustained inflow is a constructive signal for price support.',
  'price-fv': 'Price vs Fair Value measures the percentage gap between the current market price and the rules-based fair value estimate. Positive values indicate trading above estimated fair value.',
}

// ── Sub-components ────────────────────────────────────────────

function IntelligenceBar({ label, value, tone = 'blue', hidden }: {
  label: string; value: number | null; tone?: string; hidden: boolean
}) {
  return (
    <div className="sai-bar">
      <div>
        <span>{label}</span>
        <b>{hidden ? mask : value == null ? DASH : `${value}/100`}</b>
      </div>
      <i>
        <em className={tone} style={{ width: hidden || value == null ? 0 : `${value}%` }} />
      </i>
    </div>
  )
}

function MiniDial({ value, hidden }: { value: number | null; hidden: boolean }) {
  return (
    <div
      className="sai-kpi-dial"
      style={{ '--d': `${hidden || value == null ? 0 : value}%` } as CSSProperties}
      aria-hidden="true"
    >
      <span>{hidden ? '·' : value == null ? DASH : String(value)}</span>
    </div>
  )
}

type BreakdownRow = { label: string; value: number | string | null }

function BdRow({ label, value }: BreakdownRow) {
  const n = typeof value === 'number' ? value : numberValue(value)
  const pct = n != null ? Math.max(3, Math.min(100, n)) : 0
  const display = value == null ? DASH : typeof value === 'number' ? String(value) : value
  return (
    <div className="sai-sheet-bd-row">
      <span>{label}</span>
      <b>{display}</b>
      <i><em style={{ width: `${value == null ? 0 : pct}%` }} /></i>
    </div>
  )
}

function BottomSheet({ kpiId, title, scoreDisplay, dialScore, chip, why, breakdown, lastUpdated, dataSource, hidden, onClose }: {
  kpiId: KpiId
  title: string
  scoreDisplay: string
  dialScore: number | null   // raw 0-100 for the dial (separate from formatted header display)
  chip?: string
  why: string
  breakdown: BreakdownRow[]
  lastUpdated: string
  dataSource: string
  hidden: boolean
  onClose: () => void
}) {
  const isScore = kpiId !== 'inst-flow' && kpiId !== 'price-fv'
  const dialNum = isScore ? dialScore : null
  const dialPct = hidden || dialNum == null ? 0 : dialNum
  const hasBreakdown = breakdown.some(r => r.value != null)

  return (
    <>
      <div className="sai-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sai-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sai-sheet-head">
          <div className="sai-sheet-head-info">
            <span className="sai-sheet-title">{title}</span>
            <b className="sai-sheet-score">{hidden ? mask : scoreDisplay}</b>
          </div>
          <button type="button" className="sai-sheet-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {isScore ? (
          <div className="sai-sheet-dial-row">
            <div className="sai-sheet-dial" style={{ '--d': `${dialPct}%` } as CSSProperties} aria-hidden="true">
              <strong>{hidden ? '·' : dialNum == null ? DASH : String(dialNum)}</strong>
            </div>
            {chip ? <span className={`sai-sheet-chip sai-sheet-chip-${chip.toLowerCase()}`}>{hidden ? mask : chip}</span> : null}
          </div>
        ) : null}

        <div className="sai-sheet-body">
          <section className="sai-sheet-section">
            <h4 className="sai-sheet-section-title">Why it matters</h4>
            <p className="sai-sheet-section-text">{why}</p>
          </section>

          {hasBreakdown ? (
            <section className="sai-sheet-section">
              <h4 className="sai-sheet-section-title">Score breakdown</h4>
              {breakdown.map(row => <BdRow key={row.label} label={row.label} value={row.value} />)}
            </section>
          ) : null}

          {/* CR-4: Historical Evolution always shown */}
          <section className="sai-sheet-section">
            <h4 className="sai-sheet-section-title">Historical evolution</h4>
            <p className="sai-sheet-history-na">Data unavailable</p>
          </section>

          <p className="sai-sheet-disclaimer">Rules-based signal, not financial advice. For decision support only.</p>

          {/* CR-3: Last Updated + Source */}
          <footer className="sai-sheet-foot">
            <span>Last Updated: {lastUpdated}</span>
            <span>Source: {dataSource}</span>
          </footer>
        </div>
      </div>
    </>
  )
}

type KpiCardDef = {
  id: Exclude<KpiId, 'composite'>
  lines: [string, string]
  score: number | null
  delta: number | null
  dir: 'inflow' | 'outflow' | 'neutral' | null
}

function KpiCard({ def, hidden, onTap }: { def: KpiCardDef; hidden: boolean; onTap: (id: KpiId) => void }) {
  const { id, lines, score, delta, dir } = def

  const renderLeft = () => {
    if (id === 'inst-flow') {
      if (dir == null) return <span className="sai-kpi-na">{DASH}</span>
      const cls = dir === 'inflow' ? 'inflow' : dir === 'outflow' ? 'outflow' : 'neutral'
      const icon = dir === 'inflow' ? '▲' : dir === 'outflow' ? '▼' : '▬'
      const label = dir === 'inflow' ? 'Inflow' : dir === 'outflow' ? 'Outflow' : 'Neutral'
      return (
        <div className={`sai-kpi-dir ${cls}`}>
          <em>{icon}</em><span>{hidden ? mask : label}</span>
        </div>
      )
    }
    if (id === 'price-fv') {
      const display = hidden ? mask : (score != null ? signedPct(score) ?? DASH : DASH)
      const cls = score == null ? '' : score >= 0 ? ' pos' : ' neg'
      return <span className={`sai-kpi-pct${cls}`}>{display}</span>
    }
    return <MiniDial value={score} hidden={hidden} />
  }

  return (
    <button
      type="button"
      className="sai-kpi-card"
      onClick={() => onTap(id)}
      aria-label={`${lines[0]} ${lines[1]} detail`}
    >
      <div className="sai-kpi-top">
        {renderLeft()}
        <div className="sai-kpi-right">
          {delta != null ? (
            <div className="sai-kpi-delta">
              <em className={delta >= 0 ? 'up' : 'dn'}>{delta >= 0 ? '▲' : '▼'}</em>
              <b>{hidden ? mask : deltaStr(delta)}</b>
            </div>
          ) : <span className="sai-kpi-delta-na">{DASH}</span>}
          <ChevronRight size={11} className="sai-kpi-chev" />
        </div>
      </div>
      {/* CR-1: 2-line label, no truncation */}
      <span className="sai-kpi-label">{lines[0]}<br />{lines[1]}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────

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
  const [activeSheet, setActiveSheet] = useState<KpiId | null>(null)

  // ── Data extraction ──────────────────────────────────────
  const score = clampScore(source?.ai_score ?? source?.opportunity ?? source?.confidence ?? source?.momentum_score ?? source?.momentum ?? source?.news_score)
  const sentiment = sentimentFrom(source?.sentiment ?? source?.bias ?? source?.label ?? technical?.trend ?? overview?.momentum_state, score)
  const momentum = clampScore(source?.momentum_score ?? source?.momentum)
  const trend = deriveTrend(technical, source)
  const sentimentScore = clampScore(source?.sentiment_score ?? source?.news_score)
  const risk = clampScore(source?.risk)
  const headline = cleanText(source?.ai_headline || overview?.momentum_state || overview?.why_moving || technical?.trend, 88)
  const summary = cleanText(overview?.summary || source?.ai_view || overview?.why_moving, 210)

  const momentumDelta = numberValue(source?.momentum_delta ?? source?.momentum_change)
  const trendDelta = numberValue(source?.trend_delta ?? source?.trend_change)
  const sentimentDelta = numberValue(source?.sentiment_delta ?? source?.sentiment_change)
  const instDir = flowDir(source?.institutional_flow)
  const instDelta = numberValue(source?.inst_flow_delta)
  const priceFvRaw = source?.price_vs_fair_value ?? targets?.upside_downside ?? targets?.upside
  const priceFvNum = numberValue(priceFvRaw)
  const priceFvDelta = numberValue(source?.price_fv_delta)

  // Footer
  const footRisk = riskLabel(risk)
  const footQuality = hasValue(source?.data_quality) ? String(source.data_quality) : DASH
  const footConfidence = source?.confidence != null ? `${Math.round(Number(source.confidence))}%` : DASH
  const footNextUpdate = hasValue(source?.next_update) ? String(source.next_update) : DASH

  // Sheet meta (CR-3)
  const lastUpdated = hasValue(source?.last_updated ?? source?.updated_at) ? String(source?.last_updated ?? source?.updated_at) : DASH
  const dataSource = hasValue(source?.data_source ?? source?.provider) ? String(source?.data_source ?? source?.provider) : DASH

  // ── KPI card defs ────────────────────────────────────────
  const kpiCards: KpiCardDef[] = [
    { id: 'momentum', lines: ['Momentum', 'Score'], score: momentum, delta: momentumDelta, dir: null },
    { id: 'trend', lines: ['Trend', 'Strength'], score: trend, delta: trendDelta, dir: null },
    { id: 'sentiment', lines: ['Sentiment', 'Score'], score: sentimentScore, delta: sentimentDelta, dir: null },
    { id: 'inst-flow', lines: ['Institutional', 'Flow'], score: null, delta: instDelta, dir: instDir },
    { id: 'price-fv', lines: ['Price vs', 'Fair Value'], score: priceFvNum, delta: priceFvDelta, dir: priceFvNum != null ? (priceFvNum >= 0 ? 'inflow' : 'outflow') : null },
  ]

  // ── Sheet data ───────────────────────────────────────────
  const kpiTitles: Record<KpiId, string> = {
    composite: 'AI Intelligence Score',
    momentum: 'Momentum Score',
    trend: 'Trend Strength',
    sentiment: 'Sentiment Score',
    'inst-flow': 'Institutional Flow',
    'price-fv': 'Price vs Fair Value',
  }

  const kpiScoreDisplay: Record<KpiId, string> = {
    composite: score != null ? `${score} / 100` : DASH,
    momentum: momentum != null ? `${momentum} / 100` : DASH,
    trend: trend != null ? `${trend} / 100` : DASH,
    sentiment: sentimentScore != null ? `${sentimentScore} / 100` : DASH,
    'inst-flow': instDir === 'inflow' ? '▲ Inflow' : instDir === 'outflow' ? '▼ Outflow' : instDir === 'neutral' ? '▬ Neutral' : DASH,
    'price-fv': priceFvNum != null ? (signedPct(priceFvNum) ?? DASH) : DASH,
  }

  const kpiDialScore: Partial<Record<KpiId, number | null>> = {
    composite: score,
    momentum,
    trend,
    sentiment: sentimentScore,
  }

  const kpiChip: Partial<Record<KpiId, string>> = {
    composite: sentiment,
    momentum: momentum != null ? sentimentFrom(null, momentum) : undefined,
    trend: trend != null ? sentimentFrom(null, trend) : undefined,
    sentiment: sentimentScore != null ? sentimentFrom(null, sentimentScore) : undefined,
  }

  const kpiBreakdown: Record<KpiId, BreakdownRow[]> = {
    composite: [
      { label: 'Momentum', value: momentum },
      { label: 'Trend', value: trend },
      { label: 'Sentiment', value: sentimentScore },
      { label: 'Risk (inv)', value: risk },
    ],
    momentum: [
      { label: 'Price vs 50DMA', value: numberValue(source?.price_vs_50dma) },
      { label: 'RSI(14)', value: numberValue(source?.rsi) },
      { label: 'Volume trend', value: numberValue(source?.volume_trend) },
    ],
    trend: [
      { label: 'MA alignment', value: numberValue(source?.ma_alignment) },
      { label: 'Rate of change', value: numberValue(source?.rate_of_change) },
      { label: 'ADX strength', value: numberValue(source?.adx) },
    ],
    sentiment: [
      { label: 'News score', value: numberValue(source?.news_score) },
      { label: 'Analyst bias', value: numberValue(source?.analyst_bias) },
      { label: 'Social signal', value: numberValue(source?.social_score) },
    ],
    'inst-flow': [
      { label: 'Net flow', value: hasValue(source?.institutional_flow) ? String(source.institutional_flow) : null },
      { label: 'Buy volume', value: numberValue(source?.buy_volume) },
      { label: 'Sell volume', value: numberValue(source?.sell_volume) },
    ],
    'price-fv': [
      { label: 'Fair value est.', value: hasValue(source?.fair_value) ? String(source.fair_value) : null },
      { label: 'Analyst target', value: priceFvNum != null ? signedPct(priceFvNum) : null },
      { label: 'Upside/downside', value: priceFvNum != null ? signedPct(priceFvNum) : null },
    ],
  }

  return (
    <section className={`sai sentiment-${sentiment.toLowerCase()}`} aria-label="AI intelligence">
      {/* Composite dial — CR-2: ring is the tap target, no chevron inside */}
      <header className="sai-head">
        <button
          type="button"
          className="sai-score"
          style={{ '--sai-score': `${score ?? 0}%` } as CSSProperties}
          onClick={() => setActiveSheet('composite')}
          aria-label="Open AI Intelligence score detail"
        >
          <strong>{hidden ? mask : score ?? DASH}</strong>
          <span>{hidden ? 'Signal' : sentiment}</span>
        </button>
        <div className="sai-lede">
          <span className="sai-kicker">AI Intelligence</span>
          <h3>{hidden ? mask : headline || 'Data gathering in progress'}</h3>
          <span className="sai-chip">{hidden ? mask : sentiment}</span>
        </div>
      </header>

      <div className="sai-bars">
        <IntelligenceBar label="Momentum" value={momentum} tone="green" hidden={hidden} />
        <IntelligenceBar label="Trend" value={trend} tone="blue" hidden={hidden} />
        <IntelligenceBar label="Sentiment" value={sentimentScore} tone="violet" hidden={hidden} />
        <IntelligenceBar label="Risk" value={risk} tone="red" hidden={hidden} />
      </div>

      <p className="sai-summary">{hidden ? mask : summary || 'Data gathering in progress'}</p>

      <div className="sai-kpi-header">
        <span>Key Signals</span>
        <span className="sai-kpi-hint">tap for detail</span>
      </div>

      <div className="sai-kpi-grid">
        {kpiCards.map(def => (
          <KpiCard key={def.id} def={def} hidden={hidden} onTap={setActiveSheet} />
        ))}
      </div>

      <footer className="sai-footer">
        <div className="sai-footer-item">
          <span>Risk Level</span>
          <b>{footRisk}</b>
        </div>
        <div className="sai-footer-item">
          <span>Data Quality</span>
          <b>{footQuality}</b>
        </div>
        <div className="sai-footer-item">
          <span>Confidence</span>
          <b>{footConfidence}</b>
        </div>
        <div className="sai-footer-item">
          <span>Next Update</span>
          <b>{footNextUpdate}</b>
        </div>
      </footer>

      {activeSheet != null ? (
        <BottomSheet
          kpiId={activeSheet}
          title={kpiTitles[activeSheet]}
          scoreDisplay={kpiScoreDisplay[activeSheet]}
          dialScore={kpiDialScore[activeSheet] ?? null}
          chip={kpiChip[activeSheet]}
          why={KPI_WHY[activeSheet]}
          breakdown={kpiBreakdown[activeSheet]}
          lastUpdated={lastUpdated}
          dataSource={dataSource}
          hidden={hidden}
          onClose={() => setActiveSheet(null)}
        />
      ) : null}
    </section>
  )
}
