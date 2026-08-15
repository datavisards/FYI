/**
 * API base URL for fetch calls.
 * - In Next.js app: undefined = use relative /api/* (same origin).
 * - In extension: tries localhost first, then falls back to remote.
 */
import { AI_HEADERS } from '@/lib/ai/headers'

const LOCAL_API_BASE = 'http://localhost:3000'
const REMOTE_API_BASE = 'https://fyi.datavisards-hkust.workers.dev'

export function isExtension(): boolean {
  return typeof chrome !== 'undefined' && !!chrome.runtime?.id
}

/** Cache the resolved base so we only probe once per session. */
let resolvedBase: string | null = null

async function getApiBase(): Promise<string> {
  if (!isExtension()) return ''

  // Check if user set an explicit override in options
  try {
    const { apiBaseUrl } = await chrome.storage.sync.get('apiBaseUrl')
    const stored = (apiBaseUrl as string)?.trim()
    if (stored) return stored
  } catch { /* ignore */ }

  // Return cached result if we already probed
  if (resolvedBase !== null) return resolvedBase

  // Probe localhost with a short timeout
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 1500)
    const resp = await fetch(`${LOCAL_API_BASE}/api/health`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (resp.ok) {
      resolvedBase = LOCAL_API_BASE
      return resolvedBase
    }
  } catch { /* localhost not available */ }

  resolvedBase = REMOTE_API_BASE
  return resolvedBase
}

/**
 * The user's own API credentials, if they set any, as request headers.
 *
 * Read lazily from the store rather than imported at module scope, so this
 * file stays usable from non-React contexts and from the extension.
 */
async function aiHeaders(): Promise<Record<string, string>> {
  try {
    const { useSettingsStore } = await import('@/stores/settingsStore')
    const { apiKey, baseUrl, model, searchModel } = useSettingsStore.getState()
    if (!apiKey.trim()) return {}

    const headers: Record<string, string> = { [AI_HEADERS.key]: apiKey.trim() }
    if (baseUrl.trim()) headers[AI_HEADERS.baseUrl] = baseUrl.trim()
    if (model.trim()) headers[AI_HEADERS.model] = model.trim()
    if (searchModel.trim()) headers[AI_HEADERS.searchModel] = searchModel.trim()
    return headers
  } catch {
    // No store available (e.g. a non-browser caller). Fall back to the
    // server's own key rather than failing the request.
    return {}
  }
}

/**
 * Fetch from API. In app uses relative path; in extension tries local then remote.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const base = await getApiBase()
  const url = base ? `${base.replace(/\/$/, '')}${path}` : path
  return fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await aiHeaders()),
      ...init?.headers,
    },
    mode: base ? 'cors' : 'same-origin',
  })
}
