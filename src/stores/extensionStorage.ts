import { createJSONStorage } from 'zustand/middleware'
import { safeStorage } from './safeStorage'

/**
 * Persisted settings storage for the extension.
 *
 * The side panel, the options page and the background worker are separate
 * documents with separate localStorage, so chrome.storage is the only store
 * all three share. Local rather than sync: the value is an API key, and sync
 * would replicate it to Google's servers.
 */

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome.runtime?.id &&
    !!chrome.storage?.local
  )
}

/** Asynchronous, so callers must wait on persist.hasHydrated() before reading. */
const chromeStorage = createJSONStorage(() => ({
  getItem: async (name: string) => {
    const bag = await chrome.storage.local.get(name)
    return (bag[name] as string | undefined) ?? null
  },
  setItem: async (name: string, value: string) => {
    await chrome.storage.local.set({ [name]: value })
  },
  removeItem: async (name: string) => {
    await chrome.storage.local.remove(name)
  },
}))

/** chrome.storage in the extension, localStorage everywhere else. */
export const settingsStorage = hasChromeStorage() ? chromeStorage : safeStorage
