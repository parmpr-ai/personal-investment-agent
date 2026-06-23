const trimTrailingSlash = (value?: string) => value?.trim().replace(/\/$/, '') || ''

const configuredApi = trimTrailingSlash(process.env.NEXT_PUBLIC_PIA_API)
const configuredWs = trimTrailingSlash(process.env.NEXT_PUBLIC_PIA_WS)
const backendPort = process.env.NEXT_PUBLIC_PIA_BACKEND_PORT?.trim() || '8007'

const browserHost = () => (typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1')
const browserHttpProtocol = () => (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'https:' : 'http:')
const browserWsProtocol = () => (typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:')

export const API_BASE_URL = configuredApi || `${browserHttpProtocol()}//${browserHost()}:${backendPort}`
export const WS_BASE_URL = configuredWs || `${browserWsProtocol()}//${browserHost()}:${backendPort}`

export const apiUrl = (path: string) => {
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export const wsUrl = (path = '/ws') => {
  if (/^wss?:\/\//i.test(path)) return path
  return `${WS_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export async function fetchApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { cache: 'no-store', ...init })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw body
  return body as T
}
