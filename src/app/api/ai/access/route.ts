import { hostedKeyExpiry } from '@/lib/ai/config'

export const dynamic = 'force-dynamic'

/** Tells the website whether AI works without a key. Never includes the key. */
export function GET() {
  return Response.json({ expiresAt: hostedKeyExpiry()?.toISOString() ?? null })
}
