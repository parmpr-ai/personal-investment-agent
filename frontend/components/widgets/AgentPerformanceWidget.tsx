'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'
import { TrendingUp, AlertCircle } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface PnLData {
  ts: string
  portfolio_value: number
  daily_pnl?: number
}

interface Portfolio {
  total_value?: number
  total_return_pct?: number
  realized_pnl?: number
  unrealized_pnl?: number
  cash?: number
  positions?: unknown[]
}

export default function AgentPerformanceWidget() {
  const [pnlData, setPnlData] = useState<PnLData[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pnlRes, portfolioRes] = await Promise.all([
          fetch(`${AGENT_API}/agent/analytics/pnl?hours=72`),
          fetch(`${AGENT_API}/agent/paper/portfolio`),
        ])

        if (!pnlRes.ok || !portfolioRes.ok) throw new Error('Failed to fetch performance data')

        const pnl = await pnlRes.json()
        const port = await portfolioRes.json()

        setPnlData(Array.isArray(pnl) ? pnl : [])
        setPortfolio(port)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  const fmt$ = (v?: number) =>
    Number(v ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const fmtPct = (v?: number) => {
    const n = Number(v ?? 0)
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Paper Trading Performance
        </CardTitle>
        <CardDescription>Live P&L and equity curve (72h)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {portfolio && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-slate-900">
                  <div className="text-xs text-gray-400 mb-1">Portfolio Value</div>
                  <div className="text-lg font-bold text-white">{fmt$(portfolio.total_value)}</div>
                  <div className={`text-xs font-semibold mt-1 ${(portfolio.total_return_pct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmtPct(portfolio.total_return_pct)} total
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900">
                  <div className="text-xs text-gray-400 mb-1">Realized P&L</div>
                  <div className={`text-lg font-bold ${(portfolio.realized_pnl ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {fmt$(portfolio.realized_pnl)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {Array.isArray(portfolio.positions) ? portfolio.positions.length : 0} positions
                  </div>
                </div>
              </div>
            )}

            {pnlData.length > 0 && (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlData}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="ts"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => new Date(v).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ background: '#1f2937', border: '1px solid #374151' }}
                      formatter={(value: any) => fmt$(value)}
                    />
                    <Area type="monotone" dataKey="portfolio_value" stroke="#10b981" fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
