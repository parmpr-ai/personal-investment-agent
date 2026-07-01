'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Brain, TrendingUp, RefreshCw } from 'lucide-react'

interface ModelStatus {
  strategy: string
  trained_at: string
  age_days: number
  stale: boolean
  file: string
}

export default function AgentTrainingStatusWidget() {
  const [models, setModels] = useState<ModelStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadStatus = async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8001/agent/ml/status')
      if (res.ok) {
        const data = await res.json()
        setModels(Array.isArray(data) ? data : [])
      }
    } catch (error) {
      console.error('Failed to load ML status:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-4 text-gray-500">Loading...</div>
  }

  const freshModels = models.filter((m) => !m.stale).length
  const totalModels = models.length

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              ML Training Status
            </CardTitle>
            <CardDescription>Model training and freshness</CardDescription>
          </div>
          <Badge variant={freshModels === totalModels ? 'default' : 'secondary'}>
            {freshModels}/{totalModels} Fresh
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="p-2 bg-green-50 rounded">
            <p className="text-xs text-gray-600">Fresh Models</p>
            <p className="text-lg font-bold text-green-600">{freshModels}</p>
          </div>
          <div className="p-2 bg-orange-50 rounded">
            <p className="text-xs text-gray-600">Avg Age</p>
            <p className="text-lg font-bold text-orange-600">
              {models.length > 0
                ? (models.reduce((sum, m) => sum + m.age_days, 0) / models.length).toFixed(1)
                : 0}d
            </p>
          </div>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {models.map((model) => (
            <div
              key={model.strategy}
              className="p-2 border border-gray-200 rounded-md bg-gray-50 flex items-center justify-between"
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{model.strategy}</p>
                <p className="text-xs text-gray-500">
                  {model.age_days.toFixed(1)}d old • {new Date(model.trained_at).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={model.stale ? 'destructive' : 'outline'}>
                {model.stale ? 'Stale' : 'Fresh'}
              </Badge>
            </div>
          ))}
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
