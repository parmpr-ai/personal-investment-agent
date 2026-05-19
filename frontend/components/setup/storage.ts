import type { ConnectionMethod, SetupPreferences } from './types'

const STEP_KEY = 'pia.setup.step'
const METHOD_KEY = 'pia.setup.connectionMethod'
const PREFS_KEY = 'pia.setup.preferences'
const COMPLETE_KEY = 'pia.setup.complete'

export const defaultPreferences: SetupPreferences = {
  dashboardLayout: 'default',
  cardDensity: 'expanded',
  hideAmounts: false,
  scannerSensitivity: 'balanced',
  macroAlertMode: 'standard',
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

export const setupStorage = {
  getStep: () => read<number>(STEP_KEY, 1),
  setStep: (step: number) => write(STEP_KEY, step),
  getConnectionMethod: () => read<ConnectionMethod | null>(METHOD_KEY, null),
  setConnectionMethod: (method: ConnectionMethod) => write(METHOD_KEY, method),
  getPreferences: () => read<SetupPreferences>(PREFS_KEY, defaultPreferences),
  setPreferences: (preferences: SetupPreferences) => {
    write(PREFS_KEY, preferences)
    write('pia.hideAmounts', preferences.hideAmounts)
  },
  markComplete: () => write(COMPLETE_KEY, true),
}
