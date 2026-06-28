'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  Activity, AlertTriangle, BarChart3, Bell, Bitcoin, BookOpen,
  Brain, BriefcaseBusiness, CalendarDays, ChevronDown, ChevronRight,
  ChevronUp, Cpu, GripVertical, Globe2, Home, List, Plus,
  RotateCcw, ScanSearch, Search, Settings, SlidersHorizontal,
  Sparkles, Trash2, TrendingUp, Wallet, X,
} from 'lucide-react'
import IntelligenceBadge from './ui/IntelligenceBadge'
import {
  WORKSPACE_REGISTRY, WORKSPACE_MAP, WIDGET_CATALOG, WIDGET_MAP,
  DEFAULT_PINNED, DEFAULT_WORKSPACE_ID,
  type WorkspaceId, type WorkspaceWidgetId, type WorkspaceIconKey,
} from './workspace/registry'
import {
  readLayout, writeLayout, readHidden, writeHidden, resetLayout,
  readPinned, writePinned, readActive, writeActive,
  moveWidget, type MoveDir,
} from './workspace/storage'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

// ─── Utilities ────────────────────────────────────────────────────────────────

const money = (v: unknown) =>
  Number(v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const pct = (v: unknown) => `${Number(v || 0).toFixed(2)}%`

const fmtRet = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

const retColor = (v: number) => (v >= 0 ? '#24d18c' : '#ff6375')

// ─── Workspace icon map ───────────────────────────────────────────────────────

const iconMap: Record<WorkspaceIconKey, typeof Home> = {
  home: Home, wallet: Wallet, list: List, scan: ScanSearch,
  globe: Globe2, cpu: Cpu, calendar: CalendarDays,
  'trending-up': TrendingUp, bitcoin: Bitcoin, brain: Brain, 'book-open': BookOpen,
}

// ─── Fallback data ────────────────────────────────────────────────────────────

const marketFallback = [
  { name: 'S&P 500', value: '6,241', chg: 0.42, spark: [24, 28, 27, 32, 35, 34, 39] },
  { name: 'Nasdaq',  value: '21,108', chg: 0.68, spark: [18, 24, 21, 30, 33, 36, 41] },
  { name: 'VIX',     value: '14.2',  chg: -2.1,  spark: [44, 38, 36, 32, 29, 27, 24] },
  { name: 'EUR/USD', value: '1.089', chg: 0.12,  spark: [24, 26, 25, 27, 29, 28, 30] },
]

const positionFallback = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.',  last: 126.8, day_change_pct: 1.84, market_value: 24120, portfolio_pct: 18.4, risk: 72, momentum: 78, spark: [31, 34, 32, 41, 46, 43, 51], ai_view: 'AI infrastructure demand remains the core upside driver.' },
  { symbol: 'MSFT', name: 'Microsoft',     last: 451.2, day_change_pct: 0.46, market_value: 18940, portfolio_pct: 14.5, risk: 38, momentum: 57, spark: [35, 36, 39, 38, 42, 44, 45], ai_view: 'Quality compounder profile with balanced cloud and AI durability.' },
  { symbol: 'SPY',  name: 'S&P 500 ETF',  last: 624.1, day_change_pct: -0.18, market_value: 15110, portfolio_pct: 11.6, risk: 29, momentum: 48, spark: [40, 41, 39, 38, 40, 37, 36], ai_view: 'Core market beta sleeve.' },
]

const scannerFallback = [
  { ticker: 'AMD',   label: 'Watch',  setup: 'Semiconductor pullback into support', price: 162.34, entry_zone: '158-164', stop: '151', score: 76, spark: [22, 21, 24, 28, 27, 31, 35] },
  { ticker: 'GOOGL', label: 'Review', setup: 'AI search monetization rerating',    price: 178.42, entry_zone: '174-180', stop: '169', score: 68, spark: [29, 32, 31, 36, 34, 39, 42] },
]

// ─── Data hooks ───────────────────────────────────────────────────────────────

function useDashboard() {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    fetch(`${API}/dashboard`).then(r => r.json()).then(setData).catch(() => {})
    let ws: WebSocket | undefined
    try {
      ws = new WebSocket(`${API.replace('http', 'ws')}/ws`)
      ws.onmessage = (e) => { try { const p = JSON.parse(e.data); if (p.type === 'dashboard_update') setData(p) } catch {} }
    } catch {}
    return () => ws?.close()
  }, [])
  return data
}

function useAgentData() {
  const [agentStatus, setAgentStatus] = useState<any>(null)
  const [backtest, setBacktest] = useState<any>(null)
  useEffect(() => {
    const go = () => fetch(`${API}/agent/status`).then(r => r.json()).then(setAgentStatus).catch(() => {})
    go()
    fetch(`${API}/agent/backtest/status`).then(r => r.json()).then(d => { if (d?.status === 'completed') setBacktest(d) }).catch(() => {})
    const t = setInterval(go, 30_000)
    return () => clearInterval(t)
  }, [])
  return { agentStatus, backtest }
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, positive = true }: { values?: number[]; positive?: boolean }) {
  const data = values?.length ? values : [28, 31, 29, 35, 33, 38, 42]
  const min = Math.min(...data), max = Math.max(...data)
  const pts = data.map((v, i) => `${((i / Math.max(data.length - 1, 1)) * 132).toFixed(1)},${(48 - ((v - min) / Math.max(max - min, 1)) * 34).toFixed(1)}`).join(' ')
  const color = positive ? '#24d18c' : '#ff6375'
  return (
    <svg className="mobile-sparkline" viewBox="0 0 132 54" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" x2="132" y1="48" y2="48" stroke="rgba(148,163,184,.16)" />
    </svg>
  )
}

// ─── Risk meter ───────────────────────────────────────────────────────────────

function RiskMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const tone = v >= 70 ? 'bad' : v >= 45 ? 'warn' : ''
  return <div className={`mobile-risk-meter ${tone}`}><span style={{ width: `${v}%` }} /></div>
}

// ─── SwipeRail ────────────────────────────────────────────────────────────────

function SwipeRail({ title, icon, items, render }: { title: string; icon?: ReactNode; items: any[]; render: (item: any, i: number) => ReactNode }) {
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const onScroll = () => {
    const n = ref.current; if (!n) return
    const w = n.firstElementChild?.clientWidth || n.clientWidth
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(n.scrollLeft / Math.max(w + 12, 1)))))
  }
  return (
    <div style={{ marginBottom: '4px' }}>
      <div className="mobile-section-title" style={{ marginBottom: '8px' }}><h2>{title}</h2>{icon}</div>
      <div className="mobile-swipe-rail" ref={ref} onScroll={onScroll}>
        {items.map((item, i) => (
          <div key={i} className="mobile-swipe-slide">{render(item, i)}</div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="mobile-rail-dots" aria-hidden="true">
          {items.map((_, i) => <span key={i} className={i === active ? 'active' : ''} />)}
        </div>
      )}
    </div>
  )
}

// ─── Widget content renderers ─────────────────────────────────────────────────

function PortfolioSnapshotContent({ portfolio, positions }: { portfolio: any; positions: any[] }) {
  const val = Number(portfolio.total_value || 58170)
  const pnl = Number(portfolio.daily_pnl || 420)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Net Worth</div>
          <div style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-1px' }}>{money(val)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <IntelligenceBadge label={`${pnl >= 0 ? '+' : ''}${money(pnl)} today`} tone={pnl >= 0 ? 'good' : 'bad'} />
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px' }}>{positions.length} positions</div>
        </div>
      </div>
      <Sparkline values={[32, 35, 33, 37, 40, 38, 43]} positive={pnl >= 0} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px' }}>
        {[
          { label: 'Cash', value: money(portfolio.cash || 12400) },
          { label: 'Buying Power', value: money(portfolio.buying_power || 24000) },
          { label: 'Risk Mode', value: portfolio.risk_mode || 'Balanced' },
        ].map(k => (
          <div key={k.label} style={{ background: '#090e14', border: '1px solid rgba(148,163,184,.12)', borderRadius: '12px', padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#eef4fb' }}>{k.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{k.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DecisionBriefContent({ portfolio }: { portfolio: any }) {
  const actions = portfolio.today_actions?.length ? portfolio.today_actions : [
    { title: 'Protect gains first', text: 'Keep new exposure small while the portfolio is up on the day.' },
    { title: 'Prioritize liquid names', text: 'Scanner ideas should clear risk and liquidity filters.' },
  ]
  return (
    <div style={{ display: 'grid', gap: '10px' }}>
      {actions.slice(0, 3).map((a: any) => (
        <div key={a.title} style={{ borderLeft: '2px solid #60a5fa', paddingLeft: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '3px' }}>{a.title}</div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', lineHeight: 1.4 }}>{a.text}</div>
        </div>
      ))}
    </div>
  )
}

function RiskControlsContent({ portfolio }: { portfolio: any }) {
  const alerts = portfolio.guardrails?.length ? portfolio.guardrails : [
    { title: 'NVDA concentration near cap', text: 'Trim or hedge if it closes above the risk threshold.', level: 'warn' },
    { title: 'Cash buffer healthy', text: 'Buying power is available for scanner setups that pass risk checks.', level: 'good' },
  ]
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {alerts.slice(0, 4).map((a: any) => (
        <div key={a.title} style={{
          display: 'flex', gap: '10px', alignItems: 'flex-start',
          padding: '10px', background: '#090e14',
          border: `1px solid ${a.level === 'danger' ? 'rgba(255,99,117,.2)' : a.level === 'warn' ? 'rgba(251,191,36,.2)' : 'rgba(36,209,140,.2)'}`,
          borderRadius: '12px',
        }}>
          <AlertTriangle size={16} style={{ color: a.level === 'danger' ? '#ff6375' : a.level === 'warn' ? '#fbbf24' : '#24d18c', flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '13px' }}>{a.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', lineHeight: 1.4 }}>{a.text}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TradeRadarContent({ scanner }: { scanner: any[] }) {
  const rows = scanner.length ? scanner : scannerFallback
  return (
    <SwipeRail
      title="" icon={null}
      items={rows.slice(0, 5)}
      render={(item: any) => (
        <div className="mobile-visual-card" style={{ minHeight: '140px' }}>
          <div className="mobile-card-head">
            <div><span>{item.label || 'Setup'}</span><strong style={{ fontSize: '22px' }}>{item.ticker}</strong></div>
            <b style={{ fontSize: '13px' }}>${Number(item.price || 0).toFixed(2)}</b>
          </div>
          <Sparkline values={item.spark} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Entry {item.entry_zone || 'Review'}</span>
            <IntelligenceBadge label={`${item.score || 64} score`} tone="good" />
          </div>
        </div>
      )}
    />
  )
}

function PositionsContent({ positions, onSelect }: { positions: any[]; onSelect: (p: any) => void }) {
  const rows = positions.length ? positions : positionFallback
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {rows.slice(0, 4).map((p: any) => {
        const chg = Number(p.day_change_pct || 0)
        return (
          <button key={p.symbol} onClick={() => onSelect(p)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 12px', background: '#090e14',
            border: '1px solid rgba(148,163,184,.14)', borderRadius: '14px',
            color: 'inherit', textAlign: 'left', width: '100%',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '36px', height: '36px', borderRadius: '10px', background: chg >= 0 ? 'rgba(36,209,140,.12)' : 'rgba(255,99,117,.12)', border: `1px solid ${chg >= 0 ? 'rgba(36,209,140,.3)' : 'rgba(255,99,117,.3)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: chg >= 0 ? '#24d18c' : '#ff6375', flexShrink: 0 }}>
                {(p.symbol || '?').slice(0, 4)}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>{p.symbol}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{p.name}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: '14px' }}>{money(p.last || p.price || p.market_value)}</div>
              <div style={{ fontSize: '11px', color: retColor(chg) }}>{fmtRet(chg)}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ExposureMapContent({ positions }: { positions: any[] }) {
  const rows = positions.length ? positions : positionFallback
  return (
    <div style={{ display: 'grid', gap: '7px' }}>
      {rows.slice(0, 5).map((p: any) => {
        const pPct = Number(p.portfolio_pct || 0)
        return (
          <div key={p.symbol} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 38px', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>{p.symbol}</span>
            <div style={{ height: '8px', borderRadius: '999px', background: '#111827', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 'inherit', background: 'linear-gradient(90deg,#60a5fa,#24d18c)', width: `${Math.min(pPct * 4, 100)}%` }} />
            </div>
            <span style={{ fontSize: '11px', color: 'var(--muted)', textAlign: 'right' }}>{pct(pPct)}</span>
          </div>
        )
      })}
    </div>
  )
}

function NewsIntelContent() {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted)', fontSize: '12px' }}>
      <BarChart3 size={22} style={{ margin: '0 auto 6px', display: 'block', opacity: 0.4 }} />
      News Intelligence
      <div style={{ fontSize: '11px', marginTop: '4px' }}>Connect a news source in Integrations to enable.</div>
    </div>
  )
}

function AgentStatusContent({ agentStatus, backtest }: { agentStatus: any; backtest: any }) {
  const portfolio = agentStatus?.paper_portfolio || {}
  const running   = !!agentStatus?.running
  const regime    = (agentStatus?.last_regime as string) || 'UNKNOWN'
  const totalVal  = Number(portfolio.total_value || 100_000)
  const totalRet  = Number(portfolio.total_return_pct || 0)
  const cash      = Number(portfolio.cash || 0)
  const longs     = Array.isArray(portfolio.longs)  ? portfolio.longs.length  : 0
  const shorts    = Array.isArray(portfolio.shorts) ? portfolio.shorts.length : 0
  const positions = (portfolio.positions || []).length
  const mc        = backtest?.monte_carlo || {}
  const bestStrat = Array.isArray(backtest?.strategies) ? backtest.strategies[0] : null

  const regimeColors: Record<string, [string, string]> = {
    BULL_TREND: ['#24d18c', 'rgba(36,209,140,.14)'], BEAR_TREND: ['#fb7185', 'rgba(251,113,133,.14)'],
    CHOPPY_RANGE: ['#fbbf24', 'rgba(251,191,36,.14)'], CRISIS: ['#ff6375', 'rgba(255,99,117,.18)'],
  }
  const [rc, rb] = regimeColors[regime] ?? ['#8fa2b5', 'rgba(148,163,184,.12)']

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '4px' }}>Autonomous Agent</div>
          <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.5px' }}>{totalVal.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</div>
          <div style={{ fontSize: '18px', fontWeight: 700, color: retColor(totalRet), marginTop: '4px' }}>{fmtRet(totalRet)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: running ? 'rgba(36,209,140,.14)' : 'rgba(148,163,184,.1)', border: `1px solid ${running ? 'rgba(36,209,140,.4)' : 'rgba(148,163,184,.25)'}`, color: running ? '#24d18c' : '#8fa2b5' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: running ? '#24d18c' : '#8fa2b5' }} />
            {running ? 'RUNNING' : 'STOPPED'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: rc, background: rb, border: `1px solid ${rc}44` }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: rc }} />{regime.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginBottom: '10px' }}>
        {[
          { label: 'Longs',     value: longs,     color: '#24d18c' },
          { label: 'Positions', value: positions,  color: '#a78bfa' },
          { label: 'Shorts',    value: shorts,     color: '#ff6375' },
          { label: 'Cash',      value: `$${(cash / 1000).toFixed(1)}k`, color: '#8fa2b5' },
          { label: 'Mode',      value: 'paper',    color: '#60a5fa' },
          { label: 'Cycles',    value: agentStatus?.cycle_count ?? '—', color: '#fbbf24' },
        ].map(c => (
          <div key={c.label} style={{ background: '#090e14', border: '1px solid rgba(148,163,184,.12)', borderRadius: '12px', padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {bestStrat && (
        <div style={{ border: '1px solid rgba(148,163,184,.14)', borderRadius: '14px', padding: '10px', background: '#090e14' }}>
          <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Best backtest strategy</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '13px' }}>{bestStrat.name}</strong>
            <span style={{ fontSize: '13px', fontWeight: 700, color: retColor(bestStrat.total_return || 0) }}>{fmtRet(bestStrat.total_return || 0)}</span>
          </div>
          {mc.final_return_pct && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
              {[
                { label: 'P5', value: fmtRet(mc.final_return_pct.p5), color: '#ff6375' },
                { label: 'P50', value: fmtRet(mc.final_return_pct.p50), color: '#eef4fb' },
                { label: 'P95', value: fmtRet(mc.final_return_pct.p95), color: '#24d18c' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,.04)', borderRadius: '8px', padding: '6px 2px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '1px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PlannedWidgetContent({ widgetId }: { widgetId: WorkspaceWidgetId }) {
  const def = WIDGET_MAP[widgetId]
  return (
    <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--muted)' }}>
      <div style={{ fontSize: '28px', marginBottom: '6px' }}>{def?.icon || '🔧'}</div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#eef4fb', marginBottom: '4px' }}>{def?.title || widgetId}</div>
      <div style={{ fontSize: '11px', lineHeight: 1.4 }}>{def?.description}</div>
      <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', fontSize: '10px', border: '1px solid rgba(148,163,184,.2)', color: '#8fa2b5' }}>Coming soon</div>
    </div>
  )
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function MobileDetailView({ position, onClose }: { position: any; onClose: () => void }) {
  const [tab, setTab] = useState('AI Thesis')
  const [details, setDetails] = useState<any>(null)
  const ticker = position.symbol || position.ticker
  const change = Number(position.day_change_pct || 0)

  useEffect(() => {
    if (!ticker) return
    fetch(`${API}/stock/${encodeURIComponent(ticker)}`).then(r => r.json()).then(setDetails).catch(() => {})
  }, [ticker])

  return (
    <div className="mobile-detail" role="dialog" aria-modal="true">
      <button className="mobile-detail-close" onClick={onClose}><X size={22} /></button>
      <header className="mobile-detail-hero">
        <div>
          <span>{position.name || 'Position detail'}</span>
          <h1>{ticker}</h1>
          <div className="mobile-detail-price">
            <strong>{money(position.last || position.price || 0)}</strong>
            <small style={{ color: retColor(change) }}>{pct(change)}</small>
          </div>
        </div>
        <Sparkline values={position.spark} positive={change >= 0} />
      </header>
      <div className="mobile-detail-tabs">
        {['AI Thesis', 'News', 'Risk'].map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <section className="mobile-detail-panel">
        {tab === 'AI Thesis' && <p>{details?.position?.ai_view || position.ai_view || 'No thesis saved yet.'}</p>}
        {tab === 'News' && (
          <div className="mobile-news-list">
            {(details?.news?.length ? details.news : [{ title: 'No fresh news', impact: 'Neutral', action: 'Monitor' }]).map((n: any) => (
              <article key={n.title}><strong>{n.title}</strong><span>{n.impact} — {n.action}</span></article>
            ))}
          </div>
        )}
        {tab === 'Risk' && (
          <div className="mobile-risk-grid">
            <span>Weight<b>{pct(position.portfolio_pct)}</b></span>
            <span>Risk<b>{position.risk || 31}</b></span>
            <span>Stop<b>{position.stop || 'Required'}</b></span>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Add Widget bottom sheet ──────────────────────────────────────────────────

const WIDGET_CATEGORIES = ['portfolio', 'intelligence', 'risk', 'scanner', 'markets', 'trading', 'agent', 'education'] as const

function AddWidgetSheet({
  workspaceId,
  hidden,
  visible,
  onAdd,
  onClose,
}: {
  workspaceId: WorkspaceId
  hidden: WorkspaceWidgetId[]
  visible: WorkspaceWidgetId[]
  onAdd: (id: WorkspaceWidgetId) => void
  onClose: () => void
}) {
  const hiddenSet = new Set(hidden)
  const visibleSet = new Set(visible)
  const addable = WIDGET_CATALOG.filter(w => hiddenSet.has(w.id) || (!visibleSet.has(w.id)))

  const byCat = WIDGET_CATEGORIES.map(cat => ({
    cat,
    items: addable.filter(w => w.category === cat),
  })).filter(g => g.items.length > 0)

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 40 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 41,
        background: '#07101e', borderTop: '1px solid rgba(148,163,184,.2)',
        borderRadius: '24px 24px 0 0', padding: '0 0 env(safe-area-inset-bottom)',
        maxHeight: '76vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 12px', borderBottom: '1px solid rgba(148,163,184,.12)' }}>
          <strong style={{ fontSize: '16px' }}>Add Widget</strong>
          <button onClick={onClose} style={{ width: '36px', height: '36px', borderRadius: '12px', border: '1px solid rgba(148,163,184,.2)', background: '#0b1119', color: '#fff', display: 'grid', placeItems: 'center' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflow: 'auto', padding: '12px 16px', flex: 1 }}>
          {addable.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--muted)', fontSize: '13px' }}>
              All available widgets are already added to this workspace.
            </div>
          ) : byCat.map(({ cat, items }) => (
            <div key={cat} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{cat}</div>
              <div style={{ display: 'grid', gap: '6px' }}>
                {items.map(w => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', background: '#0b1119', border: '1px solid rgba(148,163,184,.14)', borderRadius: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <span style={{ fontSize: '20px', flexShrink: 0 }}>{w.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {w.title}
                          {w.status === 'planned' && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', border: '1px solid rgba(148,163,184,.2)', color: 'var(--muted)' }}>soon</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.description}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onAdd(w.id)}
                      style={{ width: '32px', height: '32px', borderRadius: '10px', border: '1px solid rgba(96,165,250,.4)', background: 'rgba(96,165,250,.1)', color: '#60a5fa', display: 'grid', placeItems: 'center', flexShrink: 0 }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ─── Workspace bar ────────────────────────────────────────────────────────────

function WorkspaceBar({ activeId, onSelect }: { activeId: WorkspaceId; onSelect: (id: WorkspaceId) => void }) {
  return (
    <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', margin: '0 -14px 14px', padding: '2px 14px 6px', scrollbarWidth: 'none' }}>
      {WORKSPACE_REGISTRY.map(ws => {
        const active = ws.id === activeId
        return (
          <button key={ws.id} onClick={() => onSelect(ws.id)} style={{
            flexShrink: 0, padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: active ? 700 : 500,
            border: `1px solid ${active ? 'rgba(96,165,250,.5)' : 'rgba(148,163,184,.18)'}`,
            background: active ? 'rgba(96,165,250,.12)' : '#0b1119',
            color: active ? '#60a5fa' : '#8fa2b5',
            transition: 'all .15s ease',
          }}>
            {ws.title}
          </button>
        )
      })}
    </div>
  )
}

// ─── Widget card wrapper (long-press for edit mode) ───────────────────────────

const LONG_PRESS_MS = 450
const MOVE_CANCEL_PX = 8

function WidgetCard({
  widgetId,
  index,
  total,
  editMode,
  onLongPress,
  onMove,
  onRemove,
  children,
}: {
  widgetId: WorkspaceWidgetId
  index: number
  total: number
  editMode: boolean
  onLongPress: () => void
  onMove: (id: WorkspaceWidgetId, dir: MoveDir) => void
  onRemove: (id: WorkspaceWidgetId) => void
  children: ReactNode
}) {
  const def = WIDGET_MAP[widgetId]
  const pressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)

  function clearPress() {
    if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null }
    pressStart.current = null
  }

  return (
    <div
      style={{ marginBottom: '12px', position: 'relative' }}
      onPointerDown={e => {
        if (e.pointerType !== 'touch') return
        pressStart.current = { x: e.clientX, y: e.clientY }
        pressTimer.current = window.setTimeout(() => { onLongPress(); clearPress() }, LONG_PRESS_MS)
      }}
      onPointerMove={e => {
        if (!pressStart.current) return
        if (Math.abs(e.clientX - pressStart.current.x) > MOVE_CANCEL_PX || Math.abs(e.clientY - pressStart.current.y) > MOVE_CANCEL_PX) clearPress()
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
    >
      <div style={{
        border: `1px solid ${editMode ? 'rgba(96,165,250,.35)' : 'rgba(148,163,184,.14)'}`,
        borderRadius: '20px',
        background: editMode ? 'linear-gradient(180deg,rgba(17,27,45,.98),rgba(7,12,22,.98))' : 'linear-gradient(180deg,rgba(13,19,28,.98),rgba(7,11,17,.98))',
        padding: '14px',
        transition: 'border-color .2s ease, background .2s ease',
        overflow: 'hidden',
      }}>
        {/* Widget header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            {editMode && <GripVertical size={14} style={{ color: '#60a5fa', flexShrink: 0 }} />}
            <span style={{ fontSize: '14px', marginRight: '2px' }}>{def?.icon}</span>
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{def?.title || widgetId}</span>
            {def?.status === 'planned' && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '999px', border: '1px solid rgba(148,163,184,.2)', color: 'var(--muted)' }}>soon</span>}
          </div>
          {editMode && (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => onMove(widgetId, 'up')} disabled={index === 0} style={editBtn} aria-label="Move up"><ChevronUp size={13} /></button>
              <button onClick={() => onMove(widgetId, 'down')} disabled={index === total - 1} style={editBtn} aria-label="Move down"><ChevronDown size={13} /></button>
              <button onClick={() => onRemove(widgetId)} style={{ ...editBtn, borderColor: 'rgba(255,99,117,.3)', color: '#ff6375', background: 'rgba(255,99,117,.08)' }} aria-label="Remove widget"><Trash2 size={13} /></button>
            </div>
          )}
        </div>
        {/* Widget content */}
        {children}
      </div>
    </div>
  )
}

const editBtn: CSSProperties = {
  width: '28px', height: '28px', borderRadius: '8px',
  border: '1px solid rgba(96,165,250,.25)', background: 'rgba(96,165,250,.08)',
  color: '#60a5fa', display: 'grid', placeItems: 'center', padding: 0,
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────

function BottomNav({ activeId, pinned, onSelect }: { activeId: WorkspaceId; pinned: WorkspaceId[]; onSelect: (id: WorkspaceId) => void }) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Workspaces">
      {pinned.slice(0, 5).map(id => {
        const ws = WORKSPACE_MAP[id]
        if (!ws) return null
        const Icon = iconMap[ws.iconKey] || Home
        const active = id === activeId
        return (
          <button key={id} className={active ? 'active' : ''} onClick={() => onSelect(id)}>
            <Icon size={20} />
            <span>{ws.title}</span>
          </button>
        )
      })}
    </nav>
  )
}

// ─── Main app ─────────────────────────────────────────────────────────────────

export default function MobileExperience() {
  const dashboard   = useDashboard()
  const { agentStatus, backtest } = useAgentData()
  const [selected, setSelected] = useState<any>(null)

  // Workspace state
  const [workspaceId, setWorkspaceIdState]  = useState<WorkspaceId>('home')
  const [pinned, setPinnedState]            = useState<WorkspaceId[]>([...DEFAULT_PINNED])
  const [layout, setLayoutState]            = useState<WorkspaceWidgetId[]>([])
  const [hidden, setHiddenState]            = useState<WorkspaceWidgetId[]>([])
  const [editMode, setEditMode]             = useState(false)
  const [showAdd, setShowAdd]               = useState(false)

  // Load from localStorage on mount (honour ?ws= URL param for direct linking)
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('ws')
    const savedId = param && WORKSPACE_MAP[param] ? param : readActive()
    setWorkspaceIdState(savedId)
    setPinnedState(readPinned())
    setLayoutState(readLayout(savedId))
    setHiddenState(readHidden(savedId))
  }, [])

  function setWorkspaceId(id: WorkspaceId) {
    writeActive(id)
    setWorkspaceIdState(id)
    setLayoutState(readLayout(id))
    setHiddenState(readHidden(id))
    setEditMode(false)
  }

  function handleMove(id: WorkspaceWidgetId, dir: MoveDir) {
    const next = moveWidget(visible, id, dir)
    const full = [...next, ...layout.filter(x => hiddenSet.has(x))]
    setLayoutState(full)
    writeLayout(workspaceId, full)
  }

  function handleRemove(id: WorkspaceWidgetId) {
    const next = [...hidden, id]
    setHiddenState(next)
    writeHidden(workspaceId, next)
  }

  function handleAdd(id: WorkspaceWidgetId) {
    const nextHidden = hidden.filter(x => x !== id)
    const nextLayout = layout.includes(id) ? layout : [...layout, id]
    setHiddenState(nextHidden)
    setLayoutState(nextLayout)
    writeHidden(workspaceId, nextHidden)
    writeLayout(workspaceId, nextLayout)
    setShowAdd(false)
  }

  function handleReset() {
    const next = resetLayout(workspaceId)
    setLayoutState(next)
    setHiddenState([])
    setEditMode(false)
  }

  const hiddenSet = useMemo(() => new Set(hidden), [hidden])
  const visible   = useMemo(() => layout.filter(id => !hiddenSet.has(id)), [layout, hiddenSet])

  const portfolio = dashboard?.portfolio || {}
  const positions = useMemo(() => portfolio.positions || positionFallback, [portfolio.positions])
  const scanner   = dashboard?.scanner || scannerFallback

  function renderContent(widgetId: WorkspaceWidgetId) {
    switch (widgetId) {
      case 'portfolio-snapshot': return <PortfolioSnapshotContent portfolio={portfolio} positions={positions} />
      case 'decision-brief':     return <DecisionBriefContent portfolio={portfolio} />
      case 'risk-controls':      return <RiskControlsContent portfolio={portfolio} />
      case 'trade-radar':        return <TradeRadarContent scanner={scanner} />
      case 'positions':          return <PositionsContent positions={positions} onSelect={setSelected} />
      case 'exposure-map':       return <ExposureMapContent positions={positions} />
      case 'news-intelligence':  return <NewsIntelContent />
      case 'agent-status':       return <AgentStatusContent agentStatus={agentStatus} backtest={backtest} />
      default:                   return <PlannedWidgetContent widgetId={widgetId} />
    }
  }

  const ws = WORKSPACE_MAP[workspaceId] || WORKSPACE_MAP.home

  return (
    <main className="mobile-shell">
      {/* Header */}
      <header className="mobile-top">
        <div>
          <span>PIA</span>
          <h1>{ws.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {editMode ? (
            <>
              <button onClick={handleReset} aria-label="Reset layout" style={{ width: '36px', height: '36px', borderRadius: '12px', border: '1px solid rgba(251,191,36,.3)', background: 'rgba(251,191,36,.08)', color: '#fbbf24', display: 'grid', placeItems: 'center' }}>
                <RotateCcw size={16} />
              </button>
              <button onClick={() => setEditMode(false)} style={{ height: '36px', padding: '0 14px', borderRadius: '12px', border: '1px solid rgba(36,209,140,.4)', background: 'rgba(36,209,140,.1)', color: '#24d18c', fontWeight: 700, fontSize: '13px' }}>
                Done
              </button>
            </>
          ) : (
            <button aria-label="Notifications" style={{ width: '42px', height: '42px', borderRadius: '14px', border: '1px solid rgba(148,163,184,.2)', background: '#0b1119', color: '#eef4fb', display: 'grid', placeItems: 'center' }}>
              <Bell size={19} />
            </button>
          )}
        </div>
      </header>

      {/* Search */}
      <div className="mobile-search" style={{ marginBottom: '12px' }}>
        <Search size={18} />
        <input placeholder="Ask PIA or search ticker…" aria-label="Search" />
        <button aria-label="Filters"><SlidersHorizontal size={18} /></button>
      </div>

      {/* Workspace switcher bar */}
      <WorkspaceBar activeId={workspaceId} onSelect={setWorkspaceId} />

      {/* Edit mode banner */}
      {editMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.2)', borderRadius: '14px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#60a5fa' }}>
          <span>Long-press any widget to reorder · tap ✕ to remove</span>
          <button onClick={() => setEditMode(false)} style={{ fontSize: '12px', color: '#24d18c', fontWeight: 700, background: 'none', border: 'none', padding: 0 }}>Done</button>
        </div>
      )}

      {/* Workspace description (collapsed in edit mode) */}
      {!editMode && (
        <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.4 }}>{ws.description}</p>
      )}

      {/* Widget cards */}
      {visible.length === 0 ? (
        <div style={{ border: '1px dashed rgba(148,163,184,.2)', borderRadius: '18px', padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', marginBottom: '12px' }}>
          No widgets — tap <Plus size={12} style={{ verticalAlign: 'middle' }} /> to add one.
        </div>
      ) : visible.map((id, i) => (
        <WidgetCard
          key={id}
          widgetId={id}
          index={i}
          total={visible.length}
          editMode={editMode}
          onLongPress={() => setEditMode(true)}
          onMove={handleMove}
          onRemove={handleRemove}
        >
          {renderContent(id)}
        </WidgetCard>
      ))}

      {/* FAB — add widget */}
      <button
        onClick={() => setShowAdd(true)}
        aria-label="Add widget"
        style={{
          position: 'fixed', right: '20px', bottom: '88px', zIndex: 20,
          width: '52px', height: '52px', borderRadius: '16px',
          background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
          border: 'none', color: '#fff', display: 'grid', placeItems: 'center',
          boxShadow: '0 8px 24px rgba(59,130,246,.4)',
        }}
      >
        <Plus size={22} />
      </button>

      {/* Bottom workspace nav */}
      <BottomNav activeId={workspaceId} pinned={pinned} onSelect={setWorkspaceId} />

      {/* Add widget sheet */}
      {showAdd && (
        <AddWidgetSheet
          workspaceId={workspaceId}
          hidden={hidden}
          visible={visible}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}

      {/* Stock detail drawer */}
      {selected && <MobileDetailView position={selected} onClose={() => setSelected(null)} />}
    </main>
  )
}
