export function newsBiasLabel(item: Record<string, unknown>) {
  return String(item.bias || item.sentiment || 'Neutral')
}

export function newsConfidence(item: Record<string, unknown>) {
  return Number(item.confidence ?? item.impact_score ?? 0)
}

export function newsPossibleMove(item: Record<string, unknown>) {
  return String(item.possible_move || item.sell_the_news_risk || 'low')
}

export function newsActionLabel(item: Record<string, unknown>) {
  return String(item.action_label || item.suggested_action || 'Watch for confirmation')
}

export function toneForBias(bias: string, sentiment?: string) {
  const value = String(bias || sentiment || '').toLowerCase()
  if (value.includes('bull') || value === 'positive') return 'good'
  if (value.includes('bear') || value === 'negative') return 'bad'
  return 'warn'
}

export function toneForPossibleMove(move: string, risk?: string) {
  const value = String(move || risk || '').toLowerCase()
  if (value.includes('fade') || value.includes('pullback') || value === 'high') return 'bad'
  if (value.includes('risk') || value === 'medium') return 'warn'
  return 'good'
}
