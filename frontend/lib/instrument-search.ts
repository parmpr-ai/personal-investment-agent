'use client'

export type InstrumentMatch = {
  symbol: string
  name?: string
  asset_type?: string
  currency?: string
  exchange?: string
  quote_type?: string
  source?: string
}

export type InstrumentSearchResult = {
  query: string
  matches: InstrumentMatch[]
  requestUrl: string
  responseStatus: number
  bodySample: unknown
}

export class InstrumentSearchFailure extends Error {
  requestUrl: string
  responseStatus?: number
  bodySample?: unknown
  network: boolean

  constructor(message: string, details: { requestUrl: string; responseStatus?: number; bodySample?: unknown; network?: boolean }) {
    super(message)
    this.name = 'InstrumentSearchFailure'
    this.requestUrl = details.requestUrl
    this.responseStatus = details.responseStatus
    this.bodySample = details.bodySample
    this.network = Boolean(details.network)
  }
}

function absoluteUrl(path: string) {
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.href).href
}

function normalizeMatches(payload: any): InstrumentMatch[] {
  const matches = Array.isArray(payload?.matches) ? payload.matches : []
  return matches
    .map((item: any) => ({
      symbol: String(item?.symbol || '').trim().toUpperCase(),
      name: String(item?.name || item?.shortname || item?.longname || item?.symbol || '').trim(),
      asset_type: String(item?.asset_type || item?.assetType || 'Stock'),
      currency: String(item?.currency || 'USD').trim().toUpperCase(),
      exchange: item?.exchange ? String(item.exchange) : '',
      quote_type: item?.quote_type ? String(item.quote_type) : item?.quoteType ? String(item.quoteType) : '',
      source: item?.source ? String(item.source) : '',
    }))
    .filter((item: InstrumentMatch) => item.symbol)
}

function bodySample(payload: any) {
  if (payload?.body_sample != null) return payload.body_sample
  if (Array.isArray(payload?.matches)) return payload.matches.slice(0, 3)
  return payload
}

function detailMessage(payload: any, fallback: string) {
  if (typeof payload?.detail === 'string' && payload.detail.trim()) return payload.detail
  if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message
  return fallback
}

export async function searchInstruments(query: string, limit = 8): Promise<InstrumentSearchResult> {
  const q = query.trim()
  if (!q) {
    return { query: q, matches: [], requestUrl: '', responseStatus: 0, bodySample: null }
  }

  const path = `/api/instruments/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}`
  const requestUrl = absoluteUrl(path)

  let response: Response
  try {
    response = await fetch(path, { cache: 'no-store' })
  } catch (error: any) {
    throw new InstrumentSearchFailure(`Instrument search network request failed for ${requestUrl}.`, {
      requestUrl,
      network: true,
      bodySample: error?.message || String(error),
    })
  }

  const body = await response.json().catch(() => ({}))
  const backendRequestUrl = typeof body?.request_url === 'string' ? body.request_url : requestUrl
  const responseStatus = Number(body?.response_status || response.status)
  const sample = bodySample(body)

  if (!response.ok) {
    throw new InstrumentSearchFailure(detailMessage(body, `Instrument search returned HTTP ${response.status}.`), {
      requestUrl: backendRequestUrl,
      responseStatus,
      bodySample: sample,
      network: response.status === 502,
    })
  }

  return {
    query: String(body?.query || q),
    matches: normalizeMatches(body),
    requestUrl: backendRequestUrl,
    responseStatus,
    bodySample: sample,
  }
}

export function instrumentSearchErrorMessage(error: unknown, fallback = 'Instrument search is unavailable right now.') {
  if (error instanceof InstrumentSearchFailure) {
    if (error.message.trim()) return error.message
    if (error.network) return `Instrument search could not reach ${error.requestUrl}.`
    if (error.responseStatus) return `Instrument search returned HTTP ${error.responseStatus}.`
  }
  if (typeof (error as { detail?: unknown })?.detail === 'string') return String((error as { detail: string }).detail)
  if (typeof (error as { message?: unknown })?.message === 'string') return String((error as { message: string }).message)
  return fallback
}
