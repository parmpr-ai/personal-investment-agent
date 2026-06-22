import { NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../backendProxy'

export async function GET() {
  const backendUrl = `${backendBase}/dashboard`
  try {
    const { response, body } = await proxyJson(backendUrl)
    return NextResponse.json(
      {
        ...body,
        request_url: backendUrl,
        response_status: response.status,
        body_sample: sampleBody(body),
      },
      { status: response.status },
    )
  } catch (error: any) {
    const isTimeout = error?.name === 'AbortError' || String(error).includes('abort')
    return NextResponse.json(
      {
        detail: isTimeout
          ? `Backend at ${backendUrl} did not respond within 12 s — likely fetching live data.`
          : `Dashboard proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        backendReachable: false,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
