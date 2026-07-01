'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { TrendingUp, AlertCircle } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface TrainingStatus {
  in_progress: boolean
  last_trained?: string
  accuracy?: number
  sharpe?: number
  model_version?: string
  strategies?: string[]
}

export default function AgentTrainingStatusWidget() {
  const [status, setStatus] = useState<TrainingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${AGENT_API}/agent/ml/status`)
        if (!res.ok) throw new Error('Failed to fetch training status')
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Model Training Status
        </CardTitle>
        <CardDescription>ML ensemble training progress and metrics</CardDescription>
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
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status</span>
              <Badge variant={status.in_progress ? 'default' : 'secondary'}>
                {status.in_progress ? '🔄 Training' : '✓ Ready'}
              </Badge>
            </div>
            {status.accuracy && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Accuracy</span>
                <span className="text-sm font-semibold text-green-400">{(status.accuracy * 100).toFixed(1)}%</span>
              </div>
            )}
            {status.sharpe && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Sharpe Ratio</span>
                <span className="text-sm font-semibold text-blue-400">{status.sharpe.toFixed(2)}</span>
              </div>
            )}
            {status.model_version && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Model Version</span>
                <span className="text-sm font-mono">{status.model_version}</span>
              </div>
            )}
            {status.last_trained && (
              <div className="text-xs text-gray-400 pt-2 border-t">
                Last trained: {new Date(status.last_trained).toLocaleString()}
              </div>
            )}
            {status.strategies && (
              <div className="pt-2 border-t">
                <div className="text-xs font-medium mb-2">Strategies:</div>
                <div className="flex flex-wrap gap-1">
                  {status.strategies.map((s) => (
                    <Badge key={s} variant="outline" className="text-xs">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">No data available</div>
        )}
      </CardContent>
    </Card>
  )
}
