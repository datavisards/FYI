'use client'

import { Button } from '@/components/ui/button'
import { useClaimStore } from '@/stores/claimStore'
import { apiFetch } from '@/lib/apiClient'
import { eventLogger } from '@/lib/tracking/eventLogger'
import { Loader2, Sparkles, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Claim } from '@/types'

interface ClaimDetectionButtonProps {
  articleContent: string
  existingClaims?: Claim[]
  onClaimsDetected?: (claims: Claim[]) => void
  size?: 'sm' | 'default'
  variant?: 'inline' | 'prominent'
  className?: string
}

export function ClaimDetectionButton({
  articleContent,
  existingClaims = [],
  onClaimsDetected,
  size = 'default',
  variant = 'prominent',
  className,
}: ClaimDetectionButtonProps) {
  const isClaimDetectionComplete = useClaimStore((state) => state.isClaimDetectionComplete)
  const isClaimDetectionLoading = useClaimStore((state) => state.isClaimDetectionLoading)
  const setClaimDetectionComplete = useClaimStore((state) => state.setClaimDetectionComplete)
  const setClaimDetectionLoading = useClaimStore((state) => state.setClaimDetectionLoading)
  const setDetectedClaimsStore = useClaimStore((state) => state.setDetectedClaims)

  const handleDetectClaims = async () => {
    if (!articleContent || isClaimDetectionLoading) return

    const isRerun = isClaimDetectionComplete
    if (isRerun) {
      setClaimDetectionComplete(false)
      setDetectedClaimsStore([])
    }

    setClaimDetectionLoading(true)

    const startedAt = Date.now()
    eventLogger.log({ type: 'claim_ai_detection_started', articleLength: articleContent.length })

    try {
      const response = await apiFetch('/api/ai/detect-claims', {
        method: 'POST',
        body: JSON.stringify({
          content: articleContent,
          existingClaims: [],
        }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}))
        throw new Error(
          errorBody?.error || `Failed to detect claims (HTTP ${response.status})`
        )
      }

      const data = await response.json()
      const claims = (data.claims || []) as Claim[]

      // Adjust offsets: filter out title claims and adjust offsets for body-only
      // articleContent format: "title\n\ncontent"
      const titleMatch = articleContent.match(/^([\s\S]+?)\n\n/)
      const titleLen = titleMatch ? titleMatch[0].length : 0
      const bodyClaims: Claim[] = claims
        .filter((c) => c.startOffset >= titleLen)
        .map((c) => ({
          ...c,
          startOffset: c.startOffset - titleLen,
          endOffset: c.endOffset - titleLen,
          source: 'ai' as const,
        }))

      setDetectedClaimsStore(bodyClaims)
      setClaimDetectionComplete(true)
      eventLogger.log({
        type: 'claim_ai_detection_completed',
        claimsFound: bodyClaims.length,
        claimIds: bodyClaims.map(c => c.id),
        durationMs: Date.now() - startedAt,
      })

      if (onClaimsDetected) {
        onClaimsDetected(bodyClaims)
      }
    } catch (error) {
      console.error('Claim detection error:', error)
      eventLogger.log({ type: 'claim_ai_detection_failed', error: (error as Error).message })
      setDetectedClaimsStore(existingClaims)
      setClaimDetectionComplete(true)
      if (onClaimsDetected) {
        onClaimsDetected(existingClaims)
      }
    } finally {
      setClaimDetectionLoading(false)
    }
  }

  const isRerun = isClaimDetectionComplete

  const buttonVariant = isRerun
    ? 'ghost'
    : variant === 'inline' ? 'outline' : 'default'

  return (
    <Button
      onClick={handleDetectClaims}
      disabled={isClaimDetectionLoading}
      size={size}
      variant={buttonVariant}
      className={cn(
        'gap-2 shrink-0',
        !isRerun && variant !== 'inline' && 'bg-blue-600 hover:bg-blue-700 text-white font-medium',
        isRerun && 'text-muted-foreground',
        className
      )}
    >
      {isClaimDetectionLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Detecting...
        </>
      ) : isRerun ? (
        <>
          <RotateCw className="h-3.5 w-3.5" />
          Re-detect claims with AI
        </>
      ) : (
        <>
          <Sparkles className="h-4 w-4" />
          Detect claims with AI
        </>
      )}
    </Button>
  )
}
