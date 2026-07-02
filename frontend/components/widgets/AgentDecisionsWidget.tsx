'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { AlertCircle, Activity } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface Decision {
  ticker: string
  action: string
  strategy: string
  confidence: number
  reasoning?: string
  ts: string
  side?: string
}

export default function AgentDecisionsWidget() {
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await fetch(`${AGENT_API}/agent/decisions?limit=20`)
        if (!res.ok) throw new Error('Failed to fetch decisions')
        const data = await res.json()
        setDecisions(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchDecisions()
    const interval = setInterval(fetchDecisions, 30000)
    return () => clearInterval(interval)
  }, [])

  const getActionColor = (action?: string) => {
    const a = (action || '').toUpperCase()
    if (a.includes('BUY')) return 'bg-green-500/20 text-green-400'
    if (a.includes('SELL')) return 'bg-red-500/20 text-red-400'
    return 'bg-yellow-500/20 text-yellow-400'
  }

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ts
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Recent Decisions
        </CardTitle>
        <CardDescription>Latest trading entry/exit signals</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : decisions.length > 0 ? (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {decisions.map((d, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{d.ticker || '—'}</span>
                    <Badge className={getActionColor(d.action)}>{d.action || '—'}</Badge>
                    <span className="text-xs text-gray-400">{d.strategy}</span>
                  </div>
                  <span className="text-xs text-gray-500">{formatTime(d.ts)}</span>
                </div>
                {d.confidence && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Confidence</span>
                    <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${Math.min(d.confidence * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {d.reasoning && <p className="text-xs text-gray-400 mt-2 italic">{d.reasoning}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400">No decisions yet</div>
        )}
      </CardContent>
    </Card>
  )
}
