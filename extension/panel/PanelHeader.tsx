import { Download, History, KeyRound, MoreVertical, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClaimsListPanel } from '@/components/claim'
import { ActionHistoryPanel } from '@/components/action-history'
import { ApiSettingsDialog, openApiSettings } from '@/components/settings/ApiSettingsDialog'
import { FyiMark } from '@/components/brand/FyiMark'
import type { Claim } from '@/types'

const HISTORY_TRIGGER_ID = 'fyi-history-trigger'

export function PanelHeader({
  title,
  onBoundPage,
  claimsSheetOpen,
  onClaimsSheetOpenChange,
  onClaimClick,
  onExport,
  onReset,
}: {
  title: string
  onBoundPage: boolean
  claimsSheetOpen: boolean
  onClaimsSheetOpenChange: (open: boolean) => void
  onClaimClick: (claim: Claim) => void
  onExport: () => void
  onReset: () => void
}) {
  return (
    <header className="h-12 border-b flex items-center justify-between px-4 bg-background shrink-0">
      {/* min-w-0 so a long headline truncates instead of pushing the menu out */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/*
          <object>, not <img>: the mark's hover state is CSS inside the SVG, and
          browsers render an <img>-referenced SVG without interactivity.
        */}
        <FyiMark />

        {/* Filled dot: this article is the page in front of you. */}
        <div className="flex min-w-0 items-center gap-1.5" title={title}>
          <span
            className={`size-1.5 shrink-0 rounded-full ${
              onBoundPage ? 'bg-green-500' : 'border border-muted-foreground'
            }`}
            aria-hidden
          />
          <span className="text-muted-foreground truncate text-xs">{title}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Both sheets and the key dialog are opened from the menu, not by their own triggers. */}
        <Sheet open={claimsSheetOpen} onOpenChange={onClaimsSheetOpenChange}>
          <SheetContent side="left" className="w-[400px] sm:w-[450px] p-0">
            <SheetTitle className="sr-only">Claims List</SheetTitle>
            <ClaimsListPanel
              onClaimClick={(claim) => {
                onClaimClick(claim)
                onClaimsSheetOpenChange(false)
              }}
            />
          </SheetContent>
        </Sheet>

        <Sheet>
          <SheetTrigger asChild>
            <button id={HISTORY_TRIGGER_ID} type="button" className="hidden" aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[450px] p-0">
            <SheetTitle className="sr-only">Action History</SheetTitle>
            <ActionHistoryPanel />
          </SheetContent>
        </Sheet>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5" aria-label="Session menu">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[11rem]">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                openApiSettings()
              }}
            >
              <KeyRound className="h-3 w-3" />
              <span>API key</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                document.getElementById(HISTORY_TRIGGER_ID)?.click()
              }}
            >
              <History className="h-3 w-3" />
              <span>View history</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onExport()
              }}
            >
              <Download className="h-3 w-3" />
              <span>Export session</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault()
                onReset()
              }}
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset session</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ApiSettingsDialog className="hidden" />
      </div>
    </header>
  )
}
