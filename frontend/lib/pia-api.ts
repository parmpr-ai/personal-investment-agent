export const API = 'http://127.0.0.1:8000'

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

export const safeMessage = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : typeof (value as { message?: string })?.message === 'string' ? (value as { message: string }).message : fallback

export async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${API}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw body
  return body
}
