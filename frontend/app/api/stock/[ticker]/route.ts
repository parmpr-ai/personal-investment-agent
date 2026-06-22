import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../../backendProxy'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params
  const symbol = encodeURIComponent(String(ticker || '').split(' ')[0])
  const backendUrl = `${backendBase}/stock/${symbol}`
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
          ? `Stock data is still loading from backend at ${backendUrl}.`
          : `Stock Intelligence proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 200,
        body_sample: null,
        backendTimeout: isTimeout,
      },
      { status: 200 },
    )
  }
}
