'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { ArrowUp, ArrowDown, TrendingUp, BarChart3, Plus, X } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface Prediction {
  ticker: string
  strategy: string
  direction: 'up' | 'down'
  probability: number
  confidence: number
  timestamp: string
}

interface OpenTrade {
  trade_id: string
  strategy: string
  ticker: string
  entry_price: number
  quantity: number
  predicted_direction: string
  exit_date: string
  days_remaining: number
  side: string
}

interface ClosedTrade {
  trade_id: string
  strategy: string
  ticker: string
  entry_price: number
  exit_price: number
  quantity: number
  pnl: number
  pnl_pct: number
  was_correct: boolean
}

interface PerformanceStats {
  total_closed_trades: number
  total_pnl: number
  avg_pnl_pct: number
  win_rate: number
  winners: number
  losers: number
}

interface EntryForm {
  strategy: string
  ticker: string
  entry_price: string
  quantity: string
  side: 'long' | 'short'
  direction: 'up' | 'down'
}

const STRATEGIES = ['momentum', 'mean_reversion', 'breakout', 'trend_follow', 'short_momentum', 'short_breakdown']

export function AgentPaperTradingWidget() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([])
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([])
  const [stats, setStats] = useState<PerformanceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [entryForm, setEntryForm] = useState<EntryForm>({
    strategy: 'momentum',
    ticker: 'NVDA',
    entry_price: '',
    quantity: '100',
    side: 'long',
    direction: 'up',
  })
  const [selectedTradeForExit, setSelectedTradeForExit] = useState<OpenTrade | null>(null)
  const [exitForm, setExitForm] = useState({ exit_price: '', actual_direction: 'up' })

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [openRes, closedRes, statsRes] = await Promise.all([
        fetch(`${AGENT_API}/trades/open`),
        fetch(`${AGENT_API}/trades/closed?limit=10`),
        fetch(`${AGENT_API}/trades/performance`),
      ])

      if (openRes.ok) {
        const data = await openRes.json()
        setOpenTrades(data.open_trades || [])
      }
      if (closedRes.ok) {
        const data = await closedRes.json()
        setClosedTrades(data.closed_trades || [])
      }
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to load trading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEntryTrade = async () => {
    try {
      const response = await fetch(`${AGENT_API}/trades/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: entryForm.strategy,
          ticker: entryForm.ticker,
          entry_price: parseFloat(entryForm.entry_price),
          predicted_direction: entryForm.direction,
          quantity: parseInt(entryForm.quantity),
          side: entryForm.side,
        }),
      })

      if (response.ok) {
        setEntryForm({
          strategy: 'momentum',
          ticker: 'NVDA',
          entry_price: '',
          quantity: '100',
          side: 'long',
          direction: 'up',
        })
        loadData()
      }
    } catch (error) {
      console.error('Trade entry failed:', error)
    }
  }

  const handleExitTrade = async (trade: OpenTrade) => {
    try {
      const response = await fetch(`${AGENT_API}/trades/${trade.trade_id}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exit_price: parseFloat(exitForm.exit_price),
          actual_direction: exitForm.actual_direction,
        }),
      })

      if (response.ok) {
        setSelectedTradeForExit(null)
        setExitForm({ exit_price: '', actual_direction: 'up' })
        loadData()
      }
    } catch (error) {
      console.error('Trade exit failed:', error)
    }
  }

  return (
    <div className="w-full space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold">Paper Trading Control</h1>
        <p className="text-sm text-gray-600">Manage entries, exits, and monitor performance</p>
      </div>

      {/* Performance Summary - Mobile Optimized */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
          <Card className="p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-600">Win Rate</div>
            <div className="text-lg md:text-2xl font-bold text-green-600">{stats.win_rate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500">{stats.winners}W/{stats.losers}L</div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-600">Total P&L</div>
            <div className={`text-lg md:text-2xl font-bold ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${stats.total_pnl.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500">{stats.avg_pnl_pct.toFixed(2)}% avg</div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-600">Closed</div>
            <div className="text-lg md:text-2xl font-bold">{stats.total_closed_trades}</div>
            <div className="text-xs text-gray-500">trades</div>
          </Card>
          <Card className="p-3 md:p-4">
            <div className="text-xs md:text-sm text-gray-600">Open</div>
            <div className="text-lg md:text-2xl font-bold text-blue-600">{openTrades.length}</div>
            <div className="text-xs text-gray-500">positions</div>
          </Card>
        </div>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="entry" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-4 text-xs md:text-sm">
          <TabsTrigger value="entry">Entry</TabsTrigger>
          <TabsTrigger value="open">
            Open {openTrades.length > 0 && <span className="ml-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded">{openTrades.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="closed">Closed</TabsTrigger>
          <TabsTrigger value="stats" className="hidden md:flex">Stats</TabsTrigger>
        </TabsList>

        {/* Entry Tab */}
        <TabsContent value="entry" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">Entry Trade</CardTitle>
              <CardDescription>Enter a new trade based on prediction signal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Strategy</label>
                  <select
                    value={entryForm.strategy}
                    onChange={(e) => setEntryForm({ ...entryForm, strategy: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Ticker</label>
                  <Input
                    value={entryForm.ticker}
                    onChange={(e) => setEntryForm({ ...entryForm, ticker: e.target.value.toUpperCase() })}
                    placeholder="NVDA"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Entry Price</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={entryForm.entry_price}
                    onChange={(e) => setEntryForm({ ...entryForm, entry_price: e.target.value })}
                    placeholder="125.50"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    value={entryForm.quantity}
                    onChange={(e) => setEntryForm({ ...entryForm, quantity: e.target.value })}
                    placeholder="100"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Direction</label>
                  <select
                    value={entryForm.direction}
                    onChange={(e) => setEntryForm({ ...entryForm, direction: e.target.value as 'up' | 'down' })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="up">📈 UP</option>
                    <option value="down">📉 DOWN</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Side</label>
                  <select
                    value={entryForm.side}
                    onChange={(e) => setEntryForm({ ...entryForm, side: e.target.value as 'long' | 'short' })}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="long">Long</option>
                    <option value="short">Short</option>
                  </select>
                </div>
              </div>

              <Button onClick={handleEntryTrade} className="w-full bg-blue-600 hover:bg-blue-700 text-sm md:text-base">
                <Plus className="mr-2 h-4 w-4" />
                Enter Trade
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Open Trades Tab */}
        <TabsContent value="open" className="space-y-4">
          {openTrades.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-gray-600 text-sm md:text-base">No open trades</p>
            </Card>
          ) : (
            openTrades.map((trade) => (
              <Card key={trade.trade_id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Trade Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base md:text-lg">{trade.ticker}</span>
                          <Badge variant={trade.side === 'long' ? 'default' : 'secondary'} className="text-xs">
                            {trade.side.toUpperCase()}
                          </Badge>
                          <Badge variant={trade.predicted_direction === 'up' ? 'default' : 'secondary'} className="text-xs">
                            {trade.predicted_direction === 'up' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          </Badge>
                        </div>
                        <p className="text-xs md:text-sm text-gray-600">{trade.strategy}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-lg md:text-xl font-bold">${trade.entry_price.toFixed(2)}</div>
                        <p className="text-xs text-gray-600">× {trade.quantity}</p>
                      </div>
                    </div>

                    {/* Days Remaining */}
                    <div className="bg-blue-50 rounded p-2">
                      <div className="text-xs text-gray-600">Exit Date</div>
                      <div className="font-bold text-sm md:text-base">{trade.exit_date}</div>
                      <div className="text-xs text-blue-600">
                        {trade.days_remaining > 0 ? `${trade.days_remaining} days remaining` : 'Ready to exit'}
                      </div>
                    </div>

                    {/* Quick Exit Button */}
                    {selectedTradeForExit?.trade_id === trade.trade_id ? (
                      <div className="space-y-3 bg-gray-50 p-3 rounded">
                        <div className="grid grid-cols-1 gap-2">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Exit Price</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={exitForm.exit_price}
                              onChange={(e) => setExitForm({ ...exitForm, exit_price: e.target.value })}
                              placeholder="130.00"
                              className="text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Actual Direction</label>
                            <select
                              value={exitForm.actual_direction}
                              onChange={(e) => setExitForm({ ...exitForm, actual_direction: e.target.value })}
                              className="w-full px-2 py-2 border rounded text-sm"
                            >
                              <option value="up">📈 UP</option>
                              <option value="down">📉 DOWN</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleExitTrade(trade)}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-sm"
                          >
                            Confirm Exit
                          </Button>
                          <Button
                            onClick={() => setSelectedTradeForExit(null)}
                            variant="outline"
                            className="flex-1 text-sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        onClick={() => setSelectedTradeForExit(trade)}
                        className="w-full bg-orange-600 hover:bg-orange-700 text-sm"
                      >
                        Exit Trade
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Closed Trades Tab */}
        <TabsContent value="closed" className="space-y-4">
          {closedTrades.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-gray-600 text-sm md:text-base">No closed trades yet</p>
            </Card>
          ) : (
            closedTrades.map((trade) => (
              <Card key={trade.trade_id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base md:text-lg">{trade.ticker}</span>
                        <Badge
                          variant={trade.was_correct ? 'default' : 'secondary'}
                          className={`text-xs ${trade.was_correct ? 'bg-green-600' : 'bg-red-600'}`}
                        >
                          {trade.was_correct ? '✓ Correct' : '✗ Wrong'}
                        </Badge>
                      </div>
                      <div className={`text-lg md:text-xl font-bold ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs md:text-sm">
                      <div>
                        <span className="text-gray-600">Entry:</span>
                        <div className="font-semibold">${trade.entry_price.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Exit:</span>
                        <div className="font-semibold">${trade.exit_price.toFixed(2)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Return:</span>
                        <div className={`font-semibold ${trade.pnl_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {trade.pnl_pct >= 0 ? '+' : ''}{trade.pnl_pct.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Stats Tab - Desktop Only */}
        <TabsContent value="stats" className="space-y-4 hidden md:block">
          {stats && (
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Overall Return</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-3xl font-bold ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.total_pnl >= 0 ? '+' : ''}${stats.total_pnl.toLocaleString()}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{stats.avg_pnl_pct.toFixed(2)}% average</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Win Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{stats.win_rate.toFixed(1)}%</div>
                  <p className="text-xs text-gray-600 mt-2">
                    {stats.winners} wins, {stats.losers} losses
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Auto-refresh indicator */}
      <div className="text-xs text-gray-500 text-center">
        {loading ? 'Refreshing...' : '✓ Live data'}
      </div>
    </div>
  )
}

export default AgentPaperTradingWidget
