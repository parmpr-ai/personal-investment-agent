'use client'

export type CaseType = 'BUY' | 'HOLD' | 'SELL'

type HeroSize = 'compact' | 'expanded' | 'desktop'
type HeroMotion = 'enabled' | 'reduced'
type HeroTheme = 'pia-signature'

interface AIHeroProps {
  caseType: CaseType
  size: HeroSize
  motion: HeroMotion
  theme: HeroTheme
}

const HERO_ASSET: Record<CaseType, Record<HeroSize, string>> = {
  BUY: {
    compact: '/ai-heroes/buy/mobile-compact.webp',
    expanded: '/ai-heroes/buy/mobile-expanded.webp',
    desktop: '/ai-heroes/buy/desktop.webp',
  },
  HOLD: {
    compact: '/ai-heroes/hold/mobile-compact.webp',
    expanded: '/ai-heroes/hold/mobile-expanded.webp',
    desktop: '/ai-heroes/hold/desktop.webp',
  },
  SELL: {
    compact: '/ai-heroes/sell/mobile-compact.webp',
    expanded: '/ai-heroes/sell/mobile-expanded.webp',
    desktop: '/ai-heroes/sell/desktop.webp',
  },
}

const HERO_SIZE_PX: Record<HeroSize, number> = {
  compact: 200,
  expanded: 280,
  desktop: 320,
}

const ANIMATION_CLASS: Record<CaseType, string> = {
  BUY: 'aih-orbit-up',
  SELL: 'aih-orbit-down',
  HOLD: 'aih-oscillate',
}

export default function AIHero({ caseType, size, motion, theme: _theme }: AIHeroProps) {
  const src = HERO_ASSET[caseType][size]
  const px = HERO_SIZE_PX[size]
  const animClass = motion === 'reduced' ? '' : ANIMATION_CLASS[caseType]

  return (
    <div
      className={`aih-root aih-${caseType.toLowerCase()}${animClass ? ` ${animClass}` : ''}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      <img
        src={src}
        alt=""
        className="aih-img"
        width={px}
        height={px}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  )
}
