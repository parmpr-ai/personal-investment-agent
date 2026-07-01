'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'

interface Decision {
  ticker: string
  action: 'BUY' | 'SELL' | 'HOLD'
  strategy: string
  confidence: number
  timestamp: string
  reason?: string
}

export default function AgentDecisionsWidget() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDecisions()
    const interval = setInterval(loadDecisions, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadDecisions = async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8001/agent/decisions?limit=20')
      if (res.ok) {
        const data = await res.json()
        setDecisions(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to load decisions:', error)
    } finally {
      setLoading(false)
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY':
        return 'bg-green-100 text-green-800'
      case 'SELL':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getActionIcon = (action: string) => {
    if (action === 'BUY') return <ArrowUp className="w-3 h-3" />
    if (action === 'SELL') return <ArrowDown className="w-3 h-3" />
    return null
  }

  if (loading && decisions.length === 0) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg">Recent Decisions</CardTitle>
        <CardDescription>Trading signals from agent (last 20)</CardDescription>
      </CardHeader>
      <CardContent>
        {decisions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No decisions yet</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {decisions.map((decision, idx) => (
              <div key={idx} className="p-3 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-sm">{decision.ticker}</span>
                    <Badge className={getActionColor(decision.action)} variant="secondary">
                      <span className="flex items-center gap-1">
                        {getActionIcon(decision.action)}
                        {decision.action}
                      </span>
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 space-y-0.5">
                    <p>{decision.strategy}</p>
                    <p>{new Date(decision.timestamp).toLocaleTimeString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{Math.abs(decision.confidence)}%</p>
                  <p className="text-xs text-gray-500">confidence</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={loadDecisions}
          className="w-full mt-4 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </CardContent>
    </Card>
  )
}
