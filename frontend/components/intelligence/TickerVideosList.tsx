'use client'

import { ExternalLink, Radio, Video } from 'lucide-react'
import { PiaBadge } from '../ui-v3'
import { mask } from '../../lib/pia-api'

type VideoSourceType = 'youtube_search' | 'channel_monitor_seed'

type TickerVideoMonitorTarget = {
  id: string
  sourceType: VideoSourceType
  channel: string
  queryTemplate: string
  relevance: string
}

type TickerVideoCard = {
  id: string
  title: string
  source: string
  relevance: string
  href: string
  sourceType: VideoSourceType
}

const VIDEO_MONITORING_TARGETS: TickerVideoMonitorTarget[] = [
  {
    id: 'latest-analysis',
    sourceType: 'youtube_search',
    channel: 'YouTube Research',
    queryTemplate: '{symbol} stock analysis latest',
    relevance: 'Latest ticker research',
  },
  {
    id: 'earnings-management',
    sourceType: 'channel_monitor_seed',
    channel: 'Company IR / official channel search',
    queryTemplate: '{symbol} {name} earnings call investor relations',
    relevance: 'Primary source monitoring',
  },
  {
    id: 'market-narrative',
    sourceType: 'channel_monitor_seed',
    channel: 'CNBC / Bloomberg channel search',
    queryTemplate: '{symbol} {name} stock CNBC Bloomberg',
    relevance: 'Market narrative',
  },
  {
    id: 'long-form-thesis',
    sourceType: 'channel_monitor_seed',
    channel: 'Subscribed creator watchlist ready',
    queryTemplate: '{symbol} {name} stock thesis',
    relevance: 'Long-form thesis review',
  },
]

function videoSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

function buildTickerVideoCards(ticker: string, companyName: string): TickerVideoCard[] {
  const symbol = String(ticker || '').split(' ')[0].toUpperCase()
  const name = companyName && companyName !== 'Position' ? companyName : symbol

  return VIDEO_MONITORING_TARGETS.map((target) => {
    const query = target.queryTemplate.replace('{symbol}', symbol).replace('{name}', name)
    return {
      id: target.id,
      title:
        target.id === 'latest-analysis'
          ? `${symbol} latest video analysis`
          : target.id === 'earnings-management'
            ? `${symbol} earnings and management commentary`
            : target.id === 'market-narrative'
              ? `${symbol} market narrative videos`
              : `${symbol} long-form thesis videos`,
      source: target.channel,
      relevance: target.relevance,
      href: videoSearchUrl(query),
      sourceType: target.sourceType,
    }
  })
}

export default function TickerVideosList({
  ticker,
  companyName,
  hidden,
}: {
  ticker: string
  companyName: string
  hidden: boolean
}) {
  const rows = buildTickerVideoCards(ticker, companyName)

  return (
    <div className="stock-video-stack">
      <section className="stock-video-brief">
        <div>
          <span>{hidden ? 'Workspace feed' : 'VIDEO RESEARCH'}</span>
          <h3>{hidden ? 'Research monitor' : `${String(ticker || '').split(' ')[0].toUpperCase()} video watchlist`}</h3>
          <p>{hidden ? mask : 'Curated external research entry points. Links open source searches; no video data is presented as proprietary.'}</p>
        </div>
        <PiaBadge variant="neutral">{hidden ? mask : 'No autoplay'}</PiaBadge>
      </section>

      <div className="stock-video-list">
        {rows.map((item) => (
          <article className="stock-video-card" key={item.id}>
            <div className="stock-video-icon" aria-hidden="true">
              {item.sourceType === 'channel_monitor_seed' ? <Radio size={18} /> : <Video size={18} />}
            </div>
            <div className="stock-video-main">
              <div className="stock-video-kicker">
                <span>{hidden ? 'Source' : item.source}</span>
                <PiaBadge variant="info" size="compact">{hidden ? mask : item.relevance}</PiaBadge>
              </div>
              {hidden ? (
                <strong>{mask}</strong>
              ) : (
                <a className="stock-video-title" href={item.href} target="_blank" rel="noreferrer">
                  {item.title}
                </a>
              )}
              <p>
                {hidden
                  ? mask
                  : item.sourceType === 'channel_monitor_seed'
                    ? 'Structured as a future subscribed-channel monitoring target.'
                    : 'Ticker-scoped external video research link.'}
              </p>
            </div>
            {!hidden ? (
              <a className="stock-video-link" href={item.href} target="_blank" rel="noreferrer" aria-label={`Open ${item.title}`}>
                <ExternalLink size={16} />
                <span>Open</span>
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}
