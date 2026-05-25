'use client'

import { useEffect, useRef } from 'react'
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
  const mobileSheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (variant === 'mobile') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, variant])

  useEffect(() => {
    if (variant !== 'mobile') return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    mobileSheetRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [variant])

  if (variant === 'mobile') {
    return (
      <div className="stock-intel-shell stock-intel-shell-mobile" role="presentation">
        <button type="button" className="stock-intel-overlay" aria-label="Close intelligence panel" onClick={onClose} />
        <div
          ref={mobileSheetRef}
          className="stock-intel-mobile-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`${ticker} intelligence`}
          tabIndex={-1}
          onClick={(event) => event.stopPropagation()}
        >
          <StockIntelligencePanel ticker={ticker} seedPosition={position} hidden={hidden} onClose={onClose} variant="mobile" />
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="stock-intel-backdrop" onClick={onClose} />
      <aside className="stock-intel-modal" role="dialog" aria-modal="true" aria-label={`${ticker} intelligence`}>
        <StockIntelligencePanel ticker={ticker} seedPosition={position} hidden={hidden} onClose={onClose} variant="desktop" />
      </aside>
    </>
  )
}
