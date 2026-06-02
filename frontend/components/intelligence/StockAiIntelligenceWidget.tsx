'use client'

import { Brain } from 'lucide-react'
import type { CSSProperties } from 'react'
import { mask } from '../../lib/pia-api'

const EMPTY = '—'

function hasValue(value: unknown) {
  return value != null && value !== '' && !(typeof value === 'number' && Number.isNaN(value))
}

function numberValue(value: unknown): number | null {
  if (!hasValue(value)) return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function clampScore(value: unknown): number | null {
  const parsed = numberValue(value)
  if (parsed == null) return null
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function cleanText(value: unknown, max = 150) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text
}

function sentimentFrom(value: unknown, fallbackScore: number | null) {
  const raw = String(value || '').toLowerCase()
  if (raw.includes('bear') || raw.includes('negative') || raw.includes('weak') || raw.includes('down')) return 'Bearish'
  if (raw.includes('bull') || raw.includes('positive') || raw.includes('strong') || raw.includes('constructive') || raw.includes('uptrend')) return 'Bullish'
  if (fallbackScore != null) {
    if (fallbackScore >= 65) return 'Bullish'
    if (fallbackScore <= 40) return 'Bearish'
  }
  return 'Neutral'
}

function trendScore(technical: any, source: any) {
  const explicit = clampScore(technical.trend_score ?? source.trend_score)
  if (explicit != null) return explicit
  const trend = String(technical.trend || '').toLowerCase()
  if (trend.includes('uptrend')) return 76
  if (trend.includes('mild uptrend')) return 62
  if (trend.includes('sideways')) return 50
  if (trend.includes('pullback')) return 38
  if (trend.includes('downtrend')) return 24
  return null
}

function formatValue(value: unknown, suffix = '') {
  if (!hasValue(value)) return EMPTY
  const parsed = numberValue(value)
  if (parsed == null) return String(value)
  return `${Number(parsed.toFixed(2))}${suffix}`
}

function IntelligenceBar({ label, value, tone = 'blue', hidden }: { label: string; value: number | null; tone?: string; hidden: boolean }) {
  const shown = value == null ? EMPTY : `${value}/100`
  return (
    <div className="sai-bar">
      <div>
        <span>{label}</span>
        <b>{hidden ? mask : shown}</b>
      </div>
      <i>
        <em className={tone} style={{ width: hidden || value == null ? 0 : `${value}%` }} />
      </i>
    </div>
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
  const score = clampScore(source.ai_score ?? source.opportunity ?? source.confidence ?? source.momentum_score ?? source.momentum ?? source.news_score)
  const sentiment = sentimentFrom(source.sentiment ?? source.bias ?? source.label ?? technical.trend ?? overview.momentum_state, score)
  const momentum = clampScore(source.momentum_score ?? source.momentum)
  const trend = trendScore(technical, source)
  const sentimentScore = clampScore(source.sentiment_score ?? source.news_score)
  const risk = clampScore(source.risk)
  const headline = cleanText(source.ai_headline || overview.momentum_state || overview.why_moving || technical.trend, 88)
  const summary = cleanText(overview.summary || source.ai_view || overview.why_moving, 210)

  const insights = [
    hasValue(source.relative_strength) ? ['Relative Strength', formatValue(source.relative_strength)] : null,
    hasValue(overview.volatility_state ?? source.volatility) ? ['Volatility', String(overview.volatility_state ?? source.volatility)] : null,
    hasValue(source.institutional_flow) ? ['Institutional Flow', String(source.institutional_flow)] : null,
    hasValue(source.short_interest) ? ['Short Interest', formatValue(source.short_interest, '%')] : null,
    hasValue(source.price_vs_fair_value ?? targets.upside_downside) ? ['Price vs Fair Value', String(source.price_vs_fair_value ?? targets.upside_downside)] : null,
  ].filter((item): item is [string, string] => Boolean(item))

  return (
    <section className={`sai sentiment-${sentiment.toLowerCase()}`} aria-label="AI intelligence">
      <header className="sai-head">
        <div className="sai-score" style={{ '--sai-score': `${score ?? 0}%` } as CSSProperties}>
          <Brain size={18} />
          <strong>{hidden ? mask : score ?? EMPTY}</strong>
          <span>{hidden ? 'Signal' : sentiment}</span>
        </div>
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

      {insights.length > 0 && (
        <div className="sai-insights">
          {insights.map(([label, value]) => (
            <div className="sai-insight" key={label}>
              <span>{label}</span>
              <b>{hidden ? mask : value}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
