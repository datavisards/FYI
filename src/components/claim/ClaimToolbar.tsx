'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useClaimStore } from '@/stores/claimStore'
import { ClaimDetectionButton } from './ClaimDetectionButton'
import { getOrderedClaims } from './utils'
import { FileText } from 'lucide-react'
import type { Claim } from '@/types'

/**
 * Article-level toolbar: claim detection, progress, and claims list access.
 * Sits above the ClaimInvestigationPanel to separate article-level actions
 * from claim-level investigation.
 */
export function ClaimToolbar({
  articleContent,
  existingClaims = [],
  onOpenClaimsList,
  className,
}: {
  articleContent: string
  existingClaims?: Claim[]
  onOpenClaimsList?: () => void
  className?: string
}) {
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)

  const allClaimsOrdered = useMemo(
    () => getOrderedClaims(existingClaims, detectedClaims, manualClaims, dismissedClaimIds),
    [existingClaims, detectedClaims, manualClaims, dismissedClaimIds]
  )

  const totalClaims = allClaimsOrdered.length
  const verdictedClaims = allClaimsOrdered.filter(c =>
    claimVerdicts.some(v => v.claimId === c.id)
  ).length
  const progress = totalClaims > 0 ? (verdictedClaims / totalClaims) * 100 : 0

  return (
    <div className={cn('flex items-center justify-between gap-2 px-3 py-1.5 border-b bg-background', className)}>
      {/* Left: detect button */}
      <ClaimDetectionButton
        articleContent={articleContent}
        existingClaims={existingClaims}
        size="sm"
        variant={totalClaims === 0 ? 'prominent' : 'inline'}
      />

      {/* Right: progress + claims list */}
      <div className="flex items-center gap-2 shrink-0">
        {totalClaims > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">{verdictedClaims}/{totalClaims}</span>
            <span>checked</span>
            <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
        {onOpenClaimsList && totalClaims > 0 && (
          <>
            <Separator orientation="vertical" className="h-4" />
            <Button
              onClick={onOpenClaimsList}
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1.5"
            >
              <FileText className="h-3 w-3" />
              All claims
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
