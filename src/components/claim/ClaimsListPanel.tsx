'use client'

import { useMemo, useState } from 'react'
import { useArticleStore } from '@/stores/articleStore'
import { useClaimStore } from '@/stores/claimStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { VERDICT_BADGE } from './constants'
import { DismissClaimDialog } from './DismissClaimDialog'
import { getOrderedClaims } from './utils'
import { Bot, User as UserIcon, X, CheckCircle2, AlertTriangle, HelpCircle, Clock } from 'lucide-react'
import type { Claim, Verdict } from '@/types'

interface ClaimsListPanelProps {
  onClaimClick: (claim: Claim) => void
  className?: string
}

export function ClaimsListPanel({ onClaimClick, className }: ClaimsListPanelProps) {
  const selectedClaim = useArticleStore((s) => s.selectedClaim)
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)
  const dismissClaim = useClaimStore((s) => s.dismissClaim)
  const article = useArticleStore((s) => s.getCurrentArticle())
  const [dismissTarget, setDismissTarget] = useState<Claim | null>(null)

  // Use shared utility with dismiss filtering
  const allClaims = useMemo(
    () => getOrderedClaims(article?.claims, detectedClaims, manualClaims, dismissedClaimIds),
    [article?.claims, detectedClaims, manualClaims, dismissedClaimIds]
  )

  const getVerdict = (claimId: string): Verdict | undefined => {
    return claimVerdicts.find((v) => v.claimId === claimId)?.verdict
  }

  if (allClaims.length === 0) {
    return (
      <div className={cn('p-4 text-sm text-muted-foreground', className)}>
        <p>No claims detected yet. Use the detection button in the article to find claims.</p>
      </div>
    )
  }

  const verifiedCount = allClaims.filter((c) => getVerdict(c.id) === 'verified').length
  const misleadingCount = allClaims.filter((c) => getVerdict(c.id) === 'misleading').length
  const unverifiableCount = allClaims.filter((c) => getVerdict(c.id) === 'unverifiable').length
  const pendingCount = allClaims.length - verifiedCount - misleadingCount - unverifiableCount
  const progress = allClaims.length > 0 ? ((allClaims.length - pendingCount) / allClaims.length) * 100 : 0

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="px-4 py-3 border-b shrink-0 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Claims ({allClaims.length})</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Click a claim to investigate and give a verdict
          </p>
        </div>

        {/* Progress summary */}
        <div className="space-y-2">
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-[11px]">
            {verifiedCount > 0 && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                {verifiedCount} verified
              </span>
            )}
            {misleadingCount > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {misleadingCount} misleading
              </span>
            )}
            {unverifiableCount > 0 && (
              <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                <HelpCircle className="h-3 w-3" />
                {unverifiableCount} unverifiable
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {pendingCount} pending
              </span>
            )}
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {allClaims.map((claim) => {
            const verdict = getVerdict(claim.id)
            const isSelected = selectedClaim?.id === claim.id
            const badge = verdict ? VERDICT_BADGE[verdict] : null
            const Icon = badge?.icon
            const isAi = claim.source === 'ai'

            return (
              <button
                key={claim.id}
                type="button"
                onClick={() => onClaimClick(claim)}
                className={cn(
                  'w-full text-left p-2 rounded-lg border transition-colors group',
                  'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1',
                  isSelected && 'bg-primary/10 border-primary/30 ring-2 ring-primary/20',
                  !isSelected && 'border-border bg-background'
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-1 flex-wrap">
                      {isAi ? (
                        <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal">
                          <Bot className="h-2.5 w-2.5" />
                          AI-detected
                        </Badge>
                      ) : claim.source === 'user' ? (
                        <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal">
                          <UserIcon className="h-2.5 w-2.5" />
                          Manually added
                        </Badge>
                      ) : null}
                      {badge ? (
                        <>
                          {Icon && <Icon className="h-3 w-3 text-foreground/60" />}
                          <Badge variant="outline" className={cn('py-0 px-1.5 text-[10px] font-normal', badge.className)}>
                            {badge.label}
                          </Badge>
                        </>
                      ) : (
                        <Badge variant="outline" className="py-0 px-1.5 text-[10px] font-normal border-stone-400/30 bg-stone-400/10 text-stone-500 dark:text-stone-400">
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                          Pending
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm leading-snug wrap-break-word">{claim.text}</p>
                  </div>
                  <div
                    role="button"
                    aria-label="Remove from claim list"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDismissTarget(claim)
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive shrink-0"
                    title="Remove from claim list"
                  >
                    <X className="h-3 w-3" />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>
      <DismissClaimDialog
        open={dismissTarget !== null}
        onOpenChange={(open) => { if (!open) setDismissTarget(null) }}
        claimText={dismissTarget?.text ?? ''}
        onConfirm={() => {
          if (dismissTarget) dismissClaim(dismissTarget.id)
          setDismissTarget(null)
        }}
      />
    </div>
  )
}
