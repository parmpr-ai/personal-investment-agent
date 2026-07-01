'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Power, Settings as SettingsIcon, RefreshCw } from 'lucide-react'

interface AgentStatus {
  running: boolean
  mode: string
  cycle_count: number
  last_cycle: string | null
  config: {
    enabled: boolean
    mode: string
    cycle_minutes: number
    risk_per_trade_pct: number
    max_positions: number
  }
}

export default function AgentSettingsWidget() {
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8001/agent/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Failed to load agent status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || !status) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5" />
              Agent Settings
            </CardTitle>
            <CardDescription>Current configuration and status</CardDescription>
          </div>
          <Badge variant={status.running ? 'default' : 'secondary'}>
            <Power className="w-3 h-3 mr-1" />
            {status.running ? 'Running' : 'Stopped'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Mode</p>
            <p className="text-sm font-semibold">{status.mode}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cycle Interval</p>
            <p className="text-sm font-semibold">{status.config.cycle_minutes} min</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Risk Per Trade</p>
            <p className="text-sm font-semibold">{status.config.risk_per_trade_pct}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Max Positions</p>
            <p className="text-sm font-semibold">{status.config.max_positions}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Cycles</p>
            <p className="text-sm font-semibold">{status.cycle_count}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Last Cycle</p>
            <p className="text-sm font-semibold text-gray-600">
              {status.last_cycle ? new Date(status.last_cycle).toLocaleTimeString() : 'Never'}
            </p>
          </div>
        </div>
        <button
          onClick={loadStatus}
          className="w-full mt-4 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </CardContent>
    </Card>
  )
}
