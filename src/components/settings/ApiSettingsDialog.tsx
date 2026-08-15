'use client'

import { useState } from 'react'
import { create } from 'zustand'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settingsStore'
import { ApiKeyForm } from '@/components/settings/ApiKeyForm'
import { cn } from '@/lib/utils'

/** In a store so a failed AI call can open it. Not persisted. */
const useApiDialogState = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}))

/** Open the API key dialog from anywhere. */
export const openApiSettings = () => useApiDialogState.getState().setOpen(true)

export function ApiSettingsDialog({ className }: { className?: string }) {
  const saved = useSettingsStore()
  const open = useApiDialogState((s) => s.open)
  const setOpen = useApiDialogState((s) => s.setOpen)

  // Bumped on open so the form reseeds, discarding an abandoned draft.
  const [seed, setSeed] = useState(0)

  const onOpenChange = (next: boolean) => {
    if (next) setSeed((n) => n + 1)
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className={cn('gap-1.5', className)}>
          <KeyRound className="size-4" />
          <span className="hidden sm:inline">API key</span>
          {saved.apiKey && (
            <span className="size-1.5 rounded-full bg-green-500" aria-label="Using your own key" />
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Use your own API key</DialogTitle>
          <DialogDescription>Stored in this browser, never on our server.</DialogDescription>
        </DialogHeader>

        <ApiKeyForm seed={seed}>
          {({ fields, commit, clear }) => (
            <>
              {fields}
              <DialogFooter className="gap-2 sm:justify-between">
                <div className="flex gap-2">
                  {clear && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        clear()
                        toast.success('Key cleared. The AI features are off.')
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const key = commit()
                    toast.success(key ? 'Using your API key.' : 'Key cleared. The AI features are off.')
                    setOpen(false)
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </ApiKeyForm>
      </DialogContent>
    </Dialog>
  )
}
