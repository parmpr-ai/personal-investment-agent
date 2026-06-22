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
        status: 'partial',
        detail: isTimeout
          ? `Dashboard is loading cached data from backend at ${backendUrl}.`
          : `Dashboard proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 200,
        backendReachable: false,
        body_sample: null,
        backendTimeout: isTimeout,
      },
      { status: 200 },
    )
  }
}
