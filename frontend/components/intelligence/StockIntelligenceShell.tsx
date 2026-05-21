'use client'

import StockIntelligencePanel from './StockIntelligencePanel'

export default function StockIntelligenceShell({
  ticker,
  position,
  hidden,
  onClose,
  variant,
}: {
  ticker: string
  position?: Record<string, unknown> | null
  hidden: boolean
  onClose: () => void
  variant: 'desktop' | 'mobile'
}) {
  if (variant === 'mobile') {
    return (
      <div className="stock-intel-shell stock-intel-shell-mobile" role="presentation">
        <button type="button" className="stock-intel-overlay" aria-label="Close intelligence panel" onClick={onClose} />
        <StockIntelligencePanel ticker={ticker} seedPosition={position} hidden={hidden} onClose={onClose} variant="mobile" />
      </div>
    )
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="stock-intel-drawer" role="dialog" aria-modal="true" aria-label={`${ticker} intelligence`}>
        <StockIntelligencePanel ticker={ticker} seedPosition={position} hidden={hidden} onClose={onClose} variant="desktop" />
      </aside>
    </>
  )
}
