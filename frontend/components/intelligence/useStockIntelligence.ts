'use client'

import { useEffect, useMemo, useState } from 'react'

const STOCK_CACHE_PREFIX = 'pia.stockIntelligence.cache.'
const STOCK_CACHE_TTL_MS = 15 * 60 * 1000
const stockMemoryCache = new Map<string, { savedAt: number; payload: any }>()

function cleanSymbol(value: unknown): string {
  return String(value || '').trim().split(' ')[0].toUpperCase()
}

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

function matchesSymbol(row: any, symbol: string) {
  if (!row || !symbol) return false
  return [row.symbol, row.ticker, row.underlying].some((value) => cleanSymbol(value) === symbol)
}

function findDashboardSeed(dashboard: any, symbol: string) {
  const positions = Array.isArray(dashboard?.portfolio?.positions) ? dashboard.portfolio.positions : []
  const held = positions.find((row: any) => matchesSymbol(row, symbol))
  if (held) return held
  const watchlist = Array.isArray(dashboard?.watchlist) ? dashboard.watchlist : []
  return watchlist.find((row: any) => matchesSymbol(row, symbol)) || null
}

function compactCompany(seed: any) {
  if (!seed) return {}
  return {
    name: seed.name || seed.company,
    exchange: seed.exchange,
    asset_type: seed.asset_type || seed.sec_type,
    sector: seed.sector,
    logo_url: seed.logo_url || seed.logoUrl,
    logo: seed.logo,
  }
}

function marketSeed(seed: any) {
  if (!seed) return {}
  const last = seed.last ?? seed.price ?? seed.regularMarketPrice
  const open = seed.open ?? seed.regular_market_open ?? seed.regularMarketOpen
  const dayHigh = seed.day_high ?? seed.dayHigh ?? seed.regular_market_day_high ?? seed.regularMarketDayHigh ?? seed.high
  const dayLow = seed.day_low ?? seed.dayLow ?? seed.regular_market_day_low ?? seed.regularMarketDayLow ?? seed.low
  const previousClose = seed.previous_close ?? seed.prev_close ?? seed.prior_close ?? seed.regularMarketPreviousClose
  const volume = seed.volume ?? seed.regularMarketVolume
  const avgVolume = seed.avg_volume ?? seed.average_volume ?? seed.averageVolume ?? seed.averageDailyVolume3Month
  const out: Record<string, unknown> = {}
  if (last != null && last !== '') {
    out.last = last
    out.price = last
    out.regularMarketPrice = last
  }
  if (open != null && open !== '') {
    out.open = open
    out.regularMarketOpen = open
  }
  if (dayHigh != null && dayHigh !== '') {
    out.day_high = dayHigh
    out.dayHigh = dayHigh
    out.regularMarketDayHigh = dayHigh
  }
  if (dayLow != null && dayLow !== '') {
    out.day_low = dayLow
    out.dayLow = dayLow
    out.regularMarketDayLow = dayLow
  }
  if (previousClose != null && previousClose !== '') {
    out.previous_close = previousClose
    out.prev_close = previousClose
    out.regularMarketPreviousClose = previousClose
  }
  if (volume != null && volume !== '') {
    out.volume = volume
    out.regularMarketVolume = volume
  }
  if (avgVolume != null && avgVolume !== '') {
    out.avg_volume = avgVolume
    out.averageVolume = avgVolume
    out.averageDailyVolume3Month = avgVolume
  }
  if (out.day_low != null && out.day_high != null) out.today_range = [out.day_low, out.day_high]
  if (seed.currency) out.currency = seed.currency
  return out
}

function buildSeedPayload(symbol: string, seed: Record<string, unknown> | null | undefined) {
  if (!symbol || !seed) return null
  const holding = isHoldingPosition(seed) ? seed : null
  return {
    ticker: symbol,
    position: holding,
    watch: holding ? null : seed,
    fundamentals: marketSeed(seed),
    intelligence: {
      company: compactCompany(seed),
      fundamentals: {},
    },
    news_intelligence: { items: [], digest: '', is_demo: false },
    __hydration: 'dashboard',
  }
}

function cacheKey(symbol: string) {
  return `${STOCK_CACHE_PREFIX}${symbol}`
}

function readCachedStock(symbol: string) {
  if (!symbol) return null
  const memory = stockMemoryCache.get(symbol)
  if (memory && Date.now() - memory.savedAt < STOCK_CACHE_TTL_MS) return memory.payload
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(cacheKey(symbol))
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed?.payload || Date.now() - Number(parsed.savedAt || 0) > STOCK_CACHE_TTL_MS) return null
    stockMemoryCache.set(symbol, { savedAt: parsed.savedAt, payload: parsed.payload })
    return parsed.payload
  } catch {
    return null
  }
}

function writeCachedStock(symbol: string, payload: any) {
  if (!symbol || !payload) return
  const entry = { savedAt: Date.now(), payload }
  stockMemoryCache.set(symbol, entry)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(cacheKey(symbol), JSON.stringify(entry))
  } catch {}
}

export function preloadStockIntelligence(ticker: unknown) {
  const symbol = cleanSymbol(ticker)
  if (!symbol || readCachedStock(symbol)) return
  fetch(`/api/stock/${encodeURIComponent(symbol)}`, { cache: 'no-store' })
    .then(async (response) => {
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw body
      writeCachedStock(symbol, body)
    })
    .catch(() => {})
}

function mergeStockPayload(stage: any, fresh: any) {
  if (!stage) return fresh
  if (!fresh) return stage
  const stageIntelligence = stage.intelligence || {}
  const freshIntelligence = fresh.intelligence || {}
  return {
    ...stage,
    ...fresh,
    position: fresh.position || stage.position || null,
    watch: fresh.watch || stage.watch || null,
    fundamentals: { ...(stage.fundamentals || {}), ...(fresh.fundamentals || {}) },
    intelligence: {
      ...stageIntelligence,
      ...freshIntelligence,
      company: { ...(stageIntelligence.company || {}), ...(freshIntelligence.company || {}) },
      fundamentals: { ...(stageIntelligence.fundamentals || {}), ...(freshIntelligence.fundamentals || {}) },
    },
    news_intelligence: fresh.news_intelligence || stage.news_intelligence,
  }
}

function buildStagePayload(symbol: string, seed: Record<string, unknown> | null | undefined) {
  const seedPayload = buildSeedPayload(symbol, seed)
  const cached = readCachedStock(symbol)
  if (!cached) return seedPayload
  if (!seedPayload) return cached
  const cachedIntelligence: any = cached.intelligence || {}
  const seedIntelligence: any = seedPayload.intelligence || {}
  return {
    ...cached,
    position: seedPayload.position || cached.position || null,
    watch: seedPayload.watch || cached.watch || null,
    fundamentals: { ...(cached.fundamentals || {}), ...(seedPayload.fundamentals || {}) },
    intelligence: {
      ...cachedIntelligence,
      company: { ...(cachedIntelligence.company || {}), ...(seedIntelligence.company || {}) },
      fundamentals: { ...(cachedIntelligence.fundamentals || {}), ...(seedIntelligence.fundamentals || {}) },
    },
  }
}

function seedSignature(seed: Record<string, unknown> | null | undefined) {
  if (!seed) return ''
  return JSON.stringify({
    symbol: seed.symbol,
    ticker: seed.ticker,
    underlying: seed.underlying,
    last: seed.last,
    price: seed.price,
    open: seed.open,
    day_high: seed.day_high ?? seed.dayHigh,
    day_low: seed.day_low ?? seed.dayLow,
    previous_close: seed.previous_close ?? seed.prev_close,
    volume: seed.volume,
    avg_volume: seed.avg_volume ?? seed.averageVolume,
    qty: seed.qty ?? seed.quantity ?? seed.shares,
    market_value: seed.market_value,
    cost_basis: seed.cost_basis,
  })
}

export function useStockIntelligence(ticker: string, seedPosition?: Record<string, unknown> | null, dashboard?: any) {
  const symbol = cleanSymbol(ticker)
  const dashboardSeed = useMemo(() => findDashboardSeed(dashboard, symbol), [dashboard, symbol])
  const stageSeed = (isHoldingPosition(seedPosition) ? seedPosition : null) || dashboardSeed || seedPosition || null
  const stageSeedSignature = seedSignature(stageSeed)
  const stageData = useMemo(() => buildStagePayload(symbol, stageSeed), [symbol, stageSeedSignature])
  const [data, setData] = useState<any>(() => stageData)
  const [revalidating, setRevalidating] = useState(!stageData)

  useEffect(() => {
    if (!symbol) return
    let active = true
    const stage = buildStagePayload(symbol, stageSeed)
    setData(stage)
    setRevalidating(true)
    fetch(`/api/stock/${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw body
        return body
      })
      .then((fresh) => {
        const merged = mergeStockPayload(stage, fresh)
        writeCachedStock(symbol, merged)
        if (active) setData(merged)
      })
      .catch(() => {
        if (active) setData(stage || null)
      })
      .finally(() => {
        if (active) setRevalidating(false)
      })
    return () => {
      active = false
    }
  }, [symbol, stageSeedSignature])

  const effectiveData = data?.ticker && cleanSymbol(data.ticker) === symbol ? data : stageData
  const position = effectiveData?.position || (isHoldingPosition(stageSeed) ? stageSeed : null)
  const watch = effectiveData?.watch || null
  const fundamentals = effectiveData?.fundamentals || {}
  const intelligenceFundamentals = effectiveData?.intelligence?.fundamentals || {}
  const company = effectiveData?.intelligence?.company || {}
  const source = {
    ...fundamentals,
    fundamentals: { ...fundamentals, ...intelligenceFundamentals },
    company,
    ...(watch || {}),
    ...(seedPosition || {}),
    ...(position || {}),
    symbol: effectiveData?.ticker || position?.symbol || watch?.symbol || seedPosition?.symbol || ticker,
  }

  return {
    data: effectiveData,
    loading: revalidating && !effectiveData,
    revalidating,
    position,
    watch,
    source,
    intelligence: effectiveData?.intelligence || null,
    newsIntelligence: effectiveData?.news_intelligence || { items: [], digest: '', is_demo: false },
    thesis: effectiveData?.thesis || [],
    forecast: effectiveData?.forecast || {},
  }
}
