'use client'

import React, { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  Database,
  Globe2,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import GlowCard from '../ui/GlowCard'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import SectionHeader from '../ui/SectionHeader'
import { assetTypes, brokers, emptyHolding, fetchJson, getApiBase, mask, money, safeMessage } from '../../lib/pia-api'
import { WorkspaceManagerPanel, useWorkspaceConfig, type WorkspaceId } from '../workspace'

type SettingsVariant = 'desktop' | 'mobile'
type WorkspaceConfig = ReturnType<typeof useWorkspaceConfig>

const defaultIntegrationSettings: any = {
  ibkr: {
    enabled: true,
    host: '127.0.0.1',
    port: 4001,
    client_id: 21,
    documentation: 'Open IB Gateway/TWS, enable API socket clients, set read-only API, set trusted IP 127.0.0.1, then test connection.',
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
    fields: (s, update) => (
      <>
        <Field label="Host" value={s.ibkr.host} onChange={(v: any) => update('ibkr', 'host', v)} />
        <Field label="Port" value={s.ibkr.port} onChange={(v: any) => update('ibkr', 'port', Number(v))} />
        <Field label="Client ID" value={s.ibkr.client_id} onChange={(v: any) => update('ibkr', 'client_id', Number(v))} />
        <Toggle label="Enabled" checked={s.ibkr.enabled} onChange={(v: any) => update('ibkr', 'enabled', v)} />
      </>
    ),
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
]

function integrationNavTone(status: any): 'good' | 'warn' | 'bad' {
  if (status?.status === 'failed') return 'bad'
  if (status?.data_received) return 'good'
  return 'warn'
}

function IntegrationCenter({ compact = false, hidden = false, variant = 'desktop' }: { compact?: boolean; hidden?: boolean; variant?: SettingsVariant }) {
  const [settings, setSettings] = useState<any>(() => mergeIntegrationSettings(null))
  const [health, setHealth] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [testing, setTesting] = useState('')
  const [selected, setSelected] = useState<string>(INTEGRATION_DEFS[0].id)

  const refreshIntegrations = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const [settingsResult, healthResult] = await Promise.allSettled([
      fetchJson('/settings/integrations'),
      fetchJson('/source-health'),
    ])
    if (settingsResult.status === 'fulfilled') {
      setSettings(mergeIntegrationSettings(settingsResult.value))
    } else {
      setLoadError('Unable to load saved integrations. Editable defaults are shown until the API responds.')
    }
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    setLoading(false)
  }, [])

  useEffect(() => {
    refreshIntegrations()
  }, [refreshIntegrations])

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

  const statusFor = (def: IntegrationDef) =>
    def.staticStatus || (def.statusSource ? health.find((h: any) => h.source === def.statusSource) : undefined)

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
            title={active.title}
            hidden={hidden}
            icon={active.icon}
            status={statusFor(active)}
            doc={settings[active.id]?.documentation}
            onTest={active.testSrc ? () => test(active.testSrc as string) : undefined}
            testing={testing === active.testSrc}
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

function IntegrationCard({ title, hidden, icon, status, doc, onTest, testing, children }: any) {
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

const settingsTabs = ['General', 'Workspace', 'Manual Holdings', 'Integrations', 'Notifications', 'System', 'About'] as const

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

function ManualHoldingsSettings({ hidden }: { hidden?: boolean }) {
  const [holdings, setHoldings] = useState<any[]>([])
  const [form, setForm] = useState<any>(emptyHolding)
  const [editingId, setEditingId] = useState('')
  const [status, setStatus] = useState('')

  const refresh = () => fetchJson('/manual-holdings').then(setHoldings).catch(() => setStatus('Manual holdings API is unavailable.'))

  useEffect(() => {
    refresh()
  }, [])

  function updateForm(key: string, value: any) {
    setForm((current: any) => ({ ...current, [key]: value }))
  }

  function startEdit(holding: any) {
    setEditingId(holding.id)
    setForm({
      ticker: holding.ticker || '',
      name: holding.name || '',
      asset_type: holding.asset_type || 'Stock',
      broker: holding.broker || 'Manual',
      quantity: holding.quantity ?? '',
      avg_price: holding.avg_price ?? '',
      currency: holding.currency || 'USD',
      notes: holding.notes || '',
    })
    setStatus('')
  }

  function resetForm() {
    setEditingId('')
    setForm(emptyHolding)
  }

  async function saveHolding(event: React.FormEvent) {
    event.preventDefault()
    setStatus('')
    const payload = {
      ...form,
      ticker: String(form.ticker || '').toUpperCase(),
      quantity: Number(form.quantity),
      avg_price: Number(form.avg_price),
      currency: String(form.currency || 'USD').toUpperCase(),
    }
    const path = editingId ? `/manual-holdings/${editingId}` : '/manual-holdings'
    const method = editingId ? 'PUT' : 'POST'
    const result = await fetchJson(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((error) => {
      setStatus(safeMessage(error?.detail, 'Unable to save manual holding.'))
      return null
    })
    if (!result) return
    setStatus(editingId ? 'Manual holding updated.' : 'Manual holding added.')
    resetForm()
    refresh()
  }

  async function removeHolding(id: string) {
    const result = await fetchJson(`/manual-holdings/${id}`, { method: 'DELETE' }).catch((error) => {
      setStatus(safeMessage(error?.detail, 'Unable to delete manual holding.'))
      return null
    })
    if (!result) return
    setStatus('Manual holding deleted.')
    if (editingId === id) resetForm()
    refresh()
  }

  return (
    <div className="manual-holdings">
      <GlowCard>
        <SectionHeader
          title={hidden ? 'Manual Assets' : 'Manual Holdings'}
          subtitle={hidden ? 'Manage external positions.' : 'Add Freedom24, Revolut, IBKR-adjacent, or manually tracked assets.'}
        />
        <form className="manual-form" onSubmit={saveHolding}>
          <Field label="Ticker" value={form.ticker} onChange={(v: any) => updateForm('ticker', v.toUpperCase())} />
          <Field label="Name" value={form.name} onChange={(v: any) => updateForm('name', v)} />
          <label className="field">
            <span>Asset Type</span>
            <select value={form.asset_type} onChange={(e) => updateForm('asset_type', e.target.value)}>
              {assetTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Broker</span>
            <select value={form.broker} onChange={(e) => updateForm('broker', e.target.value)}>
              {brokers.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <Field label="Quantity" value={form.quantity} onChange={(v: any) => updateForm('quantity', v)} />
          <Field label="Average Price" value={form.avg_price} onChange={(v: any) => updateForm('avg_price', v)} />
          <Field label="Currency" value={form.currency} onChange={(v: any) => updateForm('currency', v.toUpperCase())} />
          <TextArea label="Notes" value={form.notes} onChange={(v: any) => updateForm('notes', v)} placeholder="Source account, thesis, or manual valuation notes." />
          <div className="manual-actions">
            <button className="tab active" type="submit">
              {editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? 'Update holding' : 'Add holding'}
            </button>
            {editingId && (
              <button className="tab" type="button" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
        {status && <p className="muted">{status}</p>}
      </GlowCard>
      <GlowCard>
        <SectionHeader
          title={hidden ? 'External Assets' : 'Tracked Manual Holdings'}
          subtitle={hidden ? `${holdings.length} items` : `${holdings.length} holdings merged into portfolio totals when present`}
        />
        <div className="table-wrap">
          <table className="manual-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Broker</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Avg</th>
                <th>Currency</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <tr key={holding.id}>
                  <td>
                    <b>{hidden ? mask : holding.ticker}</b>
                    <div className="muted">{hidden ? 'Workspace item' : holding.name}</div>
                  </td>
                  <td>{hidden ? mask : holding.broker}</td>
                  <td>
                    <span className="badge">{hidden ? mask : holding.asset_type}</span>
                  </td>
                  <td>{hidden ? mask : holding.quantity}</td>
                  <td>{hidden ? mask : money(holding.avg_price)}</td>
                  <td>{hidden ? mask : holding.currency}</td>
                  <td>{hidden ? mask : holding.notes || '-'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-tab" type="button" onClick={() => startEdit(holding)} aria-label={`Edit ${holding.ticker}`}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-tab danger" type="button" onClick={() => removeHolding(holding.id)} aria-label={`Delete ${holding.ticker}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!holdings.length && <div className="empty-state">No manual holdings yet.</div>}
        </div>
      </GlowCard>
    </div>
  )
}

function IntegrationsSettings({ hidden, variant }: { hidden?: boolean; variant?: SettingsVariant }) {
  return (
    <div>
      <IntegrationCenter compact hidden={hidden} variant={variant} />
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
}: {
  tab: (typeof settingsTabs)[number]
  hidden?: boolean
  variant: SettingsVariant
  workspaceConfig: WorkspaceConfig
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
}) {
  if (tab === 'General') return <GeneralSettings hidden={hidden} />
  if (tab === 'Workspace') return <WorkspaceSettings hidden={hidden} variant={variant} workspaceConfig={workspaceConfig} onSelectWorkspace={onSelectWorkspace} />
  if (tab === 'Manual Holdings') return <ManualHoldingsSettings hidden={hidden} />
  if (tab === 'Integrations') return <IntegrationsSettings hidden={hidden} variant={variant} />
  if (tab === 'Notifications') return <NotificationsSettings />
  if (tab === 'System') return <SystemSettings hidden={hidden} variant={variant} />
  return <SettingsAbout hidden={hidden} />
}

export default function SettingsPage({
  hidden = false,
  variant = 'desktop',
  workspaceConfig: providedWorkspaceConfig,
  onSelectWorkspace,
}: {
  hidden?: boolean
  variant?: SettingsVariant
  workspaceConfig?: WorkspaceConfig
  onSelectWorkspace?: (workspaceId: WorkspaceId) => void
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

  const panels = <SettingsTabPanels tab={tab} hidden={hidden} variant={variant} workspaceConfig={workspaceConfig} onSelectWorkspace={onSelectWorkspace} />

  if (variant === 'mobile') {
    return (
      <div className="mobile-settings-workspace">
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
