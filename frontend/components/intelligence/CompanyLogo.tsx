'use client'

import { useEffect, useState } from 'react'

const KNOWN_LOGOS: Record<string, string> = {
  AAPL: 'https://companiesmarketcap.com/img/company-logos/64/AAPL.png',
  AMD: 'https://companiesmarketcap.com/img/company-logos/64/AMD.png',
  GOOG: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.png',
  GOOGL: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.png',
  META: 'https://companiesmarketcap.com/img/company-logos/64/META.png',
  MSFT: 'https://companiesmarketcap.com/img/company-logos/64/MSFT.png',
  NVDA: 'https://companiesmarketcap.com/img/company-logos/64/NVDA.png',
  PLTR: 'https://companiesmarketcap.com/img/company-logos/64/PLTR.png',
  SOFI: 'https://companiesmarketcap.com/img/company-logos/64/SOFI.png',
  TSLA: 'https://companiesmarketcap.com/img/company-logos/64/TSLA.png',
  TSM: 'https://companiesmarketcap.com/img/company-logos/64/TSM.png',
}

function validUrl(value: unknown) {
  return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : ''
}

export function companyLogoUrl(source: any, symbolValue?: string) {
  const symbol = String(symbolValue || source?.symbol || source?.ticker || source?.underlying || '').split(' ')[0].toUpperCase()
  return (
    validUrl(source?.logo_url) ||
    validUrl(source?.logoUrl) ||
    validUrl(source?.logo_uri) ||
    validUrl(source?.company?.logo_url) ||
    validUrl(source?.company?.logoUrl) ||
    KNOWN_LOGOS[symbol] ||
    (symbol ? `https://companiesmarketcap.com/img/company-logos/64/${encodeURIComponent(symbol)}.png` : '')
  )
}

export default function CompanyLogo({
  source,
  symbol,
  hidden,
  className = 'company-logo',
}: {
  source?: any
  symbol?: string
  hidden?: boolean
  className?: string
}) {
  const resolvedSymbol = String(symbol || source?.symbol || source?.ticker || source?.underlying || '').split(' ')[0].toUpperCase()
  const logoUrl = hidden ? '' : companyLogoUrl(source, resolvedSymbol)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [logoUrl])

  if (logoUrl && !failed) {
    return (
      <span className={`${className} has-logo`} aria-hidden="true">
        <img src={logoUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      </span>
    )
  }

  return (
    <span className={className} aria-hidden="true">
      {hidden ? '..' : resolvedSymbol.slice(0, 2)}
    </span>
  )
}
