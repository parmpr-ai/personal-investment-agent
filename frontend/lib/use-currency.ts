import { useEffect, useState } from 'react'

export type Currency = 'USD' | 'EUR'

const LS_KEY = 'pia.currency'
const SYMBOLS: Record<Currency, string> = { USD: '$', EUR: '€' }

export function useCurrency(fxRate: number) {
  const [currency, setCurrency] = useState<Currency>('USD')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as Currency | null
      if (saved === 'USD' || saved === 'EUR') setCurrency(saved)
    } catch {}
  }, [])

  const toggle = () => {
    const next: Currency = currency === 'USD' ? 'EUR' : 'USD'
    setCurrency(next)
    try { localStorage.setItem(LS_KEY, next) } catch {}
  }

  const fmt = (value: unknown): string => {
    const rate = currency === 'EUR' ? (fxRate || 0.87) : 1
    return (Number(value || 0) * rate).toLocaleString('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    })
  }

  const symbol = SYMBOLS[currency]

  return { currency, toggle, fmt, symbol }
}
