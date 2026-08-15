'use client'

import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useClaimStore } from '@/stores/claimStore'
import { DismissClaimDialog } from './DismissClaimDialog'
import type { Claim, Verdict } from '@/types'
import { Search, Bot, User as UserIcon } from 'lucide-react'

interface ClaimPopoverProps {
  claim: Claim
  children: React.ReactNode
  onInvestigate: () => void
  verdict?: Verdict
  correctionTarget?: string
  correctionText?: string
  explanationText?: string
}

export function ClaimPopover({
  claim,
  children,
  onInvestigate,
}: ClaimPopoverProps) {
  const [open, setOpen] = useState(false)
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false)
  const dismissClaim = useClaimStore((state) => state.dismissClaim)

  // Close popover when user starts a text selection (so TextSelectionToolbar can appear instead)
  useEffect(() => {
    if (!open) return
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (sel && !sel.isCollapsed) setOpen(false)
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [open])

  const handleInvestigate = () => {
    setOpen(false)
    onInvestigate()
  }

  const handleDismiss = () => {
    setOpen(false)
    setDismissDialogOpen(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start" side="top" sideOffset={8}>
          <div className="flex flex-col gap-1.5">
            {claim.source === 'ai' ? (
              <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal w-fit">
                <Bot className="h-2.5 w-2.5" />
                AI-detected
              </Badge>
            ) : claim.source === 'user' ? (
              <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal w-fit">
                <UserIcon className="h-2.5 w-2.5" />
                Manually added
              </Badge>
            ) : null}
            <div className="flex items-center gap-1.5">
              <Button onClick={handleInvestigate} size="sm" variant="secondary" className="h-7 text-xs">
                <Search className="h-3.5 w-3.5 mr-1" />
                Investigate
              </Button>
              <Button onClick={handleDismiss} size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:text-destructive">
                Remove claim
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      <DismissClaimDialog
        open={dismissDialogOpen}
        onOpenChange={setDismissDialogOpen}
        claimText={claim.text}
        onConfirm={() => {
          setDismissDialogOpen(false)
          dismissClaim(claim.id)
        }}
      />
    </>
  )
}
