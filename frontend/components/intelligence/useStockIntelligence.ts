'use client'

import { useEffect, useState } from 'react'
import { fetchJson } from '../../lib/pia-api'

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function isHoldingPosition(value: Record<string, unknown> | null | undefined) {
  if (!value) return false
  const shares = numberValue(value.quantity ?? value.qty ?? value.shares)
  if (shares != null && Math.abs(shares) > 0) return true
  const marketValue = numberValue(value.market_value ?? value.mktvalue)
  const costBasis = numberValue(value.cost_basis)
  return Boolean(value.manual) || Boolean((marketValue != null && Math.abs(marketValue) > 0) || (costBasis != null && Math.abs(costBasis) > 0))
}

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

  const position = data?.position || (isHoldingPosition(seedPosition) ? seedPosition : null)
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
