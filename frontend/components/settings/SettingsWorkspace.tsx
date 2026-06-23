'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Database,
  Globe2,
  Hash,
  MessageSquare,
  Wallet,
} from 'lucide-react'
import GlowCard from '../ui/GlowCard'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import SectionHeader from '../ui/SectionHeader'
import { fetchJson, getApiBase, mask, money, safeMessage } from '../../lib/pia-api'
import { WorkspaceManagerPanel, useWorkspaceConfig, type WorkspaceId } from '../workspace'

type SettingsVariant = 'desktop' | 'mobile'
type WorkspaceConfig = ReturnType<typeof useWorkspaceConfig>

const defaultIntegrationSettings: any = {
  ibkr: {
    enabled: true,
    gateway_url: 'https://localhost:5000',
    mode: 'client_portal_gateway',
    documentation: 'Connect through IBKR Client Portal Gateway running locally on your computer.',
  },
  yahoo: {
    news_enabled: true,
    fundamentals_enabled: true,
    test_ticker: 'AMD',
    documentation: 'Uses free Yahoo Finance public endpoints/RSS where available. No Yahoo login required.',
  },
  seeking_alpha: {
    rss_enabled: true,
    authenticated_enabled: false,
    cookie_header: '',
    test_url: 'https://seekingalpha.com/market-news',
    documentation: 'Recommended: RSS + email alerts. Authenticated deep parsing is optional and uses your own active subscriber session cookie/header.',
  },
  rss: {
    feeds: [
      { name: 'Yahoo AMD', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AMD&region=US&lang=en-US' },
      { name: 'Yahoo NVDA', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US' },
    ],
    documentation: 'Add ticker/news RSS URLs. Health check validates that feed items are received.',
  },
  fred: {
    api_key: '',
    documentation: 'Optional free FRED API key for macro series.',
  },
  telegram: {
    bot_token: '',
    chat_id: '',
    documentation: 'Create a Telegram bot with BotFather, paste token and chat id, then use Send Test Alert.',
  },
  discord_advisor: {
    mode: 'manual_first',
    documentation: 'V5.6 scaffolding only. Future modes: webhook / cloud browser connector / manual paste.',
  },
  openai: {
    mode: 'off',
    daily_budget_eur: 0.5,
    documentation: 'Optional later. Plus subscription is separate from API. V5.6 uses rule engine first.',
  },
}

function mergeIntegrationSettings(settings: any) {
  return Object.entries(defaultIntegrationSettings).reduce((merged: any, [section, defaults]) => {
    merged[section] = { ...(defaults as any), ...(settings?.[section] || {}) }
    return merged
  }, {})
}

function useSourceHealth() {
  const [health, setHealth] = useState<any[]>([])
  const refresh = () => fetchJson('/source-health').then(setHealth).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])
  return { health, refresh }
}

function SettingsPanel({ title, hidden, span = 'span-12', children }: any) {
  return (
    <section className={`panel ${span}`}>
      <h3>{hidden ? 'Settings' : title}</h3>
      {children}
    </section>
  )
}

function SourceHealthPanel({ hidden = false, variant = 'desktop' }: { hidden?: boolean; variant?: SettingsVariant }) {
  const { health, refresh } = useSourceHealth()
  const body = (
    <>
      <div className="health-grid">
        {health.map((h: any) => (
          <div className={`health ${h.status}`} key={h.source}>
            <div>
              <b>{hidden ? 'Workspace source' : h.source}</b>
              <p className="muted">{hidden ? mask : h.message}</p>
            </div>
            <span>{hidden ? 'Status' : h.data_received ? 'Data OK' : h.ok ? 'No data' : 'Failed'}</span>
          </div>
        ))}
      </div>
      <button className="tab" type="button" onClick={refresh}>
        Run health checks
      </button>
    </>
  )
  if (variant === 'mobile') {
    return (
      <div className="mobile-settings-block">
        <h3>{hidden ? 'Workspace' : 'Source Health'}</h3>
        {body}
      </div>
    )
  }
  return (
    <SettingsPanel title="Source Health" span="span-12" hidden={hidden}>
      {body}
    </SettingsPanel>
  )
}

type IntegrationDef = {
  id: string
  title: string
  icon: React.ReactNode
  statusSource?: string
  testSrc?: string
  staticStatus?: any
  fields: (settings: any, update: (section: string, key: string, value: any) => void) => React.ReactNode
}

const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    id: 'ibkr',
    title: 'IBKR',
    icon: <Wallet />,
    statusSource: 'IBKR',
    testSrc: 'ibkr',
    fields: () => null,
  },
  {
    id: 'yahoo',
    title: 'Yahoo',
    icon: <Globe2 />,
    statusSource: 'Yahoo Finance',
    testSrc: 'yahoo',
    fields: (s, update) => (
      <>
        <Field label="Test ticker" value={s.yahoo.test_ticker} onChange={(v: any) => update('yahoo', 'test_ticker', v.toUpperCase())} />
        <Toggle label="News" checked={s.yahoo.news_enabled} onChange={(v: any) => update('yahoo', 'news_enabled', v)} />
        <Toggle label="Fundamentals" checked={s.yahoo.fundamentals_enabled} onChange={(v: any) => update('yahoo', 'fundamentals_enabled', v)} />
      </>
    ),
  },
  {
    id: 'seeking_alpha',
    title: 'Seeking Alpha',
    icon: <BookOpen />,
    statusSource: 'Seeking Alpha',
    testSrc: 'seeking-alpha',
    fields: (s, update) => (
      <>
        <Toggle label="Enable RSS" checked={s.seeking_alpha.rss_enabled} onChange={(v: any) => update('seeking_alpha', 'rss_enabled', v)} />
        <Toggle label="Authenticated deep parsing" checked={s.seeking_alpha.authenticated_enabled} onChange={(v: any) => update('seeking_alpha', 'authenticated_enabled', v)} />
        <Field label="Test URL" value={s.seeking_alpha.test_url} onChange={(v: any) => update('seeking_alpha', 'test_url', v)} />
        <TextArea label="Session Cookie/Header" value={s.seeking_alpha.cookie_header} onChange={(v: any) => update('seeking_alpha', 'cookie_header', v)} placeholder="Paste your subscriber session cookie header. No password is stored." />
      </>
    ),
  },
  {
    id: 'rss',
    title: 'RSS / News Feeds',
    icon: <Database />,
    statusSource: 'RSS',
    testSrc: 'rss',
    fields: (s, update) => (
      <TextArea label="RSS feeds JSON" value={JSON.stringify(s.rss.feeds, null, 2)} onChange={(v: any) => { try { update('rss', 'feeds', JSON.parse(v)) } catch {} }} />
    ),
  },
  {
    id: 'fred',
    title: 'FRED',
    icon: <BarChart3 />,
    statusSource: 'FRED/Macro',
    testSrc: 'fred',
    fields: (s, update) => (
      <Field label="API key" value={s.fred.api_key} onChange={(v: any) => update('fred', 'api_key', v)} />
    ),
  },
  {
    id: 'telegram',
    title: 'Telegram',
    icon: <Activity />,
    statusSource: 'Telegram',
    testSrc: 'telegram',
    fields: (s, update) => (
      <>
        <Field label="Bot token" value={s.telegram.bot_token} onChange={(v: any) => update('telegram', 'bot_token', v)} />
        <Field label="Chat ID" value={s.telegram.chat_id} onChange={(v: any) => update('telegram', 'chat_id', v)} />
      </>
    ),
  },
  {
    id: 'discord_advisor',
    title: 'Advisor',
    icon: <Brain />,
    statusSource: 'Advisor Intel',
    fields: (s, update) => (
      <Field label="Mode" value={s.discord_advisor.mode} onChange={(v: any) => update('discord_advisor', 'mode', v)} />
    ),
  },
  {
    id: 'openai',
    title: 'AI',
    icon: <Brain />,
    staticStatus: { status: 'connected_no_data', data_received: false, message: 'Optional later; rules engine active' },
    fields: (s, update) => (
      <>
        <Field label="Mode" value={s.openai.mode} onChange={(v: any) => update('openai', 'mode', v)} />
        <Field label="Daily budget EUR" value={s.openai.daily_budget_eur} onChange={(v: any) => update('openai', 'daily_budget_eur', Number(v))} />
      </>
    ),
  },
  {
    id: 'discord_signals',
    title: 'Discord Signals',
    icon: <MessageSquare />,
    staticStatus: { status: 'not_connected', data_received: false, message: 'Not connected. Future: map Discord trading signals to holdings and watchlist tickers.' },
    fields: () => null,
  },
  {
    id: 'x_sentiment',
    title: 'X Sentiment',
    icon: <Hash />,
    staticStatus: { status: 'planned', data_received: false, message: 'Planned. Future: X/Twitter sentiment analysis for portfolio tickers.' },
    fields: () => null,
  },
]

function integrationNavTone(status: any): 'good' | 'warn' | 'bad' {
  if (status?.status === 'connected') return 'good'
  if (status?.status === 'planned') return 'warn'
  if (status?.status === 'not_connected') return 'bad'
  if (status?.status === 'unauthenticated' || status?.status === 'fallback') return 'warn'
  if (status?.status === 'gateway_down' || status?.status === 'error') return 'bad'
  if (status?.status === 'failed') return 'bad'
  if (status?.data_received) return 'good'
  return 'warn'
}

function formatCheckedAt(value: any) {
  if (!value) return 'Not checked yet'
  const numeric = Number(value)
  const date = Number.isFinite(numeric) ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric) : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function previewText(value: any) {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '-'
  return String(value)
}

function sampleItems(sample: any): any[] {
  if (Array.isArray(sample)) return sample
  if (Array.isArray(sample?.items)) return sample.items
  if (Array.isArray(sample?.headlines)) return sample.headlines
  if (Array.isArray(sample?.positions)) return sample.positions
  if (Array.isArray(sample?.portfolio?.positions)) return sample.portfolio.positions
  return []
}

function enabledState(sourceId: string, settings: any) {
  const cfg = settings?.[sourceId] || {}
  if (sourceId === 'ibkr') return { enabled: cfg.enabled !== false, detail: cfg.gateway_url || 'https://localhost:5000' }
  if (sourceId === 'yahoo') return { enabled: Boolean(cfg.news_enabled || cfg.fundamentals_enabled), detail: `Test ticker ${cfg.test_ticker || 'AMD'}` }
  if (sourceId === 'seeking_alpha') return { enabled: Boolean(cfg.rss_enabled || cfg.authenticated_enabled), detail: cfg.authenticated_enabled ? 'RSS + authenticated' : 'RSS preferred' }
  if (sourceId === 'rss') return { enabled: Array.isArray(cfg.feeds) && cfg.feeds.length > 0, detail: `${Array.isArray(cfg.feeds) ? cfg.feeds.length : 0} feeds` }
  if (sourceId === 'fred') return { enabled: Boolean(cfg.api_key), detail: cfg.api_key ? 'API key saved' : 'No API key' }
  if (sourceId === 'telegram') return { enabled: Boolean(cfg.bot_token && cfg.chat_id), detail: cfg.chat_id ? 'Chat configured' : 'Not configured' }
  if (sourceId === 'discord_advisor') return { enabled: cfg.mode !== 'off', detail: cfg.mode || 'manual_first' }
  if (sourceId === 'openai') return { enabled: cfg.mode !== 'off', detail: cfg.mode || 'off' }
  return { enabled: true, detail: 'Configured' }
}

const PROVIDER_MODE_OPTIONS = [
  { value: 'mock', label: 'Mock Data', description: 'Simulated portfolio only.' },
  { value: 'last-update', label: 'Last Update Real Data', description: 'Uses last successful IBKR snapshot. Works offline.' },
  { value: 'ibkr-live', label: 'Live Data', description: 'Live from IBKR Client Portal Gateway. Requires Gateway open and authenticated.' },
]

function providerModeLabel(value: unknown) {
  return PROVIDER_MODE_OPTIONS.find((option) => option.value === value)?.label || 'Mock'
}

function providerSourceLabel(value: unknown) {
  const raw = String(value || '').toUpperCase()
  if (raw === 'IBKR_LIVE') return 'Live IBKR'
  if (raw === 'LAST_UPDATE') return 'Last Update'
  if (raw === 'MOCK' || raw === 'MOCK_FALLBACK') return 'Mock'
  return providerModeLabel(value)
}

function ibkrStatusMeta(status: any) {
  const key = status?.status || 'gateway_down'
  if (key === 'connected') return { label: 'Connected', tone: 'good', detail: status?.message || 'Connected to Client Portal Gateway' }
  if (key === 'unauthenticated') return { label: 'Login Required', tone: 'warn', detail: 'Open the gateway and complete IBKR login' }
  if (key === 'gateway_down') return { label: 'Gateway Down', tone: 'bad', detail: 'Start Client Portal Gateway locally' }
  if (key === 'fallback') return { label: 'Using Fallback', tone: 'warn', detail: status?.message || 'Fallback portfolio data is active' }
  if (key === 'error') return { label: 'Error', tone: 'bad', detail: status?.message || 'Client Portal Gateway status failed' }
  if (status?.snapshot_available) return { label: 'Snapshot Ready', tone: 'good', detail: status?.snapshot_timestamp ? `Last updated at ${formatCheckedAt(status.snapshot_timestamp)}` : 'Offline snapshot is available' }
  return { label: 'Degraded', tone: 'warn', detail: status?.message || 'Provider status is degraded' }
}

function boolText(value: unknown) {
  return value ? 'Yes' : 'No'
}

const DS_MODE_OPTIONS = [
  { value: 'mock', label: 'Mock', desc: 'Simulated portfolio.' },
  { value: 'last-update', label: 'Last Update', desc: 'Last IBKR snapshot. Works offline.' },
  { value: 'ibkr-live', label: 'Live IBKR', desc: 'Requires Gateway open and authenticated.' },
] as const

function dsStatus(mode: string, result: any, checking: boolean, portfolioSource?: string): { label: string; tone: string; detail: string } {
  if (checking) return { label: 'Checking...', tone: 'warn', detail: 'Testing IBKR Gateway connection...' }
  if (mode === 'mock') return { label: 'Mock Mode', tone: 'neutral', detail: 'Portfolio uses simulated data.' }

  // backend status field: "LIVE" | "LAST_UPDATE" | "DISCONNECTED" | "MOCK" | "partial"
  const st = String(result?.status || '').toUpperCase()
  // gateway_status: "connected" | "unauthenticated" | "gateway_down" | "not_applicable"
  const gw = String(result?.gateway_status || '').toLowerCase()
  const ts = result?.snapshot_timestamp || result?.lastRefresh
  const src = String(portfolioSource || result?.active_source || '').toUpperCase()

  if (mode === 'last-update') {
    const hasSnap = result?.snapshot_available || st === 'LAST_UPDATE' || src === 'LAST_UPDATE'
    return hasSnap
      ? { label: 'Last Update Available', tone: 'good', detail: ts ? `Last updated ${formatCheckedAt(ts)}` : 'Snapshot available.' }
      : { label: 'No Snapshot', tone: 'bad', detail: 'No offline snapshot. Fetch live data first.' }
  }

  if (mode === 'ibkr-live') {
    // Use dashboard portfolio.source as the authoritative live signal
    if (src === 'IBKR_LIVE' || st === 'LIVE' || gw === 'connected') {
      return { label: 'Live Connected', tone: 'good', detail: result?.message || 'IBKR Gateway connected.' }
    }
    if (st === 'LAST_UPDATE' || src === 'LAST_UPDATE') {
      const snap = ts ? `Last updated ${formatCheckedAt(ts)}` : 'Using cached snapshot.'
      return { label: 'Live → Last Update', tone: 'warn', detail: result?.message || snap }
    }
    if (gw === 'unauthenticated') {
      return { label: 'Login Required', tone: 'warn', detail: 'Open Gateway at https://localhost:5000 and login.' }
    }
    return { label: 'Gateway Not Connected', tone: 'bad', detail: result?.message || 'Start IBKR Client Portal Gateway and login.' }
  }

  return { label: 'Unknown', tone: 'neutral', detail: '' }
}

const TFA_POLL_MS = 2_000
const TFA_POLL_MAX_MS = 90_000

function PortfolioDataSourceCard({
  hidden,
  onModeChange,
  portfolioSource,
}: {
  hidden?: boolean
  onModeChange?: () => void
  portfolioSource?: string
}) {
  const [mode, setMode] = useState('mock')
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<any>(null)
  const [saveError, setSaveError] = useState('')
  const tfaPollRef = useRef<number | null>(null)
  const tfaStartRef = useRef<number>(0)

  const stopTfaPoll = useCallback(() => {
    if (tfaPollRef.current) window.clearInterval(tfaPollRef.current)
    tfaPollRef.current = null
  }, [])

  useEffect(() => {
    Promise.allSettled([
      fetchJson('/api/portfolio/provider/mode'),
      fetchJson('/api/portfolio/provider/status'),
    ]).then(([modeRes, statusRes]) => {
      if (modeRes.status === 'fulfilled' && modeRes.value?.mode) setMode(modeRes.value.mode)
      if (statusRes.status === 'fulfilled') setCheckResult(statusRes.value)
    })
    return () => stopTfaPoll()
  }, [stopTfaPoll])

  // When portfolioSource becomes IBKR_LIVE (pushed from dashboard), stop pending poll and sync status
  useEffect(() => {
    if (portfolioSource === 'IBKR_LIVE') {
      stopTfaPoll()
      fetchJson('/api/portfolio/provider/status').then(setCheckResult).catch(() => {})
    }
  }, [portfolioSource, stopTfaPoll])

  const startTfaPoll = useCallback(() => {
    stopTfaPoll()
    tfaStartRef.current = Date.now()
    tfaPollRef.current = window.setInterval(async () => {
      if (Date.now() - tfaStartRef.current > TFA_POLL_MAX_MS) { stopTfaPoll(); return }
      try {
        const status = await fetchJson('/api/portfolio/provider/status')
        const st = String(status?.status || '').toUpperCase()
        const gw = String(status?.gateway_status || '').toLowerCase()
        if (st === 'LIVE' || gw === 'connected') {
          setCheckResult(status)
          stopTfaPoll()
          onModeChange?.()
        } else {
          setCheckResult(status)
        }
      } catch {}
    }, TFA_POLL_MS)
  }, [stopTfaPoll, onModeChange])

  async function selectMode(next: string) {
    setSaveError('')
    stopTfaPoll()
    setMode(next)
    try {
      const result = await fetchJson('/api/portfolio/provider/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      if (result?.mode) setMode(result.mode)
      onModeChange?.()
      if (next === 'ibkr-live') {
        setChecking(true)
        const status = await fetchJson('/api/portfolio/provider/status').catch(() => ({ status: 'error', message: 'Gateway check failed.' }))
        setCheckResult(status)
        setChecking(false)
        const st = String(status?.status || '').toUpperCase()
        const gw = String(status?.gateway_status || '').toLowerCase()
        if (st !== 'LIVE' && gw !== 'connected') startTfaPoll()
      } else {
        setCheckResult(result?.status || null)
      }
    } catch (err: any) {
      setSaveError(safeMessage(err?.detail, 'Unable to switch data source.'))
    }
  }

  async function testGateway() {
    stopTfaPoll()
    setChecking(true)
    const result = await fetchJson('/api/portfolio/provider/status').catch(() => ({ status: 'error', message: 'Gateway check failed.' }))
    setCheckResult(result)
    setChecking(false)
    const st = String(result?.status || '').toUpperCase()
    const gw = String(result?.gateway_status || '').toLowerCase()
    if (st !== 'LIVE' && gw !== 'connected' && mode === 'ibkr-live') startTfaPoll()
  }

  // Before the provider/mode fetch resolves (mode='mock'), infer from dashboard source to avoid a
  // misleading "Mock Mode" flash when the user is actually in ibkr-live.
  const displayMode = useMemo(() => {
    if (mode !== 'mock') return mode
    if (portfolioSource === 'IBKR_LIVE') return 'ibkr-live'
    if (portfolioSource === 'LAST_UPDATE') return 'last-update'
    return mode
  }, [mode, portfolioSource])

  if (typeof window !== 'undefined') {
    console.debug('[Settings IBKR]', {
      settingsMode: mode, displayMode,
      dashboardSource: portfolioSource,
      providerStatus: checkResult?.status,
      gatewayConnected: checkResult?.gateway_status === 'connected',
    })
  }

  const { label, tone, detail } = dsStatus(displayMode, checkResult, checking, portfolioSource)
  const isLiveConnected = tone === 'good' && displayMode === 'ibkr-live'
  const isTfaPending = Boolean(tfaPollRef.current) && !isLiveConnected && displayMode === 'ibkr-live'

  return (
    <div className="ds-card">
      <div className="ds-card-header">
        <span className="ds-card-title">{hidden ? 'Data Source' : 'Portfolio Data Source'}</span>
        <span className={`ds-status-pill ds-pill-${tone}`}>{hidden ? 'Status' : label}</span>
      </div>
      <div className="ds-mode-row" role="radiogroup" aria-label="Portfolio Data Source">
        {DS_MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={mode === opt.value}
            className={`ds-mode-btn${mode === opt.value ? ' active' : ''}`}
            onClick={() => selectMode(opt.value)}
            disabled={checking}
          >
            {hidden ? 'Source' : opt.label}
          </button>
        ))}
      </div>
      {!hidden && detail && <p className={`ds-detail ds-detail-${tone}`}>{detail}</p>}
      {!hidden && isTfaPending && (
        <p className="ds-detail ds-detail-warn">Waiting for IBKR login — approve in IBKR Mobile then return here.</p>
      )}
      {mode === 'ibkr-live' && !isLiveConnected && !checking && !isTfaPending && !hidden && (
        <div className="ds-gateway-actions">
          <button className="tab" type="button" onClick={testGateway}>Test Gateway</button>
          <a className="tab" href="https://localhost:5000" target="_blank" rel="noreferrer">Open Gateway</a>
        </div>
      )}
      {saveError && <p className="ds-error">{saveError}</p>}
    </div>
  )
}

function IbkrFact({ label, value, detail, hidden }: { label: string; value: string; detail?: string; hidden?: boolean }) {
  return (
    <div className="empty-state status-card">
      <div>
        <span className="muted" style={{ display: 'block' }}>{label}</span>
        <b style={{ display: 'block', marginTop: 4 }}>{hidden ? mask : value}</b>
      </div>
      {detail ? <small className="muted">{hidden ? mask : detail}</small> : null}
    </div>
  )
}

function IbkrProviderCard({
  hidden,
  icon,
  providerMode,
  providerStatus,
  onProviderModeChange,
  onProviderTest,
  providerTesting,
  providerTestResult,
  portfolioSource,
}: any) {
  const status = providerTestResult || providerStatus || {}
  const isPortfolioLive = portfolioSource === 'IBKR_LIVE'
  // When the dashboard confirms IBKR_LIVE, use that as authoritative override
  const meta = isPortfolioLive
    ? { label: 'Live', tone: 'good', detail: 'IBKR live data confirmed by dashboard.' }
    : ibkrStatusMeta(status)
  const configuredMode = status.configured_mode || providerMode || 'mock'
  const activeSource = isPortfolioLive ? 'IBKR_LIVE' : (status.active_source || '')
  const gatewayStatus = status.gateway_status ? ibkrStatusMeta({ status: status.gateway_status }) : null
  const gatewayLabel = isPortfolioLive ? 'Connected' : (status.gateway_status === 'not_applicable' ? 'Not Required' : gatewayStatus?.label || meta.label)

  return (
    <div className="integration-card ibkr-provider-card">
      <header>
        <div className="iconbox">{icon}</div>
        <div>
          <b>{hidden ? 'Workspace source' : 'IBKR Client Portal Gateway'}</b>
          <p className="muted">{hidden ? mask : 'Connect through IBKR Client Portal Gateway running locally on your computer.'}</p>
        </div>
        <span className={`source-pill ${meta.tone}`}>{hidden ? 'Status' : meta.label}</span>
      </header>

      <div className="ibkr-gateway-line">
        <span>Gateway URL</span>
        <a href="https://localhost:5000" target="_blank" rel="noreferrer">https://localhost:5000</a>
      </div>

      <section className="ibkr-provider-section">
        <h3>{hidden ? 'Data Source' : 'Portfolio Data Source'}</h3>
        <div className="ibkr-mode-selector" role="radiogroup" aria-label="Portfolio Data Source">
          {PROVIDER_MODE_OPTIONS.map((option) => (
            <div key={option.value} className="ibkr-mode-option">
              <button
                type="button"
                role="radio"
                aria-checked={providerMode === option.value}
                className={`tab${providerMode === option.value ? ' active' : ''}`}
                onClick={() => onProviderModeChange(option.value)}
              >
                {hidden ? 'Source' : option.label}
              </button>
              <small className="muted">{hidden ? mask : option.description}</small>
            </div>
          ))}
        </div>
      </section>

      <div className="status-grid ibkr-provider-grid">
        <IbkrFact label="Configured Mode" value={providerModeLabel(configuredMode)} hidden={hidden} />
        <IbkrFact label="Active Source" value={providerSourceLabel(activeSource || configuredMode)} hidden={hidden} />
        <IbkrFact label="Fallback Used" value={boolText(status.fallback_active)} hidden={hidden} />
        <IbkrFact label="Status" value={meta.label} detail={meta.detail} hidden={hidden} />
        <IbkrFact label="Authenticated" value={boolText(status.ibkr_authenticated)} hidden={hidden} />
        <IbkrFact label="Gateway" value={gatewayLabel} hidden={hidden} />
        <IbkrFact label="Snapshot" value={status.snapshot_available ? 'Available' : 'Unavailable'} detail={status.snapshot_timestamp ? `Last updated at ${formatCheckedAt(status.snapshot_timestamp)}` : 'Will update after the next successful live fetch'} hidden={hidden} />
      </div>

      {status.fallback_active ? (
        <div className="empty-state ibkr-fallback-message">
          <p>{hidden ? mask : status.message || 'Live IBKR unavailable. Using offline snapshot or mock fallback.'}</p>
        </div>
      ) : null}

      <div className="ibkr-test-row">
        <button className="tab active" type="button" onClick={onProviderTest} disabled={providerTesting}>
          {providerTesting ? 'Testing...' : 'Test Client Portal Gateway'}
        </button>
        <a className="tab" href="https://localhost:5000" target="_blank" rel="noreferrer">Open Gateway</a>
      </div>

      {providerTestResult ? (
        <div className="empty-state ibkr-test-result">
          <b>{hidden ? 'Result' : providerTestResult.status === 'connected' ? 'Connected to Client Portal Gateway' : ibkrStatusMeta(providerTestResult).label}</b>
          <p className="muted">{hidden ? mask : providerTestResult.message}</p>
          <div className="ibkr-result-grid">
            <span>Authenticated: <b>{hidden ? mask : String(Boolean(providerTestResult.ibkr_authenticated))}</b></span>
            <span>Accounts: <b>{hidden ? mask : providerTestResult.accounts_available ? 'available' : 'unavailable'}</b></span>
            <span>Positions: <b>{hidden ? mask : providerTestResult.positions_available ? 'available' : 'unavailable'}</b></span>
            <span>Trades: <b>{hidden ? mask : providerTestResult.trades_available ? 'available' : 'unavailable'}</b></span>
          </div>
        </div>
      ) : null}

      <div className="ibkr-help-grid">
        <div className="empty-state">
          <b>{hidden ? 'Gateway Help' : 'Client Portal Gateway setup'}</b>
          <ol>
            <li>Start Client Portal Gateway locally.</li>
            <li>Open https://localhost:5000</li>
            <li>Login with IBKR.</li>
            <li>Return to PIA and press Test Connection.</li>
          </ol>
        </div>
        <div className="empty-state">
          <b>{hidden ? 'Security' : 'Security note'}</b>
          <p className="muted">{hidden ? mask : 'PIA never stores your IBKR username or password. Live IBKR mode reads data from your local Client Portal Gateway session.'}</p>
        </div>
      </div>
    </div>
  )
}

function PreviewFacts({ sourceId, status, settings, hidden }: any) {
  const enabled = enabledState(sourceId, settings)
  const connected = status?.status === 'healthy' || status?.data_received || status?.ok
  const failed = status?.status === 'failed'
  const facts = [
    ['Enabled', enabled.enabled ? 'Enabled' : 'Disabled', enabled.detail],
    ['Connection', failed ? 'Disconnected' : connected ? 'Connected' : 'Unknown', status?.source || 'No check result'],
    ['Data received', status?.data_received ? 'Yes' : 'No', status?.status || 'not_checked'],
    ['Last checked', formatCheckedAt(status?.checked_at), 'checked_at'],
    ['Latency', status?.latency_ms != null ? `${status.latency_ms} ms` : 'Not reported', 'latency_ms'],
  ]
  return (
    <div className="status-grid">
      {facts.map(([label, value, detail]) => (
        <div className="empty-state status-card" key={label}>
          <div>
            <span className="muted" style={{ display: 'block' }}>{label}</span>
            <b style={{ display: 'block', marginTop: 4 }}>{hidden ? mask : value}</b>
          </div>
          <small className="muted">{hidden ? mask : detail}</small>
        </div>
      ))}
    </div>
  )
}

function PreviewItemList({ items, empty, hidden }: { items: any[]; empty: string; hidden?: boolean }) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <p className="muted">{hidden ? mask : empty}</p>
      </div>
    )
  }
  return (
    <div className="actions">
      {items.slice(0, 3).map((item, index) => {
        const title = item?.title || item?.first || item?.name || item?.indicator || item?.symbol || `Preview item ${index + 1}`
        const detail = item?.published || item?.timestamp || item?.source || item?.url || item?.link || item?.mode || item?.error || ''
        const count = item?.items != null ? `${item.items} items` : item?.value != null ? previewText(item.value) : ''
        return (
          <div className="action" key={`${title}-${index}`}>
            <div>
              <b style={{ display: 'block' }}>{hidden ? mask : title}</b>
              {count && <div className="muted">{hidden ? mask : count}</div>}
              {detail && <small className={item?.error ? 'red' : 'muted'} style={{ display: 'block', marginTop: 4 }}>{hidden ? mask : detail}</small>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KeyValuePreview({ sample, hidden }: { sample: any; hidden?: boolean }) {
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    return (
      <div className="empty-state">
        <p className="muted">{hidden ? mask : 'No preview data available yet.'}</p>
      </div>
    )
  }
  const entries = Object.entries(sample).filter(([, value]) => value == null || typeof value !== 'object').slice(0, 8)
  if (!entries.length) {
    return (
      <div className="empty-state">
        <p className="muted">{hidden ? mask : 'Preview sample is present but has no displayable fields yet.'}</p>
      </div>
    )
  }
  return (
    <div className="status-grid">
      {entries.map(([key, value]) => (
        <div className="empty-state" key={key}>
          <span className="muted" style={{ display: 'block' }}>{key}</span>
          <b style={{ display: 'block', marginTop: 4 }}>{hidden ? mask : previewText(value)}</b>
        </div>
      ))}
    </div>
  )
}

function IbkrPreview({ status, settings, hidden }: any) {
  const sample = status?.sample || {}
  const cfg = settings?.ibkr || {}
  const positions = sampleItems(sample)
  const connectionSample = { host: sample.host || cfg.host, port: sample.port || cfg.port, client_id: sample.client_id || cfg.client_id, status: status?.status || 'not_checked', fields: sample && typeof sample === 'object' ? Object.keys(sample).length : 0 }
  return (
    <>
      <KeyValuePreview sample={connectionSample} hidden={hidden} />
      <PreviewItemList items={positions.map((p: any) => ({ title: p.symbol || p.ticker || 'Position', value: p.market_value || p.qty || p.quantity, source: p.name || p.sec_type }))} empty={status?.data_received ? 'IBKR connected, but no sample positions were returned.' : status?.message || 'IBKR live data unavailable.'} hidden={hidden} />
    </>
  )
}

function SourceSamplePreview({ sourceId, status, settings, hidden }: any) {
  const sample = status?.sample
  if (sourceId === 'ibkr') return <IbkrPreview status={status} settings={settings} hidden={hidden} />
  if (sourceId === 'yahoo') return <PreviewItemList items={sampleItems(sample)} empty={status?.message || 'No Yahoo preview data available yet.'} hidden={hidden} />
  if (sourceId === 'seeking_alpha') {
    const items = sampleItems(sample)
    const sampleAuthIssue = sample && !Array.isArray(sample) && (sample.error || sample.auth_session_detected === false || Number(sample.status_code) >= 400)
    const hasAuthIssue = sampleAuthIssue || items.some((item) => item?.error || item?.auth_session_detected === false || Number(item?.status_code) >= 400)
    return (
      <>
        {hasAuthIssue && <div className="empty-state"><p className="muted">{hidden ? mask : 'Seeking Alpha RSS/auth preview is degraded. Check subscription/session settings if authenticated mode is enabled.'}</p></div>}
        {items.length || !sample || Array.isArray(sample)
          ? <PreviewItemList items={items} empty={status?.message || 'No Seeking Alpha preview data available yet.'} hidden={hidden} />
          : <KeyValuePreview sample={sample} hidden={hidden} />}
      </>
    )
  }
  if (sourceId === 'rss') return <PreviewItemList items={sampleItems(sample)} empty={status?.message || 'No RSS preview data available yet.'} hidden={hidden} />
  if (sourceId === 'fred') return <KeyValuePreview sample={sample || { status: status?.message || 'No macro preview data available yet.' }} hidden={hidden} />
  return <KeyValuePreview sample={sample || { status: status?.message || 'No preview data available yet.' }} hidden={hidden} />
}

function IntegrationPreview({ sourceId, status, settings, hidden }: any) {
  return (
    <div className="actions">
      <div>
        <h3>{hidden ? 'Preview' : 'Data Preview'}</h3>
        <p className="muted">{hidden ? mask : 'Latest health-check sample from this integration.'}</p>
      </div>
      <PreviewFacts sourceId={sourceId} status={status} settings={settings} hidden={hidden} />
      <div className="empty-state">
        <b>{hidden ? 'Status' : 'Last message'}</b>
        <p className={status?.status === 'failed' ? 'red' : 'muted'}>{hidden ? mask : status?.message || 'No status message reported yet.'}</p>
      </div>
      <SourceSamplePreview sourceId={sourceId} status={status} settings={settings} hidden={hidden} />
    </div>
  )
}

function IntegrationCenter({ compact = false, hidden = false, variant = 'desktop', portfolioSource }: { compact?: boolean; hidden?: boolean; variant?: SettingsVariant; portfolioSource?: string }) {
  const [settings, setSettings] = useState<any>(() => mergeIntegrationSettings(null))
  const [health, setHealth] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [testing, setTesting] = useState('')
  const [selected, setSelected] = useState<string>(INTEGRATION_DEFS[0].id)
  const [providerMode, setProviderMode] = useState('mock')
  const [providerStatus, setProviderStatus] = useState<any>(null)
  const [providerTesting, setProviderTesting] = useState(false)
  const [providerTestResult, setProviderTestResult] = useState<any>(null)

  const refreshIntegrations = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [settingsResult, healthResult, providerModeResult, providerStatusResult] = await Promise.allSettled([
      fetchJson('/settings/integrations'),
      fetchJson('/source-health'),
      fetchJson('/api/portfolio/provider/mode'),
      fetchJson('/api/portfolio/provider/status'),
    ])
    if (settingsResult.status === 'fulfilled') {
      setSettings(mergeIntegrationSettings(settingsResult.value))
    } else {
      setLoadError('Unable to load saved integrations. Editable defaults are shown until the API responds.')
    }
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (providerModeResult.status === 'fulfilled' && providerModeResult.value?.mode) setProviderMode(providerModeResult.value.mode)
    if (providerStatusResult.status === 'fulfilled') setProviderStatus(providerStatusResult.value)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshIntegrations()
  }, [refreshIntegrations])

  // Sync provider status when dashboard portfolio source changes (no separate polling needed)
  useEffect(() => {
    if (portfolioSource) {
      fetchJson('/api/portfolio/provider/status').then(setProviderStatus).catch(() => {})
    }
  }, [portfolioSource])

  function update(section: string, key: string, value: any) {
    setSettings((s: any) => ({ ...s, [section]: { ...(s?.[section] || {}), [key]: value } }))
  }

  async function save() {
    setSaveStatus('')
    const result = await fetchJson('/settings/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch((error) => {
      setSaveStatus(safeMessage(error?.detail, 'Unable to save integrations.'))
      return null
    })
    if (result?.settings) {
      setSettings(mergeIntegrationSettings(result.settings))
      setSaveStatus('Integrations saved.')
    }
  }

  async function test(src: string) {
    setTesting(src)
    const result = await fetchJson(`/settings/integrations/test/${src}`).catch(() => null)
    if (result) setHealth((old: any[]) => [result, ...old.filter((h: any) => h.source !== result.source)])
    setTesting('')
  }

  async function changeProviderMode(next: string) {
    setProviderMode(next)
    setProviderTestResult(null)
    const result = await fetchJson('/api/portfolio/provider/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: next }),
    }).catch((error) => {
      setLoadError(safeMessage(error?.detail, 'Unable to update portfolio data source.'))
      return null
    })
    if (result?.mode) setProviderMode(result.mode)
    if (result?.status) setProviderStatus(result.status)
    setSettings((s: any) => ({ ...s, data_source: { ...(s?.data_source || {}), mode: result?.mode || next } }))
  }

  async function testProviderStatus() {
    setProviderTesting(true)
    const result = await fetchJson('/api/portfolio/provider/status').catch((error) => ({
      status: 'error',
      message: safeMessage(error?.detail, 'Unable to test Client Portal Gateway.'),
    }))
    setProviderStatus(result)
    setProviderTestResult(result)
    setProviderTesting(false)
  }

  const statusFor = (def: IntegrationDef) =>
    def.id === 'ibkr' ? providerStatus : def.staticStatus || (def.statusSource ? health.find((h: any) => h.source === def.statusSource) : undefined)

  const active = INTEGRATION_DEFS.find((def) => def.id === selected) || INTEGRATION_DEFS[0]

  const layout = (
    <>
      {loadError && (
        <div className="empty-state settings-error-state" role="alert">
          <p>{hidden ? 'Integration settings are temporarily unavailable.' : loadError}</p>
          <button className="tab" type="button" onClick={refreshIntegrations}>
            Retry
          </button>
        </div>
      )}
      {loading && <p className="muted">Loading integrations...</p>}
      <div className="integration-layout">
        <nav className="integration-nav" aria-label="Integrations">
          {INTEGRATION_DEFS.map((def) => {
            const status = statusFor(def)
            return (
              <button
                key={def.id}
                type="button"
                className={`integration-nav-item${selected === def.id ? ' active' : ''}`}
                onClick={() => setSelected(def.id)}
                aria-current={selected === def.id}
              >
                <span className="integration-nav-icon" aria-hidden="true">{def.icon}</span>
                <span className="integration-nav-label">{hidden ? 'Workspace source' : def.title}</span>
                <span className={`integration-nav-dot ${integrationNavTone(status)}`} aria-hidden="true" />
              </button>
            )
          })}
        </nav>
        <div className="integration-detail">
          <IntegrationCard
            sourceId={active.id}
            title={active.title}
            hidden={hidden}
            icon={active.icon}
            settings={settings}
            status={statusFor(active)}
            doc={settings[active.id]?.documentation}
            onTest={active.testSrc ? () => test(active.testSrc as string) : undefined}
            testing={testing === active.testSrc}
            providerMode={providerMode}
            providerStatus={providerStatus}
            onProviderModeChange={changeProviderMode}
            onProviderTest={testProviderStatus}
            providerTesting={providerTesting}
            providerTestResult={providerTestResult}
            portfolioSource={portfolioSource}
          >
            {active.fields(settings, update)}
          </IntegrationCard>
          <div className="integration-detail-actions">
            <button className="tab active" type="button" onClick={save}>
              Save all integrations
            </button>
            {saveStatus && <p className="muted">{saveStatus}</p>}
          </div>
        </div>
      </div>
    </>
  )

  if (variant === 'mobile') {
    return <div className={compact ? 'compact-integrations mobile-integration-center' : 'mobile-integration-center'}>{layout}</div>
  }

  return (
    <div className={compact ? 'compact-integrations' : 'grid'}>
      <SettingsPanel title="Integration Center" span="span-12" hidden={hidden}>
        {layout}
      </SettingsPanel>
    </div>
  )
}

function IntegrationCard({
  sourceId,
  title,
  hidden,
  icon,
  settings,
  status,
  doc,
  onTest,
  testing,
  children,
  providerMode,
  providerStatus,
  onProviderModeChange,
  onProviderTest,
  providerTesting,
  providerTestResult,
  portfolioSource,
}: any) {
  if (sourceId === 'ibkr') {
    return (
      <IbkrProviderCard
        hidden={hidden}
        icon={icon}
        providerMode={providerMode}
        providerStatus={providerStatus || status}
        onProviderModeChange={onProviderModeChange}
        onProviderTest={onProviderTest}
        providerTesting={providerTesting}
        providerTestResult={providerTestResult}
        portfolioSource={portfolioSource}
      />
    )
  }
  const ok = status?.data_received
  const failed = status?.status === 'failed'
  return (
    <div className="integration-card">
      <header>
        <div className="iconbox">{icon}</div>
        <div>
          <b>{hidden ? 'Workspace source' : title}</b>
          <p className="muted">{hidden ? mask : doc}</p>
        </div>
        <span className={`source-pill ${failed ? 'bad' : ok ? 'good' : 'warn'}`}>{failed ? 'Failed' : ok ? 'Data OK' : 'No data'}</span>
      </header>
      <div className="fields">{children}</div>
      {onTest && (
        <button className="tab" type="button" onClick={onTest}>
          {testing ? 'Checking...' : 'Check connection'}
        </button>
      )}
      {status && <pre className="mini-log">{hidden ? mask : status.message}</pre>}
      <IntegrationPreview sourceId={sourceId} status={status} settings={settings} hidden={hidden} />
    </div>
  )
}

function Field({ label, value, onChange }: any) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function TextArea({ label, value, onChange, placeholder }: any) {
  return (
    <label className="field wide">
      <span>{label}</span>
      <textarea value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

function Toggle({ label, checked, onChange }: any) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

type ReleaseChangelogItem = {
  version?: string
  title?: string
  features?: string[]
  deferred?: string[]
  bugs_fixed?: string[]
}

type ReleaseAboutPayload = {
  app?: string
  version?: string
  tagline?: string
  changelog?: ReleaseChangelogItem[]
  known_issues?: string[]
  next_version?: string[]
}

type ReleaseQaPayload = {
  version?: string
  groups?: { name?: string; items?: string[] }[]
}

const releaseFallbackAbout: ReleaseAboutPayload = {
  app: 'Personal Investment Agent',
  version: 'v5.6',
  tagline: 'Personalized investment decision platform with rule-first portfolio intelligence.',
  changelog: [
    {
      version: 'v5.6',
      title: 'Integration + Product Hardening',
      features: [
        'Integration Center UI/API',
        'IBKR in-app config scaffold',
        'Yahoo connector health',
        'Seeking Alpha RSS/auth scaffold',
        'Source Health Monitor',
        'About/Changelog/QA Center',
      ],
      deferred: ['Discord cloud connector', 'AI reasoning API', 'Chart OCR'],
    },
    {
      version: 'v5.5',
      title: 'Intelligence Workbench',
      features: ['Portfolio Snapshot', 'Risk Doctor', 'Opportunity Board', 'Rules-based Trade Engine', 'Stock Intelligence Drawer'],
    },
  ],
  known_issues: [
    'Seeking Alpha authenticated parsing depends on user subscription/session and may break if the site changes.',
    'Yahoo public endpoints are best-effort and should have fallback providers later.',
    'Discord Advisor Connector is scoped for a later release.',
  ],
  next_version: ['Discord Advisor Intel connector', 'Persistent drag/drop resize grid', 'AI Lite optional layer', 'Chart screenshot/OCR later'],
}

const releaseFallbackQa: ReleaseQaPayload = {
  version: 'v5.6',
  groups: [
    { name: 'Core UI', items: ['Dashboard loads', 'No layout jumping', 'Mobile responsive', 'Privacy toggle', 'About/Changelog visible'] },
    { name: 'Integrations', items: ['Settings save/reload', 'IBKR test button', 'Yahoo test receives data', 'Source Health Monitor updates'] },
    { name: 'Portfolio/Trade', items: ['Positions tabs', 'Exposure map', 'Risk Doctor', 'Trade Engine entries/stops/targets', 'Rescan refresh'] },
  ],
}

const releaseBacklogSummary = [
  { status: 'Pending', target: 'v5.7', tone: 'warn' as const },
  { status: 'Pending', target: 'v5.7', tone: 'warn' as const },
  { status: 'Not configured', target: 'v5.7', tone: 'neutral' as const },
  { status: 'Degraded', target: 'Later', tone: 'bad' as const },
]

function stringList(value: unknown, fallback: string[] = []) {
  if (!Array.isArray(value)) return fallback
  const list = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
  return list.length ? list : fallback
}

function changelogList(value: unknown) {
  return Array.isArray(value) && value.length ? (value as ReleaseChangelogItem[]) : releaseFallbackAbout.changelog || []
}

function qaGroupList(value: unknown) {
  return Array.isArray(value) && value.length ? (value as NonNullable<ReleaseQaPayload['groups']>) : releaseFallbackQa.groups || []
}

const settingsTabs = ['General', 'Workspace', 'Integrations', 'Notifications', 'System', 'About'] as const

function GeneralSettings({ hidden }: { hidden?: boolean }) {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Profile</h3>
        <p className="muted">{hidden ? 'Workspace defaults for the current user.' : 'Decision workspace defaults for the current user.'}</p>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Use premium dark theme</span>
        </label>
        <label className="toggle">
          <input type="checkbox" />
          <span>Start with amounts hidden</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Locale</h3>
        <div className="empty-state">
          <p>Currency: USD</p>
          <p>Timezone: Europe/Athens</p>
        </div>
      </GlowCard>
    </div>
  )
}

function WorkspaceSettings({
  hidden,
  variant,
  workspaceConfig,
  onSelectWorkspace,
}: {
  hidden?: boolean
  variant: SettingsVariant
  workspaceConfig: WorkspaceConfig
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
}) {
  const [managerOpen, setManagerOpen] = useState(true)
  return (
    <div className="workspace-settings-flow">
      {managerOpen ? (
        <>
          <div className="workspace-system-head">
            <div>
              <span className="workspace-system-kicker">{hidden ? 'Workspace' : 'Settings -> Workspace'}</span>
              <h3>{hidden ? 'Workspace System' : 'Workspace System'}</h3>
              <p className="muted">
                {hidden
                  ? 'Configure navigation and saved views from one place.'
                  : 'Configure navigation surfaces, workspace order, and custom workspace presets from Settings.'}
              </p>
            </div>
          </div>
          <WorkspaceManagerPanel
            config={workspaceConfig}
            variant={variant}
            onClose={() => setManagerOpen(false)}
            onSelectWorkspace={onSelectWorkspace}
          />
        </>
      ) : (
        <div className="settings-panels">
          <GlowCard>
            <h3>Workspace System</h3>
            <p className="muted">{hidden ? 'Manage workspace navigation and saved views.' : 'Manage desktop navigation, mobile pins, workspace order, and custom workspace presets.'}</p>
            <button className="tab active" type="button" onClick={() => setManagerOpen(true)}>
              Open Workspace System
            </button>
          </GlowCard>
          <GlowCard>
            <h3>Workspace defaults</h3>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span>Compact mobile navigation</span>
            </label>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span>Remember workspace layout</span>
            </label>
          </GlowCard>
        </div>
      )}
    </div>
  )
}

function IntegrationsSettings({ hidden, variant, portfolioSource }: { hidden?: boolean; variant?: SettingsVariant; portfolioSource?: string }) {
  return (
    <div>
      <IntegrationCenter compact hidden={hidden} variant={variant} portfolioSource={portfolioSource} />
    </div>
  )
}

function NotificationsSettings() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Alerts</h3>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Portfolio guardrail alerts</span>
        </label>
        <label className="toggle">
          <input type="checkbox" />
          <span>Daily digest</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Delivery</h3>
        <div className="empty-state">
          <p>No push channel configured.</p>
          <small className="muted">Connect Discord or another channel to activate delivery.</small>
        </div>
      </GlowCard>
    </div>
  )
}

function SystemSettings({ hidden, variant }: { hidden?: boolean; variant?: SettingsVariant }) {
  return (
    <>
      <div className="settings-panels">
        <GlowCard>
          <h3>Runtime</h3>
          <p className="muted">Frontend build: Next.js 15</p>
          <p className="muted">Backend API: FastAPI ({getApiBase()})</p>
        </GlowCard>
        <GlowCard>
          <h3>Health</h3>
          <div className="empty-state">
            <p>System checks use source health where available.</p>
          </div>
        </GlowCard>
      </div>
      <SourceHealthPanel hidden={hidden} variant={variant} />
    </>
  )
}

function SettingsAbout({ hidden }: { hidden?: boolean }) {
  const [about, setAbout] = useState<ReleaseAboutPayload>(releaseFallbackAbout)
  const [qa, setQa] = useState<ReleaseQaPayload>(releaseFallbackQa)
  const [status, setStatus] = useState('Bundled release summary shown while API syncs.')

  useEffect(() => {
    let active = true
    Promise.allSettled([fetchJson('/about'), fetchJson('/qa-checklist')]).then(([aboutResult, qaResult]) => {
      if (!active) return
      if (aboutResult.status === 'fulfilled' && aboutResult.value) {
        setAbout((current) => ({ ...current, ...aboutResult.value }))
      }
      if (qaResult.status === 'fulfilled' && qaResult.value) {
        setQa((current) => ({ ...current, ...qaResult.value }))
      }
      setStatus(
        aboutResult.status === 'fulfilled' || qaResult.status === 'fulfilled'
          ? 'Release data synced from API.'
          : 'Release API unavailable; bundled release summary shown.',
      )
    })
    return () => {
      active = false
    }
  }, [])

  const appName = about.app || releaseFallbackAbout.app || 'Personal Investment Agent'
  const version = about.version || releaseFallbackAbout.version || 'Current'
  const tagline = about.tagline || releaseFallbackAbout.tagline || 'Release center and platform status.'
  const changelog = changelogList(about.changelog).slice(0, 4)
  const limitations = stringList(about.known_issues, releaseFallbackAbout.known_issues)
  const nextVersion = stringList(about.next_version, releaseFallbackAbout.next_version)
  const backlogRows = nextVersion.map((item, index) => ({
    item,
    ...(releaseBacklogSummary[index] || { status: 'Planned', target: 'Later', tone: 'neutral' as const }),
  }))
  const qaGroups = qaGroupList(qa.groups).slice(0, 5)

  return (
    <div className="settings-panels release-center-settings">
      <GlowCard>
        <SectionHeader
          title={hidden ? 'Release Center' : `${appName} ${version}`}
          subtitle={hidden ? 'Release center and platform status.' : tagline}
        />
        <div className="release-meta">
          <IntelligenceBadge label="UAT ready" tone="good" />
          <IntelligenceBadge label="Rule engine active" tone="neutral" />
          <IntelligenceBadge label={`${limitations.length} known limitations`} tone={limitations.length ? 'warn' : 'good'} />
        </div>
        <p className="muted">{status}</p>
      </GlowCard>

      <GlowCard>
        <h3>App / Version</h3>
        <div className="empty-state">
          <p><b>App:</b> {appName}</p>
          <p><b>Version:</b> {version}</p>
          <p><b>QA checklist:</b> {qa.version || version}</p>
        </div>
      </GlowCard>

      <GlowCard>
        <h3>Changelog Summary</h3>
        <div className="actions">
          {changelog.map((item) => {
            const features = stringList(item.features)
            const deferred = stringList(item.deferred)
            return (
              <div className="version-card" key={`${item.version || 'release'}-${item.title || 'summary'}`}>
                <b>{`${item.version || version} - ${item.title || 'Release update'}`}</b>
                {features.length ? (
                  <ul>{features.slice(0, 5).map((feature) => <li key={feature}>{feature}</li>)}</ul>
                ) : (
                  <p className="muted">No changelog details published for this entry.</p>
                )}
                {deferred.length ? <small className="muted">Deferred: {deferred.join(', ')}</small> : null}
              </div>
            )
          })}
        </div>
      </GlowCard>

      <GlowCard>
        <h3>Backlog Summary</h3>
        <div className="actions">
          {backlogRows.map((row) => (
            <div className="version-card" key={row.item}>
              <b>{row.item}</b>
              <div className="release-meta">
                <IntelligenceBadge label={row.status} tone={row.tone} />
                <IntelligenceBadge label={`Target ${row.target}`} tone="neutral" />
              </div>
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard>
        <h3>UAT Checklist</h3>
        <div className="actions">
          {qaGroups.map((group) => (
            <div className="version-card" key={group.name || 'uat-group'}>
              <b>{group.name || 'Checklist'}</b>
              <ul>{stringList(group.items).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          ))}
        </div>
      </GlowCard>

      <GlowCard>
        <h3>Known Limitations</h3>
        <div className="empty-state">
          <ul>{limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </GlowCard>
    </div>
  )
}

function SettingsTabPanels({
  tab,
  hidden,
  variant,
  workspaceConfig,
  onSelectWorkspace,
  portfolioSource,
}: {
  tab: (typeof settingsTabs)[number]
  hidden?: boolean
  variant: SettingsVariant
  workspaceConfig: WorkspaceConfig
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
  portfolioSource?: string
}) {
  if (tab === 'General') return <GeneralSettings hidden={hidden} />
  if (tab === 'Workspace') return <WorkspaceSettings hidden={hidden} variant={variant} workspaceConfig={workspaceConfig} onSelectWorkspace={onSelectWorkspace} />
  if (tab === 'Integrations') return <IntegrationsSettings hidden={hidden} variant={variant} portfolioSource={portfolioSource} />
  if (tab === 'Notifications') return <NotificationsSettings />
  if (tab === 'System') return <SystemSettings hidden={hidden} variant={variant} />
  return <SettingsAbout hidden={hidden} />
}

export default function SettingsPage({
  hidden = false,
  variant = 'desktop',
  workspaceConfig: providedWorkspaceConfig,
  onSelectWorkspace,
  onModeChange,
  portfolioSource,
}: {
  hidden?: boolean
  variant?: SettingsVariant
  workspaceConfig?: WorkspaceConfig
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
  onModeChange?: () => void
  portfolioSource?: string
}) {
  const localWorkspaceConfig = useWorkspaceConfig()
  const workspaceConfig = providedWorkspaceConfig || localWorkspaceConfig
  const [tab, setTab] = useState<(typeof settingsTabs)[number]>('General')

  const tabs = (
    <div className={`settings-tabs ${variant === 'mobile' ? 'mobile-settings-tabs' : ''}`.trim()}>
      {settingsTabs.map((item) => (
        <button key={item} type="button" className={`tab ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>
          {item}
        </button>
      ))}
    </div>
  )

  const panels = <SettingsTabPanels tab={tab} hidden={hidden} variant={variant} workspaceConfig={workspaceConfig} onSelectWorkspace={onSelectWorkspace} portfolioSource={portfolioSource} />

  if (variant === 'mobile') {
    return (
      <div className="mobile-settings-workspace">
        <PortfolioDataSourceCard hidden={hidden} onModeChange={onModeChange} portfolioSource={portfolioSource} />
        {tabs}
        <div className="mobile-settings-body">{panels}</div>
      </div>
    )
  }

  return (
    <div className="grid">
      <SettingsPanel title="Settings" span="span-12" hidden={hidden}>
        {tabs}
        {panels}
      </SettingsPanel>
    </div>
  )
}
