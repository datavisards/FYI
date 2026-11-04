/**
 * The one gate for addresses FYI will open: the prefix route, the app and the
 * fetch route all go through it, so a link cannot be accepted by one and
 * reach the network through another.
 */

/** Lets /favicon.ico and friends stay 404s instead of looking like domains. */
const ASSET_SUFFIX = /\.(ico|png|jpe?g|gif|svg|webp|txt|xml|json|js|mjs|css|map|webmanifest|php|html?)$/i

/** Letters in the last label also rules out IP addresses. */
const PUBLIC_HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i
const PRIVATE_SUFFIX = /\.(localhost|local|internal|intranet|lan|home|corp)$/i

/**
 * Accepts `https://site.com/a`, `https:/site.com/a` (Next collapses the double
 * slash before we see the path) and `site.com/a`. Returns null for anything
 * that is not a public web page address.
 */
export function parseTargetUrl(input: string): string | null {
  const raw = input.trim()
  const hasScheme = /^https?:\/+/i.test(raw)
  if (!hasScheme && ASSET_SUFFIX.test(raw.split(/[/?#]/, 1)[0])) return null

  let url: URL
  try {
    url = new URL(hasScheme ? raw.replace(/^(https?):\/+/i, '$1://') : `https://${raw}`)
  } catch {
    return null
  }

  if (url.username || url.password || url.port) return null
  if (!PUBLIC_HOST.test(url.hostname) || PRIVATE_SUFFIX.test(url.hostname)) return null
  return url.href
}
