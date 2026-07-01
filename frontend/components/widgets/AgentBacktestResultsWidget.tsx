'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { RefreshCw, TrendingUp } from 'lucide-react'

interface BacktestResults {
  status: string
  total_return_pct: number
  sharpe_ratio: number
  max_drawdown_pct: number
  win_rate: number
  strategy_results?: Array<{
    strategy: string
    return_pct: number
    sharpe: number
    win_rate: number
  }>
}

export default function AgentBacktestResultsWidget() {
  const [results, setResults] = useState<BacktestResults | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResults()
    const interval = setInterval(loadResults, 60000)
    return () => clearInterval(interval)
  }, [])

  const loadResults = async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8001/agent/backtest/status')
      if (res.ok) {
        const data = await res.json()
        setResults(data)
      }
    } catch (error) {
      console.error('Failed to load backtest results:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !results) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  const chartData = results?.strategy_results?.map((s) => ({
    name: s.strategy.replace(/_/g, ' '),
    return: s.return_pct,
    sharpe: s.sharpe,
  })) || []

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Backtest Results
            </CardTitle>
            <CardDescription>Overall performance and strategy breakdown</CardDescription>
          </div>
          <Badge variant={(results?.total_return_pct ?? 0) >= 0 ? 'default' : 'destructive'}>
            {results?.status || 'idle'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {results ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded">
                <p className="text-xs text-gray-600">Total Return</p>
                <p className="text-lg font-bold text-green-600">
                  {results.total_return_pct.toFixed(2)}%
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-xs text-gray-600">Sharpe Ratio</p>
                <p className="text-lg font-bold text-blue-600">
                  {results.sharpe_ratio.toFixed(2)}
                </p>
              </div>
              <div className="p-3 bg-red-50 rounded">
                <p className="text-xs text-gray-600">Max Drawdown</p>
                <p className="text-lg font-bold text-red-600">
                  {results.max_drawdown_pct.toFixed(2)}%
                </p>
              </div>
              <div className="p-3 bg-purple-50 rounded">
                <p className="text-xs text-gray-600">Win Rate</p>
                <p className="text-lg font-bold text-purple-600">
                  {results.win_rate.toFixed(1)}%
                </p>
              </div>
            </div>

            {chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: unknown) => `${(v as number).toFixed(2)}`} />
                  <Bar dataKey="return" fill="#3b82f6" name="Return %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">No backtest results available</div>
        )}

        <button
          onClick={loadResults}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </CardContent>
    </Card>
  )
}
