'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, RefreshCw } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface PnLDataPoint {
  ts: string
  portfolio_value: number
  cash: number
  total_return_pct: number
}

interface Portfolio {
  total_value: number
  cash: number
  positions: unknown[]
  total_return_pct: number
  realized_pnl: number
}

export default function AgentPerformanceWidget() {
  const [pnlData, setPnlData] = useState<PnLDataPoint[]>([])
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [pnlRes, portRes] = await Promise.all([
        fetch('http://localhost:8001/agent/analytics/pnl?hours=72'),
        fetch('http://localhost:8001/agent/paper/portfolio'),
      ])

      if (pnlRes.ok) {
        const data = await pnlRes.json()
        setPnlData(Array.isArray(data) ? data : [])
      }
      if (portRes.ok) {
        const data = await portRes.json()
        setPortfolio(data)
      }
    } catch (error) {
      console.error('Failed to load performance data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  const chartData = pnlData.map((point) => ({
    time: new Date(point.ts).toLocaleTimeString(),
    value: point.portfolio_value,
  }))

  const returnColor = (portfolio?.total_return_pct ?? 0) >= 0 ? '#10b981' : '#ef4444'

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Portfolio Performance
            </CardTitle>
            <CardDescription>72-hour equity curve and returns</CardDescription>
          </div>
          <Badge variant={(portfolio?.total_return_pct ?? 0) >= 0 ? 'default' : 'destructive'}>
            {(portfolio?.total_return_pct ?? 0).toFixed(2)}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded">
            <p className="text-xs text-gray-600">Portfolio Value</p>
            <p className="text-lg font-bold">${(portfolio?.total_value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="p-3 bg-purple-50 rounded">
            <p className="text-xs text-gray-600">Cash</p>
            <p className="text-lg font-bold">${(portfolio?.cash ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="p-3 bg-green-50 rounded">
            <p className="text-xs text-gray-600">Realized P&L</p>
            <p className="text-lg font-bold text-green-600">
              ${(portfolio?.realized_pnl ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="p-3 bg-gray-50 rounded">
            <p className="text-xs text-gray-600">Open Positions</p>
            <p className="text-lg font-bold">{portfolio?.positions?.length ?? 0}</p>
          </div>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={returnColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={returnColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: unknown) => `$${(v as number).toLocaleString()}`} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={returnColor}
                fillOpacity={1}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-8 text-gray-500">No performance data available</div>
        )}

        <button
          onClick={loadData}
          className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </CardContent>
    </Card>
  )
}
