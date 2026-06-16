'use client'

import { useEffect, useMemo, useState } from 'react'

const STOCK_CACHE_PREFIX = 'pia.stockIntelligence.cache.'
const AI_CACHE_PREFIX = 'pia.aiIntelligence.cache.'
const STOCK_CACHE_TTL_MS = 15 * 60 * 1000
const AI_CACHE_TTL_MS = 15 * 60 * 1000
const stockMemoryCache = new Map<string, { savedAt: number; payload: any }>()
const aiMemoryCache = new Map<string, { savedAt: number; payload: any }>()

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

function aiCacheKey(symbol: string) {
  return `${AI_CACHE_PREFIX}${symbol}`
}

function readCachedAi(symbol: string) {
  if (!symbol) return null
  const memory = aiMemoryCache.get(symbol)
  if (memory && Date.now() - memory.savedAt < AI_CACHE_TTL_MS) return memory.payload
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(aiCacheKey(symbol))
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed?.payload || Date.now() - Number(parsed.savedAt || 0) > AI_CACHE_TTL_MS) return null
    aiMemoryCache.set(symbol, { savedAt: parsed.savedAt, payload: parsed.payload })
    return parsed.payload
  } catch {
    return null
  }
}

function writeCachedAi(symbol: string, payload: any) {
  if (!symbol || !payload || payload.data_quality === 'no_data') return
  const entry = { savedAt: Date.now(), payload }
  aiMemoryCache.set(symbol, entry)
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(aiCacheKey(symbol), JSON.stringify(entry))
  } catch {}
}

function isUsableAi(payload: any) {
  return payload && payload.data_quality !== 'no_data' && payload.score != null
}

function trendLabel(score: unknown) {
  const value = numberValue(score)
  if (value == null) return 'Sideways'
  if (value >= 72) return 'Uptrend'
  if (value >= 58) return 'Trend Intact'
  if (value >= 42) return 'Sideways'
  return 'Deteriorating'
}

function riskLabel(score: unknown) {
  const value = numberValue(score)
  if (value == null) return 'Risk unavailable'
  if (value <= 35) return 'Contained volatility'
  if (value <= 60) return 'Moderate volatility'
  if (value <= 75) return 'Elevated volatility'
  return 'High volatility'
}

function aiMetricFields(ai: any) {
  if (!isUsableAi(ai)) return {}
  const metrics = ai.metrics || {}
  const asOf = ai.as_of
  const institutional = metrics.institutional_score ?? metrics.volume_score ?? 50
  return {
    ai_score: ai.score,
    intelligence_score: ai.score,
    ai_verdict: ai.verdict,
    ai_data_quality: ai.data_quality,
    ai_latency_ms: ai.latency_ms,
    ai_cache_hit: ai.cache_hit,
    momentum_score: metrics.momentum,
    momentum: metrics.momentum,
    trend_score: metrics.trend,
    trend_strength_score: metrics.trend,
    sentiment_score: metrics.sentiment,
    news_score: metrics.sentiment,
    risk_score: metrics.risk,
    risk: metrics.risk,
    institutional_score: institutional,
    institutional_flow_score: institutional,
    institutional_flow: metrics.institutional_flow_30d,
    relative_strength: metrics.relative_strength,
    relative_strength_score: metrics.relative_strength_score,
    volatility_30d: metrics.volatility_30d,
    fair_value: metrics.fair_value,
    targetMeanPrice: metrics.fair_value,
    short_interest_pct: metrics.short_interest_pct,
    beta: metrics.beta,
    volume_trend: metrics.relative_volume_30d != null ? `${metrics.relative_volume_30d}x relative volume` : undefined,
    sentiment: ai.verdict,
    data_quality: ai.data_quality,
    as_of: asOf,
    metric_sources: {
      momentum: 'Internal Calculation',
      trend: 'Internal Calculation',
      sentiment: ai.sources?.news === 'available' ? 'Yahoo' : 'Derived Signal',
      institutional: 'Derived Signal',
      fairValue: metrics.fair_value_source === 'analyst' ? 'Yahoo' : 'Internal Calculation',
      risk: 'Internal Calculation',
    },
    metric_updated_at: {
      momentum: asOf,
      trend: asOf,
      sentiment: asOf,
      institutional: asOf,
      fairValue: asOf,
      risk: asOf,
    },
    ai_metric_history: metrics.history || {},
    ai_reasons: ai.reasons || [],
  }
}

function mergeAiIntoPayload(payload: any, ai: any) {
  if (!isUsableAi(ai)) return payload
  const base = payload || { ticker: ai.symbol }
  const metrics = ai.metrics || {}
  const sourceFields = aiMetricFields(ai)
  const intelligence = base.intelligence || {}
  const overview = intelligence.overview || {}
  const technical = intelligence.technical || {}
  const targets = intelligence.targets || {}
  const fairValue = metrics.fair_value

  return {
    ...base,
    ticker: base.ticker || ai.symbol,
    ai_intelligence: ai,
    fundamentals: {
      ...(base.fundamentals || {}),
      fair_value: fairValue,
      targetMeanPrice: fairValue,
      beta: metrics.beta ?? base.fundamentals?.beta,
      short_interest_pct: metrics.short_interest_pct,
    },
    intelligence: {
      ...intelligence,
      overview: {
        ...overview,
        summary: (ai.reasons || []).join(' '),
        why_moving: ai.reasons?.[0] || overview.why_moving,
        momentum_state: metrics.momentum != null ? `Momentum score ${metrics.momentum}/100` : overview.momentum_state,
        volatility_state: riskLabel(metrics.risk),
        ai_verdict: ai.verdict,
        data_quality: ai.data_quality,
      },
      technical: {
        ...technical,
        trend: trendLabel(metrics.trend),
        trend_score: metrics.trend,
        momentum_score: metrics.momentum,
        sentiment_score: metrics.sentiment,
        risk_score: metrics.risk,
        day_change_pct: metrics.price_return_1d ?? technical.day_change_pct,
      },
      targets: {
        ...targets,
        base: fairValue ?? targets.base,
        average_target: fairValue ?? targets.average_target,
        targetMeanPrice: fairValue ?? targets.targetMeanPrice,
        high_target: metrics.target_high_price ?? targets.high_target,
        low_target: metrics.target_low_price ?? targets.low_target,
      },
      fundamentals: {
        ...(intelligence.fundamentals || {}),
        ...sourceFields,
      },
    },
  }
}

export function preloadStockIntelligence(ticker: unknown) {
  const symbol = cleanSymbol(ticker)
  if (!symbol) return
  if (!readCachedStock(symbol)) {
    fetch(`/api/stock/${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw body
        writeCachedStock(symbol, mergeAiIntoPayload(body, readCachedAi(symbol)))
      })
      .catch(() => {})
  }
  if (!readCachedAi(symbol)) {
    fetch(`/api/ai-intelligence/${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw body
        writeCachedAi(symbol, body)
      })
      .catch(() => {})
  }
}

function mergeStockPayload(stage: any, fresh: any) {
  if (!stage) return fresh
  if (!fresh) return stage
  const stageIntelligence = stage.intelligence || {}
  const freshIntelligence = fresh.intelligence || {}
  const ai = fresh.ai_intelligence || stage.ai_intelligence
  return {
    ...stage,
    ...fresh,
    ai_intelligence: ai,
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
  const cachedAi = readCachedAi(symbol)
  if (!cached) return mergeAiIntoPayload(seedPayload, cachedAi)
  if (!seedPayload) return mergeAiIntoPayload(cached, cachedAi)
  const cachedIntelligence: any = cached.intelligence || {}
  const seedIntelligence: any = seedPayload.intelligence || {}
  return mergeAiIntoPayload({
    ...cached,
    position: seedPayload.position || cached.position || null,
    watch: seedPayload.watch || cached.watch || null,
    fundamentals: { ...(cached.fundamentals || {}), ...(seedPayload.fundamentals || {}) },
    intelligence: {
      ...cachedIntelligence,
      company: { ...(cachedIntelligence.company || {}), ...(seedIntelligence.company || {}) },
      fundamentals: { ...(cachedIntelligence.fundamentals || {}), ...(seedIntelligence.fundamentals || {}) },
    },
  }, cachedAi)
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
    const hadCachedAi = Boolean(readCachedAi(symbol))
    setData(stage)
    setRevalidating(true)

    const applyAiPayload = (ai: any) => {
      if (!isUsableAi(ai)) return
      writeCachedAi(symbol, ai)
      if (!active) return
      setData((current: any) => {
        const base = current?.ticker && cleanSymbol(current.ticker) === symbol ? current : stage
        const merged = mergeAiIntoPayload(base, ai)
        writeCachedStock(symbol, merged)
        return merged
      })
    }

    const fetchAi = (refresh = false) =>
      fetch(`/api/ai-intelligence/${encodeURIComponent(symbol)}${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}))
          if (!response.ok) throw body
          return body
        })
        .then((ai) => {
          applyAiPayload(ai)
          return ai
        })

    fetchAi(false)
      .then((ai) => {
        if ((hadCachedAi || ai?.cache_hit) && active) fetchAi(true).catch(() => {})
      })
      .catch(() => {})

    fetch(`/api/stock/${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw body
        return body
      })
      .then((fresh) => {
        const merged = mergeAiIntoPayload(mergeStockPayload(stage, fresh), readCachedAi(symbol))
        writeCachedStock(symbol, merged)
        if (active) setData(merged)
      })
      .catch(() => {
        if (active) setData((current: any) => current || stage || null)
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
  const aiSource = aiMetricFields(effectiveData?.ai_intelligence)
  const source = {
    ...fundamentals,
    fundamentals: { ...fundamentals, ...intelligenceFundamentals },
    company,
    ...(watch || {}),
    ...(seedPosition || {}),
    ...(position || {}),
    ...aiSource,
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
