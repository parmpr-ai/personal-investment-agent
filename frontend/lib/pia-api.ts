const configuredApi = process.env.NEXT_PUBLIC_PIA_API?.trim().replace(/\/$/, '')

export const getApiBase = () => {
  if (configuredApi) return configuredApi
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:8000`
  return ''
}

export const API = getApiBase()

export const mask = '••••••'

export const assetTypes = ['Stock', 'ETF', 'Crypto', 'Option', 'Other']
export const brokers = ['IBKR', 'Freedom24', 'Revolut', 'Manual']

export const emptyHolding = {
  ticker: '',
  name: '',
  asset_type: 'Stock',
  broker: 'Manual',
  quantity: '',
  avg_price: '',
  currency: 'USD',
  notes: '',
}

export const money = (value: unknown) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

export const pct = (value: unknown) => `${Number(value || 0).toFixed(2)}%`

export function dedupePortfolioPositions(rows: any[] = []) {
  const grouped = new Map<string, any>()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const accountId = String(row.accountId || row.account_id || row.account || '').trim()
    const symbol = String(row.symbol || row.underlying || row.contractDesc || row.contract_desc || row.ticker || '').trim().toUpperCase()
    const conid = String(row.conid || row.conId || row.con_id || row.contract_id || '').trim()
    const assetClass = String(row.assetClass || row.asset_class || row.sec_type || row.asset_type || 'STK').trim().toUpperCase()
    const currency = String(row.currency || 'USD').trim().toUpperCase()
    const key = [accountId, symbol, conid, assetClass, currency].join('|')
    const existing = grouped.get(key)
    const qty = Number(row.qty ?? row.quantity ?? row.position ?? 0)
    const marketValue = Number(row.market_value ?? row.marketValue ?? row.mktValue ?? 0)
    const unrealized = Number(row.unrealized ?? row.unrealizedPnl ?? row.unrealPnl ?? 0)
    const realized = Number(row.realized ?? row.realizedPnl ?? row.realPnl ?? 0)
    const costBasis = Number(row.cost_basis ?? row.costBasis ?? 0)
    const multiplier = Number(row.multiplier ?? (assetClass === 'OPT' ? 100 : 1) ?? 1)
    const weightedAvg = Number(row.avg_price ?? row.avgPrice ?? row.averageCost ?? 0) * qty * multiplier || costBasis
    const weightedLast = Number(row.last ?? row.lastPrice ?? row.mktPrice ?? 0) * qty || marketValue
    if (!existing) {
      grouped.set(key, {
        ...row,
        qty,
        quantity: qty,
        market_value: marketValue,
        unrealized,
        realized,
        cost_basis: costBasis || (qty ? Number((weightedAvg).toFixed(2)) : 0),
        _weighted_avg_sum: weightedAvg,
        _weighted_last_sum: weightedLast,
        _weighted_qty: qty * multiplier || multiplier,
      })
      continue
    }
    existing.qty = Number(existing.qty || 0) + qty
    existing.quantity = existing.qty
    existing.market_value = Number(existing.market_value || 0) + marketValue
    existing.unrealized = Number(existing.unrealized || 0) + unrealized
    existing.realized = Number(existing.realized || 0) + realized
    existing.cost_basis = Number(existing.cost_basis || 0) + costBasis
    existing._weighted_avg_sum = Number(existing._weighted_avg_sum || 0) + weightedAvg
    existing._weighted_last_sum = Number(existing._weighted_last_sum || 0) + weightedLast
    existing._weighted_qty = Number(existing._weighted_qty || 0) + (qty * multiplier || multiplier)
    existing.last = Number(row.last ?? row.lastPrice ?? row.mktPrice ?? existing.last ?? 0)
  }
  return Array.from(grouped.values()).map((row) => {
    const qty = Number(row.qty || 0)
    const weightedQty = Number(row._weighted_qty || 0)
    const weightedAvg = Number(row._weighted_avg_sum || 0)
    const weightedLast = Number(row._weighted_last_sum || 0)
    const avg = weightedQty ? weightedAvg / weightedQty : Number(row.avg_price || row.avgPrice || row.averageCost || 0)
    const last = qty ? weightedLast / qty : Number(row.last || row.lastPrice || row.mktPrice || 0)
    const costBasis = Number(row.cost_basis || 0)
    const unrealized = Number(row.unrealized || 0)
    const marketValue = Number(row.market_value || 0)
    return {
      ...row,
      qty,
      quantity: qty,
      avg_price: Number(avg.toFixed(4)),
      last: Number(last.toFixed(4)),
      market_value: Number(marketValue.toFixed(2)),
      cost_basis: Number(costBasis.toFixed(2)),
      unrealized: Number(unrealized.toFixed(2)),
      unrealized_pct: costBasis ? Number(((unrealized / costBasis) * 100).toFixed(2)) : 0,
      portfolio_pct: Number(row.portfolio_pct || 0),
    }
  })
}

export function portfolioSourceBadgeLabel(source: unknown, mode?: unknown) {
  const raw = String(source || mode || '').toUpperCase()
  if (raw === 'IBKR_LIVE') return 'IBKR LIVE'
  if (raw === 'LAST_UPDATE') return 'LAST UPDATE'
  if (raw === 'MOCK' || raw === 'MOCK_FALLBACK') return 'MOCK'
  if (String(mode || '').toLowerCase() === 'last-update') return 'LAST UPDATE'
  if (String(mode || '').toLowerCase() === 'ibkr-live') return 'IBKR LIVE'
  return 'MOCK'
}

export function resolvePositionKey(position: any, index: number): string {
  const source = String(position.source || position.broker || '')
  const acctId = String(position.accountId || position.account_id || position.account || '')
  const conid = String(position.conid || position.conId || position.con_id || '')
  const assetClass = String(position.assetClass || position.asset_class || position.sec_type || 'STK').toUpperCase()
  const contractDesc = String(position.contractDesc || position.contract_desc || '')
  const symbol = String(position.symbol || position.ticker || '')
  const currency = String(position.currency || '')
  return `position:${source}:${acctId}:${conid}:${assetClass}:${contractDesc}:${symbol}:${currency}:${index}`
}

export function resolveAssetClass(p: any): 'stock' | 'option' | 'crypto' {
  const raw = String(p.asset_class || p.assetClass || p.sec_type || p.asset_type || '').trim().toUpperCase()
  const sym = String(p.symbol || p.ticker || '')
  if (raw === 'OPT' || raw === 'OPTION' || raw === 'OPTIONS' || p.instrument_type === 'OPT' || sym.includes(' ')) return 'option'
  if (raw === 'CRYPTO' || raw === 'CRYPTOCURRENCY') return 'crypto'
  return 'stock'
}

export const safeMessage = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : typeof (value as { message?: string })?.message === 'string' ? (value as { message: string }).message : fallback

export async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${getApiBase()}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw body
  return body
}
