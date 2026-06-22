import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../../../backendProxy'

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const clean = encodeURIComponent(String(symbol || '').split(' ')[0])
  const query = new URLSearchParams()
  const refresh = request.nextUrl.searchParams.get('refresh')
  const debug = request.nextUrl.searchParams.get('debug')
  const contract = request.nextUrl.searchParams.get('contract')
  if (refresh) query.set('refresh', refresh)
  if (debug) query.set('debug', debug)
  if (contract) query.set('contract', contract)
  const queryString = query.toString()
  const backendUrl = `${backendBase}/api/intelligence/${clean}/context${queryString ? `?${queryString}` : ''}`
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
          ? `AI context is loading cached data from backend at ${backendUrl}.`
          : `AI Intelligence context proxy could not reach backend at ${backendUrl}.`,
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
