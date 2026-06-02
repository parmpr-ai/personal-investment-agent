import { NextRequest, NextResponse } from 'next/server'

const configuredBackend =
  process.env.PIA_BACKEND_API?.trim().replace(/\/$/, '') ||
  process.env.NEXT_PUBLIC_PIA_API?.trim().replace(/\/$/, '') ||
  'http://127.0.0.1:8000'

function sampleBody(body: any) {
  if (Array.isArray(body?.matches)) return body.matches.slice(0, 3)
  return body
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || ''
  const limit = request.nextUrl.searchParams.get('limit') || '8'
  const backendUrl = `${configuredBackend}/instruments/search?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit)}`

  try {
    const response = await fetch(backendUrl, { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    return NextResponse.json(
      {
        ...body,
        query: body?.query ?? q,
        request_url: backendUrl,
        response_status: response.status,
        body_sample: sampleBody(body),
      },
      { status: response.status },
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        query: q,
        matches: [],
        detail: `Instrument search proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
