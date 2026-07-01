'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertCircle, BarChart3 } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface StrategyRow {
  strategy: string
  tickers_tested?: number
  avg_trades?: number
  avg_win_rate?: number
  avg_sharpe?: number
  avg_max_dd?: number
  avg_total_return_pct?: number
}

interface BacktestStatus {
  status?: string
  run_ts?: string
  days?: number
  summary?: {
    tickers_tested?: number
    strategies_tested?: number
    aggregated_by_strategy?: StrategyRow[]
  }
}

export default function AgentBacktestResultsWidget() {
  const [backtest, setBacktest] = useState<BacktestStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBacktest = async () => {
      try {
        const res = await fetch(`${AGENT_API}/agent/backtest/status`)
        if (!res.ok) throw new Error('Failed to fetch backtest results')
        const data = await res.json()
        setBacktest(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchBacktest()
    const interval = setInterval(fetchBacktest, 60000)
    return () => clearInterval(interval)
  }, [])

  const rows = backtest?.summary?.aggregated_by_strategy ?? []
  const avg = (key: keyof StrategyRow) => {
    const vals = rows.map((r) => Number(r[key] ?? 0)).filter((v) => !Number.isNaN(v))
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`

  const chartData = rows.map((r) => ({
    name: r.strategy?.replace(/_/g, ' ') ?? '?',
    return: Number(r.avg_total_return_pct ?? 0),
    win_rate: Number(r.avg_win_rate ?? 0),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Backtest Results
        </CardTitle>
        <CardDescription>
          {backtest?.days ? `${backtest.days}-day` : '2-year'} validation per strategy
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : rows.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2 rounded bg-slate-900">
                <div className="text-xs text-gray-400">Avg Return</div>
                <div className={`text-sm font-bold ${avg('avg_total_return_pct') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fmtPct(avg('avg_total_return_pct'))}
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900">
                <div className="text-xs text-gray-400">Avg Sharpe</div>
                <div className="text-sm font-bold text-blue-400">{avg('avg_sharpe').toFixed(2)}</div>
              </div>
              <div className="p-2 rounded bg-slate-900">
                <div className="text-xs text-gray-400">Avg Max Drawdown</div>
                <div className="text-sm font-bold text-red-400">{fmtPct(avg('avg_max_dd'))}</div>
              </div>
              <div className="p-2 rounded bg-slate-900">
                <div className="text-xs text-gray-400">Avg Win Rate</div>
                <div className={`text-sm font-bold ${avg('avg_win_rate') >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {avg('avg_win_rate').toFixed(0)}%
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Return % by Strategy</div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                    <Bar dataKey="return" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {backtest?.run_ts && (
              <div className="text-xs text-gray-400 pt-2 border-t">
                Last backtest: {new Date(backtest.run_ts).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">
            No backtest data yet — run one from the Backtest panel below
          </div>
        )}
      </CardContent>
    </Card>
  )
}
