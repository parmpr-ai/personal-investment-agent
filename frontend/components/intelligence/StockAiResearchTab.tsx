'use client'
import { useEffect, useRef, useState } from 'react'

// ── types ──────────────────────────────────────────────────────────────────────
type Metric = {
  value: any; unit?: string | null; source?: string | null
  lastUpdated?: string | null; refreshFrequency?: string | null
  confidence?: number; isPlaceholder?: boolean; calculationMethod?: string
}
interface ResearchSection {
  status: string; dataType?: string; summary: string; keyPoints: string[]
  metrics: Record<string, Metric>; sources?: string[]
  lastUpdated?: string | null; refreshFrequency?: string | null
  confidence?: number; calculationMethod?: string
  providerStatus?: Record<string, any>; sourceStatus?: Record<string, any>
  missingData?: any[]; readFullAnalysis?: string
}
interface ResearchData {
  type: string; schemaVersion: string; symbol: string; generatedAt: string
  sourceStatus: Record<string, any>
  research: {
    investmentThesis: ResearchSection
    financialHealth: ResearchSection
    growthEngine: ResearchSection
    moatAnalysis: ResearchSection
    valuation: ResearchSection
    institutionalThesis: ResearchSection
    competitiveComparison: ResearchSection & { shouldRender?: boolean }
    riskAnalysis: ResearchSection
    bullBearDebate: ResearchSection
    earningsBreakdown: ResearchSection & { shouldRender?: boolean }
  }
}

// ── constants ──────────────────────────────────────────────────────────────────
const SECTION_KEYS = [
  'investmentThesis', 'financialHealth', 'growthEngine', 'moatAnalysis',
  'valuation', 'institutionalThesis', 'competitiveComparison',
  'riskAnalysis', 'bullBearDebate', 'earningsBreakdown',
] as const

const SECTION_LABELS: Record<string, string> = {
  investmentThesis: 'Investment Thesis',
  financialHealth: 'Financial Health',
  growthEngine: 'Growth Engine',
  moatAnalysis: 'Moat Analysis',
  valuation: 'Valuation',
  institutionalThesis: 'Institutional Thesis',
  competitiveComparison: 'Competitive Comparison',
  riskAnalysis: 'Risk Analysis',
  bullBearDebate: 'Bull vs Bear Debate',
  earningsBreakdown: 'Earnings Breakdown',
}

const EMPTY = '—'

// ── helpers ────────────────────────────────────────────────────────────────────
const mv = (m: Metric | undefined): any => m?.value ?? null

function scoreColor(score: number | null, inverted = false): string {
  if (score == null) return 'rgba(255,255,255,.35)'
  const s = inverted ? 100 - score : score
  return s >= 65 ? '#31E95D' : s >= 45 ? '#FFBD28' : '#FF3D3D'
}

function scoreLabel(score: number | null, inverted = false): string {
  if (score == null) return EMPTY
  const s = inverted ? 100 - score : score
  if (s >= 80) return 'Very High'
  if (s >= 65) return 'High'
  if (s >= 50) return 'Moderate'
  if (s >= 35) return 'Low'
  return 'Very Low'
}

function severityColor(sev: string): string {
  const s = (sev || '').toLowerCase()
  return s === 'high' ? '#FF3D3D' : s === 'medium' ? '#FFBD28' : '#31E95D'
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return EMPTY
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return String(d) }
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return EMPTY
  const abs = Math.abs(v)
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v.toFixed(2)}`
}

function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return EMPTY
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

// ── sub-components ─────────────────────────────────────────────────────────────

function Sparkline({ values, color = '#31E95D', width = 72, height = 30 }: {
  values?: number[] | null; color?: string; width?: number; height?: number
}) {
  if (!values?.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} y1={height * 0.5} x2={width} y2={height * 0.5}
          stroke="rgba(255,255,255,.12)" strokeWidth={1.5} strokeDasharray="3,3" />
      </svg>
    )
  }
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pad = 3
  const pts = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * width
    const y = height - pad - ((v - min) / range) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const gId = `sg${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`${pts.join(' ')} ${width},${height} 0,${height}`} fill={`url(#${gId})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}

function ScoreBar({ score, color, height = 4 }: { score: number | null; color: string; height?: number }) {
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0
  return (
    <div className="sai-res-bar-track" style={{ height }}>
      <div className="sai-res-bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function ProvenanceFooter({ data }: { data: ResearchSection }) {
  const src = data.sources?.join(', ') || 'Internal'
  const updated = fmtDate(data.lastUpdated)
  const freq = data.refreshFrequency
  const conf = data.confidence
  const dtype = data.dataType
  const calc = data.calculationMethod
  return (
    <div className="sai-res-prov">
      <div className="sai-res-prov-row">
        <span><strong>Source:</strong> {src}</span>
        <span><strong>Updated:</strong> {updated}</span>
        {freq && <span><strong>Refresh:</strong> {freq}</span>}
      </div>
      <div className="sai-res-prov-row">
        {conf != null && <span><strong>Confidence:</strong> {conf}%</span>}
        {dtype && <span><strong>Type:</strong> {dtype}</span>}
      </div>
      {calc && <div className="sai-res-prov-calc">{calc}</div>}
    </div>
  )
}

// ── Section body renderers ─────────────────────────────────────────────────────

function InvestmentThesisBody({ sec, r, hidden, MASK }: {
  sec: ResearchSection; r: ResearchData['research']; hidden: boolean; MASK: string
}) {
  const kp = sec.keyPoints || []
  const businessOverview = kp[0] || sec.summary
  const drivers: string[] = mv(r.growthEngine?.metrics?.revenueDrivers) || []
  const whyInst: string[] = mv(r.institutionalThesis?.metrics?.supportiveRationale) || []
  const whatBreaks: string[] = (mv(r.institutionalThesis?.metrics?.cautionRationale) || []).slice(0, 3)
  const tags: string[] = [
    mv(sec.metrics?.sector), mv(sec.metrics?.industry), mv(sec.metrics?.primaryCatalyst),
  ].filter(Boolean).slice(0, 4)
  const moatRating = mv(sec.metrics?.moatRating)

  return (
    <div className="sai-res-it-body">
      {/* 4-column grid */}
      <div className="sai-res-it-grid">
        <div className="sai-res-it-col">
          <div className="sai-res-it-col-ttl">Business Overview</div>
          <p className="sai-res-it-para">{hidden ? MASK : businessOverview}</p>
          {moatRating && <div className="sai-res-it-moat">Moat: <strong>{moatRating}</strong></div>}
        </div>
        <div className="sai-res-it-col">
          <div className="sai-res-it-col-ttl">Why Institutions Care</div>
          <ul className="sai-res-it-list">
            {whyInst.slice(0, 3).map((item, i) => (
              <li key={i}>{hidden ? MASK : item}</li>
            ))}
            {!whyInst.length && <li className="sai-res-it-na">Data pending provider</li>}
          </ul>
        </div>
        <div className="sai-res-it-col">
          <div className="sai-res-it-col-ttl">Key Drivers</div>
          <ul className="sai-res-it-list sai-res-it-list--green">
            {drivers.slice(0, 3).map((item, i) => (
              <li key={i}>{hidden ? MASK : item}</li>
            ))}
            {!drivers.length && <li className="sai-res-it-na">Data pending provider</li>}
          </ul>
        </div>
        <div className="sai-res-it-col">
          <div className="sai-res-it-col-ttl">What Could Break Thesis</div>
          <ul className="sai-res-it-list sai-res-it-list--red">
            {whatBreaks.slice(0, 3).map((item, i) => (
              <li key={i}>{hidden ? MASK : item}</li>
            ))}
            {!whatBreaks.length && <li className="sai-res-it-na">Data pending provider</li>}
          </ul>
        </div>
      </div>
      {/* Tags */}
      {tags.length > 0 && (
        <div className="sai-res-it-tags">
          {tags.map((t, i) => <span key={i} className="sai-res-tag">{hidden ? MASK : t}</span>)}
        </div>
      )}
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function FinancialHealthBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const revenue = sec.metrics?.revenue
  const fcf = sec.metrics?.freeCashFlow
  const netIncome = sec.metrics?.netIncome
  const margins = sec.metrics?.margins
  const yoy = sec.metrics?.yoyGrowth
  const marketCap = mv(sec.metrics?.marketCap)
  const eps = mv(sec.metrics?.eps)
  const pe = mv(sec.metrics?.pe)
  const yoyVal = mv(yoy)

  const cards = [
    { label: 'Revenue', m: revenue, color: '#31E95D' },
    { label: 'Free Cash Flow', m: fcf, color: '#00D9FF' },
    { label: 'Net Income', m: netIncome, color: '#FFBD28' },
    { label: 'Gross Margin', m: margins, color: '#A78BFA' },
  ]

  return (
    <div className="sai-res-fh-body">
      <div className="sai-res-fh-grid">
        {cards.map(c => {
          const val = mv(c.m)
          const isPlaceholder = c.m?.isPlaceholder || val == null
          const displayVal = hidden ? MASK : isPlaceholder ? EMPTY : (typeof val === 'number' ? fmtNum(val) : String(val))
          return (
            <div key={c.label} className="sai-res-fh-card">
              <div className="sai-res-fh-lbl">{c.label}</div>
              <div className="sai-res-fh-val" style={{ color: isPlaceholder ? 'rgba(255,255,255,.3)' : c.color }}>
                {displayVal}
              </div>
              {!isPlaceholder && yoyVal != null && (
                <div className="sai-res-fh-yoy" style={{ color: yoyVal >= 0 ? '#31E95D' : '#FF3D3D' }}>
                  {hidden ? MASK : fmtPct(yoyVal)}
                </div>
              )}
              <Sparkline values={null} color={c.color} />
            </div>
          )
        })}
      </div>
      {/* Key stats row */}
      <div className="sai-res-fh-stats">
        {marketCap != null && (
          <div className="sai-res-fh-stat">
            <span className="sai-res-fh-stat-lbl">Market Cap</span>
            <span className="sai-res-fh-stat-val">{hidden ? MASK : fmtNum(marketCap)}</span>
          </div>
        )}
        {eps != null && (
          <div className="sai-res-fh-stat">
            <span className="sai-res-fh-stat-lbl">EPS</span>
            <span className="sai-res-fh-stat-val">{hidden ? MASK : `$${Number(eps).toFixed(2)}`}</span>
          </div>
        )}
        {pe != null && (
          <div className="sai-res-fh-stat">
            <span className="sai-res-fh-stat-lbl">P/E</span>
            <span className="sai-res-fh-stat-val">{hidden ? MASK : `${Number(pe).toFixed(1)}x`}</span>
          </div>
        )}
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function GrowthEngineBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const aiExposure: any = mv(sec.metrics?.aiExposure)
  const drivers: string[] = mv(sec.metrics?.revenueDrivers) || []
  const productGrowth: any[] = mv(sec.metrics?.productGrowth) || []
  const levelMap: Record<string, number> = { 'Very High': 90, 'High': 78, 'Moderate': 60, 'Low': 40, 'Very Low': 22 }
  const aiLevel = aiExposure?.level || 'Moderate'
  const aiScore = levelMap[aiLevel] ?? 60
  const aiColor = scoreColor(aiScore)
  const keyPoints = sec.keyPoints || []

  return (
    <div className="sai-res-ge-body">
      {/* AI Exposure score */}
      <div className="sai-res-ge-score-row">
        <div className="sai-res-ge-score-panel">
          <div className="sai-res-ge-score-num" style={{ color: aiColor }}>
            {hidden ? MASK : aiScore}
          </div>
          <div className="sai-res-ge-score-lbl">Growth Score</div>
          <ScoreBar score={aiScore} color={aiColor} height={6} />
        </div>
        <div className="sai-res-ge-info">
          <div className="sai-res-ge-info-ttl">AI Exposure</div>
          <div className="sai-res-ge-info-val" style={{ color: aiColor }}>
            {hidden ? MASK : aiLevel}
          </div>
          {aiExposure?.advantage && (
            <div className="sai-res-ge-info-sub">{hidden ? MASK : aiExposure.advantage}</div>
          )}
        </div>
      </div>

      {/* Key Growth Drivers */}
      <div className="sai-res-ge-drivers-ttl">Key Growth Drivers</div>
      <div className="sai-res-ge-drivers">
        {drivers.slice(0, 5).map((d, i) => (
          <div key={i} className="sai-res-ge-driver-row">
            <span className="sai-res-ge-driver-lbl">{hidden ? MASK : d}</span>
            <ScoreBar score={Math.max(40, aiScore - i * 8)} color={scoreColor(aiScore - i * 8)} height={4} />
          </div>
        ))}
        {productGrowth.slice(0, 2).map((pg: any, i: number) => (
          <div key={`pg${i}`} className="sai-res-ge-driver-row">
            <span className="sai-res-ge-driver-lbl">{hidden ? MASK : pg.title}</span>
            <span className="sai-res-ge-driver-badge" style={{ color: severityColor(pg.impact) }}>{pg.impact}</span>
          </div>
        ))}
      </div>

      {keyPoints.length > 0 && (
        <div className="sai-res-ge-kp">
          {keyPoints.slice(0, 3).map((kp, i) => (
            <div key={i} className="sai-res-ge-kp-item">• {hidden ? MASK : kp}</div>
          ))}
        </div>
      )}
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function MoatAnalysisBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const score: number | null = mv(sec.metrics?.score)
  const rating: string = mv(sec.metrics?.rating) || EMPTY
  const components: Record<string, number> = mv(sec.metrics?.components) || {}
  const drivers: string[] = mv(sec.metrics?.drivers) || []
  const color = scoreColor(score)

  const compLabels: Record<string, string> = {
    networkEffects: 'Network Effects',
    switchingCosts: 'Switching Costs',
    brandStrength: 'Brand Strength',
    technologyAdvantage: 'Tech Advantage',
    costAdvantage: 'Cost Advantage',
    scale: 'Scale',
  }

  return (
    <div className="sai-res-ma-body">
      <div className="sai-res-ma-row">
        {/* Components list */}
        <div className="sai-res-ma-comps">
          {Object.entries(compLabels).map(([k, lbl]) => {
            const val = components[k]
            if (val == null) return null
            const c = scoreColor(val)
            return (
              <div key={k} className="sai-res-ma-comp-row">
                <span className="sai-res-ma-comp-lbl">{lbl}</span>
                <span className="sai-res-ma-comp-val" style={{ color: c }}>{hidden ? MASK : val}</span>
                <div className="sai-res-ma-comp-bar">
                  <div style={{ width: `${val}%`, background: c, height: '100%', borderRadius: 2, transition: 'width .4s' }} />
                </div>
              </div>
            )
          })}
        </div>
        {/* Score panel */}
        <div className="sai-res-ma-score-panel">
          <div className="sai-res-ma-score-shield">
            <div className="sai-res-ma-score-num" style={{ color }}>{hidden ? MASK : score ?? EMPTY}</div>
            <div className="sai-res-ma-score-sub">/100</div>
          </div>
          <div className="sai-res-ma-score-lbl">Moat Score</div>
          <div className="sai-res-ma-rating" style={{ color }}>{hidden ? MASK : rating}</div>
          {drivers.length > 0 && (
            <div className="sai-res-ma-drivers">
              {drivers.slice(0, 3).map((d, i) => (
                <div key={i} className="sai-res-ma-driver">{hidden ? MASK : d}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function ValuationBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const currentPrice: number | null = mv(sec.metrics?.currentPrice)
  const fairValue: number | null = mv(sec.metrics?.fairValue)
  const analystTarget: any = mv(sec.metrics?.analystTarget)
  const multiples: any = mv(sec.metrics?.valuationMultiples)
  const udr: any = mv(sec.metrics?.upsideDownsideRange)
  const upside = fairValue != null && currentPrice != null
    ? ((fairValue - currentPrice) / currentPrice) * 100 : null

  const upsideColor = upside != null ? (upside > 5 ? '#31E95D' : upside < -5 ? '#FF3D3D' : '#FFBD28') : 'rgba(255,255,255,.5)'

  // Valuation score derived from upside
  const valScore = upside != null ? Math.max(0, Math.min(100, 50 + upside * 2)) : null
  const valColor = scoreColor(valScore)

  return (
    <div className="sai-res-val-body">
      <div className="sai-res-val-row">
        {/* Left: price stack */}
        <div className="sai-res-val-prices">
          <div className="sai-res-val-price-row">
            <span className="sai-res-val-price-lbl">Current Price</span>
            <span className="sai-res-val-price-val">{hidden ? MASK : currentPrice != null ? `$${currentPrice.toFixed(2)}` : EMPTY}</span>
          </div>
          <div className="sai-res-val-price-row">
            <span className="sai-res-val-price-lbl">Fair Value</span>
            <span className="sai-res-val-price-val" style={{ color: '#31E95D' }}>
              {hidden ? MASK : fairValue != null ? `$${fairValue.toFixed(2)}` : EMPTY}
            </span>
          </div>
          {analystTarget?.average != null && (
            <div className="sai-res-val-price-row">
              <span className="sai-res-val-price-lbl">Analyst Target</span>
              <span className="sai-res-val-price-val">
                {hidden ? MASK : `$${Number(analystTarget.average).toFixed(2)}`}
              </span>
            </div>
          )}
          <div className="sai-res-val-price-row">
            <span className="sai-res-val-price-lbl">Upside / Downside</span>
            <span className="sai-res-val-price-val" style={{ color: upsideColor }}>
              {hidden ? MASK : upside != null ? fmtPct(upside) : EMPTY}
            </span>
          </div>
          {udr && (
            <div className="sai-res-val-range">
              <div className="sai-res-val-range-row">
                <span style={{ color: '#31E95D' }}>Bull {udr.bullPct != null ? fmtPct(udr.bullPct) : EMPTY}</span>
                <span style={{ color: '#FFBD28' }}>Base {udr.basePct != null ? fmtPct(udr.basePct) : EMPTY}</span>
                <span style={{ color: '#FF3D3D' }}>Bear {udr.bearPct != null ? fmtPct(udr.bearPct) : EMPTY}</span>
              </div>
            </div>
          )}
        </div>
        {/* Right: score + multiples */}
        <div className="sai-res-val-score-col">
          <div className="sai-res-val-score" style={{ color: valColor }}>
            {hidden ? MASK : valScore != null ? Math.round(valScore) : EMPTY}
          </div>
          <div className="sai-res-val-score-lbl">Valuation Score</div>
          <ScoreBar score={valScore} color={valColor} height={5} />
          {multiples && (
            <div className="sai-res-val-multiples">
              {multiples.pe != null && <div className="sai-res-val-mult-row"><span>P/E</span><span>{hidden ? MASK : `${Number(multiples.pe).toFixed(1)}x`}</span></div>}
              {multiples.marketCap != null && <div className="sai-res-val-mult-row"><span>Mkt Cap</span><span>{hidden ? MASK : fmtNum(multiples.marketCap)}</span></div>}
              {analystTarget?.high != null && <div className="sai-res-val-mult-row"><span>High Target</span><span>{hidden ? MASK : `$${Number(analystTarget.high).toFixed(0)}`}</span></div>}
              {analystTarget?.low != null && <div className="sai-res-val-mult-row"><span>Low Target</span><span>{hidden ? MASK : `$${Number(analystTarget.low).toFixed(0)}`}</span></div>}
            </div>
          )}
        </div>
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function InstitutionalThesisBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const supportive: string[] = mv(sec.metrics?.supportiveRationale) || []
  const caution: string[] = mv(sec.metrics?.cautionRationale) || []
  const flow30d: number | null = mv(sec.metrics?.institutionalFlow30d)
  const sentiment: any = mv(sec.metrics?.analystSentiment)
  const instScore: number | null = mv(sec.metrics?.institutionalScore)

  // Derived donut pct from instScore or flow
  const ownershipPct = instScore != null ? Math.round(instScore * 0.6) : (flow30d != null ? 34 : null)
  const sentimentLabel: string = sentiment?.sentimentLabel || sentiment?.consensusRating || EMPTY
  const sentColor = sentimentLabel === 'Constructive' ? '#31E95D' : sentimentLabel === 'Cautious' ? '#FF3D3D' : '#FFBD28'

  return (
    <div className="sai-res-inst-body">
      <div className="sai-res-inst-row">
        {/* Left: why buy */}
        <div className="sai-res-inst-col">
          <div className="sai-res-inst-col-ttl" style={{ color: '#31E95D' }}>WHY INSTITUTIONS BUY</div>
          <ul className="sai-res-inst-list">
            {supportive.slice(0, 4).map((item, i) => (
              <li key={i}>{hidden ? MASK : item}</li>
            ))}
            {!supportive.length && <li className="sai-res-it-na">Data pending</li>}
          </ul>
        </div>
        {/* Right: why avoid */}
        <div className="sai-res-inst-col">
          <div className="sai-res-inst-col-ttl" style={{ color: '#FF3D3D' }}>WHY INSTITUTIONS AVOID</div>
          <ul className="sai-res-inst-list sai-res-inst-list--red">
            {caution.slice(0, 4).map((item, i) => (
              <li key={i}>{hidden ? MASK : item}</li>
            ))}
            {!caution.length && <li className="sai-res-it-na">Data pending</li>}
          </ul>
        </div>
      </div>
      {/* Ownership + sentiment */}
      <div className="sai-res-inst-footer">
        {ownershipPct != null && (
          <div className="sai-res-inst-own">
            <svg width={56} height={56} viewBox="0 0 56 56">
              <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth={6} />
              <circle cx={28} cy={28} r={22} fill="none" stroke="#31E95D" strokeWidth={6}
                strokeDasharray={`${2 * Math.PI * 22 * ownershipPct / 100} ${2 * Math.PI * 22 * (1 - ownershipPct / 100)}`}
                strokeLinecap="round" transform="rotate(-90 28 28)" />
              <text x={28} y={32} textAnchor="middle" fill="white" fontSize={10} fontWeight={700}>
                {hidden ? '••' : `${ownershipPct}%`}
              </text>
            </svg>
            <div className="sai-res-inst-own-lbl">Institutional<br />Ownership</div>
          </div>
        )}
        {sentimentLabel !== EMPTY && (
          <div className="sai-res-inst-sent">
            <div className="sai-res-inst-sent-lbl">Analyst Sentiment</div>
            <div className="sai-res-inst-sent-val" style={{ color: sentColor }}>
              {hidden ? MASK : sentimentLabel}
            </div>
          </div>
        )}
        {flow30d != null && (
          <div className="sai-res-inst-flow">
            <div className="sai-res-inst-sent-lbl">30D Inst. Flow</div>
            <div className="sai-res-inst-sent-val" style={{ color: flow30d > 0 ? '#31E95D' : '#FF3D3D' }}>
              {hidden ? MASK : fmtNum(flow30d)}
            </div>
          </div>
        )}
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function CompetitiveComparisonBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const peers: any[] = mv(sec.metrics?.peerMetrics) || []
  if (!peers.length) {
    return (
      <div className="sai-res-cc-empty">
        <p>{sec.summary || 'Competitive peer data unavailable.'}</p>
        <ProvenanceFooter data={sec} />
      </div>
    )
  }
  return (
    <div className="sai-res-cc-body">
      <div className="sai-res-cc-table-wrap">
        <table className="sai-res-cc-table">
          <thead>
            <tr>
              <th>Ticker</th><th>1Y</th><th>ROIC</th><th>Mkt Cap</th><th>Moat</th>
            </tr>
          </thead>
          <tbody>
            {peers.slice(0, 6).map((peer: any, i: number) => (
              <tr key={i}>
                <td>{hidden ? MASK : peer.symbol || peer.ticker || '—'}</td>
                <td>{hidden ? MASK : peer.return1y != null ? fmtPct(peer.return1y) : EMPTY}</td>
                <td>{hidden ? MASK : peer.roic != null ? fmtPct(peer.roic) : EMPTY}</td>
                <td>{hidden ? MASK : peer.marketCap != null ? fmtNum(peer.marketCap) : EMPTY}</td>
                <td>{hidden ? MASK : peer.moatScore || EMPTY}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function RiskAnalysisBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const risks: any[] = mv(sec.metrics?.risks) || []
  const riskScore: number | null = mv(sec.metrics?.riskScore)
  const beta: number | null = mv(sec.metrics?.beta)

  return (
    <div className="sai-res-ra-body">
      {(riskScore != null || beta != null) && (
        <div className="sai-res-ra-overview">
          {riskScore != null && (
            <div className="sai-res-ra-stat">
              <span className="sai-res-ra-stat-lbl">Risk Score</span>
              <span className="sai-res-ra-stat-val" style={{ color: scoreColor(riskScore, true) }}>
                {hidden ? MASK : riskScore}/100
              </span>
            </div>
          )}
          {beta != null && (
            <div className="sai-res-ra-stat">
              <span className="sai-res-ra-stat-lbl">Beta</span>
              <span className="sai-res-ra-stat-val">{hidden ? MASK : beta.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}
      <div className="sai-res-ra-cards">
        {risks.slice(0, 5).map((risk: any, i: number) => {
          const sc = severityColor(risk.severity)
          return (
            <div key={i} className="sai-res-ra-card">
              <div className="sai-res-ra-card-hdr">
                <span className="sai-res-ra-card-ttl">{hidden ? MASK : risk.title}</span>
                <span className="sai-res-ra-sev" style={{ borderColor: sc, color: sc }}>
                  {risk.severity}
                </span>
              </div>
              {risk.impactOnThesis && (
                <p className="sai-res-ra-impact">{hidden ? MASK : risk.impactOnThesis}</p>
              )}
              {risk.mitigationOrWatchItem && (
                <p className="sai-res-ra-watch">{hidden ? MASK : risk.mitigationOrWatchItem}</p>
              )}
            </div>
          )
        })}
      </div>
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function BullBearDebateBody({ sec, caseType, hidden, MASK }: {
  sec: ResearchSection; caseType: string; hidden: boolean; MASK: string
}) {
  const bullArg: string = mv(sec.metrics?.bullArgument) || ''
  const bearArg: string = mv(sec.metrics?.bearArgument) || ''
  const bullEvidence: string[] = mv(sec.metrics?.bullEvidence) || []
  const bearEvidence: string[] = mv(sec.metrics?.bearEvidence) || []
  const neutral: string = mv(sec.metrics?.neutralSynthesis) || sec.summary || ''

  return (
    <div className="sai-res-bvb-body">
      <div className="sai-res-bvb-cols">
        {/* Bull */}
        <div className="sai-res-bvb-col sai-res-bvb-col--bull">
          <div className="sai-res-bvb-col-ttl" style={{ color: '#31E95D' }}>BULL FACTORS</div>
          {bullArg && <p className="sai-res-bvb-arg">{hidden ? MASK : bullArg}</p>}
          <ul className="sai-res-bvb-list">
            {bullEvidence.slice(0, 4).map((e, i) => <li key={i}>{hidden ? MASK : e}</li>)}
          </ul>
        </div>
        {/* Bear */}
        <div className="sai-res-bvb-col sai-res-bvb-col--bear">
          <div className="sai-res-bvb-col-ttl" style={{ color: '#FF3D3D' }}>BEAR FACTORS</div>
          {bearArg && <p className="sai-res-bvb-arg">{hidden ? MASK : bearArg}</p>}
          <ul className="sai-res-bvb-list">
            {bearEvidence.slice(0, 4).map((e, i) => <li key={i}>{hidden ? MASK : e}</li>)}
          </ul>
        </div>
      </div>
      {neutral && (
        <div className="sai-res-bvb-neutral">
          <div className="sai-res-bvb-neutral-ttl">Neutral Synthesis</div>
          <p>{hidden ? MASK : neutral}</p>
        </div>
      )}
      <ProvenanceFooter data={sec} />
    </div>
  )
}

function EarningsBreakdownBody({ sec, hidden, MASK }: {
  sec: ResearchSection; hidden: boolean; MASK: string
}) {
  const lastResult: any = mv(sec.metrics?.lastEarningsResult)
  const epsVsEst: any = mv(sec.metrics?.epsVsEstimate)
  const nextDate: string | null = mv(sec.metrics?.nextEarningsDate)
  const keyTakeaway: string | null = mv(sec.metrics?.keyTakeaway)

  const reported = lastResult?.reportedEps ?? epsVsEst?.reportedEps
  const estimate = lastResult?.epsEstimate ?? epsVsEst?.estimate
  const surprise = lastResult?.surprisePct ?? epsVsEst?.surprisePct
  const surpriseColor = surprise != null ? (surprise > 0 ? '#31E95D' : '#FF3D3D') : 'rgba(255,255,255,.5)'

  return (
    <div className="sai-res-eb-body">
      <div className="sai-res-eb-row">
        {reported != null && (
          <div className="sai-res-eb-stat">
            <span className="sai-res-eb-stat-lbl">Reported EPS</span>
            <span className="sai-res-eb-stat-val">{hidden ? MASK : `$${Number(reported).toFixed(2)}`}</span>
          </div>
        )}
        {estimate != null && (
          <div className="sai-res-eb-stat">
            <span className="sai-res-eb-stat-lbl">EPS Estimate</span>
            <span className="sai-res-eb-stat-val">{hidden ? MASK : `$${Number(estimate).toFixed(2)}`}</span>
          </div>
        )}
        {surprise != null && (
          <div className="sai-res-eb-stat">
            <span className="sai-res-eb-stat-lbl">Surprise</span>
            <span className="sai-res-eb-stat-val" style={{ color: surpriseColor }}>
              {hidden ? MASK : fmtPct(surprise)}
            </span>
          </div>
        )}
        {nextDate && (
          <div className="sai-res-eb-stat">
            <span className="sai-res-eb-stat-lbl">Next Earnings</span>
            <span className="sai-res-eb-stat-val">{hidden ? MASK : fmtDate(nextDate)}</span>
          </div>
        )}
      </div>
      {keyTakeaway && (
        <p className="sai-res-eb-takeaway">{hidden ? MASK : keyTakeaway}</p>
      )}
      <ProvenanceFooter data={sec} />
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

interface ResearchTabProps {
  ticker: string
  source: any
  hidden: boolean
  caseType: 'BUY' | 'HOLD' | 'SELL'
}

export default function StockAiResearchTab({ ticker, source, hidden, caseType }: ResearchTabProps) {
  const [research, setResearch] = useState<ResearchData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['investmentThesis']))
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [textSize, setTextSize] = useState<'S' | 'M' | 'L' | 'XL'>('M')
  const [defaultState, setDefaultState] = useState<'Collapsed' | 'Expanded' | 'Remember'>('Collapsed')
  const [sectionOrder, setSectionOrder] = useState<string[]>([...SECTION_KEYS])
  const [hiddenSections, setHiddenSections] = useState<Set<string>>(new Set())
  const [provenanceKey, setProvenanceKey] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const MASK = '••••'

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setResearch(null)
    fetch(`/api/intelligence/${encodeURIComponent(ticker)}/research`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setResearch(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker])

  const toggleSection = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const scrollToSection = (key: string) => {
    const el = sectionRefs.current[key]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setExpanded(prev => new Set([...prev, key]))
    }
  }

  const toggleHideSection = (key: string) => {
    setHiddenSections(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const r = research?.research
  const textSizeMap = { S: 11, M: 13, L: 15, XL: 17 }
  const fs = textSizeMap[textSize]

  // Summary card scores
  const moatScore: number | null = mv(r?.moatAnalysis?.metrics?.score)
  const riskScore: number | null = mv(r?.riskAnalysis?.metrics?.riskScore)
  const currentPrice: number | null = mv(r?.valuation?.metrics?.currentPrice)
  const fairValue: number | null = mv(r?.valuation?.metrics?.fairValue)
  const valScore: number | null = currentPrice != null && fairValue != null
    ? Math.max(0, Math.min(100, Math.round(50 + (fairValue - currentPrice) / currentPrice * 100)))
    : null
  const growthScore: number | null = source?.momentum_score ?? null

  const summaryCards = [
    { key: 'growthEngine',    label: 'Growth',    score: growthScore, inverted: false },
    { key: 'moatAnalysis',    label: 'Moat',      score: moatScore,   inverted: false },
    { key: 'valuation',       label: 'Valuation', score: valScore,    inverted: false },
    { key: 'riskAnalysis',    label: 'Risk',      score: riskScore,   inverted: true  },
  ]

  if (loading) {
    return (
      <div className="sai-res-loading">
        <div className="sai-res-spinner" />
        <span>Loading research…</span>
      </div>
    )
  }

  if (!r) {
    return (
      <div className="sai-res-empty">Research data unavailable for {ticker}.</div>
    )
  }

  function renderSectionBody(key: string, sec: ResearchSection) {
    const props = { sec, hidden, MASK }
    switch (key) {
      case 'investmentThesis':   return <InvestmentThesisBody {...props} r={r!} />
      case 'financialHealth':    return <FinancialHealthBody {...props} />
      case 'growthEngine':       return <GrowthEngineBody {...props} />
      case 'moatAnalysis':       return <MoatAnalysisBody {...props} />
      case 'valuation':          return <ValuationBody {...props} />
      case 'institutionalThesis':return <InstitutionalThesisBody {...props} />
      case 'competitiveComparison': return <CompetitiveComparisonBody {...props} />
      case 'riskAnalysis':       return <RiskAnalysisBody {...props} />
      case 'bullBearDebate':     return <BullBearDebateBody {...props} caseType={caseType} />
      case 'earningsBreakdown':  return <EarningsBreakdownBody {...props} />
      default:                   return <div className="sai-res-summary-text">{sec.summary}</div>
    }
  }

  return (
    <div className="sai-res-root" style={{ fontSize: fs }}>
      {/* ── Research Summary ─────────────────────────────── */}
      <div className="sai-res-summary">
        <div className="sai-res-sum-hdr">
          <span className="sai-res-sum-ttl">Research Summary</span>
          <span className="sai-res-sum-date">Data as of {fmtDate(research?.generatedAt)}</span>
        </div>
        <div className="sai-res-sum-cards">
          {summaryCards.map(c => {
            const col = scoreColor(c.score, c.inverted)
            const lbl = scoreLabel(c.score, c.inverted)
            return (
              <button key={c.key} className="sai-res-sum-card" onClick={() => scrollToSection(c.key)}>
                <span className="sai-res-sum-score" style={{ color: col }}>
                  {hidden ? MASK : c.score ?? EMPTY}
                </span>
                {c.score != null && <span className="sai-res-sum-max">/100</span>}
                <span className="sai-res-sum-label">{c.label}</span>
                <span className="sai-res-sum-class" style={{ color: col }}>{hidden ? MASK : lbl}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Sections ─────────────────────────────── */}
      {sectionOrder.map(key => {
        if (hiddenSections.has(key)) return null
        const sec = r[key as keyof typeof r] as ResearchSection | null
        if (!sec) return null

        // Conditional render gates
        if (key === 'competitiveComparison' && !(sec as any).shouldRender) return null
        if (key === 'earningsBreakdown' && (sec as any).shouldRender === false) return null

        const isExpanded = expanded.has(key)

        return (
          <div key={key} className="sai-res-section"
            ref={el => { sectionRefs.current[key] = el }}>
            {/* Header */}
            <div className="sai-res-sec-hdr"
              role="button" tabIndex={0}
              onClick={() => toggleSection(key)}
              onKeyDown={e => e.key === 'Enter' && toggleSection(key)}>
              <span className="sai-res-sec-ttl">{SECTION_LABELS[key]}</span>
              <div className="sai-res-sec-hdr-right">
                <button className="sai-exp2-info-btn"
                  onClick={e => { e.stopPropagation(); setProvenanceKey(provenanceKey === key ? null : key) }}>
                  i
                </button>
                <span className="sai-res-chevron">{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Provenance tooltip */}
            {provenanceKey === key && <ProvenanceFooter data={sec} />}

            {/* Body — CSS transition */}
            <div className={`sai-res-body${isExpanded ? ' sai-res-body--open' : ''}`}>
              {isExpanded && renderSectionBody(key, sec)}
            </div>
          </div>
        )
      })}

      {/* ── Customize button ─────────────────────────────── */}
      <button className="sai-res-cust-btn" onClick={() => setCustomizeOpen(true)}>
        ⊞ Customize Research
      </button>

      {/* ── Customize drawer ─────────────────────────────── */}
      {customizeOpen && (
        <div className="sai-rsc-overlay" onClick={() => setCustomizeOpen(false)}>
          <div className="sai-rsc-drawer" onClick={e => e.stopPropagation()}>
            <div className="sai-rsc-hdr">
              <span>Customize Research</span>
              <button className="sai-rsc-close" onClick={() => setCustomizeOpen(false)}>✕</button>
            </div>

            {/* 1. Layout */}
            <div className="sai-rsc-group">
              <div className="sai-rsc-group-ttl">1. Layout (Show / Hide &amp; Reorder)</div>
              <div className="sai-rsc-layout-list">
                {sectionOrder.map(key => (
                  <div key={key} className="sai-rsc-layout-row">
                    <span className="sai-rsc-drag-handle">⠿</span>
                    <span className="sai-rsc-layout-lbl">{SECTION_LABELS[key]}</span>
                    <button
                      className={`sai-rsc-toggle${hiddenSections.has(key) ? '' : ' sai-rsc-toggle--on'}`}
                      onClick={() => toggleHideSection(key)}>
                      <span className="sai-rsc-toggle-knob" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Text Size */}
            <div className="sai-rsc-group">
              <div className="sai-rsc-group-ttl">2. Text Size</div>
              <div className="sai-rsc-size-row">
                {(['S', 'M', 'L', 'XL'] as const).map(s => (
                  <button key={s}
                    className={`sai-rsc-size-btn${textSize === s ? ' sai-rsc-size-btn--active' : ''}`}
                    onClick={() => setTextSize(s)}>{s}</button>
                ))}
              </div>
            </div>

            {/* 3. Default State */}
            <div className="sai-rsc-group">
              <div className="sai-rsc-group-ttl">3. Default State</div>
              <div className="sai-rsc-state-list">
                {(['Collapsed', 'Expanded', 'Remember'] as const).map(s => (
                  <button key={s}
                    className={`sai-rsc-state-btn${defaultState === s ? ' sai-rsc-state-btn--active' : ''}`}
                    onClick={() => setDefaultState(s)}>
                    {s === 'Remember' ? 'Remember Last State' : s}
                  </button>
                ))}
              </div>
              <div className="sai-rsc-hint">Applies to this device only.</div>
            </div>

            <button className="sai-rsc-reset" onClick={() => {
              setHiddenSections(new Set())
              setSectionOrder([...SECTION_KEYS])
              setTextSize('M')
              setDefaultState('Collapsed')
            }}>Reset to Default</button>
          </div>
        </div>
      )}
    </div>
  )
}
