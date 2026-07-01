'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { TrendingUp, AlertCircle } from 'lucide-react'

const AGENT_API = process.env.NEXT_PUBLIC_AGENT_API_URL ?? 'http://127.0.0.1:8001'

interface ModelStatus {
  strategy: string
  trained_at?: string
  age_days?: number
  stale?: boolean
}

export default function AgentTrainingStatusWidget() {
  const [models, setModels] = useState<ModelStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${AGENT_API}/agent/ml/status`)
        if (!res.ok) throw new Error('Failed to fetch training status')
        const data = await res.json()
        setModels(Array.isArray(data) ? data : [])
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

  const fresh = models.filter((m) => !m.stale).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Model Training Status
        </CardTitle>
        <CardDescription>ML ensemble freshness per strategy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : error ? (
          <div className="flex gap-2 text-red-400">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : models.length > 0 ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Models Fresh</span>
              <Badge variant={fresh === models.length ? 'default' : 'secondary'}>
                {fresh}/{models.length}
              </Badge>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {models.map((m) => (
                <div
                  key={m.strategy}
                  className="flex items-center justify-between p-2 rounded bg-slate-900/50 border border-slate-700/50"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{m.strategy?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-400">
                      {m.trained_at ? new Date(m.trained_at).toLocaleString() : 'never trained'}
                      {m.age_days != null && ` · ${Number(m.age_days).toFixed(1)}d old`}
                    </div>
                  </div>
                  <Badge variant={m.stale ? 'destructive' : 'outline'}>
                    {m.stale ? 'Stale' : 'Fresh'}
                  </Badge>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-400">No trained models yet</div>
        )}
      </CardContent>
    </Card>
  )
}
