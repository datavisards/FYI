import { AsyncLocalStorage } from 'node:async_hooks'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { AI_HEADERS } from '@/lib/ai/headers'

/**
 * Per-request AI credentials. A request carries the caller's own key, or, until
 * FYI_HOSTED_KEY_EXPIRES, a request from the website itself falls back to the
 * shared key held as the FYI_HOSTED_API_KEY secret.
 *
 * Request-scoped rather than an argument: createCompletion is called from the
 * tool loop and registry, where the request is out of scope.
 *
 * The key is never persisted or logged.
 */

export interface AiConfig {
  /** Base URL WITHOUT the trailing /chat/completions. */
  baseUrl: string
  apiKey: string
  /** Optional model override. Empty means use the route's default. */
  model: string
  /** Empty means no search-capable model, and the tool is withheld. */
  searchModel: string
  /** Set when this is the shared key. Identifies the caller for rate limiting. */
  hostedClient?: string
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_SEARCH_MODEL = 'perplexity/sonar'

const storage = new AsyncLocalStorage<AiConfig>()

/** The shared key's end date, or null if it is missing, expired, or misconfigured. */
export function hostedKeyExpiry(): Date | null {
  if (!process.env.FYI_HOSTED_API_KEY?.trim()) return null
  const expires = new Date(process.env.FYI_HOSTED_KEY_EXPIRES ?? '')
  return expires.getTime() > Date.now() ? expires : null
}

/**
 * Only the website's own pages get the shared key: /api allows any origin, for
 * the extension, which keeps using its own key. Nothing else from the request is
 * read, so a caller cannot send this key to another endpoint or pick a costlier
 * model. The credit limit on the key is what bounds a client that fakes Origin.
 */
function readHostedConfig(request: Request): AiConfig | null {
  if (!hostedKeyExpiry()) return null

  const origin = request.headers.get('origin')
  if (!origin || !URL.canParse(origin)) return null
  if (new URL(origin).host !== request.headers.get('host')) return null

  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: process.env.FYI_HOSTED_API_KEY!.trim(),
    model: '',
    searchModel: DEFAULT_SEARCH_MODEL,
    hostedClient: request.headers.get('cf-connecting-ip') ?? 'unknown',
  }
}

/** Stops one visitor from spending the shared credit. Does nothing for a user's own key. */
export async function enforceHostedRateLimit(config: AiConfig): Promise<void> {
  if (!config.hostedClient) return

  let limiter: { limit(options: { key: string }): Promise<{ success: boolean }> } | undefined
  try {
    const { env } = await getCloudflareContext({ async: true })
    limiter = (env as unknown as { HOSTED_AI_LIMIT?: typeof limiter }).HOSTED_AI_LIMIT
  } catch {
    return // Not on Workers: `next dev` has no bindings.
  }
  if (!limiter) return

  const { success } = await limiter.limit({ key: config.hostedClient })
  if (!success) {
    throw new Error('Too many AI requests. Wait a minute, or add your own key under API key.')
  }
}

export function readAiConfig(request: Request): AiConfig | null {
  const apiKey = request.headers.get(AI_HEADERS.key)?.trim()
  if (!apiKey) return readHostedConfig(request)

  const baseUrl = request.headers.get(AI_HEADERS.baseUrl)?.trim() || DEFAULT_BASE_URL
  const model = request.headers.get(AI_HEADERS.model)?.trim() || ''
  const normalisedBase = baseUrl.replace(/\/$/, '')

  // An absent search model is ambiguous: the provider may have none, or the
  // caller may simply not have set one. Only assume a default on OpenRouter,
  // where it is known to exist; elsewhere leave search off rather than call a
  // model id the provider does not serve.
  const sent = request.headers.get(AI_HEADERS.searchModel)?.trim()
  const searchModel =
    sent || (normalisedBase === DEFAULT_BASE_URL ? DEFAULT_SEARCH_MODEL : '')

  return {
    baseUrl: normalisedBase,
    apiKey,
    model,
    searchModel,
  }
}

export function withAiConfig<T>(config: AiConfig | null, fn: () => T): T {
  if (!config) return fn()
  return storage.run(config, fn)
}

export function resolveAiConfig(): AiConfig {
  const scoped = storage.getStore()
  if (scoped) return scoped

  // Reached once the shared key has ended, and by callers it was never for, such
  // as the extension without a key. Refuse rather than bill whoever runs this.
  throw new Error('No API key. Add one under API key to use the AI features.')
}

/** '' means search is unavailable; it does not mean "use the default". */
export function resolveSearchModel(): string {
  try {
    return resolveAiConfig().searchModel
  } catch {
    return ''
  }
}
