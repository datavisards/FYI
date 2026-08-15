/**
 * CORS for the API routes, which the extension calls cross-origin.
 *
 * Per route, not middleware: Next runs middleware on the Node runtime only and
 * the Cloudflare adapter will not deploy it.
 */
import { AI_HEADER_LIST } from '@/lib/ai/headers'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  // Omitting an x-fyi-* header here fails the preflight, so the extension
  // cannot send that part of the user's key config at all.
  'Access-Control-Allow-Headers': `Content-Type, ${AI_HEADER_LIST}`,
  'Access-Control-Max-Age': '86400',
} as const

/**
 * Preflight handler. Re-export from a route to answer OPTIONS:
 *
 *   export { OPTIONS } from '@/lib/cors'
 *
 * Without it the preflight gets a 405 and the browser blocks the real request.
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
