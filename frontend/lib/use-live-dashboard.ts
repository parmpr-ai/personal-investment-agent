'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiUrl, wsUrl } from './runtime-config'

const POLL_INTERVAL_MS = 5_000
const LIVE_POLL_MS = 2_000
const FRAME_TIMEOUT_MS = 10_000
const STALE_RETRY_DELAY_MS = 750
const DASHBOARD_CACHE_TTL_MS = 8_000
const MAX_RECONNECT_DELAY_MS = 10_000

export type DashboardBackendStatus = 'loading' | 'ok' | 'unavailable'
export type DashboardTransport = 'connecting' | 'websocket' | 'polling'

function dashboardIsStale(data: any) {
  const responseAt = Date.parse(String(data?.responseTimestamp || ''))
  const quoteAt = Date.parse(String(data?.quoteTimestamp || data?.portfolio?.pricesLastRefresh || ''))
  return Number.isFinite(responseAt) && Number.isFinite(quoteAt) && responseAt - quoteAt > DASHBOARD_CACHE_TTL_MS
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function stabilizeValue(prev: any, next: any): any {
  if (Object.is(prev, next)) return prev
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) {
      return next.map((item, index) => stabilizeValue(prev[index], item))
    }
    let changed = false
    const merged = next.map((item, index) => {
      const value = stabilizeValue(prev[index], item)
      if (value !== prev[index]) changed = true
      return value
    })
    return changed ? merged : prev
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
    let changed = false
    const merged: Record<string, any> = {}
    for (const key of keys) {
      const value = stabilizeValue(prev[key], next[key])
      merged[key] = value
      if (value !== prev[key] || !Object.prototype.hasOwnProperty.call(prev, key)) changed = true
    }
    if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev
    return merged
  }
  return next
}

async function requestDashboard() {
  const response = await fetch(apiUrl('/dashboard'), { cache: 'no-store' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw data
  return data
}

export function useLiveDashboard() {
  const [dashboard, setDashboard] = useState<any>(null)
  const [backendStatus, setBackendStatus] = useState<DashboardBackendStatus>('loading')
  const [transport, setTransport] = useState<DashboardTransport>('connecting')
  const activeRef = useRef(false)
  const staleRetryRef = useRef<number | null>(null)

  const commitDashboard = useCallback((data: any) => {
    if (!activeRef.current || !data || typeof data !== 'object') return
    setDashboard((current) => stabilizeValue(current, data))
    setBackendStatus('ok')
  }, [])

  const refresh = useCallback(async () => {
    try {
      const data = await requestDashboard()
      commitDashboard(data)
      if (dashboardIsStale(data)) {
        if (staleRetryRef.current) window.clearTimeout(staleRetryRef.current)
        staleRetryRef.current = window.setTimeout(async () => {
          try {
            commitDashboard(await requestDashboard())
          } catch {
            if (activeRef.current) setBackendStatus('unavailable')
          }
        }, STALE_RETRY_DELAY_MS)
      }
      return data
    } catch {
      if (activeRef.current) setBackendStatus('unavailable')
      return null
    }
  }, [commitDashboard])

  useEffect(() => {
    activeRef.current = true
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let pollTimer: number | null = null
    let watchdogTimer: number | null = null
    let reconnectAttempt = 0
    let lastFrameAt = Date.now()

    const stopPolling = () => {
      if (pollTimer) window.clearInterval(pollTimer)
      pollTimer = null
    }

    const startPolling = (immediate = true) => {
      if (!activeRef.current) return
      const alreadyPolling = Boolean(pollTimer)
      setTransport('polling')
      if (immediate && !alreadyPolling) void refresh()
      if (!pollTimer) pollTimer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    }

    const scheduleReconnect = () => {
      if (!activeRef.current || reconnectTimer) return
      const delay = Math.min(1_000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const connect = () => {
      if (!activeRef.current || (socket && socket.readyState < WebSocket.CLOSING)) return
      setTransport('connecting')
      try {
        socket = new WebSocket(wsUrl('/ws'))
      } catch {
        startPolling()
        scheduleReconnect()
        return
      }
      socket.onopen = () => {
        lastFrameAt = Date.now()
      }
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type !== 'dashboard_update') return
          lastFrameAt = Date.now()
          reconnectAttempt = 0
          stopPolling()
          setTransport('websocket')
          commitDashboard(payload)
        } catch {}
      }
      socket.onerror = () => startPolling()
      socket.onclose = () => {
        socket = null
        startPolling()
        scheduleReconnect()
      }
    }

    void refresh()
    connect()
    watchdogTimer = window.setInterval(() => {
      if (Date.now() - lastFrameAt >= FRAME_TIMEOUT_MS) startPolling()
    }, 1_000)

    const onResume = () => {
      if (document.visibilityState !== 'visible') return
      void refresh()
      if (!socket || socket.readyState >= WebSocket.CLOSING) connect()
    }
    const onPageShow = (e: PageTransitionEvent) => {
      // iOS bfcache restore — visibilitychange may not fire
      if (e.persisted) onResume()
    }
    window.addEventListener('focus', onResume)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onResume)

    return () => {
      activeRef.current = false
      stopPolling()
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      if (watchdogTimer) window.clearInterval(watchdogTimer)
      if (staleRetryRef.current) window.clearTimeout(staleRetryRef.current)
      socket?.close()
      window.removeEventListener('focus', onResume)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onResume)
    }
  }, [commitDashboard, refresh])

  // Fast-poll when IBKR live and tab is visible — fills the gap between WebSocket frames.
  const isLiveSrc = dashboard?.portfolio?.source === 'IBKR_LIVE'
  useEffect(() => {
    if (!isLiveSrc) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, LIVE_POLL_MS)
    return () => window.clearInterval(id)
  }, [isLiveSrc, refresh])

  return { dashboard, refresh, backendStatus, transport }
}
