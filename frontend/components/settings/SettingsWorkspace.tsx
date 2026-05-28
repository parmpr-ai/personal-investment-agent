'use client'

import React, { useEffect, useState } from 'react'
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
import SectionHeader from '../ui/SectionHeader'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import { API, assetTypes, brokers, emptyHolding, fetchJson, mask, money, safeMessage } from '../../lib/pia-api'

type SettingsVariant = 'desktop' | 'mobile'

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

function IntegrationCenter({ compact = false, hidden = false, variant = 'desktop' }: { compact?: boolean; hidden?: boolean; variant?: SettingsVariant }) {
  const [settings, setSettings] = useState<any>(null)
  const [health, setHealth] = useState<any[]>([])
  const [testing, setTesting] = useState('')

  useEffect(() => {
    fetchJson('/settings/integrations').then(setSettings).catch(() => {})
    fetchJson('/source-health').then(setHealth).catch(() => {})
  }, [])

  function update(section: string, key: string, value: any) {
    setSettings((s: any) => ({ ...s, [section]: { ...(s?.[section] || {}), [key]: value } }))
  }

  async function save() {
    const result = await fetchJson('/settings/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }).catch(() => null)
    if (result?.settings) setSettings(result.settings)
  }

  async function test(src: string) {
    setTesting(src)
    const result = await fetchJson(`/settings/integrations/test/${src}`).catch(() => null)
    if (result) setHealth((old: any[]) => [result, ...old.filter((h: any) => h.source !== result.source)])
    setTesting('')
  }

  if (!settings) return <div className="panel">Loading integrations...</div>

  const cards = (
    <>
      <p className="muted">
        {hidden
          ? 'Each card has connection fields, a test action, and the latest workspace status.'
          : 'Each card has connection fields, a test action, and the latest data status.'}
      </p>
      <div className="integration-grid">
        <IntegrationCard title="IBKR" hidden={hidden} icon={<Wallet />} status={health.find((h: any) => h.source === 'IBKR')} doc={settings.ibkr.documentation} onTest={() => test('ibkr')} testing={testing === 'ibkr'}>
          <Field label="Host" value={settings.ibkr.host} onChange={(v: any) => update('ibkr', 'host', v)} />
          <Field label="Port" value={settings.ibkr.port} onChange={(v: any) => update('ibkr', 'port', Number(v))} />
          <Field label="Client ID" value={settings.ibkr.client_id} onChange={(v: any) => update('ibkr', 'client_id', Number(v))} />
          <Toggle label="Enabled" checked={settings.ibkr.enabled} onChange={(v: any) => update('ibkr', 'enabled', v)} />
        </IntegrationCard>
        <IntegrationCard title="Yahoo Finance" hidden={hidden} icon={<Globe2 />} status={health.find((h: any) => h.source === 'Yahoo Finance')} doc={settings.yahoo.documentation} onTest={() => test('yahoo')} testing={testing === 'yahoo'}>
          <Field label="Test ticker" value={settings.yahoo.test_ticker} onChange={(v: any) => update('yahoo', 'test_ticker', v.toUpperCase())} />
          <Toggle label="News" checked={settings.yahoo.news_enabled} onChange={(v: any) => update('yahoo', 'news_enabled', v)} />
          <Toggle label="Fundamentals" checked={settings.yahoo.fundamentals_enabled} onChange={(v: any) => update('yahoo', 'fundamentals_enabled', v)} />
        </IntegrationCard>
        <IntegrationCard title="Seeking Alpha" hidden={hidden} icon={<BookOpen />} status={health.find((h: any) => h.source === 'Seeking Alpha')} doc={settings.seeking_alpha.documentation} onTest={() => test('seeking-alpha')} testing={testing === 'seeking-alpha'}>
          <Toggle label="Enable RSS" checked={settings.seeking_alpha.rss_enabled} onChange={(v: any) => update('seeking_alpha', 'rss_enabled', v)} />
          <Toggle label="Authenticated deep parsing" checked={settings.seeking_alpha.authenticated_enabled} onChange={(v: any) => update('seeking_alpha', 'authenticated_enabled', v)} />
          <Field label="Test URL" value={settings.seeking_alpha.test_url} onChange={(v: any) => update('seeking_alpha', 'test_url', v)} />
          <TextArea label="Session Cookie/Header" value={settings.seeking_alpha.cookie_header} onChange={(v: any) => update('seeking_alpha', 'cookie_header', v)} placeholder="Paste your subscriber session cookie header. No password is stored." />
        </IntegrationCard>
        <IntegrationCard title="RSS / Email Adapters" hidden={hidden} icon={<Database />} status={health.find((h: any) => h.source === 'RSS')} doc={settings.rss.documentation} onTest={() => test('rss')} testing={testing === 'rss'}>
          <TextArea label="RSS feeds JSON" value={JSON.stringify(settings.rss.feeds, null, 2)} onChange={(v: any) => { try { update('rss', 'feeds', JSON.parse(v)) } catch {} }} />
        </IntegrationCard>
        <IntegrationCard title="FRED / Macro" hidden={hidden} icon={<BarChart3 />} status={health.find((h: any) => h.source === 'FRED/Macro')} doc={settings.fred.documentation} onTest={() => test('fred')} testing={testing === 'fred'}>
          <Field label="API key" value={settings.fred.api_key} onChange={(v: any) => update('fred', 'api_key', v)} />
        </IntegrationCard>
        <IntegrationCard title="Telegram / Alerts" hidden={hidden} icon={<Activity />} status={health.find((h: any) => h.source === 'Telegram')} doc={settings.telegram.documentation} onTest={() => test('telegram')} testing={testing === 'telegram'}>
          <Field label="Bot token" value={settings.telegram.bot_token} onChange={(v: any) => update('telegram', 'bot_token', v)} />
          <Field label="Chat ID" value={settings.telegram.chat_id} onChange={(v: any) => update('telegram', 'chat_id', v)} />
        </IntegrationCard>
        <IntegrationCard title="Advisor Intel" hidden={hidden} icon={<Brain />} status={health.find((h: any) => h.source === 'Advisor Intel')} doc={settings.discord_advisor.documentation}>
          <Field label="Mode" value={settings.discord_advisor.mode} onChange={(v: any) => update('discord_advisor', 'mode', v)} />
        </IntegrationCard>
        <IntegrationCard title="AI Lite" hidden={hidden} icon={<Brain />} status={{ status: 'connected_no_data', data_received: false, message: 'Optional later; rules engine active' }} doc={settings.openai.documentation}>
          <Field label="Mode" value={settings.openai.mode} onChange={(v: any) => update('openai', 'mode', v)} />
          <Field label="Daily budget EUR" value={settings.openai.daily_budget_eur} onChange={(v: any) => update('openai', 'daily_budget_eur', Number(v))} />
        </IntegrationCard>
      </div>
      <button className="tab active" type="button" onClick={save}>
        Save all integrations
      </button>
    </>
  )

  if (variant === 'mobile') {
    return <div className={compact ? 'compact-integrations mobile-integration-center' : 'mobile-integration-center'}>{cards}</div>
  }

  return (
    <div className={compact ? 'compact-integrations' : 'grid'}>
      <SettingsPanel title="Integration Center" span="span-12" hidden={hidden}>
        {cards}
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

function WorkspaceSettings({ hidden }: { hidden?: boolean }) {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>Workspace</h3>
        <p className="muted">{hidden ? 'Tune density without changing workspace logic.' : 'Tune density without changing portfolio logic.'}</p>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Compact mobile navigation</span>
        </label>
        <label className="toggle">
          <input type="checkbox" defaultChecked />
          <span>Remember workspace layout</span>
        </label>
      </GlowCard>
      <GlowCard>
        <h3>Empty states</h3>
        <div className="empty-state">
          <p>No custom workspace presets yet.</p>
          <small className="muted">Saved views can land here in a later release.</small>
        </div>
      </GlowCard>
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
      <IntegrationStatusCards hidden={hidden} />
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
          <p className="muted">Backend API: FastAPI ({API})</p>
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

function SettingsAbout() {
  return (
    <div className="settings-panels">
      <GlowCard>
        <h3>About</h3>
        <p className="muted">Release details live in the desktop About / Release Center view.</p>
        <a className="tab" href="/#tool=about">
          Open release center
        </a>
      </GlowCard>
    </div>
  )
}

function IntegrationStatusCards({ hidden = false }: { hidden?: boolean }) {
  const [health, setHealth] = useState<any[]>([])
  useEffect(() => {
    fetchJson('/source-health').then(setHealth).catch(() => {})
  }, [])
  const bySource = (name: string) => health.find((item: any) => item.source === name)
  const cards: any[] = [
    { name: 'IBKR', status: bySource('IBKR') },
    { name: 'Yahoo', status: bySource('Yahoo Finance') },
    { name: 'Seeking Alpha', status: bySource('Seeking Alpha') },
    { name: 'Discord', label: 'Pending' },
    { name: 'X / Twitter', label: 'Not configured' },
    { name: 'News feeds', status: bySource('RSS') },
  ]
  return (
    <div className="status-grid">
      {cards.map((card) => {
        const label = card.label || (card.status?.status === 'healthy' ? 'Data OK' : card.status?.status === 'connected_no_data' ? 'Pending' : card.status?.status === 'failed' ? 'Degraded' : 'Not configured')
        const tone = label === 'Data OK' ? 'good' : label === 'Pending' ? 'warn' : label === 'Degraded' ? 'bad' : 'neutral'
        return (
          <GlowCard className="status-card" key={card.name}>
            <span>{hidden ? 'Workspace source' : card.name}</span>
            <IntelligenceBadge label={label} tone={tone} />
          </GlowCard>
        )
      })}
    </div>
  )
}

function SettingsTabPanels({ tab, hidden, variant }: { tab: (typeof settingsTabs)[number]; hidden?: boolean; variant: SettingsVariant }) {
  if (tab === 'General') return <GeneralSettings hidden={hidden} />
  if (tab === 'Workspace') return <WorkspaceSettings hidden={hidden} />
  if (tab === 'Manual Holdings') return <ManualHoldingsSettings hidden={hidden} />
  if (tab === 'Integrations') return <IntegrationsSettings hidden={hidden} variant={variant} />
  if (tab === 'Notifications') return <NotificationsSettings />
  if (tab === 'System') return <SystemSettings hidden={hidden} variant={variant} />
  return <SettingsAbout />
}

export default function SettingsPage({ hidden = false, variant = 'desktop' }: { hidden?: boolean; variant?: SettingsVariant }) {
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

  const panels = <SettingsTabPanels tab={tab} hidden={hidden} variant={variant} />

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
