'use client'

/*
 * AI Intelligence neon outline icon system.
 * All icons share the same stroke width, visual family, and PIA dark premium aesthetic.
 */

interface IconProps {
  size?: number
  color?: string
  className?: string
}

const D = (size: number, color: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: color,
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export function IconAiSummary({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9 9h6M9 12h6M9 15h4" />
      <path d="M12 2v2M12 20v2" strokeOpacity={0.4} />
    </svg>
  )
}

export function IconAnalysts({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

export function IconGrowth({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

export function IconValuation({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
      <path d="M9 17l1-4M15 17l-1-4" strokeOpacity={0.5} />
    </svg>
  )
}

export function IconTechnical({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

export function IconMomentum({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M5 12h14M12 5l7 7-7 7" />
      <circle cx="5" cy="12" r="2" />
    </svg>
  )
}

export function IconMacro({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

export function IconEvidence({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

export function IconAnalystRevisions({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <polyline points="17 11 12 6 7 11" />
      <polyline points="17 18 12 13 7 18" />
      <line x1="12" y1="6" x2="12" y2="21" />
    </svg>
  )
}

export function IconEarnings({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <rect x="2" y="2" width="20" height="20" rx="2" />
      <path d="M7 12l3 3 7-7" />
    </svg>
  )
}

export function IconRelativeStrength({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  )
}

export function IconScenarioOutlook({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M2 20h20M4 16l4-4 4 4 4-6 4 2" />
      <circle cx="20" cy="12" r="1.5" />
    </svg>
  )
}

export function IconBullCase({ size = 20, color = '#31E95D', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M12 20V8M5 13l7-7 7 7" />
      <circle cx="12" cy="20" r="1.5" fill={color} stroke="none" />
    </svg>
  )
}

export function IconBaseCase({ size = 20, color = '#FFBD28', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <line x1="3" y1="12" x2="21" y2="12" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function IconBearCase({ size = 20, color = '#FF3D3D', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M12 4v12M5 11l7 7 7-7" />
      <circle cx="12" cy="4" r="1.5" fill={color} stroke="none" />
    </svg>
  )
}

export function IconWhatCouldChange({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <circle cx="12" cy="17" r="0.5" fill={color} />
    </svg>
  )
}

export function IconAnalystConsensus({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="8" y1="10" x2="16" y2="10" />
      <line x1="8" y1="14" x2="12" y2="14" />
    </svg>
  )
}

export function IconPortfolioFit({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export function IconPortfolioImpact({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4l3 3" />
      <path d="M8 12H4M20 12h-4" strokeOpacity={0.4} />
    </svg>
  )
}

export function IconPortfolioAssessment({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <path d="M7 10h2l2-4 2 8 2-4h2" />
    </svg>
  )
}

export function IconRecommendedAction({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export function IconVerdictHistory({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <polyline points="12 8 12 12 14 14" />
      <path d="M3.05 11a9 9 0 1 0 .5-4.5" />
      <polyline points="3 3 3 7 7 7" />
    </svg>
  )
}

export function IconDriverScorecard({ size = 20, color = 'currentColor', className }: IconProps) {
  return (
    <svg {...D(size, color)} className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

export const SECTION_ICONS: Record<string, React.ComponentType<IconProps>> = {
  'AI Summary': IconAiSummary,
  'Analysts': IconAnalysts,
  'Growth': IconGrowth,
  'Valuation': IconValuation,
  'Technical': IconTechnical,
  'Momentum': IconMomentum,
  'Macro': IconMacro,
  'Evidence': IconEvidence,
  'Analyst Revisions': IconAnalystRevisions,
  'Earnings': IconEarnings,
  'Relative Strength': IconRelativeStrength,
  'Scenario Outlook': IconScenarioOutlook,
  'Bull Case': IconBullCase,
  'Base Case': IconBaseCase,
  'Bear Case': IconBearCase,
  'What Could Change This View': IconWhatCouldChange,
  'AI vs Analyst Consensus': IconAnalystConsensus,
  'Portfolio Fit': IconPortfolioFit,
  'Portfolio Impact': IconPortfolioImpact,
  'Portfolio Assessment': IconPortfolioAssessment,
  'Recommended Action': IconRecommendedAction,
  'AI Verdict History': IconVerdictHistory,
  'Driver Scorecard': IconDriverScorecard,
}
