'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Clock } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
const green = '#30d158', red = '#ff453a', blue = '#0a84ff', yellow = '#ffd60a'
const pctColor = (v: number) => (v >= 0 ? green : red)
const fmtDate = (ts: string) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtDuration = (openTs: string, closeTs?: string | null) => {
  const mins = Math.floor(
    ((closeTs ? new Date(closeTs).getTime() : Date.now()) - new Date(openTs).getTime()) / 60000
  )
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
    ]).then(([s, p, t, pnl, bt, r, risk]) => {
      setData({
        status:     s.status     === 'fulfilled' ? s.value     : null,
        portfolio:  p.status     === 'fulfilled' ? p.value     : null,
        trades:     t.status     === 'fulfilled' && Array.isArray(t.value) ? t.value : [],
        pnlHistory: pnl.status   === 'fulfilled' && Array.isArray(pnl.value) ? pnl.value : [],
        backtest:   bt.status    === 'fulfilled' && bt.value?.status === 'completed' ? bt.value : null,
        regime:     r.status     === 'fulfilled' ? r.value     : null,
        risk:       risk.status  === 'fulfilled' ? risk.value  : null,
      })
    })
  }, [])

  return data
}

// ─── MC Fan chart ─────────────────────────────────────────────────────────────

function MCChart({ paths, actual }: { paths: any; actual: number[] }) {
  const W = 320, H = 88
  if (!paths && actual.length < 2) return null

  const sample = (arr: number[]) => arr.filter((_, i) => i % 18 === 0)
  const p5  = paths ? sample(paths.p5  ?? []) : []
  const p50 = paths ? sample(paths.p50 ?? []) : []
  const p95 = paths ? sample(paths.p95 ?? []) : []

  const allVals = [...p5, ...p50, ...p95, ...actual, 0]
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals, 1)
  const range = maxV - minV || 1

  const pts = (vals: number[]) =>
    vals.length < 2 ? '' :
    vals.map((v, i) =>
      `${(i / Math.max(vals.length - 1, 1)) * W},${H - ((v - minV) / range) * H}`
    ).join(' ')

  const zeroY = H - ((0 - minV) / range) * H

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="gLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={green} stopOpacity="0.6" />
          <stop offset="100%" stopColor={green} stopOpacity="1" />
        </linearGradient>
      </defs>
      <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,.08)" strokeDasharray="4,4" />
      {p95.length > 1 && <polyline points={pts(p95)} fill="none" stroke="rgba(48,209,88,.18)" strokeWidth="1" />}
      {p50.length > 1 && <polyline points={pts(p50)} fill="none" stroke="rgba(10,132,255,.45)" strokeWidth="1.5" strokeDasharray="5,3" />}
      {p5.length  > 1 && <polyline points={pts(p5)}  fill="none" stroke="rgba(255,69,58,.18)"  strokeWidth="1" />}
      {actual.length >= 2 && (
        <polyline points={pts(actual)} fill="none" stroke="url(#gLine)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  )
}

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfBar({ value }: { value: number }) {
  const color = value >= 75 ? green : value >= 65 ? yellow : red
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 3, background: 'rgba(255,255,255,.08)' }}>
        <div style={{ width: `${value}%`, height: '100%', borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32, textAlign: 'right' }}>{value}%</span>
    </div>
  )
}

// ─── Overview ─────────────────────────────────────────────────────────────────

function OverviewTab({ status, portfolio, pnlHistory, regime, backtest }: any) {
  const val     = portfolio?.total_value ?? 100000
  const ret     = portfolio?.total_return_pct ?? 0
  const running = status?.running ?? false
  const mc      = backtest?.summary?.monte_carlo
  const actual  = pnlHistory.map((p: any) => p.total_return_pct as number)

  const stats = [
    { label: 'Realized',  value: fmt$(portfolio?.realized_pnl ?? 0),   color: pctColor(portfolio?.realized_pnl ?? 0) },
    { label: 'Cash',      value: `$${((portfolio?.cash ?? 0) / 1000).toFixed(0)}k`, color: 'rgba(255,255,255,.7)' },
    { label: 'Positions', value: String((portfolio?.positions ?? []).length),        color: 'rgba(255,255,255,.7)' },
    { label: 'Trades',    value: String(portfolio?.trade_count ?? 0),                color: 'rgba(255,255,255,.7)' },
  ]

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: running ? green : 'rgba(255,255,255,.3)',
            boxShadow: running ? `0 0 8px ${green}` : 'none',
            display: 'inline-block',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: running ? green : 'rgba(255,255,255,.4)' }}>
            {running ? 'RUNNING' : 'STOPPED'}
          </span>
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', letterSpacing: '.4px' }}>PAPER MODE</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
          {status?.engine ?? ''}
        </span>
      </div>

      {/* Hero */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.4)', letterSpacing: '.6px', marginBottom: 6, textTransform: 'uppercase' as const }}>
          Portfolio Value
        </div>
        <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1 }}>
          {fmt$(val)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: pctColor(ret) }}>{fmtPct(ret)}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>vs $100k initial</span>
        </div>
      </div>

      {/* Horizontal stats strip */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 24, overflow: 'hidden',
        borderRadius: 16, background: 'rgba(255,255,255,.05)',
        border: '1px solid rgba(255,255,255,.08)',
      }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '13px 0', textAlign: 'center',
            borderRight: i < stats.length - 1 ? '1px solid rgba(255,255,255,.07)' : 'none',
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2, letterSpacing: '.3px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{
        borderRadius: 20, padding: '16px',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.07)',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.5)', letterSpacing: '.3px' }}>
            {mc ? 'EQUITY + MONTE CARLO' : 'EQUITY CURVE'}
          </span>
          {mc && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,.25)' }}>
              {(mc.n_paths ?? 0).toLocaleString()} paths
            </span>
          )}
        </div>

        {!mc && actual.length < 2 ? (
          <div style={{ height: 60, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.2)', fontSize: 12 }}>
            Run more cycles to build history
          </div>
        ) : (
          <>
            <MCChart paths={mc?.paths} actual={actual} />
            {mc && (
              <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.06)' }}>
                {[
                  { l: 'Bear P5',  v: mc.final_return_pct?.p5,  c: red },
                  { l: 'Median',   v: mc.final_return_pct?.p50, c: blue },
                  { l: 'Bull P95', v: mc.final_return_pct?.p95, c: green },
                ].map(x => (
                  <div key={x.l}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{x.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: x.c }}>
                      +{Number(x.v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Regime */}
      {regime && (
        <div style={{
          borderRadius: 16, padding: '14px 16px',
          background: 'rgba(10,132,255,.08)',
          border: '1px solid rgba(10,132,255,.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              padding: '3px 10px', borderRadius: 999,
              background: 'rgba(10,132,255,.2)', color: blue,
              fontSize: 12, fontWeight: 700, letterSpacing: '.4px',
            }}>
              {regime.regime?.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
              VIX {regime.vix?.toFixed(1)} · {regime.confidence?.toFixed(0)}% conf
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', marginTop: 8, lineHeight: 1.4 }}>
            {regime.config?.description}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Live Positions ───────────────────────────────────────────────────────────

function LiveTab({ portfolio, trades }: any) {
  const positions: any[] = portfolio?.positions ?? []
  const openTrades: any[] = trades.filter((t: any) => !t.closed)

  if (positions.length === 0) {
    return (
      <div style={{ paddingTop: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,.7)' }}>No open positions</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.3)', marginTop: 6 }}>
          Agent is waiting for a signal
        </div>
      </div>
    )
  }

  return (
    <div style={{ paddingTop: 4 }}>
      {positions.map((pos: any) => {
        const t = openTrades.find((x: any) => x.ticker === pos.ticker)
        const isLong = pos.side === 'LONG'
        const hasLivePrice = pos.current_price && pos.current_price > 0
        const rr = pos.target && pos.stop_loss && pos.avg_price
          ? ((pos.target - pos.avg_price) / Math.abs(pos.avg_price - pos.stop_loss)).toFixed(1)
          : null

        return (
          <div key={pos.ticker} style={{
            borderRadius: 20, padding: '20px',
            background: 'rgba(255,255,255,.04)',
            border: `1px solid ${isLong ? 'rgba(48,209,88,.2)' : 'rgba(255,69,58,.2)'}`,
            marginBottom: 12,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>
                  {pos.ticker}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>
                  {pos.qty} shares · avg ${pos.avg_price?.toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                  background: isLong ? 'rgba(48,209,88,.15)' : 'rgba(255,69,58,.15)',
                  color: isLong ? green : red,
                  fontSize: 12, fontWeight: 700, letterSpacing: '.4px',
                }}>
                  {pos.side}
                </span>
                {t?.confidence && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 4 }}>
                    {t.confidence}% conf
                  </div>
                )}
              </div>
            </div>

            {/* P&L big number */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', letterSpacing: '.4px', marginBottom: 4 }}>UNREALIZED P&L</div>
              {hasLivePrice ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px', color: pctColor(pos.unrealized_pnl) }}>
                    {fmt$(pos.unrealized_pnl)}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: pctColor(pos.unrealized_pnl) }}>
                    ({fmtPct(pos.unrealized_pct ?? 0)})
                  </span>
                  {rr && <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginLeft: 4 }}>R:R {rr}×</span>}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,.25)' }}>—</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,.2)', background: 'rgba(255,255,255,.05)', padding: '2px 8px', borderRadius: 6 }}>
                    No live price · agent stopped
                  </span>
                  {rr && <span style={{ fontSize: 12, color: 'rgba(255,255,255,.3)' }}>R:R {rr}×</span>}
                </div>
              )}
            </div>

            {/* Price strip */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, borderRadius: 14,
              overflow: 'hidden', background: 'rgba(255,255,255,.05)', marginBottom: 16,
            }}>
              {[
                { l: 'Entry',  v: `$${pos.avg_price?.toFixed(2)}`,                         c: 'rgba(255,255,255,.7)' },
                { l: 'Current', v: hasLivePrice ? `$${pos.current_price?.toFixed(2)}` : '—', c: hasLivePrice ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.2)' },
                { l: 'Target', v: `$${pos.target?.toFixed(2)}`,                             c: green },
              ].map(x => (
                <div key={x.l} style={{ padding: '10px 0', textAlign: 'center', background: 'rgba(0,0,0,.3)' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.3px', marginBottom: 4 }}>{x.l}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: x.c }}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Reason */}
            {t?.reason && (
              <div style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(10,132,255,.08)', borderLeft: `3px solid ${blue}`,
              }}>
                <div style={{ fontSize: 10, color: blue, fontWeight: 700, letterSpacing: '.5px', marginBottom: 4 }}>WHY OPENED</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)', lineHeight: 1.4 }}>{t.reason}</div>
              </div>
            )}

            {/* Time open */}
            {t?.ts && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, color: 'rgba(255,255,255,.25)', fontSize: 12 }}>
                <Clock size={12} />
                Open {fmtDuration(t.ts)} · since {fmtDate(t.ts)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Trade Row (History) ──────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: any }) {
  const [open, setOpen] = useState(false)
  const isClosed = !!trade.closed
  const pnl = trade.pnl ?? 0
  const side = trade.action === 'BUY' || trade.action === 'COVER' ? 'LONG' : 'SHORT'
  const pnlPct = trade.qty * trade.price ? ((pnl / (trade.qty * trade.price)) * 100) : 0

  return (
    <div
      onClick={() => setOpen(e => !e)}
      style={{
        borderRadius: 16, padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
        background: 'rgba(255,255,255,.04)',
        border: '1px solid rgba(255,255,255,.07)',
        transition: 'background .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: side === 'LONG' ? 'rgba(48,209,88,.15)' : 'rgba(255,69,58,.15)',
          display: 'grid', placeItems: 'center',
          fontSize: 13, fontWeight: 800,
          color: side === 'LONG' ? green : red,
        }}>
          {trade.ticker.slice(0, 2)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {trade.ticker}
            <span style={{ fontSize: 12, fontWeight: 600, color: side === 'LONG' ? green : red, marginLeft: 7 }}>
              {side}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>
            {fmtDate(trade.ts)} · {trade.qty} @ ${trade.price.toFixed(2)}
          </div>
        </div>

        {isClosed ? (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: pctColor(pnl) }}>{fmt$(pnl)}</div>
            <div style={{ fontSize: 11, color: pctColor(pnlPct), marginTop: 1 }}>{fmtPct(pnlPct)}</div>
          </div>
        ) : (
          <span style={{
            padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
            background: 'rgba(10,132,255,.15)', color: blue,
          }}>OPEN</span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[
              { l: 'Entry',    v: `$${trade.price.toFixed(2)}` },
              isClosed && trade.close_price
                ? { l: 'Exit',     v: `$${trade.close_price.toFixed(2)}`, c: pctColor(pnl) }
                : { l: 'Target',   v: trade.target ? `$${trade.target.toFixed(2)}` : '—', c: green },
              { l: 'Stop Loss', v: trade.stop_loss ? `$${trade.stop_loss.toFixed(2)}` : '—', c: red },
              { l: 'Hold Time', v: fmtDuration(trade.ts, isClosed ? trade.close_ts : null) },
            ].filter(Boolean).map((x: any) => (
              <div key={x.l}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.3px', marginBottom: 4 }}>{x.l}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: x.c ?? '#fff' }}>{x.v}</div>
              </div>
            ))}
          </div>
          <div style={{
            padding: '10px 14px', borderRadius: 12,
            background: 'rgba(10,132,255,.07)', borderLeft: `3px solid ${blue}`,
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 10, color: blue, fontWeight: 700, letterSpacing: '.5px', marginBottom: 4 }}>WHY OPENED</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', lineHeight: 1.4 }}>{trade.reason}</div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>Confidence</div>
          <ConfBar value={trade.confidence ?? 0} />
        </div>
      )}
    </div>
  )
}

function HistoryTab({ trades }: any) {
  const closed = [...trades.filter((t: any) => t.closed)].sort(
    (a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime()
  )
  const open   = trades.filter((t: any) => !t.closed)
  const wins   = closed.filter((t: any) => (t.pnl ?? 0) > 0).length
  const losses = closed.filter((t: any) => (t.pnl ?? 0) <= 0).length
  const totalPnl = closed.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0)
  const winRate  = closed.length ? `${Math.round((wins / closed.length) * 100)}%` : '—'

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Summary strip */}
      <div style={{
        display: 'flex', borderRadius: 16, marginBottom: 20, overflow: 'hidden',
        background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)',
      }}>
        {[
          { l: 'Realized', v: fmt$(totalPnl), c: pctColor(totalPnl) },
          { l: 'Win Rate',  v: winRate,        c: '#fff' },
          { l: 'W / L',     v: `${wins} / ${losses}`, c: '#fff' },
        ].map((s, i) => (
          <div key={s.l} style={{
            flex: 1, padding: '13px 0', textAlign: 'center',
            borderRight: i < 2 ? '1px solid rgba(255,255,255,.07)' : 'none',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {open.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: blue, letterSpacing: '.5px', marginBottom: 10 }}>OPEN</div>
          {open.map((t: any) => <TradeRow key={t.id} trade={t} />)}
        </>
      )}
      {closed.length === 0 ? (
        <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,.3)' }}>
          No closed trades yet
        </div>
      ) : (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.5px', marginBottom: 10, marginTop: open.length ? 16 : 0 }}>
            CLOSED ({closed.length})
          </div>
          {closed.map((t: any) => <TradeRow key={t.id} trade={t} />)}
        </>
      )}
    </div>
  )
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

function BacktestTab({ backtest }: any) {
  if (!backtest) {
    return (
      <div style={{ paddingTop: 60, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 17, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>No backtest results</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.3)', marginTop: 6 }}>Run a backtest to see results</div>
      </div>
    )
  }

  const strats = [...(backtest.summary?.aggregated_by_strategy ?? [])]
    .filter((s: any) => s.avg_total_return_pct !== 0 || s.avg_trades > 0)
    .sort((a: any, b: any) => b.avg_total_return_pct - a.avg_total_return_pct)

  const spy = backtest.summary?.spy_benchmark
  const mc  = backtest.summary?.monte_carlo

  return (
    <div style={{ paddingTop: 4 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', marginBottom: 16, letterSpacing: '.2px' }}>
        {backtest.days}d · {backtest.tickers?.length} tickers · {strats.length} strategies
      </div>

      {/* Strategy table */}
      <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', marginBottom: 20 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.03)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px 52px 52px', gap: 4 }}>
            {['Strategy', 'Return', 'Sharpe', 'Win%'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.4px' }}>{h}</div>
            ))}
          </div>
        </div>

        {strats.map((s: any, i: number) => (
          <div key={s.strategy} style={{
            display: 'grid', gridTemplateColumns: '1fr 58px 52px 52px', gap: 4,
            padding: '13px 16px',
            background: i === 0 ? 'rgba(10,132,255,.06)' : i % 2 === 0 ? 'rgba(255,255,255,.015)' : 'transparent',
            borderBottom: '1px solid rgba(255,255,255,.04)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? '#fff' : 'rgba(255,255,255,.7)' }}>
                {s.strategy.replace(/_/g, ' ')}
              </div>
              {i === 0 && <div style={{ fontSize: 10, color: blue, marginTop: 2, letterSpacing: '.4px' }}>★ BEST</div>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: pctColor(s.avg_total_return_pct) }}>
              {s.avg_total_return_pct >= 0 ? '+' : ''}{s.avg_total_return_pct.toFixed(0)}%
            </div>
            <div style={{ fontSize: 13, color: s.avg_sharpe >= 1 ? green : s.avg_sharpe >= 0 ? yellow : red }}>
              {s.avg_sharpe.toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{s.avg_win_rate.toFixed(0)}%</div>
          </div>
        ))}

        {spy && (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 58px 52px 52px', gap: 4,
            padding: '13px 16px', background: 'rgba(255,214,10,.04)',
            borderTop: '1px solid rgba(255,255,255,.08)',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: yellow }}>SPY</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginTop: 2 }}>buy &amp; hold</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: pctColor(spy.total_return_pct) }}>
              +{spy.total_return_pct?.toFixed(0)}%
            </div>
            <div style={{ fontSize: 13, color: yellow }}>{spy.sharpe?.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.35)' }}>—</div>
          </div>
        )}
      </div>

      {/* MC section */}
      {mc && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.5px', marginBottom: 12 }}>
            MONTE CARLO · {(mc.n_paths ?? 0).toLocaleString()} PATHS
          </div>

          {mc.paths && (
            <div style={{ borderRadius: 20, padding: '16px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', marginBottom: 14 }}>
              <MCChart paths={mc.paths} actual={[]} />
              <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,.3)' }}>
                <span style={{ color: 'rgba(255,69,58,.5)' }}>── Bear P5</span>
                <span style={{ color: 'rgba(10,132,255,.6)' }}>- - Median</span>
                <span style={{ color: 'rgba(48,209,88,.5)' }}>── Bull P95</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { l: 'Bear P5',  v: mc.final_return_pct?.p5,  c: red },
              { l: 'Base P50', v: mc.final_return_pct?.p50, c: blue },
              { l: 'Bull P95', v: mc.final_return_pct?.p95, c: green },
            ].map(x => (
              <div key={x.l} style={{
                flex: 1, borderRadius: 14, padding: '12px 8px', textAlign: 'center',
                background: 'rgba(255,255,255,.04)', border: `1px solid ${x.c}25`,
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', marginBottom: 4, letterSpacing: '.3px' }}>{x.l}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: x.c }}>
                  +{Number(x.v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}%
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { l: 'Prob. of Loss',      v: `${mc.prob_loss_pct?.toFixed(1)}%`,        c: mc.prob_loss_pct < 5 ? green : yellow },
              { l: 'Max DD (median)',    v: `${mc.max_drawdown_pct?.median?.toFixed(1)}%`, c: red },
            ].map(x => (
              <div key={x.l} style={{
                borderRadius: 14, padding: '12px 14px',
                background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
              }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', letterSpacing: '.3px', marginBottom: 6 }}>{x.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: x.c }}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Regime ───────────────────────────────────────────────────────────────────

function RegimeTab({ regime, status }: any) {
  const cfg  = status?.config ?? {}
  const rCfg = regime?.config  ?? {}

  return (
    <div style={{ paddingTop: 4 }}>
      {/* Regime hero */}
      <div style={{
        borderRadius: 20, padding: '20px',
        background: 'rgba(10,132,255,.08)', border: '1px solid rgba(10,132,255,.2)',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{
            padding: '5px 14px', borderRadius: 999,
            background: 'rgba(10,132,255,.2)', color: blue,
            fontSize: 14, fontWeight: 700, letterSpacing: '.4px',
          }}>
            {regime?.regime?.replace(/_/g, ' ') ?? 'UNKNOWN'}
          </span>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>VIX {regime?.vix?.toFixed(1) ?? '—'}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{regime?.confidence?.toFixed(0)}% conf</div>
          </div>
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', lineHeight: 1.5, marginBottom: 14 }}>
          {rCfg.description ?? 'No description available'}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
          {(rCfg.active_long_strategies ?? []).map((s: string) => (
            <span key={s} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(48,209,88,.12)', color: green }}>
              ↑ {s.replace(/_/g, ' ')}
            </span>
          ))}
          {(rCfg.active_short_strategies ?? []).map((s: string) => (
            <span key={s} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'rgba(255,69,58,.12)', color: red }}>
              ↓ {s.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </div>

      {/* Multipliers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        {[
          { l: 'Position Size ×', v: `${rCfg.size_multiplier ?? '—'}×` },
          { l: 'Stop Loss ×',     v: `${rCfg.stop_mult ?? '—'}×` },
        ].map(x => (
          <div key={x.l} style={{
            borderRadius: 16, padding: '16px',
            background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)',
          }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.35)', letterSpacing: '.3px', marginBottom: 6 }}>{x.l}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{x.v}</div>
          </div>
        ))}
      </div>

      {/* Risk parameters */}
      <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.08)', marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.5px' }}>RISK PARAMETERS</span>
        </div>
        {[
          { l: 'Risk per trade',    v: `${cfg.risk_per_trade_pct ?? '—'}%` },
          { l: 'Max position',      v: `${cfg.max_position_pct ?? '—'}%` },
          { l: 'Stop loss',         v: `${cfg.stop_loss_pct ?? '—'}%` },
          { l: 'Daily loss limit',  v: `${cfg.daily_loss_limit_pct ?? '—'}%` },
          { l: 'VIX pause at',      v: String(cfg.vix_pause_threshold ?? '—') },
          { l: 'Min confidence',    v: `${cfg.min_confidence ?? '—'}%` },
        ].map((r, i) => (
          <div key={r.l} style={{
            display: 'flex', justifyContent: 'space-between', padding: '13px 16px',
            borderBottom: i < 5 ? '1px solid rgba(255,255,255,.04)' : 'none',
          }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,.5)' }}>{r.l}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{r.v}</span>
          </div>
        ))}
      </div>

      {/* Universe */}
      {cfg.universe?.length > 0 && (
        <div style={{ borderRadius: 20, padding: '16px', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.3)', letterSpacing: '.5px', marginBottom: 12 }}>
            UNIVERSE · {cfg.universe.length} TICKERS
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
            {(cfg.universe as string[]).map(t => (
              <span key={t} style={{
                padding: '4px 11px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.8)',
                border: '1px solid rgba(255,255,255,.1)',
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
  const { status, portfolio, trades, pnlHistory, backtest, regime } = useAgentFull()

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 16, paddingBottom: 2 }}>
        {TABS.map(t => (
          <button key={t} data-tab-index={TABS.indexOf(t)} onClick={() => setTab(t)} style={{
            flexShrink: 0, padding: '6px 10px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
            fontWeight: tab === t ? 700 : 500, letterSpacing: tab === t ? '-.1px' : '0',
            border: `1px solid ${tab === t ? 'rgba(10,132,255,.5)' : 'rgba(255,255,255,.1)'}`,
            background: tab === t ? 'rgba(10,132,255,.15)' : 'rgba(255,255,255,.04)',
            color: tab === t ? blue : 'rgba(255,255,255,.5)',
            transition: 'all .15s ease',
          }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab status={status} portfolio={portfolio} pnlHistory={pnlHistory} regime={regime} backtest={backtest} />}
      {tab === 'Live'     && <LiveTab portfolio={portfolio} trades={trades} />}
      {tab === 'History'  && <HistoryTab trades={trades} />}
      {tab === 'Backtest' && <BacktestTab backtest={backtest} />}
      {tab === 'Regime'   && <RegimeTab regime={regime} status={status} />}
    </div>
  )
}
