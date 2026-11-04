import type { NextRequest } from 'next/server'

import { parseTargetUrl } from '@/lib/article/targetUrl'

export { OPTIONS } from '@/lib/cors'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 5
const TIMEOUT_MS = 10_000

const fail = (error: string, status: number) => Response.json({ error }, { status })

async function readCapped(res: Response): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array()
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > MAX_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

/**
 * Fetches a page for the app, which cannot read other sites from the browser.
 * The app extracts the article itself. /api/* sends permissive CORS headers, so
 * the origin check is what keeps other sites from using this as a proxy.
 * Private networks are out of reach: Workers cannot route to them, and
 * parseTargetUrl rejects such hosts on every redirect hop.
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  if (origin && new URL(origin).host !== req.headers.get('host')) {
    return fail('This endpoint is only for the FYI app.', 403)
  }

  let url = parseTargetUrl(req.nextUrl.searchParams.get('url') ?? '')
  if (!url) return fail('That is not a public web page address.', 400)

  try {
    const signal = AbortSignal.timeout(TIMEOUT_MS)
    let res: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; FYI-ArticleFetcher/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
      if (!location) break
      await res.body?.cancel()
      url = parseTargetUrl(new URL(location, url).href)
      if (!url) return fail('That page redirects somewhere FYI cannot open.', 422)
      res = null
    }
    if (!res) return fail('That page redirects too many times.', 422)

    if ([401, 402, 403, 407, 429, 451].includes(res.status)) {
      return fail('This site does not allow FYI to read the page.', 422)
    }
    if (!res.ok) return fail(`The site answered with an error (${res.status}).`, 422)

    const contentType = res.headers.get('content-type') ?? ''
    if (!/html/i.test(contentType)) return fail('That address is not a web page.', 422)

    const bytes = await readCapped(res)
    if (!bytes) return fail('That page is too large to load.', 422)

    return Response.json({ url, html: decode(bytes, contentType) })
  } catch (err) {
    return (err as Error).name === 'TimeoutError'
      ? fail('The site took too long to respond.', 504)
      : fail('FYI could not reach that site.', 502)
  }
}
