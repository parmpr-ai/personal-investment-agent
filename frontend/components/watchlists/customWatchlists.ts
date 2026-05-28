import { useCallback, useEffect, useMemo, useState } from 'react'

export type CustomWatchlist = {
  id: string
  name: string
  tickers: string[]
  symbols: string[]
  viewMode: 'table' | 'list'
  columns: {
    instrument: boolean
    last: boolean
    change: boolean
    changePercent: boolean
    volume: boolean
  }
  order?: number
}

export type WatchlistRow = Record<string, any> & {
  symbol: string
  name: string
  last: number
  day_change_pct: number
  day_pnl: number
}

const WATCHLISTS_KEY = 'pia.customWatchlists.v1'
const WATCHLISTS_V1_KEY = 'pia.watchlists.v1'
const ACTIVE_WATCHLIST_KEY = 'pia.customWatchlists.active.v1'
const DEFAULT_COLUMNS = {
  instrument: true,
  last: true,
  change: true,
  changePercent: true,
  volume: true,
}

const DEFAULT_WATCHLISTS: CustomWatchlist[] = [
  { id: 'favorites', name: 'Favorites', tickers: ['NVDA', 'NBIS', 'META', 'AVGO'], symbols: ['NVDA', 'NBIS', 'META', 'AVGO'], viewMode: 'table', columns: DEFAULT_COLUMNS, order: 0 },
  { id: 'tech', name: 'Tech', tickers: ['TSM', 'IONQ', 'QBTS', 'INOD'], symbols: ['TSM', 'IONQ', 'QBTS', 'INOD'], viewMode: 'table', columns: DEFAULT_COLUMNS, order: 1 },
  { id: 'fintech', name: 'Fintech', tickers: ['SOFI', 'ZETA', 'PLTR'], symbols: ['SOFI', 'ZETA', 'PLTR'], viewMode: 'list', columns: DEFAULT_COLUMNS, order: 2 },
  { id: 'swing', name: 'Swing', tickers: ['NKE', 'AMD', 'IREN'], symbols: ['NKE', 'AMD', 'IREN'], viewMode: 'table', columns: DEFAULT_COLUMNS, order: 3 },
]

const FALLBACK_INSTRUMENTS: Record<string, Partial<WatchlistRow>> = {
  AMD: { name: 'Advanced Micro Devices', exchange: 'NASDAQ', last: 162.34, day_change_pct: 1.12, day_pnl: 1.8, volume: 59800000 },
  NVDA: { name: 'NVIDIA Corp.', exchange: 'NASDAQ', last: 126.8, day_change_pct: 1.84, day_pnl: 2.29, volume: 95000000 },
  NBIS: { name: 'Nebius Group', exchange: 'NASDAQ', last: 42.18, day_change_pct: -0.74, day_pnl: -0.32, volume: 6800000 },
  META: { name: 'Meta Platforms', exchange: 'NASDAQ', last: 642.7, day_change_pct: 0.38, day_pnl: 2.44, volume: 12100000 },
  AVGO: { name: 'Broadcom Inc.', exchange: 'NASDAQ', last: 241.16, day_change_pct: 0.92, day_pnl: 2.2, volume: 27500000 },
  TSM: { name: 'Taiwan Semiconductor', exchange: 'NYSE', last: 198.44, day_change_pct: 0.51, day_pnl: 1.01, volume: 11200000 },
  IONQ: { name: 'IonQ Inc.', exchange: 'NYSE', last: 38.24, day_change_pct: 2.64, day_pnl: 0.98, volume: 15400000 },
  QBTS: { name: 'D-Wave Quantum', exchange: 'NYSE', last: 12.31, day_change_pct: -1.42, day_pnl: -0.18, volume: 9100000 },
  INOD: { name: 'Innodata Inc.', exchange: 'NASDAQ', last: 49.8, day_change_pct: 1.07, day_pnl: 0.53, volume: 1900000 },
  SOFI: { name: 'SoFi Technologies', exchange: 'NASDAQ', last: 15.24, day_change_pct: 0.81, day_pnl: 0.12, volume: 38400000 },
  ZETA: { name: 'Zeta Global', exchange: 'NYSE', last: 18.64, day_change_pct: -0.37, day_pnl: -0.07, volume: 3200000 },
  PLTR: { name: 'Palantir Technologies', exchange: 'NASDAQ', last: 124.45, day_change_pct: 1.36, day_pnl: 1.67, volume: 74100000 },
  NKE: { name: 'Nike Inc.', exchange: 'NYSE', last: 72.18, day_change_pct: -0.62, day_pnl: -0.45, volume: 7800000 },
  IREN: { name: 'Iris Energy', exchange: 'NASDAQ', last: 10.5, day_change_pct: 3.08, day_pnl: 0.31, volume: 8500000 },
}

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
    .map((item: any, index: number) => {
      const name = String(item?.name || '').trim()
      if (!name) return null
      const tickers = uniqueSymbols(Array.isArray(item?.tickers) ? item.tickers : Array.isArray(item?.symbols) ? item.symbols : [])
      return {
        id: String(item?.id || slug(name) || `list-${Date.now()}`),
        name,
        tickers,
        symbols: tickers,
        viewMode: item?.viewMode === 'list' || item?.viewMode === 'cards' ? 'list' : 'table',
        columns: { ...DEFAULT_COLUMNS, ...(item?.columns || {}) },
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
      }
    })
    .filter(Boolean) as CustomWatchlist[]
  return lists.length ? lists.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)) : DEFAULT_WATCHLISTS
}

function readLists() {
  try {
    const raw = localStorage.getItem(WATCHLISTS_V1_KEY) || localStorage.getItem(WATCHLISTS_KEY)
    if (raw) return normalizeLists(JSON.parse(raw))
  } catch {}
  return DEFAULT_WATCHLISTS
}

function saveLists(lists: CustomWatchlist[]) {
  // TODO: sync custom watchlists to backend/user account storage when available.
  try {
    localStorage.setItem(WATCHLISTS_V1_KEY, JSON.stringify(lists))
    localStorage.setItem(WATCHLISTS_KEY, JSON.stringify(lists))
  } catch {}
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
      const next = [...current, { id, name: cleanName, tickers: [], symbols: [], viewMode: 'table' as const, columns: DEFAULT_COLUMNS, order: current.length }]
      saveLists(next)
      setActiveId(id)
      saveActive(id)
      return next
    })
  }, [])

  const addSymbol = useCallback((listId: string, rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol)
    if (!symbol) return false
    let added = false
    persist((current) =>
      current.map((list) => {
        if (list.id !== listId) return list
        added = !(list.tickers || list.symbols || []).includes(symbol)
        const tickers = uniqueSymbols([...(list.tickers || list.symbols || []), symbol])
        return { ...list, tickers, symbols: tickers }
      }),
    )
    return added
  }, [persist])

  const removeSymbol = useCallback((listId: string, rawSymbol: string) => {
    const symbol = normalizeSymbol(rawSymbol)
    persist((current) =>
      current.map((list) =>
        list.id === listId ? { ...list, tickers: list.tickers.filter((item) => item !== symbol), symbols: list.tickers.filter((item) => item !== symbol) } : list,
      ),
    )
  }, [persist])

  const removeSymbols = useCallback((listId: string, rawSymbols: string[]) => {
    const symbols = new Set(rawSymbols.map(normalizeSymbol))
    persist((current) =>
      current.map((list) => {
        if (list.id !== listId) return list
        const tickers = list.tickers.filter((item) => !symbols.has(item))
        return { ...list, tickers, symbols: tickers }
      }),
    )
  }, [persist])

  const renameList = useCallback((listId: string, name: string) => {
    const cleanName = name.trim()
    if (!cleanName) return
    persist((current) => current.map((list) => list.id === listId ? { ...list, name: cleanName } : list))
  }, [persist])

  const deleteList = useCallback((listId: string) => {
    setLists((current) => {
      const next = current.filter((list) => list.id !== listId)
      const safeNext = next.length ? next : DEFAULT_WATCHLISTS
      const nextActive = safeNext[0].id
      saveLists(safeNext)
      setActiveId(nextActive)
      saveActive(nextActive)
      return safeNext
    })
  }, [])

  const setListViewMode = useCallback((listId: string, viewMode: 'table' | 'list') => {
    persist((current) => current.map((list) => list.id === listId ? { ...list, viewMode } : list))
  }, [persist])

  const toggleColumn = useCallback((listId: string, key: keyof CustomWatchlist['columns']) => {
    persist((current) => current.map((list) => {
      if (list.id !== listId) return list
      return { ...list, columns: { ...list.columns, [key]: !list.columns[key] } }
    }))
  }, [persist])

  const reorderSymbol = useCallback((listId: string, from: number, to: number) => {
    persist((current) => current.map((list) => {
      if (list.id !== listId) return list
      const tickers = [...list.tickers]
      const [item] = tickers.splice(from, 1)
      if (!item) return list
      tickers.splice(Math.max(0, Math.min(to, tickers.length)), 0, item)
      return { ...list, tickers, symbols: tickers }
    }))
  }, [persist])

  const activeList = useMemo(
    () => lists.find((list) => list.id === activeId) || lists[0],
    [lists, activeId],
  )

  return { lists, activeId, activeList, mounted, selectList, createList, renameList, deleteList, addSymbol, removeSymbol, removeSymbols, setListViewMode, toggleColumn, reorderSymbol }
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
  Object.entries(FALLBACK_INSTRUMENTS).forEach(([symbol, data]) => add({ symbol, ...data }))
  fallbackRows.forEach(add)
  return map
}

export function resolveWatchlistRows(symbols: string[], universe: Map<string, any>): WatchlistRow[] {
  return uniqueSymbols(symbols).map((symbol) => {
    const source = universe.get(symbol) || {}
    const last = Number(source.last ?? source.price ?? 0)
    const changePct = Number(source.day_change_pct ?? source.change_pct ?? source.change ?? 0)
    const dayPnl = Number(source.day_pnl ?? source.daily_change ?? (last * changePct) / 100)
    const fallback = FALLBACK_INSTRUMENTS[symbol] || {}
    return {
      ...fallback,
      ...source,
      symbol,
      ticker: symbol,
      name: source.name || source.company || source.setup || fallback.name || symbol,
      exchange: source.exchange || source.market || fallback.exchange || 'NASDAQ',
      last,
      price: last,
      day_change_pct: changePct,
      change_pct: changePct,
      change: dayPnl,
      day_pnl: dayPnl,
      volume: Number(source.volume ?? source.vol ?? fallback.volume ?? 0),
      risk: Number(source.risk || 0),
      momentum_score: Number(source.momentum_score ?? source.momentum ?? source.score ?? 0),
      portfolio_pct: Number(source.portfolio_pct || 0),
      sec_type: source.sec_type || source.asset_type || 'Watch',
      label: source.label || source.action || source.source || 'Watch',
    }
  })
}
