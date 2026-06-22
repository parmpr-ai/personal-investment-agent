'use client'
// ARTEMIS-AI-COMPACT-REDESIGN-001
// Design source: docs/mocks/ai-intelligence/claude-compact-bull.html

import './AiIntelligenceCompactV3.css'
import AIHero, { CaseType } from './AIHero'
import { mask } from '../../lib/pia-api'

type VerdictState = 'bull' | 'bear' | 'balanced' | 'trim'

export interface AiCompactV3Props {
  verdictState: VerdictState
  composite:    number | null
  risk:         number | null
  upside:       number | null
  fitScore:     number | null
  momentumScore:  number | null
  trendScore:     number | null
  sentimentScore: number | null
  institutional:  number | null
  acBuyPct:   number | null
  acCount:    number | null
  acVerdict:  string
  bullProb:   number
  nextCatName: string
  hidden:  boolean
  onTap:   () => void
}

/* ── Helpers ── */
const EMPTY = '--'

function signedPct(v: number | null, digits = 1): string {
  if (v == null) return EMPTY
  const s = Math.abs(v).toFixed(digits)
  return v >= 0 ? `+${s}%` : `-${s}%`
}

function scoreLabel(score: number | null, hi: string, mid: string, lo: string, empty = EMPTY): string {
  if (score == null) return empty
  return score >= 65 ? hi : score >= 45 ? mid : lo
}

function verdictToCase(vs: VerdictState): CaseType {
  if (vs === 'bull') return 'BUY'
  if (vs === 'bear') return 'SELL'
  return 'HOLD'
}

function riskLabel(risk: number | null): string {
  if (risk == null) return EMPTY
  return risk <= 25 ? 'Low' : risk <= 50 ? 'Medium' : risk <= 75 ? 'Elevated' : 'High'
}

function riskMainColor(risk: number | null): string {
  if (risk == null) return ''
  return risk <= 50 ? 'cv3-card-main--green' : risk <= 75 ? 'cv3-card-main--amber' : 'cv3-card-main--red'
}

function iconColor(score: number | null, hiColor: string, loColor = ''): string {
  if (score == null) return ''
  return score >= 65 ? hiColor : score >= 45 ? '' : loColor
}

/* ── Ring gauge SVG (confidence) ── */
function RingGauge({ pct, color }: { pct: number; color: string }) {
  const r = 24
  const cx = 30, cy = 30
  const circ = 2 * Math.PI * r           // ≈ 150.8
  const offset = circ * (1 - pct / 100)
  const hex = color === 'green' ? '#2BE2AC' : color === 'amber' ? '#F0C272' : color === 'red' ? '#FF6B61' : '#6BB0FF'
  return (
    <svg viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={hex}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: `drop-shadow(0 0 5px ${hex}66)` }}
      />
    </svg>
  )
}

/* ── Half-arc gauge SVG (position fit) ── */
function ArcGauge({ pct, color }: { pct: number; color: string }) {
  const r = 38
  const cx = 50, cy = 52
  // Arc from (12,52) to (88,52) going upward
  const arcLen = Math.PI * r                  // ≈ 119.4
  const offset = arcLen * (1 - pct / 100)
  const hex = color === 'green' ? '#2BE2AC' : color === 'amber' ? '#F0C272' : color === 'red' ? '#FF6B61' : '#6BB0FF'
  const trackD = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`
  return (
    <svg viewBox="0 0 100 56" width="100" height="56" aria-hidden="true">
      <path d={trackD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" strokeLinecap="round" />
      <path
        d={trackD}
        fill="none"
        stroke={hex}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${arcLen}`}
        strokeDashoffset={offset}
        style={{ filter: `drop-shadow(0 0 5px ${hex}66)` }}
      />
    </svg>
  )
}

/* ── Sparkline SVG ── */
function Sparkline({ direction, color }: { direction: 'up' | 'flat' | 'down'; color: string }) {
  const paths: Record<string, string> = {
    up:   'M0,40 C10,35 20,28 30,22 S45,12 60,5',
    flat: 'M0,22 C10,20 20,25 30,22 S48,20 60,22',
    down: 'M0,5  C10,12 20,22 30,28 S48,35 60,40',
  }
  const hex = color === 'green' ? '#2BE2AC' : color === 'red' ? '#FF6B61' : color === 'amber' ? '#F0C272' : '#6BB0FF'
  return (
    <svg viewBox="0 0 60 45" width="100%" height="44" preserveAspectRatio="none" aria-hidden="true">
      <path d={paths[direction]} fill="none" stroke={hex} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

/* ── Area chart SVG (momentum) ── */
function AreaChart({ direction, color }: { direction: 'up' | 'flat' | 'down'; color: string }) {
  const linePaths: Record<string, string> = {
    up:   'M0,40 C10,35 20,28 30,22 S45,12 60,5',
    flat: 'M0,22 C10,20 20,25 30,22 S48,20 60,22',
    down: 'M0,5  C10,12 20,22 30,28 S48,35 60,40',
  }
  const fillPaths: Record<string, string> = {
    up:   'M0,40 C10,35 20,28 30,22 S45,12 60,5 L60,45 L0,45 Z',
    flat: 'M0,22 C10,20 20,25 30,22 S48,20 60,22 L60,45 L0,45 Z',
    down: 'M0,5  C10,12 20,22 30,28 S48,35 60,40 L60,45 L0,45 Z',
  }
  const hex = color === 'green' ? '#2BE2AC' : color === 'red' ? '#FF6B61' : color === 'amber' ? '#F0C272' : '#6BB0FF'
  const id = `cv3-area-${color}-${direction}`
  return (
    <svg viewBox="0 0 60 45" width="100%" height="44" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hex} stopOpacity="0.35" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPaths[direction]} fill={`url(#${id})`} />
      <path d={linePaths[direction]} fill="none" stroke={hex} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

/* ── Staircase SVG (earnings momentum) ── */
function Staircase({ direction, color }: { direction: 'up' | 'flat' | 'down'; color: string }) {
  const upPath   = 'M2,52 L2,40 L18,40 L18,28 L34,28 L34,16 L50,16 L50,4'
  const flatPath = 'M2,28 L18,28 L18,28 L34,28 L34,28 L50,28'
  const downPath = 'M2,4 L2,16 L18,16 L18,28 L34,28 L34,40 L50,40 L50,52'
  const d = direction === 'up' ? upPath : direction === 'down' ? downPath : flatPath
  const hex = color === 'green' ? '#2BE2AC' : color === 'red' ? '#FF6B61' : color === 'amber' ? '#F0C272' : '#6BB0FF'
  return (
    <svg viewBox="0 0 52 56" width="52" height="44" aria-hidden="true">
      <path d={d} fill="none" stroke={hex} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${hex}66)` }} />
    </svg>
  )
}

/* ── Icon SVGs ── */
const IcGrowth = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,13 4.5,8.5 7.5,10.5 13.5,2.5" />
    <polyline points="10,2.5 13.5,2.5 13.5,6" />
  </svg>
)
const IcGauge = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M2,12 A5.5,5.5 0 1 1 13,12" />
    <line x1="7.5" y1="12" x2="10.5" y2="5.5" />
    <circle cx="7.5" cy="12" r="1" fill="currentColor" />
  </svg>
)
const IcTarget = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="7.5" cy="7.5" r="6" />
    <circle cx="7.5" cy="7.5" r="3.2" />
    <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
  </svg>
)
const IcShield = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5,1.5 L13,4 L13,8 C13,11 7.5,13.5 7.5,13.5 C7.5,13.5 2,11 2,8 L2,4 Z" />
  </svg>
)
const IcBars = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="9" width="3.5" height="4.5" rx="1" />
    <rect x="5.75" y="5.5" width="3.5" height="8" rx="1" />
    <rect x="10.5" y="2" width="3.5" height="11.5" rx="1" />
  </svg>
)
const IcScales = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="7.5" y1="1.5" x2="7.5" y2="13.5" />
    <line x1="2" y1="7.5" x2="13" y2="7.5" />
    <polyline points="3.5,4 1.5,7 5.5,7" />
    <polyline points="9.5,4 13.5,7 11.5,7" />
  </svg>
)
const IcTrend = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,11 5,7 8,9.5 14,3" />
    <polyline points="10,3 14,3 14,7" />
  </svg>
)
const IcChat = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5,2 L13.5,2 C13.5,2 14,2 14,2.5 L14,9.5 C14,10 13.5,10 13.5,10 L5,10 L2.5,13 L2.5,10 L1.5,10 C1,10 1,9.5 1,9.5 L1,2.5 C1,2 1.5,2 1.5,2 Z" />
  </svg>
)
const IcBuilding = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="11" height="9.5" rx="1" />
    <path d="M2,4 L7.5,1 L13,4" />
    <line x1="5" y1="13.5" x2="5" y2="9" />
    <line x1="7.5" y1="13.5" x2="7.5" y2="9" />
    <line x1="10" y1="13.5" x2="10" y2="9" />
  </svg>
)
const IcCalendar = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1.5" y="2.5" width="12" height="11" rx="2" />
    <line x1="1.5" y1="6.5" x2="13.5" y2="6.5" />
    <line x1="4.5" y1="1" x2="4.5" y2="4" />
    <line x1="10.5" y1="1" x2="10.5" y2="4" />
  </svg>
)
const IcStairs = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1,14 1,10 5,10 5,7 9,7 9,4 13,4 13,1" />
  </svg>
)
const IcWave = () => (
  <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M1,8 C2.5,4 4,4 5.5,8 C7,12 8.5,12 10,8 C11.5,4 13,4 14,6.5" />
  </svg>
)

/* ── Card wrapper ── */
function Card({ label, iconEl, iconVariant, mainEl, subEl, vizEl }: {
  label: string
  iconEl: React.ReactNode
  iconVariant: string
  mainEl: React.ReactNode
  subEl?: React.ReactNode
  vizEl: React.ReactNode
}) {
  return (
    <div className="cv3-card">
      <div className="cv3-card-head">
        <div className={`cv3-card-icon${iconVariant ? ` cv3-card-icon--${iconVariant}` : ''}`}>{iconEl}</div>
        <span className="cv3-card-label">{label}</span>
      </div>
      <div className="cv3-card-value">
        {mainEl}
        {subEl}
      </div>
      <div className="cv3-card-viz">{vizEl}</div>
    </div>
  )
}

/* ── Main component ── */
export default function AiIntelligenceCompactV3({
  verdictState,
  composite, risk, upside, fitScore,
  momentumScore, trendScore, sentimentScore, institutional,
  acBuyPct, acCount, acVerdict,
  bullProb, nextCatName,
  hidden, onTap,
}: AiCompactV3Props) {
  const effectiveState: VerdictState = verdictState === 'trim' ? 'balanced' : verdictState
  const caseType = verdictToCase(effectiveState)
  const verdictText = caseType === 'BUY' ? 'BUY' : caseType === 'SELL' ? 'SELL' : 'HOLD'
  const convictionLabel = caseType === 'BUY' ? 'Strong Opportunity' : caseType === 'SELL' ? 'High Risk Signal' : 'Mixed Signals'

  // Bull / bear bar
  const bearProb  = 100 - bullProb
  const bullWidth = `${bullProb}%`
  const bearWidth = `${bearProb}%`

  // Score-derived labels
  const fitLabel   = scoreLabel(fitScore, 'Strong', 'Moderate', 'Weak')
  const trendLabel = scoreLabel(trendScore, 'Bullish', 'Neutral', 'Bearish')
  const sentLabel  = scoreLabel(sentimentScore, 'Positive', 'Neutral', 'Negative')
  const momLabel   = scoreLabel(momentumScore, 'Strong', 'Moderate', 'Weak')

  // Analyst pcts
  const buyPct  = acBuyPct  != null ? Math.round(acBuyPct) : (verdictText === 'BUY' ? 72 : verdictText === 'SELL' ? 18 : 48)
  const holdPct = Math.round((100 - buyPct) * 0.65)
  const sellPct = 100 - buyPct - holdPct

  const buyCount  = acCount != null ? Math.round(acCount * buyPct  / 100) : null
  const holdCount = acCount != null ? Math.round(acCount * holdPct / 100) : null
  const sellCount = acCount != null ? acCount - (buyCount ?? 0) - (holdCount ?? 0) : null

  // Institutional flow label
  const instFlow = institutional != null
    ? institutional >= 65 ? '+$1.2B' : institutional >= 50 ? '+$0.4B' : institutional >= 35 ? '-$0.3B' : '-$1.1B'
    : EMPTY
  const instFlowColor = institutional != null
    ? institutional >= 50 ? 'cv3-card-main--green' : 'cv3-card-main--red'
    : ''

  // Fair value track positions
  const nowPos    = 20   // current price always shown at 20% from left in track
  const targetPos = upside != null ? Math.min(90, Math.max(30, 20 + upside * 0.5 + 10)) : 65

  // Sparkline direction
  const sparkDir = (upside ?? 0) > 0 ? 'up' : (upside ?? 0) < 0 ? 'down' : 'flat'
  const trendDir = trendScore != null ? (trendScore >= 55 ? 'up' : trendScore >= 45 ? 'flat' : 'down') : 'flat'
  const momDir   = momentumScore != null ? (momentumScore >= 55 ? 'up' : momentumScore >= 45 ? 'flat' : 'down') : 'flat'

  // Icon colors
  const accentColor = effectiveState === 'bull' ? 'green' : effectiveState === 'bear' ? 'red' : 'amber'
  const confIconColor  = iconColor(composite, 'green', 'amber')
  const fitIconColor   = iconColor(fitScore, 'green', 'red')
  const riskIconColor  = risk != null && risk > 65 ? 'red' : risk != null && risk > 45 ? 'amber' : 'green'
  const trendIconColor = trendScore != null && trendScore >= 65 ? 'green' : trendScore != null && trendScore < 45 ? 'red' : ''
  const sentIconColor  = sentimentScore != null && sentimentScore >= 60 ? 'green' : sentimentScore != null && sentimentScore < 40 ? 'red' : ''
  const instIconColor  = institutional != null && institutional >= 60 ? 'blue' : ''
  const momIconColor   = momentumScore != null && momentumScore >= 65 ? 'green' : momentumScore != null && momentumScore < 45 ? 'red' : ''

  // Value colors
  const upsideColor = upside == null ? '' : upside > 0 ? 'cv3-card-main--green' : upside < 0 ? 'cv3-card-main--red' : ''
  const fitColor    = fitScore != null ? (fitScore >= 65 ? 'green' : fitScore >= 45 ? 'amber' : 'red') : 'blue'
  const arcColor    = fitScore != null ? (fitScore >= 65 ? 'green' : fitScore >= 45 ? 'amber' : 'red') : 'blue'

  return (
    <div
      className={`cv3-root cv3-root--${effectiveState}`}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTap() }}
      aria-label="Open full AI Intelligence analysis"
    >
      {/* ── Header ── */}
      <div className="cv3-hdr">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9,1.5 L10.8,6.3 L16,6.3 L11.8,9.7 L13.6,14.5 L9,11.1 L4.4,14.5 L6.2,9.7 L2,6.3 L7.2,6.3 Z"
            fill={effectiveState === 'bull' ? '#2BE2AC' : effectiveState === 'bear' ? '#FF6B61' : '#F0C272'}
            style={{ filter: `drop-shadow(0 0 4px ${effectiveState === 'bull' ? 'rgba(43,226,172,0.6)' : effectiveState === 'bear' ? 'rgba(255,107,97,0.6)' : 'rgba(240,194,114,0.6)'})` }}
          />
        </svg>
        <span className="cv3-hdr-title">AI Intelligence</span>
      </div>

      {/* ── Hero ── */}
      <div className="cv3-hero">
        <div className="cv3-hero-gradient" />
        <div className="cv3-scrim" />
        <div className="cv3-hero-text">
          <div className="cv3-verdict">{hidden ? '•••' : verdictText}</div>
          <div className="cv3-conviction">{hidden ? '••••••' : convictionLabel}</div>
        </div>
        <div className="cv3-hero-img-wrap">
          <AIHero caseType={caseType} size="compact" motion="enabled" theme="pia-signature" />
        </div>
      </div>

      {/* ── Bull / Bear Bar ── */}
      <div className="cv3-bb">
        <span className="cv3-bb-lbl cv3-bb-lbl--bull">
          Bull {hidden ? '••' : `${bullProb}%`}
        </span>
        <div className="cv3-bb-track">
          <div className="cv3-bb-fill-bull" style={{ width: hidden ? '50%' : bullWidth }} />
          <div className="cv3-bb-fill-bear" style={{ width: hidden ? '50%' : bearWidth }} />
        </div>
        <span className="cv3-bb-lbl cv3-bb-lbl--bear">
          Bear {hidden ? '••' : `${bearProb}%`}
        </span>
      </div>

      {/* ── Row 1 ── */}
      <div className="cv3-row">

        {/* Card 1 — Portfolio Impact */}
        <Card
          label={'Portfolio\nImpact'}
          iconEl={<IcGrowth />}
          iconVariant={upside != null && !hidden ? (upside > 0 ? 'green' : upside < 0 ? 'red' : '') : accentColor}
          mainEl={<span className={`cv3-card-main${hidden ? '' : ` ${upsideColor}`}`}>{hidden ? mask : signedPct(upside)}</span>}
          subEl={<span className="cv3-card-sub">{hidden ? '' : 'expected'}</span>}
          vizEl={<Sparkline direction={hidden ? 'flat' : sparkDir} color={upside != null && upside < 0 ? 'red' : 'green'} />}
        />

        {/* Card 2 — AI Confidence */}
        <Card
          label={'AI\nConfidence'}
          iconEl={<IcGauge />}
          iconVariant={hidden ? '' : confIconColor}
          mainEl={<span className={`cv3-card-main${hidden ? '' : confIconColor === 'green' ? ' cv3-card-main--green' : confIconColor === 'amber' ? ' cv3-card-main--amber' : ''}`}>
            {hidden ? mask : composite ?? EMPTY}
          </span>}
          subEl={!hidden && composite != null ? <span className="cv3-card-sub">/100</span> : undefined}
          vizEl={
            <div className="cv3-card-viz--center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <RingGauge pct={hidden ? 50 : composite ?? 50} color={hidden ? 'blue' : confIconColor || 'blue'} />
            </div>
          }
        />

        {/* Card 3 — Position Fit */}
        <Card
          label={'Position\nFit'}
          iconEl={<IcTarget />}
          iconVariant={hidden ? '' : fitIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : fitColor === 'green' ? ' cv3-card-main--green' : fitColor === 'amber' ? ' cv3-card-main--amber' : fitColor === 'red' ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : fitLabel}
          </span>}
          vizEl={
            <div style={{ width: '100%' }}>
              <ArcGauge pct={hidden ? 50 : fitScore ?? 50} color={hidden ? 'blue' : arcColor} />
            </div>
          }
        />

        {/* Card 4 — Risk Level */}
        <Card
          label={'Risk\nLevel'}
          iconEl={<IcShield />}
          iconVariant={hidden ? '' : riskIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : ` ${riskMainColor(risk)}`}`}>
            {hidden ? mask : riskLabel(risk)}
          </span>}
          vizEl={
            <div style={{ width: '100%' }}>
              <div className="cv3-risk-track">
                <div className="cv3-risk-fill" style={{ width: hidden ? '50%' : `${risk ?? 50}%` }} />
                <div className="cv3-risk-dot"  style={{ left: hidden ? '50%' : `${risk ?? 50}%` }} />
              </div>
              <div className="cv3-risk-marks">
                <span>Low</span><span>High</span>
              </div>
            </div>
          }
        />
      </div>

      {/* ── Row 2 ── */}
      <div className="cv3-row">

        {/* Card 5 — Analyst Consensus */}
        <Card
          label={'Analyst\nConsensus'}
          iconEl={<IcBars />}
          iconVariant=""
          mainEl={<span className={`cv3-card-main cv3-card-main--xs${hidden ? '' : buyPct >= 60 ? ' cv3-card-main--green' : buyPct < 40 ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : (acVerdict && acVerdict !== '--' ? acVerdict.replace('Strong ', '') : (buyPct >= 60 ? 'Buy' : buyPct < 40 ? 'Sell' : 'Hold'))}
          </span>}
          subEl={!hidden && acCount != null ? <span className="cv3-card-sub">{acCount} analysts</span> : undefined}
          vizEl={
            <div className="cv3-ac-bars">
              <div className="cv3-ac-row">
                <span className="cv3-ac-lbl cv3-ac-lbl--buy">Buy</span>
                <div className="cv3-ac-track"><div className="cv3-ac-fill cv3-ac-fill--buy" style={{ width: hidden ? '0%' : `${buyPct}%` }} /></div>
                <span className="cv3-ac-count cv3-ac-count--buy">{hidden ? '•' : (buyCount ?? buyPct + '%')}</span>
              </div>
              <div className="cv3-ac-row">
                <span className="cv3-ac-lbl cv3-ac-lbl--hold">Hold</span>
                <div className="cv3-ac-track"><div className="cv3-ac-fill cv3-ac-fill--hold" style={{ width: hidden ? '0%' : `${holdPct}%` }} /></div>
                <span className="cv3-ac-count cv3-ac-count--hold">{hidden ? '•' : (holdCount ?? holdPct + '%')}</span>
              </div>
              <div className="cv3-ac-row">
                <span className="cv3-ac-lbl cv3-ac-lbl--sell">Sell</span>
                <div className="cv3-ac-track"><div className="cv3-ac-fill cv3-ac-fill--sell" style={{ width: hidden ? '0%' : `${sellPct}%` }} /></div>
                <span className="cv3-ac-count cv3-ac-count--sell">{hidden ? '•' : (sellCount ?? sellPct + '%')}</span>
              </div>
            </div>
          }
        />

        {/* Card 6 — Fair Value Edge */}
        <Card
          label={'Fair Value\nEdge'}
          iconEl={<IcScales />}
          iconVariant={hidden ? '' : (upside != null && upside > 0 ? 'green' : upside != null && upside < 0 ? 'red' : '')}
          mainEl={<span className={`cv3-card-main${hidden ? '' : ` ${upsideColor}`}`}>
            {hidden ? mask : signedPct(upside, 0)}
          </span>}
          subEl={<span className="cv3-card-sub">{hidden ? '' : 'vs fair value'}</span>}
          vizEl={
            <div className="cv3-fv-wrap">
              <div className="cv3-fv-track">
                <div className="cv3-fv-fill" style={{ left: `${nowPos}%`, right: `${100 - targetPos}%` }} />
                <div className="cv3-fv-now"   style={{ left: `${nowPos}%` }} />
                <div className="cv3-fv-target" style={{ left: `${targetPos}%` }} />
              </div>
              <div className="cv3-fv-labels">
                <span>Now</span><span>Target</span>
              </div>
            </div>
          }
        />

        {/* Card 7 — Technical Trend */}
        <Card
          label={'Technical\nTrend'}
          iconEl={<IcTrend />}
          iconVariant={hidden ? '' : trendIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : trendScore != null && trendScore >= 65 ? ' cv3-card-main--green' : trendScore != null && trendScore < 45 ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : trendLabel}
          </span>}
          vizEl={<Sparkline direction={hidden ? 'flat' : trendDir} color={trendScore != null && trendScore < 45 ? 'red' : trendScore != null && trendScore >= 65 ? 'green' : 'blue'} />}
        />

        {/* Card 8 — News Sentiment */}
        <Card
          label={'News\nSentiment'}
          iconEl={<IcChat />}
          iconVariant={hidden ? '' : sentIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : sentimentScore != null && sentimentScore >= 60 ? ' cv3-card-main--green' : sentimentScore != null && sentimentScore < 40 ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : sentLabel}
          </span>}
          vizEl={
            <div className="cv3-sent-wrap">
              <div className="cv3-sent-track">
                <div className="cv3-sent-dot" style={{ left: hidden ? '50%' : `${Math.min(95, Math.max(5, sentimentScore ?? 50))}%` }} />
              </div>
              <div className="cv3-sent-marks"><span>Neg</span><span>Pos</span></div>
            </div>
          }
        />
      </div>

      {/* ── Row 3 ── */}
      <div className="cv3-row" style={{ paddingBottom: 18 }}>

        {/* Card 9 — Institutional Flow */}
        <Card
          label={'Institutional\nFlow'}
          iconEl={<IcBuilding />}
          iconVariant={hidden ? '' : instIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : ` ${instFlowColor}`}`}>
            {hidden ? mask : instFlow}
          </span>}
          subEl={<span className="cv3-card-sub">{hidden ? '' : 'net flow est.'}</span>}
          vizEl={
            <div className="cv3-flow">
              {[0.35, 0.55, 0.45, 0.65, 0.50, 1.0].map((h, i) => (
                <i key={i} style={{ height: `${h * 100}%` }} />
              ))}
            </div>
          }
        />

        {/* Card 10 — Upcoming Catalyst */}
        <Card
          label={'Upcoming\nCatalyst'}
          iconEl={<IcCalendar />}
          iconVariant="amber"
          mainEl={<span className="cv3-card-main cv3-card-main--xs cv3-card-main--amber" style={{ lineHeight: 1.2 }}>
            {hidden ? mask : nextCatName.split(' ').slice(0, 2).join(' ')}
          </span>}
          vizEl={
            <div className="cv3-cal">
              <div className="cv3-cal-box">
                <div className="cv3-cal-top" />
                <span className="cv3-cal-d">{hidden ? '?' : '~'}</span>
              </div>
              <span className="cv3-cal-lbl">{hidden ? '••••' : 'Upcoming'}</span>
            </div>
          }
        />

        {/* Card 11 — Earnings Momentum */}
        <Card
          label={'Earnings\nMomentum'}
          iconEl={<IcStairs />}
          iconVariant={hidden ? '' : momIconColor}
          mainEl={<span className={`cv3-card-main cv3-card-main--sm${hidden ? '' : momentumScore != null && momentumScore >= 65 ? ' cv3-card-main--green' : momentumScore != null && momentumScore < 45 ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : momLabel}
          </span>}
          vizEl={<Staircase direction={hidden ? 'flat' : momDir} color={momentumScore != null && momentumScore < 45 ? 'red' : momentumScore != null && momentumScore >= 65 ? 'green' : 'blue'} />}
        />

        {/* Card 12 — Momentum */}
        <Card
          label="Momentum"
          iconEl={<IcWave />}
          iconVariant={hidden ? '' : momIconColor}
          mainEl={<span className={`cv3-card-main${hidden ? '' : momentumScore != null && momentumScore >= 65 ? ' cv3-card-main--green' : momentumScore != null && momentumScore < 45 ? ' cv3-card-main--red' : ''}`}>
            {hidden ? mask : (momentumScore ?? EMPTY)}
          </span>}
          subEl={!hidden && momentumScore != null ? <span className="cv3-card-sub">/100</span> : undefined}
          vizEl={<AreaChart direction={hidden ? 'flat' : momDir} color={momentumScore != null && momentumScore < 45 ? 'red' : momentumScore != null && momentumScore >= 65 ? 'green' : 'blue'} />}
        />
      </div>
    </div>
  )
}
