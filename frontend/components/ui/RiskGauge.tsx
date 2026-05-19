import type { CSSProperties } from 'react'

export default function RiskGauge({
  value,
  label = 'Risk',
}: {
  value: number
  label?: string
}) {
  const bounded = Math.max(0, Math.min(100, value))
  const tone = bounded >= 75 ? 'bad' : bounded >= 45 ? 'warn' : 'good'

  return (
    <div className={`risk-gauge ${tone}`}>
      <div className="risk-ring" style={{ '--risk-value': `${bounded}%` } as CSSProperties}>
        <b>{bounded}</b>
      </div>
      <span>{label}</span>
    </div>
  )
}
