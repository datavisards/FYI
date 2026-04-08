/**
 * API base URL for fetch calls.
 * - In Next.js app: undefined = use relative /api/* (same origin).
 * - In extension: tries localhost first, then falls back to remote.
 */
const LOCAL_API_BASE = 'http://localhost:3000'
const REMOTE_API_BASE = 'https://fyi-hyaj.onrender.com'

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
      ...init?.headers,
    },
    mode: base ? 'cors' : 'same-origin',
  })
}
