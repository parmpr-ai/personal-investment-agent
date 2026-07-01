'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'

// ─── Dynamic Widget Imports ──────────────────────────────────────────────────
const AgentSettingsWidget = dynamic(() => import('./widgets/AgentSettingsWidget'), {
  loading: () => <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>,
  ssr: false,
})

const AgentTrainingStatusWidget = dynamic(() => import('./widgets/AgentTrainingStatusWidget'), {
  loading: () => <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>,
  ssr: false,
})

const AgentPerformanceWidget = dynamic(() => import('./widgets/AgentPerformanceWidget'), {
  loading: () => <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>,
  ssr: false,
})

const AgentDecisionsWidget = dynamic(() => import('./widgets/AgentDecisionsWidget'), {
  loading: () => <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>,
  ssr: false,
})

const AgentBacktestResultsWidget = dynamic(() => import('./widgets/AgentBacktestResultsWidget'), {
  loading: () => <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Loading...</div>,
  ssr: false,
})

// ─── Constants ───────────────────────────────────────────────────────────────
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'

const C = {
  bg: '#0a0a0a',
  card: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  green: '#00ff88',
  greenDim: '#22c55e',
  red: '#ff4444',
  redDim: '#ef4444',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  purple: '#a855f7',
  textPrimary: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  radius: '12px',
  radiusSm: '8px',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt$ = (v: any) =>
  Number(v || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const fmtPct = (v: any, sign = true) => {
  const n = Number(v || 0)
  return `${sign && n > 0 ? '+' : ''}${n.toFixed(2)}%`
}

const fmtTime = (ts: string) => {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

const fmtDatetime = (ts: string) => {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ts
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, init)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw body
  return body
}

function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (ms === null) return
    const id = setInterval(() => ref.current(), ms)
    return () => clearInterval(id)
  }, [ms])
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Card({
  children,
  style,
  className,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: C.radius,
        padding: '20px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h3
      style={{
        color: C.textSecondary,
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        margin: '0 0 16px 0',
        ...style,
      }}
    >
      {children}
    </h3>
  )
}

function Badge({
  children,
  color = C.textSecondary,
  bg = 'rgba(255,255,255,0.06)',
}: {
  children: React.ReactNode
  color?: string
  bg?: string
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        borderRadius: '20px',
        background: bg,
        color,
        fontSize: '11px',
        fontWeight: 600,
        border: `1px solid ${color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '7px',
        height: '7px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function PctLabel({ value, style }: { value: number; style?: React.CSSProperties }) {
  const color = value >= 0 ? C.green : C.red
  return (
    <span style={{ color, fontWeight: 600, ...style }}>
      {fmtPct(value)}
    </span>
  )
}

function EmptyState({ message = 'No data available' }: { message?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '120px',
        color: C.textMuted,
        fontSize: '13px',
      }}
    >
      {message}
    </div>
  )
}

function Spinner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80px',
        color: C.textMuted,
        fontSize: '13px',
        gap: '8px',
      }}
    >
      <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
      Loading...
    </div>
  )
}

// ─── Section A: Live Status Bar ───────────────────────────────────────────────

function LiveStatusBar({ status, onToggle, onOpenSellModal, toggling, sellAllLoading, regimeData }: { status: any; onToggle: () => void; onOpenSellModal: () => void; toggling: boolean; sellAllLoading: boolean; regimeData: any }) {
  const running = status?.running
  const portfolio = status?.paper_portfolio || {}
  const totalReturn = portfolio.total_return_pct ?? 0
  const totalValue = portfolio.total_value ?? 0
  const openPositions = (portfolio?.positions || []).length

  return (
    <Card
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 20px',
        marginBottom: '20px',
      }}
    >
      {/* Toggle */}
      <button
        onClick={onToggle}
        disabled={toggling}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '8px',
          border: 'none',
          background: running ? 'rgba(255,68,68,0.15)' : 'rgba(0,255,136,0.15)',
          color: running ? C.red : C.green,
          fontWeight: 700,
          fontSize: '13px',
          cursor: toggling ? 'wait' : 'pointer',
          transition: 'all 0.2s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: running ? C.red : C.green,
            boxShadow: running ? `0 0 8px ${C.red}` : `0 0 8px ${C.green}`,
            animation: running ? 'pulse 2s infinite' : 'none',
          }}
        />
        {toggling ? 'Working...' : running ? 'STOP AGENT' : 'START AGENT'}
      </button>

      {/* Emergency Sell-All Button */}
      {openPositions > 0 && (
        <button
          onClick={onOpenSellModal}
          disabled={sellAllLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'rgba(255,68,68,0.2)',
            color: C.red,
            fontWeight: 700,
            fontSize: '13px',
            cursor: sellAllLoading ? 'wait' : 'pointer',
            transition: 'all 0.2s',
            flexShrink: 0,
          }}
        >
          🚨 SELL ALL ({openPositions})
        </button>
      )}

      {/* Divider */}
      <div style={{ width: '1px', height: '32px', background: C.border }} />

      {/* Status chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', flex: 1 }}>
        <Badge color={running ? C.green : C.textMuted} bg={running ? 'rgba(0,255,136,0.08)' : undefined}>
          <Dot color={running ? C.green : C.textMuted} />
          {running ? 'RUNNING' : 'STOPPED'}
        </Badge>

        {status?.mode && (
          <Badge color={C.blue} bg="rgba(59,130,246,0.08)">
            {status.mode}
          </Badge>
        )}

        {status?.config?.news_provider && (
          <Badge color={C.purple} bg="rgba(168,85,247,0.08)">
            News: {status.config.news_provider}
          </Badge>
        )}

        {status?.risk_mode && status.risk_mode !== 'AUTO' && (() => {
          const rm = status.risk_mode as string
          const rmColor = rm === 'AGGRESSIVE' ? C.red : rm === 'DEFENSIVE' ? C.purple : rm === 'CONSERVATIVE' ? C.yellow : C.green
          const rmBg = rm === 'AGGRESSIVE' ? 'rgba(255,68,68,0.1)' : rm === 'DEFENSIVE' ? 'rgba(168,85,247,0.1)' : rm === 'CONSERVATIVE' ? 'rgba(245,158,11,0.1)' : 'rgba(0,255,136,0.08)'
          return <Badge color={rmColor} bg={rmBg}>{rm}</Badge>
        })()}

        {status?.trade_style && status.trade_style !== 'AUTO' && (() => {
          const ts = status.trade_style as string
          const tsColor = ts === 'DAY_TRADE' ? C.blue : ts === 'POSITION_TRADE' ? C.purple : C.textSecondary
          return <Badge color={tsColor} bg={`${tsColor}15`}>{ts.replace(/_/g, ' ')}</Badge>
        })()}

        {status?.cycle_count != null && (
          <Badge>Cycle #{status.cycle_count}</Badge>
        )}

        {status?.last_cycle && (
          <Badge>Last: {fmtTime(status.last_cycle)}</Badge>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '32px', background: C.border }} />

      {/* Portfolio value */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '20px', fontWeight: 700, color: C.textPrimary, lineHeight: 1.2 }}>
          {fmt$(totalValue)}
        </div>
        <div style={{ fontSize: '12px', marginTop: '2px' }}>
          <PctLabel value={totalReturn} />
          <span style={{ color: C.textMuted, marginLeft: '6px' }}>total return</span>
        </div>
      </div>

      {/* VIX / regime from /macros */}
      {status?.macros && (
        <>
          <div style={{ width: '1px', height: '32px', background: C.border }} />
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            {status.macros.vix != null && (
              <Badge
                color={status.macros.vix > 30 ? C.red : status.macros.vix > 20 ? C.yellow : C.green}
                bg={status.macros.vix > 30 ? 'rgba(255,68,68,0.08)' : status.macros.vix > 20 ? 'rgba(245,158,11,0.08)' : 'rgba(0,255,136,0.08)'}
              >
                VIX {Number(status.macros.vix).toFixed(1)}
              </Badge>
            )}
            {status.macros.regime && (
              <Badge color={status.macros.hostile ? C.red : C.green}>
                {status.macros.regime}
              </Badge>
            )}
          </div>
        </>
      )}

      {/* Regime badge from /agent/regime */}
      {regimeData?.regime && (() => {
        const r = regimeData.regime as string
        const regimeColor = r === 'BULL_TREND' ? C.green : r === 'BEAR_TREND' ? C.red : r === 'CRISIS' ? C.red : C.yellow
        const regimeBg = r === 'BULL_TREND' ? 'rgba(0,255,136,0.08)' : r === 'BEAR_TREND' ? 'rgba(255,68,68,0.08)' : r === 'CRISIS' ? 'rgba(255,68,68,0.12)' : 'rgba(245,158,11,0.08)'
        return (
          <>
            <div style={{ width: '1px', height: '32px', background: C.border }} />
            <Badge color={regimeColor} bg={regimeBg}>
              <span
                style={{
                  display: 'inline-block',
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: regimeColor,
                  animation: r === 'CRISIS' ? 'pulseCrisis 1.2s infinite' : 'none',
                  flexShrink: 0,
                }}
              />
              {r.replace(/_/g, ' ')}
            </Badge>
          </>
        )
      })()}
    </Card>
  )
}

// ─── Section B: P&L Chart ────────────────────────────────────────────────────

function PnlChart({ data, loading }: { data: any[]; loading: boolean }) {
  const last = data[data.length - 1]
  const returnPct = last?.return_pct ?? 0
  const isPositive = returnPct >= 0

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div
        style={{
          background: '#1a1a1a',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
        }}
      >
        <div style={{ color: C.textMuted, marginBottom: '4px' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.color, fontWeight: 600 }}>
            {p.name === 'portfolio_value' ? fmt$(p.value) : fmtPct(p.value)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div>
          <SectionTitle style={{ margin: 0 }}>Portfolio P&L — Last 24h</SectionTitle>
          <p style={{ color: C.textMuted, fontSize: '12px', margin: '4px 0 0' }}>
            Portfolio value over time · auto-refreshes every 30s
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: isPositive ? C.green : C.red }}>
            {fmtPct(returnPct)}
          </div>
          <div style={{ color: C.textMuted, fontSize: '11px' }}>Total Return</div>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState message="No P&L data yet — agent needs to run at least one cycle." />
      ) : (
        <div style={{ height: '240px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isPositive ? C.green : C.red} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isPositive ? C.green : C.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="ts"
                tickFormatter={(v) => {
                  try {
                    return new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                  } catch {
                    return v
                  }
                }}
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="value"
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tickFormatter={(v) => `${v.toFixed(1)}%`}
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                yAxisId="value"
                type="monotone"
                dataKey="portfolio_value"
                name="portfolio_value"
                stroke={isPositive ? C.green : C.red}
                strokeWidth={2}
                fill="url(#pnlGrad)"
              />
              <Area
                yAxisId="pct"
                type="monotone"
                dataKey="return_pct"
                name="return_pct"
                stroke={C.blue}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// ─── Section C: Today's Activity Summary ─────────────────────────────────────

function ActivitySummary({ status, decisions }: { status: any; decisions: any[] }) {
  const portfolio = status?.paper_portfolio || {}
  const today = new Date().toDateString()

  const todayDecisions = decisions.filter((d) => {
    try {
      return new Date(d.ts).toDateString() === today
    } catch {
      return false
    }
  })

  const executed = todayDecisions.filter((d) => d.executed)
  const blocked = todayDecisions.filter((d) => d.blocked_reason)
  const wins = executed.filter((d) => (d.pnl ?? 0) > 0)
  const winRate = executed.length > 0 ? (wins.length / executed.length) * 100 : 0

  const stats = [
    { label: 'Decisions Today', value: todayDecisions.length, color: C.blue },
    { label: 'Trades Executed', value: executed.length, color: C.green },
    { label: 'Trades Blocked', value: blocked.length, color: C.yellow },
    { label: 'Win Rate', value: `${winRate.toFixed(0)}%`, color: winRate >= 50 ? C.green : C.red },
    { label: 'Open Longs', value: Array.isArray(portfolio.longs) ? portfolio.longs.length : (portfolio.longs ?? 0), color: C.green },
    { label: 'Open Shorts', value: Array.isArray(portfolio.shorts) ? portfolio.shorts.length : (portfolio.shorts ?? 0), color: C.red },
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: '12px',
        marginBottom: '20px',
      }}
    >
      {stats.map((s) => (
        <Card
          key={s.label}
          style={{
            padding: '16px',
            textAlign: 'center',
            borderColor: `${s.color}22`,
          }}
        >
          <div
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: s.color,
              lineHeight: 1.1,
              marginBottom: '6px',
            }}
          >
            {s.value}
          </div>
          <div style={{ fontSize: '11px', color: C.textMuted, fontWeight: 500 }}>{s.label}</div>
        </Card>
      ))}
    </div>
  )
}

// ─── Section D: Open Positions Table ─────────────────────────────────────────

function OpenPositionsTable({ portfolio, loading }: { portfolio: any; loading: boolean }) {
  const positions = portfolio?.positions || []

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <SectionTitle style={{ margin: 0 }}>Open Positions</SectionTitle>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {portfolio?.total_value != null && (
            <span style={{ color: C.textSecondary, fontSize: '13px', fontWeight: 600 }}>
              Total: {fmt$(portfolio.total_value)}
            </span>
          )}
          {portfolio?.cash != null && (
            <Badge color={C.textMuted}>Cash: {fmt$(portfolio.cash)}</Badge>
          )}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : positions.length === 0 ? (
        <EmptyState message="No open positions" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Ticker', 'Style', 'Side', 'Qty', 'Entry', 'Current', 'P&L $', 'P&L %', 'Hold', 'Stop', 'Target'].map((h) => (
                  <th
                    key={h}
                    style={{
                      color: C.textMuted,
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      textAlign: h === 'Ticker' || h === 'Style' ? 'left' : 'right',
                      padding: '7px 8px',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p: any, i: number) => {
                const pnl = p.unrealized_pnl ?? 0
                const pnlPct = p.unrealized_pct ?? p.pnl_pct ?? 0
                const isProfit = pnl >= 0
                const isLong = (p.side || '').toUpperCase() === 'LONG'
                const style = (p.trade_style || '') as string
                const styleColor = style === 'DAY_TRADE' ? C.blue : style === 'POSITION_TRADE' ? C.purple : style === 'SWING_TRADE' ? C.yellow : C.textMuted
                const holdHours = p.entry_ts ? (() => {
                  try {
                    const h = (Date.now() - new Date(p.entry_ts).getTime()) / 3600000
                    return h < 24 ? `${h.toFixed(0)}h` : `${(h / 24).toFixed(1)}d`
                  } catch { return '—' }
                })() : '—'

                return (
                  <tr
                    key={`${p.ticker}-${i}`}
                    style={{
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                  >
                    <td style={{ padding: '8px 8px', fontWeight: 700, color: C.textPrimary }}>{p.ticker}</td>
                    <td style={{ padding: '8px 8px' }}>
                      {style ? (
                        <Badge color={styleColor} bg={`${styleColor}15`} >
                          {style === 'DAY_TRADE' ? 'DAY' : style === 'SWING_TRADE' ? 'SWING' : style === 'POSITION_TRADE' ? 'POS' : style}
                        </Badge>
                      ) : <span style={{ color: C.textMuted }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <Badge color={isLong ? C.green : C.red} bg={isLong ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)'}>
                        {p.side || '—'}
                      </Badge>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textSecondary }}>{p.qty ?? '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textSecondary }}>{fmt$(p.avg_price)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textPrimary, fontWeight: 600 }}>
                      {p.current_price ? fmt$(p.current_price) : fmt$(p.market_value / (p.qty || 1))}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: isProfit ? C.green : C.red, fontWeight: 600 }}>
                      {fmt$(pnl)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: isProfit ? C.green : C.red }}>
                      {fmtPct(pnlPct)}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textMuted, fontSize: '11px' }}>
                      {holdHours}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.red }}>
                      {p.stop_loss ? fmt$(p.stop_loss) : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.green }}>
                      {p.target ? fmt$(p.target) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Section E: Strategy Performance ─────────────────────────────────────────

function StrategyPerformance({ data, loading }: { data: any[]; loading: boolean }) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div
        style={{
          background: '#1a1a1a',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
        }}
      >
        <div style={{ color: C.textPrimary, fontWeight: 600, marginBottom: '4px' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.fill, marginTop: '2px' }}>
            {p.name}: {typeof p.value === 'number' && p.name === 'win_rate' ? `${p.value.toFixed(1)}%` : p.value}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Strategy Performance</SectionTitle>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState message="No strategy data yet" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Strategy', 'Trades', 'Win Rate', 'Avg Return', 'Total P&L', 'Status'].map((h) => (
                    <th
                      key={h}
                      style={{
                        color: C.textMuted,
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        textAlign: h === 'Strategy' ? 'left' : 'right',
                        padding: '6px 8px',
                        borderBottom: `1px solid ${C.border}`,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((s: any, i: number) => {
                  const wr = s.win_rate ?? 0
                  const totalPnl = s.total_pnl ?? 0

                  return (
                    <tr
                      key={s.strategy || i}
                      style={{ borderBottom: `1px solid ${C.border}22` }}
                    >
                      <td style={{ padding: '8px 8px', color: C.textPrimary, fontWeight: 600 }}>
                        {s.strategy || '—'}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textSecondary }}>
                        {s.total_trades ?? 0}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: wr >= 50 ? C.green : C.red }}>
                        {wr.toFixed(1)}%
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <PctLabel value={s.avg_return_pct ?? 0} />
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right', color: totalPnl >= 0 ? C.green : C.red, fontWeight: 600 }}>
                        {fmt$(totalPnl)}
                      </td>
                      <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                        <Badge
                          color={s.status === 'active' ? C.green : C.yellow}
                          bg={s.status === 'active' ? 'rgba(0,255,136,0.08)' : 'rgba(245,158,11,0.08)'}
                        >
                          {s.status || 'active'}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Bar chart */}
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="strategy"
                  tick={{ fill: C.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: C.textMuted, fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="win_rate" name="win_rate" radius={[4, 4, 0, 0]}>
                  {data.map((entry: any, index: number) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={(entry.win_rate ?? 0) >= 50 ? C.green : C.red}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Section F: Live Decision Log ────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  BUY: '#00ff88',
  SELL: '#f59e0b',
  SHORT: '#ff4444',
  COVER: '#3b82f6',
  BLOCKED: '#6b7280',
  HOLD: '#9ca3af',
}

function DecisionLog({ decisions, loading }: { decisions: any[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <SectionTitle style={{ margin: 0 }}>Live Decision Log</SectionTitle>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ color: C.textMuted, fontSize: '11px' }}>Click reasoning to expand</span>
          <Badge color={C.blue}>Refreshes every 15s</Badge>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : decisions.length === 0 ? (
        <EmptyState message="No decisions recorded yet" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Time', 'Ticker', 'Action', 'Style', 'Confidence', 'Reasoning', 'Result'].map((h) => (
                  <th
                    key={h}
                    style={{
                      color: C.textMuted,
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      textAlign: h === 'Reasoning' || h === 'Time' || h === 'Ticker' ? 'left' : 'center',
                      padding: '6px 10px',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {decisions.map((d: any, i: number) => {
                const actionKey = (d.action || '').toUpperCase()
                const actionColor = ACTION_COLORS[actionKey] || C.textSecondary
                const reasoning = d.reasoning || ''
                const isExpanded = expanded.has(i)
                const preview = reasoning.length > 80 ? reasoning.slice(0, 80) + '…' : reasoning
                const isBlocked = !!d.blocked_reason
                const result = isBlocked ? 'BLOCKED' : d.executed ? 'EXECUTED' : 'SKIPPED'
                const resultColor = isBlocked ? C.yellow : d.executed ? C.green : C.textMuted
                const tradeStyle = d.trade_style as string | undefined
                const tsColor = tradeStyle === 'DAY_TRADE' ? C.blue : tradeStyle === 'POSITION_TRADE' ? C.purple : C.textMuted

                return (
                  <React.Fragment key={d.id || i}>
                    <tr
                      style={{
                        borderBottom: isExpanded ? 'none' : `1px solid ${C.border}22`,
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      }}
                    >
                      <td style={{ padding: '8px 10px', color: C.textMuted, whiteSpace: 'nowrap', fontSize: '11px' }}>
                        {fmtDatetime(d.ts)}
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: C.textPrimary }}>{d.ticker || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <Badge color={actionColor} bg={`${actionColor}15`}>
                          {d.action || '—'}
                        </Badge>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {tradeStyle ? (
                          <Badge color={tsColor} bg={`${tsColor}15`}>
                            {tradeStyle === 'DAY_TRADE' ? 'DAY' : tradeStyle === 'SWING_TRADE' ? 'SWING' : tradeStyle === 'POSITION_TRADE' ? 'POS' : tradeStyle}
                          </Badge>
                        ) : <span style={{ color: C.textMuted }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        {d.confidence != null ? (
                          <span style={{ color: d.confidence >= 0.7 ? C.green : d.confidence >= 0.4 ? C.yellow : C.red, fontWeight: 600 }}>
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        ) : <span style={{ color: C.textMuted }}>—</span>}
                      </td>
                      <td
                        style={{ padding: '8px 10px', color: C.textSecondary, cursor: reasoning.length > 80 ? 'pointer' : 'default', maxWidth: '300px' }}
                        onClick={() => reasoning.length > 80 && toggleExpand(i)}
                      >
                        <span style={{ color: reasoning.length > 80 ? (isExpanded ? C.blue : C.textSecondary) : C.textSecondary }}>
                          {isExpanded ? reasoning : preview}
                        </span>
                        {reasoning.length > 80 && (
                          <span style={{ color: C.blue, marginLeft: '6px', fontSize: '10px', fontWeight: 600 }}>
                            {isExpanded ? '▲ less' : '▼ more'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <Badge color={resultColor} bg={`${resultColor}10`}>
                          {result}
                        </Badge>
                      </td>
                    </tr>
                    {isExpanded && d.blocked_reason && (
                      <tr style={{ background: 'rgba(245,158,11,0.04)' }}>
                        <td colSpan={7} style={{ padding: '6px 10px 10px 10px', color: C.yellow, fontSize: '11px' }}>
                          Blocked: {d.blocked_reason}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Section G: Hourly Breakdown ──────────────────────────────────────────────

function HourlyBreakdown({ data, loading }: { data: any[]; loading: boolean }) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div
        style={{
          background: '#1a1a1a',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          padding: '10px 14px',
          fontSize: '12px',
        }}
      >
        <div style={{ color: C.textMuted, marginBottom: '6px' }}>Hour {label}:00</div>
        {payload.map((p: any) => (
          <div key={p.name} style={{ color: p.fill || p.color, marginTop: '2px' }}>
            {p.name === 'pnl' ? `P&L: ${fmt$(p.value)}` : `${p.name}: ${p.value}`}
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Hourly Breakdown — Today</SectionTitle>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState message="No hourly data yet" />
      ) : (
        <div style={{ height: '200px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="hour"
                tickFormatter={(v) => `${v}h`}
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="trades"
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <YAxis
                yAxisId="pnl"
                orientation="right"
                tickFormatter={(v) => `$${v >= 0 ? '' : '-'}${Math.abs(v).toFixed(0)}`}
                tick={{ fill: C.textMuted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '11px', color: C.textMuted }}
              />
              <Bar
                yAxisId="trades"
                dataKey="trades"
                name="decisions"
                fill={C.blue}
                fillOpacity={0.7}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                yAxisId="trades"
                dataKey="executed"
                name="executed"
                fill={C.green}
                fillOpacity={0.7}
                radius={[3, 3, 0, 0]}
              />
              <Bar
                yAxisId="pnl"
                dataKey="pnl"
                name="pnl"
                radius={[3, 3, 0, 0]}
              >
                {data.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={(entry.pnl ?? 0) >= 0 ? C.green : C.red} fillOpacity={0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// ─── Section H: Quick Config Panel ───────────────────────────────────────────

function QuickConfigPanel({ config, onSave }: { config: any; onSave: (updates: any) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config) {
      setForm({
        cycle_minutes: config.cycle_minutes ?? '',
        min_confidence: config.min_confidence ?? '',
        max_position_pct: config.max_position_pct ?? '',
        allow_shorts: config.allow_shorts ?? false,
        universe: Array.isArray(config.universe) ? config.universe.join(', ') : config.universe ?? '',
      })
    }
  }, [config])

  async function handleSave() {
    setSaving(true)
    try {
      const payload: any = {
        cycle_minutes: form.cycle_minutes !== '' ? Number(form.cycle_minutes) : undefined,
        min_confidence: form.min_confidence !== '' ? Number(form.min_confidence) : undefined,
        max_position_pct: form.max_position_pct !== '' ? Number(form.max_position_pct) : undefined,
        allow_shorts: form.allow_shorts,
        universe: form.universe
          ? form.universe
              .split(',')
              .map((s: string) => s.trim().toUpperCase())
              .filter(Boolean)
          : undefined,
      }
      await onSave(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: `1px solid ${C.border}`,
    borderRadius: '6px',
    padding: '7px 10px',
    color: C.textPrimary,
    fontSize: '13px',
    width: '100%',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: C.textMuted,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: '5px',
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <SectionTitle style={{ margin: 0 }}>Quick Config</SectionTitle>
        <span style={{ color: C.textMuted, fontSize: '16px', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          ▾
        </span>
      </button>

      {open && (
        <div style={{ marginTop: '16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '14px',
              marginBottom: '16px',
            }}
          >
            <div>
              <label style={labelStyle}>Cycle Minutes</label>
              <input
                type="number"
                style={inputStyle}
                value={form.cycle_minutes}
                onChange={(e) => setForm((f: any) => ({ ...f, cycle_minutes: e.target.value }))}
                placeholder="e.g. 30"
              />
            </div>

            <div>
              <label style={labelStyle}>Min Confidence (0–1)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                style={inputStyle}
                value={form.min_confidence}
                onChange={(e) => setForm((f: any) => ({ ...f, min_confidence: e.target.value }))}
                placeholder="e.g. 0.6"
              />
            </div>

            <div>
              <label style={labelStyle}>Max Position %</label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                style={inputStyle}
                value={form.max_position_pct}
                onChange={(e) => setForm((f: any) => ({ ...f, max_position_pct: e.target.value }))}
                placeholder="e.g. 10"
              />
            </div>

            <div>
              <label style={labelStyle}>Allow Shorts</label>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  marginTop: '8px',
                }}
              >
                <div
                  onClick={() => setForm((f: any) => ({ ...f, allow_shorts: !f.allow_shorts }))}
                  style={{
                    width: '40px',
                    height: '22px',
                    borderRadius: '11px',
                    background: form.allow_shorts ? C.green : 'rgba(255,255,255,0.1)',
                    position: 'relative',
                    transition: 'background 0.2s',
                    cursor: 'pointer',
                    flexShrink: 0,
                    border: `1px solid ${form.allow_shorts ? C.green : C.border}`,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: form.allow_shorts ? '20px' : '2px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      background: '#fff',
                      transition: 'left 0.2s',
                    }}
                  />
                </div>
                <span style={{ color: form.allow_shorts ? C.green : C.textMuted, fontSize: '13px', fontWeight: 600 }}>
                  {form.allow_shorts ? 'Yes' : 'No'}
                </span>
              </label>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Universe (comma-separated tickers)</label>
            <input
              type="text"
              style={inputStyle}
              value={form.universe}
              onChange={(e) => setForm((f: any) => ({ ...f, universe: e.target.value }))}
              placeholder="AAPL, MSFT, TSLA, NVDA..."
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 20px',
              borderRadius: '8px',
              border: `1px solid ${saved ? C.green : C.blue}44`,
              background: saved ? 'rgba(0,255,136,0.15)' : 'rgba(59,130,246,0.15)',
              color: saved ? C.green : C.blue,
              fontWeight: 700,
              fontSize: '13px',
              cursor: saving ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            } as any}
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Config'}
          </button>
        </div>
      )}
    </Card>
  )
}

// ─── Agent Log Viewer ─────────────────────────────────────────────────────────

function AgentLog({ log, loading }: { log: any[]; loading: boolean }) {
  const levelColor = (level: string) => {
    switch ((level || '').toUpperCase()) {
      case 'ERROR': return C.red
      case 'WARNING': case 'WARN': return C.yellow
      case 'INFO': return C.blue
      case 'DEBUG': return C.textMuted
      default: return C.textSecondary
    }
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Agent Log (last 50)</SectionTitle>
      {loading ? (
        <Spinner />
      ) : log.length === 0 ? (
        <EmptyState message="No log entries yet" />
      ) : (
        <div
          style={{
            maxHeight: '240px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '11px',
            lineHeight: '1.6',
          }}
        >
          {log.map((entry: any, i: number) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '10px',
                padding: '3px 0',
                borderBottom: `1px solid ${C.border}22`,
              }}
            >
              <span style={{ color: C.textMuted, flexShrink: 0 }}>{fmtDatetime(entry.ts)}</span>
              <span style={{ color: levelColor(entry.level), flexShrink: 0, fontWeight: 700, minWidth: '50px' }}>
                {(entry.level || '').toUpperCase()}
              </span>
              <span style={{ color: C.textSecondary }}>{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Last Cycle Summary ───────────────────────────────────────────────────────

function LastCycleSummary({ summary }: { summary: any }) {
  if (!summary) return null

  const circuitBroken = summary.circuit_broken === true
  const dailyPnl = summary.daily_pnl_pct ?? null
  const totalReturn = summary.total_return_pct ?? null
  const pv = summary.portfolio_value ?? null

  // Keys to show prominently (rest shown in secondary grid)
  const primaryKeys = ['executed', 'blocked', 'decisions', 'quotes_fetched', 'open_longs', 'open_shorts']
  const skipKeys = new Set(['cycle_id', 'ts', 'circuit_broken', 'daily_pnl_pct', 'total_return_pct',
    'portfolio_value', 'peak_value', 'drawdown_scale', 'top_sectors', 'news_bullish', 'news_bearish'])

  return (
    <Card
      style={{
        marginBottom: '20px',
        background: circuitBroken ? 'rgba(255,68,68,0.06)' : 'rgba(59,130,246,0.04)',
        borderColor: circuitBroken ? 'rgba(255,68,68,0.3)' : 'rgba(59,130,246,0.15)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <SectionTitle style={{ margin: 0 }}>Last Cycle — {summary.ts ? new Date(summary.ts).toLocaleTimeString() : '—'}</SectionTitle>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Circuit breaker banner */}
          {circuitBroken && (
            <Badge color={C.red} bg="rgba(255,68,68,0.12)">
              ⛔ CIRCUIT BREAKER ACTIVE
            </Badge>
          )}
          {/* Daily P&L */}
          {dailyPnl !== null && (
            <Badge
              color={dailyPnl >= 0 ? C.green : C.red}
              bg={dailyPnl >= 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)'}
            >
              Day {dailyPnl >= 0 ? '+' : ''}{Number(dailyPnl).toFixed(2)}%
            </Badge>
          )}
          {/* Total return */}
          {totalReturn !== null && pv != null && (
            <Badge
              color={totalReturn >= 0 ? C.green : C.red}
              bg={totalReturn >= 0 ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)'}
            >
              {fmt$(pv)} ({totalReturn >= 0 ? '+' : ''}{Number(totalReturn).toFixed(2)}%)
            </Badge>
          )}
          {/* Drawdown scale */}
          {summary.drawdown_scale != null && summary.drawdown_scale < 0.95 && (
            <Badge color={C.yellow} bg="rgba(245,158,11,0.08)">
              DD scale {Number(summary.drawdown_scale).toFixed(2)}×
            </Badge>
          )}
        </div>
      </div>

      {/* Primary metrics row */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {primaryKeys.map(key => summary[key] != null && (
          <div key={key}>
            <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
              {key.replace(/_/g, ' ')}
            </div>
            <div style={{ color: C.textPrimary, fontSize: '18px', fontWeight: 700 }}>
              {summary[key]}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px',
        borderTop: `1px solid ${C.border}`, paddingTop: '10px' }}>
        {Object.entries(summary)
          .filter(([k]) => !primaryKeys.includes(k) && !skipKeys.has(k))
          .map(([key, val]: any) => (
            <div key={key}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                {key.replace(/_/g, ' ')}
              </div>
              <div style={{ color: C.textSecondary, fontSize: '12px', fontWeight: 600 }}>
                {typeof val === 'boolean' ? (val ? 'Yes' : 'No')
                  : Array.isArray(val) ? val.join(', ') || '—'
                  : typeof val === 'number' ? val.toFixed(2)
                  : String(val || '—')}
              </div>
            </div>
          ))}
      </div>
    </Card>
  )
}

// ─── Section I: Regime Panel ──────────────────────────────────────────────────

const REGIME_STRATEGY_COLORS = [C.green, C.blue, C.purple, C.yellow, C.greenDim, C.redDim]

function RegimePanel({ data, loading }: { data: any; loading: boolean }) {
  if (loading) return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Market Regime</SectionTitle>
      <Spinner />
    </Card>
  )

  if (!data) return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Market Regime</SectionTitle>
      <EmptyState message="Regime data unavailable" />
    </Card>
  )

  const regime = (data.regime || 'UNKNOWN') as string
  const confidence = data.confidence ?? null
  const daysInRegime = data.days_in_regime ?? null
  const vix = data.vix ?? null
  const activeStrategies: string[] = Array.isArray(data.active_strategies) ? data.active_strategies : []
  const pausedStrategies: string[] = Array.isArray(data.paused_strategies) ? data.paused_strategies : []
  const history: { regime: string; date: string }[] = Array.isArray(data.history) ? data.history.slice(0, 5) : []

  const regimeColor = regime === 'BULL_TREND' ? C.green
    : regime === 'BEAR_TREND' ? C.red
    : regime === 'CRISIS' ? C.red
    : C.yellow
  const regimeBg = regime === 'BULL_TREND' ? 'rgba(0,255,136,0.1)'
    : regime === 'BEAR_TREND' ? 'rgba(255,68,68,0.1)'
    : regime === 'CRISIS' ? 'rgba(255,68,68,0.15)'
    : 'rgba(245,158,11,0.1)'

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Market Regime</SectionTitle>

      {/* Top row: badge + stats */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start', marginBottom: '20px' }}>
        {/* Regime badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 20px',
            borderRadius: C.radius,
            background: regimeBg,
            border: `1px solid ${regimeColor}44`,
            animation: regime === 'CRISIS' ? 'pulseCrisis 1.2s infinite' : 'none',
          }}
        >
          <span style={{ fontSize: '22px', fontWeight: 800, color: regimeColor, letterSpacing: '0.04em' }}>
            {regime.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
          {confidence !== null && (
            <div>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
                Confidence
              </div>
              <div style={{ color: regimeColor, fontSize: '20px', fontWeight: 700 }}>
                {(Number(confidence) * 100).toFixed(1)}%
              </div>
            </div>
          )}
          {daysInRegime !== null && (
            <div>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
                Days in Regime
              </div>
              <div style={{ color: C.textPrimary, fontSize: '20px', fontWeight: 700 }}>{daysInRegime}</div>
            </div>
          )}
          {vix !== null && (
            <div>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '3px' }}>
                VIX
              </div>
              <div style={{
                color: Number(vix) > 30 ? C.red : Number(vix) > 20 ? C.yellow : C.green,
                fontSize: '20px',
                fontWeight: 700,
              }}>
                {Number(vix).toFixed(1)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Strategies */}
      {(activeStrategies.length > 0 || pausedStrategies.length > 0) && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
              Active Strategies
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {activeStrategies.length > 0
                ? activeStrategies.map((s, i) => (
                    <Badge key={s} color={REGIME_STRATEGY_COLORS[i % REGIME_STRATEGY_COLORS.length]} bg={`${REGIME_STRATEGY_COLORS[i % REGIME_STRATEGY_COLORS.length]}18`}>
                      ● {s}
                    </Badge>
                  ))
                : <span style={{ color: C.textMuted, fontSize: '12px' }}>None</span>
              }
            </div>
          </div>
          {pausedStrategies.length > 0 && (
            <div>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                Paused Strategies
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {pausedStrategies.map((s) => (
                  <Badge key={s} color={C.textMuted} bg="rgba(255,255,255,0.04)">
                    ⏸ {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Regime history timeline */}
      {history.length > 0 && (
        <div>
          <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
            Regime History (last 5)
          </div>
          <div style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
            {history.map((h, i) => {
              const hColor = h.regime === 'BULL_TREND' ? C.green
                : h.regime === 'BEAR_TREND' ? C.red
                : h.regime === 'CRISIS' ? C.red
                : C.yellow
              return (
                <div key={i} style={{ flex: 1, position: 'relative' }}>
                  <div style={{
                    height: '6px',
                    background: hColor,
                    opacity: 0.3 + 0.14 * i,
                    borderRadius: i === 0 ? '4px 0 0 4px' : i === history.length - 1 ? '0 4px 4px 0' : '0',
                  }} />
                  <div style={{ marginTop: '6px', fontSize: '9px', color: hColor, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
                    {h.regime.replace(/_/g, ' ')}
                  </div>
                  {h.date && (
                    <div style={{ fontSize: '9px', color: C.textMuted, textAlign: 'center' }}>{h.date}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Section J: Backtest Panel ────────────────────────────────────────────────

const BACKTEST_LINE_COLORS = [C.green, C.blue, C.purple, C.yellow, C.greenDim, C.redDim]

function BacktestPanel() {
  const [result, setResult] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => stopPoll(), [])

  // Load previous results on mount
  useEffect(() => {
    apiFetch('/agent/backtest/status').then(s => {
      if (s?.status === 'completed') {
        setResult(s)
        setLastRunAt(s.run_ts ? new Date(s.run_ts) : null)
      }
    }).catch(() => {})
  }, [])

  async function handleRunBacktest() {
    setRunning(true)
    setError('')
    setStatusMsg('Starting backtest...')
    setResult(null)
    try {
      await apiFetch('/agent/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: 504 }),
      })
      // Poll status
      stopPoll()
      pollRef.current = setInterval(async () => {
        try {
          const s = await apiFetch('/agent/backtest/status')
          setStatusMsg(s?.status || 'Running...')
          if (s?.status === 'completed' || s?.done) {
            stopPoll()
            setRunning(false)
            setLastRunAt(new Date())
            // Status endpoint now returns full results when completed
            setResult(s)
          } else if (s?.status === 'error' || s?.error) {
            stopPoll()
            setRunning(false)
            setError(s?.error || 'Backtest failed')
          }
        } catch {
          // keep polling
        }
      }, 3000)
    } catch (e: any) {
      setRunning(false)
      setError(e?.detail || e?.message || 'Failed to start backtest')
    }
  }

  const minutesAgo = lastRunAt
    ? Math.floor((Date.now() - lastRunAt.getTime()) / 60000)
    : null

  // Build equity curve data for recharts
  // result.equity_curves: { [strategy]: number[] } or result.strategies[].equity_curve
  let strategies: { name: string; trades: number; win_rate: number; sharpe: number; max_dd: number; calmar: number; total_return: number; equity: number[] }[] = []
  let equityChartData: any[] = []
  let spyEquity: number[] = []

  if (result) {
    if (Array.isArray(result.strategies)) {
      strategies = result.strategies
    } else if (result.equity_curves) {
      const curves = result.equity_curves as Record<string, number[]>
      strategies = Object.entries(curves).map(([name, equity]) => ({
        name,
        trades: result[name]?.trades ?? 0,
        win_rate: result[name]?.win_rate ?? 0,
        sharpe: result[name]?.sharpe ?? 0,
        max_dd: result[name]?.max_dd ?? 0,
        calmar: result[name]?.calmar ?? 0,
        total_return: result[name]?.total_return ?? (equity[equity.length - 1] - 1) * 100,
        equity,
      }))
    }
    spyEquity = result.spy_equity || []

    // Align all equity curves to same length
    const maxLen = Math.max(...strategies.map((s) => (s.equity || []).length), spyEquity.length)
    if (maxLen > 0) {
      const step = Math.max(1, Math.floor(maxLen / 100))
      const indices = Array.from({ length: Math.ceil(maxLen / step) }, (_, i) => i * step)
      equityChartData = indices.map((idx) => {
        const pt: any = { idx }
        strategies.forEach((s) => {
          pt[s.name] = s.equity?.[idx] != null ? Number((s.equity[idx] * 100 - 100).toFixed(2)) : null
        })
        if (spyEquity.length > 0) {
          pt['SPY (B&H)'] = spyEquity[idx] != null ? Number((spyEquity[idx] * 100 - 100).toFixed(2)) : null
        }
        return pt
      })
    }
  }

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <SectionTitle style={{ margin: 0 }}>Backtest (2-year)</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {minutesAgo !== null && (
            <span style={{ color: C.textMuted, fontSize: '12px' }}>
              last run: {minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`}
            </span>
          )}
          <button
            onClick={handleRunBacktest}
            disabled={running}
            style={{
              padding: '7px 16px',
              borderRadius: '8px',
              border: `1px solid ${C.blue}44`,
              background: running ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.15)',
              color: C.blue,
              fontWeight: 700,
              fontSize: '13px',
              cursor: running ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {running ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                {statusMsg || 'Running...'}
              </span>
            ) : 'Run Backtest'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: C.red, fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,68,68,0.08)', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {!result && !running && !error && (
        <EmptyState message="No backtest run yet — click 'Run Backtest' to start" />
      )}

      {running && !result && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', color: C.textMuted, fontSize: '13px', gap: '8px' }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          {statusMsg || 'Running backtest...'}
        </div>
      )}

      {result?.summary?.mock_data && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(245,158,11,0.08)', border: `1px solid ${C.yellow}33`, fontSize: '12px', color: C.yellow }}>
          Demo mode — using synthetic price data (Yahoo Finance unavailable in this environment). Results are illustrative; run on your local machine for live data.
        </div>
      )}

      {result && strategies.length > 0 && (
        <>
          {/* SPY benchmark summary bar */}
          {result.spy_benchmark && Object.keys(result.spy_benchmark).length > 0 && (() => {
            const spy = result.spy_benchmark
            const spyRet = spy.total_return_pct ?? 0
            const bestAgent = strategies.reduce((best: any, s: any) => (s.total_return ?? 0) > (best?.total_return ?? -Infinity) ? s : best, null)
            const agentBest = bestAgent?.total_return ?? 0
            const beating = agentBest > spyRet
            return (
              <div style={{
                padding: '10px 14px', borderRadius: '10px', marginBottom: '16px',
                background: beating ? 'rgba(0,255,136,0.06)' : 'rgba(255,68,68,0.06)',
                border: `1px solid ${beating ? C.green : C.red}33`,
                display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center',
              }}>
                <span style={{ color: C.textMuted, fontSize: '12px', fontWeight: 600 }}>SPY Buy-and-Hold</span>
                <span style={{ color: spyRet >= 0 ? C.green : C.red, fontWeight: 700, fontSize: '14px' }}>
                  {spyRet >= 0 ? '+' : ''}{spyRet.toFixed(1)}%
                </span>
                <span style={{ color: C.textMuted, fontSize: '12px' }}>Sharpe: <b style={{ color: C.textSecondary }}>{spy.sharpe ?? '—'}</b></span>
                <span style={{ color: C.textMuted, fontSize: '12px' }}>Max DD: <b style={{ color: C.red }}>{spy.max_dd_pct?.toFixed(1) ?? '—'}%</b></span>
                <span style={{ color: beating ? C.green : C.red, fontWeight: 700, fontSize: '12px' }}>
                  {beating ? `Best strategy beats SPY by +${(agentBest - spyRet).toFixed(1)}%` : `SPY outperforms best by +${(spyRet - agentBest).toFixed(1)}%`}
                </span>
              </div>
            )
          })()}

          {/* Table */}
          <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Strategy', 'Trades', 'Win Rate', 'Sharpe', 'Max DD', 'Calmar', 'Total Return'].map((h) => (
                    <th
                      key={h}
                      style={{
                        color: C.textMuted,
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        textAlign: h === 'Strategy' ? 'left' : 'right',
                        padding: '6px 10px',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strategies.map((s, i) => {
                  const ret = s.total_return ?? 0
                  const wr = s.win_rate ?? 0
                  return (
                    <tr key={s.name || i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: BACKTEST_LINE_COLORS[i % BACKTEST_LINE_COLORS.length] }}>
                        {s.name || '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.textSecondary }}>{s.trades ?? '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: wr >= 50 ? C.green : C.red, fontWeight: 600 }}>
                        {typeof wr === 'number' ? `${wr.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: (s.sharpe ?? 0) >= 1 ? C.green : C.yellow }}>
                        {typeof s.sharpe === 'number' ? s.sharpe.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: C.red }}>
                        {typeof s.max_dd === 'number' ? `${s.max_dd.toFixed(1)}%` : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: (s.calmar ?? 0) >= 1 ? C.green : C.yellow }}>
                        {typeof s.calmar === 'number' ? s.calmar.toFixed(2) : '—'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: ret >= 0 ? C.green : C.red, fontWeight: 700 }}>
                        {typeof ret === 'number' ? `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Equity curves chart */}
          {equityChartData.length > 0 && (
            <div style={{ height: '260px' }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                Equity Curves (% return)
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={equityChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="idx" tick={false} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                    tick={{ fill: C.textMuted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12px' }}
                    formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}%`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: C.textMuted }} />
                  {strategies.map((s, i) => (
                    <Line
                      key={s.name}
                      type="monotone"
                      dataKey={s.name}
                      stroke={BACKTEST_LINE_COLORS[i % BACKTEST_LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  ))}
                  {spyEquity.length > 0 && (
                    <Line
                      type="monotone"
                      dataKey="SPY (B&H)"
                      stroke="#9ca3af"
                      strokeWidth={1.5}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monte Carlo fan chart */}
          {result?.monte_carlo?.paths && (() => {
            const mc = result.monte_carlo
            const paths = mc.paths as { p5: number[]; p50: number[]; p95: number[] }
            const ret = mc.final_return_pct as { p5: number; p25: number; p50: number; p75: number; p95: number }
            const dd = mc.max_drawdown_pct as { p5_worst: number; median: number }
            const probLoss = mc.prob_loss_pct as number
            const strat = mc.strategy as string

            const len = Math.max(paths.p5.length, paths.p50.length, paths.p95.length)
            const chartData = Array.from({ length: len }, (_, i) => ({
              i,
              'P95 (best)': paths.p95[i] ?? null,
              'P50 (median)': paths.p50[i] ?? null,
              'P5 (worst)': paths.p5[i] ?? null,
            }))

            const statChip = (label: string, value: string, color: string) => (
              <div key={label} style={{
                background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                padding: '10px 14px', minWidth: '110px', flex: '1',
              }}>
                <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</div>
                <div style={{ color, fontWeight: 700, fontSize: '16px' }}>{value}</div>
              </div>
            )

            return (
              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                    Monte Carlo (1 000 bootstrap paths) — best strategy: <span style={{ color: C.textSecondary }}>{strat}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: probLoss > 30 ? C.red : probLoss > 15 ? C.yellow : C.green, fontWeight: 700 }}>
                    P(loss) {probLoss.toFixed(1)}%
                  </div>
                </div>

                {/* Stat row */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {statChip('Worst case (P5)', `${ret.p5 >= 0 ? '+' : ''}${ret.p5}%`, C.red)}
                  {statChip('Median (P50)', `${ret.p50 >= 0 ? '+' : ''}${ret.p50}%`, C.textSecondary)}
                  {statChip('Best case (P95)', `${ret.p95 >= 0 ? '+' : ''}${ret.p95}%`, C.green)}
                  {statChip('Worst DD (P5)', `${dd.p5_worst.toFixed(1)}%`, C.red)}
                  {statChip('Median DD', `${dd.median.toFixed(1)}%`, C.yellow)}
                </div>

                {/* Fan chart */}
                <div style={{ height: '200px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                      <XAxis dataKey="i" tick={false} axisLine={false} tickLine={false} />
                      <YAxis
                        tickFormatter={(v) => `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}%`}
                        tick={{ fill: C.textMuted, fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                      />
                      <Tooltip
                        contentStyle={{ background: '#1a1a1a', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: any, name: string) => [`${Number(v).toFixed(1)}%`, name]}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px', color: C.textMuted }} />
                      <Line type="monotone" dataKey="P95 (best)" stroke={C.green} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                      <Line type="monotone" dataKey="P50 (median)" stroke={C.textSecondary} strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="P5 (worst)" stroke={C.red} strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </Card>
  )
}

// ─── Section J2: Walk-Forward Validation Panel ───────────────────────────────

function WalkForwardPanel() {
  const [data, setData] = useState<any>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }
  useEffect(() => () => stopPoll(), [])

  // Load existing results on mount
  useEffect(() => {
    apiFetch('/agent/ml/walkforward').then(d => {
      if (d?.status === 'completed') setData(d)
    }).catch(() => {})
  }, [])

  async function handleRun() {
    setRunning(true)
    setError('')
    try {
      await apiFetch('/agent/ml/walkforward', { method: 'POST' })
      stopPoll()
      pollRef.current = setInterval(async () => {
        try {
          const d = await apiFetch('/agent/ml/walkforward')
          if (d?.status === 'completed') {
            stopPoll()
            setRunning(false)
            setData(d)
          } else if (d?.status === 'error') {
            stopPoll()
            setRunning(false)
            setError(d.error || 'Validation failed')
          }
        } catch { /* keep polling */ }
      }, 3000)
    } catch (e: any) {
      setRunning(false)
      setError(e?.detail || 'Failed to start')
    }
  }

  const folds: any[] = data?.folds || []
  const topFeatures: any[] = data?.top_features || []
  const oos = data?.overall_oos_accuracy
  const baseline = data?.baseline_accuracy
  const lift = data?.lift_over_baseline
  const f1 = data?.overall_oos_f1

  const featureChartData = topFeatures.map(f => ({
    name: f.feature.replace(/_/g, ' '),
    value: Math.round(f.importance * 1000) / 10,
  }))

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <SectionTitle style={{ margin: 0 }}>ML Walk-Forward Validation</SectionTitle>
        <button
          onClick={handleRun}
          disabled={running}
          style={{
            padding: '7px 16px', borderRadius: '8px',
            border: `1px solid ${C.purple}44`,
            background: running ? 'rgba(168,85,247,0.08)' : 'rgba(168,85,247,0.15)',
            color: C.purple, fontWeight: 700, fontSize: '13px',
            cursor: running ? 'wait' : 'pointer', transition: 'all 0.2s',
          }}
        >
          {running ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
              Validating...
            </span>
          ) : data ? 'Re-Run Validation' : 'Run Walk-Forward'}
        </button>
      </div>

      {error && (
        <div style={{ color: C.red, fontSize: '13px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,68,68,0.08)', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {!data && !running && !error && (
        <EmptyState message="No validation run yet — click 'Run Walk-Forward' to validate the ML model out-of-sample" />
      )}

      {running && !data && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px', color: C.textMuted, fontSize: '13px', gap: '8px' }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
          Training {data?.n_splits || 5} expanding-window folds...
        </div>
      )}

      {data?.mock_data && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', marginBottom: '12px', background: 'rgba(245,158,11,0.08)', border: `1px solid ${C.yellow}33`, fontSize: '12px', color: C.yellow }}>
          Demo mode — trained on synthetic price data. Metrics show model structure, not real predictive power. Run locally for live data.
        </div>
      )}

      {data && (
        <>
          {/* Summary badges */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(168,85,247,0.1)', border: `1px solid ${C.purple}33` }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>OOS Accuracy</div>
              <div style={{ color: C.purple, fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
                {oos !== undefined ? `${(oos * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Baseline</div>
              <div style={{ color: C.textSecondary, fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
                {baseline !== undefined ? `${(baseline * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderRadius: '10px', background: lift > 0 ? 'rgba(0,255,136,0.08)' : 'rgba(255,68,68,0.08)', border: `1px solid ${lift > 0 ? C.green : C.red}33` }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>Lift</div>
              <div style={{ color: lift > 0 ? C.green : C.red, fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
                {lift !== undefined ? `${lift > 0 ? '+' : ''}${(lift * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>OOS F1</div>
              <div style={{ color: C.blue, fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
                {f1 !== undefined ? f1.toFixed(3) : '—'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Fold table */}
            <div>
              <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                Per-Fold OOS Results
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    {['Fold', 'Train', 'Test', 'Accuracy', 'Precision', 'F1'].map(h => (
                      <th key={h} style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', textAlign: h === 'Fold' ? 'left' : 'right', padding: '4px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {folds.map((f, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '6px 8px', color: C.textSecondary, fontWeight: 600 }}>#{f.fold}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textMuted }}>{f.train_samples.toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textMuted }}>{f.test_samples.toLocaleString()}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: f.accuracy > (baseline || 0.5) ? C.green : C.red, fontWeight: 700 }}>
                        {(f.accuracy * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textSecondary }}>{(f.precision * 100).toFixed(1)}%</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.blue }}>{f.f1.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Feature importance bar chart */}
            {featureChartData.length > 0 && (
              <div>
                <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                  Top Signal Features (avg importance ×1000)
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={featureChartData} layout="vertical" margin={{ top: 0, right: 10, left: 90, bottom: 0 }}>
                    <XAxis type="number" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: C.textSecondary, fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip
                      contentStyle={{ background: '#1a1a1a', border: `1px solid ${C.border}`, borderRadius: '8px', fontSize: '12px' }}
                      formatter={(v: any) => [`${v}‰`, 'Importance']}
                    />
                    <Bar dataKey="value" fill={C.purple} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {data.ts && (
            <div style={{ color: C.textMuted, fontSize: '11px', marginTop: '12px' }}>
              Validated {fmtDatetime(data.ts)} · {data.total_samples?.toLocaleString()} total samples · {data.n_splits} folds
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ─── Section K: Institutional Panel ──────────────────────────────────────────

function InstitutionalPanel({ data, loading }: { data: any[]; loading: boolean }) {
  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <SectionTitle style={{ margin: 0 }}>Institutional Signals</SectionTitle>
        <Badge color={C.textMuted}>Refreshes every 60s</Badge>
      </div>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState message="No institutional signal data available" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Ticker', 'Inst. Score', 'Insider Activity', 'Analyst', 'Short %', 'Key Signals'].map((h) => (
                  <th
                    key={h}
                    style={{
                      color: C.textMuted,
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.07em',
                      textAlign: h === 'Ticker' || h === 'Key Signals' ? 'left' : 'center',
                      padding: '6px 10px',
                      borderBottom: `1px solid ${C.border}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row: any, i: number) => {
                const score = row.score ?? 0
                const scoreColor = score > 10 ? C.green : score < -10 ? C.red : C.yellow
                const shortPct = row.short_interest_pct ?? 0
                const shortColor = shortPct > 20 ? C.red : shortPct > 10 ? C.yellow : C.textMuted
                const insiderBuys: number = row.insider_buys ?? 0
                const insiderSells: number = row.insider_sells ?? 0
                const signals: string[] = Array.isArray(row.signals) ? row.signals : []

                return (
                  <tr
                    key={row.ticker || i}
                    style={{
                      borderBottom: `1px solid ${C.border}22`,
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                  >
                    <td style={{ padding: '9px 10px', fontWeight: 700, color: C.textPrimary }}>{row.ticker || '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                      <span style={{ color: scoreColor, fontWeight: 700, fontSize: '13px' }}>
                        {score > 0 ? `+${score}` : score}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {insiderBuys > 0 && (
                          <span style={{ color: C.green, fontWeight: 700, fontSize: '12px' }}>
                            ▲ {insiderBuys}
                          </span>
                        )}
                        {insiderSells > 0 && (
                          <span style={{ color: C.red, fontWeight: 700, fontSize: '12px' }}>
                            ▼ {insiderSells}
                          </span>
                        )}
                        {insiderBuys === 0 && insiderSells === 0 && (
                          <span style={{ color: C.textMuted }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: C.textSecondary }}>
                      {row.analyst_rating || '—'}
                    </td>
                    <td style={{ padding: '9px 10px', textAlign: 'center', color: shortColor, fontWeight: 600 }}>
                      {typeof shortPct === 'number' ? `${shortPct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {signals.length > 0
                          ? signals.map((sig, si) => (
                              <Badge key={si} color={C.purple} bg="rgba(168,85,247,0.1)">
                                {sig}
                              </Badge>
                            ))
                          : <span style={{ color: C.textMuted }}>—</span>
                        }
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── L. Portfolio Risk Card ───────────────────────────────────────────────────

function RiskGauge({ label, value, color, unit = '%', invert = false }: {
  label: string; value: number | null; color: string; unit?: string; invert?: boolean
}) {
  const display = value === null || value === undefined ? '—' : `${value > 0 && unit === '%' ? '' : ''}${value.toFixed(1)}${unit}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ color, fontSize: '22px', fontWeight: 700, fontFamily: 'monospace' }}>
        {display}
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: { level: string; msg: string } }) {
  const color = alert.level === 'danger' ? C.red : C.yellow
  const bg = alert.level === 'danger' ? 'rgba(255,68,68,0.08)' : 'rgba(245,158,11,0.08)'
  const icon = alert.level === 'danger' ? '🔴' : '⚠️'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '8px',
      padding: '8px 12px', borderRadius: '8px', background: bg,
      border: `1px solid ${color}33`, fontSize: '12px', color,
    }}>
      <span>{icon}</span>
      <span>{alert.msg}</span>
    </div>
  )
}

function PortfolioRiskCard({ data, loading }: { data: any; loading: boolean }) {
  const noData = !data || Object.keys(data).length === 0

  const cvar = data?.cvar_pct ?? null
  const varPct = data?.var_pct ?? null
  const worstDay = data?.worst_day_pct ?? null
  const drawdown = data?.drawdown_pct ?? 0
  const cashPct = data?.cash_pct ?? null
  const vix = data?.vix ?? null
  const regime = data?.regime ?? '—'
  const alerts: any[] = data?.alerts ?? []
  const daysAnalyzed = data?.days_analyzed ?? 0
  const totalReturn = data?.total_return_pct ?? 0
  const openLongs = data?.open_longs ?? 0
  const openShorts = data?.open_shorts ?? 0

  // Color coding: CVaR < -3% = red, -1...-3% = yellow, >-1% = green
  const cvarColor = cvar === null ? C.textMuted : cvar < -3 ? C.red : cvar < -1 ? C.yellow : C.green
  const ddColor = drawdown > 10 ? C.red : drawdown > 5 ? C.yellow : C.green
  const cashColor = cashPct !== null && cashPct < 10 ? C.red : cashPct !== null && cashPct < 15 ? C.yellow : C.green
  const vixColor = vix !== null && vix > 27 ? C.red : vix !== null && vix > 20 ? C.yellow : C.green

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>L. Portfolio Risk Report</SectionTitle>

      {loading && noData ? (
        <Spinner />
      ) : (
        <>
          {/* Metrics grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
            gap: '20px',
            marginBottom: alerts.length > 0 ? '20px' : '0',
          }}>
            <RiskGauge label="CVaR 95%" value={cvar} color={cvarColor} />
            <RiskGauge label="VaR 95%" value={varPct} color={cvar === null ? C.textMuted : C.yellow} />
            <RiskGauge label="Worst Day" value={worstDay} color={worstDay !== null && worstDay < -3 ? C.red : C.textSecondary} />
            <RiskGauge label="Drawdown" value={drawdown} color={ddColor} />
            <RiskGauge label="Cash" value={cashPct} color={cashColor} />
            <RiskGauge label="VIX" value={vix} color={vixColor} unit="" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Positions</div>
              <div style={{ color: C.textPrimary, fontSize: '22px', fontWeight: 700, fontFamily: 'monospace' }}>
                <span style={{ color: C.green }}>{openLongs}L</span>
                {' / '}
                <span style={{ color: C.red }}>{openShorts}S</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ color: C.textMuted, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Return</div>
              <div style={{ color: totalReturn >= 0 ? C.green : C.red, fontSize: '22px', fontWeight: 700, fontFamily: 'monospace' }}>
                {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
              </div>
            </div>
          </div>

          {/* Sub-labels row */}
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: alerts.length > 0 ? '16px' : '0' }}>
            <span style={{ fontSize: '11px', color: C.textMuted }}>
              Regime: <b style={{ color: C.textSecondary }}>{regime}</b>
            </span>
            {daysAnalyzed > 0 && (
              <span style={{ fontSize: '11px', color: C.textMuted }}>
                CVaR based on <b style={{ color: C.textSecondary }}>{daysAnalyzed} trading days</b>
              </span>
            )}
            {daysAnalyzed === 0 && (
              <span style={{ fontSize: '11px', color: C.textMuted }}>
                CVaR unavailable — run a cycle first to build returns cache
              </span>
            )}
          </div>

          {/* Risk alerts */}
          {alerts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
            </div>
          )}

          {noData && !loading && (
            <div style={{ color: C.textMuted, fontSize: '13px' }}>No risk data yet — run a cycle first.</div>
          )}
        </>
      )}
    </Card>
  )
}

// ─── Section M: Closed Trades Panel ──────────────────────────────────────────

function ClosedTradesPanel({ data, loading }: { data: any[]; loading: boolean }) {
  const totalPnl = data.reduce((s, t) => s + (t.pnl ?? 0), 0)
  const wins = data.filter((t) => (t.pnl ?? 0) > 0)
  const winRate = data.length > 0 ? (wins.length / data.length) * 100 : 0
  const avgHoldHours = data.length > 0 ? data.reduce((s, t) => s + (t.hold_hours ?? 0), 0) / data.length : 0

  return (
    <Card style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
        <SectionTitle style={{ margin: 0 }}>Closed Trades History</SectionTitle>
        {data.length > 0 && (
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: C.textMuted }}>
              Total P&amp;L: <b style={{ color: totalPnl >= 0 ? C.green : C.red }}>{fmt$(totalPnl)}</b>
            </span>
            <span style={{ fontSize: '12px', color: C.textMuted }}>
              Win rate: <b style={{ color: winRate >= 50 ? C.green : C.red }}>{winRate.toFixed(0)}%</b>
            </span>
            <span style={{ fontSize: '12px', color: C.textMuted }}>
              Avg hold: <b style={{ color: C.textSecondary }}>{avgHoldHours < 24 ? `${avgHoldHours.toFixed(0)}h` : `${(avgHoldHours / 24).toFixed(1)}d`}</b>
            </span>
            <Badge color={C.textMuted}>{data.length} trades</Badge>
          </div>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : data.length === 0 ? (
        <EmptyState message="No closed trades yet — paper trades will appear here after exiting a position" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Ticker', 'Side', 'Style', 'Entry Price', 'Exit Price', 'Qty', 'P&L $', 'P&L %', 'Hold', 'Exit Reason', 'Closed At'].map((h) => (
                  <th key={h} style={{
                    color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.07em', textAlign: h === 'Ticker' || h === 'Exit Reason' ? 'left' : 'right',
                    padding: '6px 8px', borderBottom: `1px solid ${C.border}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((t: any, i: number) => {
                const pnl = t.pnl ?? 0
                const pnlPct = t.pnl_pct ?? 0
                const isWin = pnl > 0
                const style = (t.trade_style || '') as string
                const styleColor = style === 'DAY_TRADE' ? C.blue : style === 'POSITION_TRADE' ? C.purple : style === 'SWING_TRADE' ? C.yellow : C.textMuted
                const holdDisplay = t.hold_hours != null
                  ? t.hold_hours < 24 ? `${t.hold_hours.toFixed(0)}h` : `${t.hold_days?.toFixed(1)}d`
                  : '—'
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                  >
                    <td style={{ padding: '8px 8px', fontWeight: 700, color: C.textPrimary }}>{t.ticker}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      <Badge color={t.side === 'LONG' ? C.green : C.red} bg={t.side === 'LONG' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)'}>
                        {t.side}
                      </Badge>
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                      {style ? <Badge color={styleColor} bg={`${styleColor}15`}>{style === 'DAY_TRADE' ? 'DAY' : style === 'SWING_TRADE' ? 'SWING' : style === 'POSITION_TRADE' ? 'POS' : style}</Badge>
                        : <span style={{ color: C.textMuted }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textSecondary }}>{t.entry_price ? fmt$(t.entry_price) : '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textSecondary }}>{t.close_price ? fmt$(t.close_price) : '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textMuted }}>{t.qty ?? '—'}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: isWin ? C.green : C.red, fontWeight: 700 }}>{fmt$(pnl)}</td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: isWin ? C.green : C.red }}>
                      {pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textMuted, fontSize: '11px' }}>{holdDisplay}</td>
                    <td style={{ padding: '8px 8px', color: C.textSecondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.reason || '—'}
                    </td>
                    <td style={{ padding: '8px 8px', textAlign: 'right', color: C.textMuted, fontSize: '11px', whiteSpace: 'nowrap' }}>
                      {t.close_ts ? fmtDatetime(t.close_ts) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

// ─── Section N: Attribution Panel ────────────────────────────────────────────

function AttributionPanel({ data, loading }: { data: any; loading: boolean }) {
  const byTag: Record<string, any> = data?.by_tag ?? {}
  const byStrategy: Record<string, any> = data?.by_strategy ?? {}
  const records: any[] = data?.records ?? []

  const tagRows = Object.entries(byTag)
    .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))
    .slice(0, 15)

  const stratRows = Object.entries(byStrategy)
    .sort((a, b) => (b[1].count ?? 0) - (a[1].count ?? 0))

  const hasData = records.length > 0

  return (
    <Card style={{ marginBottom: '20px' }}>
      <SectionTitle>Performance Attribution</SectionTitle>

      {loading ? (
        <Spinner />
      ) : !hasData ? (
        <EmptyState message="No attribution data yet — the agent records win rates by indicator and strategy as trades close" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* By Indicator Tag */}
          <div>
            <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
              Win Rate by Indicator Signal
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Signal', 'Trades', 'Win Rate', 'Avg P&L %'].map((h) => (
                    <th key={h} style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', textAlign: h === 'Signal' ? 'left' : 'right', padding: '4px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tagRows.map(([tag, s]: [string, any]) => {
                  const wr = (s.win_rate ?? 0) * 100
                  return (
                    <tr key={tag} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: C.textSecondary }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: wr >= 55 ? C.green : wr >= 45 ? C.yellow : C.red, marginRight: '6px' }} />
                        {tag}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.textMuted }}>{s.count ?? 0}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: wr >= 55 ? C.green : wr >= 45 ? C.yellow : C.red, fontWeight: 700 }}>
                        {wr.toFixed(0)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: (s.avg_pnl ?? 0) >= 0 ? C.green : C.red }}>
                        {(s.avg_pnl ?? 0) >= 0 ? '+' : ''}{(s.avg_pnl ?? 0).toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* By Strategy */}
          <div>
            <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
              Win Rate by Strategy
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {['Strategy', 'W', 'L', 'Win Rate', 'Avg P&L %'].map((h) => (
                    <th key={h} style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', textAlign: h === 'Strategy' ? 'left' : 'right', padding: '4px 8px', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stratRows.map(([strat, s]: [string, any]) => {
                  const wr = (s.win_rate ?? 0) * 100
                  return (
                    <tr key={strat} style={{ borderBottom: `1px solid ${C.border}22` }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: C.textSecondary }}>{strat}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.green }}>{s.wins ?? 0}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.red }}>{s.losses ?? 0}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: wr >= 55 ? C.green : wr >= 45 ? C.yellow : C.red, fontWeight: 700 }}>
                        {wr.toFixed(0)}%
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: (s.avg_pnl ?? 0) >= 0 ? C.green : C.red }}>
                        {(s.avg_pnl ?? 0) >= 0 ? '+' : ''}{(s.avg_pnl ?? 0).toFixed(2)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Recent trades minilist */}
            {records.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ color: C.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                  Recent Attributed Trades
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {records.slice(0, 6).map((r: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)' }}>
                      <span style={{ fontWeight: 700, color: C.textPrimary, minWidth: '60px' }}>{r.ticker}</span>
                      <span style={{ color: C.textMuted, fontSize: '11px', flex: 1, marginLeft: '8px' }}>{r.strategy || '—'} · {r.trade_style || '—'}</span>
                      <span style={{ color: (r.pnl_pct ?? 0) >= 0 ? C.green : C.red, fontWeight: 700, fontSize: '12px' }}>
                        {(r.pnl_pct ?? 0) >= 0 ? '+' : ''}{(r.pnl_pct ?? 0).toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

// ─── Main AgentDashboard Component ───────────────────────────────────────────

export default function AgentDashboard() {
  // Status data
  const [status, setStatus] = useState<any>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState('')

  // Individual data states
  const [decisions, setDecisions] = useState<any[]>([])
  const [decisionsLoading, setDecisionsLoading] = useState(true)

  const [portfolio, setPortfolio] = useState<any>(null)
  const [portfolioLoading, setPortfolioLoading] = useState(true)

  const [pnlData, setPnlData] = useState<any[]>([])
  const [pnlLoading, setPnlLoading] = useState(true)

  const [strategies, setStrategies] = useState<any[]>([])
  const [strategiesLoading, setStrategiesLoading] = useState(true)

  const [hourly, setHourly] = useState<any[]>([])
  const [hourlyLoading, setHourlyLoading] = useState(true)

  const [agentLog, setAgentLog] = useState<any[]>([])
  const [logLoading, setLogLoading] = useState(true)

  const [regimeData, setRegimeData] = useState<any>(null)
  const [regimeLoading, setRegimeLoading] = useState(true)

  const [institutionalData, setInstitutionalData] = useState<any[]>([])
  const [institutionalLoading, setInstitutionalLoading] = useState(true)

  const [riskData, setRiskData] = useState<any>(null)
  const [riskLoading, setRiskLoading] = useState(true)

  const [closedTrades, setClosedTrades] = useState<any[]>([])
  const [closedLoading, setClosedLoading] = useState(true)

  const [attributionData, setAttributionData] = useState<any>(null)
  const [attributionLoading, setAttributionLoading] = useState(true)

  const [toggling, setToggling] = useState(false)
  const [toggleMsg, setToggleMsg] = useState('')

  const [sellAllLoading, setSellAllLoading] = useState(false)
  const [showSellModal, setShowSellModal] = useState(false)
  const [selectedTradeStyle, setSelectedTradeStyle] = useState<string | null>(null)

  // Fetch functions
  const fetchStatus = useCallback(async () => {
    try {
      const [statusData, macrosData] = await Promise.allSettled([
        apiFetch('/agent/status'),
        apiFetch('/macros'),
      ])
      const s = statusData.status === 'fulfilled' ? statusData.value : null
      const m = macrosData.status === 'fulfilled' ? macrosData.value : null
      setStatus(s ? { ...s, macros: m } : null)
      setStatusError(s ? '' : 'Agent status unavailable')
    } catch {
      setStatusError('Failed to connect to agent')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchDecisions = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/decisions?limit=20')
      setDecisions(Array.isArray(data) ? data : [])
    } catch {
      setDecisions([])
    } finally {
      setDecisionsLoading(false)
    }
  }, [])

  const fetchPortfolio = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/paper/portfolio')
      setPortfolio(data)
    } catch {
      setPortfolio(null)
    } finally {
      setPortfolioLoading(false)
    }
  }, [])

  const fetchPnl = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/analytics/pnl')
      setPnlData(Array.isArray(data) ? data : [])
    } catch {
      setPnlData([])
    } finally {
      setPnlLoading(false)
    }
  }, [])

  const fetchStrategies = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/analytics/strategies')
      setStrategies(Array.isArray(data) ? data : [])
    } catch {
      setStrategies([])
    } finally {
      setStrategiesLoading(false)
    }
  }, [])

  const fetchHourly = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/analytics/hourly')
      setHourly(Array.isArray(data) ? data : [])
    } catch {
      setHourly([])
    } finally {
      setHourlyLoading(false)
    }
  }, [])

  const fetchLog = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/log?limit=50')
      setAgentLog(Array.isArray(data) ? data : [])
    } catch {
      setAgentLog([])
    } finally {
      setLogLoading(false)
    }
  }, [])

  const fetchRegime = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/regime')
      setRegimeData(data || null)
    } catch {
      setRegimeData(null)
    } finally {
      setRegimeLoading(false)
    }
  }, [])

  const fetchInstitutional = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/institutional')
      setInstitutionalData(Array.isArray(data) ? data : [])
    } catch {
      setInstitutionalData([])
    } finally {
      setInstitutionalLoading(false)
    }
  }, [])

  const fetchRisk = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/risk/report')
      setRiskData(data || null)
    } catch {
      setRiskData(null)
    } finally {
      setRiskLoading(false)
    }
  }, [])

  const fetchClosedTrades = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/paper/closed?limit=100')
      setClosedTrades(Array.isArray(data) ? data : [])
    } catch {
      setClosedTrades([])
    } finally {
      setClosedLoading(false)
    }
  }, [])

  const fetchAttribution = useCallback(async () => {
    try {
      const data = await apiFetch('/agent/attribution?limit=200')
      setAttributionData(data || null)
    } catch {
      setAttributionData(null)
    } finally {
      setAttributionLoading(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    fetchStatus()
    fetchDecisions()
    fetchPortfolio()
    fetchPnl()
    fetchStrategies()
    fetchHourly()
    fetchLog()
    fetchRegime()
    fetchInstitutional()
    fetchRisk()
    fetchClosedTrades()
    fetchAttribution()
  }, [])

  // Auto-refresh intervals
  useInterval(fetchStatus, 5000)
  useInterval(fetchDecisions, 15000)
  useInterval(fetchPortfolio, 15000)
  useInterval(fetchPnl, 30000)
  useInterval(fetchStrategies, 60000)
  useInterval(fetchHourly, 60000)
  useInterval(fetchLog, 30000)
  useInterval(fetchRegime, 30000)
  useInterval(fetchInstitutional, 60000)
  useInterval(fetchRisk, 30000)
  useInterval(fetchClosedTrades, 30000)
  useInterval(fetchAttribution, 60000)

  async function handleToggle() {
    if (!status) return
    setToggling(true)
    setToggleMsg('')
    try {
      const endpoint = status.running ? '/agent/stop' : '/agent/start'
      const res = await apiFetch(endpoint, { method: 'POST' })
      setToggleMsg(res?.message || (status.running ? 'Agent stopped' : 'Agent started'))
      await fetchStatus()
    } catch (err: any) {
      setToggleMsg(err?.detail || err?.message || 'Toggle failed')
    } finally {
      setToggling(false)
    }
  }

  async function handleSellAll(tradeStyle?: string | null) {
    setSellAllLoading(true)
    try {
      const params = tradeStyle ? `?trade_style=${tradeStyle}` : ''
      const res = await apiFetch(`/agent/sell-all${params}`, { method: 'POST' })
      setToggleMsg(res?.message || 'Sell-all executed')
      setShowSellModal(false)
      setSelectedTradeStyle(null)
      setTimeout(() => {
        fetchStatus()
        fetchPortfolio()
      }, 500)
    } catch (err: any) {
      setToggleMsg(err?.detail || err?.message || 'Sell-all failed')
      setShowSellModal(false)
    } finally {
      setSellAllLoading(false)
    }
  }

  function openSellModal() {
    setShowSellModal(true)
    setSelectedTradeStyle(null)
  }

  function confirmSellAll() {
    if (selectedTradeStyle === null) {
      alert('Please select an option')
      return
    }
    handleSellAll(selectedTradeStyle === 'ALL' ? null : selectedTradeStyle)
  }

  async function handleSaveConfig(updates: any) {
    await apiFetch('/agent/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    await fetchStatus()
  }

  // Merge portfolio: prefer dedicated endpoint, fall back to status
  const activePortfolio = portfolio ?? status?.paper_portfolio ?? null

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100%',
        padding: '0',
        color: C.textPrimary,
        fontFamily: 'inherit',
      }}
    >
      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulseCrisis {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,68,68,0.7); }
          50% { box-shadow: 0 0 0 8px rgba(255,68,68,0); }
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 4px' }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: C.textPrimary }}>
              Agent Workspace
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.textMuted }}>
              Autonomous trading agent — real-time monitoring, decisions & analytics
            </p>
          </div>
          {toggleMsg && (
            <div
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                background: 'rgba(59,130,246,0.1)',
                border: `1px solid rgba(59,130,246,0.2)`,
                color: C.blue,
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {toggleMsg}
            </div>
          )}
        </div>

        {/* A. Live Status Bar */}
        {statusLoading ? (
          <Card style={{ marginBottom: '20px' }}><Spinner /></Card>
        ) : statusError ? (
          <Card style={{ marginBottom: '20px', borderColor: `${C.red}33`, background: 'rgba(255,68,68,0.04)' }}>
            <div style={{ color: C.red, fontSize: '13px', fontWeight: 600 }}>{statusError}</div>
            <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '4px' }}>
              Backend may be offline. Retrying every 5 seconds.
            </div>
          </Card>
        ) : (
          <LiveStatusBar status={status} onToggle={handleToggle} onOpenSellModal={openSellModal} toggling={toggling} sellAllLoading={sellAllLoading} regimeData={regimeData} />
        )}

        {/* Last Cycle Summary */}
        {status?.last_summary && <LastCycleSummary summary={status.last_summary} />}

        {/* Agent Widget Suite */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '20px' }}>
          <AgentSettingsWidget />
          <AgentTrainingStatusWidget />
          <AgentPerformanceWidget />
          <AgentDecisionsWidget />
          <AgentBacktestResultsWidget />
        </div>

        {/* C. Activity Summary */}
        <ActivitySummary status={status} decisions={decisions} />

        {/* B. P&L Chart */}
        <PnlChart data={pnlData} loading={pnlLoading} />

        {/* Two-column layout for positions + strategies */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '0' }}>
          {/* D. Open Positions */}
          <div>
            <OpenPositionsTable portfolio={activePortfolio} loading={portfolioLoading && !activePortfolio} />
          </div>

          {/* E. Strategy Performance */}
          <div>
            <StrategyPerformance data={strategies} loading={strategiesLoading} />
          </div>
        </div>

        {/* F. Decision Log */}
        <DecisionLog decisions={decisions} loading={decisionsLoading} />

        {/* G. Hourly Breakdown */}
        <HourlyBreakdown data={hourly} loading={hourlyLoading} />

        {/* H. Quick Config */}
        <QuickConfigPanel config={status?.config} onSave={handleSaveConfig} />

        {/* Agent Log */}
        <AgentLog log={agentLog} loading={logLoading} />

        {/* I. Regime Panel */}
        <RegimePanel data={regimeData} loading={regimeLoading} />

        {/* J. Backtest Panel (with SPY benchmark) */}
        <BacktestPanel />

        {/* J2. ML Walk-Forward Validation */}
        <WalkForwardPanel />

        {/* K. Institutional Signals */}
        <InstitutionalPanel data={institutionalData} loading={institutionalLoading} />

        {/* L. Portfolio Risk Report */}
        <PortfolioRiskCard data={riskData} loading={riskLoading} />

        {/* M. Closed Trades History */}
        <ClosedTradesPanel data={closedTrades} loading={closedLoading} />

        {/* N. Performance Attribution */}
        <AttributionPanel data={attributionData} loading={attributionLoading} />

        {/* Sell-All Modal */}
        {showSellModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
            }}
            onClick={() => !sellAllLoading && setShowSellModal(false)}
          >
            <div
              style={{
                maxWidth: '500px',
                width: '90%',
                padding: '24px',
                borderRadius: C.radius,
                border: `1px solid ${C.border}`,
                background: C.card,
                color: C.textPrimary,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: C.red }}>
                  🚨 Emergency Sell-All
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: C.textMuted }}>
                  Choose which positions to close immediately at market price
                </p>
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {(() => {
                  const positions = status?.paper_portfolio?.positions || []
                  const dayTradeCount = positions.filter((p: any) => p.trade_style === 'DAY_TRADE').length
                  const swingTradeCount = positions.filter((p: any) => p.trade_style === 'SWING_TRADE').length
                  const positionTradeCount = positions.filter((p: any) => p.trade_style === 'POSITION_TRADE').length
                  const totalCount = positions.length

                  return (
                    <>
                      {totalCount > 0 && (
                        <button
                          onClick={() => setSelectedTradeStyle('ALL')}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: selectedTradeStyle === 'ALL' ? `2px solid ${C.red}` : `1px solid ${C.border}`,
                            background: selectedTradeStyle === 'ALL' ? 'rgba(255,68,68,0.15)' : 'transparent',
                            color: C.textPrimary,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: selectedTradeStyle === 'ALL' ? 700 : 500,
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>Close ALL ({totalCount})</div>
                          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>
                            All open positions regardless of type
                          </div>
                        </button>
                      )}

                      {dayTradeCount > 0 && (
                        <button
                          onClick={() => setSelectedTradeStyle('DAY_TRADE')}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: selectedTradeStyle === 'DAY_TRADE' ? `2px solid ${C.blue}` : `1px solid ${C.border}`,
                            background: selectedTradeStyle === 'DAY_TRADE' ? 'rgba(59,130,246,0.15)' : 'transparent',
                            color: C.textPrimary,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: selectedTradeStyle === 'DAY_TRADE' ? 700 : 500,
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>Close DAY_TRADE ({dayTradeCount})</div>
                          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>
                            Intraday positions only
                          </div>
                        </button>
                      )}

                      {swingTradeCount > 0 && (
                        <button
                          onClick={() => setSelectedTradeStyle('SWING_TRADE')}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: selectedTradeStyle === 'SWING_TRADE' ? `2px solid ${C.yellow}` : `1px solid ${C.border}`,
                            background: selectedTradeStyle === 'SWING_TRADE' ? 'rgba(245,158,11,0.15)' : 'transparent',
                            color: C.textPrimary,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: selectedTradeStyle === 'SWING_TRADE' ? 700 : 500,
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>Close SWING_TRADE ({swingTradeCount})</div>
                          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>
                            Multi-day swing positions
                          </div>
                        </button>
                      )}

                      {positionTradeCount > 0 && (
                        <button
                          onClick={() => setSelectedTradeStyle('POSITION_TRADE')}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            border: selectedTradeStyle === 'POSITION_TRADE' ? `2px solid ${C.purple}` : `1px solid ${C.border}`,
                            background: selectedTradeStyle === 'POSITION_TRADE' ? 'rgba(168,85,247,0.15)' : 'transparent',
                            color: C.textPrimary,
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontWeight: selectedTradeStyle === 'POSITION_TRADE' ? 700 : 500,
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{ fontSize: '14px', fontWeight: 700 }}>Close POSITION_TRADE ({positionTradeCount})</div>
                          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>
                            Long-term position trades
                          </div>
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>

              {/* Confirmation message */}
              {selectedTradeStyle && (
                <div style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'rgba(255,68,68,0.1)',
                  borderLeft: `3px solid ${C.red}`,
                  marginBottom: '20px',
                  fontSize: '12px',
                  color: C.textSecondary,
                }}>
                  ⚠️ All selected positions will be closed at <strong>market price</strong> immediately. This cannot be undone.
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowSellModal(false)}
                  disabled={sellAllLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: `1px solid ${C.border}`,
                    background: 'transparent',
                    color: C.textSecondary,
                    cursor: sellAllLoading ? 'wait' : 'pointer',
                    fontWeight: 600,
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSellAll}
                  disabled={!selectedTradeStyle || sellAllLoading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedTradeStyle ? 'rgba(255,68,68,0.2)' : 'rgba(255,68,68,0.05)',
                    color: selectedTradeStyle ? C.red : C.textMuted,
                    cursor: selectedTradeStyle && !sellAllLoading ? 'pointer' : 'not-allowed',
                    fontWeight: 700,
                    fontSize: '13px',
                    transition: 'all 0.2s',
                  }}
                >
                  {sellAllLoading ? 'Closing...' : 'CONFIRM CLOSE'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
