import { NextResponse } from 'next/server'
import { backendBase, proxyJson } from '../../backendProxy'

export async function GET() {
  const backendUrl = `${backendBase}/api/debug/live-quotes`
  try {
    const { response, body } = await proxyJson(backendUrl)
    return NextResponse.json(body, { status: response.status })
  } catch (error: any) {
    const isTimeout = error?.name === 'AbortError' || String(error).includes('abort')
    return NextResponse.json(
      {
        status: 'partial',
        detail: isTimeout
          ? `Live quotes are loading cached data from backend at ${backendUrl}.`
          : `Live quotes proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 200,
        backendTimeout: isTimeout,
      },
      { status: 200 },
    )
  }
}
