'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, BookOpen, CheckCircle2, Clock, Shield, Target, TrendingDown, TrendingUp, XCircle, Zap } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const pctColor = (v: number) => (v >= 0 ? '#24d18c' : '#ff6375')
const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtDuration = (openTs: string, closeTs?: string | null) => {
  const mins = Math.floor(
    (closeTs ? new Date(closeTs).getTime() : Date.now()) - new Date(openTs).getTime()
  ) / 60000
  if (mins < 60) return `${Math.round(mins)}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`
  return `${Math.floor(mins / 1440)}d`
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useAgentFull() {
  const [data, setData] = useState({
    status: null as any,
    portfolio: null as any,
    trades: [] as any[],
    pnlHistory: [] as any[],
    backtest: null as any,
    regime: null as any,
    risk: null as any,
  })

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API}/agent/status`).then(r => r.json()),
      fetch(`${API}/agent/paper/portfolio`).then(r => r.json()),
      fetch(`${API}/agent/paper/trades`).then(r => r.json()),
      fetch(`${API}/agent/analytics/pnl`).then(r => r.json()),
      fetch(`${API}/agent/backtest/results`).then(r => r.json()),
      fetch(`${API}/agent/regime`).then(r => r.json()),
      fetch(`${API}/agent/risk/report`).then(r => r.json()),
    ]).then(([status, portfolio, trades, pnl, backtest, regime, risk]) => {
      setData({
        status: status.status === 'fulfilled' ? status.value : null,
        portfolio: portfolio.status === 'fulfilled' ? portfolio.value : null,
        trades: trades.status === 'fulfilled' && Array.isArray(trades.value) ? trades.value : [],
        pnlHistory: pnl.status === 'fulfilled' && Array.isArray(pnl.value) ? pnl.value : [],
        backtest: backtest.status === 'fulfilled' && backtest.value?.status === 'completed' ? backtest.value : null,
        regime: regime.status === 'fulfilled' ? regime.value : null,
        risk: risk.status === 'fulfilled' ? risk.value : null,
      })
    })
  }, [])

  return data
}

// ─── SVG Sparkline ────────────────────────────────────────────────────────────

function Spark({ values, color = '#24d18c', w = 80, h = 32 }: {
  values: number[]; color?: string; w?: number; h?: number
}) {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

// ─── MC fan chart ─────────────────────────────────────────────────────────────

function MCChart({ paths, actual }: { paths: any; actual: number[] }) {
  const W = 320, H = 90
  if (!paths) return null

  const sample = (arr: number[]) => arr.filter((_, i) => i % 20 === 0)
  const p5  = sample(paths.p5  ?? [])
  const p50 = sample(paths.p50 ?? [])
  const p95 = sample(paths.p95 ?? [])

  const allVals = [...p5, ...p50, ...p95, 0]
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals, 1)
  const range = maxV - minV || 1

  const toPolyline = (vals: number[]) =>
    vals.map((v, i) =>
      `${(i / Math.max(vals.length - 1, 1)) * W},${H - ((v - minV) / range) * H}`
    ).join(' ')

  const zeroY = H - ((0 - minV) / range) * H

  return (
    <svg width="100%" height={H + 20} viewBox={`-4 0 ${W + 8} ${H + 20}`} style={{ display: 'block' }}>
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(148,163,184,.2)" strokeDasharray="4,3" />
      {p95.length > 1 && <polyline points={toPolyline(p95)} fill="none" stroke="rgba(36,209,140,.3)" strokeWidth="1" />}
      {p50.length > 1 && <polyline points={toPolyline(p50)} fill="none" stroke="rgba(96,165,250,.6)" strokeWidth="1.5" strokeDasharray="5,3" />}
      {p5.length > 1 && <polyline points={toPolyline(p5)} fill="none" stroke="rgba(255,99,117,.3)" strokeWidth="1" />}
      {actual.length >= 2 && (
        <polyline points={toPolyline(actual)} fill="none" stroke="#24d18c" strokeWidth="2" strokeLinejoin="round" />
      )}
      <text x="0" y={H + 16} fontSize="9" fill="rgba(148,163,184,.5)">Start</text>
      <text x={W / 2 - 18} y={H + 16} fontSize="9" fill="rgba(96,165,250,.6)">── median</text>
      <text x={W - 20} y={H + 16} fontSize="9" fill="rgba(148,163,184,.5)">End</text>
    </svg>
  )
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: '#0b1119', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(148,163,184,.12)' }}>
      <div style={{ fontSize: 10, color: '#8fa2b5', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: color ?? '#eef4fb' }}>{value}</div>
    </div>
  )
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ status, portfolio, pnlHistory, regime, backtest, risk }: any) {
  const val    = portfolio?.total_value ?? 100000
  const ret    = portfolio?.total_return_pct ?? 0
  const running = status?.running ?? false
  const mcPaths = backtest?.summary?.monte_carlo?.paths
  const actual  = pnlHistory.map((p: any) => p.total_return_pct as number)

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Status + engine */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999,
          background: running ? 'rgba(36,209,140,.15)' : 'rgba(148,163,184,.1)',
          color: running ? '#24d18c' : '#8fa2b5', fontSize: 12, fontWeight: 700,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: running ? '#24d18c' : '#8fa2b5',
            boxShadow: running ? '0 0 6px #24d18c' : 'none',
            animation: running ? 'pulse 2s infinite' : 'none',
          }} />
          {running ? 'RUNNING' : 'STOPPED'}
        </span>
        <span style={{ fontSize: 11, color: '#8fa2b5' }}>{status?.mode ?? 'paper'}</span>
        <span style={{ fontSize: 10, color: '#4a5568' }}>{status?.engine}</span>
      </div>

      {/* Hero */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#8fa2b5', marginBottom: 2 }}>Portfolio Value</div>
        <div style={{ fontSize: 34, fontWeight: 700, color: '#eef4fb', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
          {fmt$(val)}
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: pctColor(ret), marginTop: 2 }}>
          {fmtPct(ret)}
          <span style={{ fontSize: 12, color: '#8fa2b5', fontWeight: 400, marginLeft: 6 }}>from $100k initial</span>
        </div>
      </div>

      {/* Stats 2×2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
        <StatCell label="Realized P&L"   value={fmt$(portfolio?.realized_pnl ?? 0)}   color={pctColor(portfolio?.realized_pnl ?? 0)} />
        <StatCell label="Unrealized P&L" value={fmt$(portfolio?.unrealized_pnl ?? 0)} color={pctColor(portfolio?.unrealized_pnl ?? 0)} />
        <StatCell label="Cash"           value={fmt$(portfolio?.cash ?? 0)} />
        <StatCell label="Open Positions" value={String((portfolio?.positions ?? []).length)} />
      </div>

      {/* Equity / MC chart */}
      <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(148,163,184,.12)', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#8fa2b5', marginBottom: 2 }}>
          {mcPaths ? 'Equity + Monte Carlo Fan (1 000 paths)' : 'Equity Curve'}
        </div>
        {!mcPaths && actual.length < 2 ? (
          <div style={{ fontSize: 12, color: '#4a5568', padding: '20px 0', textAlign: 'center' }}>
            Run more cycles to build history
          </div>
        ) : (
          <MCChart paths={mcPaths} actual={actual} />
        )}
        {mcPaths && (
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' as const }}>
            {[
              { label: 'Bear P5',  v: backtest?.summary?.monte_carlo?.final_return_pct?.p5,  color: '#ff6375' },
              { label: 'Median',   v: backtest?.summary?.monte_carlo?.final_return_pct?.p50, color: '#60a5fa' },
              { label: 'Bull P95', v: backtest?.summary?.monte_carlo?.final_return_pct?.p95, color: '#24d18c' },
            ].map(c => (
              <div key={c.label} style={{ fontSize: 11 }}>
                <span style={{ color: '#8fa2b5' }}>{c.label} </span>
                <span style={{ fontWeight: 700, color: c.color }}>+{Number(c.v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Risk summary */}
      {risk && (
        <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(148,163,184,.12)', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 600, marginBottom: 10 }}>RISK SNAPSHOT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatCell label="Drawdown" value={`${(risk.drawdown_pct ?? 0).toFixed(1)}%`} color={risk.drawdown_pct < -5 ? '#ff6375' : '#eef4fb'} />
            <StatCell label="Cash %" value={`${(risk.cash_pct ?? 0).toFixed(0)}%`} />
            {risk.alerts?.length > 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                {(risk.alerts as string[]).map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: '#fbbf24',
                    padding: '6px 8px', borderRadius: 8, background: 'rgba(251,191,36,.08)', marginBottom: 4,
                  }}>
                    <AlertTriangle size={12} /> {a}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regime banner */}
      {regime && (
        <div style={{ background: '#0b1119', borderRadius: 14, padding: '12px', border: '1px solid rgba(96,165,250,.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(96,165,250,.15)', color: '#60a5fa' }}>
              {regime.regime?.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 12, color: '#8fa2b5' }}>VIX {regime.vix?.toFixed(1)} · {regime.confidence?.toFixed(0)}% conf</span>
          </div>
          <div style={{ fontSize: 12, color: '#8fa2b5', marginTop: 6, lineHeight: 1.4 }}>{regime.config?.description}</div>
        </div>
      )}
    </div>
  )
}

// ─── Live positions tab ───────────────────────────────────────────────────────

function LiveTab({ portfolio, trades }: any) {
  const positions: any[] = portfolio?.positions ?? []
  const openTrades: any[] = trades.filter((t: any) => !t.closed)

  if (positions.length === 0) {
    return (
      <div style={{ padding: '50px 0', textAlign: 'center' }}>
        <Activity size={36} style={{ color: '#8fa2b5', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
        <div style={{ fontSize: 14, color: '#8fa2b5' }}>No open positions</div>
        <div style={{ fontSize: 12, color: '#4a5568', marginTop: 4 }}>Agent is waiting for a high-confidence signal</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 0' }}>
      {positions.map((pos: any) => {
        const t = openTrades.find((x: any) => x.ticker === pos.ticker)
        const rr = pos.target && pos.stop_loss && pos.avg_price
          ? ((pos.target - pos.avg_price) / Math.abs(pos.avg_price - pos.stop_loss)).toFixed(1)
          : null
        const isLong = pos.side === 'LONG'

        return (
          <div key={pos.ticker} style={{
            background: '#0b1119', borderRadius: 16, padding: '14px',
            border: `1px solid ${isLong ? 'rgba(36,209,140,.2)' : 'rgba(255,99,117,.2)'}`,
            marginBottom: 10,
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: isLong ? 'rgba(36,209,140,.15)' : 'rgba(255,99,117,.15)',
                display: 'grid', placeItems: 'center',
                fontSize: 13, fontWeight: 800,
                color: isLong ? '#24d18c' : '#ff6375',
              }}>
                {pos.ticker.slice(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#eef4fb' }}>{pos.ticker}</div>
                <div style={{ fontSize: 11, color: '#8fa2b5' }}>{pos.qty} shares · avg ${pos.avg_price?.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                  background: isLong ? 'rgba(36,209,140,.15)' : 'rgba(255,99,117,.15)',
                  color: isLong ? '#24d18c' : '#ff6375',
                }}>{pos.side}</span>
                {t && (
                  <div style={{ fontSize: 10, color: '#8fa2b5', marginTop: 3 }}>
                    {t.confidence}% conf
                  </div>
                )}
              </div>
            </div>

            {/* Entry / Stop / Target */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
              {[
                { label: 'Entry', value: `$${pos.avg_price?.toFixed(2)}`, color: '#eef4fb' },
                { label: 'Stop Loss', value: `$${pos.stop_loss?.toFixed(2)}`, color: '#ff6375' },
                { label: 'Target', value: `$${pos.target?.toFixed(2)}`, color: '#24d18c' },
              ].map(c => (
                <div key={c.label} style={{
                  background: '#050608', borderRadius: 10, padding: '8px', textAlign: 'center',
                  border: '1px solid rgba(148,163,184,.08)',
                }}>
                  <div style={{ fontSize: 9, color: '#8fa2b5', marginBottom: 3 }}>{c.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* P&L + R:R */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <span style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                background: pos.unrealized_pnl >= 0 ? 'rgba(36,209,140,.15)' : 'rgba(255,99,117,.15)',
                color: pctColor(pos.unrealized_pnl),
              }}>
                {fmt$(pos.unrealized_pnl)} ({fmtPct(pos.unrealized_pct ?? 0)})
              </span>
              {rr && (
                <span style={{ fontSize: 12, color: '#8fa2b5' }}>R:R {rr}×</span>
              )}
            </div>

            {/* Why it opened */}
            {t?.reason && (
              <div style={{
                fontSize: 12, color: '#94a3b8', lineHeight: 1.5,
                padding: '8px 12px', borderRadius: 10,
                background: 'rgba(96,165,250,.06)', borderLeft: '3px solid #3b82f6',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 10, color: '#60a5fa', display: 'block', marginBottom: 2, fontWeight: 600 }}>
                  WHY OPENED
                </span>
                {t.reason}
              </div>
            )}

            {/* Time open */}
            {t?.ts && (
              <div style={{ fontSize: 11, color: '#4a5568', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} />
                Open {fmtDuration(t.ts)} · since {fmtDate(t.ts)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Trade row (history) ──────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: any }) {
  const [expanded, setExpanded] = useState(false)
  const isClosed = !!trade.closed
  const pnl = trade.pnl ?? 0
  const side = trade.action === 'BUY' || trade.action === 'COVER' ? 'LONG' : 'SHORT'
  const entryVal = trade.qty * trade.price
  const pnlPct = entryVal ? ((pnl / entryVal) * 100) : 0

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: '#0b1119', borderRadius: 14, padding: '12px',
        border: '1px solid rgba(148,163,184,.1)', marginBottom: 8, cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Ticker avatar */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: side === 'LONG' ? 'rgba(36,209,140,.15)' : 'rgba(255,99,117,.15)',
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 800, color: side === 'LONG' ? '#24d18c' : '#ff6375',
        }}>
          {trade.ticker.slice(0, 2)}
        </div>

        {/* Ticker + date */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#eef4fb' }}>
            {trade.ticker}
            <span style={{ fontSize: 11, color: side === 'LONG' ? '#24d18c' : '#ff6375', marginLeft: 6 }}>
              {side}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#8fa2b5' }}>
            {fmtDate(trade.ts)} · {trade.qty} @ ${trade.price.toFixed(2)}
          </div>
        </div>

        {/* P&L or OPEN badge */}
        {isClosed ? (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: pctColor(pnl) }}>{fmt$(pnl)}</div>
            <div style={{ fontSize: 10, color: pctColor(pnlPct) }}>{fmtPct(pnlPct)}</div>
          </div>
        ) : (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600, background: 'rgba(96,165,250,.15)', color: '#60a5fa' }}>
            OPEN
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,.1)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Entry',     value: `$${trade.price.toFixed(2)}` },
              isClosed && trade.close_price
                ? { label: 'Exit', value: `$${trade.close_price.toFixed(2)}`, color: pctColor(pnl) }
                : { label: 'Target', value: trade.target ? `$${trade.target.toFixed(2)}` : '—', color: '#24d18c' },
              { label: 'Stop Loss', value: trade.stop_loss ? `$${trade.stop_loss.toFixed(2)}` : '—', color: '#ff6375' },
              { label: 'Hold time', value: isClosed ? fmtDuration(trade.ts, trade.close_ts) : fmtDuration(trade.ts) },
            ].filter(Boolean).map((c: any) => (
              <div key={c.label}>
                <div style={{ fontSize: 10, color: '#8fa2b5', marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: c.color ?? '#eef4fb' }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Why opened */}
          <div style={{
            padding: '8px 12px', borderRadius: 10, marginBottom: 8,
            background: 'rgba(96,165,250,.06)', borderLeft: '3px solid #3b82f6', fontSize: 12, lineHeight: 1.5,
          }}>
            <span style={{ fontSize: 10, color: '#60a5fa', display: 'block', fontWeight: 600, marginBottom: 2 }}>WHY OPENED</span>
            <span style={{ color: '#94a3b8' }}>{trade.reason}</span>
          </div>

          {/* Confidence bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#8fa2b5', flexShrink: 0 }}>Confidence</span>
            <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'rgba(148,163,184,.15)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4,
                width: `${trade.confidence}%`,
                background: trade.confidence >= 75 ? '#24d18c' : trade.confidence >= 65 ? '#fbbf24' : '#ff6375',
              }} />
            </div>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: trade.confidence >= 75 ? '#24d18c' : trade.confidence >= 65 ? '#fbbf24' : '#ff6375',
            }}>{trade.confidence}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ trades }: any) {
  const closed = [...trades.filter((t: any) => t.closed)].sort(
    (a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
  )
  const open = trades.filter((t: any) => !t.closed)

  const wins   = closed.filter((t: any) => (t.pnl ?? 0) > 0).length
  const losses = closed.filter((t: any) => (t.pnl ?? 0) <= 0).length
  const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0)
  const winRate = closed.length ? `${((wins / closed.length) * 100).toFixed(0)}%` : '—'

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <StatCell label="Realized P&L" value={fmt$(totalPnl)}    color={pctColor(totalPnl)} />
        <StatCell label="Win Rate"     value={winRate} />
        <StatCell label="W / L"        value={`${wins} / ${losses}`} />
      </div>

      {/* Open trades */}
      {open.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 700, marginBottom: 8 }}>OPEN TRADES</div>
          {open.map((t: any) => <TradeRow key={t.id} trade={t} />)}
        </>
      )}

      {/* Closed trades */}
      {closed.length === 0 ? (
        <div style={{ padding: '30px 0', textAlign: 'center', color: '#8fa2b5', fontSize: 13 }}>
          No closed trades yet
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 700, marginBottom: 8 }}>
            CLOSED ({closed.length})
          </div>
          {closed.map((t: any) => <TradeRow key={t.id} trade={t} />)}
        </>
      )}
    </div>
  )
}

// ─── Backtest tab ─────────────────────────────────────────────────────────────

function BacktestTab({ backtest }: any) {
  if (!backtest) {
    return (
      <div style={{ padding: '50px 0', textAlign: 'center', color: '#8fa2b5', fontSize: 13 }}>
        <BookOpen size={32} style={{ display: 'block', margin: '0 auto 10px', color: '#4a5568' }} />
        No backtest results — run a backtest first
      </div>
    )
  }

  const strats = [...(backtest.summary?.aggregated_by_strategy ?? [])]
    .filter((s: any) => s.avg_total_return_pct !== 0 || s.avg_trades > 0)
    .sort((a: any, b: any) => b.avg_total_return_pct - a.avg_total_return_pct)

  const spy = backtest.summary?.spy_benchmark
  const mc  = backtest.summary?.monte_carlo
  const mcPaths = mc?.paths

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Period */}
      <div style={{ fontSize: 12, color: '#8fa2b5', marginBottom: 12 }}>
        {backtest.days}d · {backtest.tickers?.length} tickers · {strats.length} strategies tested
      </div>

      {/* Strategy table */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 600, marginBottom: 8 }}>STRATEGY RANKING</div>
        <div style={{ background: '#0b1119', borderRadius: 14, border: '1px solid rgba(148,163,184,.12)', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px', gap: 4, padding: '8px 12px', borderBottom: '1px solid rgba(148,163,184,.1)' }}>
            {['Strategy', 'Return', 'Sharpe', 'Win%'].map(h => (
              <div key={h} style={{ fontSize: 10, color: '#8fa2b5', fontWeight: 600 }}>{h}</div>
            ))}
          </div>

          {strats.map((s: any, i: number) => (
            <div key={s.strategy} style={{
              display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px', gap: 4,
              padding: '10px 12px',
              borderBottom: i < strats.length - 1 ? '1px solid rgba(148,163,184,.06)' : 'none',
              background: i === 0 ? 'rgba(96,165,250,.05)' : 'transparent',
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#60a5fa' : '#eef4fb' }}>
                  {s.strategy.replace(/_/g, ' ')}
                </div>
                {i === 0 && (
                  <div style={{ fontSize: 9, color: '#60a5fa', marginTop: 1 }}>★ BEST</div>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(s.avg_total_return_pct) }}>
                {s.avg_total_return_pct >= 0 ? '+' : ''}{s.avg_total_return_pct.toFixed(0)}%
              </div>
              <div style={{ fontSize: 12, color: s.avg_sharpe >= 1 ? '#24d18c' : s.avg_sharpe >= 0 ? '#fbbf24' : '#ff6375' }}>
                {s.avg_sharpe.toFixed(2)}
              </div>
              <div style={{ fontSize: 12, color: '#eef4fb' }}>
                {s.avg_win_rate.toFixed(0)}%
              </div>
            </div>
          ))}

          {/* SPY benchmark */}
          {spy && (
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 56px 52px 52px', gap: 4,
              padding: '10px 12px', borderTop: '1px solid rgba(148,163,184,.12)',
              background: 'rgba(251,191,36,.04)',
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fbbf24' }}>SPY</div>
                <div style={{ fontSize: 9, color: '#8fa2b5' }}>buy &amp; hold</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(spy.total_return_pct) }}>
                +{spy.total_return_pct?.toFixed(0)}%
              </div>
              <div style={{ fontSize: 12, color: '#fbbf24' }}>{spy.sharpe?.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#8fa2b5' }}>—</div>
            </div>
          )}
        </div>
      </div>

      {/* Monte Carlo */}
      {mc && (
        <div>
          <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 600, marginBottom: 8 }}>
            MONTE CARLO SIMULATION ({(mc.n_paths ?? 0).toLocaleString()} bootstrap paths, {mc.n_bars}d)
          </div>

          {/* MC path chart */}
          {mcPaths && (
            <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(148,163,184,.12)', marginBottom: 10 }}>
              <MCChart paths={mcPaths} actual={[]} />
              <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 11 }}>
                <span style={{ color: '#ff6375' }}>── Bear P5</span>
                <span style={{ color: '#60a5fa' }}>- - Median</span>
                <span style={{ color: '#24d18c' }}>── Bull P95</span>
              </div>
            </div>
          )}

          {/* Percentile cards */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {[
              { label: 'Bear (P5)',  v: mc.final_return_pct?.p5,  color: '#ff6375' },
              { label: 'Base (P50)', v: mc.final_return_pct?.p50, color: '#60a5fa' },
              { label: 'Bull (P95)', v: mc.final_return_pct?.p95, color: '#24d18c' },
            ].map(c => (
              <div key={c.label} style={{
                flex: 1, background: '#0b1119', borderRadius: 12, padding: '10px 8px', textAlign: 'center',
                border: `1px solid ${c.color}30`,
              }}>
                <div style={{ fontSize: 10, color: '#8fa2b5', marginBottom: 3 }}>{c.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: c.color }}>
                  +{Number(c.v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}%
                </div>
              </div>
            ))}
          </div>

          {/* DD + prob loss */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <StatCell
              label="Prob. of Loss"
              value={`${mc.prob_loss_pct?.toFixed(1)}%`}
              color={mc.prob_loss_pct < 5 ? '#24d18c' : '#fbbf24'}
            />
            <StatCell
              label="Max DD (median)"
              value={`${mc.max_drawdown_pct?.median?.toFixed(1)}%`}
              color="#ff6375"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Regime tab ───────────────────────────────────────────────────────────────

function RegimeTab({ regime, status }: any) {
  const cfg  = status?.config ?? {}
  const rCfg = regime?.config ?? {}

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Current regime */}
      <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(96,165,250,.2)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, background: 'rgba(96,165,250,.15)', color: '#60a5fa' }}>
            {regime?.regime?.replace(/_/g, ' ') ?? 'UNKNOWN'}
          </span>
          <span style={{ fontSize: 12, color: '#8fa2b5' }}>
            VIX {regime?.vix?.toFixed(1) ?? '—'}
          </span>
          <span style={{ fontSize: 12, color: '#8fa2b5', marginLeft: 'auto' }}>
            {regime?.confidence?.toFixed(0) ?? '—'}% conf
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 10 }}>
          {rCfg.description ?? 'No description available'}
        </div>
        {/* Active strategies */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {(rCfg.active_long_strategies ?? []).map((s: string) => (
            <span key={s} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: 'rgba(36,209,140,.12)', color: '#24d18c', fontWeight: 600 }}>
              ↑ {s.replace(/_/g, ' ')}
            </span>
          ))}
          {(rCfg.active_short_strategies ?? []).map((s: string) => (
            <span key={s} style={{ padding: '3px 9px', borderRadius: 999, fontSize: 11, background: 'rgba(255,99,117,.12)', color: '#ff6375', fontWeight: 600 }}>
              ↓ {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Multipliers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <StatCell label="Position Size ×" value={`${rCfg.size_multiplier ?? '—'}×`} />
        <StatCell label="Stop Loss ×" value={`${rCfg.stop_mult ?? '—'}×`} />
      </div>

      {/* Risk parameters */}
      <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(148,163,184,.12)', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 600, marginBottom: 10 }}>RISK PARAMETERS</div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          {[
            { label: 'Risk per trade',     value: `${cfg.risk_per_trade_pct ?? '—'}%` },
            { label: 'Max position size',  value: `${cfg.max_position_pct ?? '—'}%` },
            { label: 'Stop loss',          value: `${cfg.stop_loss_pct ?? '—'}%` },
            { label: 'Daily loss limit',   value: `${cfg.daily_loss_limit_pct ?? '—'}%` },
            { label: 'VIX pause at',       value: cfg.vix_pause_threshold ?? '—' },
            { label: 'Min confidence',     value: `${cfg.min_confidence ?? '—'}%` },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: '#8fa2b5' }}>{r.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#eef4fb' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Universe */}
      {cfg.universe?.length > 0 && (
        <div style={{ background: '#0b1119', borderRadius: 14, padding: '14px', border: '1px solid rgba(148,163,184,.12)' }}>
          <div style={{ fontSize: 11, color: '#8fa2b5', fontWeight: 600, marginBottom: 10 }}>
            TRADING UNIVERSE ({cfg.universe.length} tickers)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {(cfg.universe as string[]).map(t => (
              <span key={t} style={{
                padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                background: 'rgba(148,163,184,.1)', color: '#eef4fb', border: '1px solid rgba(148,163,184,.12)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Live', 'History', 'Backtest', 'Regime'] as const
type Tab = typeof TABS[number]

export default function AgentDashboard() {
  const [tab, setTab] = useState<Tab>('Overview')
  const { status, portfolio, trades, pnlHistory, backtest, regime, risk } = useAgentFull()

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, overflow: 'auto', scrollbarWidth: 'none', marginBottom: 8, paddingBottom: 2 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flexShrink: 0, padding: '5px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
            fontWeight: tab === t ? 700 : 500,
            border: `1px solid ${tab === t ? 'rgba(96,165,250,.5)' : 'rgba(148,163,184,.18)'}`,
            background: tab === t ? 'rgba(96,165,250,.12)' : '#0b1119',
            color: tab === t ? '#60a5fa' : '#8fa2b5',
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && <OverviewTab status={status} portfolio={portfolio} pnlHistory={pnlHistory} regime={regime} backtest={backtest} risk={risk} />}
      {tab === 'Live'     && <LiveTab portfolio={portfolio} trades={trades} />}
      {tab === 'History'  && <HistoryTab trades={trades} />}
      {tab === 'Backtest' && <BacktestTab backtest={backtest} />}
      {tab === 'Regime'   && <RegimeTab regime={regime} status={status} />}
    </div>
  )
}
