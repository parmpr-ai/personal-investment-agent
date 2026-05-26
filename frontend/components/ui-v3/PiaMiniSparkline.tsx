import type { SVGProps } from 'react'

type SparklineVariant = 'positive' | 'negative' | 'neutral'
type SparklineDensity = 'compact' | 'default' | 'spacious'

const densitySize: Record<SparklineDensity, { width: number; height: number }> = {
  compact: { width: 96, height: 28 },
  default: { width: 140, height: 44 },
  spacious: { width: 180, height: 60 },
}

function buildPath(values: number[], width: number, height: number) {
  if (values.length === 0) return ''

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const xStep = values.length > 1 ? width / (values.length - 1) : 0

  return values
    .map((value, index) => {
      const x = index * xStep
      const y = height - ((value - min) / range) * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export type PiaMiniSparklineProps = Omit<SVGProps<SVGSVGElement>, 'children' | 'values'> & {
  values: number[]
  variant?: SparklineVariant
  density?: SparklineDensity
  label?: string
}

export function PiaMiniSparkline({
  values,
  variant = 'neutral',
  density = 'default',
  label = 'Sparkline trend',
  className,
  ...props
}: PiaMiniSparklineProps) {
  const { width, height } = densitySize[density]
  const cleanedValues = values.filter((value) => Number.isFinite(value))
  const path = buildPath(cleanedValues, width, height)
  const areaPath = path ? `${path} L ${width} ${height} L 0 ${height} Z` : ''

  return (
    <svg
      className={['pia-v3-sparkline', `pia-v3-sparkline-${variant}`, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
      {...props}
    >
      {path ? (
        <>
          <path className="pia-v3-sparkline-area" d={areaPath} />
          <path className="pia-v3-sparkline-line" d={path} />
        </>
      ) : (
        <line className="pia-v3-sparkline-line" x1="0" x2={width} y1={height / 2} y2={height / 2} />
      )}
    </svg>
  )
}
