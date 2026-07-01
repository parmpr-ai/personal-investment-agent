'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AlertCircle, BarChart3 } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface BacktestResult {
  status: string
  completed_at?: string
  total_return?: number
  sharpe?: number
  max_drawdown?: number
  win_rate?: number
  trades?: number
  strategies?: Array<{
    name: string
    total_return: number
    win_rate: number
    sharpe: number
  }>
}

export default function AgentBacktestResultsWidget() {
  const [backtest, setBacktest] = useState<BacktestResult | null>(null)
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

  const fmtPct = (v?: number) => (v !== undefined ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : '—')
  const chartData = backtest?.strategies || []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Walk-Forward Backtest
        </CardTitle>
        <CardDescription>2-year validation results per strategy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : backtest ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {backtest.total_return !== undefined && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Total Return</div>
                  <div
                    className={`text-sm font-bold ${backtest.total_return >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {fmtPct(backtest.total_return)}
                  </div>
                </div>
              )}
              {backtest.sharpe !== undefined && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Sharpe Ratio</div>
                  <div className="text-sm font-bold text-blue-400">{backtest.sharpe.toFixed(2)}</div>
                </div>
              )}
              {backtest.max_drawdown !== undefined && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Max Drawdown</div>
                  <div className="text-sm font-bold text-red-400">{fmtPct(backtest.max_drawdown)}</div>
                </div>
              )}
              {backtest.win_rate !== undefined && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Win Rate</div>
                  <div
                    className={`text-sm font-bold ${backtest.win_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {backtest.win_rate.toFixed(0)}%
                  </div>
                </div>
              )}
            </div>

            {chartData.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Strategy Performance</div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151' }} />
                      <Bar dataKey="total_return" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {backtest.completed_at && (
              <div className="text-xs text-gray-400 pt-2 border-t">
                Last backtest: {new Date(backtest.completed_at).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">No backtest data available</div>
        )}
      </CardContent>
    </Card>
  )
}
