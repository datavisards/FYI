import { createJSONStorage } from 'zustand/middleware'

/**
 * localStorage wrapper that silently no-ops when storage is unavailable
 * (e.g. in the Chrome extension side-panel / service worker context).
 */
export const safeStorage = createJSONStorage(() => {
  try {
    // Quick probe — some contexts throw on access, not just on setItem
    const test = '__zustand_probe__'
    localStorage.setItem(test, '1')
    localStorage.removeItem(test)
    return localStorage
  } catch {
    // Return an in-memory no-op store so persist doesn't crash
    const mem = new Map<string, string>()
    return {
      getItem: (key: string) => mem.get(key) ?? null,
      setItem: (key: string, value: string) => { mem.set(key, value) },
      removeItem: (key: string) => { mem.delete(key) },
    }
  }
})
