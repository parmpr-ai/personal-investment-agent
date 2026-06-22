import { NextResponse } from 'next/server'
import { backendBase, proxyJson } from '../../backendProxy'

export async function GET() {
  const backendUrl = `${backendBase}/api/debug/ui-refresh-status`
  try {
    const { response, body } = await proxyJson(backendUrl)
    return NextResponse.json(
      {
        ...body,
        frontendProxyResponseTimestamp: new Date().toISOString(),
        frontendProxyBackend: backendBase,
      },
      { status: response.status },
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        responseTimestamp: new Date().toISOString(),
        source: 'UNAVAILABLE',
        frontendProxyBackend: backendBase,
        exception: error?.message || String(error),
      },
      { status: 200 },
    )
  }
}
