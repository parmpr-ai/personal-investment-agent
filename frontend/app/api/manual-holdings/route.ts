import { NextRequest, NextResponse } from 'next/server'
import { backendBase, proxyJson, sampleBody } from '../backendProxy'

export async function GET() {
  const backendUrl = `${backendBase}/manual-holdings`
  try {
    const { response, body } = await proxyJson(backendUrl)
    const payload = Array.isArray(body) ? { holdings: body } : body
    return NextResponse.json(
      {
        ...payload,
        request_url: backendUrl,
        response_status: response.status,
        body_sample: sampleBody(body),
      },
      { status: response.status },
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        detail: `Manual holdings proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}

export async function POST(request: NextRequest) {
  const backendUrl = `${backendBase}/manual-holdings`
  const payload = await request.text()
  try {
    const { response, body } = await proxyJson(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    })
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
        detail: `Manual holding save proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
