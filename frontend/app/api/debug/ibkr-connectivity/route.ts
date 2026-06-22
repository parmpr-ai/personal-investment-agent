import { NextResponse } from 'next/server'
import { backendBase, proxyJson } from '../../backendProxy'

export async function GET() {
  const backendUrl = `${backendBase}/api/debug/ibkr-connectivity`
  try {
    const { response, body } = await proxyJson(backendUrl)
    return NextResponse.json(body, { status: response.status })
  } catch (error: any) {
    return NextResponse.json(
      {
        configuredUrl: backendUrl,
        authStatusResult: {},
        responseTimeMs: null,
        exception: error?.message || String(error),
        sslVerification: null,
        timeoutSeconds: null,
      },
      { status: 200 },
    )
  }
}
