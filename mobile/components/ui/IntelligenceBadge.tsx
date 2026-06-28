type Tone = 'good' | 'warn' | 'bad' | 'neutral'

export default function IntelligenceBadge({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: Tone
}) {
  return <span className={`intelligence-badge ${tone}`}>{label}</span>
}
