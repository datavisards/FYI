'use client'

import { useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DismissClaimDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimId: string
  claimText: string
  onConfirm: () => void
}

export function DismissClaimDialog({ open, onOpenChange, claimId, claimText, onConfirm }: DismissClaimDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this claim?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>This claim will be removed from your active investigation list.</p>
              <div className="rounded-md border bg-muted/40 p-2 text-sm text-foreground">
                &ldquo;{claimText.length > 150 ? claimText.slice(0, 150) + '...' : claimText}&rdquo;
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
