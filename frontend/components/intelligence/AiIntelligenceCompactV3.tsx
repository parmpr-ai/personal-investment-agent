'use client'
// CR-AI-COMPACT-REDESIGN-002 + CR-AI-COMPACT-REDESIGN-003
// Card customization (30-card pool, localStorage) + semantic tone per card.

import { useState, useEffect, useRef, PointerEvent as RPointerEvent } from 'react'
import './AiIntelligenceCompactV3.css'
import AIHero, { CaseType } from './AIHero'
import { mask } from '../../lib/pia-api'
import { MoreVertical, GripVertical, X, Info } from 'lucide-react'
import { useDoubleTapToClose } from '../../hooks/useDoubleTapToClose'

// ── Card registry ──────────────────────────────────────────────────────────────

type CardKey =
  'portfolioImpact' | 'aiConfidence' | 'positionFit' | 'riskLevel' |
  'analystConsensus' | 'fairValueEdge' | 'technicalTrend' | 'newsSentiment' |
  'institutionalFlow' | 'upcomingCatalyst' | 'earningsMomentum' | 'aiModelAgreement' |
  'revenueGrowth' | 'epsGrowth' | 'marginTrend' | 'fcfTrend' |
  'valuationStatus' | 'insiderActivity' | 'hedgeFundFlow' | 'congressActivity' |
  'macroSensitivity' | 'sectorExposure' | 'correlationRisk' | 'diversificationImpact' |
  'analystTargetGap' | 'priceVsFairValue' | 'earningsSurprise' | 'catalystRisk' |
  'technicalSupport' | 'technicalResistance'

const CARD_LABELS: Record<CardKey, string> = {
  portfolioImpact:    'Portfolio Impact',
  aiConfidence:       'AI Confidence',
  positionFit:        'Position Fit',
  riskLevel:          'Risk Level',
  analystConsensus:   'Analyst Consensus',
  fairValueEdge:      'Fair Value Edge',
  technicalTrend:     'Technical Trend',
  newsSentiment:      'News Sentiment',
  institutionalFlow:  'Institutional Flow',
  upcomingCatalyst:   'Upcoming Catalyst',
  earningsMomentum:   'Earnings Momentum',
  aiModelAgreement:   'AI Model Agreement',
  revenueGrowth:      'Revenue Growth',
  epsGrowth:          'EPS Growth',
  marginTrend:        'Margin Trend',
  fcfTrend:           'FCF Trend',
  valuationStatus:    'Valuation Status',
  insiderActivity:    'Insider Activity',
  hedgeFundFlow:      'Hedge Fund Flow',
  congressActivity:   'Congress Activity',
  macroSensitivity:   'Macro Sensitivity',
  sectorExposure:     'Sector Exposure',
  correlationRisk:    'Correlation Risk',
  diversificationImpact: 'Diversification',
  analystTargetGap:   'Analyst Target Gap',
  priceVsFairValue:   'Price vs Fair Value',
  earningsSurprise:   'Earnings Surprise',
  catalystRisk:       'Catalyst Risk',
  technicalSupport:   'Technical Support',
  technicalResistance:'Tech. Resistance',
}

const ALL_CARD_KEYS: CardKey[] = [
  'portfolioImpact', 'aiConfidence', 'positionFit', 'riskLevel',
  'analystConsensus', 'fairValueEdge', 'technicalTrend', 'newsSentiment',
  'institutionalFlow', 'upcomingCatalyst', 'earningsMomentum', 'aiModelAgreement',
  'revenueGrowth', 'epsGrowth', 'marginTrend', 'fcfTrend',
  'valuationStatus', 'insiderActivity', 'hedgeFundFlow', 'congressActivity',
  'macroSensitivity', 'sectorExposure', 'correlationRisk', 'diversificationImpact',
  'analystTargetGap', 'priceVsFairValue', 'earningsSurprise', 'catalystRisk',
  'technicalSupport', 'technicalResistance',
]

const DEFAULT_CARD_ORDER = ALL_CARD_KEYS.slice(0, 12)
const MAX_VISIBLE = 12
const PREFS_KEY = 'cv3-card-prefs-v1'

type CardPrefs = { order: CardKey[]; hidden: CardKey[] }

const DEFAULT_PREFS: CardPrefs = {
  order:  ALL_CARD_KEYS,
  hidden: ALL_CARD_KEYS.filter(k => !DEFAULT_CARD_ORDER.includes(k)),
}

function normalizePrefs(p: CardPrefs): CardPrefs {
  const seen = new Set<string>()
  const validKeys = new Set<string>(ALL_CARD_KEYS)
  const order = p.order.filter(k => validKeys.has(k) && !seen.has(k) && (seen.add(k), true)) as CardKey[]
  for (const k of ALL_CARD_KEYS) { if (!seen.has(k)) order.push(k) }
  const hidden = (p.hidden ?? []).filter(k => validKeys.has(k)) as CardKey[]
  const visibleCount = order.filter(k => !hidden.includes(k)).length
  if (visibleCount > MAX_VISIBLE) {
    let extra = visibleCount - MAX_VISIBLE
    const next = [...hidden]
    for (let i = order.length - 1; i >= 0 && extra > 0; i--) {
      if (!next.includes(order[i])) { next.push(order[i]); extra-- }
    }
    return { order, hidden: next }
  }
  return { order, hidden }
}

function readPrefs(): CardPrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (raw) return normalizePrefs(JSON.parse(raw) as CardPrefs)
  } catch {}
  return DEFAULT_PREFS
}

// ── Tone system ────────────────────────────────────────────────────────────────

type Tone = 'positive' | 'neutral' | 'negative'

function resolveCardTone(key: CardKey, p: AiCompactV3Props): Tone {
  switch (key) {
    case 'riskLevel':
      if (p.risk == null) return 'neutral'
      return p.risk <= 33 ? 'positive' : p.risk <= 62 ? 'neutral' : 'negative'
    case 'aiConfidence':
    case 'aiModelAgreement':
      if (p.composite == null) return 'neutral'
      return p.composite >= 65 ? 'positive' : p.composite >= 45 ? 'neutral' : 'negative'
    case 'positionFit':
    case 'sectorExposure':
    case 'diversificationImpact':
      if (p.fitScore == null) return 'neutral'
      return p.fitScore >= 65 ? 'positive' : p.fitScore >= 45 ? 'neutral' : 'negative'
    case 'portfolioImpact':
    case 'fairValueEdge':
    case 'priceVsFairValue':
    case 'analystTargetGap':
    case 'valuationStatus':
      if (p.upside == null) return 'neutral'
      return p.upside >= 10 ? 'positive' : p.upside >= -5 ? 'neutral' : 'negative'
    case 'technicalTrend':
    case 'technicalSupport':
      if (p.trendScore == null) return 'neutral'
      return p.trendScore >= 65 ? 'positive' : p.trendScore >= 45 ? 'neutral' : 'negative'
    case 'technicalResistance':
      if (p.trendScore == null) return 'neutral'
      return p.trendScore >= 65 ? 'negative' : p.trendScore >= 45 ? 'neutral' : 'positive'
    case 'newsSentiment':
      if (p.sentimentScore == null) return 'neutral'
      return p.sentimentScore >= 60 ? 'positive' : p.sentimentScore >= 40 ? 'neutral' : 'negative'
    case 'institutionalFlow':
    case 'hedgeFundFlow':
    case 'insiderActivity':
    case 'congressActivity':
      if (p.institutional == null) return 'neutral'
      return p.institutional >= 60 ? 'positive' : p.institutional >= 40 ? 'neutral' : 'negative'
    case 'earningsMomentum':
    case 'revenueGrowth':
    case 'epsGrowth':
    case 'marginTrend':
    case 'fcfTrend':
    case 'earningsSurprise':
      if (p.momentumScore == null) return 'neutral'
      return p.momentumScore >= 65 ? 'positive' : p.momentumScore >= 45 ? 'neutral' : 'negative'
    case 'analystConsensus': {
      const bp = p.acBuyPct ?? 50
      return bp >= 60 ? 'positive' : bp >= 40 ? 'neutral' : 'negative'
    }
    case 'upcomingCatalyst':
      return 'neutral'
    case 'catalystRisk':
      return 'negative'
    case 'macroSensitivity':
    case 'correlationRisk':
      return 'neutral'
    default:
      if (p.composite == null) return 'neutral'
      return p.composite >= 65 ? 'positive' : p.composite >= 45 ? 'neutral' : 'negative'
  }
}

function toneColor(t: Tone): string {
  return t === 'positive' ? 'green' : t === 'negative' ? 'red' : 'amber'
}
function toneHex(t: Tone): string {
  return t === 'positive' ? '#2BE2AC' : t === 'negative' ? '#FF6B61' : '#F0C272'
}
function mainToneClass(t: Tone): string {
  return t === 'positive' ? 'cv3-card-main--green' : t === 'negative' ? 'cv3-card-main--red' : 'cv3-card-main--amber'
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const EMPTY = '--'
type VerdictState = 'bull' | 'bear' | 'balanced' | 'trim'

function signedPct(v: number | null, digits = 1): string {
  if (v == null) return EMPTY
  return v >= 0 ? `+${Math.abs(v).toFixed(digits)}%` : `-${Math.abs(v).toFixed(digits)}%`
}
function scoreLabel(s: number | null, hi: string, mid: string, lo: string): string {
  if (s == null) return EMPTY
  return s >= 65 ? hi : s >= 45 ? mid : lo
}
function verdictToCase(vs: VerdictState): CaseType {
  return vs === 'bull' ? 'BUY' : vs === 'bear' ? 'SELL' : 'HOLD'
}
function riskLabel(r: number | null): string {
  if (r == null) return EMPTY
  return r <= 25 ? 'Low' : r <= 50 ? 'Medium' : r <= 75 ? 'Elevated' : 'High'
}
function pctDir(v: number | null): 'up' | 'flat' | 'down' {
  return v == null ? 'flat' : v > 0 ? 'up' : v < 0 ? 'down' : 'flat'
}
function scoreDir(s: number | null): 'up' | 'flat' | 'down' {
  return s == null ? 'flat' : s >= 55 ? 'up' : s >= 45 ? 'flat' : 'down'
}

// ── SVG components ─────────────────────────────────────────────────────────────

function RingGauge({ pct, hex }: { pct: number; hex: string }) {
  const r = 24, circ = 2 * Math.PI * r
  const offset = circ * (1 - pct / 100)
  return (
    <svg viewBox="0 0 60 60" width="54" height="54" aria-hidden="true">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
      <circle cx="30" cy="30" r={r} fill="none" stroke={hex} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${circ} ${circ}`} strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', filter: `drop-shadow(0 0 5px ${hex}66)` }} />
    </svg>
  )
}

function ArcGauge({ pct, hex }: { pct: number; hex: string }) {
  const r = 38, cx = 50, cy = 52
  const arcLen = Math.PI * r
  const trackD = `M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`
  return (
    <svg viewBox="0 0 100 56" width="100%" height="50" aria-hidden="true">
      <path d={trackD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" strokeLinecap="round" />
      <path d={trackD} fill="none" stroke={hex} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${arcLen} ${arcLen}`} strokeDashoffset={arcLen * (1 - pct / 100)}
        style={{ filter: `drop-shadow(0 0 5px ${hex}66)` }} />
    </svg>
  )
}

function Sparkline({ direction, hex }: { direction: 'up' | 'flat' | 'down'; hex: string }) {
  const paths = {
    up:   'M0,38 C10,32 20,24 30,18 S46,8 60,2',
    flat: 'M0,20 C10,18 20,22 30,20 S48,18 60,20',
    down: 'M0,2  C10,10 20,20 30,26 S48,34 60,38',
  }
  return (
    <svg viewBox="0 0 60 40" width="100%" height="38" preserveAspectRatio="none" aria-hidden="true">
      <path d={paths[direction]} fill="none" stroke={hex} strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

function AreaChart({ direction, hex }: { direction: 'up' | 'flat' | 'down'; hex: string }) {
  const lines = {
    up:   'M0,38 C10,32 20,24 30,18 S46,8 60,2',
    flat: 'M0,20 C10,18 20,22 30,20 S48,18 60,20',
    down: 'M0,2  C10,10 20,20 30,26 S48,34 60,38',
  }
  const fills = {
    up:   'M0,38 C10,32 20,24 30,18 S46,8 60,2 L60,40 L0,40 Z',
    flat: 'M0,20 C10,18 20,22 30,20 S48,18 60,20 L60,40 L0,40 Z',
    down: 'M0,2  C10,10 20,20 30,26 S48,34 60,38 L60,40 L0,40 Z',
  }
  const id = `cv3-area-${hex.replace('#', '')}`
  return (
    <svg viewBox="0 0 60 40" width="100%" height="38" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hex} stopOpacity="0.35" />
          <stop offset="100%" stopColor={hex} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fills[direction]} fill={`url(#${id})`} />
      <path d={lines[direction]} fill="none" stroke={hex} strokeWidth="2" strokeLinecap="round" opacity="0.9" />
    </svg>
  )
}

function Staircase({ direction, hex }: { direction: 'up' | 'flat' | 'down'; hex: string }) {
  const paths = {
    up:   'M2,50 L2,38 L18,38 L18,26 L34,26 L34,14 L50,14 L50,2',
    flat: 'M2,26 L18,26 L18,26 L34,26 L34,26 L50,26',
    down: 'M2,2 L2,14 L18,14 L18,26 L34,26 L34,38 L50,38 L50,50',
  }
  return (
    <svg viewBox="0 0 52 52" width="52" height="38" aria-hidden="true">
      <path d={paths[direction]} fill="none" stroke={hex} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${hex}66)` }} />
    </svg>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────────

const IcGrowth    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,13 4.5,8.5 7.5,10.5 13.5,2.5"/><polyline points="10,2.5 13.5,2.5 13.5,6"/></svg>
const IcGauge     = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2,12 A5.5,5.5 0 1 1 13,12"/><line x1="7.5" y1="12" x2="10.5" y2="5.5"/><circle cx="7.5" cy="12" r="1" fill="currentColor"/></svg>
const IcTarget    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><circle cx="7.5" cy="7.5" r="3.2"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/></svg>
const IcShield    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5,1.5 L13,4 L13,8 C13,11 7.5,13.5 7.5,13.5 C7.5,13.5 2,11 2,8 L2,4 Z"/></svg>
const IcBars      = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="9" width="3.5" height="4.5" rx="1"/><rect x="5.75" y="5.5" width="3.5" height="8" rx="1"/><rect x="10.5" y="2" width="3.5" height="11.5" rx="1"/></svg>
const IcScales    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="7.5" y1="1.5" x2="7.5" y2="13.5"/><line x1="2" y1="7.5" x2="13" y2="7.5"/><polyline points="3.5,4 1.5,7 5.5,7"/><polyline points="9.5,4 13.5,7 11.5,7"/></svg>
const IcTrend     = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,11 5,7 8,9.5 14,3"/><polyline points="10,3 14,3 14,7"/></svg>
const IcChat      = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1.5,2 L13.5,2 C14,2 14,2.5 14,2.5 L14,9.5 C14,10 13.5,10 13.5,10 L5,10 L2.5,13 L2.5,10 L1.5,10 C1,10 1,9.5 1,9.5 L1,2.5 C1,2 1.5,2 1.5,2 Z"/></svg>
const IcBuilding  = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="11" height="9.5" rx="1"/><path d="M2,4 L7.5,1 L13,4"/><line x1="5" y1="13.5" x2="5" y2="9"/><line x1="7.5" y1="13.5" x2="7.5" y2="9"/><line x1="10" y1="13.5" x2="10" y2="9"/></svg>
const IcCalendar  = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="2.5" width="12" height="11" rx="2"/><line x1="1.5" y1="6.5" x2="13.5" y2="6.5"/><line x1="4.5" y1="1" x2="4.5" y2="4"/><line x1="10.5" y1="1" x2="10.5" y2="4"/></svg>
const IcStairs    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="1,14 1,10 5,10 5,7 9,7 9,4 13,4 13,1"/></svg>
const IcWave      = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1,8 C2.5,4 4,4 5.5,8 C7,12 8.5,12 10,8 C11.5,4 13,4 14,6.5"/></svg>
const IcPercent   = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="4.5" cy="4.5" r="2"/><circle cx="10.5" cy="10.5" r="2"/><line x1="2" y1="13" x2="13" y2="2"/></svg>
const IcPerson    = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="4.5" r="2.5"/><path d="M2,13.5 C2,10.5 4.5,8.5 7.5,8.5 C10.5,8.5 13,10.5 13,13.5"/></svg>
const IcGlobe     = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><ellipse cx="7.5" cy="7.5" rx="2.5" ry="6"/><line x1="1.5" y1="7.5" x2="13.5" y2="7.5"/></svg>
const IcPie       = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M7.5,7.5 L7.5,1.5 A6,6 0 0 1 13.5,7.5 Z" fill="currentColor" opacity="0.3"/><circle cx="7.5" cy="7.5" r="6"/><line x1="7.5" y1="1.5" x2="7.5" y2="7.5"/><line x1="7.5" y1="7.5" x2="13.5" y2="7.5"/></svg>
const IcLink      = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5,9.5 A3.5,3.5 0 0 1 5.5,4.5 L8,2 A3.5,3.5 0 0 1 13,7 L10.5,9.5"/><path d="M9.5,5.5 A3.5,3.5 0 0 1 9.5,10.5 L7,13 A3.5,3.5 0 0 1 2,8 L4.5,5.5"/></svg>
const IcCapitol   = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="8" width="12" height="5" rx="1"/><path d="M3.5,8 L3.5,6 L11.5,6 L11.5,8"/><path d="M5.5,6 L5.5,4 L9.5,4 L9.5,6"/><line x1="7.5" y1="4" x2="7.5" y2="2.5"/><circle cx="7.5" cy="2" r="0.8" fill="currentColor"/></svg>
const IcFloor     = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="12" x2="14" y2="12"/><polyline points="2,9 5,6 8,8 13,3"/><polyline points="10,3 13,3 13,6"/></svg>
const IcCeiling   = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="1" y1="3" x2="14" y2="3"/><polyline points="2,6 5,9 8,7 13,12"/><polyline points="10,12 13,12 13,9"/></svg>
const IcSurprise  = () => <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="7.5" cy="7.5" r="6"/><line x1="7.5" y1="4.5" x2="7.5" y2="8"/><circle cx="7.5" cy="10.5" r="0.8" fill="currentColor"/></svg>

// ── Card wrapper ───────────────────────────────────────────────────────────────

function Card({ label, iconEl, tone, mainEl, subEl, vizEl }: {
  label: string; iconEl: React.ReactNode; tone: Tone
  mainEl: React.ReactNode; subEl?: React.ReactNode; vizEl: React.ReactNode
}) {
  return (
    <div className={`cv3-card cv3-card--${tone}`}>
      <div className="cv3-card-head">
        <div className={`cv3-card-icon cv3-card-icon--${toneColor(tone)}`}>{iconEl}</div>
        <span className="cv3-card-label">{label}</span>
      </div>
      <div className="cv3-card-value">{mainEl}{subEl}</div>
      <div className="cv3-card-viz">{vizEl}</div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface AiCompactV3Props {
  verdictState:   VerdictState
  composite:      number | null
  risk:           number | null
  upside:         number | null
  fitScore:       number | null
  momentumScore:  number | null
  trendScore:     number | null
  sentimentScore: number | null
  institutional:  number | null
  acBuyPct:       number | null
  acCount:        number | null
  acVerdict:      string
  bullProb:       number
  nextCatName:    string
  hidden:         boolean
  onTap:          () => void
  fc?:            any
}

// ── renderCard: per-card JSX ───────────────────────────────────────────────────

function renderCard(key: CardKey, p: AiCompactV3Props): React.ReactElement {
  const tone = resolveCardTone(key, p)
  const hex  = toneHex(tone)
  const mc   = mainToneClass(tone)
  const h    = p.hidden

  // Analyst bar derived values (used by analystConsensus)
  const buyPct  = p.acBuyPct  != null ? Math.round(p.acBuyPct) : (p.verdictState === 'bull' ? 72 : p.verdictState === 'bear' ? 18 : 48)
  const holdPct = Math.round((100 - buyPct) * 0.65)
  const sellPct = 100 - buyPct - holdPct
  const buyCount  = p.acCount != null ? Math.round(p.acCount * buyPct  / 100) : null
  const holdCount = p.acCount != null ? Math.round(p.acCount * holdPct / 100) : null
  const sellCount = p.acCount != null ? p.acCount - (buyCount ?? 0) - (holdCount ?? 0) : null

  // Fair value track positions
  const nowPos    = 20
  const targetPos = p.upside != null ? Math.min(90, Math.max(30, 20 + p.upside * 0.5 + 10)) : 65

  // Institutional flow display
  const instFlow = p.institutional != null
    ? p.institutional >= 65 ? '+$1.2B' : p.institutional >= 50 ? '+$0.4B' : p.institutional >= 35 ? '-$0.3B' : '-$1.1B'
    : EMPTY

  switch (key) {

    case 'portfolioImpact': return (
      <Card key={key} label={'Portfolio\nImpact'} iconEl={<IcGrowth />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : signedPct(p.upside)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'expected'}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : pctDir(p.upside)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'aiConfidence': return (
      <Card key={key} label={'AI\nConfidence'} iconEl={<IcGauge />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (p.composite ?? EMPTY)}</span>}
        subEl={!h && p.composite != null ? <span className="cv3-card-sub">/100</span> : undefined}
        vizEl={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RingGauge pct={h ? 50 : p.composite ?? 50} hex={h ? '#6BB0FF' : hex} />
        </div>}
      />
    )

    case 'positionFit': return (
      <Card key={key} label={'Position\nFit'} iconEl={<IcTarget />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.fitScore, 'Strong', 'Moderate', 'Weak')}</span>}
        vizEl={<div style={{ width: '100%' }}><ArcGauge pct={h ? 50 : p.fitScore ?? 50} hex={h ? '#6BB0FF' : hex} /></div>}
      />
    )

    case 'riskLevel': return (
      <Card key={key} label={'Risk\nLevel'} iconEl={<IcShield />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : riskLabel(p.risk)}</span>}
        vizEl={<div style={{ width: '100%' }}>
          <div className={`cv3-risk-track cv3-risk-track--${toneColor(tone)}`}>
            <div className="cv3-risk-fill" style={{ width: h ? '50%' : `${p.risk ?? 50}%` }} />
            <div className="cv3-risk-dot"  style={{ left: h ? '50%' : `${p.risk ?? 50}%` }} />
          </div>
          <div className="cv3-risk-marks"><span>Low</span><span>High</span></div>
        </div>}
      />
    )

    case 'analystConsensus': {
      const verdictLabel = p.acVerdict && p.acVerdict !== '--'
        ? p.acVerdict.replace('Strong ', '')
        : (buyPct >= 60 ? 'Buy' : buyPct < 40 ? 'Sell' : 'Hold')
      return (
        <Card key={key} label={'Analyst\nConsensus'} iconEl={<IcBars />} tone={tone}
          mainEl={<span className={`cv3-card-main cv3-card-main--xs ${h ? '' : mc}`}>{h ? mask : verdictLabel}</span>}
          subEl={!h && p.acCount != null ? <span className="cv3-card-sub">{p.acCount} analysts</span> : undefined}
          vizEl={<div className="cv3-ac-bars">
            {[
              { lbl: 'Buy', cls: 'buy', pct: h ? 0 : buyPct,  cnt: buyCount },
              { lbl: 'Hld', cls: 'hold', pct: h ? 0 : holdPct, cnt: holdCount },
              { lbl: 'Sel', cls: 'sell', pct: h ? 0 : sellPct, cnt: sellCount },
            ].map(r => (
              <div key={r.lbl} className="cv3-ac-row">
                <span className={`cv3-ac-lbl cv3-ac-lbl--${r.cls}`}>{r.lbl}</span>
                <div className="cv3-ac-track"><div className={`cv3-ac-fill cv3-ac-fill--${r.cls}`} style={{ width: `${r.pct}%` }} /></div>
                <span className={`cv3-ac-count cv3-ac-count--${r.cls}`}>{h ? '•' : (r.cnt ?? r.pct + '%')}</span>
              </div>
            ))}
          </div>}
        />
      )
    }

    case 'fairValueEdge': return (
      <Card key={key} label={'Fair Value\nEdge'} iconEl={<IcScales />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : signedPct(p.upside, 0)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'vs fair value'}</span>}
        vizEl={<div className="cv3-fv-wrap">
          <div className={`cv3-fv-track cv3-fv-track--${toneColor(tone)}`}>
            <div className="cv3-fv-fill" style={{ left: `${nowPos}%`, right: `${100 - targetPos}%` }} />
            <div className="cv3-fv-now" style={{ left: `${nowPos}%` }} />
            <div className="cv3-fv-target" style={{ left: `${targetPos}%` }} />
          </div>
          <div className="cv3-fv-labels"><span>Now</span><span>Target</span></div>
        </div>}
      />
    )

    case 'technicalTrend': return (
      <Card key={key} label={'Technical\nTrend'} iconEl={<IcTrend />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.trendScore, 'Bullish', 'Neutral', 'Bearish')}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : scoreDir(p.trendScore)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'newsSentiment': return (
      <Card key={key} label={'News\nSentiment'} iconEl={<IcChat />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.sentimentScore, 'Positive', 'Neutral', 'Negative')}</span>}
        vizEl={<div className="cv3-sent-wrap">
          <div className={`cv3-sent-track cv3-sent-dot--${toneColor(tone)}`}>
            <div className="cv3-sent-dot" style={{ left: h ? '50%' : `${Math.min(95, Math.max(5, p.sentimentScore ?? 50))}%` }} />
          </div>
          <div className="cv3-sent-marks"><span>Neg</span><span>Pos</span></div>
        </div>}
      />
    )

    case 'institutionalFlow': return (
      <Card key={key} label={'Institutional\nFlow'} iconEl={<IcBuilding />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : instFlow}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'net flow est.'}</span>}
        vizEl={<div className={`cv3-flow cv3-flow--${toneColor(tone)}`}>
          {[0.35, 0.55, 0.45, 0.65, 0.50, 1.0].map((ht, i) => <i key={i} style={{ height: `${ht * 100}%` }} />)}
        </div>}
      />
    )

    case 'upcomingCatalyst': return (
      <Card key={key} label={'Upcoming\nCatalyst'} iconEl={<IcCalendar />} tone="neutral"
        mainEl={<span className="cv3-card-main cv3-card-main--xs cv3-card-main--amber" style={{ lineHeight: 1.2 }}>
          {h ? mask : p.nextCatName.split(' ').slice(0, 2).join(' ')}
        </span>}
        vizEl={<div className="cv3-cal">
          <div className="cv3-cal-box">
            <div className="cv3-cal-top" />
            <span className="cv3-cal-d">{h ? '?' : '~'}</span>
          </div>
          <span className="cv3-cal-lbl">{h ? '••••' : 'Upcoming'}</span>
        </div>}
      />
    )

    case 'earningsMomentum': return (
      <Card key={key} label={'Earnings\nMomentum'} iconEl={<IcStairs />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.momentumScore, 'Strong', 'Moderate', 'Weak')}</span>}
        vizEl={<Staircase direction={h ? 'flat' : scoreDir(p.momentumScore)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'aiModelAgreement': return (
      <Card key={key} label={'AI Model\nAgreement'} iconEl={<IcWave />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.composite, 'Strong', 'Mixed', 'Divergent')}</span>}
        subEl={!h && p.composite != null ? <span className="cv3-card-sub">{p.composite}/100</span> : undefined}
        vizEl={<AreaChart direction={h ? 'flat' : scoreDir(p.composite)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    // ── Extended pool cards ────────────────────────────────────────────────────

    case 'revenueGrowth': {
      const val = p.fc?.fundamentals?.revenueGrowthPct ?? null
      return <Card key={key} label={'Revenue\nGrowth'} iconEl={<IcGrowth />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (val != null ? signedPct(val) : EMPTY)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'YoY'}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : pctDir(val)} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'epsGrowth': {
      const val = p.fc?.fundamentals?.epsGrowthPct ?? null
      return <Card key={key} label={'EPS\nGrowth'} iconEl={<IcBars />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (val != null ? signedPct(val) : EMPTY)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'YoY'}</span>}
        vizEl={<Staircase direction={h ? 'flat' : pctDir(val)} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'marginTrend': {
      const val = p.fc?.fundamentals?.netMarginPct ?? null
      return <Card key={key} label={'Margin\nTrend'} iconEl={<IcPercent />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (val != null ? `${val.toFixed(1)}%` : EMPTY)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'net margin'}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : pctDir(val)} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'fcfTrend': {
      const val = p.fc?.fundamentals?.fcfYield ?? null
      return <Card key={key} label={'FCF\nTrend'} iconEl={<IcWave />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (val != null ? `${val.toFixed(1)}%` : EMPTY)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'FCF yield'}</span>}
        vizEl={<AreaChart direction={h ? 'flat' : pctDir(val)} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'valuationStatus': {
      const label = p.upside != null ? (p.upside >= 15 ? 'Undervalued' : p.upside >= -5 ? 'Fair Value' : 'Overvalued') : EMPTY
      return <Card key={key} label={'Valuation\nStatus'} iconEl={<IcScales />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : label}</span>}
        subEl={!h && p.upside != null ? <span className="cv3-card-sub">{signedPct(p.upside, 0)} vs FV</span> : undefined}
        vizEl={<ArcGauge pct={h ? 50 : Math.min(100, Math.max(0, 50 + (p.upside ?? 0) * 1.5))} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'insiderActivity': return (
      <Card key={key} label={'Insider\nActivity'} iconEl={<IcPerson />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : (p.institutional != null ? (p.institutional >= 60 ? 'Buying' : p.institutional >= 40 ? 'Mixed' : 'Selling') : EMPTY)}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : scoreDir(p.institutional)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'hedgeFundFlow': return (
      <Card key={key} label={'Hedge Fund\nFlow'} iconEl={<IcBuilding />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : instFlow}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'est. flow'}</span>}
        vizEl={<div className={`cv3-flow cv3-flow--${toneColor(tone)}`}>
          {[0.4, 0.6, 0.5, 0.8, 0.65, 1.0].map((ht, i) => <i key={i} style={{ height: `${ht * 100}%` }} />)}
        </div>}
      />
    )

    case 'congressActivity': return (
      <Card key={key} label={'Congress\nActivity'} iconEl={<IcCapitol />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : (p.institutional != null ? (p.institutional >= 60 ? 'Bullish' : p.institutional >= 40 ? 'Mixed' : 'Bearish') : EMPTY)}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : scoreDir(p.institutional)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'macroSensitivity': return (
      <Card key={key} label={'Macro\nSensitivity'} iconEl={<IcGlobe />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : (p.trendScore != null ? (p.trendScore <= 40 ? 'High' : p.trendScore <= 60 ? 'Medium' : 'Low') : EMPTY)}</span>}
        vizEl={<RingGauge pct={h ? 50 : Math.max(0, 100 - (p.trendScore ?? 50))} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'sectorExposure': return (
      <Card key={key} label={'Sector\nExposure'} iconEl={<IcPie />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.fitScore, 'Balanced', 'Moderate', 'Concentrated')}</span>}
        vizEl={<ArcGauge pct={h ? 50 : p.fitScore ?? 50} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'correlationRisk': return (
      <Card key={key} label={'Correlation\nRisk'} iconEl={<IcLink />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : (p.risk != null ? (p.risk >= 65 ? 'High' : p.risk >= 40 ? 'Medium' : 'Low') : EMPTY)}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : (p.risk != null && p.risk > 50 ? 'up' : 'flat')} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'diversificationImpact': return (
      <Card key={key} label={'Diversifi-\ncation'} iconEl={<IcTarget />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.fitScore, 'Positive', 'Neutral', 'Negative')}</span>}
        vizEl={<RingGauge pct={h ? 50 : p.fitScore ?? 50} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'analystTargetGap': {
      const val = p.fc?.analystConsensus?.targetGapPct ?? p.upside
      return <Card key={key} label={'Analyst\nTarget Gap'} iconEl={<IcScales />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : signedPct(val, 0)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'to target'}</span>}
        vizEl={<div className="cv3-fv-wrap">
          <div className={`cv3-fv-track cv3-fv-track--${toneColor(tone)}`}>
            <div className="cv3-fv-fill" style={{ left: `${nowPos}%`, right: `${100 - targetPos}%` }} />
            <div className="cv3-fv-now" style={{ left: `${nowPos}%` }} />
            <div className="cv3-fv-target" style={{ left: `${targetPos}%` }} />
          </div>
          <div className="cv3-fv-labels"><span>Now</span><span>Target</span></div>
        </div>}
      />
    }

    case 'priceVsFairValue': return (
      <Card key={key} label={'Price vs\nFair Value'} iconEl={<IcTrend />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : signedPct(p.upside, 0)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'vs FV'}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : pctDir(p.upside)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'earningsSurprise': {
      const val = p.fc?.earnings?.surprisePct ?? null
      return <Card key={key} label={'Earnings\nSurprise'} iconEl={<IcSurprise />} tone={tone}
        mainEl={<span className={`cv3-card-main ${h ? '' : mc}`}>{h ? mask : (val != null ? signedPct(val) : EMPTY)}</span>}
        subEl={<span className="cv3-card-sub">{h ? '' : 'last qtr'}</span>}
        vizEl={<Staircase direction={h ? 'flat' : pctDir(val ?? p.momentumScore)} hex={h ? '#6BB0FF' : hex} />}
      />
    }

    case 'catalystRisk': return (
      <Card key={key} label={'Catalyst\nRisk'} iconEl={<IcShield />} tone="negative"
        mainEl={<span className="cv3-card-main cv3-card-main--sm cv3-card-main--red">{h ? mask : 'Elevated'}</span>}
        vizEl={<RingGauge pct={h ? 50 : 72} hex="#FF6B61" />}
      />
    )

    case 'technicalSupport': return (
      <Card key={key} label={'Technical\nSupport'} iconEl={<IcFloor />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : scoreLabel(p.trendScore, 'Strong', 'Moderate', 'Weak')}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : scoreDir(p.trendScore)} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    case 'technicalResistance': return (
      <Card key={key} label={'Tech.\nResistance'} iconEl={<IcCeiling />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : (p.trendScore != null ? (p.trendScore >= 65 ? 'Near' : p.trendScore >= 45 ? 'Moderate' : 'Distant') : EMPTY)}</span>}
        vizEl={<Sparkline direction={h ? 'flat' : (p.trendScore != null && p.trendScore >= 60 ? 'up' : 'flat')} hex={h ? '#6BB0FF' : hex} />}
      />
    )

    default: return (
      <Card key={key} label={CARD_LABELS[key] ?? key} iconEl={<IcGauge />} tone={tone}
        mainEl={<span className={`cv3-card-main cv3-card-main--sm ${h ? '' : mc}`}>{h ? mask : EMPTY}</span>}
        vizEl={<Sparkline direction="flat" hex={h ? '#6BB0FF' : hex} />}
      />
    )
  }
}

// ── Customize sheet ────────────────────────────────────────────────────────────

function CustomizeAiCards({ prefs, onChange, onReset, onClose }: {
  prefs: CardPrefs
  onChange: (next: CardPrefs) => void
  onReset: () => void
  onClose: () => void
}) {
  const hiddenSet = new Set(prefs.hidden)
  const [dragKey, setDragKey] = useState<CardKey | null>(null)
  const [maxWarning, setMaxWarning] = useState(false)
  const dragRef = useRef<CardKey | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDoubleTap = useDoubleTapToClose(onClose)

  function showWarn() {
    setMaxWarning(true)
    if (warnRef.current) clearTimeout(warnRef.current)
    warnRef.current = setTimeout(() => setMaxWarning(false), 2000)
  }

  function toggle(key: CardKey) {
    const next = new Set(prefs.hidden)
    if (next.has(key)) {
      const visible = prefs.order.filter(k => !next.has(k)).length
      if (visible >= MAX_VISIBLE) { showWarn(); return }
      next.delete(key)
    } else {
      next.add(key)
    }
    onChange({ order: prefs.order, hidden: [...next] })
  }

  function reorderTo(from: CardKey, to: CardKey) {
    if (from === to) return
    const next = [...prefs.order]
    const fi = next.indexOf(from), ti = next.indexOf(to)
    if (fi < 0 || ti < 0) return
    next.splice(fi, 1); next.splice(ti, 0, from)
    onChange({ order: next, hidden: prefs.hidden })
  }

  function onDown(e: RPointerEvent<HTMLUListElement>) {
    const t = e.target as HTMLElement
    if (!t.closest('[data-grip]')) return
    e.preventDefault()
    const row = t.closest('[data-key]') as HTMLElement | null
    const key = row?.dataset.key as CardKey | undefined
    if (!key) return
    dragRef.current = key; setDragKey(key)
    listRef.current?.setPointerCapture?.(e.pointerId)
  }

  function onMove(e: RPointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    e.preventDefault()
    for (const row of Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]) {
      const rect = row.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY < rect.bottom) {
        const tKey = row.dataset.key as CardKey | undefined
        if (tKey && tKey !== dragRef.current) reorderTo(dragRef.current, tKey)
        break
      }
    }
  }

  function onUp(e: RPointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null; setDragKey(null)
    try { listRef.current?.releasePointerCapture?.(e.pointerId) } catch {}
  }

  const visibleCount = prefs.order.filter(k => !hiddenSet.has(k)).length

  return (
    <div className="sps-custom-root" role="presentation">
      <button type="button" className="sps-sheet-overlay" aria-label="Close" onClick={onClose} />
      <section className="sps-custom-sheet" role="dialog" aria-modal="true" aria-label="Customize AI Cards" onClick={onDoubleTap}>
        <header className="sps-custom-head">
          <h3>Customize AI Cards</h3>
          <button type="button" className="sps-custom-reset" onClick={onReset}>Reset</button>
          <button type="button" className="sps-custom-close" aria-label="Close" onClick={onClose}><X size={24} /></button>
        </header>
        <div className="sps-custom-subhead">
          <strong>Select &amp; Order</strong>
          <span>{visibleCount}/{MAX_VISIBLE} · Drag to reorder</span>
        </div>
        <ul
          className={`sps-custom-list${dragKey ? ' is-dragging' : ''}`}
          ref={listRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        >
          {prefs.order.map(key => {
            const on = !hiddenSet.has(key)
            return (
              <li className={`sps-custom-row${dragKey === key ? ' dragging' : ''}`} key={key} data-key={key}>
                <span>{CARD_LABELS[key]}</span>
                <button type="button" className={`skm-edit-toggle${on ? ' on' : ''}`}
                  aria-label={`${on ? 'Hide' : 'Show'} ${CARD_LABELS[key]}`} aria-pressed={on}
                  onClick={() => toggle(key)}><span /></button>
                <button type="button" className="stock-reorder-grip sps-custom-grip" data-grip
                  aria-label={`Drag to reorder ${CARD_LABELS[key]}`}><GripVertical size={22} /></button>
              </li>
            )
          })}
        </ul>
        <p className="sps-custom-tip">
          <Info size={14} className="sps-tip-icon" />
          Changes are saved automatically
        </p>
      </section>
      {maxWarning && (
        <div className="sps-max-warning" role="alert" aria-live="assertive">
          <strong>Maximum reached</strong>
          <span>You can select up to {MAX_VISIBLE} cards.</span>
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export default function AiIntelligenceCompactV3(p: AiCompactV3Props) {
  const [prefs, setPrefs] = useState<CardPrefs>(DEFAULT_PREFS)
  const [customizeOpen, setCustomizeOpen] = useState(false)

  useEffect(() => { setPrefs(readPrefs()) }, [])

  function commitPrefs(next: CardPrefs) {
    const n = normalizePrefs(next)
    setPrefs(n)
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(n)) } catch {}
  }

  const effectiveState: VerdictState = p.verdictState === 'trim' ? 'balanced' : p.verdictState
  const caseType = verdictToCase(effectiveState)
  const verdictText   = caseType === 'BUY' ? 'BUY' : caseType === 'SELL' ? 'SELL' : 'HOLD'
  const convictionLabel = caseType === 'BUY' ? 'Strong Opportunity' : caseType === 'SELL' ? 'High Risk Signal' : 'Mixed Signals'

  const bearProb = 100 - p.bullProb

  const visibleCards = prefs.order.filter(k => !prefs.hidden.includes(k)).slice(0, MAX_VISIBLE)
  const rows: [CardKey[], CardKey[], CardKey[]] = [
    visibleCards.slice(0, 4),
    visibleCards.slice(4, 8),
    visibleCards.slice(8, 12),
  ]

  const starColor = effectiveState === 'bull' ? '#2BE2AC' : effectiveState === 'bear' ? '#FF6B61' : '#F0C272'

  return (
    <>
      <div
        className={`cv3-root cv3-root--${effectiveState}`}
        role="button" tabIndex={0}
        onClick={p.onTap}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') p.onTap() }}
        aria-label="Open full AI Intelligence analysis"
      >
        {/* ── Header ── */}
        <div className="cv3-hdr">
          <div className="cv3-hdr-left">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M9,1.5 L10.8,6.3 L16,6.3 L11.8,9.7 L13.6,14.5 L9,11.1 L4.4,14.5 L6.2,9.7 L2,6.3 L7.2,6.3 Z"
                fill={starColor} style={{ filter: `drop-shadow(0 0 4px ${starColor}99)` }} />
            </svg>
            <span className="cv3-hdr-title">AI Intelligence</span>
          </div>
          <button
            type="button" className="cv3-hdr-btn"
            aria-label="Customize AI cards"
            onClick={(e) => { e.stopPropagation(); setCustomizeOpen(true) }}
          >
            <MoreVertical size={16} />
          </button>
        </div>

        {/* ── Hero ── */}
        <div className="cv3-hero">
          <div className="cv3-hero-gradient" />
          <div className="cv3-scrim" />
          <div className="cv3-hero-text">
            <div className="cv3-verdict">{p.hidden ? '•••' : verdictText}</div>
            <div className="cv3-conviction">{p.hidden ? '••••••' : convictionLabel}</div>
          </div>
          <div className="cv3-hero-img-wrap">
            <AIHero caseType={caseType} size="compact" motion="enabled" theme="pia-signature" />
          </div>
        </div>

        {/* ── Bull / Bear Bar ── */}
        <div className="cv3-bb">
          <span className="cv3-bb-lbl cv3-bb-lbl--bull">Bull {p.hidden ? '••' : `${p.bullProb}%`}</span>
          <div className="cv3-bb-track">
            <div className="cv3-bb-fill-bull" style={{ width: p.hidden ? '50%' : `${p.bullProb}%` }} />
            <div className="cv3-bb-fill-bear" style={{ width: p.hidden ? '50%' : `${bearProb}%` }} />
          </div>
          <span className="cv3-bb-lbl cv3-bb-lbl--bear">Bear {p.hidden ? '••' : `${bearProb}%`}</span>
        </div>

        {/* ── Card rows ── */}
        {rows.map((row, ri) => (
          <div key={ri} className="cv3-row" style={ri === 2 ? { paddingBottom: 16 } : undefined}>
            {row.map(key => renderCard(key, p))}
          </div>
        ))}
      </div>

      {customizeOpen && (
        <CustomizeAiCards
          prefs={prefs}
          onChange={commitPrefs}
          onReset={() => commitPrefs(DEFAULT_PREFS)}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </>
  )
}
