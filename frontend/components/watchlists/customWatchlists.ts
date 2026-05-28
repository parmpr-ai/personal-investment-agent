import { useCallback, useEffect, useMemo, useState } from 'react'

export type CustomWatchlist = {
  id: string
  name: string
  symbols: string[]
}

export type WatchlistRow = Record<string, any> & {
  symbol: string
  name: string
  last: number
  day_change_pct: number
  day_pnl: number
}

const WATCHLISTS_KEY = 'pia.customWatchlists.v1'
const ACTIVE_WATCHLIST_KEY = 'pia.customWatchlists.active.v1'

const DEFAULT_WATCHLISTS: CustomWatchlist[] = [
  { id: 'ai-stocks', name: 'AI Stocks', symbols: [] },
  { id: 'crypto-related', name: 'Crypto Related', symbols: [] },
  { id: 'semiconductors', name: 'Semiconductors', symbols: [] },
  { id: 'swing-trades', name: 'Swing Trades', symbols: [] },
]

function normalizeSymbol(value: string) {
  return value.trim().split(/\s+/)[0].toUpperCase()
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function uniqueSymbols(symbols: string[]) {
  return Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)))
}

function normalizeLists(value: unknown): CustomWatchlist[] {
  if (!Array.isArray(value)) return DEFAULT_WATCHLISTS
  const lists = value
    .map((item: any) => {
      const name = String(item?.name || '').trim()
      if (!name) return null
      return {
        id: String(item?.id || slug(name) || `list-${Date.now()}`),
        name,
        symbols: uniqueSymbols(Array.isArray(item?.symbols) ? item.symbols : []),
      }
    })
    .filter(Boolean) as CustomWatchlist[]
  return lists.length ? lists : DEFAULT_WATCHLISTS
}

function readLists() {
  try {
    const raw = localStorage.getItem(WATCHLISTS_KEY)
    if (raw) return normalizeLists(JSON.parse(raw))
  } catch {}
  return DEFAULT_WATCHLISTS
}

function saveLists(lists: CustomWatchlist[]) {
  // TODO: sync custom watchlists to backend/user account storage when available.
  try { localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(lists)) } catch {}
}

function saveActive(id: string) {
  try { localStorage.setItem(ACTIVE_WATCHLIST_KEY, id) } catch {}
}

export function useCustomWatchlists() {
  const [lists, setLists] = useState<CustomWatchlist[]>(DEFAULT_WATCHLISTS)
  const [activeId, setActiveId] = useState(DEFAULT_WATCHLISTS[0].id)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = readLists()
    setLists(stored)
    try {
      const savedActive = localStorage.getItem(ACTIVE_WATCHLIST_KEY)
      setActiveId(stored.some((list) => list.id === savedActive) ? String(savedActive) : stored[0].id)
    } catch {
      setActiveId(stored[0].id)
    }
  }, [])

  const persist = useCallback((updater: (current: CustomWatchlist[]) => CustomWatchlist[], nextActive?: string) => {
    setLists((current) => {
      const next = updater(current)
      saveLists(next)
      if (nextActive) {
        setActiveId(nextActive)
        saveActive(nextActive)
      }
      return next
    })
  }, [])

  const selectList = useCallback((id: string) => {
    setActiveId(id)
    saveActive(id)
  }, [])

  const createList = useCallback((name: string) => {
    const cleanName = name.trim()
    if (!cleanName) return
    const idBase = slug(cleanName) || 'watchlist'
    setLists((current) => {
      const existing = current.find((list) => list.name.toLowerCase() === cleanName.toLowerCase())
      if (existing) {
        setActiveId(existing.id)
        saveActive(existing.id)
        return current
      }
      let id = idBase
      let suffix = 2
      while (current.some((list) => list.id === id)) {
        id = `${idBase}-${suffix}`
        suffix += 1
      }
      const next = [...current, { id, name: cleanName, symbols: [] }]
      saveLists(next)
      setActiveId(id)
      saveActive(id)
      return next
    })
  }, [])

  const addSymbol = useCallback((listId: string, rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol)
    if (!symbol) return
    persist((current) =>
      current.map((list) =>
        list.id === listId ? { ...list, symbols: uniqueSymbols([...list.symbols, symbol]) } : list,
      ),
    )
  }, [persist])

  const removeSymbol = useCallback((listId: string, rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol)
    persist((current) =>
      current.map((list) =>
        list.id === listId ? { ...list, symbols: list.symbols.filter((item) => item !== symbol) } : list,
      ),
    )
  }, [persist])

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeId) || lists[0],
    [lists, activeId],
  )

  return { lists, activeId, activeList, mounted, selectList, createList, addSymbol, removeSymbol }
}

export function buildWatchlistUniverse(dashboard: any, fallbackRows: any[] = []) {
  const map = new Map<string, any>()
  const add = (raw: any) => {
    const symbol = normalizeSymbol(String(raw?.symbol || raw?.ticker || ''))
    if (!symbol) return
    const previous = map.get(symbol) || {}
    map.set(symbol, { ...previous, ...raw, symbol })
  }

  ;(dashboard?.portfolio?.positions || []).forEach(add)
  ;(dashboard?.watchlist || []).forEach(add)
  ;(dashboard?.scanner || []).forEach(add)
  fallbackRows.forEach(add)
  return map
}

export function resolveWatchlistRows(symbols: string[], universe: Map<string, any>): WatchlistRow[] {
  return uniqueSymbols(symbols).map((symbol) => {
    const source = universe.get(symbol) || {}
    const last = Number(source.last ?? source.price ?? 0)
    const changePct = Number(source.day_change_pct ?? source.change_pct ?? source.change ?? 0)
    const dayPnl = Number(source.day_pnl ?? source.daily_change ?? (last * changePct) / 100)
    return {
      ...source,
      symbol,
      name: source.name || source.setup || symbol,
      last,
      price: last,
      day_change_pct: changePct,
      change_pct: changePct,
      day_pnl: dayPnl,
      risk: Number(source.risk || 0),
      momentum_score: Number(source.momentum_score ?? source.momentum ?? source.score ?? 0),
      portfolio_pct: Number(source.portfolio_pct || 0),
      sec_type: source.sec_type || source.asset_type || 'Watch',
      label: source.label || source.action || source.source || 'Watch',
    }
  })
}
