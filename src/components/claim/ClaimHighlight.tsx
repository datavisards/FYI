'use client'

import { forwardRef, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { VERDICT_STYLES } from './constants'
import { extractCorrectionDiff } from './utils'
import type { Claim, Verdict } from '@/types'

interface ClaimHighlightProps {
  claim: Claim
  isHighlighted: boolean
  verdict?: Verdict | null
  /** Whether this claim has an annotation (correction or explanation) */
  hasAnnotation?: boolean
  /** The part of the claim being corrected (e.g. "40%") */
  correctionTarget?: string
  /** The replacement text (e.g. "28%") */
  correctionText?: string
}

function getVerdictStyle(verdict: Verdict | string): string {
  return VERDICT_STYLES[verdict as Verdict] ?? VERDICT_STYLES.unverifiable
}

export const ClaimHighlight = forwardRef<HTMLSpanElement, ClaimHighlightProps>(
  ({ claim, isHighlighted, verdict, hasAnnotation, correctionTarget, correctionText, ...props }, ref) => {
    const hasVerdict = verdict != null
    const baseStyles = 'cursor-pointer rounded px-0.5 transition-colors duration-200 border-b-2 border-dashed'

    const styleByState = hasVerdict
      ? getVerdictStyle(verdict)
      : isHighlighted
        ? 'bg-stone-200 dark:bg-stone-700/50 border-stone-400 dark:border-stone-500'
        : 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800/30 dark:hover:bg-stone-800/50 border-stone-400 dark:border-stone-600'

    // Split claim text around the correction for inline rendering.
    // Uses smart diff: if user entered full sentence → full corrected sentence,
    // extracts only the changed portion (e.g. "2024" → "2025").
    const parts = useMemo(() => {
      if (!correctionTarget || !correctionText) return null
      const { oldPart, newPart } = extractCorrectionDiff(correctionTarget, correctionText)
      const idx = claim.text.toLowerCase().indexOf(oldPart.toLowerCase())
      if (idx === -1) return null
      return {
        before: claim.text.slice(0, idx),
        target: claim.text.slice(idx, idx + oldPart.length),
        replacement: newPart,
        after: claim.text.slice(idx + oldPart.length),
      }
    }, [claim.text, correctionTarget, correctionText])

    return (
      <span
        ref={ref}
        className={cn(baseStyles, styleByState)}
        data-claim-id={claim.id}
        data-verdict={verdict ?? undefined}
        {...props}
      >
        {parts ? (
          <>
            {parts.before}
            <s className="opacity-50">{parts.target}</s>
            {' '}
            <span className="font-semibold text-amber-800 dark:text-amber-300" style={{ textDecoration: 'none' }}>
              {parts.replacement}
            </span>
            {parts.after}
          </>
        ) : (
          claim.text
        )}
        {hasAnnotation && !parts && (
          <span className="inline-flex items-center ml-0.5 align-super">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
          </span>
        )}
      </span>
    )
  }
)

ClaimHighlight.displayName = 'ClaimHighlight'
