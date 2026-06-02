'use client'

import { mask, money } from '../../lib/pia-api'

const EMPTY = '—'

function hasValue(value: unknown) {
  return value != null && value !== '' && !(typeof value === 'number' && Number.isNaN(value))
}

function numberValue(value: unknown): number | null {
  if (!hasValue(value)) return null
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function textValue(value: unknown) {
  return hasValue(value) ? String(value) : EMPTY
}

function compactNumber(value: unknown, hidden: boolean) {
  if (hidden) return mask
  const parsed = numberValue(value)
  if (parsed == null) return EMPTY
  return parsed.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

function moneyValue(value: unknown, hidden: boolean, signed = false) {
  if (hidden) return mask
  const parsed = numberValue(value)
  if (parsed == null) return EMPTY
  const prefix = signed && parsed > 0 ? '+' : ''
  return `${prefix}${money(parsed)}`
}

function pctValue(value: unknown, hidden: boolean, signed = false) {
  if (hidden) return mask
  const parsed = numberValue(value)
  if (parsed == null) return EMPTY
  const prefix = signed && parsed > 0 ? '+' : ''
  return `${prefix}${parsed.toFixed(2)}%`
}

function tone(value: unknown) {
  const parsed = numberValue(value)
  if (parsed == null || parsed === 0) return ''
  return parsed > 0 ? ' positive' : ' negative'
}

function hasPositionSummaryData(source: any) {
  const shares = numberValue(source.quantity ?? source.qty ?? source.shares)
  if (shares != null && Math.abs(shares) > 0) return true
  const marketValue = numberValue(source.market_value ?? source.mktvalue)
  const costBasis = numberValue(source.cost_basis)
  return Boolean(source.manual) || Boolean((marketValue != null && Math.abs(marketValue) > 0) || (costBasis != null && Math.abs(costBasis) > 0))
}

function metric(label: string, value: string, toneClass = '') {
  return (
    <div className={`sps-tile${toneClass}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

export default function StockPositionSummary({ source, hidden }: { source: any; hidden: boolean }) {
  if (!hasPositionSummaryData(source)) return null

  const shares = source.quantity ?? source.qty ?? source.shares
  const avgCost = source.avg_price ?? source.avg_cost ?? source.avgCost
  const marketValue = source.market_value ?? source.mktvalue
  const costBasis =
    source.cost_basis ??
    (numberValue(avgCost) != null && numberValue(shares) != null
      ? Number(avgCost) * Number(shares) * (String(source.sec_type || source.asset_type).toUpperCase() === 'OPT' ? 100 : 1)
      : undefined)
  const unrealized = source.unrealized ?? source.unrealized_pnl
  const unrealizedPct = source.unrealized_pct ?? source.pnl_pct
  const dayPnl = source.day_pnl ?? source.day_change ?? source.daily_pnl
  const portfolioPct = source.portfolio_pct ?? source.weight

  return (
    <section className="sps" aria-label="Position summary">
      <header className="sps-head">
        <div>
          <span>Position Summary</span>
          <strong>{hidden ? 'Workspace' : textValue(source.symbol || source.ticker || source.underlying)}</strong>
        </div>
      </header>

      <div className="sps-grid">
        {metric('Shares', compactNumber(shares, hidden))}
        {metric('Market Value', moneyValue(marketValue, hidden))}
        {metric('Unrealized P&L', moneyValue(unrealized, hidden, true), tone(unrealized))}
        {metric('Unrealized %', pctValue(unrealizedPct, hidden, true), tone(unrealizedPct))}
        {metric('Avg Cost', moneyValue(avgCost, hidden))}
        {metric('Cost Basis', moneyValue(costBasis, hidden))}
        {metric("Today's P&L", moneyValue(dayPnl, hidden, true), tone(dayPnl))}
        {metric('Portfolio %', pctValue(portfolioPct, hidden))}
      </div>

      <div className="sps-more">
        {metric('Realized P&L', moneyValue(source.realized ?? source.realized_pnl, hidden, true), tone(source.realized ?? source.realized_pnl))}
        {metric('Asset Class', hidden ? mask : textValue(source.asset_type ?? source.sec_type ?? source.asset_class))}
        {metric('Sector', hidden ? mask : textValue(source.sector ?? source.industry))}
        {metric('Account', hidden ? mask : textValue(source.account ?? source.broker))}
      </div>
    </section>
  )
}
