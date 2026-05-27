'use client'

import { ExternalLink, Newspaper } from 'lucide-react'
import { PiaBadge } from '../ui-v3'
import type { PiaBadgeVariant } from '../ui-v3/PiaBadge'
import { mask } from '../../lib/pia-api'
import {
  newsActionLabel,
  newsBiasLabel,
  newsConfidence,
  newsPossibleMove,
  toneForBias,
  toneForPossibleMove,
} from './newsFormatters'

function sourceBadgeVariant(source: unknown): PiaBadgeVariant {
  const value = String(source || '').toLowerCase()
  if (value.includes('yahoo')) return 'yahoo'
  if (value.includes('discord')) return 'discord'
  if (value.includes('seeking') || value === 'sa') return 'sa'
  if (value.includes('reuters')) return 'reuters'
  if (value.includes('pia')) return 'pia'
  if (value === 'x' || value.includes('twitter')) return 'x'
  if (value.includes('ibkr') || value.includes('interactive brokers')) return 'ibkr'
  return 'neutral'
}

export default function TickerNewsList({
  items,
  digest,
  isDemo,
  hidden,
}: {
  items: any[]
  digest: string
  isDemo: boolean
  hidden: boolean
}) {
  const rows = items.slice(0, 6)
  if (!rows.length) {
    return <p className="muted">No structured headlines for this symbol in the current scan.</p>
  }

  return (
    <div className="news-intel-stack stock-news-stack">
      <section className="news-intel-digest">
        <div className="news-intel-digest-head">
          <span className="news-intel-digest-label">{hidden ? 'Workspace brief' : 'PIA DIGEST'}</span>
          {!hidden && isDemo ? <span className="news-intel-demo-badge">DEMO</span> : null}
        </div>
        <p>{hidden ? mask : digest}</p>
      </section>
      <div className="news-intel-list">
        {rows.map((item: any) => {
          const articleUrl = String(item.source_url || '').trim()
          const title = hidden ? 'Workspace intelligence item' : String(item.title || 'Untitled headline')
          const source = hidden ? 'Source' : String(item.source || 'PIA')
          return (
            <article className="news-intel-card stock-news-card" key={`${item.id}-${item.title}`}>
              <div className="news-intel-main">
                <div className="news-intel-kicker">
                  <PiaBadge variant={sourceBadgeVariant(source)} size="compact" icon={<Newspaper size={12} />}>
                    {source}
                  </PiaBadge>
                  <span>{hidden ? mask : `${item.freshness_minutes}m ago`}</span>
                </div>
                {hidden || !articleUrl ? (
                  <strong>{title}</strong>
                ) : (
                  <a className="news-intel-title" href={articleUrl} target="_blank" rel="noreferrer">
                    {title}
                  </a>
                )}
                <p>{hidden ? mask : item.summary}</p>
              </div>
              <div className="news-intel-meta stock-news-meta">
                <div className="news-intel-field">
                  <span>{hidden ? 'Signal' : 'Bias'}</span>
                  <PiaBadge variant={toneForBias(newsBiasLabel(item), item.sentiment) === 'good' ? 'bullish' : toneForBias(newsBiasLabel(item), item.sentiment) === 'bad' ? 'bearish' : 'warning'}>
                    {hidden ? mask : newsBiasLabel(item)}
                  </PiaBadge>
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Move' : 'Possible Move'}</span>
                  <PiaBadge variant={toneForPossibleMove(newsPossibleMove(item), item.sell_the_news_risk) === 'good' ? 'bullish' : toneForPossibleMove(newsPossibleMove(item), item.sell_the_news_risk) === 'bad' ? 'danger' : 'warning'}>
                    {hidden ? mask : newsPossibleMove(item)}
                  </PiaBadge>
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Level' : 'Confidence'}</span>
                  <b>{hidden ? mask : String(newsConfidence(item))}</b>
                </div>
                <div className="news-intel-field">
                  <span>{hidden ? 'Next' : 'Action'}</span>
                  <b>{hidden ? mask : newsActionLabel(item)}</b>
                </div>
                {!hidden && articleUrl ? (
                  <a href={articleUrl} target="_blank" rel="noreferrer" aria-label="Open article">
                    <ExternalLink size={16} />
                  </a>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
