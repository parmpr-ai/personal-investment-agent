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

export const safeMessage = (value: unknown, fallback: string) =>
  typeof value === 'string' ? value : typeof (value as { message?: string })?.message === 'string' ? (value as { message: string }).message : fallback

export async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${getApiBase()}${path}`, init)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw body
  return body
}
