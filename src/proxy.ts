import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const res = NextResponse.next()
  const origin = request.headers.get('origin') ?? ''
  if (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://')) {
    res.headers.set('Access-Control-Allow-Origin', origin)
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    res.headers.set('Access-Control-Max-Age', '86400')
  }
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: res.headers })
  }
  return res
}

export const config = {
  matcher: '/api/:path*',
}
