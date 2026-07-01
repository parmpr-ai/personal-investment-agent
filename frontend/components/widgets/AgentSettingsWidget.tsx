'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { AlertCircle, Settings } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface AgentStatus {
  running: boolean
  risk_mode?: string
  trade_style?: string
  regime?: string
  cycle_count?: number
  max_positions?: number
  universe_size?: number
}

export default function AgentSettingsWidget() {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${AGENT_API}/agent/status`)
        if (!res.ok) throw new Error('Failed to fetch agent status')
        const data = await res.json()
        setStatus(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleToggleAgent = async () => {
    try {
      const method = status?.running ? 'stop' : 'start'
      const res = await fetch(`${AGENT_API}/agent/${method}`, { method: 'POST' })
      if (!res.ok) throw new Error(`Failed to ${method} agent`)
      // start/stop returns {ok, message} — re-fetch the real status
      const fresh = await fetch(`${AGENT_API}/agent/status`).then((r) => r.json()).catch(() => null)
      if (fresh) setStatus(fresh)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const getRiskColor = (mode?: string) => {
    if (mode === 'AGGRESSIVE') return 'bg-red-500/20 text-red-400'
    if (mode === 'NORMAL') return 'bg-green-500/20 text-green-400'
    if (mode === 'CONSERVATIVE') return 'bg-yellow-500/20 text-yellow-400'
    return 'bg-blue-500/20 text-blue-400'
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Agent Settings
        </CardTitle>
        <CardDescription>Configuration and mode controls</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : status ? (
          <>
            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
              <div>
                <div className="text-sm font-medium text-white">Agent Status</div>
                <div className="text-xs text-gray-400 mt-1">Paper trading mode</div>
              </div>
              <Button
                onClick={handleToggleAgent}
                variant={status.running ? 'destructive' : 'default'}
                size="sm"
              >
                {status.running ? 'Stop' : 'Start'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {status.risk_mode && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400 mb-1">Risk Mode</div>
                  <Badge className={getRiskColor(status.risk_mode)}>{status.risk_mode}</Badge>
                </div>
              )}
              {status.regime && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400 mb-1">Market Regime</div>
                  <Badge variant="outline" className="text-xs">
                    {status.regime}
                  </Badge>
                </div>
              )}
              {status.cycle_count !== undefined && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Cycles Run</div>
                  <div className="text-lg font-bold text-white">{status.cycle_count}</div>
                </div>
              )}
              {status.max_positions && (
                <div className="p-2 rounded bg-slate-900">
                  <div className="text-xs text-gray-400">Max Positions</div>
                  <div className="text-lg font-bold text-white">{status.max_positions}</div>
                </div>
              )}
            </div>

            {status.trade_style && (
              <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                <div className="text-sm font-medium text-white mb-2">Trade Style</div>
                <Badge variant="outline">{status.trade_style.replace(/_/g, ' ')}</Badge>
              </div>
            )}

            <div className="pt-2 border-t border-slate-700">
              <div className="text-xs text-gray-400">
                ℹ️ Agent runs in paper trading mode only. Real IBKR connectivity is disabled for safety.
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}
