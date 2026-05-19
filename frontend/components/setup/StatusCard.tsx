import GlowCard from '../ui/GlowCard'
import IntelligenceBadge from '../ui/IntelligenceBadge'

export type StatusTone = 'good' | 'warn' | 'bad'

export default function StatusCard({
  title,
  detail,
  tone,
  badge,
}: {
  title: string
  detail: string
  tone: StatusTone
  badge: string
}) {
  return (
    <GlowCard className="setup-status-card">
      <div>
        <b>{title}</b>
        <p>{detail}</p>
      </div>
      <IntelligenceBadge label={badge} tone={tone} />
    </GlowCard>
  )
}
