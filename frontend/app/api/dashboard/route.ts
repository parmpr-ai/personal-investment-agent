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
    return NextResponse.json(
      {
        detail: `Dashboard proxy could not reach backend at ${backendUrl}.`,
        error: error?.message || String(error),
        request_url: backendUrl,
        response_status: 0,
        body_sample: null,
      },
      { status: 502 },
    )
  }
}
