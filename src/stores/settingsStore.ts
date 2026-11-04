import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { settingsStorage } from './extensionStorage'

/**
 * Bring-your-own-key settings.
 *
 * Separate from explorationStore, whose state the session exporter writes into
 * a downloadable JSON file. Do not move these fields there: the key would be
 * exported with it.
 *
 * The key lives in the user's own browser storage and is sent per request for
 * the API routes to forward. It is never persisted or logged server-side.
 */

export interface ApiSettings {
  /** Provider preset id from src/lib/ai/providers.ts. */
  providerId: string
  /** Resolved base URL. Empty means fall back to the server's own config. */
  baseUrl: string
  apiKey: string
  /** Optional. Empty means use each route's default model. */
  model: string
  /**
   * Model the web_search tool uses. Empty means this provider has no
   * search-capable model, and the tool is withheld instead of failing.
   */
  searchModel: string
}

interface SettingsState extends ApiSettings {
  setSettings: (next: Partial<ApiSettings>) => void
  clear: () => void
  /** True when the user has supplied a key, so requests should carry it. */
  hasKey: () => boolean
}

const EMPTY: ApiSettings = {
  providerId: 'openrouter',
  baseUrl: '',
  apiKey: '',
  model: '',
  searchModel: '',
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      setSettings: (next) => set(next),
      clear: () => set(EMPTY),
      hasKey: () => get().apiKey.trim().length > 0,
    }),
    {
      name: 'fyi-api-settings',
      // Asynchronous under the extension: wait on persist.hasHydrated()
      // before deciding anything from whether a key exists.
      storage: settingsStorage,
    }
  )
)

/**
 * When the website's shared key ends, or null if it offers none. Not persisted:
 * the server decides on each visit, so the key setup returns by itself once this
 * passes. Stays null in the extension, which never asks.
 */
export const useHostedAccessStore = create<{ expiresAt: string | null }>()(() => ({
  expiresAt: null,
}))

export async function loadHostedAccess(): Promise<void> {
  try {
    const res = await fetch('/api/ai/access')
    const { expiresAt } = await res.json()
    useHostedAccessStore.setState({ expiresAt: expiresAt ?? null })
  } catch {
    useHostedAccessStore.setState({ expiresAt: null })
  }
}

/**
 * Whether an AI call can be made at all: the user's own key, or the shared one.
 * Components gate their AI actions on this.
 *
 * A selector over apiKey, not the hasKey() action, so it re-renders when the
 * key is entered or cleared.
 */
export const useHasApiKey = () => {
  const ownKey = useSettingsStore((s) => s.apiKey.trim().length > 0)
  const hosted = useHostedAccessStore((s) => s.expiresAt !== null)
  return ownKey || hosted
}

/** Shared by every gated control, so they all say the same thing. */
export const NO_KEY_REASON = 'Add an API key to use the AI features'
