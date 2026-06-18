import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../../backendProxy'

export async function GET(request: NextRequest) {
  const params = new URLSearchParams()
  const symbols = request.nextUrl.searchParams.get('symbols')
  const refresh = request.nextUrl.searchParams.get('refresh')
  const debug = request.nextUrl.searchParams.get('debug')
  const contract = request.nextUrl.searchParams.get('contract')
  if (symbols) params.set('symbols', symbols)
  if (refresh) params.set('refresh', refresh)
  if (debug) params.set('debug', debug)
  if (contract) params.set('contract', contract)
  const query = params.toString()
  const backendUrl = `${backendBase}/api/intelligence/context/test${query ? `?${query}` : ''}`
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
    return NextResponse.json(
      {
        detail: `AI Intelligence context proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
