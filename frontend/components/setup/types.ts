export type ConnectionMethod = 'client-portal' | 'local-gateway' | 'demo'

export type ScannerSensitivity = 'conservative' | 'balanced' | 'aggressive'
export type MacroAlertMode = 'essential' | 'standard' | 'all'

export type SetupPreferences = {
  dashboardLayout: 'default' | 'compact'
  cardDensity: 'compact' | 'expanded'
  hideAmounts: boolean
  scannerSensitivity: ScannerSensitivity
  macroAlertMode: MacroAlertMode
}

export type SetupDiagnostics = {
  java_installed: boolean
  docker_installed: boolean
  docker_daemon_running: boolean
  gateway_running: boolean
  ibkr_gateway_reachable: boolean
  ibkr_authenticated: boolean
  demo_mode_available: boolean
  backend_ok: boolean
  frontend_ok: boolean
}

export type LiveConnectionResult = {
  healthOk: boolean
  accountDetected: boolean
  positionsCount: number
  marketDataAvailable: boolean
  source?: string
}
