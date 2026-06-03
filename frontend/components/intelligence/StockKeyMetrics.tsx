'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ChevronDown, GripVertical, Pencil } from 'lucide-react'
import { mask } from '../../lib/pia-api'

type Fmt = 'price' | 'compact' | 'compact$' | 'num' | 'pct' | 'range'
type MetricDef = { key: string; label: string; fmt: Fmt; get: (source: any) => unknown }
type Prefs = { order: string[]; hidden: string[]; version?: number }

const EMPTY = '-'

const pick = (source: any, keys: string[]) => {
  for (const key of keys) {
    const direct = source?.[key]
    if (direct != null && direct !== '') return direct
    const fundamentals = source?.fundamentals?.[key]
    if (fundamentals != null && fundamentals !== '') return fundamentals
    const company = source?.company?.[key]
    if (company != null && company !== '') return company
  }
  return undefined
}

const KEY_METRIC_DEFS: MetricDef[] = [
  { key: 'open', label: 'Open', fmt: 'price', get: (source) => pick(source, ['open', 'regular_market_open', 'regularMarketOpen']) },
  { key: 'day_high', label: 'Day High', fmt: 'price', get: (source) => pick(source, ['day_high', 'dayHigh', 'regular_market_day_high', 'regularMarketDayHigh', 'high']) },
  { key: 'day_low', label: 'Day Low', fmt: 'price', get: (source) => pick(source, ['day_low', 'dayLow', 'regular_market_day_low', 'regularMarketDayLow', 'low']) },
  { key: 'prev_close', label: 'Prev Close', fmt: 'price', get: (source) => pick(source, ['prior_close', 'previous_close', 'prev_close', 'regularMarketPreviousClose']) },
  { key: 'volume', label: 'Volume', fmt: 'compact', get: (source) => pick(source, ['volume', 'regularMarketVolume']) },
  { key: 'avg_volume', label: 'Avg Volume', fmt: 'compact', get: (source) => pick(source, ['avg_volume', 'average_volume', 'averageDailyVolume3Month', 'averageVolume']) },
  { key: 'last_price', label: 'Last Price', fmt: 'price', get: (source) => pick(source, ['last', 'price', 'regularMarketPrice']) },
  {
    key: 'today_range',
    label: 'Today Range',
    fmt: 'range',
    get: (source) => [
      pick(source, ['day_low', 'dayLow', 'regular_market_day_low', 'regularMarketDayLow', 'low']),
      pick(source, ['day_high', 'dayHigh', 'regular_market_day_high', 'regularMarketDayHigh', 'high']),
    ],
  },
  { key: 'high_52w', label: '52W High', fmt: 'price', get: (source) => pick(source, ['52w_high', 'week52_high', 'high_52w', 'fiftyTwoWeekHigh']) },
  { key: 'low_52w', label: '52W Low', fmt: 'price', get: (source) => pick(source, ['52w_low', 'week52_low', 'low_52w', 'fiftyTwoWeekLow']) },
  { key: 'market_cap', label: 'Market Cap', fmt: 'compact$', get: (source) => pick(source, ['market_cap', 'marketCap']) },
  { key: 'pe', label: 'P/E (TTM)', fmt: 'num', get: (source) => pick(source, ['pe', 'pe_ttm', 'trailingPE']) },
  { key: 'beta', label: 'Beta', fmt: 'num', get: (source) => pick(source, ['beta']) },
  { key: 'vwap', label: 'VWAP', fmt: 'price', get: (source) => pick(source, ['vwap']) },
  { key: 'eps', label: 'EPS (TTM)', fmt: 'price', get: (source) => pick(source, ['eps', 'eps_ttm', 'trailingEps']) },
  { key: 'div_yield', label: 'Div Yield', fmt: 'pct', get: (source) => pick(source, ['dividend_yield', 'dividendYield']) },
  { key: 'turnover', label: 'Turnover', fmt: 'compact$', get: (source) => pick(source, ['turnover', 'dollar_volume']) },
  { key: 'shares_out', label: 'Shares Outstanding', fmt: 'compact', get: (source) => pick(source, ['shares_outstanding', 'sharesOutstanding']) },
  { key: 'float', label: 'Float', fmt: 'compact', get: (source) => pick(source, ['float', 'floatShares']) },
  { key: 'quick_ratio', label: 'Quick Ratio', fmt: 'num', get: (source) => pick(source, ['quick_ratio', 'quickRatio']) },
  { key: 'revenue', label: 'Revenue', fmt: 'compact$', get: (source) => pick(source, ['revenue', 'totalRevenue']) },
  { key: 'gross_margin', label: 'Gross Margin', fmt: 'pct', get: (source) => pick(source, ['gross_margin', 'grossMargins']) },
]

const DEF_BY_KEY = new Map(KEY_METRIC_DEFS.map((def) => [def.key, def]))
const APPROVED_FIRST_PAGE = ['last_price', 'open', 'day_high', 'day_low', 'prev_close', 'volume', 'avg_volume', 'today_range']
const LEGACY_DEFAULT_PREFIX = ['open', 'day_high', 'day_low', 'prev_close', 'volume', 'avg_volume', 'last_price', 'today_range']
const DEFAULT_ORDER = [...APPROVED_FIRST_PAGE, ...KEY_METRIC_DEFS.map((def) => def.key).filter((key) => !APPROVED_FIRST_PAGE.includes(key))]
const DEFAULT_VISIBLE = [...APPROVED_FIRST_PAGE, 'high_52w', 'low_52w', 'vwap', 'market_cap', 'pe', 'beta', 'eps', 'div_yield']
const PREFS_VERSION = 2
const DEFAULT_PREFS: Prefs = { order: DEFAULT_ORDER, hidden: DEFAULT_ORDER.filter((key) => !DEFAULT_VISIBLE.includes(key)), version: PREFS_VERSION }
const GLOBAL_PREFS_KEY = 'pia.stockView.defaults.keyMetrics'

function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(Number(value.toFixed(2)))
}

function formatMetric(value: unknown, fmt: Fmt): string {
  if (value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))) return EMPTY
  if (typeof value === 'string' && value.trim() === '') return EMPTY
  if (fmt === 'range') {
    const range = Array.isArray(value) ? value : []
    const low = range[0]
    const high = range[1]
    if (low == null || low === '' || high == null || high === '') return EMPTY
    const lowNumber = Number(low)
    const highNumber = Number(high)
    if (!Number.isFinite(lowNumber) || !Number.isFinite(highNumber)) return EMPTY
    return `${lowNumber.toLocaleString('en-US', { maximumFractionDigits: 2 })}-${highNumber.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  }
  if (fmt === 'pct' && typeof value === 'string' && value.includes('%')) return value
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  switch (fmt) {
    case 'price':
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
    case 'compact':
      return compact(n)
    case 'compact$':
      return `$${compact(n)}`
    case 'pct': {
      const pct = Math.abs(n) <= 1 ? n * 100 : n
      return `${Number(pct.toFixed(2))}%`
    }
    case 'num':
      return Number(n.toFixed(2)).toString()
    default:
      return String(value)
  }
}

function normalizedPrefs(raw: unknown): Prefs | null {
  if (!raw || typeof raw !== 'object') return null
  const parsed = raw as Partial<Prefs>
  const rawOrder = Array.isArray(parsed.order) ? parsed.order : []
  const rawHidden = Array.isArray(parsed.hidden) ? parsed.hidden : []
  const known: string[] = []
  const seen = new Set<string>()
  for (const key of rawOrder) {
    if (typeof key !== 'string' || !DEF_BY_KEY.has(key) || seen.has(key)) return null
    seen.add(key)
    known.push(key)
  }
  const hidden: string[] = []
  const hiddenSeen = new Set<string>()
  for (const key of rawHidden) {
    if (typeof key !== 'string' || !DEF_BY_KEY.has(key)) return null
    if (!hiddenSeen.has(key)) {
      hiddenSeen.add(key)
      hidden.push(key)
    }
  }
  const unversioned = parsed.version !== PREFS_VERSION
  const legacyDefault = unversioned && LEGACY_DEFAULT_PREFIX.every((key, index) => known[index] === key)
  const missingApprovedMetrics = unversioned && APPROVED_FIRST_PAGE.some((key) => !known.includes(key))
  if (!known.length || legacyDefault || missingApprovedMetrics) return DEFAULT_PREFS
  const order = [...known, ...DEFAULT_ORDER.filter((key) => !known.includes(key))]
  return { order, hidden, version: PREFS_VERSION }
}

function prefsKey(ticker: string) {
  const symbol = String(ticker || '').split(' ')[0].trim().toUpperCase() || 'UNKNOWN'
  return `pia.stockView.${symbol}.keyMetrics`
}

function loadPrefs(ticker: string): Prefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS
  for (const key of [prefsKey(ticker), GLOBAL_PREFS_KEY]) {
    try {
      const raw = window.localStorage.getItem(key)
      const parsed = raw ? normalizedPrefs(JSON.parse(raw)) : null
      if (parsed) return parsed
    } catch {}
  }
  return DEFAULT_PREFS
}

function savePrefs(ticker: string, prefs: Prefs) {
  try {
    window.localStorage.setItem(prefsKey(ticker), JSON.stringify({ ...prefs, version: PREFS_VERSION }))
  } catch {}
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export default function StockKeyMetrics({ source, hidden, ticker }: { source: any; hidden: boolean; ticker: string }) {
  const [collapsed, setCollapsed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
  const [activePage, setActivePage] = useState(0)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPrefs(loadPrefs(ticker))
    setActivePage(0)
  }, [ticker])

  const hiddenSet = useMemo(() => new Set(prefs.hidden), [prefs.hidden])
  const visibleDefs = useMemo(
    () => prefs.order.map((key) => DEF_BY_KEY.get(key)).filter((def): def is MetricDef => Boolean(def && !hiddenSet.has(def.key))),
    [prefs.order, hiddenSet],
  )
  const pages = useMemo(() => chunk(visibleDefs, 8), [visibleDefs])

  useEffect(() => {
    if (activePage > Math.max(0, pages.length - 1)) setActivePage(Math.max(0, pages.length - 1))
  }, [activePage, pages.length])

  function update(next: Prefs) {
    const normalized = { ...next, version: PREFS_VERSION }
    setPrefs(normalized)
    savePrefs(ticker, normalized)
  }

  function onRailScroll() {
    const node = railRef.current
    if (!node) return
    const nextPage = Math.round(node.scrollLeft / Math.max(node.clientWidth, 1))
    setActivePage(Math.max(0, Math.min(pages.length - 1, nextPage)))
  }

  return (
    <section className="skm" aria-label="Key metrics">
      <div className="skm-head">
        <button type="button" className="skm-title" aria-expanded={!collapsed} onClick={() => setCollapsed((current) => !current)}>
          <span>Key Metrics</span>
        </button>
        <div className="skm-head-actions">
          <button type="button" className="skm-edit-trigger" aria-label="Edit key metrics" onClick={() => setEditing(true)}>
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="skm-collapse"
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand key metrics' : 'Collapse key metrics'}
            onClick={() => setCollapsed((current) => !current)}
          >
            <ChevronDown size={16} className={`skm-arrow${collapsed ? '' : ' open'}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="skm-rail" ref={railRef} onScroll={onRailScroll}>
            {pages.map((page, pageIndex) => (
              <div className="skm-page" key={pageIndex}>
                {page.map((def) => (
                  <div className="skm-cell" key={def.key}>
                    <span>{def.label}</span>
                    <b>{hidden ? mask : formatMetric(def.get(source), def.fmt)}</b>
                  </div>
                ))}
              </div>
            ))}
            {visibleDefs.length === 0 && (
              <div className="skm-page">
                <div className="skm-empty">No metrics selected.</div>
              </div>
            )}
          </div>
          {pages.length > 1 && (
            <div className="skm-dots" aria-hidden="true">
              {pages.map((_, index) => <span key={index} className={index === activePage ? 'active' : ''} />)}
            </div>
          )}
        </>
      )}

      {editing && (
        <EditKeyMetricsSheet
          prefs={prefs}
          onChange={update}
          onReset={() => update(DEFAULT_PREFS)}
          onClose={() => setEditing(false)}
        />
      )}
    </section>
  )
}

function EditKeyMetricsSheet({
  prefs,
  onChange,
  onReset,
  onClose,
}: {
  prefs: Prefs
  onChange: (next: Prefs) => void
  onReset: () => void
  onClose: () => void
}) {
  const hiddenSet = new Set(prefs.hidden)
  const rows = prefs.order.filter((key) => DEF_BY_KEY.has(key))
  const [dragKey, setDragKey] = useState<string | null>(null)
  const dragRef = useRef<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  function toggle(key: string) {
    const nextHidden = new Set(prefs.hidden)
    if (nextHidden.has(key)) nextHidden.delete(key)
    else nextHidden.add(key)
    onChange({ ...prefs, hidden: [...nextHidden] })
  }

  function reorderTo(key: string, targetKey: string) {
    if (key === targetKey) return
    const next = [...prefs.order]
    const from = next.indexOf(key)
    const to = next.indexOf(targetKey)
    if (from < 0 || to < 0) return
    next.splice(from, 1)
    next.splice(to, 0, key)
    onChange({ ...prefs, order: next, hidden: [...prefs.hidden] })
  }

  function onDown(event: PointerEvent<HTMLUListElement>) {
    const target = event.target as HTMLElement
    if (!target.closest('[data-grip]')) return
    const row = target.closest('[data-key]') as HTMLElement | null
    if (!row?.dataset.key) return
    dragRef.current = row.dataset.key
    setDragKey(row.dataset.key)
    listRef.current?.setPointerCapture?.(event.pointerId)
  }

  function onMove(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current || !listRef.current) return
    const rows = Array.from(listRef.current.querySelectorAll('[data-key]')) as HTMLElement[]
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (event.clientY >= rect.top && event.clientY < rect.bottom) {
        const targetKey = row.dataset.key
        if (targetKey && targetKey !== dragRef.current) reorderTo(dragRef.current, targetKey)
        break
      }
    }
  }

  function onUp(event: PointerEvent<HTMLUListElement>) {
    if (!dragRef.current) return
    dragRef.current = null
    setDragKey(null)
    try {
      listRef.current?.releasePointerCapture?.(event.pointerId)
    } catch {}
  }

  return (
    <div className="skm-sheet-root" role="presentation">
      <button type="button" className="skm-sheet-overlay" aria-label="Close key metrics editor" onClick={onClose} />
      <div className="skm-sheet" role="dialog" aria-modal="true" aria-label="Edit key metrics">
        <header className="skm-sheet-head">
          <h3>Customize Key Metrics</h3>
          <button type="button" className="skm-sheet-done" onClick={onClose}>Done</button>
        </header>
        <div className="skm-sheet-body">
          <span className="skm-edit-section">Metric Name</span>
          <ul className="skm-edit-list" ref={listRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            {rows.map((key) => {
              const def = DEF_BY_KEY.get(key)!
              const on = !hiddenSet.has(key)
              return (
                <li className={`skm-edit-row${dragKey === key ? ' dragging' : ''}`} key={key} data-key={key}>
                  <span className="skm-edit-name">{def.label}</span>
                  <button type="button" className={`skm-edit-toggle${on ? ' on' : ''}`} aria-label={`${on ? 'Hide' : 'Show'} ${def.label}`} aria-pressed={on} onClick={() => toggle(key)}>
                    <span />
                  </button>
                  <button type="button" className="stock-reorder-grip skm-edit-grip" data-grip aria-label={`Drag to reorder ${def.label}`}>
                    <GripVertical size={18} />
                  </button>
                </li>
              )
            })}
          </ul>

          <button type="button" className="skm-edit-reset" onClick={onReset}>Reset to default</button>
        </div>
      </div>
    </div>
  )
}
