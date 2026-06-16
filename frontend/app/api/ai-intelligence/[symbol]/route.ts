import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../../backendProxy'

export async function GET(request: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params
  const clean = encodeURIComponent(String(symbol || '').split(' ')[0])
  const refresh = request.nextUrl.searchParams.get('refresh')
  const backendUrl = `${backendBase}/ai-intelligence/${clean}${refresh ? `?refresh=${encodeURIComponent(refresh)}` : ''}`
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
        detail: `AI Intelligence proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
