'use client'

import { memo, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useArticleStore } from '@/stores/articleStore'
import { useExplorationStore } from '@/stores/explorationStore'
import { useClaimStore } from '@/stores/claimStore'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { ClaimVerdictForm } from './ClaimVerdictForm'
import { DismissClaimDialog } from './DismissClaimDialog'
import { VERDICT_BADGE } from './constants'
import { getOrderedClaims, extractCorrectionDiff } from './utils'
import {
  Gavel,
  ChevronLeft,
  ChevronRight,
  Target,
  Bot,
  User as UserIcon,
  Clock,
} from 'lucide-react'
import type { Verdict, ToolType, Claim } from '@/types'

export const ClaimInvestigationPanel = memo(function ClaimInvestigationPanel({
  existingClaims = [],
  className,
}: {
  existingClaims?: Claim[]
  className?: string
}) {
  const [verdictFormOpen, setVerdictFormOpen] = useState(false)
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false)
  const formOpenedAtRef = useRef<number>(0)

  const selectedClaim = useArticleStore((s) => s.selectedClaim)
  const setSelectedClaim = useArticleStore((s) => s.setSelectedClaim)
  const setHighlightedClaimId = useArticleStore((s) => s.setHighlightedClaimId)
  const setActiveClaim = useExplorationStore((s) => s.setActiveClaim)
  const events = useExplorationStore((s) => s.events)
  const detectedClaims = useClaimStore((s) => s.detectedClaims)
  const manualClaims = useClaimStore((s) => s.manualClaims)
  const dismissedClaimIds = useClaimStore((s) => s.dismissedClaimIds)
  const dismissClaim = useClaimStore((s) => s.dismissClaim)
  const claimVerdicts = useClaimStore((s) => s.claimVerdicts)
  const submitVerdict = useClaimStore((s) => s.submitVerdict)
  const updateVerdictAnnotations = useClaimStore((s) => s.updateVerdictAnnotations)

  const existingVerdictData = selectedClaim
    ? claimVerdicts.find((v) => v.claimId === selectedClaim.id)
    : undefined

  const verdict = existingVerdictData?.verdict

  const usedTools = useMemo(() => {
    if (!selectedClaim) return []
    const tools = new Set<ToolType>()
    const toolPrefixes: Record<string, ToolType> = {
      'autocheck': 'auto-check',
      'chat': 'ask-ai',
      'table': 'inspect-table',
      'vis': 'create-vis',
    }
    events.forEach((e) => {
      if ('claimId' in e && e.claimId === selectedClaim.id) {
        for (const [prefix, tool] of Object.entries(toolPrefixes)) {
          if (e.type.startsWith(prefix)) {
            tools.add(tool)
            break
          }
        }
      }
    })
    return Array.from(tools)
  }, [selectedClaim, events])

  const allClaimsOrdered = useMemo(
    () => getOrderedClaims(existingClaims, detectedClaims, manualClaims, dismissedClaimIds),
    [existingClaims, detectedClaims, manualClaims, dismissedClaimIds]
  )

  // Auto-select first claim when claims are available but none is selected
  useEffect(() => {
    if (allClaimsOrdered.length > 0 && !selectedClaim) {
      const firstClaim = allClaimsOrdered[0]
      setSelectedClaim(firstClaim)
      setHighlightedClaimId(firstClaim.id)
      setActiveClaim({ id: firstClaim.id, text: firstClaim.text, category: firstClaim.category }, 0, allClaimsOrdered.length)
    }
  }, [allClaimsOrdered, selectedClaim, setSelectedClaim, setHighlightedClaimId, setActiveClaim])

  const currentClaimIndex = selectedClaim
    ? allClaimsOrdered.findIndex((c) => c.id === selectedClaim.id)
    : -1
  const hasPrev = currentClaimIndex > 0
  const hasNext = currentClaimIndex >= 0 && currentClaimIndex < allClaimsOrdered.length - 1
  const totalClaims = allClaimsOrdered.length

  const goToPrevClaim = useCallback(() => {
    if (!hasPrev) return
    const newIndex = currentClaimIndex - 1
    const claim = allClaimsOrdered[newIndex]
    setSelectedClaim(claim)
    setHighlightedClaimId(claim.id)
    setActiveClaim({ id: claim.id, text: claim.text, category: claim.category }, newIndex, allClaimsOrdered.length)
  }, [hasPrev, currentClaimIndex, allClaimsOrdered, setSelectedClaim, setHighlightedClaimId, setActiveClaim])

  const goToNextClaim = useCallback(() => {
    if (!hasNext) return
    const newIndex = currentClaimIndex + 1
    const claim = allClaimsOrdered[newIndex]
    setSelectedClaim(claim)
    setHighlightedClaimId(claim.id)
    setActiveClaim({ id: claim.id, text: claim.text, category: claim.category }, newIndex, allClaimsOrdered.length)
  }, [hasNext, currentClaimIndex, allClaimsOrdered, setSelectedClaim, setHighlightedClaimId, setActiveClaim])

  const handleVerdictSubmit = useCallback(
    (data: { verdict: Verdict; confidence: 1 | 2 | 3 | 4 | 5 | 6 | 7; mostHelpfulTool: ToolType; helpfulTools?: ToolType[]; severity?: number; reasoning?: string; reasoningType?: 'correction' | 'explanation'; correctionTarget?: string; correctionText?: string; explanationText?: string }) => {
      if (!selectedClaim) return
      const formDurationMs = Date.now() - formOpenedAtRef.current
      const annotations = {
        helpfulTools: data.helpfulTools,
        reasoningType: data.reasoningType,
        correctionTarget: data.correctionTarget,
        correctionText: data.correctionText,
        explanationText: data.explanationText,
      }
      submitVerdict(
        selectedClaim.id,
        data.verdict,
        data.confidence,
        data.mostHelpfulTool,
        data.reasoning ?? null,
        data.severity,
        formDurationMs,
        annotations
      )
      updateVerdictAnnotations(selectedClaim.id, annotations)
      setVerdictFormOpen(false)
    },
    [selectedClaim, submitVerdict, updateVerdictAnnotations]
  )

  const handleDismissSelected = useCallback(() => {
    if (!selectedClaim) return
    dismissClaim(selectedClaim.id)
    if (hasNext) {
      goToNextClaim()
    } else if (hasPrev) {
      goToPrevClaim()
    } else {
      setSelectedClaim(null)
      setHighlightedClaimId(null)
      setActiveClaim(null)
    }
  }, [selectedClaim, dismissClaim, hasNext, hasPrev, goToNextClaim, goToPrevClaim, setSelectedClaim, setHighlightedClaimId, setActiveClaim])

  // ── Empty state (no claim selected) ──────────────────────────────
  if (!selectedClaim) {
    return (
      <div className={cn('border-b bg-background', className)}>
        <div className="px-3 py-2 bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="rounded-full bg-primary/10 p-1.5 shrink-0">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">No claim selected</p>
              <p className="text-xs text-muted-foreground">
                {totalClaims === 0
                  ? 'Detect claims or highlight text to start'
                  : 'Click a highlighted claim to investigate'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Active claim state ───────────────────────────────────────────
  const badge = verdict ? VERDICT_BADGE[verdict] : null
  const BadgeIcon = badge?.icon
  const claimSource = selectedClaim.source
  return (
    <>
      <div className={cn('border-b bg-background', className)}>
        <div className="bg-muted/30 px-3 py-2 space-y-2">
          {/* ── Claim text (hero) ──────────────────────────── */}
          <div className="rounded-md border bg-background px-2.5 py-2 max-h-24 overflow-y-auto space-y-1">
            <p className="text-sm leading-snug">
              {(() => {
                if (!existingVerdictData?.correctionText || !existingVerdictData?.correctionTarget) {
                  return selectedClaim.text
                }
                const diff = extractCorrectionDiff(
                  existingVerdictData.correctionTarget,
                  existingVerdictData.correctionText
                )
                const idx = selectedClaim.text.indexOf(diff.oldPart)
                if (idx === -1) return selectedClaim.text
                const before = selectedClaim.text.slice(0, idx)
                const after = selectedClaim.text.slice(idx + diff.oldPart.length)
                return (
                  <>
                    {before}
                    <span className="line-through bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded px-0.5">{diff.oldPart}</span>
                    {' '}
                    <span className="bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 font-medium rounded px-0.5">{diff.newPart}</span>
                    {after}
                  </>
                )
              })()}
            </p>
            {existingVerdictData?.explanationText && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                <span className="font-medium not-italic">Note:</span>{' '}
                <span className="italic">{existingVerdictData.explanationText}</span>
              </p>
            )}
          </div>

          {/* ── Metadata + actions row ─────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: source + verdict badges + navigation */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {claimSource && (
                claimSource === 'ai' ? (
                  <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal">
                    <Bot className="h-2.5 w-2.5" />
                    AI-detected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-0.5 py-0 px-1.5 text-[10px] font-normal">
                    <UserIcon className="h-2.5 w-2.5" />
                    Manually added
                  </Badge>
                )
              )}
              {badge ? (
                <Badge
                  variant="outline"
                  className={cn(
                    'gap-0.5 py-0 px-1.5 text-[10px] font-normal',
                    badge.className
                  )}
                >
                  {BadgeIcon && <BadgeIcon className="h-2.5 w-2.5" />}
                  {badge.label}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-0.5 py-0 px-1.5 text-[10px] font-normal border-stone-400/30 bg-stone-400/10 text-stone-500 dark:text-stone-400"
                >
                  <Clock className="h-2.5 w-2.5" />
                  Pending
                </Badge>
              )}

              {/* Inline navigation */}
              {totalClaims > 1 && currentClaimIndex >= 0 && (
                <div className="flex items-center gap-0.5 ml-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={goToPrevClaim}
                    disabled={!hasPrev}
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {currentClaimIndex + 1}/{totalClaims}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={goToNextClaim}
                    disabled={!hasNext}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {/* Right: dismiss + verdict */}
            <div className="flex items-center gap-1.5">
              <Button
                onClick={() => setDismissDialogOpen(true)}
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-destructive"
              >
                Remove claim
              </Button>
              <Button
                onClick={() => {
                  formOpenedAtRef.current = Date.now()
                  if (selectedClaim) {
                    eventLogger.log({ type: 'verdict_form_opened', claimId: selectedClaim.id })
                  }
                  setVerdictFormOpen(true)
                }}
                size="sm"
                variant={badge ? 'outline' : 'default'}
                className="gap-1 h-6 px-2.5 text-[11px]"
              >
                <Gavel className="h-3 w-3" />
                {badge ? 'Update verdict' : 'Submit verdict'}
              </Button>
            </div>
          </div>

        </div>
      </div>

      {/* Verdict Form Dialog */}
      <ClaimVerdictForm
        claimText={selectedClaim.text}
        open={verdictFormOpen}
        onClose={() => setVerdictFormOpen(false)}
        onSubmit={handleVerdictSubmit}
        usedTools={usedTools}
        existingVerdict={existingVerdictData ? {
          verdict: existingVerdictData.verdict,
          confidence: existingVerdictData.confidence,
          mostHelpfulTool: existingVerdictData.mostHelpfulTool,
          helpfulTools: existingVerdictData.helpfulTools,
          severity: existingVerdictData.severity,
          reasoning: existingVerdictData.reasoningText ?? undefined,
          reasoningType: existingVerdictData.reasoningType,
          correctionTarget: existingVerdictData.correctionTarget,
          correctionText: existingVerdictData.correctionText,
          explanationText: existingVerdictData.explanationText,
        } : undefined}
      />

      {selectedClaim && (
        <DismissClaimDialog
          open={dismissDialogOpen}
          onOpenChange={setDismissDialogOpen}
          claimId={selectedClaim.id}
          claimText={selectedClaim.text}
          onConfirm={() => {
            setDismissDialogOpen(false)
            handleDismissSelected()
          }}
        />
      )}
    </>
  )
})
