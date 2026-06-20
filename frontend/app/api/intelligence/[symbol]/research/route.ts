import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson } from '../../../backendProxy'

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const clean = encodeURIComponent(String(symbol || '').split(' ')[0])
  const query = new URLSearchParams()
  const refresh = request.nextUrl.searchParams.get('refresh')
  const debug = request.nextUrl.searchParams.get('debug')
  if (refresh) query.set('refresh', refresh)
  if (debug) query.set('debug', debug)
  const queryString = query.toString()
  const backendUrl = `${backendBase}/api/intelligence/${clean}/research${queryString ? `?${queryString}` : ''}`
  try {
    const { response, body } = await proxyJson(backendUrl)
    return NextResponse.json(body, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      {
        detail: `Research proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
      },
      { status: 502 },
    )
  }
}
