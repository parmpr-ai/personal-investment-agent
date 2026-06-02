'use client'

import { useEffect, useState } from 'react'
import { fetchJson } from '../../lib/pia-api'

export function useStockIntelligence(ticker: string, seedPosition?: Record<string, unknown> | null) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const symbol = String(ticker || '').split(' ')[0]
    if (!symbol) return
    setLoading(true)
    fetchJson(`/stock/${encodeURIComponent(symbol)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [ticker])

  const position = data?.position || seedPosition || null
  const watch = data?.watch || null
  const fundamentals = data?.fundamentals || {}
  const intelligenceFundamentals = data?.intelligence?.fundamentals || {}
  const company = data?.intelligence?.company || {}
  const source = {
    ...fundamentals,
    fundamentals: { ...fundamentals, ...intelligenceFundamentals },
    company,
    ...(watch || {}),
    ...(seedPosition || {}),
    ...(position || {}),
    symbol: data?.ticker || position?.symbol || watch?.symbol || seedPosition?.symbol || ticker,
  }

  return {
    data,
    loading,
    position,
    watch,
    source,
    intelligence: data?.intelligence || null,
    newsIntelligence: data?.news_intelligence || { items: [], digest: '', is_demo: false },
    thesis: data?.thesis || [],
    forecast: data?.forecast || {},
  }
}
