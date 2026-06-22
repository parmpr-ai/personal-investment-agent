export const backendBase =
  process.env.PIA_BACKEND_API?.trim().replace(/\/$/, '') ||
  process.env.NEXT_PUBLIC_PIA_API?.trim().replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

export function sampleBody(body: any) {
  if (Array.isArray(body)) return body.slice(0, 3)
  if (Array.isArray(body?.matches)) return body.matches.slice(0, 3)
  if (Array.isArray(body?.positions)) return body.positions.slice(0, 3)
  if (body?.fundamentals) {
    return {
      ticker: body.ticker,
      fundamentals: {
        last: body.fundamentals.last,
        open: body.fundamentals.open,
        day_high: body.fundamentals.day_high,
        day_low: body.fundamentals.day_low,
        prev_close: body.fundamentals.prev_close,
        volume: body.fundamentals.volume,
        avg_volume: body.fundamentals.avg_volume,
        today_range: body.fundamentals.today_range,
        pe: body.fundamentals.pe,
        eps: body.fundamentals.eps,
        beta: body.fundamentals.beta,
        dividend_yield: body.fundamentals.dividend_yield,
      },
    }
  }
  return body
}

export async function proxyJson(url: string, init?: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, ...init })
    const body = await response.json().catch(() => ({}))
    return { response, body }
  } finally {
    clearTimeout(timer)
  }
}
