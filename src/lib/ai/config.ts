import { AsyncLocalStorage } from 'node:async_hooks'
import { AI_HEADERS } from '@/lib/ai/headers'

/**
 * Per-request AI credentials. Every request carries the caller's own key;
 * the deployment holds none.
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
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_SEARCH_MODEL = 'perplexity/sonar'

const storage = new AsyncLocalStorage<AiConfig>()

export function readAiConfig(request: Request): AiConfig | null {
  const apiKey = request.headers.get(AI_HEADERS.key)?.trim()
  if (!apiKey) return null

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

  // No server-side fallback: the deployment has no key, so a request without
  // one cannot be served rather than being billed to whoever runs this.
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
