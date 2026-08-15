import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'

import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { useSettingsStore } from '@/stores/settingsStore'
import '@/app/globals.css'

/**
 * Two unrelated base URLs meet on this page: the model provider endpoint,
 * inside ApiKeyForm, and the FYI backend that relays to it, the field below.
 * The backend URL lives in chrome.storage.sync, where apiClient reads it.
 */
const BACKEND_URL_KEY = 'apiBaseUrl'

function Options() {
  // ApiKeyForm seeds its draft on mount, and chrome.storage hydrates
  // asynchronously, so mounting it early would seed an empty draft and Save
  // would wipe a stored key.
  const [hydrated, setHydrated] = useState(() => useSettingsStore.persist.hasHydrated())
  const [backendUrl, setBackendUrl] = useState('')
  const [backendLoaded, setBackendLoaded] = useState(false)

  useEffect(() => useSettingsStore.persist.onFinishHydration(() => setHydrated(true)), [])

  useEffect(() => {
    chrome.storage.sync
      .get(BACKEND_URL_KEY)
      .then((bag) => setBackendUrl((bag[BACKEND_URL_KEY] as string) ?? ''))
      .catch(() => {})
      .finally(() => setBackendLoaded(true))
  }, [])

  const ready = hydrated && backendLoaded

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">FYI settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your key is stored in this browser and sent with each request. It never reaches our
          server, and the side panel picks up anything saved here.
        </p>
      </header>

      {!ready ? (
        <p className="text-muted-foreground mt-8 text-sm">Loading…</p>
      ) : (
        <ApiKeyForm>
          {({ fields, commit, clear }) => (
            <>
              <div className="mt-8">{fields}</div>

              <details className="border-border mt-8 border-t pt-5">
                <summary className="cursor-pointer text-sm font-medium">Advanced</summary>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="backendUrl">FYI backend URL</Label>
                  <Input
                    id="backendUrl"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="Auto: localhost:3000, then the hosted backend"
                    spellCheck={false}
                  />
                  <p className="text-muted-foreground text-xs">
                    Where the extension sends its requests, not where your model lives. Leave it
                    blank unless you are running FYI yourself.
                  </p>
                </div>
              </details>

              <div className="border-border mt-8 flex items-center justify-between gap-3 border-t pt-5">
                {clear ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clear()
                      toast.success('Key cleared. The AI features are off.')
                    }}
                  >
                    Clear key
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  size="sm"
                  onClick={async () => {
                    commit()
                    await chrome.storage.sync.set({ [BACKEND_URL_KEY]: backendUrl.trim() })
                    toast.success('Settings saved')
                  }}
                >
                  Save
                </Button>
              </div>
            </>
          )}
        </ApiKeyForm>
      )}
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Options />
      <Toaster />
    </ThemeProvider>
  </React.StrictMode>
)
