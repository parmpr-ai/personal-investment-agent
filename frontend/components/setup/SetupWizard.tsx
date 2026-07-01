'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Copy, Cpu, Database, Radar, RefreshCw, ShieldCheck, Sparkles, WifiOff } from 'lucide-react'
import GlowCard from '../ui/GlowCard'
import IntelligenceBadge from '../ui/IntelligenceBadge'
import RiskGauge from '../ui/RiskGauge'
import SectionHeader from '../ui/SectionHeader'
import StatusCard from './StatusCard'
import { defaultPreferences, setupStorage } from './storage'
import type { ConnectionMethod, LiveConnectionResult, SetupDiagnostics, SetupPreferences } from './types'
import { fetchApi } from '../../lib/runtime-config'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000'
const totalSteps = 7
const command = 'docker run -it --rm -p 5000:5000 voyz/ibeam'

async function fetchJson<T>(path: string, timeoutMs = 3500): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchApi<T>(path, { signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

const methods = [
  {
    id: 'client-portal',
    title: 'Client Portal Gateway',
    badge: 'Recommended',
    pros: ['Best guided path', 'Browser authentication', 'Works well with Docker'],
    cons: ['Requires Java + Docker', 'Session refresh may be needed'],
    difficulty: 'Moderate',
    realtime: 'Yes',
    deployment: 'Best for local setup',
  },
  {
    id: 'local-gateway',
    title: 'Local Gateway / TWS',
    badge: 'Advanced',
    pros: ['Direct local workflow', 'Good for experienced IBKR users'],
    cons: ['More manual setup', 'Less beginner-friendly'],
    difficulty: 'Advanced',
    realtime: 'Yes',
    deployment: 'Desktop-first',
  },
  {
    id: 'demo',
    title: 'Demo Mode',
    badge: 'Fastest start',
    pros: ['No broker setup', 'Explore immediately'],
    cons: ['No live account', 'Demo data only'],
    difficulty: 'Easy',
    realtime: 'No',
    deployment: 'Any environment',
  },
] as const

export default function SetupWizard() {
  const [step, setStep] = useState(1)
  const [method, setMethod] = useState<ConnectionMethod | null>(null)
  const [diagnostics, setDiagnostics] = useState<SetupDiagnostics | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState(false)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsRetry, setDiagnosticsRetry] = useState(0)
  const [live, setLive] = useState<LiveConnectionResult | null>(null)
  const [liveError, setLiveError] = useState(false)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveRetry, setLiveRetry] = useState(0)
  const [preferences, setPreferences] = useState<SetupPreferences>(defaultPreferences)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setStep(setupStorage.getStep())
    setMethod(setupStorage.getConnectionMethod())
    setPreferences(setupStorage.getPreferences())
  }, [])

  useEffect(() => setupStorage.setStep(step), [step])
  useEffect(() => {
    if (method) setupStorage.setConnectionMethod(method)
  }, [method])
  useEffect(() => setupStorage.setPreferences(preferences), [preferences])

  useEffect(() => {
    if (step !== 3) return
    let active = true
    let pollTimer: number | null = null
    const checkDiagnostics = async (showLoading = false) => {
      if (showLoading) setDiagnosticsLoading(true)
      setDiagnosticsError(false)
      try {
        const data = await fetchJson<SetupDiagnostics>('/setup/diagnostics')
        if (!active) return
        setDiagnostics(data)
        if ((data.ibkr_gateway_reachable || data.gateway_running) && !data.ibkr_authenticated) {
          pollTimer = window.setTimeout(() => void checkDiagnostics(false), 2_000)
        }
      } catch {
        if (!active) return
        setDiagnostics(null)
        setDiagnosticsError(true)
        pollTimer = window.setTimeout(() => void checkDiagnostics(false), 2_000)
      } finally {
        if (active && showLoading) setDiagnosticsLoading(false)
      }
    }
    void checkDiagnostics(true)
    return () => {
      active = false
      if (pollTimer) window.clearTimeout(pollTimer)
    }
  }, [step, diagnosticsRetry])

  useEffect(() => {
    if (step !== 5) return
    let active = true
    setLiveLoading(true)
    setLiveError(false)
    Promise.all([fetchJson<any>('/health'), fetchJson<any>('/portfolio')])
      .then(([health, portfolio]) => {
        if (!active) return
        const positions = portfolio?.positions || []
        setLive({
          healthOk: !!health?.ok,
          accountDetected: portfolio?.source === 'IBKR_LIVE',
          positionsCount: positions.length,
          marketDataAvailable: positions.some((position: any) => Number(position?.last || 0) > 0),
          source: portfolio?.source,
        })
      })
      .catch(() => {
        if (!active) return
        setLive(null)
        setLiveError(true)
      })
      .finally(() => active && setLiveLoading(false))
    return () => {
      active = false
    }
  }, [step, liveRetry])

  const progress = Math.round((step / totalSteps) * 100)
  const canContinue = step !== 2 || !!method
  const selectedMethod = methods.find((item) => item.id === method)
  const riskValue = useMemo(() => {
    if (!diagnostics) return 70
    return [diagnostics.java_installed, diagnostics.docker_installed, diagnostics.docker_daemon_running, diagnostics.ibkr_gateway_reachable, diagnostics.ibkr_authenticated, diagnostics.demo_mode_available].filter(Boolean).length * 16
  }, [diagnostics])

  function next() {
    if (step < totalSteps && canContinue) setStep((current) => current + 1)
  }

  function back() {
    setStep((current) => Math.max(1, current - 1))
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }

  return (
    <main className="setup-shell">
      <div className="setup-progress">
        <span>
          Step {step} of {totalSteps}
        </span>
        <div>
          <i style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="setup-stage">
        {step === 1 && <WelcomeStep />}
        {step === 2 && <MethodStep method={method} setMethod={setMethod} />}
        {step === 3 && <DiagnosticsStep diagnostics={diagnostics} error={diagnosticsError} loading={diagnosticsLoading} riskValue={riskValue} onRetry={() => setDiagnosticsRetry((value) => value + 1)} />}
        {step === 4 && <GuideStep copied={copied} onCopy={copyCommand} />}
        {step === 5 && <LiveTestStep live={live} error={liveError} loading={liveLoading} method={selectedMethod?.title} onRetry={() => setLiveRetry((value) => value + 1)} />}
        {step === 6 && <PersonalizationStep preferences={preferences} setPreferences={setPreferences} />}
        {step === 7 && <FinishStep />}
      </div>

      <div className="setup-actions">
        <button className="tab" onClick={back} disabled={step === 1}>
          <ArrowLeft size={16} /> Back
        </button>
        {step < totalSteps ? (
          <button className={`tab ${canContinue ? 'active' : ''}`} onClick={next} disabled={!canContinue}>
            {step === 1 ? 'Start Setup' : 'Continue'} <ArrowRight size={16} />
          </button>
        ) : (
          <a className="tab active" href="/" onClick={() => setupStorage.markComplete()}>
            Launch PIA Dashboard <ArrowRight size={16} />
          </a>
        )}
      </div>
    </main>
  )
}

function WelcomeStep() {
  return (
    <section className="setup-panel">
      <SectionHeader title="Welcome to PIA" subtitle="A guided first-run setup for your investment workspace." />
      <div className="setup-hero">
        <div>
          <IntelligenceBadge label="Premium onboarding" tone="good" />
          <h1>Connect once. Let PIA organize the rest.</h1>
          <p>We’ll guide you through portfolio connection, macro signals, scanner behavior, and AI-assisted insights without requiring technical knowledge.</p>
        </div>
        <GlowCard className="setup-feature-grid">
          <Feature icon={<Database />} title="Portfolio connection" text="Link IBKR or begin in demo mode." />
          <Feature icon={<Cpu />} title="Macros" text="Track rates, yields, and market regime." />
          <Feature icon={<Radar />} title="Scanner" text="Tune opportunity sensitivity." />
          <Feature icon={<Sparkles />} title="AI insights" text="Surface concise decision support." />
        </GlowCard>
      </div>
    </section>
  )
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="setup-feature">
      {icon}
      <b>{title}</b>
      <span>{text}</span>
    </div>
  )
}

function MethodStep({
  method,
  setMethod,
}: {
  method: ConnectionMethod | null
  setMethod: (method: ConnectionMethod) => void
}) {
  return (
    <section className="setup-panel">
      <SectionHeader title="Choose your IBKR connection path" subtitle="Pick the setup style that matches your comfort level." />
      <div className="setup-method-grid">
        {methods.map((item) => (
          <button key={item.id} className={`setup-method-card ${method === item.id ? 'selected' : ''}`} onClick={() => setMethod(item.id)}>
            <header>
              <b>{item.title}</b>
              <IntelligenceBadge label={item.badge} tone={item.id === 'client-portal' ? 'good' : item.id === 'demo' ? 'neutral' : 'warn'} />
            </header>
            <div className="setup-method-meta">
              <span>Difficulty: {item.difficulty}</span>
              <span>Realtime: {item.realtime}</span>
              <span>{item.deployment}</span>
            </div>
            <div>
              <strong>Pros</strong>
              <ul>{item.pros.map((value) => <li key={value}>{value}</li>)}</ul>
            </div>
            <div>
              <strong>Cons</strong>
              <ul>{item.cons.map((value) => <li key={value}>{value}</li>)}</ul>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function DiagnosticsStep({
  diagnostics,
  error,
  loading,
  riskValue,
  onRetry,
}: {
  diagnostics: SetupDiagnostics | null
  error: boolean
  loading: boolean
  riskValue: number
  onRetry: () => void
}) {
  const cards = diagnostics
    ? [
        ['Backend API', diagnostics.backend_ok, 'Start the FastAPI backend, then retry diagnostics.'],
        ['Docker Desktop', diagnostics.docker_installed, 'Install Docker Desktop for Windows, then reopen this step.'],
        ['Docker daemon', diagnostics.docker_daemon_running, 'Open Docker Desktop and wait until it says Docker is running.'],
        ['Java 21', diagnostics.java_installed, 'Install Java 21 before starting IBeam.'],
        ['IBKR gateway', diagnostics.ibkr_gateway_reachable || diagnostics.gateway_running, 'Run the IBeam command and expose localhost:5000.'],
        ['IBKR authenticated', diagnostics.ibkr_authenticated, 'Open https://localhost:5000 and complete the IBKR login prompt.'],
        ['Demo mode', diagnostics.demo_mode_available, 'Demo mode should always be available as a fallback.'],
      ]
    : []
  const dockerNeedsAction = diagnostics && (!diagnostics.docker_installed || !diagnostics.docker_daemon_running)
  const ibkrPending = diagnostics && (diagnostics.ibkr_gateway_reachable || diagnostics.gateway_running) && !diagnostics.ibkr_authenticated

  return (
    <section className="setup-panel">
      <SectionHeader title="Environment validation" subtitle="We check the pieces needed for a live connection." />
      {error ? (
        <OfflineState onRetry={onRetry} />
      ) : !diagnostics ? (
        <GlowCard>Running diagnostics…</GlowCard>
      ) : (
        <div className="setup-diagnostics">
          <GlowCard className="setup-readiness">
            <RiskGauge value={riskValue} label="Setup readiness" />
            <p>Green means ready. Yellow means there is one clear action left. Red means start with the installation steps below.</p>
            <button className="tab" onClick={onRetry} disabled={loading}>
              <RefreshCw size={16} /> {loading ? 'Checking...' : 'Retry diagnostics'}
            </button>
          </GlowCard>
          <div className="setup-status-grid">
            {cards.map(([title, ok, guidance]) => (
              <StatusCard
                key={String(title)}
                title={String(title)}
                detail={ok ? 'Detected and ready.' : String(guidance)}
                badge={ok ? 'Ready' : title === 'IBKR authenticated' || title === 'Docker daemon' ? 'Pending' : 'Missing'}
                tone={ok ? 'good' : title === 'IBKR authenticated' || title === 'Docker daemon' ? 'warn' : 'bad'}
              />
            ))}
          </div>
          {dockerNeedsAction && <DockerGuidance />}
          {ibkrPending && <IbkrPendingGuidance />}
        </div>
      )}
    </section>
  )
}

function GuideStep({ copied, onCopy }: { copied: boolean; onCopy: () => void }) {
  const items = ['Install Java 21', 'Install Docker Desktop', 'Run IBeam container', 'Open localhost:5000', 'Authenticate IBKR']
  return (
    <section className="setup-panel">
      <SectionHeader title="Client Portal setup guide" subtitle="Follow these steps in order; each one unlocks the next." />
      <div className="setup-guide">
        <ol>
          {items.map((item, index) => (
            <li key={item}>
              <span>{index + 1}</span>
              <div>
                <b>{item}</b>
                <small>{index < 2 ? 'Required before launch' : index === 2 ? 'Use the command below' : 'Complete in your browser'}</small>
              </div>
            </li>
          ))}
        </ol>
        <GlowCard className="setup-command-card">
          <SectionHeader title="IBeam command" subtitle="Copy and run in your terminal." />
          <pre>{command}</pre>
          <button className="tab active" onClick={onCopy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy command'}
          </button>
        </GlowCard>
      </div>
    </section>
  )
}

function LiveTestStep({
  live,
  error,
  loading,
  method,
  onRetry,
}: {
  live: LiveConnectionResult | null
  error: boolean
  loading: boolean
  method?: string
  onRetry: () => void
}) {
  return (
    <section className="setup-panel">
      <SectionHeader title="Live connection test" subtitle={method ? `Testing ${method}.` : 'Testing your selected connection path.'} />
      {error ? (
        <OfflineState onRetry={onRetry} />
      ) : !live ? (
        <GlowCard>Checking `/health` and `/portfolio`…</GlowCard>
      ) : (
        <div className="setup-status-grid">
          <StatusCard title="Connection" detail={live.healthOk ? 'Backend responded successfully.' : 'Backend did not confirm healthy state.'} badge={live.healthOk ? 'Successful' : 'Needs attention'} tone={live.healthOk ? 'good' : 'bad'} />
          <StatusCard title="Account" detail={live.accountDetected ? 'Live IBKR account detected.' : live.source ? `Current source: ${live.source}` : 'No live account detected yet.'} badge={live.accountDetected ? 'Detected' : 'Not live'} tone={live.accountDetected ? 'good' : 'warn'} />
          <StatusCard title="Positions" detail={`${live.positionsCount} positions returned.`} badge={live.positionsCount > 0 ? 'Available' : 'Empty'} tone={live.positionsCount > 0 ? 'good' : 'warn'} />
          <StatusCard title="Market data" detail={live.marketDataAvailable ? 'Price fields are populated.' : 'No priced positions detected yet.'} badge={live.marketDataAvailable ? 'Available' : 'Pending'} tone={live.marketDataAvailable ? 'good' : 'warn'} />
          {!live.accountDetected && <IbkrPendingGuidance />}
          <button className="tab" onClick={onRetry} disabled={loading}>
            <RefreshCw size={16} /> {loading ? 'Checking...' : 'Retry live test'}
          </button>
        </div>
      )}
    </section>
  )
}

function PersonalizationStep({
  preferences,
  setPreferences,
}: {
  preferences: SetupPreferences
  setPreferences: (preferences: SetupPreferences) => void
}) {
  function update<K extends keyof SetupPreferences>(key: K, value: SetupPreferences[K]) {
    setPreferences({ ...preferences, [key]: value })
  }

  return (
    <section className="setup-panel">
      <SectionHeader title="Personalize your workspace" subtitle="These choices are stored locally and can be changed later." />
      <div className="setup-preferences">
        <Preference title="Dashboard layout">
          <Choice active={preferences.dashboardLayout === 'default'} onClick={() => update('dashboardLayout', 'default')} label="Default" />
          <Choice active={preferences.dashboardLayout === 'compact'} onClick={() => update('dashboardLayout', 'compact')} label="Compact" />
        </Preference>
        <Preference title="Card density">
          <Choice active={preferences.cardDensity === 'expanded'} onClick={() => update('cardDensity', 'expanded')} label="Expanded" />
          <Choice active={preferences.cardDensity === 'compact'} onClick={() => update('cardDensity', 'compact')} label="Compact" />
        </Preference>
        <Preference title="Amounts">
          <Choice active={!preferences.hideAmounts} onClick={() => update('hideAmounts', false)} label="Show" />
          <Choice active={preferences.hideAmounts} onClick={() => update('hideAmounts', true)} label="Hide" />
        </Preference>
        <Preference title="Scanner sensitivity">
          {(['conservative', 'balanced', 'aggressive'] as const).map((value) => (
            <Choice key={value} active={preferences.scannerSensitivity === value} onClick={() => update('scannerSensitivity', value)} label={value} />
          ))}
        </Preference>
        <Preference title="Macro alert mode">
          {(['essential', 'standard', 'all'] as const).map((value) => (
            <Choice key={value} active={preferences.macroAlertMode === value} onClick={() => update('macroAlertMode', value)} label={value} />
          ))}
        </Preference>
      </div>
    </section>
  )
}

function Preference({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlowCard className="setup-preference-card">
      <b>{title}</b>
      <div>{children}</div>
    </GlowCard>
  )
}

function Choice({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </button>
  )
}

function FinishStep() {
  return (
    <section className="setup-panel">
      <SectionHeader title="Setup complete" subtitle="PIA is ready for its first session." />
      <GlowCard className="setup-finish-card">
        <ShieldCheck />
        <h1>You’re ready to launch</h1>
        <p>Your connection path, preferences, and local wizard progress have been saved. You can revisit setup later if anything changes.</p>
      </GlowCard>
    </section>
  )
}

function DockerGuidance() {
  return (
    <GlowCard className="setup-offline">
      <Database />
      <div>
        <b>Docker needs attention.</b>
        <p>Install Docker Desktop, start it, and wait for the daemon to report running before launching IBeam.</p>
      </div>
    </GlowCard>
  )
}

function IbkrPendingGuidance() {
  return (
    <GlowCard className="setup-offline">
      <ShieldCheck />
      <div>
        <b>IBKR authentication is pending.</b>
        <p>Open https://localhost:5000, complete the IBKR login flow, then retry diagnostics.</p>
      </div>
    </GlowCard>
  )
}

function OfflineState({ onRetry }: { onRetry: () => void }) {
  return (
    <GlowCard className="setup-offline">
      <WifiOff />
      <div>
        <b>We couldn’t reach the backend right now.</b>
        <p>Check that the FastAPI server is running, then continue when the connection is available again.</p>
        <button className="tab active" onClick={onRetry}>
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    </GlowCard>
  )
}
