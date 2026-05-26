import type { HTMLAttributes, ReactNode } from 'react'
import { PiaMiniSparkline } from './PiaMiniSparkline'

export type PiaMetricTrend = 'positive' | 'negative' | 'neutral'
export type PiaMetricDensity = 'compact' | 'default' | 'spacious'

export type PiaMetricProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode
  value: ReactNode
  delta?: ReactNode
  trend?: PiaMetricTrend
  sparklineValues?: number[]
  sparkline?: ReactNode
  density?: PiaMetricDensity
  privacySafe?: boolean
}

export function PiaMetric({
  label,
  value,
  delta,
  trend = 'neutral',
  sparklineValues,
  sparkline,
  density = 'default',
  privacySafe = false,
  className,
  ...props
}: PiaMetricProps) {
  const sparklineNode =
    sparkline ??
    (sparklineValues ? (
      <PiaMiniSparkline values={sparklineValues} variant={trend} density={density} label={`${label} trend`} />
    ) : null)

  return (
    <div
      className={[
        'pia-v3-metric',
        `pia-v3-metric-${trend}`,
        `pia-v3-density-${density}`,
        privacySafe ? 'pia-v3-private' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      <span className="pia-v3-metric-label">{label}</span>
      <div className="pia-v3-metric-row">
        <strong className="pia-v3-metric-value">{value}</strong>
        {delta ? <span className="pia-v3-metric-delta">{delta}</span> : null}
      </div>
      {sparklineNode ? <div className="pia-v3-metric-sparkline">{sparklineNode}</div> : null}
    </div>
  )
}
